use super::{
    files::{Report, output_limit},
    model::{
        Code, ExecutionOutcome, JobId, Limits, Outcome, Prepared, Problem, Progress, Released,
        Stage, Stopped, elapsed,
    },
    process::Process,
    runtime::{Request, Runtime, process_path, supported_node},
};
use crate::repository::{RepositoryLease, RepositoryService};
use serde_json::Value;
use std::{
    ffi::OsString,
    path::PathBuf,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Default)]
struct Registry {
    issued: u64,
    job: Option<Arc<Job>>,
    shutting_down: bool,
}

enum State {
    Prepared,
    Running,
    Finished { pending: Option<Box<Resources>> },
}

struct Job {
    id: String,
    request: Request,
    lease: RepositoryLease,
    created: Instant,
    cancelled: AtomicBool,
    state: Mutex<State>,
    done: Condvar,
}

#[derive(Default)]
struct Resources {
    process: Option<Process>,
    report: Option<Report>,
}

impl Resources {
    fn cleanup(&mut self, limits: &Limits) -> Result<(), Problem> {
        if let Some(process) = &mut self.process {
            process.cleanup(limits).map_err(|_| Problem::cleanup())?;
        }
        self.process = None;
        if let Some(report) = &mut self.report {
            report.cleanup()?;
        }
        self.report = None;
        Ok(())
    }
}

struct Inner {
    repository: RepositoryService,
    cache: PathBuf,
    limits: Limits,
    search_path: Option<OsString>,
    registry: Mutex<Registry>,
}

/// Owns one bounded dependency-cruiser job and its native-only repository lease.
#[derive(Clone)]
pub struct AnalyzerService {
    inner: Arc<Inner>,
}

enum Stop {
    Cancelled,
    Failed(Problem),
}
impl From<Problem> for Stop {
    fn from(problem: Problem) -> Self {
        Self::Failed(problem)
    }
}

impl AnalyzerService {
    pub fn new(repository: RepositoryService, cache: PathBuf) -> Self {
        Self::configured(
            repository,
            cache,
            Limits::default(),
            std::env::var_os("PATH"),
        )
    }

