use super::{
    files::{Directory, OwnedFile, io_code},
    model::Code,
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};
use uuid::Uuid;

const LEASE: &str = ".lease";
const REGISTRATION: &str = ".registration.lock";

pub(crate) fn uuid_v4(text: &str) -> bool {
    Uuid::parse_str(text).is_ok_and(|id| {
        id.get_version_num() == 4
            && id.get_variant() == uuid::Variant::RFC4122
            && id.to_string() == text
    })
}

pub(crate) fn private_directory(path: &Path) -> Result<(), Code> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        fs::DirBuilder::new()
            .mode(0o700)
            .create(path)
            .map_err(io_code)
    }
    #[cfg(not(unix))]
    fs::create_dir(path).map_err(io_code)
}

/// The short registration lock covers both session creation and stale-session scans.
pub(crate) fn registration(root: &Path) -> Result<(Arc<Directory>, OwnedFile), Code> {
    fs::create_dir_all(root).map_err(io_code)?;
    let directory = Directory::open(root)?;
    let mut lock = match OwnedFile::reserve(directory.clone(), REGISTRATION) {
        Ok(lock) => lock,
        Err(Code::DestinationExists) => {
            OwnedFile::open(directory.clone(), root.join(REGISTRATION), true)?
        }
        Err(error) => return Err(error),
    };
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        match lock.try_lock() {
            Ok(()) => break,
            Err(fs::TryLockError::WouldBlock) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(5))
            }
            Err(_) => return Err(Code::CleanupFailed),
        }
    }
    lock.check()?;
    Ok((directory, lock))
}

pub(crate) struct Session {
    pub directory: Arc<Directory>,
    pub nonce: String,
    lease: Option<OwnedFile>,
    locked: bool,
    ready: bool,
    recover_files: bool,
    pending: Option<OwnedFile>,
    lease_removed: bool,
}
impl Session {
    pub fn create(root: &Directory, nonce: String) -> Result<Self, Code> {
        root.check()?;
        let path = root.path.join(format!("session-{nonce}"));
        private_directory(&path)?;
        let directory = Directory::open(&path)?;
        Ok(Self {
            directory,
            nonce,
            lease: None,
            locked: false,
            ready: false,
            recover_files: false,
            pending: None,
            lease_removed: false,
        })
    }

    pub fn initialize(&mut self) -> Result<(), Code> {
        if self.lease.is_none() {
            self.lease = Some(OwnedFile::reserve(self.directory.clone(), LEASE)?);
        }
        let lease = self.lease.as_mut().expect("recorded before initialization");
        if self.ready {
            return lease.check();
        }
        if !self.locked {
            lease.try_lock().map_err(|_| Code::CleanupFailed)?;
            self.locked = true;
        }
        lease.write(&format!("choom-documents-v1:{}\n", self.nonce))?;
        self.ready = true;
        Ok(())
    }

    fn inactive(root: &Directory, path: PathBuf, nonce: String) -> Result<Option<Self>, Code> {
        root.check()?;
        let metadata = fs::symlink_metadata(&path).map_err(io_code)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Ok(None);
        }
        let directory = Directory::open(&path)?;
        let lease_path = path.join(LEASE);
        let lease_metadata = match fs::symlink_metadata(&lease_path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(io_code(error)),
        };
        if !lease_metadata.is_file() || lease_metadata.file_type().is_symlink() {
            return Ok(None);
        }
        let mut lease = OwnedFile::open(directory.clone(), lease_path, true)?;
        match lease.try_lock() {
            Err(fs::TryLockError::WouldBlock) => return Ok(None),
            Err(_) => return Err(Code::CleanupFailed),
            Ok(()) => {}
        }
        if lease.read().ok().as_deref() != Some(&format!("choom-documents-v1:{nonce}\n")) {
            return Ok(None);
        }
        Ok(Some(Self {
            directory,
            nonce,
            lease: Some(lease),
            locked: true,
            ready: true,
            recover_files: true,
            pending: None,
            lease_removed: false,
        }))
    }

    fn owns_name(&self, name: &str) -> bool {
        if let Some(counter) = name
            .strip_prefix(&format!("document-{}-", self.nonce))
            .and_then(|name| name.strip_suffix(".choom.yaml"))
        {
            return counter
                .parse::<u64>()
                .is_ok_and(|value| value > 0 && value.to_string() == counter);
        }
        name.strip_prefix("candidate-")
            .and_then(|name| name.strip_suffix(".tmp"))
            .is_some_and(uuid_v4)
    }

    /// Unknown entries are left in place. No recursive removal is used.
    pub fn cleanup(&mut self) -> Result<(), Code> {
        self.directory.check().map_err(|_| Code::CleanupFailed)?;
        if !self.lease_removed
            && let Some(lease) = &mut self.lease
        {
            lease.check().map_err(|_| Code::CleanupFailed)?;
        }
        if let Some(file) = &mut self.pending {
            file.cleanup()?;
        }
        self.pending = None;
        let mut unknown = false;
        for entry in fs::read_dir(&self.directory.path).map_err(|_| Code::CleanupFailed)? {
            let entry = entry.map_err(|_| Code::CleanupFailed)?;
            if entry.file_name() == LEASE {
                continue;
            }
            let metadata = fs::symlink_metadata(entry.path()).map_err(|_| Code::CleanupFailed)?;
            // Current-session ownership is held by State; only stale sessions recover names.
            if !self.recover_files
                || !self.owns_name(&entry.file_name().to_string_lossy())
                || !metadata.is_file()
                || metadata.file_type().is_symlink()
            {
                unknown = true;
                continue;
            }
            self.pending = Some(
                OwnedFile::existing(self.directory.clone(), entry.path())
                    .map_err(|_| Code::CleanupFailed)?,
            );
            self.pending
                .as_mut()
                .expect("stored before cleanup")
                .cleanup()?;
            self.pending = None;
        }
        if !self.lease_removed {
            if let Some(lease) = &mut self.lease {
                lease.cleanup()?;
            }
            self.lease = None;
            self.lease_removed = true;
        }
        // Without the lease, a later startup will not adopt entries that were preserved.
        if unknown {
            return Ok(());
        }
        self.directory.check().map_err(|_| Code::CleanupFailed)?;
        fs::remove_dir(&self.directory.path).map_err(|_| Code::CleanupFailed)
    }
}

pub(crate) fn clean_stale(
    root: &Directory,
    current: &str,
    pending: &mut Option<Session>,
) -> Result<(), Code> {
    if let Some(session) = pending {
        session.cleanup()?;
    }
    *pending = None;
    root.check()?;
    for entry in fs::read_dir(&root.path).map_err(|_| Code::CleanupFailed)? {
        let entry = entry.map_err(|_| Code::CleanupFailed)?;
        let name = entry.file_name();
        let Some(nonce) = name.to_str().and_then(|name| name.strip_prefix("session-")) else {
            continue;
        };
        if nonce == current || !uuid_v4(nonce) {
            continue;
        }
        if let Some(session) = Session::inactive(root, entry.path(), nonce.to_owned())? {
            *pending = Some(session);
            pending.as_mut().expect("stored before cleanup").cleanup()?;
            *pending = None;
        }
    }
    Ok(())
}
