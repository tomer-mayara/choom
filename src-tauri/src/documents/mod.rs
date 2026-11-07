mod cache;
mod files;
mod model;
pub use model::{Cleaned, Code, Created, Exported, Outcome, Released, Stage, Text};

use cache::Session;
use files::{Directory, OwnedFile};
use model::{
    CleanupRequest, CreateRequest, ExportRequest, MAX_TEXT_BYTES, ReadRequest, SnapshotRequest,
    decode,
};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};

struct Snapshot {
    file: OwnedFile,
    retiring: bool,
}
struct State {
    root: PathBuf,
    nonce: String,
    session: Option<Session>,
    stale: Option<Session>,
    snapshots: BTreeMap<u64, Snapshot>,
    issued: u64,
    temporary: Option<OwnedFile>,
    cleanup_pending: bool,
    stopping: bool,
}

impl State {
    fn initialize(&mut self) -> Result<OwnedFile, Code> {
        let (root, registration) = cache::registration(&self.root)?;
        cache::clean_stale(&root, &self.nonce, &mut self.stale)?;
        if self.session.is_none() && !self.stopping {
            self.session = Some(Session::create(&root, self.nonce.clone())?);
        }
        if !self.stopping
            && let Some(session) = &mut self.session
        {
            session.initialize()?;
        }
        Ok(registration)
    }

    fn writable(&self) -> Result<(), Code> {
        if self.cleanup_pending {
            return Err(Code::CleanupFailed);
        }
        if self.stopping || self.session.is_none() {
            return Err(Code::Unavailable);
        }
        Ok(())
    }

    fn counter(&self, id: &str) -> Result<u64, Code> {
        let suffix = id
            .strip_prefix(&format!("document-{}-", self.nonce))
            .ok_or(Code::InvalidSnapshot)?;
        let counter = suffix.parse::<u64>().map_err(|_| Code::InvalidSnapshot)?;
        if counter == 0 || counter > self.issued || counter.to_string() != suffix {
            return Err(Code::InvalidSnapshot);
        }
        Ok(counter)
    }

    fn discard_temporary(&mut self, original: Code) -> Code {
        if let Some(file) = &mut self.temporary
            && file.cleanup().is_err()
        {
            self.cleanup_pending = true;
            return Code::CleanupFailed;
        }
        self.temporary = None;
        original
    }

    fn create(&mut self, request: CreateRequest) -> Result<Created, Code> {
        if request.text.len() > MAX_TEXT_BYTES {
            return Err(Code::LimitExceeded);
        }
        self.writable()?;
        if self.snapshots.len() >= 2 {
            return Err(Code::SnapshotLimit);
        }
        let counter = self.issued.checked_add(1).ok_or(Code::SnapshotLimit)?;
        let id = format!("document-{}-{counter}", self.nonce);
        let directory = self
            .session
            .as_ref()
            .ok_or(Code::Unavailable)?
            .directory
            .clone();
        self.temporary = Some(OwnedFile::reserve(
            directory.clone(),
            &format!("candidate-{}.tmp", uuid::Uuid::new_v4()),
        )?);
        let destination = directory.path.join(format!("{id}.choom.yaml"));
        let write = self.temporary.as_mut().expect("reserved temporary file");
        if let Err(error) = write
            .write(&request.text)
            .and_then(|()| write.promote(&destination, false))
        {
            return Err(self.discard_temporary(error));
        }
        self.snapshots.insert(
            counter,
            Snapshot {
                file: self.temporary.take().expect("promoted temporary file"),
                retiring: false,
            },
        );
        self.issued = counter;
        Ok(Created { snapshot_id: id })
    }

    fn read(&mut self, request: SnapshotRequest) -> Result<Text, Code> {
        let counter = self.counter(&request.snapshot_id)?;
        let snapshot = self
            .snapshots
            .get_mut(&counter)
            .filter(|snapshot| !snapshot.retiring)
            .ok_or(Code::InvalidSnapshot)?;
        Ok(Text {
            text: snapshot.file.read()?,
        })
    }

    fn release(&mut self, request: SnapshotRequest) -> Result<Released, Code> {
        let counter = self.counter(&request.snapshot_id)?;
        if let Some(snapshot) = self.snapshots.get_mut(&counter) {
            snapshot.retiring = true;
            if snapshot.file.cleanup().is_err() {
                self.cleanup_pending = true;
                return Err(Code::CleanupFailed);
            }
            self.snapshots.remove(&counter);
        }
        Ok(Released { released: true })
    }

