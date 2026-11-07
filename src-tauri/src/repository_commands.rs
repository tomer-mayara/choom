use crate::repository::{
    ClosedRepository, RepositoryOutcome, RepositoryPaths, RepositoryService, RepositorySession,
    RepositoryText,
};
use serde_json::Value;
use tauri::Manager;

#[tauri::command]
pub(crate) async fn repository_open<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> RepositoryOutcome<RepositorySession> {
    let service = app.state::<RepositoryService>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.open(request))
        .await
        .unwrap_or_else(|_| RepositoryOutcome::worker_failed())
}

#[tauri::command]
pub(crate) async fn repository_read_text<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> RepositoryOutcome<RepositoryText> {
    let service = app.state::<RepositoryService>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.read_text(request))
        .await
        .unwrap_or_else(|_| RepositoryOutcome::worker_failed())
}

#[tauri::command]
pub(crate) async fn repository_resolve_paths<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> RepositoryOutcome<RepositoryPaths> {
    let service = app.state::<RepositoryService>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.resolve_paths(request))
        .await
        .unwrap_or_else(|_| RepositoryOutcome::worker_failed())
}

#[tauri::command]
pub(crate) async fn repository_close<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> RepositoryOutcome<ClosedRepository> {
    let service = app.state::<RepositoryService>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.close(request))
        .await
        .unwrap_or_else(|_| RepositoryOutcome::worker_failed())
}
