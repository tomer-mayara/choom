use super::*;
use crate::repository::RepositoryService;
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
    thread,
    time::{Duration, Instant},
};

static NEXT_FIXTURE: AtomicUsize = AtomicUsize::new(1);

struct Fixture {
    directory: PathBuf,
    root: PathBuf,
    repository: RepositoryService,
    session: String,
}

impl Fixture {
    fn new(script: &str) -> Self {
        Self::named(script, "repo")
    }

    fn named(script: &str, name: &str) -> Self {
        let directory = std::env::temp_dir().join(format!(
            "choom-analyzer-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        let root = directory.join(name);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("node_modules/dependency-cruiser/bin")).unwrap();
        fs::write(root.join("src/index.js"), "export const value = 1;\n").unwrap();
        fs::write(
            root.join(".dependency-cruiser.cjs"),
            "module.exports = {};\n",
        )
        .unwrap();
        fs::write(root.join("node_modules/dependency-cruiser/package.json"), serde_json::to_vec(&json!({"name":"dependency-cruiser","version":"18.7.2","engines":{"node":"^22||^24||>=26"},"bin":{"dependency-cruiser":"bin/dependency-cruiser.mjs"}})).unwrap()).unwrap();
        fs::write(
            root.join("node_modules/dependency-cruiser/bin/dependency-cruiser.mjs"),
            script,
        )
        .unwrap();
        let repository = RepositoryService::default();
        let opened = value(repository.open(json!({"rootPath": root})));
        let session = opened["value"]["repositorySession"]
            .as_str()
            .unwrap()
            .to_owned();
        Self {
            directory,
            root,
            repository,
            session,
        }
    }

    fn service(&self) -> AnalyzerService {
        AnalyzerService::new(self.repository.clone(), self.directory.join("cache"))
    }

    fn request(&self) -> Value {
        json!({"repositorySession": self.session, "config":".dependency-cruiser.cjs","inputs":["src"]})
    }

    fn run(&self) -> Value {
        let service = self.service();
        service.prepare(self.request());
        let result = value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())));
        service.release(json!({"jobId":"analysis-1"}));
        result
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}

fn value(result: impl Serialize) -> Value {
    serde_json::to_value(result).unwrap()
}

#[test]
fn preparing_reserves_a_job_without_starting_the_analyzer() {
    let fixture = Fixture::new(
        "import fs from 'node:fs';fs.writeFileSync('unexpected-execution','started');",
    );
    let service = fixture.service();
    let prepared = value(service.prepare(fixture.request()));
    assert_eq!(
        prepared,
        json!({"status":"success","value":{"jobId":"analysis-1"}})
    );
    assert!(!fixture.root.join("unexpected-execution").exists());
    assert_eq!(
        value(service.release(json!({"jobId":"analysis-1"}))),
        json!({"status":"success","released":true})
    );
}

#[test]
fn prepared_jobs_can_be_cancelled_and_released_repeatedly() {
    let fixture = Fixture::new("throw new Error('must not execute');");
    let service = fixture.service();
    service.prepare(fixture.request());
    assert_eq!(
        value(service.cancel(json!({"jobId":"analysis-1"}))),
        json!({"status":"success","stopped":true})
    );
    assert_eq!(
        value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())))["status"],
        "cancelled"
    );
    for _ in 0..2 {
        assert_eq!(
            value(service.release(json!({"jobId":"analysis-1"}))),
            json!({"status":"success","released":true})
        );
        assert_eq!(
            value(service.cancel(json!({"jobId":"analysis-1"}))),
            json!({"status":"success","stopped":true})
        );
    }
}

#[test]
fn completed_report_is_read_from_owned_file_and_raw_streams_stay_private() {
    let fixture = Fixture::new(
        "import fs from 'node:fs';console.log('private stdout');console.error('private stderr');fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], '{}');",
    );
    let service = fixture.service();
    service.prepare(fixture.request());
    let result = value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())));
    assert_eq!(result["status"], "completed", "{result}");
    assert_eq!(result["reportJson"], "{}");
    assert_eq!(result["workingDirectory"], ".");
    assert!(!result.to_string().contains("private"));
    assert_eq!(
        fs::read_dir(fixture.directory.join("cache"))
            .unwrap()
            .count(),
        0
    );
    service.release(json!({"jobId":"analysis-1"}));
}

