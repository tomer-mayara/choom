use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs::{self, File, Metadata, OpenOptions},
    io::{self, Read},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
    time::SystemTime,
};

const MAX_PATH_BYTES: usize = 4096;
const MAX_TEXT_BYTES: usize = 262_144;
const MAX_PATHS: usize = 128;
const MAX_SESSIONS: usize = 16;
const MAX_OUTSIDE_REFERENCES: usize = 4096;

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum RepositoryOutcome<T> {
    Success { value: T },
    Failure { code: FailureCode, message: String },
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FailureCode {
    InvalidRequest,
    InvalidSession,
    NotFound,
    NotDirectory,
    NotFile,
    OutsideRoot,
    LimitExceeded,
    InvalidUtf8,
    AccessDenied,
    IoError,
    SourceChanged,
}

struct RepositoryError {
    code: FailureCode,
    message: &'static str,
}

impl RepositoryError {
    fn new(code: FailureCode, message: &'static str) -> Self {
        Self { code, message }
    }
}

impl<T> From<Result<T, RepositoryError>> for RepositoryOutcome<T> {
    fn from(result: Result<T, RepositoryError>) -> Self {
        match result {
            Ok(value) => Self::Success { value },
            Err(error) => Self::Failure {
                code: error.code,
                message: error.message.to_owned(),
            },
        }
    }
}

impl<T> RepositoryOutcome<T> {
    pub(crate) fn worker_failed() -> Self {
        Err(RepositoryError::new(
            FailureCode::IoError,
            "The repository operation could not complete.",
        ))
        .into()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OpenRepositoryRequest {
    root_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadRepositoryTextRequest {
    repository_session: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResolveRepositoryPathsRequest {
    repository_session: String,
    base: String,
    paths: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CloseRepositoryRequest {
    repository_session: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySession {
    repository_session: String,
}

#[derive(Debug, Serialize)]
pub struct RepositoryText {
    path: String,
    text: String,
}

#[derive(Debug, Serialize)]
pub struct RepositoryPaths {
    paths: Vec<ResolvedRepositoryPath>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "location", rename_all = "lowercase")]
enum ResolvedRepositoryPath {
    Inside { path: String, kind: PathKind },
    Outside { reference: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum PathKind {
    File,
    Directory,
}

#[derive(Debug, Serialize)]
pub struct ClosedRepository {
    closed: bool,
}

#[derive(Default)]
struct Registry {
    next_session: u64,
    sessions: HashMap<String, Session>,
}

struct Session {
    root: PathBuf,
    outside_references: HashMap<PathBuf, String>,
}

/// Owns repository roots and the lifetime of their path references.
/// Operations serialize with close; filesystem work runs on Tauri's blocking pool.
#[derive(Clone, Default)]
pub struct RepositoryService {
    registry: Arc<Mutex<Registry>>,
}

impl RepositoryService {
    pub fn open(&self, request: Value) -> RepositoryOutcome<RepositorySession> {
        self.open_checked(request).into()
    }

    pub fn read_text(&self, request: Value) -> RepositoryOutcome<RepositoryText> {
        self.read_checked(request).into()
    }

    pub fn resolve_paths(&self, request: Value) -> RepositoryOutcome<RepositoryPaths> {
        self.resolve_checked(request).into()
    }

    pub fn close(&self, request: Value) -> RepositoryOutcome<ClosedRepository> {
        self.close_checked(request).into()
    }

    fn registry(&self) -> Result<MutexGuard<'_, Registry>, RepositoryError> {
        self.registry.lock().map_err(|_| {
            RepositoryError::new(FailureCode::IoError, "Repository state is unavailable.")
        })
    }

    fn open_checked(&self, request: Value) -> Result<RepositorySession, RepositoryError> {
        let request: OpenRepositoryRequest = decode(request)?;
        validate_path(&request.root_path)?;
        if !Path::new(&request.root_path).is_absolute() {
            return Err(invalid_request(
                "The repository root must be an absolute path.",
            ));
        }
        let root = canonicalize(Path::new(&request.root_path))?;
        require_directory(&root)?;
        let mut registry = self.registry()?;
        if registry.sessions.len() == MAX_SESSIONS {
            return Err(limit("Too many repository sessions are open."));
        }
        registry.next_session = registry
            .next_session
            .checked_add(1)
            .ok_or_else(|| limit("Repository session identifiers are exhausted."))?;
        let repository_session = format!("repository-{}", registry.next_session);
        registry.sessions.insert(
            repository_session.clone(),
            Session {
                root,
                outside_references: HashMap::new(),
            },
        );
        Ok(RepositorySession { repository_session })
    }

    fn read_checked(&self, request: Value) -> Result<RepositoryText, RepositoryError> {
        let request: ReadRepositoryTextRequest = decode(request)?;
        validate_session(&request.repository_session)?;
        validate_path(&request.path)?;
        if !is_relative_path(&request.path) {
            return Err(invalid_request(
                "Text paths must be repository-relative paths.",
            ));
        }
        let registry = self.registry()?;
        let session = registry
            .sessions
            .get(&request.repository_session)
            .ok_or_else(invalid_session)?;
        let requested = session.root.join(&request.path);
        let canonical = canonicalize(&requested)?;
        let path = relative_path(&session.root, &canonical)?;
        let metadata = fs::metadata(&canonical).map_err(io_error)?;
        if !metadata.is_file() {
            return Err(RepositoryError::new(
                FailureCode::NotFile,
                "The text path is not a file.",
            ));
        }
        if metadata.len() > MAX_TEXT_BYTES as u64 {
            return Err(limit("The repository text exceeds 262144 UTF-8 bytes."));
        }
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let file = options.open(&canonical).map_err(io_error)?;
        let text = read_consistent_text(file, &requested, &canonical, &metadata)?;
        Ok(RepositoryText { path, text })
    }

    fn resolve_checked(&self, request: Value) -> Result<RepositoryPaths, RepositoryError> {
        let request: ResolveRepositoryPathsRequest = decode(request)?;
        validate_session(&request.repository_session)?;
        validate_path(&request.base)?;
        if !is_canonical_relative(&request.base) {
            return Err(invalid_request(
                "The path base must be a canonical repository directory.",
            ));
        }
        if request.paths.is_empty() || request.paths.len() > MAX_PATHS {
            return Err(limit("Resolve between 1 and 128 paths per operation."));
        }
        for path in &request.paths {
            validate_path(path)?;
        }
        let mut registry = self.registry()?;
        let session = registry
            .sessions
            .get_mut(&request.repository_session)
            .ok_or_else(invalid_session)?;
        let base = canonicalize(&session.root.join(&request.base))?;
        relative_path(&session.root, &base)?;
        require_directory(&base)?;
        let mut paths = Vec::with_capacity(request.paths.len());
        for path in request.paths {
            let canonical = canonicalize(&base.join(path))?;
            let metadata = fs::metadata(&canonical).map_err(io_error)?;
            let kind = if metadata.is_file() {
                PathKind::File
            } else if metadata.is_dir() {
                PathKind::Directory
            } else {
                return Err(RepositoryError::new(
                    FailureCode::NotFile,
                    "A resolved path is neither a file nor a directory.",
                ));
            };
            if canonical.starts_with(&session.root) {
                paths.push(ResolvedRepositoryPath::Inside {
                    path: relative_path(&session.root, &canonical)?,
                    kind,
                });
            } else {
                let reference = session.outside_reference(canonical)?;
                paths.push(ResolvedRepositoryPath::Outside { reference });
            }
        }
        Ok(RepositoryPaths { paths })
    }

    fn close_checked(&self, request: Value) -> Result<ClosedRepository, RepositoryError> {
        let request: CloseRepositoryRequest = decode(request)?;
        validate_session(&request.repository_session)?;
        self.registry()?
            .sessions
            .remove(&request.repository_session);
        Ok(ClosedRepository { closed: true })
    }
}

impl Session {
    fn outside_reference(&mut self, path: PathBuf) -> Result<String, RepositoryError> {
        if let Some(reference) = self.outside_references.get(&path) {
            return Ok(reference.clone());
        }
        if self.outside_references.len() == MAX_OUTSIDE_REFERENCES {
            return Err(limit(
                "The repository has too many outside path references.",
            ));
        }
        let reference = format!("outside-{}", self.outside_references.len() + 1);
        self.outside_references.insert(path, reference.clone());
        Ok(reference)
    }
}

fn decode<T: DeserializeOwned>(request: Value) -> Result<T, RepositoryError> {
    serde_json::from_value(request)
        .map_err(|_| invalid_request("The repository request does not match its contract."))
}

fn validate_path(path: &str) -> Result<(), RepositoryError> {
    if path.is_empty() || path.bytes().any(|byte| byte < 32 || byte == 127) {
        return Err(invalid_request(
            "A path must be nonempty and contain no control characters.",
        ));
    }
    if path.len() > MAX_PATH_BYTES {
        return Err(limit("A path exceeds 4096 UTF-8 bytes."));
    }
    Ok(())
}

fn validate_session(session: &str) -> Result<(), RepositoryError> {
    let Some(number) = session.strip_prefix("repository-") else {
        return Err(invalid_request(
            "The repository session identifier is invalid.",
        ));
    };
    if number.len() > 20
        || number.starts_with('0')
        || !number.bytes().all(|byte| byte.is_ascii_digit())
        || number.parse::<u64>().is_err()
    {
        return Err(invalid_request(
            "The repository session identifier is invalid.",
        ));
    }
    Ok(())
}

fn is_relative_path(path: &str) -> bool {
    !path.starts_with('/')
        && !path.contains('\\')
        && !(path.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
            && path.as_bytes().get(1) == Some(&b':'))
}

fn is_canonical_relative(path: &str) -> bool {
    path == "."
        || (is_relative_path(path)
            && path
                .split('/')
                .all(|part| !part.is_empty() && part != "." && part != ".."))
}

fn canonicalize(path: &Path) -> Result<PathBuf, RepositoryError> {
    fs::canonicalize(path).map_err(io_error)
}

fn require_directory(path: &Path) -> Result<(), RepositoryError> {
    if fs::metadata(path).map_err(io_error)?.is_dir() {
        Ok(())
    } else {
        Err(RepositoryError::new(
            FailureCode::NotDirectory,
            "The path is not a directory.",
        ))
    }
}

fn relative_path(root: &Path, canonical: &Path) -> Result<String, RepositoryError> {
    let relative = canonical.strip_prefix(root).map_err(|_| {
        RepositoryError::new(
            FailureCode::OutsideRoot,
            "The path is outside the selected repository.",
        )
    })?;
    if relative.as_os_str().is_empty() {
        return Ok(".".to_owned());
    }
    let parts = relative
        .iter()
        .map(|part| {
            part.to_str().ok_or_else(|| {
                RepositoryError::new(
                    FailureCode::InvalidUtf8,
                    "A repository path is not valid UTF-8.",
                )
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let path = parts.join("/");
    validate_path(&path)?;
    if !is_canonical_relative(&path) {
        return Err(invalid_request(
            "A repository path cannot use the portable path format.",
        ));
    }
    Ok(path)
}

#[derive(PartialEq)]
struct FileSnapshot {
    len: u64,
    modified: Option<SystemTime>,
    #[cfg(unix)]
    identity: (u64, u64),
}

impl From<&Metadata> for FileSnapshot {
    fn from(metadata: &Metadata) -> Self {
        Self {
            len: metadata.len(),
            modified: metadata.modified().ok(),
            #[cfg(unix)]
            identity: {
                use std::os::unix::fs::MetadataExt;
                (metadata.dev(), metadata.ino())
            },
        }
    }
}

fn read_consistent_text(
    mut file: File,
    requested: &Path,
    canonical: &Path,
    initial: &Metadata,
) -> Result<String, RepositoryError> {
    let before = file.metadata().map_err(io_error)?;
    if !before.is_file() || FileSnapshot::from(initial) != FileSnapshot::from(&before) {
        return Err(source_changed());
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(MAX_TEXT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.len() > MAX_TEXT_BYTES {
        return Err(limit("The repository text exceeds 262144 UTF-8 bytes."));
    }
    let after = file.metadata().map_err(io_error)?;
    let final_path = fs::canonicalize(requested).map_err(|_| source_changed())?;
    let final_metadata = fs::metadata(&final_path).map_err(|_| source_changed())?;
    if final_path != canonical
        || FileSnapshot::from(&before) != FileSnapshot::from(&after)
        || FileSnapshot::from(&after) != FileSnapshot::from(&final_metadata)
        || bytes.len() as u64 != after.len()
    {
        return Err(source_changed());
    }
    String::from_utf8(bytes).map_err(|_| {
        RepositoryError::new(
            FailureCode::InvalidUtf8,
            "The repository text is not valid UTF-8.",
        )
    })
}

fn invalid_request(message: &'static str) -> RepositoryError {
    RepositoryError::new(FailureCode::InvalidRequest, message)
}

fn invalid_session() -> RepositoryError {
    RepositoryError::new(
        FailureCode::InvalidSession,
        "The repository session is not open.",
    )
}

fn limit(message: &'static str) -> RepositoryError {
    RepositoryError::new(FailureCode::LimitExceeded, message)
}

fn source_changed() -> RepositoryError {
    RepositoryError::new(
        FailureCode::SourceChanged,
        "The repository text changed during the read.",
    )
}

fn io_error(error: io::Error) -> RepositoryError {
    let (code, message) = match error.kind() {
        io::ErrorKind::NotFound => (FailureCode::NotFound, "The repository path does not exist."),
        io::ErrorKind::PermissionDenied => (
            FailureCode::AccessDenied,
            "Access to the repository path was denied.",
        ),
        _ => (
            FailureCode::IoError,
            "The repository filesystem operation failed.",
        ),
    };
    RepositoryError::new(code, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_an_open_file_changed_since_path_validation() {
        let path = std::env::temp_dir().join(format!("choom-changed-read-{}", std::process::id()));
        fs::write(&path, "before").unwrap();
        let canonical = fs::canonicalize(&path).unwrap();
        let initial = fs::metadata(&canonical).unwrap();
        let file = File::open(&canonical).unwrap();
        fs::write(&canonical, "different length").unwrap();

        let outcome = read_consistent_text(file, &path, &canonical, &initial);
        fs::remove_file(path).unwrap();

        assert!(matches!(
            outcome,
            Err(RepositoryError {
                code: FailureCode::SourceChanged,
                ..
            })
        ));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_replaced_path_even_when_the_open_file_stays_unchanged() {
        let path = std::env::temp_dir().join(format!("choom-replaced-read-{}", std::process::id()));
        fs::write(&path, "before").unwrap();
        let canonical = fs::canonicalize(&path).unwrap();
        let initial = fs::metadata(&canonical).unwrap();
        let file = File::open(&canonical).unwrap();
        fs::remove_file(&path).unwrap();
        fs::write(&path, "before").unwrap();

        let outcome = read_consistent_text(file, &path, &canonical, &initial);
        fs::remove_file(path).unwrap();

        assert!(matches!(
            outcome,
            Err(RepositoryError {
                code: FailureCode::SourceChanged,
                ..
            })
        ));
    }
}
