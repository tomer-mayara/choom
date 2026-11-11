use super::model::{Code, MAX_PATH_BYTES, MAX_TEXT_BYTES};
use same_file::Handle;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::SystemTime,
};

pub(crate) fn selected_path(text: &str) -> Result<PathBuf, Code> {
    let path = PathBuf::from(text);
    if text.is_empty() || text.len() > MAX_PATH_BYTES || text.contains('\0') || !path.is_absolute()
    {
        return Err(Code::InvalidRequest);
    }
    Ok(path)
}

pub(crate) fn options(directory: bool) -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(
            libc::O_NOFOLLOW | libc::O_NONBLOCK | if directory { libc::O_DIRECTORY } else { 0 },
        );
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Open reparse points without following them; retain shared file access.
        options
            .custom_flags(0x00200000 | 0x02000000)
            .share_mode(0x1 | 0x2 | 0x4);
        let _ = directory;
    }
    options
}

pub(crate) fn open_regular(path: &Path) -> Result<File, Code> {
    let metadata = fs::symlink_metadata(path).map_err(io_code)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(Code::NotFile);
    }
    let file = options(false).open(path).map_err(io_code)?;
    if !file.metadata().map_err(io_code)?.is_file()
        || fs::symlink_metadata(path)
            .map_err(io_code)?
            .file_type()
            .is_symlink()
    {
        return Err(Code::NotFile);
    }
    Ok(file)
}

pub(crate) fn io_code(error: io::Error) -> Code {
    match error.kind() {
        io::ErrorKind::NotFound => Code::NotFound,
        _ => Code::IoError,
    }
}

pub(crate) struct Directory {
    pub path: PathBuf,
    identity: Handle,
}
impl Directory {
    pub fn open(path: &Path) -> Result<Self, Code> {
        let metadata = fs::symlink_metadata(path).map_err(io_code)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(Code::SourceChanged);
        }
        let file = options(true).open(path).map_err(io_code)?;
        if !file.metadata().map_err(io_code)?.is_dir() {
            return Err(Code::SourceChanged);
        }
        let directory = Self {
            path: path.to_owned(),
            identity: Handle::from_file(file).map_err(io_code)?,
        };
        directory.check()?;
        Ok(directory)
    }
    pub fn check(&self) -> Result<(), Code> {
        let file = options(true)
            .open(&self.path)
            .map_err(|_| Code::SourceChanged)?;
        let metadata = fs::symlink_metadata(&self.path).map_err(|_| Code::SourceChanged)?;
        if !metadata.is_dir()
            || metadata.file_type().is_symlink()
            || Handle::from_file(file).map_err(|_| Code::SourceChanged)? != self.identity
        {
            return Err(Code::SourceChanged);
        }
        Ok(())
    }
}

#[derive(PartialEq)]
struct Stamp {
    length: u64,
    modified: Option<SystemTime>,
}
impl Stamp {
    fn read(file: &File) -> Result<Self, Code> {
        let metadata = file.metadata().map_err(io_code)?;
        Ok(Self {
            length: metadata.len(),
            modified: metadata.modified().ok(),
        })
    }
}

/// Hold the selected file and its directory identities for the complete read.
pub(crate) struct OwnedFile {
    directory: Directory,
    path: PathBuf,
    file: File,
    identity: Handle,
}
impl OwnedFile {
    pub fn existing(directory: Directory, path: PathBuf) -> Result<Self, Code> {
        let file = open_regular(&path)?;
        let identity = Handle::from_file(file.try_clone().map_err(io_code)?).map_err(io_code)?;
        Ok(Self {
            directory,
            path,
            file,
            identity,
        })
    }
    fn check(&self) -> Result<(), Code> {
        self.directory.check()?;
        let current = Handle::from_file(open_regular(&self.path).map_err(|_| Code::SourceChanged)?)
            .map_err(|_| Code::SourceChanged)?;
        if self.identity != current {
            return Err(Code::SourceChanged);
        }
        Ok(())
    }
    pub fn read(&mut self) -> Result<String, Code> {
        self.check()?;
        let text = read_bounded(&mut self.file)?;
        self.check()?;
        Ok(text)
    }
}

pub(crate) fn read_bounded(file: &mut File) -> Result<String, Code> {
    let before = Stamp::read(file)?;
    if before.length > MAX_TEXT_BYTES as u64 {
        return Err(Code::LimitExceeded);
    }
    file.seek(SeekFrom::Start(0)).map_err(io_code)?;
    let mut bytes = Vec::new();
    file.take(MAX_TEXT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(io_code)?;
    if bytes.len() > MAX_TEXT_BYTES {
        return Err(Code::LimitExceeded);
    }
    if Stamp::read(file)? != before || bytes.len() as u64 != before.length {
        return Err(Code::SourceChanged);
    }
    String::from_utf8(bytes).map_err(|_| Code::InvalidUtf8)
}