const WRITE_REPORT: &str = "import fs from 'node:fs';fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], '{}');";

#[test]
fn arguments_are_native_owned_and_literal_with_repository_working_directory() {
    let fixture = Fixture::named(
        "import fs from 'node:fs';fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));",
        "repo with spaces",
    );
    fs::create_dir(fixture.root.join("source files")).unwrap();
    let mut request = fixture.request();
    request["inputs"] = json!(["source files", "src/index.js"]);
    let service = fixture.service();
    service.prepare(request);
    let outcome = value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())));
    assert_eq!(outcome["status"], "completed", "{outcome}");
    let report: Value = serde_json::from_str(outcome["reportJson"].as_str().unwrap()).unwrap();
    assert_eq!(
        report["cwd"],
        json!(dunce::canonicalize(&fixture.root).unwrap())
    );
    let args = report["args"].as_array().unwrap();
    assert_eq!(args[0], "--config");
    assert_eq!(
        args[1],
        json!(dunce::canonicalize(fixture.root.join(".dependency-cruiser.cjs")).unwrap())
    );
    assert_eq!(
        &args[2..5],
        &[json!("--output-type"), json!("json"), json!("--output-to")]
    );
    assert!(!PathBuf::from(args[5].as_str().unwrap()).starts_with(&fixture.root));
    assert_eq!(
        &args[6..],
        &[
            json!("--no-cache"),
            json!("--no-progress"),
            json!("--"),
            json!("source files"),
            json!("src/index.js")
        ]
    );
    service.release(json!({"jobId":"analysis-1"}));
}

#[test]
fn invalid_requests_never_reserve_or_execute_a_job() {
    let fixture = Fixture::new(WRITE_REPORT);
    let service = fixture.service();
    for input in [
        "../src",
        "--help",
        "src/*",
        "src/file(foo).js",
        "src/$HOME",
        "src;echo",
        "/src",
        "C:/src",
        "src\\file.js",
    ] {
        let mut request = fixture.request();
        request["inputs"] = json!([input]);
        assert_eq!(
            value(service.prepare(request))["code"],
            "invalid-request",
            "{input}"
        );
    }
    for field in ["command", "args", "cwd", "timeoutMs"] {
        let mut request = fixture.request();
        request[field] = json!("untrusted");
        assert_eq!(value(service.prepare(request))["code"], "invalid-request");
    }
    let mut request = fixture.request();
    request["nodeExecutable"] = json!("node");
    assert_eq!(value(service.prepare(request))["code"], "invalid-request");
    let mut request = fixture.request();
    request["nodeExecutable"] = Value::Null;
    assert_eq!(value(service.prepare(request))["code"], "invalid-request");
    assert_eq!(
        value(service.prepare(fixture.request()))["value"]["jobId"],
        "analysis-1"
    );
    service.release(json!({"jobId":"analysis-1"}));
}

#[test]
fn runtime_absence_and_package_metadata_have_actionable_safe_failures() {
    let fixture = Fixture::new(WRITE_REPORT);
    let service = AnalyzerService::configured(
        fixture.repository.clone(),
        fixture.directory.join("cache"),
        model::Limits::default(),
        None,
    );
    service.prepare(fixture.request());
    assert_eq!(
        value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())))["code"],
        "node-not-found"
    );
    service.release(json!({"jobId":"analysis-1"}));
    let package = fixture.root.join("node_modules/dependency-cruiser");
    fs::remove_file(package.join("package.json")).unwrap();
    assert_eq!(fixture.run()["code"], "unsupported-analyzer");
    fs::remove_dir_all(package).unwrap();
    let outcome = fixture.run();
    assert_eq!(outcome["code"], "analyzer-not-found");
    assert!(!outcome.to_string().contains(fixture.root.to_str().unwrap()));
}

#[test]
fn config_url_metacharacters_in_the_repository_root_fail_before_execution() {
    let names = if cfg!(windows) {
        vec!["repo%20space", "repo#fragment"]
    } else {
        vec!["repo%20space", "repo#fragment", "repo?query"]
    };
    for name in names {
        let fixture = Fixture::named(WRITE_REPORT, name);
        assert_eq!(fixture.run()["code"], "unsupported-config-path", "{name}");
    }
}

