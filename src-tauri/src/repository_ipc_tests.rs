use serde_json::{Value, json};
use std::fs;
use tauri::{
    WebviewWindow, WebviewWindowBuilder,
    ipc::{CallbackFn, InvokeBody},
    test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder},
    webview::InvokeRequest,
};

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
            body: InvokeBody::Json(json!({ "request": request })),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_owned(),
        },
    )
    .map(|body| body.deserialize::<Value>().unwrap())
}

#[test]
fn native_command_outputs_match_the_shared_typescript_wire_fixture() {
    let directory = std::env::temp_dir().join(format!("choom-ipc-{}", std::process::id()));
    let root = directory.join("repo");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(directory.join("outside")).unwrap();
    fs::write(root.join("component.yaml"), "name: atlas\n").unwrap();
    fs::write(directory.join("outside/private.txt"), "private").unwrap();
    let app = super::builder(mock_builder())
        .build(super::context())
        .unwrap();
    let main = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let fixture: Vec<Value> =
        serde_json::from_str(include_str!("../../test/fixtures/repository-native.json")).unwrap();

    for case in fixture {
        let mut request = case["request"].clone();
        let command = match case["operation"].as_str().unwrap() {
            "openRepository" => {
                request["rootPath"] = json!(root);
                "repository_open"
            }
            "readRepositoryText" => "repository_read_text",
            "resolveRepositoryPaths" => "repository_resolve_paths",
            "closeRepository" => "repository_close",
            operation => panic!("Unknown repository operation: {operation}"),
        };
        let response = invoke(&main, command, request, "tauri://localhost").unwrap();
        assert_eq!(response, case["outcome"], "{command}");
    }
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn repository_commands_reject_other_windows_and_remote_origins() {
    let app = super::builder(mock_builder())
        .build(super::context())
        .unwrap();
    let main = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let other = WebviewWindowBuilder::new(&app, "other", Default::default())
        .build()
        .unwrap();

    for command in [
        "repository_open",
        "repository_read_text",
        "repository_resolve_paths",
        "repository_close",
    ] {
        assert!(invoke(&other, command, json!({}), "tauri://localhost").is_err());
        assert!(invoke(&main, command, json!({}), "https://example.com").is_err());
        assert_eq!(
            invoke(&main, command, json!({}), "tauri://localhost").unwrap()["code"],
            "invalid-request"
        );
    }
}
