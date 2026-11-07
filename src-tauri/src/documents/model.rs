use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

pub(crate) const MAX_TEXT_BYTES: usize = 16 * 1024 * 1024;
pub(crate) const MAX_PATH_BYTES: usize = 4096;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Storage,
    Export,
    Cleanup,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Code {
    InvalidRequest,
    InvalidSnapshot,
    SnapshotLimit,
    NotFound,
    NotFile,
    LimitExceeded,
    InvalidUtf8,
    DestinationExists,
    SourceChanged,
    CleanupFailed,
    IoError,
    Unavailable,
}

impl Code {
    pub fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "The document request is invalid.",
            Self::InvalidSnapshot => "The document snapshot is not available.",
            Self::SnapshotLimit => "Release a document snapshot before creating another.",
            Self::NotFound => "The selected document file was not found.",
            Self::NotFile => "The selected document is not a regular file.",
            Self::LimitExceeded => "The document exceeds the supported size.",
            Self::InvalidUtf8 => "The document is not valid UTF-8 text.",
            Self::DestinationExists => {
                "The destination already exists. Approve replacement before exporting."
            }
            Self::SourceChanged => "An owned document file or directory changed.",
            Self::CleanupFailed => {
                "Document cleanup could not complete. Retry cleanup before writing again."
            }
            Self::IoError => "The document file operation could not complete.",
            Self::Unavailable => "The document file service is unavailable in this environment.",
        }
    }
}

#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum Outcome<T> {
    Success {
        status: &'static str,
        #[serde(flatten)]
        value: T,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
    Failure {
        status: &'static str,
        stage: Stage,
        code: Code,
        message: &'static str,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
}

impl<T> Outcome<T> {
    pub(crate) fn result(result: Result<T, Code>, stage: Stage, start: Instant) -> Self {
        let duration_ms = start.elapsed().as_millis().min(u64::MAX as u128) as u64;
        match result {
            Ok(value) => Self::Success {
                status: "success",
                value,
                duration_ms,
            },
            Err(code) => Self::Failure {
                status: "failure",
                stage: if code == Code::CleanupFailed {
                    Stage::Cleanup
                } else {
                    stage
                },
                code,
                message: code.message(),
                duration_ms,
            },
        }
    }
    pub(crate) fn worker_failed(stage: Stage) -> Self {
        Self::result(Err(Code::Unavailable), stage, Instant::now())
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    pub snapshot_id: String,
}
#[derive(Serialize, Debug)]
pub struct Text {
    pub text: String,
}
#[derive(Serialize, Debug)]
pub struct Released {
    pub released: bool,
}
#[derive(Serialize, Debug)]
pub struct Exported {
    pub exported: bool,
}
#[derive(Serialize, Debug)]
pub struct Cleaned {
    pub cleaned: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateRequest {
    pub text: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct SnapshotRequest {
    pub snapshot_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadRequest {
    pub path: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExportRequest {
    pub path: String,
    pub text: String,
    pub overwrite: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CleanupRequest {}

pub(crate) fn decode<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, Code> {
    serde_json::from_value(value).map_err(|_| Code::InvalidRequest)
}
