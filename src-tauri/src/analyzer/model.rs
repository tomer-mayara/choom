use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Setup,
    Analysis,
    Cleanup,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Code {
    InvalidRequest,
    InvalidSession,
    InvalidJob,
    Busy,
    NodeNotFound,
    UnsupportedNode,
    AnalyzerNotFound,
    UnsupportedAnalyzer,
    UnsupportedConfigPath,
    SourceChanged,
    ExecutionFailed,
    TimedOut,
    OutputLimit,
    ReportMissing,
    ReportInvalid,
    CleanupFailed,
    Unavailable,
}

#[derive(Clone, Debug)]
pub(crate) struct Problem {
    pub stage: Stage,
    pub code: Code,
    pub message: &'static str,
}

impl Problem {
    pub fn new(stage: Stage, code: Code, message: &'static str) -> Self {
        Self {
            stage,
            code,
            message,
        }
    }
    pub fn invalid() -> Self {
        Self::new(
            Stage::Setup,
            Code::InvalidRequest,
            "The analyzer request does not match its contract.",
        )
    }
    pub fn unavailable() -> Self {
        Self::new(
            Stage::Setup,
            Code::Unavailable,
            "The analyzer operation is unavailable.",
        )
    }
    pub fn cleanup() -> Self {
        Self::new(
            Stage::Cleanup,
            Code::CleanupFailed,
            "Analyzer cleanup could not complete. Release the job before trying again.",
        )
    }
    pub fn failure(&self, start: Instant) -> Failure {
        Failure {
            status: "failure",
            stage: self.stage,
            code: self.code,
            message: self.message,
            duration_ms: elapsed(start),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    status: &'static str,
    stage: Stage,
    code: Code,
    message: &'static str,
    duration_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum Outcome<T> {
    Success(T),
    Failure(Failure),
}

impl<T> Outcome<T> {
    pub(crate) fn from_result(result: Result<T, Problem>, start: Instant) -> Self {
        match result {
            Ok(value) => Self::Success(value),
            Err(problem) => Self::Failure(problem.failure(start)),
        }
    }
    pub(crate) fn worker_failed() -> Self {
        Self::Failure(Problem::unavailable().failure(Instant::now()))
    }
}

#[derive(Debug, Serialize)]
pub struct Prepared {
    pub(crate) status: &'static str,
    pub(crate) value: JobId,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobId {
    pub(crate) job_id: String,
}
#[derive(Debug, Serialize)]
pub struct Stopped {
    pub(crate) status: &'static str,
    pub(crate) stopped: bool,
}
#[derive(Debug, Serialize)]
pub struct Released {
    pub(crate) status: &'static str,
    pub(crate) released: bool,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "status",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum ExecutionOutcome {
    Completed {
        report_json: String,
        version: &'static str,
        working_directory: &'static str,
        completed_at_ms: u64,
        duration_ms: u64,
    },
    Cancelled {
        duration_ms: u64,
    },
    Failure {
        stage: Stage,
        code: Code,
        message: &'static str,
        duration_ms: u64,
    },
}

impl ExecutionOutcome {
    pub(crate) fn failed(problem: Problem, start: Instant) -> Self {
        Self::Failure {
            stage: problem.stage,
            code: problem.code,
            message: problem.message,
            duration_ms: elapsed(start),
        }
    }
    pub(crate) fn worker_failed() -> Self {
        Self::failed(Problem::unavailable(), Instant::now())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub(crate) job_id: String,
    pub(crate) stage: Stage,
    pub(crate) elapsed_ms: u64,
}

#[derive(Clone)]
pub(crate) struct Limits {
    pub timeout: Duration,
    pub prepared_timeout: Duration,
    pub stream_bytes: usize,
    pub report_bytes: usize,
    pub cleanup_timeout: Duration,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(120),
            prepared_timeout: Duration::from_secs(120),
            stream_bytes: 1_048_576,
            report_bytes: 16_777_216,
            cleanup_timeout: Duration::from_secs(5),
        }
    }
}

pub(crate) fn elapsed(start: Instant) -> u64 {
    start.elapsed().as_millis().try_into().unwrap_or(u64::MAX)
}