#[test]
fn node_engine_range_excludes_odd_unsupported_and_prerelease_versions() {
    for version in [
        "v22.0.0\n",
        "v24.20.0\n",
        "v26.0.0\n",
        "v30.5.1\n",
        "v24.1.0+vendor.2\n",
    ] {
        assert!(runtime::supported_node(version.as_bytes()), "{version}");
    }
    for version in [
        "v20.10.0",
        "v23.0.0",
        "v25.0.0",
        "v26.0.0-rc.1",
        "v24.1",
        "v024.1.1",
        "24.1.1",
        "v24.1.1\nsecret",
    ] {
        assert!(!runtime::supported_node(version.as_bytes()), "{version}");
    }
}

#[test]
fn invalid_missing_and_nonzero_reports_never_return_partial_success() {
    for (script, code) in [
        ("console.log('{}');", "report-missing"),
        (
            "import fs from 'node:fs';fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], '{');",
            "report-invalid",
        ),
        (
            "import fs from 'node:fs';fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], '[]');",
            "report-invalid",
        ),
        (
            "import fs from 'node:fs';fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], Buffer.from([255]));",
            "report-invalid",
        ),
        (
            "import fs from 'node:fs';fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], '{}');process.exitCode=1;",
            "execution-failed",
        ),
    ] {
        let fixture = Fixture::new(script);
        let outcome = fixture.run();
        assert_eq!(outcome["code"], code, "{outcome}");
        assert!(outcome.get("reportJson").is_none());
        assert_eq!(
            fs::read_dir(fixture.directory.join("cache"))
                .unwrap()
                .count(),
            0
        );
    }
}

#[test]
fn execution_time_streams_and_report_bytes_have_independent_bounds() {
    for (script, code) in [
        ("setInterval(()=>{},1000);", "timed-out"),
        (
            "process.stdout.write('x'.repeat(2048));setInterval(()=>{},1000);",
            "output-limit",
        ),
        (
            "process.stderr.write('x'.repeat(2048));setInterval(()=>{},1000);",
            "output-limit",
        ),
        (
            "import fs from 'node:fs';fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], 'x'.repeat(2048));setInterval(()=>{},1000);",
            "output-limit",
        ),
        (
            "import fs from 'node:fs';const output=process.argv[process.argv.indexOf('--output-to')+1];fs.unlinkSync(output);fs.writeFileSync(output,'x'.repeat(2048));setInterval(()=>{},1000);",
            "output-limit",
        ),
    ] {
        let fixture = Fixture::new(script);
        let timeout = if code == "timed-out" {
            Duration::from_secs(2)
        } else {
            Duration::from_secs(5)
        };
        let limits = model::Limits {
            timeout,
            stream_bytes: 1024,
            report_bytes: 1024,
            ..Default::default()
        };
        let service = AnalyzerService::configured(
            fixture.repository.clone(),
            fixture.directory.join("cache"),
            limits,
            std::env::var_os("PATH"),
        );
        service.prepare(fixture.request());
        let result = value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())));
        assert_eq!(result["code"], code, "{result}");
        assert_eq!(
            fs::read_dir(fixture.directory.join("cache"))
                .unwrap()
                .count(),
            0
        );
        assert_eq!(
            value(service.release(json!({"jobId":"analysis-1"})))["released"],
            true
        );
    }
}

#[cfg(unix)]
#[test]
fn fifo_replacement_cannot_block_verification_or_cancellation() {
    use std::ffi::CString;
    let fixture = Fixture::new(
        "import fs from 'node:fs';fs.unlinkSync('src/index.js');fs.renameSync('replacement','src/index.js');fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], '{}');",
    );
    let replacement = CString::new(fixture.root.join("replacement").to_str().unwrap()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(replacement.as_ptr(), 0o600) }, 0);
    let service = fixture.service();
    let mut request = fixture.request();
    request["inputs"] = json!(["src/index.js"]);
    service.prepare(request);
    let worker = service.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    let running = thread::spawn(move || {
        sender
            .send(value(worker.run(json!({"jobId":"analysis-1"}), |_| Ok(()))))
            .unwrap();
    });
    let result = receiver.recv_timeout(Duration::from_secs(3));
    if result.is_err() {
        // Unblock the old implementation so a red test does not strand a worker.
        let fifo = CString::new(fixture.root.join("src/index.js").to_str().unwrap()).unwrap();
        let writer = unsafe { libc::open(fifo.as_ptr(), libc::O_WRONLY | libc::O_NONBLOCK) };
        if writer >= 0 {
            unsafe {
                libc::close(writer);
            }
        }
    }
    running.join().unwrap();
    assert!(result.is_ok(), "verification blocked on a replaced FIFO");
    assert_eq!(result.unwrap()["code"], "source-changed");
    service.release(json!({"jobId":"analysis-1"}));
}

