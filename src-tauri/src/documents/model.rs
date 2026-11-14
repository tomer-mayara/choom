use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

pub(crate) const MAX_TEXT_BYTES: usize = 16 * 1024 * 1024;
pub(crate) const MAX_PATH_BYTES: usize = 4096;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Storage,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Code {
    InvalidRequest,
    NotFound,
    NotFile,
    LimitExceeded,
    InvalidUtf8,
    SourceChanged,
    IoError,
    Unavailable,
}

impl Code {
    pub fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "The document request is invalid.",
            Self::NotFound => "The selected document file was not found.",
            Self::NotFile => "The selected document is not a regular file.",
            Self::LimitExceeded => "The document exceeds the supported size.",
            Self::InvalidUtf8 => "The document is not valid UTF-8 text.",
            Self::SourceChanged => "An owned document file or directory changed.",
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
                stage,
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
pub struct Text {
    pub text: String,
    pub sha256: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadRequest {
    pub path: String,
}
pub(crate) fn decode<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, Code> {
    serde_json::from_value(value).map_err(|_| Code::InvalidRequest)
}
