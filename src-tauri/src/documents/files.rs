use super::model::{Code, MAX_PATH_BYTES, MAX_TEXT_BYTES};
use same_file::Handle;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::Arc,
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

pub(crate) fn options(write: bool, directory: bool) -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(write);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(
            libc::O_NOFOLLOW | libc::O_NONBLOCK | if directory { libc::O_DIRECTORY } else { 0 },
        );
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Open reparse points without following them and permit owned-handle deletion/rename.
        options
            .custom_flags(0x00200000 | 0x02000000)
            .share_mode(0x1 | 0x2 | 0x4);
        let _ = directory;
    }
    options
}

pub(crate) fn open_regular(path: &Path, write: bool) -> Result<File, Code> {
    let metadata = fs::symlink_metadata(path).map_err(io_code)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(Code::NotFile);
    }
    let file = options(write, false).open(path).map_err(io_code)?;
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
        io::ErrorKind::AlreadyExists => Code::DestinationExists,
        _ => Code::IoError,
    }
}

pub(crate) struct Directory {
    pub path: PathBuf,
    identity: Handle,
}
impl Directory {
    pub fn open(path: &Path) -> Result<Arc<Self>, Code> {
        let metadata = fs::symlink_metadata(path).map_err(io_code)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(Code::SourceChanged);
        }
        let file = options(false, true).open(path).map_err(io_code)?;
        if !file.metadata().map_err(io_code)?.is_dir() {
            return Err(Code::SourceChanged);
        }
        let directory = Arc::new(Self {
            path: path.to_owned(),
            identity: Handle::from_file(file).map_err(io_code)?,
        });
        directory.check()?;
        Ok(directory)
    }
    pub fn check(&self) -> Result<(), Code> {
        let file = options(false, true)
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

/// A file is recorded immediately after exclusive creation, before later fallible work.
pub(crate) struct OwnedFile {
    pub directory: Arc<Directory>,
    pub path: PathBuf,
    file: File,
    identity: Option<Handle>,
    stamp: Option<Stamp>,
    removed: bool,
}
impl OwnedFile {
    pub fn try_lock(&self) -> Result<(), std::fs::TryLockError> {
        self.file.try_lock()
    }
    pub fn reserve(directory: Arc<Directory>, name: &str) -> Result<Self, Code> {
        directory.check()?;
        let path = directory.path.join(name);
        let file = options(true, false)
            .create_new(true)
            .open(&path)
            .map_err(io_code)?;
        Ok(Self {
            directory,
            path,
            file,
            identity: None,
            stamp: None,
            removed: false,
        })
    }
    pub fn existing(directory: Arc<Directory>, path: PathBuf) -> Result<Self, Code> {
        Self::open(directory, path, false)
    }
    pub fn open(directory: Arc<Directory>, path: PathBuf, write: bool) -> Result<Self, Code> {
        let file = open_regular(&path, write)?;
        let mut owned = Self {
            directory,
            path,
            file,
            identity: None,
            stamp: None,
            removed: false,
        };
        owned.identify()?;
        Ok(owned)
    }
    fn identify(&mut self) -> Result<(), Code> {
        if self.identity.is_none() {
            self.identity =
                Some(Handle::from_file(self.file.try_clone().map_err(io_code)?).map_err(io_code)?);
        }
        Ok(())
    }
    pub fn check(&mut self) -> Result<(), Code> {
        self.identify()?;
        self.directory.check()?;
        let current =
            Handle::from_file(open_regular(&self.path, false).map_err(|_| Code::SourceChanged)?)
                .map_err(|_| Code::SourceChanged)?;
        if self.identity.as_ref() != Some(&current) {
            return Err(Code::SourceChanged);
        }
        Ok(())
    }
    pub fn write(&mut self, text: &str) -> Result<(), Code> {
        self.check()?;
        self.file.seek(SeekFrom::Start(0)).map_err(io_code)?;
        self.file.set_len(0).map_err(io_code)?;
        self.file.write_all(text.as_bytes()).map_err(io_code)?;
        self.file.sync_all().map_err(io_code)?;
        self.stamp = Some(Stamp::read(&self.file)?);
        self.check()
    }
    pub fn promote(&mut self, destination: &Path, overwrite: bool) -> Result<(), Code> {
        self.check()?;
        atomic_rename(&self.path, destination, overwrite).map_err(io_code)?;
        self.path = destination.to_owned();
        Ok(())
    }
    pub fn read(&mut self) -> Result<String, Code> {
        self.check()?;
        if self
            .stamp
            .as_ref()
            .is_some_and(|stamp| Stamp::read(&self.file).as_ref() != Ok(stamp))
        {
            return Err(Code::SourceChanged);
        }
        let text = read_bounded(&mut self.file)?;
        self.check()?;
        if self
            .stamp
            .as_ref()
            .is_some_and(|stamp| Stamp::read(&self.file).as_ref() != Ok(stamp))
        {
            return Err(Code::SourceChanged);
        }
        Ok(text)
    }
    pub fn cleanup(&mut self) -> Result<(), Code> {
        if self.removed {
            return Ok(());
        }
        self.directory.check().map_err(|_| Code::CleanupFailed)?;
        // A missing name can mean a rename. Only the held file can establish unlinking.
        if unlinked(&self.file).map_err(|_| Code::CleanupFailed)? {
            self.removed = true;
            return Ok(());
        }
        self.check().map_err(|_| Code::CleanupFailed)?;
        fs::remove_file(&self.path).map_err(|_| Code::CleanupFailed)?;
        self.removed = true;
        Ok(())
    }
}

#[cfg(unix)]
fn unlinked(file: &File) -> io::Result<bool> {
    use std::os::unix::fs::MetadataExt;
    Ok(file.metadata()?.nlink() == 0)
}

#[cfg(windows)]
fn unlinked(file: &File) -> io::Result<bool> {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::{
        Foundation::HANDLE,
        Storage::FileSystem::{FILE_STANDARD_INFO, FileStandardInfo, GetFileInformationByHandleEx},
    };
    let mut info = FILE_STANDARD_INFO::default();
    unsafe {
        GetFileInformationByHandleEx(
            HANDLE(file.as_raw_handle()),
            FileStandardInfo,
            (&mut info as *mut FILE_STANDARD_INFO).cast(),
            size_of::<FILE_STANDARD_INFO>() as u32,
        )
    }
    .map_err(|error| io::Error::from_raw_os_error((error.code().0 as u32 & 0xffff) as i32))?;
    // A final link queued for deletion disappears when these owned handles close.
    Ok(info.NumberOfLinks == 0 || (info.DeletePending && info.NumberOfLinks == 1))
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

#[cfg(unix)]
fn atomic_rename(source: &Path, destination: &Path, overwrite: bool) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    if overwrite {
        return fs::rename(source, destination);
    }
    let from = CString::new(source.as_os_str().as_bytes())?;
    let to = CString::new(destination.as_os_str().as_bytes())?;
    #[cfg(target_os = "macos")]
    let result = unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) };
    #[cfg(target_os = "linux")]
    let result = unsafe {
        libc::renameat2(
            libc::AT_FDCWD,
            from.as_ptr(),
            libc::AT_FDCWD,
            to.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(windows)]
fn atomic_rename(source: &Path, destination: &Path, overwrite: bool) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{
        Win32::Storage::FileSystem::{MOVE_FILE_FLAGS, MOVEFILE_REPLACE_EXISTING, MoveFileExW},
        core::PCWSTR,
    };
    let from: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    unsafe {
        MoveFileExW(
            PCWSTR(from.as_ptr()),
            PCWSTR(to.as_ptr()),
            if overwrite {
                MOVEFILE_REPLACE_EXISTING
            } else {
                MOVE_FILE_FLAGS(0)
            },
        )
    }
    .map_err(|error| io::Error::from_raw_os_error((error.code().0 as u32 & 0xffff) as i32))
}