#[test]
fn replacing_the_selected_root_invalidates_its_native_lease() {
    let fixture = Fixture::new(WRITE_REPORT);
    let service = fixture.service();
    service.prepare(fixture.request());
    let original = fixture.directory.join("original");
    fs::rename(&fixture.root, &original).unwrap();
    fs::create_dir_all(fixture.root.join("src")).unwrap();
    fs::create_dir_all(fixture.root.join("node_modules/dependency-cruiser/bin")).unwrap();
    for path in [
        "src/index.js",
        ".dependency-cruiser.cjs",
        "node_modules/dependency-cruiser/package.json",
        "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
    ] {
        fs::copy(original.join(path), fixture.root.join(path)).unwrap();
    }
    let outcome = value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())));
    assert_eq!(outcome["code"], "source-changed");
    service.release(json!({"jobId":"analysis-1"}));
    let reopened = value(fixture.repository.open(json!({"rootPath":fixture.root})));
    let mut request = fixture.request();
    request["repositorySession"] = reopened["value"]["repositorySession"].clone();
    service.prepare(request);
    assert_eq!(
        value(service.run(json!({"jobId":"analysis-2"}), |_| Ok(())))["status"],
        "completed"
    );
    service.release(json!({"jobId":"analysis-2"}));
}

fn wait_for(path: &std::path::Path) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !path.exists() {
        assert!(
            Instant::now() < deadline,
            "process did not create {}",
            path.display()
        );
        thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn cancellation_and_session_close_stop_running_work_before_acknowledgement() {
    for close in [false, true] {
        let fixture = Fixture::new(
            "import fs from 'node:fs';fs.writeFileSync('started','yes');setInterval(()=>{},1000);",
        );
        let service = fixture.service();
        service.prepare(fixture.request());
        let worker = service.clone();
        let running =
            thread::spawn(move || value(worker.run(json!({"jobId":"analysis-1"}), |_| Ok(()))));
        wait_for(&fixture.root.join("started"));
        if close {
            fixture
                .repository
                .close(json!({"repositorySession":fixture.session}));
        } else {
            assert_eq!(
                value(service.cancel(json!({"jobId":"analysis-1"})))["stopped"],
                true
            );
        }
        let outcome = running.join().unwrap();
        if close {
            assert_eq!(outcome["code"], "invalid-session");
        } else {
            assert_eq!(outcome["status"], "cancelled");
        }
        assert_eq!(
            fs::read_dir(fixture.directory.join("cache"))
                .unwrap()
                .count(),
            0
        );
        assert_eq!(
            value(service.release(json!({"jobId":"analysis-1"})))["released"],
            true
        );
    }
}

#[test]
fn source_changes_during_analysis_invalidate_the_report() {
    let fixture = Fixture::new(
        "import fs from 'node:fs';fs.writeFileSync('.dependency-cruiser.cjs','changed');fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], '{}');",
    );
    assert_eq!(fixture.run()["code"], "source-changed");
}

#[test]
fn abandoned_preparations_expire_without_processes_or_unbounded_tombstones() {
    let fixture = Fixture::new(WRITE_REPORT);
    let limits = model::Limits {
        prepared_timeout: Duration::ZERO,
        ..Default::default()
    };
    let service = AnalyzerService::configured(
        fixture.repository.clone(),
        fixture.directory.join("cache"),
        limits,
        None,
    );
    for number in 1..=50 {
        assert_eq!(
            value(service.prepare(fixture.request()))["value"]["jobId"],
            format!("analysis-{number}")
        );
    }
    assert_eq!(
        value(service.cancel(json!({"jobId":"analysis-1"})))["stopped"],
        true
    );
    assert_eq!(
        value(service.release(json!({"jobId":"analysis-51"})))["code"],
        "invalid-job"
    );
    assert_eq!(
        value(service.release(json!({"jobId":"analysis-18446744073709551616"})))["code"],
        "invalid-job"
    );
    assert_eq!(
        value(service.release(json!({"jobId":"analysis-0"})))["code"],
        "invalid-job"
    );
    service.shutdown().unwrap();
}

#[test]
fn a_clean_finished_job_does_not_block_the_next_request_after_a_lost_reply() {
    let fixture = Fixture::new(WRITE_REPORT);
    let service = fixture.service();
    service.prepare(fixture.request());
    assert_eq!(
        value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())))["status"],
        "completed"
    );
    assert_eq!(
        value(service.prepare(fixture.request()))["value"]["jobId"],
        "analysis-2"
    );
    assert_eq!(
        value(service.release(json!({"jobId":"analysis-1"})))["released"],
        true
    );
    assert_eq!(
        value(service.run(json!({"jobId":"analysis-2"}), |_| Ok(())))["status"],
        "completed"
    );
    service.release(json!({"jobId":"analysis-2"}));
}

