fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "repository_open",
            "repository_read_text",
            "repository_resolve_paths",
            "repository_close",
            "depcruiser_prepare",
            "depcruiser_run",
            "depcruiser_cancel",
            "depcruiser_release",
        ]),
    ))
    .expect("failed to build Choom's command permissions");
}
