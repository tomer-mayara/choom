use super::*;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

struct Fixture {
    directory: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let directory =
            std::env::temp_dir().join(format!("choom-documents-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        Self { directory }
    }
    fn service(&self) -> DocumentStorage {
        DocumentStorage::new(self.directory.join("cache"))
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}
fn value(value: impl serde::Serialize) -> Value {
    serde_json::to_value(value).unwrap()
}

#[test]
fn snapshots_keep_exact_bytes_and_capacity_returns_only_after_release() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    let text = "title: café\nnot parsed by native: [";
    let first = value(storage.create_snapshot(json!({"text":text})));
    assert_eq!(first["status"], "success", "{first}");
    let id = first["snapshotId"].clone();
    assert_eq!(
        value(storage.read_snapshot(json!({"snapshotId":id})))["text"],
        text
    );
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"candidate"})))["status"],
        "success"
    );
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"third"})))["code"],
        "snapshot-limit"
    );
    for _ in 0..2 {
        assert_eq!(
            value(storage.release_snapshot(json!({"snapshotId":id})))["released"],
            true
        );
    }
    assert_eq!(
        value(storage.read_snapshot(json!({"snapshotId":id})))["code"],
        "invalid-snapshot"
    );
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"next"})))["status"],
        "success"
    );
    storage.shutdown().unwrap();
}

#[test]
fn export_requires_atomic_replacement_consent_and_reopens_exact_text() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    let path = fixture.directory.join("diagram.choom.yaml");
    fs::write(&path, "Previous").unwrap();
    assert_eq!(
        value(storage.export(json!({"path":path,"text":"Current","overwrite":false})))["code"],
        "destination-exists"
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "Previous");
    assert_eq!(
        value(storage.export(json!({"path":path,"text":"Current","overwrite":true})))["exported"],
        true
    );
    assert_eq!(
        value(storage.read_file(json!({"path":path})))["text"],
        "Current"
    );
    storage.shutdown().unwrap();
}

#[test]
fn invalid_and_foreign_ids_never_release_a_live_snapshot() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    let other = fixture.service();
    let id = value(storage.create_snapshot(json!({"text":"kept"})))["snapshotId"].clone();
    assert_eq!(
        value(other.release_snapshot(json!({"snapshotId":id})))["code"],
        "invalid-snapshot"
    );
    assert_eq!(
        value(storage.release_snapshot(json!({"snapshotId":"document-invalid"})))["code"],
        "invalid-snapshot"
    );
    assert_eq!(
        value(storage.read_snapshot(json!({"snapshotId":id})))["text"],
        "kept"
    );
    storage.shutdown().unwrap();
    other.shutdown().unwrap();
}

#[test]
fn cleanup_retains_replaced_files_and_blocks_growth_until_the_owned_file_returns() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    let first = value(storage.create_snapshot(json!({"text":"current"})))["snapshotId"].clone();
    let second = value(storage.create_snapshot(json!({"text":"candidate"})))["snapshotId"].clone();
    let original = storage.state.lock().unwrap().snapshots[&2]
        .file
        .path
        .clone();
    let moved = original.with_extension("held");
    fs::rename(&original, &moved).unwrap();
    fs::write(&original, "user replacement").unwrap();
    let failure = value(storage.release_snapshot(json!({"snapshotId":second})));
    assert_eq!(failure["code"], "cleanup-failed");
    assert_eq!(failure["stage"], "cleanup");
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"blocked"})))["code"],
        "cleanup-failed"
    );
    assert_eq!(
        value(storage.export(
            json!({"path":fixture.directory.join("out"),"text":"blocked","overwrite":false})
        ))["code"],
        "cleanup-failed"
    );
    assert_eq!(
        value(storage.read_file(json!({"path":original})))["text"],
        "user replacement"
    );
    assert_eq!(
        value(storage.retry_cleanup(json!({})))["code"],
        "cleanup-failed"
    );
    assert_eq!(fs::read_to_string(&original).unwrap(), "user replacement");
    fs::remove_file(&original).unwrap();
    fs::rename(&moved, &original).unwrap();
    assert_eq!(value(storage.retry_cleanup(json!({})))["cleaned"], true);
    assert_eq!(
        value(storage.read_snapshot(json!({"snapshotId":first})))["text"],
        "current"
    );
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"new candidate"})))["status"],
        "success"
    );
    storage.shutdown().unwrap();
}