#[test]
fn real_dependency_cruiser_18_7_2_runs_through_the_native_service() {
    let checkout = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_owned();
    let repository = RepositoryService::default();
    let session =
        value(repository.open(json!({"rootPath":checkout})))["value"]["repositorySession"]
            .as_str()
            .unwrap()
            .to_owned();
    let cache = std::env::temp_dir().join(format!("choom-real-analyzer-{}", std::process::id()));
    let service = AnalyzerService::new(repository.clone(), cache.clone());
    assert_eq!(value(service.prepare(json!({"repositorySession":session,"config":".dependency-cruiser.cjs","inputs":["src/domain/baseline.ts"]})))["status"], "success");
    let outcome = value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())));
    assert_eq!(outcome["status"], "completed", "{outcome}");
    assert_eq!(outcome["version"], "18.7.2");
    let report: Value = serde_json::from_str(outcome["reportJson"].as_str().unwrap()).unwrap();
    assert!(
        report["modules"]
            .as_array()
            .unwrap()
            .iter()
            .any(|module| module["source"] == "src/domain/baseline.ts")
    );
    assert!(report["summary"]["error"].as_u64().is_some());
    assert_eq!(fs::read_dir(&cache).unwrap().count(), 0);
    service.release(json!({"jobId":"analysis-1"}));
    repository.close(json!({"repositorySession":session}));
    fs::remove_dir_all(cache).unwrap();
}

#[test]
fn progress_reports_stages_and_elapsed_time_and_failed_delivery_still_cleans_up() {
    let fixture = Fixture::new(WRITE_REPORT);
    let service = fixture.service();
    service.prepare(fixture.request());
    let mut events = Vec::new();
    let result = value(service.run(json!({"jobId":"analysis-1"}), |progress| {
        events.push(value(progress));
        Ok(())
    }));
    assert_eq!(result["status"], "completed");
    assert_eq!(
        events
            .iter()
            .map(|event| event["stage"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["setup", "analysis", "cleanup"]
    );
    assert!(
        events
            .windows(2)
            .all(|pair| pair[0]["elapsedMs"].as_u64() <= pair[1]["elapsedMs"].as_u64())
    );
    service.release(json!({"jobId":"analysis-1"}));
    service.prepare(fixture.request());
    let result = value(service.run(json!({"jobId":"analysis-2"}), |progress| {
        if matches!(progress.stage, model::Stage::Analysis) {
            Err(())
        } else {
            Ok(())
        }
    }));
    assert_eq!(result["code"], "execution-failed");
    assert_eq!(
        fs::read_dir(fixture.directory.join("cache"))
            .unwrap()
            .count(),
        0
    );
    assert_eq!(
        value(service.release(json!({"jobId":"analysis-2"})))["released"],
        true
    );
}

#[test]
fn a_moved_report_directory_retains_cleanup_ownership_until_restored() {
    // Windows cannot rename a directory while it contains an open report file.
    // Move that file aside first, keeping both native identity handles alive.
    let fixture = Fixture::new(
        "import fs from 'node:fs';import path from 'node:path';const report=process.argv[process.argv.indexOf('--output-to')+1];const directory=path.dirname(report);const parked=directory+'-report.json';fs.renameSync(report,parked);fs.renameSync(directory,directory+'-moved');fs.renameSync(parked,path.join(directory+'-moved','report.json'));",
    );
    let service = fixture.service();
    service.prepare(fixture.request());
    let outcome = value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())));
    let retry = value(service.prepare(fixture.request()));
    let release = value(service.release(json!({"jobId":"analysis-1"})));
    assert_eq!(outcome["code"], "cleanup-failed", "{outcome}");
    assert_eq!(retry["code"], "busy");
    assert_eq!(release["code"], "cleanup-failed");
    let moved = fs::read_dir(fixture.directory.join("cache"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let restored = PathBuf::from(moved.to_str().unwrap().strip_suffix("-moved").unwrap());
    let parked = moved.with_extension("report.json");
    fs::rename(moved.join("report.json"), &parked).unwrap();
    fs::rename(&moved, &restored).unwrap();
    fs::rename(&parked, restored.join("report.json")).unwrap();
    assert_eq!(
        value(service.release(json!({"jobId":"analysis-1"})))["released"],
        true
    );
    assert_eq!(
        fs::read_dir(fixture.directory.join("cache"))
            .unwrap()
            .count(),
        0
    );
}

#[test]
fn repeated_report_cleanup_does_not_remove_a_new_directory_at_the_old_path() {
    let fixture = Fixture::new(WRITE_REPORT);
    let mut report = files::Report::reserve(
        &fixture.directory.join("cache"),
        &fs::canonicalize(&fixture.root).unwrap(),
    )
    .unwrap();
    report.initialize().unwrap();
    let directory = report.path.parent().unwrap().to_owned();
    report.cleanup().unwrap();
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join("new-owner.txt"), "keep").unwrap();
    report.cleanup().unwrap();
    assert_eq!(
        fs::read_to_string(directory.join("new-owner.txt")).unwrap(),
        "keep"
    );
}

