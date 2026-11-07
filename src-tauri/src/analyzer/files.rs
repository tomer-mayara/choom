use super::model::{Code, Problem, Stage};
use same_file::Handle;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::SystemTime,
};

pub(crate) fn open_regular(path: &Path) -> std::io::Result<File> {
    open_source(path, false)
}

fn open_source(path: &Path, directory_allowed: bool) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000 | 0x02000000); // OPEN_REPARSE_POINT | BACKUP_SEMANTICS
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !(metadata.is_file() || (directory_allowed && metadata.is_dir()))
        || fs::symlink_metadata(path)?.file_type().is_symlink()
    {
        return Err(std::io::Error::other("not a regular file"));
    }
    Ok(file)
}

pub(crate) struct Source {
    requested: PathBuf,
    pub path: PathBuf,
    identity: Handle,
    length: u64,
    modified: Option<SystemTime>,
    directory: bool,
}

impl Source {
    pub fn resolve(
        root: &Path,
        requested: PathBuf,
        directory_allowed: bool,
    ) -> Result<Self, Problem> {
        let path = fs::canonicalize(&requested).map_err(|_| source_changed())?;
        if !path.starts_with(root) {
            return Err(Problem::invalid());
        }
        let metadata = fs::metadata(&path).map_err(|_| source_changed())?;
        if !(metadata.is_file() || (directory_allowed && metadata.is_dir())) {
            return Err(Problem::invalid());
        }
        let identity =
            Handle::from_file(open_source(&path, directory_allowed).map_err(|_| source_changed())?)
                .map_err(|_| source_changed())?;
        Ok(Self {
            requested,
            path,
            identity,
            length: metadata.len(),
            modified: metadata.modified().ok(),
            directory: metadata.is_dir(),
        })
    }

    pub fn verify(&self) -> Result<(), Problem> {
        let path = fs::canonicalize(&self.requested).map_err(|_| source_changed())?;
        let metadata = fs::metadata(&path).map_err(|_| source_changed())?;
        if !(metadata.is_file() || (self.directory && metadata.is_dir())) {
            return Err(source_changed());
        }
        let identity =
            Handle::from_file(open_source(&path, self.directory).map_err(|_| source_changed())?)
                .map_err(|_| source_changed())?;
        if path != self.path
            || identity != self.identity
            || metadata.is_dir() != self.directory
            || metadata.len() != self.length
            || metadata.modified().ok() != self.modified
        {
            return Err(source_changed());
        }
        Ok(())
    }

    pub fn read_text(&self, maximum: usize) -> Result<String, Problem> {
        if self.directory || self.length > maximum as u64 {
            return Err(Problem::invalid());
        }
        let file = open_regular(&self.path).map_err(|_| source_changed())?;
        if Handle::from_file(file.try_clone().map_err(|_| source_changed())?)
            .map_err(|_| source_changed())?
            != self.identity
        {
            return Err(source_changed());
        }
        let mut bytes = Vec::new();
        file.take(maximum as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| source_changed())?;
        if bytes.len() > maximum {
            return Err(Problem::invalid());
        }
        self.verify()?;
        String::from_utf8(bytes).map_err(|_| Problem::invalid())
    }
}

fn source_changed() -> Problem {
    Problem::new(
        Stage::Setup,
        Code::SourceChanged,
        "A declared analyzer path is missing, changed, or unavailable. Discover the repository again.",
    )
}

/// The retained handle prevents a replaced report path from supplying data.
pub(crate) struct Report {
    pub path: PathBuf,
    directory: PathBuf,
    directory_identity: Option<Handle>,
    removed: bool,
    file: Option<File>,
    identity: Option<Handle>,
}

impl Report {
    pub fn reserve(cache: &Path, root: &Path) -> Result<Self, Problem> {
        fs::create_dir_all(cache).map_err(|_| Problem::unavailable())?;
        let cache = fs::canonicalize(cache).map_err(|_| Problem::unavailable())?;
        if cache.starts_with(root) {
            return Err(Problem::unavailable());
        }
        let directory = cache.join(format!("analysis-{}", uuid::Uuid::new_v4()));
        #[cfg(unix)]
        let mut builder = fs::DirBuilder::new();
        #[cfg(not(unix))]
        let builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder
            .create(&directory)
            .map_err(|_| Problem::unavailable())?;
        let path = directory.join("report.json");
        Ok(Self {
            path,
            directory,
            directory_identity: None,
            removed: false,
            file: None,
            identity: None,
        })
    }

    pub fn initialize(&mut self) -> Result<(), Problem> {
        self.directory_identity = Some(
            Handle::from_file(
                open_source(&self.directory, true).map_err(|_| Problem::unavailable())?,
            )
            .map_err(|_| Problem::unavailable())?,
        );
        let mut options = OpenOptions::new();
        options.create_new(true).read(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        self.file = Some(
            options
                .open(&self.path)
                .map_err(|_| Problem::unavailable())?,
        );
        let file = self.file.as_ref().expect("report handle is owned");
        self.identity = Some(
            Handle::from_file(file.try_clone().map_err(|_| Problem::unavailable())?)
                .map_err(|_| Problem::unavailable())?,
        );
        Ok(())
    }

    pub fn exceeds(&self, maximum: usize) -> bool {
        self.file.as_ref().is_some_and(|file| {
            file.metadata()
                .is_ok_and(|metadata| metadata.len() > maximum as u64)
        }) || fs::symlink_metadata(&self.path)
            .is_ok_and(|metadata| metadata.is_file() && metadata.len() > maximum as u64)
    }

    pub fn read(&mut self, maximum: usize) -> Result<String, Problem> {
        let missing = || {
            Problem::new(
                Stage::Analysis,
                Code::ReportMissing,
                "The analyzer did not produce a report.",
            )
        };
        let invalid = || {
            Problem::new(
                Stage::Analysis,
                Code::ReportInvalid,
                "The analyzer report is not an unchanged regular UTF-8 JSON file.",
            )
        };
        if !self.path.try_exists().map_err(|_| invalid())? {
            return Err(missing());
        }
        let path_file = open_regular(&self.path).map_err(|_| invalid())?;
        if Some(Handle::from_file(path_file).map_err(|_| invalid())?) != self.identity {
            return Err(invalid());
        }
        if self.exceeds(maximum) {
            return Err(output_limit());
        }
        let file = self.file.as_mut().ok_or_else(invalid)?;
        file.seek(SeekFrom::Start(0)).map_err(|_| invalid())?;
        let mut bytes = Vec::new();
        file.take(maximum as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| invalid())?;
        if bytes.len() > maximum {
            return Err(output_limit());
        }
        if bytes.is_empty() {
            return Err(missing());
        }
        let text = String::from_utf8(bytes).map_err(|_| invalid())?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|_| invalid())?;
        if !json.is_object() {
            return Err(invalid());
        }
        Ok(text)
    }

    pub fn cleanup(&mut self) -> Result<(), Problem> {
        if self.removed {
            return Ok(());
        }
        if let Some(identity) = &self.directory_identity {
            let current = Handle::from_file(
                open_source(&self.directory, true).map_err(|_| Problem::cleanup())?,
            )
            .map_err(|_| Problem::cleanup())?;
            if &current != identity {
                return Err(Problem::cleanup());
            }
        }
        fs::remove_dir_all(&self.directory).map_err(|_| Problem::cleanup())?;
        self.removed = true;
        Ok(())
    }
}

pub(crate) fn output_limit() -> Problem {
    Problem::new(
        Stage::Analysis,
        Code::OutputLimit,
        "Analyzer output exceeded the supported size.",
    )
}