#[test]
fn stale_cleanup_preserves_active_sessions_unknown_files_and_symlinks() {
    let fixture = Fixture::new();
    let active = fixture.service();
    let active_id = value(active.create_snapshot(json!({"text":"active"})))["snapshotId"].clone();
    let root_path = fixture.directory.join("cache");
    let root = Directory::open(&root_path).unwrap();
    let nonce = uuid::Uuid::new_v4().to_string();
    let mut stale = Session::create(&root, nonce.clone()).unwrap();
    stale.initialize().unwrap();
    let stale_path = stale.directory.path.clone();
    let owned = stale_path.join(format!("document-{nonce}-1.choom.yaml"));
    fs::write(&owned, "stale").unwrap();
    let unknown = stale_path.join("notes.txt");
    fs::write(&unknown, "user file").unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(
            &unknown,
            stale_path.join(format!("document-{nonce}-2.choom.yaml")),
        )
        .unwrap();
    }
    drop(stale);
    let next = fixture.service();
    assert!(!owned.exists());
    assert_eq!(fs::read_to_string(&unknown).unwrap(), "user file");
    #[cfg(unix)]
    assert!(
        fs::symlink_metadata(stale_path.join(format!("document-{nonce}-2.choom.yaml")))
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert_eq!(
        value(active.read_snapshot(json!({"snapshotId":active_id})))["text"],
        "active"
    );
    assert_eq!(
        value(next.create_snapshot(json!({"text":"new"})))["status"],
        "success"
    );
    next.shutdown().unwrap();
    active.shutdown().unwrap();
}

#[test]
fn a_replaced_session_lease_must_not_authorize_deleting_its_files() {
    let fixture = Fixture::new();
    let root = Directory::open(&fixture.directory).unwrap();
    let nonce = uuid::Uuid::new_v4().to_string();
    let mut session = Session::create(&root, nonce.clone()).unwrap();
    session.initialize().unwrap();
    let owned = session
        .directory
        .path
        .join(format!("document-{nonce}-1.choom.yaml"));
    fs::write(&owned, "preserved").unwrap();
    let lease = session.directory.path.join(".lease");
    let moved = fixture.directory.join("original-lease");
    fs::rename(&lease, &moved).unwrap();
    fs::write(&lease, "replacement").unwrap();
    assert_eq!(session.cleanup(), Err(Code::CleanupFailed));
    assert_eq!(fs::read_to_string(&owned).unwrap(), "preserved");
    fs::remove_file(&lease).unwrap();
    fs::rename(moved, lease).unwrap();
    session.cleanup().unwrap();
}

#[test]
fn selected_reads_and_writes_enforce_utf8_byte_bounds_and_regular_files() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    let path = fixture.directory.join("document.choom.yaml");
    let exact = "é".repeat(MAX_TEXT_BYTES / 2);
    fs::write(&path, &exact).unwrap();
    assert_eq!(
        value(storage.read_file(json!({"path":path})))["text"],
        exact
    );
    assert_eq!(
        value(storage.create_snapshot(json!({"text":format!("{exact}x")})))["code"],
        "limit-exceeded"
    );
    fs::write(&path, [0xff]).unwrap();
    assert_eq!(
        value(storage.read_file(json!({"path":path})))["code"],
        "invalid-utf8"
    );
    fs::File::create(&path)
        .unwrap()
        .set_len(MAX_TEXT_BYTES as u64 + 1)
        .unwrap();
    assert_eq!(
        value(storage.read_file(json!({"path":path})))["code"],
        "limit-exceeded"
    );
    assert_eq!(
        value(storage.read_file(json!({"path":fixture.directory})))["code"],
        "not-file"
    );
    for request in [
        json!({"path":"relative"}),
        json!({"path":"/x","extra":true}),
        json!({"path":format!("/{}", "é".repeat(2048))}),
    ] {
        assert_eq!(value(storage.read_file(request))["code"], "invalid-request");
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        let fifo = fixture.directory.join("fifo");
        let raw = std::ffi::CString::new(fifo.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(raw.as_ptr(), 0o600) }, 0);
        assert_eq!(
            value(storage.read_file(json!({"path":fifo})))["code"],
            "not-file"
        );
    }
    storage.shutdown().unwrap();
}

#[test]
fn no_replace_promotion_preserves_a_destination_created_after_the_temporary_file() {
    let fixture = Fixture::new();
    let directory = Directory::open(&fixture.directory).unwrap();
    let mut temporary = OwnedFile::reserve(directory, "export.tmp").unwrap();
    temporary.write("new bytes").unwrap();
    let destination = fixture.directory.join("document.choom.yaml");
    fs::write(&destination, "concurrent writer").unwrap();
    assert_eq!(
        temporary.promote(&destination, false),
        Err(Code::DestinationExists)
    );
    assert_eq!(
        fs::read_to_string(destination).unwrap(),
        "concurrent writer"
    );
    temporary.cleanup().unwrap();
}

#[test]
fn shutdown_waits_for_owned_directory_restoration_and_then_removes_cache_files() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"current"})))["status"],
        "success"
    );
    let directory = storage
        .state
        .lock()
        .unwrap()
        .session
        .as_ref()
        .unwrap()
        .directory
        .path
        .clone();
    let moved = fixture.directory.join("moved-session");
    fs::rename(&directory, &moved).unwrap();
    fs::create_dir(&directory).unwrap();
    let unknown = directory.join("user.txt");
    fs::write(&unknown, "preserved").unwrap();
    assert!(storage.shutdown().is_err());
    assert_eq!(fs::read_to_string(&unknown).unwrap(), "preserved");
    fs::remove_file(unknown).unwrap();
    fs::remove_dir(&directory).unwrap();
    fs::rename(moved, &directory).unwrap();
    storage.shutdown().unwrap();
    assert!(!directory.exists());
}