    fn export(&mut self, request: ExportRequest) -> Result<Exported, Code> {
        let destination = files::selected_path(&request.path)?;
        if request.text.len() > MAX_TEXT_BYTES {
            return Err(Code::LimitExceeded);
        }
        self.writable()?;
        let directory = Directory::open(destination.parent().ok_or(Code::InvalidRequest)?)?;
        let mut previous = if request.overwrite {
            match OwnedFile::existing(directory.clone(), destination.clone()) {
                Ok(file) => Some(file),
                Err(Code::NotFound) => None,
                Err(error) => return Err(error),
            }
        } else {
            None
        };
        self.temporary = Some(OwnedFile::reserve(
            directory,
            &format!(".choom-export-{}.tmp", uuid::Uuid::new_v4()),
        )?);
        let temporary = self
            .temporary
            .as_mut()
            .expect("reserved export temporary file");
        let result = temporary.write(&request.text).and_then(|()| {
            if let Some(previous) = &mut previous {
                previous.check()?;
            }
            temporary.promote(&destination, request.overwrite)
        });
        if let Err(error) = result {
            return Err(self.discard_temporary(error));
        }
        // The promoted destination belongs to the user, not to cache cleanup.
        self.temporary = None;
        Ok(Exported { exported: true })
    }

    fn cleanup(&mut self) -> Result<(), Code> {
        self.cleanup_pending = true;
        if let Some(file) = &mut self.temporary {
            file.cleanup()?;
        }
        self.temporary = None;
        let mut failed = false;
        self.snapshots.retain(|_, snapshot| {
            if !snapshot.retiring {
                return true;
            }
            if snapshot.file.cleanup().is_err() {
                failed = true;
                return true;
            }
            false
        });
        if failed {
            return Err(Code::CleanupFailed);
        }
        let _registration = self.initialize().map_err(|_| Code::CleanupFailed)?;
        if self.stopping {
            if let Some(session) = &mut self.session {
                session.cleanup()?;
            }
            self.session = None;
        }
        self.cleanup_pending = false;
        Ok(())
    }

    fn shutdown(&mut self) -> Result<(), Code> {
        self.stopping = true;
        for snapshot in self.snapshots.values_mut() {
            snapshot.retiring = true;
        }
        self.cleanup()
    }
}

impl Drop for State {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

#[derive(Clone)]
pub struct DocumentStorage {
    state: Arc<Mutex<State>>,
}
impl DocumentStorage {
    /// Startup cleanup is attempted here and retained as a retryable write gate.
    pub fn new(root: PathBuf) -> Self {
        let mut state = State {
            root,
            nonce: uuid::Uuid::new_v4().to_string(),
            session: None,
            stale: None,
            snapshots: BTreeMap::new(),
            issued: 0,
            temporary: None,
            cleanup_pending: false,
            stopping: false,
        };
        state.cleanup_pending = state.initialize().is_err();
        Self {
            state: Arc::new(Mutex::new(state)),
        }
    }

    pub fn create_snapshot(&self, request: Value) -> Outcome<Created> {
        let start = Instant::now();
        let result = decode(request).and_then(|request| {
            self.state
                .lock()
                .map_err(|_| Code::Unavailable)?
                .create(request)
        });
        Outcome::result(result, Stage::Storage, start)
    }
    pub fn read_snapshot(&self, request: Value) -> Outcome<Text> {
        let start = Instant::now();
        let result = decode(request).and_then(|request| {
            self.state
                .lock()
                .map_err(|_| Code::Unavailable)?
                .read(request)
        });
        Outcome::result(result, Stage::Storage, start)
    }
    pub fn release_snapshot(&self, request: Value) -> Outcome<Released> {
        let start = Instant::now();
        let result = decode(request).and_then(|request| {
            self.state
                .lock()
                .map_err(|_| Code::Unavailable)?
                .release(request)
        });
        Outcome::result(result, Stage::Cleanup, start)
    }
    pub fn read_file(&self, request: Value) -> Outcome<Text> {
        let start = Instant::now();
        let result = decode::<ReadRequest>(request).and_then(|request| {
            let path = files::selected_path(&request.path)?;
            let directory = Directory::open(path.parent().ok_or(Code::InvalidRequest)?)?;
            let mut file = OwnedFile::existing(directory, path)?;
            Ok(Text { text: file.read()? })
        });
        Outcome::result(result, Stage::Storage, start)
    }
    pub fn export(&self, request: Value) -> Outcome<Exported> {
        let start = Instant::now();
        let result = decode(request).and_then(|request| {
            self.state
                .lock()
                .map_err(|_| Code::Unavailable)?
                .export(request)
        });
        Outcome::result(result, Stage::Export, start)
    }
    pub fn retry_cleanup(&self, request: Value) -> Outcome<Cleaned> {
        let start = Instant::now();
        let result = decode::<CleanupRequest>(request).and_then(|_| {
            self.state
                .lock()
                .map_err(|_| Code::Unavailable)?
                .cleanup()?;
            Ok(Cleaned { cleaned: true })
        });
        Outcome::result(result, Stage::Cleanup, start)
    }
    pub fn shutdown(&self) -> Result<(), String> {
        self.state
            .lock()
            .map_err(|_| Code::Unavailable.message().to_owned())?
            .shutdown()
            .map_err(|code| code.message().to_owned())
    }
}

#[cfg(test)]
mod tests;
