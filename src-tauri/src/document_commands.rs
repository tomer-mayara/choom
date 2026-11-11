use crate::documents::{self, Outcome, Stage, Text};
use serde_json::Value;

#[tauri::command]
pub(crate) async fn document_file_read(request: Value) -> Outcome<Text> {
    tauri::async_runtime::spawn_blocking(move || documents::read_file(request))
        .await
        .unwrap_or_else(|_| Outcome::worker_failed(Stage::Storage))
}
