use serde_json::{Value, json};
use tauri::{
    Manager, WebviewWindow, WebviewWindowBuilder,
    ipc::{CallbackFn, InvokeBody},
    test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder},
    webview::InvokeRequest,
};

const LOCAL_ORIGIN: &str = if cfg!(windows) {
    "http://tauri.localhost"
} else {
    "tauri://localhost"
};

#[allow(deprecated)]
fn application() -> tauri::App<MockRuntime> {
    let mut app = super::builder(mock_builder())
        .build(super::context())
        .unwrap();
    app.run_iteration(|_, _| {});
    app
}

fn invoke(
    webview: &WebviewWindow<MockRuntime>,
    command: &str,
    request: Value,
    url: &str,
) -> Result<Value, Value> {
    get_ipc_response(
        webview,
        InvokeRequest {
            cmd: command.to_owned(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: url.parse().unwrap(),
            body: InvokeBody::Json(json!({"request":request})),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_owned(),
        },
    )
    .map(|body| body.deserialize::<Value>().unwrap())
}

#[test]
fn document_commands_match_the_shared_typescript_wire_fixture() {
    let directory =
        std::env::temp_dir().join(format!("choom-documents-ipc-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&directory).unwrap();
    let app = application();
    let main = app.get_webview_window("main").unwrap();
    let fixtures: Vec<Value> =
        serde_json::from_str(include_str!("../../test/fixtures/document-native.json")).unwrap();
    std::fs::write(directory.join("baseline.yaml"), "title: Atlas\n").unwrap();
    for case in fixtures {
        assert_eq!(case["operation"], "readDocumentFile");
        let mut request = case["request"].clone();
        if request["path"] == "/choom-fixture/baseline.yaml" {
            request["path"] = json!(directory.join("baseline.yaml"));
        }
        let mut response = invoke(&main, "document_file_read", request, LOCAL_ORIGIN).unwrap();
        assert!(response["durationMs"].is_u64());
        response["durationMs"] = json!(0);
        assert_eq!(response, case["outcome"]);
    }
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn document_read_identifies_the_original_bytes_through_ipc() {
    let directory =
        std::env::temp_dir().join(format!("choom-byte-identity-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&directory).unwrap();
    let app = application();
    let main = app.get_webview_window("main").unwrap();
    let fixtures: Vec<Value> = serde_json::from_str(include_str!(
        "../../test/fixtures/baseline-viewer/document-byte-identity.json"
    ))
    .unwrap();
    let path = directory.join("baseline.yaml");
    for case in fixtures {
        let text = case["text"].as_str().unwrap();
        std::fs::write(&path, text.as_bytes()).unwrap();
        let outcome = invoke(
            &main,
            "document_file_read",
            json!({"path":path}),
            LOCAL_ORIGIN,
        );
        std::fs::remove_file(&path).unwrap();
        let outcome = outcome.unwrap();
        assert_eq!(outcome["status"], "success");
        assert_eq!(outcome["text"], text);
        assert_eq!(outcome["sha256"], case["sha256"]);
    }
    std::fs::remove_dir(&directory).unwrap();
}

#[test]
fn document_commands_allow_only_the_local_main_window() {
    let app = application();
    let main = app.get_webview_window("main").unwrap();
    let other = WebviewWindowBuilder::new(&app, "other", Default::default())
        .build()
        .unwrap();
    let command = "document_file_read";
    assert!(invoke(&other, command, json!({}), LOCAL_ORIGIN).is_err());
    assert!(invoke(&main, command, json!({}), "https://example.com").is_err());
    assert_eq!(
        invoke(&main, command, json!({"unexpected":true}), LOCAL_ORIGIN).unwrap()["code"],
        "invalid-request"
    );
}

#[test]
fn retired_native_commands_are_rejected_before_a_handler_runs() {
    let app = application();
    let main = app.get_webview_window("main").unwrap();
    let mut registered = Vec::new();
    for command in [
        "repository_open",
        "repository_read_text",
        "repository_resolve_paths",
        "repository_close",
        "depcruiser_prepare",
        "depcruiser_run",
        "depcruiser_cancel",
        "depcruiser_release",
        "document_snapshot_create",
        "document_snapshot_read",
        "document_snapshot_release",
        "document_export",
        "document_cleanup",
    ] {
        match invoke(
            &main,
            command,
            json!({"retirementProbe":true}),
            LOCAL_ORIGIN,
        ) {
            Ok(response) => registered.push((command, response)),
            Err(error) => {
                let message = error.as_str().expect("The host rejects with a message");
                assert!(
                    message.contains("not allowed")
                        || message == format!("Command {command} not found"),
                    "{command}: {message}"
                );
            }
        }
    }
    assert!(
        registered.is_empty(),
        "Retired commands still reached their handlers: {registered:?}"
    );
}
