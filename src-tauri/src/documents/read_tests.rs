use super::{
    Code,
    files::{Directory, OwnedFile},
    model::MAX_TEXT_BYTES,
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("choom-read-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn read(&self, request: Value) -> Value {
        serde_json::to_value(super::read_file(request)).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn selected_reads_preserve_empty_unicode_and_maximum_utf8_bytes() {
    let fixture = Fixture::new();
    let path = fixture.0.join("baseline.yaml");
    let sibling = fixture.0.join("user.txt");
    fs::write(&sibling, "keep this file").unwrap();
    for text in [
        String::new(),
        "\u{feff}name: café\r\n".to_owned(),
        "é".repeat(MAX_TEXT_BYTES / 2),
    ] {
        fs::write(&path, &text).unwrap();
        let result = fixture.read(json!({"path":path}));
        assert_eq!(result["status"], "success");
        assert_eq!(result["text"], text);
        assert!(result["durationMs"].is_u64());
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
        assert_eq!(fs::read_to_string(&sibling).unwrap(), "keep this file");
    }
}

#[test]
fn selected_reads_count_the_utf8_bom_against_the_byte_limit() {
    let fixture = Fixture::new();
    let path = fixture.0.join("baseline.yaml");
    let text = format!("\u{feff}{}", "a".repeat(MAX_TEXT_BYTES - 3));
    fs::write(&path, &text).unwrap();
    let outcome = fixture.read(json!({"path":path}));
    assert_eq!(outcome["status"], "success");
    assert_eq!(outcome["text"].as_str().unwrap().len(), MAX_TEXT_BYTES);
    assert_eq!(
        outcome["sha256"],
        "437d127cb8797f8b7132e79138729a1f1d10b1b95dbd86fb29395d4c92229f3e"
    );
    fs::write(&path, text + "a").unwrap();
    assert_eq!(fixture.read(json!({"path":path}))["code"], "limit-exceeded");
}

#[test]
fn selected_read_failures_keep_their_safe_wire_contract() {
    let fixture = Fixture::new();
    let path = fixture.0.join("baseline.yaml");
    let assert_failure = |request, code, message| {
        let mut result = fixture.read(request);
        assert!(result["durationMs"].is_u64());
        result["durationMs"] = json!(0);
        assert_eq!(
            result,
            json!({"status":"failure", "stage":"storage", "code":code,
            "message":message, "durationMs":0})
        );
    };
    assert_failure(json!({"path":path}), "not-found", Code::NotFound.message());
    assert_failure(
        json!({"path":fixture.0}),
        "not-file",
        Code::NotFile.message(),
    );
    fs::write(&path, [0xff]).unwrap();
    assert_failure(
        json!({"path":path}),
        "invalid-utf8",
        Code::InvalidUtf8.message(),
    );
    fs::File::create(&path)
        .unwrap()
        .set_len(MAX_TEXT_BYTES as u64 + 1)
        .unwrap();
    assert_failure(
        json!({"path":path}),
        "limit-exceeded",
        Code::LimitExceeded.message(),
    );
    for request in [
        Value::Null,
        json!({}),
        json!({"path":42}),
        json!({"path":""}),
        json!({"path":"relative"}),
        json!({"path":"/nul\0path"}),
        json!({"path":path,"extra":true}),
        json!({"path":format!("/{}", "é".repeat(2048))}),
    ] {
        assert_failure(request, "invalid-request", Code::InvalidRequest.message());
    }
}

#[test]
fn selected_reads_reject_replaced_file_identity_without_changing_either_file() {
    let fixture = Fixture::new();
    let path = fixture.0.join("baseline.yaml");
    let moved = fixture.0.join("original.yaml");
    fs::write(&path, "original").unwrap();
    let mut file = OwnedFile::existing(Directory::open(&fixture.0).unwrap(), path.clone()).unwrap();
    fs::rename(&path, &moved).unwrap();
    fs::write(&path, "replacement").unwrap();
    assert!(matches!(file.read(), Err(Code::SourceChanged)));
    assert_eq!(fs::read_to_string(&path).unwrap(), "replacement");
    assert_eq!(fs::read_to_string(&moved).unwrap(), "original");
}

#[test]
fn selected_reads_reject_replaced_directory_identity_with_the_same_file() {
    let fixture = Fixture::new();
    let directory = fixture.0.join("selected");
    fs::create_dir(&directory).unwrap();
    let path = directory.join("baseline.yaml");
    fs::write(&path, "original").unwrap();
    let mut file = OwnedFile::existing(Directory::open(&directory).unwrap(), path.clone()).unwrap();
    // Move the open file first so the directory rename also works on Windows.
    let held = fixture.0.join("held.yaml");
    fs::rename(&path, &held).unwrap();
    fs::rename(&directory, fixture.0.join("moved")).unwrap();
    fs::create_dir(&directory).unwrap();
    fs::rename(&held, &path).unwrap();
    assert!(matches!(file.read(), Err(Code::SourceChanged)));
    assert_eq!(fs::read_to_string(&path).unwrap(), "original");
}

#[cfg(unix)]
#[test]
fn selected_reads_refuse_file_links_directory_links_and_fifos() {
    use std::os::unix::{ffi::OsStrExt, fs::symlink};
    let fixture = Fixture::new();
    let path = fixture.0.join("baseline.yaml");
    fs::write(&path, "original").unwrap();
    let link = fixture.0.join("linked.yaml");
    symlink(&path, &link).unwrap();
    assert_eq!(fixture.read(json!({"path":link}))["code"], "not-file");
    let directory_link = fixture.0.join("linked-directory");
    symlink(&fixture.0, &directory_link).unwrap();
    assert_eq!(
        fixture.read(json!({"path":directory_link.join("baseline.yaml")}))["code"],
        "source-changed"
    );
    let fifo = fixture.0.join("fifo");
    let raw = std::ffi::CString::new(fifo.as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(raw.as_ptr(), 0o600) }, 0);
    assert_eq!(fixture.read(json!({"path":fifo}))["code"], "not-file");
    assert_eq!(fs::read_to_string(&path).unwrap(), "original");
}
