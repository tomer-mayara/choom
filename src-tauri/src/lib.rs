pub mod analyzer;
mod analyzer_commands;
#[cfg(test)]
mod analyzer_ipc_tests;
mod document_commands;
#[cfg(test)]
mod document_ipc_tests;
pub mod documents;
pub mod repository;
mod repository_commands;
#[cfg(test)]
mod repository_ipc_tests;

use tauri::Manager;

fn context<R: tauri::Runtime>() -> tauri::Context<R> {
    tauri::generate_context!()
}

fn builder<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    let repository = repository::RepositoryService::default();
    builder
        .manage(repository.clone())
        .setup(move |app| {
            let cache = app.path().app_cache_dir()?;
            app.manage(analyzer::AnalyzerService::new(
                repository,
                cache.join("analyzer"),
            ));
            app.manage(documents::DocumentStorage::new(cache.join("documents/v1")));
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            repository_commands::repository_open,
            repository_commands::repository_read_text,
            repository_commands::repository_resolve_paths,
            repository_commands::repository_close,
            analyzer_commands::depcruiser_prepare,
            analyzer_commands::depcruiser_run,
            analyzer_commands::depcruiser_cancel,
            analyzer_commands::depcruiser_release,
            document_commands::document_snapshot_create,
            document_commands::document_snapshot_read,
            document_commands::document_snapshot_release,
            document_commands::document_file_read,
            document_commands::document_export,
            document_commands::document_cleanup,
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = builder(tauri::Builder::default())
        .build(context())
        .expect("error while building Choom");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let analyzer = app.state::<analyzer::AnalyzerService>().shutdown();
            let documents = app.state::<documents::DocumentStorage>().shutdown();
            for result in [analyzer, documents] {
                if let Err(message) = result {
                    eprintln!("{message}");
                    api.prevent_exit();
                }
            }
        }
    });
}
