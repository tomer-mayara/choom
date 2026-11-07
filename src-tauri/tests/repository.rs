use choom_lib::repository::RepositoryService;
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "choom-repository-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }

    fn file(&self, path: &str, contents: impl AsRef<[u8]>) -> PathBuf {
        let path = self.0.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, contents).unwrap();
        path
    }

    fn open(&self, service: &RepositoryService) -> String {
        let outcome = value(service.open(json!({ "rootPath": self.0 })));
        outcome["value"]["repositorySession"]
            .as_str()
            .unwrap_or_else(|| panic!("Cannot open fixture: {outcome}"))
            .to_owned()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

fn value(outcome: impl serde::Serialize) -> Value {
    serde_json::to_value(outcome).unwrap()
}

#[test]
fn reads_utf8_text_and_preserves_spaces_in_canonical_paths() {
    let fixture = Fixture::new();
    fixture.file("source files/élément.yaml", "name: Éléments\n");
    let service = RepositoryService::default();
    let session = fixture.open(&service);

    let result = value(service.read_text(json!({
        "repositorySession": session,
        "path": "source files/../source files/élément.yaml"
    })));

    assert_eq!(
        result,
        json!({ "status": "success", "value": {
            "path": "source files/élément.yaml", "text": "name: Éléments\n"
        }})
    );
}

#[test]
fn normalizes_contained_parent_references_and_retains_request_order() {
    let fixture = Fixture::new();
    fixture.file("src/api/component.yaml", "name: api");
    fixture.file("src/core/component.yaml", "name: core");
    let service = RepositoryService::default();
    let session = fixture.open(&service);

    let result = value(service.resolve_paths(json!({
        "repositorySession": session, "base": "src/api",
        "paths": ["../core", "component.yaml", "../.."]
    })));

    assert_eq!(
        result,
        json!({ "status": "success", "value": { "paths": [
        { "location": "inside", "path": "src/core", "kind": "directory" },
        { "location": "inside", "path": "src/api/component.yaml", "kind": "file" },
        { "location": "inside", "path": ".", "kind": "directory" }
    ] }})
    );
}

#[test]
fn closing_a_session_prevents_later_reads_and_is_idempotent() {
    let fixture = Fixture::new();
    fixture.file("component.yaml", "name: root");
    let service = RepositoryService::default();
    let session = fixture.open(&service);

    let first = value(service.close(json!({ "repositorySession": session })));
    let second = value(service.close(json!({ "repositorySession": session })));
    let read =
        value(service.read_text(json!({ "repositorySession": session, "path": "component.yaml" })));

    assert_eq!(
        first,
        json!({ "status": "success", "value": { "closed": true }})
    );
    assert_eq!(second, first);
    assert_eq!(read["code"], "invalid-session");
}

#[test]
fn rejects_unknown_fields_and_invalid_request_shapes() {
    let fixture = Fixture::new();
    let service = RepositoryService::default();
    let session = fixture.open(&service);

    for request in [
        json!({ "rootPath": fixture.0, "extra": true }),
        json!({ "rootPath": 1 }),
        json!(null),
        json!({ "rootPath": "relative/root" }),
        json!({ "rootPath": "/root\u{0000}secret" }),
    ] {
        assert_eq!(value(service.open(request))["code"], "invalid-request");
    }
    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": session, "path": "file", "extra": true
        })))["code"],
        "invalid-request"
    );
    assert_eq!(
        value(service.resolve_paths(json!({
            "repositorySession": session, "base": ".", "paths": ["."], "extra": true
        })))["code"],
        "invalid-request"
    );
    assert_eq!(
        value(service.close(json!({
            "repositorySession": session, "extra": true
        })))["code"],
        "invalid-request"
    );
}

#[test]
fn distinguishes_missing_paths_from_wrong_path_types() {
    let fixture = Fixture::new();
    let file = fixture.file("component.yaml", "name: root");
    let service = RepositoryService::default();
    let session = fixture.open(&service);

    assert_eq!(
        value(service.open(json!({ "rootPath": file })))["code"],
        "not-directory"
    );
    assert_eq!(
        value(service.open(json!({ "rootPath": fixture.0.join("missing") })))["code"],
        "not-found"
    );
    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": session, "path": "."
        })))["code"],
        "not-file"
    );
    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": session, "path": "missing"
        })))["code"],
        "not-found"
    );
    assert_eq!(
        value(service.resolve_paths(json!({
            "repositorySession": session, "base": "component.yaml", "paths": ["."]
        })))["code"],
        "not-directory"
    );
}

