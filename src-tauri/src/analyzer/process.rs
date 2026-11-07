use super::{
    files::output_limit,
    model::{Code, Limits, Problem, Stage},
};
use process_wrap::std::{ChildWrapper, CommandWrap};
use std::{
    ffi::OsString,
    io::{self, Read},
    path::Path,
    process::{ExitStatus, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

type Reader = JoinHandle<io::Result<Vec<u8>>>;

/// Owns one OS process group or job, including its bounded output drains.
pub(crate) struct Process {
    child: Option<Box<dyn ChildWrapper>>,
    readers: Vec<Option<Reader>>,
    exceeded: Arc<AtomicBool>,
    stdout: Vec<u8>,
    status: Option<ExitStatus>,
    read_failed: bool,
    #[cfg(unix)]
    group: u32,
    #[cfg(windows)]
    job: Option<super::windows_job::WindowsJob>,
}

impl Process {
    pub fn spawn(program: &Path, args: &[OsString], root: &Path) -> Result<Self, Problem> {
        let mut command = CommandWrap::with_new(program, |command| {
            command
                .args(args)
                .current_dir(root)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .env_remove("NODE_OPTIONS")
                .env_remove("NODE_PATH");
        });
        #[cfg(unix)]
        command.wrap(process_wrap::std::ProcessGroup::leader());
        #[cfg(windows)]
        command.wrap(process_wrap::std::CreationFlags(
            windows::Win32::System::Threading::CREATE_SUSPENDED
                | windows::Win32::System::Threading::CREATE_NO_WINDOW,
        ));
        let child = command.spawn().map_err(|_| {
            Problem::new(
                Stage::Setup,
                Code::ExecutionFailed,
                "The configured Node process could not start.",
            )
        })?;
        Ok(Self {
            #[cfg(unix)]
            group: child.id(),
            #[cfg(windows)]
            job: None,
            child: Some(child),
            readers: Vec::new(),
            exceeded: Arc::new(AtomicBool::new(false)),
            stdout: Vec::new(),
            status: None,
            read_failed: false,
        })
    }

    /// The job owns this process before any fallible assignment, resume, or drain setup.
    pub fn initialize(&mut self, maximum: usize, capture_stdout: bool) -> Result<(), Problem> {
        #[cfg(windows)]
        {
            let child = self.child.as_ref().expect("new process has a child");
            self.job = Some(
                super::windows_job::WindowsJob::assign(child.as_ref())
                    .map_err(|_| Problem::unavailable())?,
            );
            self.job
                .as_ref()
                .expect("job is owned")
                .resume(child.id())
                .map_err(|_| Problem::unavailable())?;
        }
        let child = self.child.as_mut().expect("new process has a child");
        let stdout = child.stdout().take().ok_or_else(Problem::unavailable)?;
        let stderr = child.stderr().take().ok_or_else(Problem::unavailable)?;
        self.readers.push(Some(drain(
            stdout,
            maximum,
            capture_stdout,
            self.exceeded.clone(),
        )?));
        self.readers
            .push(Some(drain(stderr, maximum, false, self.exceeded.clone())?));
        Ok(())
    }

    pub fn poll(&mut self) -> Result<Option<ExitStatus>, Problem> {
        if let Some(status) = self.status {
            return Ok(Some(status));
        }
        if let Some(child) = &mut self.child {
            self.status = child.try_wait().map_err(|_| {
                Problem::new(
                    Stage::Analysis,
                    Code::ExecutionFailed,
                    "The analyzer process could not be observed.",
                )
            })?;
        }
        Ok(self.status)
    }

    pub fn check_output(&self) -> Result<(), Problem> {
        if self.exceeded.load(Ordering::Acquire) {
            return Err(output_limit());
        }
        if self.read_failed {
            return Err(Problem::new(
                Stage::Analysis,
                Code::ExecutionFailed,
                "Analyzer output could not be read.",
            ));
        }
        Ok(())
    }

    pub fn take_stdout(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.stdout)
    }

    pub fn cleanup(&mut self, limits: &Limits) -> Result<(), Problem> {
        let deadline = Instant::now() + limits.cleanup_timeout;
        if let Some(child) = &mut self.child {
            #[cfg(unix)]
            let killed = child.start_kill();
            #[cfg(windows)]
            let killed = self
                .job
                .as_ref()
                .map_or_else(|| child.start_kill(), |job| job.terminate());
            if let Err(error) = killed {
                #[cfg(unix)]
                let gone = error.raw_os_error() == Some(libc::ESRCH);
                #[cfg(not(unix))]
                let gone = {
                    let _ = error;
                    false
                };
                if !gone {
                    return Err(Problem::cleanup());
                }
            }
            while self.poll()?.is_none() {
                if Instant::now() >= deadline {
                    return Err(Problem::cleanup());
                }
                thread::sleep(Duration::from_millis(5));
            }
            loop {
                #[cfg(unix)]
                let stopped = super::unix_group::stopped(self.group, deadline);
                #[cfg(windows)]
                let stopped = self.job.as_ref().map_or(Ok(true), |job| job.stopped());
                if stopped.map_err(|_| Problem::cleanup())? {
                    break;
                }
                if Instant::now() >= deadline {
                    return Err(Problem::cleanup());
                }
                thread::sleep(Duration::from_millis(5));
            }
        }
        for (index, reader) in self.readers.iter_mut().enumerate() {
            if let Some(handle) = reader.as_ref() {
                while !handle.is_finished() {
                    if Instant::now() >= deadline {
                        return Err(Problem::cleanup());
                    }
                    thread::sleep(Duration::from_millis(5));
                }
            }
            if let Some(handle) = reader.take() {
                match handle.join() {
                    Ok(Ok(bytes)) => {
                        if index == 0 {
                            self.stdout = bytes;
                        }
                    }
                    Ok(Err(_)) | Err(_) => self.read_failed = true,
                }
            }
        }
        self.child.take();
        #[cfg(windows)]
        {
            self.job.take();
        }
        Ok(())
    }
}

impl Drop for Process {
    fn drop(&mut self) {
        if let Some(child) = &mut self.child {
            // Last-resort protection for unwinding. Normal paths report cleanup errors.
            #[cfg(windows)]
            if let Some(job) = &self.job {
                let _ = job.terminate();
            }
            let _ = child.start_kill();
            let _ = child.wait();
        }
    }
}

fn drain(
    mut stream: impl Read + Send + 'static,
    maximum: usize,
    capture: bool,
    exceeded: Arc<AtomicBool>,
) -> Result<Reader, Problem> {
    thread::Builder::new()
        .name("choom-analyzer-output".to_owned())
        .spawn(move || {
            let mut count = 0usize;
            let mut captured = Vec::new();
            let mut buffer = [0u8; 8192];
            loop {
                let bytes = match stream.read(&mut buffer) {
                    Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                    result => result?,
                };
                if bytes == 0 {
                    return Ok(captured);
                }
                count = count.saturating_add(bytes);
                if count > maximum {
                    exceeded.store(true, Ordering::Release);
                } else if capture {
                    captured.extend_from_slice(&buffer[..bytes]);
                }
            }
        })
        .map_err(|_| Problem::unavailable())
}
