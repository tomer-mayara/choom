use crate::documents::{
    Cleaned, Created, DocumentStorage, Exported, Outcome, Released, Stage, Text,
};
use serde_json::Value;
use tauri::Manager;

async fn execute<R: tauri::Runtime, T: Send + 'static>(
    app: tauri::AppHandle<R>,
    stage: Stage,
    operation: impl FnOnce(DocumentStorage) -> Outcome<T> + Send + 'static,
) -> Outcome<T> {
    let storage = app.state::<DocumentStorage>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || operation(storage))
        .await
        .unwrap_or_else(|_| Outcome::worker_failed(stage))
}

#[tauri::command]
pub(crate) async fn document_snapshot_create<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> Outcome<Created> {
    execute(app, Stage::Storage, move |storage| {
        storage.create_snapshot(request)
    })
    .await
}
#[tauri::command]
pub(crate) async fn document_snapshot_read<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> Outcome<Text> {
    execute(app, Stage::Storage, move |storage| {
        storage.read_snapshot(request)
    })
    .await
}
#[tauri::command]
pub(crate) async fn document_snapshot_release<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> Outcome<Released> {
    execute(app, Stage::Cleanup, move |storage| {
        storage.release_snapshot(request)
    })
    .await
}
#[tauri::command]
pub(crate) async fn document_file_read<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> Outcome<Text> {
    execute(app, Stage::Storage, move |storage| {
        storage.read_file(request)
    })
    .await
}
#[tauri::command]
pub(crate) async fn document_export<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> Outcome<Exported> {
    execute(app, Stage::Export, move |storage| storage.export(request)).await
}
#[tauri::command]
pub(crate) async fn document_cleanup<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> Outcome<Cleaned> {
    execute(app, Stage::Cleanup, move |storage| {
        storage.retry_cleanup(request)
    })
    .await
}
