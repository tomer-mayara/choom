pub mod repository;
mod repository_commands;
#[cfg(test)]
mod repository_ipc_tests;

fn context<R: tauri::Runtime>() -> tauri::Context<R> {
    tauri::generate_context!()
}

fn builder<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(repository::RepositoryService::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            repository_commands::repository_open,
            repository_commands::repository_read_text,
            repository_commands::repository_resolve_paths,
            repository_commands::repository_close,
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    builder(tauri::Builder::default())
        .run(context())
        .expect("error while running Choom");
}