#[test]
fn rejects_absolute_text_paths_and_noncanonical_bases() {
    let fixture = Fixture::new();
    let file = fixture.file("component.yaml", "name: root");
    let service = RepositoryService::default();
    let session = fixture.open(&service);

    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": session, "path": file
        })))["code"],
        "invalid-request"
    );
    for path in ["C:\\repo\\file", "C:/repo/file", "file\n", "", "src\\file"] {
        assert_eq!(
            value(service.read_text(json!({
                "repositorySession": session, "path": path
            })))["code"],
            "invalid-request"
        );
    }
    for base in ["./src", "src/../src", "src//core", "src/", "/", "C:/repo"] {
        assert_eq!(
            value(service.resolve_paths(json!({
                "repositorySession": session, "base": base, "paths": ["."]
            })))["code"],
            "invalid-request"
        );
    }
}

#[test]
fn requires_a_well_formed_open_session() {
    let service = RepositoryService::default();
    for session in [
        "",
        "repository-0",
        "repository-01",
        "repository--1",
        "repository-1x",
        "repository-18446744073709551616",
    ] {
        assert_eq!(
            value(service.close(json!({ "repositorySession": session })))["code"],
            "invalid-request"
        );
    }
    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": "repository-1", "path": "component.yaml"
        })))["code"],
        "invalid-session"
    );
    assert_eq!(
        value(service.resolve_paths(json!({
            "repositorySession": "repository-1", "base": ".", "paths": ["."]
        })))["code"],
        "invalid-session"
    );
}

#[test]
fn limits_sessions_and_releases_capacity_on_close() {
    let fixture = Fixture::new();
    let service = RepositoryService::default();
    let sessions: Vec<_> = (0..16).map(|_| fixture.open(&service)).collect();
    let rejected = value(service.open(json!({ "rootPath": fixture.0 })));
    service.close(json!({ "repositorySession": sessions[0] }));
    let replacement = fixture.open(&service);

    assert_eq!(rejected["code"], "limit-exceeded");
    assert!(!sessions.contains(&replacement));
}

#[test]
fn bounds_path_bytes_and_resolve_batches() {
    let fixture = Fixture::new();
    let service = RepositoryService::default();
    let session = fixture.open(&service);
    let exactly_full = vec!["."; 128];
    let result = value(service.resolve_paths(json!({
        "repositorySession": session, "base": ".", "paths": exactly_full
    })));
    assert_eq!(result["value"]["paths"].as_array().unwrap().len(), 128);

    for paths in [Vec::<&str>::new(), vec!["."; 129]] {
        assert_eq!(
            value(service.resolve_paths(json!({
                "repositorySession": session, "base": ".", "paths": paths
            })))["code"],
            "limit-exceeded"
        );
    }
    for path in ["x".repeat(4097), "é".repeat(2049)] {
        assert_eq!(
            value(service.read_text(json!({
                "repositorySession": session, "path": path
            })))["code"],
            "limit-exceeded"
        );
    }
}

#[test]
fn bounds_text_in_utf8_bytes_and_rejects_invalid_encoding() {
    let fixture = Fixture::new();
    fixture.file("exact.txt", "é".repeat(131_072));
    fixture.file("large.txt", "é".repeat(131_073));
    fixture.file("invalid.txt", [0xff, 0x00]);
    let service = RepositoryService::default();
    let session = fixture.open(&service);

    let exact =
        value(service.read_text(json!({ "repositorySession": session, "path": "exact.txt" })));
    assert_eq!(exact["value"]["text"].as_str().unwrap().len(), 262_144);
    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": session, "path": "large.txt"
        })))["code"],
        "limit-exceeded"
    );
    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": session, "path": "invalid.txt"
        })))["code"],
        "invalid-utf8"
    );
}

#[test]
fn outside_paths_receive_stable_opaque_references_without_becoming_readable() {
    let fixture = Fixture::new();
    let outside = Fixture::new();
    let outside_file = outside.file("private.yaml", "private");
    let service = RepositoryService::default();
    let session = fixture.open(&service);
    let parent_reference = format!(
        "../{}/private.yaml",
        outside.0.file_name().unwrap().to_str().unwrap()
    );

    let result = value(service.resolve_paths(json!({
        "repositorySession": session, "base": ".", "paths": [outside_file, parent_reference]
    })));
    let paths = result["value"]["paths"].as_array().unwrap();
    assert_eq!(paths[0], paths[1]);
    assert_eq!(paths[0]["location"], "outside");
    assert!(
        paths[0]["reference"]
            .as_str()
            .unwrap()
            .starts_with("outside-")
    );
    assert!(!result.to_string().contains(outside.0.to_str().unwrap()));
    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": session, "path": parent_reference
        })))["code"],
        "outside-root"
    );
}