#[cfg(unix)]
#[test]
fn package_and_entry_links_must_stay_in_the_selected_repository() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new(WRITE_REPORT);
    let package = fixture.root.join("node_modules/dependency-cruiser");
    let store = fixture.root.join("node_modules/.store");
    fs::create_dir(&store).unwrap();
    fs::rename(&package, store.join("dependency-cruiser")).unwrap();
    symlink(".store/dependency-cruiser", &package).unwrap();
    assert_eq!(fixture.run()["status"], "completed");
    fs::remove_file(&package).unwrap();
    let outside = fixture.directory.join("outside-analyzer");
    fs::rename(store.join("dependency-cruiser"), &outside).unwrap();
    symlink(&outside, &package).unwrap();
    assert_eq!(fixture.run()["code"], "unsupported-analyzer");
    fs::remove_file(&package).unwrap();
    fs::rename(&outside, &package).unwrap();
    let entry = package.join("bin/dependency-cruiser.mjs");
    fs::rename(&entry, fixture.directory.join("outside-entry.mjs")).unwrap();
    symlink(fixture.directory.join("outside-entry.mjs"), &entry).unwrap();
    assert_eq!(fixture.run()["code"], "unsupported-analyzer");
}

#[cfg(unix)]
#[test]
fn replacing_the_report_with_a_symlink_never_reads_the_target() {
    let fixture = Fixture::new(
        "import fs from 'node:fs';const output=process.argv[process.argv.indexOf('--output-to')+1];fs.unlinkSync(output);fs.symlinkSync(process.cwd()+'/private.json',output);",
    );
    fs::write(
        fixture.root.join("private.json"),
        r#"{"secret":"never read"}"#,
    )
    .unwrap();
    let outcome = fixture.run();
    assert_eq!(outcome["code"], "report-invalid");
    assert!(!outcome.to_string().contains("never read"));
    assert_eq!(
        fs::read_to_string(fixture.root.join("private.json")).unwrap(),
        r#"{"secret":"never read"}"#
    );
}

#[cfg(unix)]
#[test]
fn cleanup_failures_keep_the_slot_until_the_owned_report_can_be_removed() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = Fixture::new(
        "import fs from 'node:fs';import path from 'node:path';const output=process.argv[process.argv.indexOf('--output-to')+1];fs.writeFileSync(output,'{}');fs.chmodSync(path.dirname(output),0);",
    );
    let service = fixture.service();
    service.prepare(fixture.request());
    let outcome = value(service.run(json!({"jobId":"analysis-1"}), |_| Ok(())));
    let retry = value(service.prepare(fixture.request()));
    let release = value(service.release(json!({"jobId":"analysis-1"})));
    let directory = fs::read_dir(fixture.directory.join("cache"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(outcome["code"], "cleanup-failed", "{outcome}");
    assert_eq!(retry["code"], "busy");
    assert_eq!(release["code"], "cleanup-failed");
    assert_eq!(
        value(service.release(json!({"jobId":"analysis-1"})))["released"],
        true
    );
    assert_eq!(
        fs::read_dir(fixture.directory.join("cache"))
            .unwrap()
            .count(),
        0
    );
}

#[cfg(unix)]
#[test]
fn report_reservation_survives_file_creation_and_cleanup_failure() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = Fixture::new(WRITE_REPORT);
    let mut report = files::Report::reserve(
        &fixture.directory.join("cache"),
        &fs::canonicalize(&fixture.root).unwrap(),
    )
    .unwrap();
    let directory = report.path.parent().unwrap().to_owned();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o000)).unwrap();
    let initialized = report.initialize();
    let cleaned = report.cleanup();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
    assert!(initialized.is_err());
    assert_eq!(cleaned.unwrap_err().code, model::Code::CleanupFailed);
    report.cleanup().unwrap();
    assert!(!directory.exists());
}

