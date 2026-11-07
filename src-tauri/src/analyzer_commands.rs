use crate::analyzer::{
    AnalyzerService, ExecutionOutcome, Outcome, Prepared, Progress, Released, Stopped,
};
use serde_json::Value;
use tauri::{
    Manager,
    ipc::{Channel, JavaScriptChannelId},
};

#[tauri::command]
pub(crate) async fn depcruiser_prepare<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> Outcome<Prepared> {
    let service = app.state::<AnalyzerService>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.prepare(request))
        .await
        .unwrap_or_else(|_| Outcome::worker_failed())
}

#[tauri::command]
pub(crate) async fn depcruiser_run<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    webview: tauri::Webview<R>,
    request: Value,
    on_progress: Option<JavaScriptChannelId>,
) -> ExecutionOutcome {
    let service = app.state::<AnalyzerService>().inner().clone();
    let on_progress: Option<Channel<Progress>> =
        on_progress.map(|channel| channel.channel_on(webview));
    tauri::async_runtime::spawn_blocking(move || {
        service.run(request, |progress| {
            on_progress
                .as_ref()
                .map_or(Ok(()), |channel| channel.send(progress).map_err(|_| ()))
        })
    })
    .await
    .unwrap_or_else(|_| ExecutionOutcome::worker_failed())
}

#[tauri::command]
pub(crate) async fn depcruiser_cancel<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> Outcome<Stopped> {
    let service = app.state::<AnalyzerService>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.cancel(request))
        .await
        .unwrap_or_else(|_| Outcome::worker_failed())
}

#[tauri::command]
pub(crate) async fn depcruiser_release<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: Value,
) -> Outcome<Released> {
    let service = app.state::<AnalyzerService>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.release(request))
        .await
        .unwrap_or_else(|_| Outcome::worker_failed())
}