#[test]
fn directory_name_prefixes_do_not_establish_containment() {
    let fixture = Fixture::new();
    fixture.file("repo/component.yaml", "name: root");
    let outside_file = fixture.file("repo-extra/private.yaml", "private");
    let service = RepositoryService::default();
    let opened = value(service.open(json!({ "rootPath": fixture.0.join("repo") })));
    let session = &opened["value"]["repositorySession"];

    assert_eq!(
        value(service.resolve_paths(json!({
            "repositorySession": session, "base": ".", "paths": [outside_file]
        })))["value"]["paths"][0]["location"],
        "outside"
    );
    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": session, "path": "../repo-extra/private.yaml"
        })))["code"],
        "outside-root"
    );
}

#[test]
fn reports_a_file_removed_after_path_resolution() {
    let fixture = Fixture::new();
    let file = fixture.file("component.yaml", "name: root");
    let service = RepositoryService::default();
    let session = fixture.open(&service);
    let resolved = value(service.resolve_paths(json!({
        "repositorySession": session, "base": ".", "paths": ["component.yaml"]
    })));
    fs::remove_file(file).unwrap();

    let read = value(service.read_text(json!({
        "repositorySession": session, "path": resolved["value"]["paths"][0]["path"]
    })));

    assert_eq!(read["code"], "not-found");
    assert!(
        !read["message"]
            .as_str()
            .unwrap()
            .contains(fixture.0.to_str().unwrap())
    );
}

#[test]
fn caps_outside_reference_storage_per_session() {
    let fixture = Fixture::new();
    let outside = Fixture::new();
    for number in 0..=4096 {
        outside.file(&format!("file-{number}"), "");
    }
    let service = RepositoryService::default();
    let session = fixture.open(&service);
    for batch in 0..32 {
        let paths: Vec<_> = (batch * 128..(batch + 1) * 128)
            .map(|number| outside.0.join(format!("file-{number}")))
            .collect();
        assert_eq!(
            value(service.resolve_paths(json!({
                "repositorySession": session, "base": ".", "paths": paths
            })))["status"],
            "success"
        );
    }

    assert_eq!(
        value(service.resolve_paths(json!({
            "repositorySession": session, "base": ".", "paths": [outside.0.join("file-4096")]
        })))["code"],
        "limit-exceeded"
    );
    assert_eq!(
        value(service.resolve_paths(json!({
            "repositorySession": session, "base": ".", "paths": [outside.0.join("file-0")]
        })))["status"],
        "success"
    );
}

#[cfg(unix)]
#[test]
fn follows_contained_links_and_blocks_links_that_escape() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    fixture.file("actual/component.yaml", "name: actual");
    let outside = Fixture::new();
    let private = outside.file("private.yaml", "private");
    symlink(fixture.0.join("actual"), fixture.0.join("alias")).unwrap();
    symlink(outside.0.clone(), fixture.0.join("escape")).unwrap();
    symlink(private, fixture.0.join("escape.yaml")).unwrap();
    let service = RepositoryService::default();
    let session = fixture.open(&service);

    let contained = value(service.read_text(json!({
        "repositorySession": session, "path": "alias/component.yaml"
    })));
    assert_eq!(contained["value"]["path"], "actual/component.yaml");
    for path in ["escape/private.yaml", "escape.yaml"] {
        assert_eq!(
            value(service.read_text(json!({
                "repositorySession": session, "path": path
            })))["code"],
            "outside-root"
        );
    }
    assert_eq!(
        value(service.resolve_paths(json!({
            "repositorySession": session, "base": ".", "paths": ["escape"]
        })))["value"]["paths"][0]["location"],
        "outside"
    );
}

#[cfg(unix)]
#[test]
fn a_selected_symlink_root_uses_its_canonical_directory() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let selected = Fixture::new();
    fixture.file("component.yaml", "name: root");
    symlink(&fixture.0, selected.0.join("chosen")).unwrap();
    let service = RepositoryService::default();
    let result = value(service.open(json!({ "rootPath": selected.0.join("chosen") })));
    let session = &result["value"]["repositorySession"];

    assert_eq!(
        value(service.read_text(json!({
            "repositorySession": session, "path": "component.yaml"
        })))["value"],
        json!({ "path": "component.yaml", "text": "name: root" })
    );
}