#[test]
fn normal_completion_cancel_and_shutdown_stop_descendants_with_ignored_pipes() {
    #[cfg(windows)]
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    #[cfg(windows)]
    use windows::Win32::{
        Foundation::{HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT},
        System::Threading::{OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject},
    };

    let rounds = if cfg!(windows) { 10 } else { 1 };
    for mode in ["completed", "cancelled", "shutdown"]
        .into_iter()
        .cycle()
        .take(rounds * 3)
    {
        let child = "const fs=require('node:fs');fs.writeFileSync('child-pid',String(process.pid));fs.writeFileSync('child-ready','yes');setInterval(()=>{},1000);";
        let finish = if mode == "completed" {
            "fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], '{}');process.exit(0);"
        } else {
            "fs.writeFileSync('started','yes');"
        };
        let script = format!(
            "import fs from 'node:fs';import {{spawn}} from 'node:child_process';spawn(process.execPath,['-e',{}],{{stdio:'ignore'}}).unref();setInterval(()=>{{if(fs.existsSync('observation-ready')){{{finish}}}}},10);",
            serde_json::to_string(child).unwrap()
        );
        let fixture = Fixture::new(&script);
        let service = fixture.service();
        service.prepare(fixture.request());
        let worker = service.clone();
        let running =
            thread::spawn(move || value(worker.run(json!({"jobId":"analysis-1"}), |_| Ok(()))));
        wait_for(&fixture.root.join("child-ready"));
        let pid: i32 = fs::read_to_string(fixture.root.join("child-pid"))
            .unwrap()
            .parse()
            .unwrap();
        #[cfg(windows)]
        let descendant = {
            let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid as u32) }
                .expect("the descendant must be live before analysis can finish");
            // Keep this process object alive so its PID cannot identify another process.
            let owned = unsafe { OwnedHandle::from_raw_handle(handle.0) };
            assert_eq!(unsafe { WaitForSingleObject(handle, 0) }, WAIT_TIMEOUT);
            owned
        };
        fs::write(fixture.root.join("observation-ready"), "yes").unwrap();
        if mode != "completed" {
            wait_for(&fixture.root.join("started"));
            if mode == "shutdown" {
                service.shutdown().unwrap();
            } else {
                assert_eq!(
                    value(service.cancel(json!({"jobId":"analysis-1"})))["stopped"],
                    true
                );
            }
        }
        let outcome = running.join().unwrap();
        assert_eq!(
            outcome["status"],
            if mode == "completed" {
                "completed"
            } else {
                "cancelled"
            },
            "{outcome}"
        );
        #[cfg(target_os = "linux")]
        let alive = std::fs::read_to_string(format!("/proc/{pid}/stat")).is_ok_and(|stat| {
            stat.rsplit_once(')').is_some_and(|(_, fields)| {
                !matches!(fields.split_whitespace().next(), Some("Z" | "X"))
            })
        });
        #[cfg(all(unix, not(target_os = "linux")))]
        let alive = unsafe { libc::kill(pid, 0) } == 0;
        #[cfg(windows)]
        let alive =
            unsafe { WaitForSingleObject(HANDLE(descendant.as_raw_handle()), 0) } != WAIT_OBJECT_0;
        assert!(!alive, "descendant is still live after {mode}");
        assert_eq!(
            fs::read_dir(fixture.directory.join("cache"))
                .unwrap()
                .count(),
            0
        );
        service.release(json!({"jobId":"analysis-1"}));
    }
}