#[test]
fn startup_cleanup_failure_is_retryable_and_selected_file_reads_remain_available() {
    let fixture = Fixture::new();
    let root = fixture.directory.join("cache");
    fs::create_dir(&root).unwrap();
    fs::create_dir(root.join(".registration.lock")).unwrap();
    let selected = fixture.directory.join("saved.choom.yaml");
    fs::write(&selected, "saved bytes").unwrap();
    let storage = fixture.service();
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"blocked"})))["code"],
        "cleanup-failed"
    );
    assert_eq!(
        value(storage.read_file(json!({"path":selected})))["text"],
        "saved bytes"
    );
    assert_eq!(
        value(storage.retry_cleanup(json!({})))["code"],
        "cleanup-failed"
    );
    fs::remove_dir(root.join(".registration.lock")).unwrap();
    assert_eq!(value(storage.retry_cleanup(json!({})))["cleaned"], true);
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"available"})))["status"],
        "success"
    );
    storage.shutdown().unwrap();
}

#[test]
fn a_failed_export_temporary_cleanup_overrides_the_failure_and_retains_its_identity() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    let export_directory = fixture.directory.join("exports");
    fs::create_dir(&export_directory).unwrap();
    let directory = Directory::open(&export_directory).unwrap();
    let mut temporary = OwnedFile::reserve(directory, ".choom-export-owned.tmp").unwrap();
    temporary.write("candidate").unwrap();
    let original = temporary.path.clone();
    let moved = fixture.directory.join("owned-export.tmp");
    fs::rename(&original, &moved).unwrap();
    fs::write(&original, "replacement").unwrap();
    {
        let mut state = storage.state.lock().unwrap();
        state.temporary = Some(temporary);
        assert_eq!(state.discard_temporary(Code::IoError), Code::CleanupFailed);
    }
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"blocked"})))["code"],
        "cleanup-failed"
    );
    assert_eq!(
        value(storage.retry_cleanup(json!({})))["code"],
        "cleanup-failed"
    );
    assert_eq!(fs::read_to_string(&original).unwrap(), "replacement");
    fs::remove_file(&original).unwrap();
    fs::rename(moved, &original).unwrap();
    assert_eq!(value(storage.retry_cleanup(json!({})))["cleaned"], true);
    assert!(!original.exists());
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"available"})))["status"],
        "success"
    );
    storage.shutdown().unwrap();
}

#[test]
fn rename_without_replacement_retains_snapshot_ownership_until_restoration() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    let id = value(storage.create_snapshot(json!({"text":"owned bytes"})))["snapshotId"].clone();
    let original = storage.state.lock().unwrap().snapshots[&1]
        .file
        .path
        .clone();
    let moved = fixture.directory.join("moved.choom.yaml");
    fs::rename(&original, &moved).unwrap();
    assert_eq!(
        value(storage.release_snapshot(json!({"snapshotId":id})))["code"],
        "cleanup-failed"
    );
    assert_eq!(storage.state.lock().unwrap().snapshots.len(), 1);
    assert_eq!(
        value(storage.create_snapshot(json!({"text":"blocked"})))["code"],
        "cleanup-failed"
    );
    assert_eq!(
        value(storage.retry_cleanup(json!({})))["code"],
        "cleanup-failed"
    );
    assert_eq!(fs::read_to_string(&moved).unwrap(), "owned bytes");
    fs::rename(moved, &original).unwrap();
    assert_eq!(value(storage.retry_cleanup(json!({})))["cleaned"], true);
    assert!(!original.exists());
    assert_eq!(
        value(storage.release_snapshot(json!({"snapshotId":id})))["released"],
        true
    );
    storage.shutdown().unwrap();
}

#[test]
fn a_truly_unlinked_owned_file_does_not_prevent_release_or_shutdown() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    let id = value(storage.create_snapshot(json!({"text":"owned bytes"})))["snapshotId"].clone();
    let original = storage.state.lock().unwrap().snapshots[&1]
        .file
        .path
        .clone();
    fs::remove_file(&original).unwrap();
    assert_eq!(
        value(storage.release_snapshot(json!({"snapshotId":id})))["released"],
        true
    );
    assert!(storage.state.lock().unwrap().snapshots.is_empty());
    storage.shutdown().unwrap();
}

#[test]
fn a_replacement_for_an_unlinked_snapshot_is_preserved_during_shutdown() {
    let fixture = Fixture::new();
    let storage = fixture.service();
    let id = value(storage.create_snapshot(json!({"text":"owned bytes"})))["snapshotId"].clone();
    let original = storage.state.lock().unwrap().snapshots[&1]
        .file
        .path
        .clone();
    fs::remove_file(&original).unwrap();
    // Release closes the deleted identity before Windows permits this name to be reused.
    assert_eq!(
        value(storage.release_snapshot(json!({"snapshotId":id})))["released"],
        true
    );
    fs::write(&original, "replacement bytes").unwrap();
    storage.shutdown().unwrap();
    assert_eq!(fs::read_to_string(&original).unwrap(), "replacement bytes");
    let next = fixture.service();
    assert_eq!(fs::read_to_string(&original).unwrap(), "replacement bytes");
    next.shutdown().unwrap();
}
