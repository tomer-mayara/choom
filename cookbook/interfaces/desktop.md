# Desktop boundary

The [host adapter](../../src/platform/desktop.ts) exposes `isDesktop`, bound to
Tauri host detection. The [file picker](../../src/platform/document-dialogs.ts)
opens one YAML file with the title **Open Baseline**, `directory: false`, and
`multiple: false`. Cancellation returns `null`; rejection or malformed results
produce a safe picker error. In a browser it makes no native dialog call.
The native dialog contract is retained in [document-dialogs.tsp](document-dialogs.tsp)
until BV-07 removes unused native-facing declarations.

The [workspace](workspace.md) chooses the browser or desktop file reader. The
[desktop reader](../../src/platform/documents.ts) exposes only `readDocumentFile`
and validates both request and response. It does not expose repository,
analyzer, snapshot, export, or cleanup operations to the viewer. See the
[file contract](documents.md) for bounds and safe failures.

## Native host pending BV-07

The [Rust entrypoint](../../src-tauri/src/lib.rs) still registers the former
repository, analyzer, and document commands. Their [TypeSpec data](desktop.tsp),
[analyzer contract](desktop-analyzer.tsp), and [file contract](desktop-documents.tsp)
remain unchanged in BV-03. Rust tests retain their current coverage. These
commands and permissions are retired in BV-07; their presence does not mean the
baseline viewer invokes them.

The [application configuration](../../src-tauri/tauri.conf.json),
[capability](../../src-tauri/capabilities/main.json), and
[command manifest](../../src-tauri/build.rs) define the local main-window access.
[Cargo dependencies](../../src-tauri/Cargo.toml) and Tauri check the native host;
TypeScript dependency checks cover the frontend only.

[Installed baseline scenarios](../behavior/baseline-viewer/installed.feature)
exercise a real installed webview and native picker. They are separate from
frontend interface tests using Tauri's IPC mock. See the
[native acceptance instructions](../../docs/change-requests/BV-native-acceptance.md)
for prerequisites and scope.
