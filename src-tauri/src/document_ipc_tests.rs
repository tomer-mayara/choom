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
    let normalized_id = "document-00000000-0000-4000-8000-000000000000-1";
    let mut actual_id = Value::Null;
    for case in fixtures {
        let command = match case["operation"].as_str().unwrap() {
            "createDocumentSnapshot" => "document_snapshot_create",
            "readDocumentSnapshot" => "document_snapshot_read",
            "releaseDocumentSnapshot" => "document_snapshot_release",
            "readDocumentFile" => "document_file_read",
            "exportDocument" => "document_export",
            "retryDocumentCleanup" => "document_cleanup",
            operation => panic!("Unknown operation: {operation}"),
        };
        let mut request = case["request"].clone();
        if request["snapshotId"] == normalized_id {
            request["snapshotId"] = actual_id.clone();
        }
        if request["path"] == "/choom-fixture/export.choom.yaml" {
            request["path"] = json!(directory.join("export.choom.yaml"));
        }
        let mut response = invoke(&main, command, request, LOCAL_ORIGIN).unwrap();
        assert!(response["durationMs"].is_u64());
        response["durationMs"] = json!(0);
        if response.get("snapshotId").is_some() {
            let id = response["snapshotId"].as_str().unwrap();
            let nonce = id
                .strip_prefix("document-")
                .unwrap()
                .strip_suffix("-1")
                .unwrap();
            assert_eq!(uuid::Uuid::parse_str(nonce).unwrap().get_version_num(), 4);
            actual_id = response["snapshotId"].clone();
            response["snapshotId"] = json!(normalized_id);
        }
        assert_eq!(response, case["outcome"], "{command}");
    }
    app.state::<crate::documents::DocumentStorage>()
        .shutdown()
        .unwrap();
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn document_commands_allow_only_the_local_main_window() {
    let app = application();
    let main = app.get_webview_window("main").unwrap();
    let other = WebviewWindowBuilder::new(&app, "other", Default::default())
        .build()
        .unwrap();
    for command in [
        "document_snapshot_create",
        "document_snapshot_read",
        "document_snapshot_release",
        "document_file_read",
        "document_export",
        "document_cleanup",
    ] {
        assert!(invoke(&other, command, json!({}), LOCAL_ORIGIN).is_err());
        assert!(invoke(&main, command, json!({}), "https://example.com").is_err());
        assert_eq!(
            invoke(&main, command, json!({"unexpected":true}), LOCAL_ORIGIN).unwrap()["code"],
            "invalid-request"
        );
    }
    app.state::<crate::documents::DocumentStorage>()
        .shutdown()
        .unwrap();
}
