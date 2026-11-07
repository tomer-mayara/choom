mod files;
mod model;
mod process;
mod runtime;
mod service;
#[cfg(unix)]
mod unix_group;
#[cfg(windows)]
mod windows_job;

pub use model::{ExecutionOutcome, JobId, Outcome, Prepared, Progress, Released, Stopped};
pub use service::AnalyzerService;

#[cfg(test)]
mod tests;