    pub(super) fn configured(
        repository: RepositoryService,
        cache: PathBuf,
        limits: Limits,
        search_path: Option<OsString>,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                repository,
                cache,
                limits,
                search_path,
                registry: Mutex::new(Registry::default()),
            }),
        }
    }

    pub fn prepare(&self, value: Value) -> Outcome<Prepared> {
        let start = Instant::now();
        Outcome::from_result(self.prepare_checked(value), start)
    }

    fn prepare_checked(&self, value: Value) -> Result<Prepared, Problem> {
        let request = Request::decode(value)?;
        let lease = self
            .inner
            .repository
            .lease(&request.repository_session)
            .ok_or_else(|| {
                Problem::new(
                    Stage::Setup,
                    Code::InvalidSession,
                    "The repository session is no longer open.",
                )
            })?;
        let mut registry = self
            .inner
            .registry
            .lock()
            .map_err(|_| Problem::unavailable())?;
        if registry.shutting_down {
            return Err(Problem::unavailable());
        }
        if let Some(job) = &registry.job {
            let state = job.state.lock().map_err(|_| Problem::unavailable())?;
            let replaceable = matches!(*state, State::Finished { pending: None })
                || (matches!(*state, State::Prepared)
                    && (job.created.elapsed() >= self.inner.limits.prepared_timeout
                        || !job.lease.is_open()));
            drop(state);
            if replaceable {
                registry.job = None;
            }
        }
        if registry.job.is_some() {
            return Err(Problem::new(
                Stage::Setup,
                Code::Busy,
                "An analyzer job is already reserved. Release it before starting another.",
            ));
        }
        registry.issued = registry
            .issued
            .checked_add(1)
            .ok_or_else(Problem::unavailable)?;
        let job_id = format!("analysis-{}", registry.issued);
        registry.job = Some(Arc::new(Job {
            id: job_id.clone(),
            request,
            lease,
            created: Instant::now(),
            cancelled: AtomicBool::new(false),
            state: Mutex::new(State::Prepared),
            done: Condvar::new(),
        }));
        Ok(Prepared {
            status: "success",
            value: JobId { job_id },
        })
    }

    pub fn run(
        &self,
        value: Value,
        mut progress: impl FnMut(Progress) -> Result<(), ()>,
    ) -> ExecutionOutcome {
        let start = Instant::now();
        let job = match self.start_job(value) {
            Ok(job) => job,
            Err(problem) => return ExecutionOutcome::failed(problem, start),
        };
        let mut resources = Resources::default();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.execute(&job, &mut resources, start, &mut progress)
        }))
        .unwrap_or_else(|_| Err(Stop::Failed(Problem::unavailable())));
        let notified = publish(&job, Stage::Cleanup, start, &mut progress);
        let cleanup = resources.cleanup(&self.inner.limits);
        let outcome = match &cleanup {
            Err(problem) => ExecutionOutcome::failed(problem.clone(), start),
            Ok(()) => match result {
                Err(Stop::Failed(problem)) => ExecutionOutcome::failed(problem, start),
                Err(Stop::Cancelled) => ExecutionOutcome::Cancelled {
                    duration_ms: elapsed(start),
                },
                Ok(report_json) => {
                    if let Err(problem) = notified {
                        ExecutionOutcome::failed(problem, start)
                    } else if job.cancelled.load(Ordering::Acquire) {
                        ExecutionOutcome::Cancelled {
                            duration_ms: elapsed(start),
                        }
                    } else if !job.lease.is_open() {
                        ExecutionOutcome::failed(closed_session(), start)
                    } else {
                        match completed_timestamp() {
                            Ok(completed_at_ms) => ExecutionOutcome::Completed {
                                report_json,
                                version: "18.7.2",
                                working_directory: ".",
                                completed_at_ms,
                                duration_ms: elapsed(start),
                            },
                            Err(problem) => ExecutionOutcome::failed(problem, start),
                        }
                    }
                }
            },
        };
        let mut state = job
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *state = State::Finished {
            pending: cleanup.err().map(|_| Box::new(resources)),
        };
        job.done.notify_all();
        outcome
    }

    fn start_job(&self, value: Value) -> Result<Arc<Job>, Problem> {
        let job = self.find_job(value)?.ok_or_else(invalid_job)?;
        let mut state = job.state.lock().map_err(|_| Problem::unavailable())?;
        if !matches!(*state, State::Prepared) {
            return Err(invalid_job());
        }
        if job.created.elapsed() >= self.inner.limits.prepared_timeout {
            return Err(invalid_job());
        }
        *state = State::Running;
        drop(state);
        Ok(job)
    }

    fn execute(
        &self,
        job: &Job,
        resources: &mut Resources,
        start: Instant,
        progress: &mut impl FnMut(Progress) -> Result<(), ()>,
    ) -> Result<String, Stop> {
        publish(job, Stage::Setup, start, progress)?;
        self.check(job, start, Stage::Setup)?;
        let runtime = Runtime::resolve(
            &job.request,
            &job.lease.root,
            self.inner.search_path.as_ref(),
        )?;
        self.check(job, start, Stage::Setup)?;
        resources.process = Some(Process::spawn(
            &runtime.node,
            &[OsString::from("--version")],
            &job.lease.root,
        )?);
        resources
            .process
            .as_mut()
            .expect("version process is owned")
            .initialize(self.inner.limits.stream_bytes, true)?;
        let version_status = self.wait_process(job, resources, start, Stage::Setup)?;
        let process = resources
            .process
            .as_mut()
            .expect("version process is owned");
        process.cleanup(&self.inner.limits)?;
        process.check_output()?;
        if !version_status.success() || !supported_node(&process.take_stdout()) {
            return Err(Problem::new(
                Stage::Setup,
                Code::UnsupportedNode,
                "Use stable Node 22, 24, or 26 and later supported by dependency-cruiser 18.7.2.",
            )
            .into());
        }
        resources.process = None;
        runtime.verify()?;
        self.check(job, start, Stage::Setup)?;
        resources.report = Some(Report::reserve(&self.inner.cache, &job.lease.root)?);
        resources
            .report
            .as_mut()
            .expect("report directory is owned")
            .initialize()?;
        let report = resources.report.as_ref().expect("report is owned");
        let mut args = vec![
            runtime.entry.as_os_str().to_owned(),
            OsString::from("--config"),
            runtime.config.as_os_str().to_owned(),
            OsString::from("--output-type"),
            OsString::from("json"),
            OsString::from("--output-to"),
            process_path(&report.path)?.into_os_string(),
            OsString::from("--no-cache"),
            OsString::from("--no-progress"),
            OsString::from("--"),
        ];
        args.extend(runtime.inputs.iter().map(OsString::from));
        publish(job, Stage::Analysis, start, progress)?;
        self.check(job, start, Stage::Analysis)?;
        resources.process = Some(Process::spawn(&runtime.node, &args, &job.lease.root)?);
        resources
            .process
            .as_mut()
            .expect("analyzer process is owned")
            .initialize(self.inner.limits.stream_bytes, false)?;
        let status = self.wait_process(job, resources, start, Stage::Analysis)?;
        let process = resources
            .process
            .as_mut()
            .expect("analyzer process is owned");
        process.cleanup(&self.inner.limits)?;
        process.check_output()?;
        resources.process = None;
        self.check(job, start, Stage::Analysis)?;
        if !status.success() {
            return Err(Problem::new(
                Stage::Analysis,
                Code::ExecutionFailed,
                "Dependency-cruiser did not complete successfully.",
            )
            .into());
        }
        runtime.verify().map_err(|mut problem| {
            problem.stage = Stage::Analysis;
            problem
        })?;
        Ok(resources
            .report
            .as_mut()
            .expect("report is owned")
            .read(self.inner.limits.report_bytes)?)
    }

    fn wait_process(
        &self,
        job: &Job,
        resources: &mut Resources,
        start: Instant,
        stage: Stage,
    ) -> Result<std::process::ExitStatus, Stop> {
        loop {
            self.check(job, start, stage)?;
            let process = resources
                .process
                .as_mut()
                .expect("running process is owned");
            process.check_output().map_err(|mut problem| {
                problem.stage = stage;
                problem
            })?;
            if resources
                .report
                .as_ref()
                .is_some_and(|report| report.exceeds(self.inner.limits.report_bytes))
            {
                return Err(output_limit().into());
            }
            let polled = process.poll(start + self.inner.limits.timeout);
            self.check(job, start, stage)?;
            if let Some(status) = polled.map_err(|mut problem| {
                problem.stage = stage;
                problem
            })? {
                return Ok(status);
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn check(&self, job: &Job, start: Instant, stage: Stage) -> Result<(), Stop> {
        if job.cancelled.load(Ordering::Acquire) {
            return Err(Stop::Cancelled);
        }
        if !job.lease.is_open() {
            return Err(closed_session().into());
        }
        if !job.lease.is_current() {
            return Err(Problem::new(
                stage,
                Code::SourceChanged,
                "The selected repository root changed. Open the repository again.",
            )
            .into());
        }
        if start.elapsed() >= self.inner.limits.timeout {
            return Err(Problem::new(
                stage,
                Code::TimedOut,
                "Analyzer execution exceeded its time limit.",
            )
            .into());
        }
        Ok(())
    }

    pub fn cancel(&self, value: Value) -> Outcome<Stopped> {
        let start = Instant::now();
        Outcome::from_result(
            self.find_job(value).and_then(|job| {
                if let Some(job) = job {
                    self.stop_job(&job)?;
                }
                Ok(Stopped {
                    status: "success",
                    stopped: true,
                })
            }),
            start,
        )
    }

    pub fn release(&self, value: Value) -> Outcome<Released> {
        let start = Instant::now();
        Outcome::from_result(
            self.find_job(value).and_then(|job| {
                if let Some(job) = job {
                    self.stop_job(&job)?;
                    let mut registry = self
                        .inner
                        .registry
                        .lock()
                        .map_err(|_| Problem::unavailable())?;
                    if registry
                        .job
                        .as_ref()
                        .is_some_and(|current| Arc::ptr_eq(current, &job))
                    {
                        registry.job = None;
                    }
                }
                Ok(Released {
                    status: "success",
                    released: true,
                })
            }),
            start,
        )
    }

    fn find_job(&self, value: Value) -> Result<Option<Arc<Job>>, Problem> {
        let job: JobId = serde_json::from_value(value).map_err(|_| Problem::invalid())?;
        let number = job
            .job_id
            .strip_prefix("analysis-")
            .ok_or_else(invalid_job)?;
        if number.is_empty()
            || number.len() > 20
            || number.starts_with('0')
            || !number.bytes().all(|byte| byte.is_ascii_digit())
        {
            return Err(invalid_job());
        }
        let number = number.parse::<u64>().map_err(|_| invalid_job())?;
        let registry = self
            .inner
            .registry
            .lock()
            .map_err(|_| Problem::unavailable())?;
        if number > registry.issued {
            return Err(invalid_job());
        }
        Ok(registry
            .job
            .as_ref()
            .filter(|current| current.id == job.job_id)
            .cloned())
    }

    fn stop_job(&self, job: &Job) -> Result<(), Problem> {
        job.cancelled.store(true, Ordering::Release);
        let mut state = job.state.lock().map_err(|_| Problem::unavailable())?;
        while matches!(*state, State::Running) {
            state = job.done.wait(state).map_err(|_| Problem::unavailable())?;
        }
        if let State::Finished { pending } = &mut *state {
            if let Some(resources) = pending {
                resources.cleanup(&self.inner.limits)?;
            }
            *pending = None;
        }
        Ok(())
    }

    pub fn shutdown(&self) -> Result<(), String> {
        let job = {
            let mut registry = self
                .inner
                .registry
                .lock()
                .map_err(|_| "Analyzer state is unavailable.".to_owned())?;
            registry.shutting_down = true;
            registry.job.clone()
        };
        if let Some(job) = job {
            self.stop_job(&job)
                .map_err(|problem| problem.message.to_owned())?;
        }
        self.inner
            .registry
            .lock()
            .map_err(|_| "Analyzer state is unavailable.".to_owned())?
            .job = None;
        Ok(())
    }
}

fn invalid_job() -> Problem {
    Problem::new(
        Stage::Setup,
        Code::InvalidJob,
        "The analyzer job is not available for this operation.",
    )
}
fn closed_session() -> Problem {
    Problem::new(
        Stage::Setup,
        Code::InvalidSession,
        "The repository session is no longer open.",
    )
}
fn completed_timestamp() -> Result<u64, Problem> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| Problem::unavailable())?
        .as_millis();
    if timestamp > 253_402_300_799_999 {
        return Err(Problem::unavailable());
    }
    Ok(timestamp as u64)
}
fn publish(
    job: &Job,
    stage: Stage,
    start: Instant,
    progress: &mut impl FnMut(Progress) -> Result<(), ()>,
) -> Result<(), Problem> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        progress(Progress {
            job_id: job.id.clone(),
            stage,
            elapsed_ms: elapsed(start),
        })
    }))
    .unwrap_or(Err(()))
    .map_err(|_| {
        Problem::new(
            stage,
            Code::ExecutionFailed,
            "Analyzer progress could not be delivered.",
        )
    })
}
