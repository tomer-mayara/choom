use serde_json::{Value, json};
use std::fs;
use tauri::{
    Manager, WebviewWindow, WebviewWindowBuilder,
    ipc::{CallbackFn, InvokeBody},
    test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder},
    webview::InvokeRequest,
};

// Tauri serves embedded assets through an HTTP origin on Windows.
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
    // One iteration runs the production setup hook and creates its configured main window.
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
fn analyzer_commands_match_the_shared_typescript_wire_fixture() {
    let directory = std::env::temp_dir().join(format!("choom-analyzer-ipc-{}", std::process::id()));
    fs::create_dir_all(directory.join("src")).unwrap();
    fs::create_dir_all(directory.join("node_modules/dependency-cruiser/bin")).unwrap();
    fs::write(
        directory.join(".dependency-cruiser.cjs"),
        "module.exports = {};\n",
    )
    .unwrap();
    fs::write(directory.join("src/index.js"), "export const value = 1;\n").unwrap();
    fs::write(directory.join("node_modules/dependency-cruiser/package.json"), serde_json::to_vec(&json!({"name":"dependency-cruiser","version":"18.7.2","engines":{"node":"^22||^24||>=26"},"bin":{"dependency-cruiser":"bin/dependency-cruiser.mjs"}})).unwrap()).unwrap();
    fs::write(directory.join("node_modules/dependency-cruiser/bin/dependency-cruiser.mjs"), "import fs from 'node:fs';fs.writeFileSync(process.argv[process.argv.indexOf('--output-to')+1], '{}');").unwrap();
    let app = application();
    let main = app.get_webview_window("main").unwrap();
    assert_eq!(
        invoke(
            &main,
            "repository_open",
            json!({"rootPath":directory}),
            LOCAL_ORIGIN
        )
        .unwrap()["status"],
        "success"
    );
    let fixtures: Vec<Value> =
        serde_json::from_str(include_str!("../../test/fixtures/analyzer-native.json")).unwrap();
    for case in fixtures {
        let command = match case["operation"].as_str().unwrap() {
            "prepareDepCruiser" => "depcruiser_prepare",
            "runDepCruiser" => "depcruiser_run",
            "cancelDepCruiser" => "depcruiser_cancel",
            "releaseDepCruiser" => "depcruiser_release",
            operation => panic!("Unknown operation: {operation}"),
        };
        let mut response = invoke(&main, command, case["request"].clone(), LOCAL_ORIGIN).unwrap();
        if response.get("durationMs").is_some() {
            assert!(response["durationMs"].is_u64());
            response["durationMs"] = json!(0);
        }
        if response.get("completedAtMs").is_some() {
            assert!(response["completedAtMs"].as_u64().unwrap() > 0);
            response["completedAtMs"] = json!(0);
        }
        assert_eq!(response, case["outcome"], "{command}");
    }
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn analyzer_commands_allow_only_the_local_main_window() {
    let app = application();
    let main = app.get_webview_window("main").unwrap();
    let other = WebviewWindowBuilder::new(&app, "other", Default::default())
        .build()
        .unwrap();
    for command in [
        "depcruiser_prepare",
        "depcruiser_run",
        "depcruiser_cancel",
        "depcruiser_release",
    ] {
        assert!(invoke(&other, command, json!({}), LOCAL_ORIGIN).is_err());
        assert!(invoke(&main, command, json!({}), "https://example.com").is_err());
        assert_eq!(
            invoke(&main, command, json!({}), LOCAL_ORIGIN).unwrap()["code"],
            "invalid-request"
        );
    }
}
