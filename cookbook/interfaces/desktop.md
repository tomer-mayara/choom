# Desktop boundary

The Choom-owned operations are defined in [TypeSpec](desktop.tsp). The
[TypeScript adapter](../../src/platform/desktop.ts) implements them:

```ts
isDesktop(): boolean
selectProjectDirectory(): Promise<string | null>
```

The generated declarations describe the operation parameters and results.
Conformance checks connect them to the adapter. Promise scheduling, cancellation,
and rejection behavior remain implementation requirements, described below and
checked through the public boundary. The TypeSpec source does not redefine the
third-party dialog protocol.

`isDesktop` returns Tauri's host detection result. In a browser,
`selectProjectDirectory` resolves to `null` without calling the dialog plugin.
In Tauri, it calls the plugin once with `directory: true`, `multiple: false`,
and the title `Choose a project directory`. It returns one path or `null` on
cancellation. Plugin rejection reaches the caller unchanged. The adapter does
not validate, read, import, or persist the path, retry, or prevent concurrent
calls. The [workspace contract](workspace.md#desktop-view) defines the UI's
selection state and error handling.

## Native host

The Rust entrypoint calls [`choom_lib::run`](../../src-tauri/src/lib.rs), registers
the dialog plugin, and starts the generated application context. There are no
application-defined IPC commands or events.

[`tauri.conf.json`](../../src-tauri/tauri.conf.json) declares the `main` window,
frontend build path, and content security policy.
[`capabilities/main.json`](../../src-tauri/capabilities/main.json) grants
`core:default` and `dialog:allow-open` to that window. The frontend supplies the
directory-only options; the capability grants the plugin's open operation. It
grants no Choom project-import or filesystem-read operation.
[`Cargo.toml`](../../src-tauri/Cargo.toml) pins native dependencies. Cargo and
Tauri check these declarations; dependency-cruiser analyzes TypeScript only.

[`desktop.feature`](../behavior/desktop.feature) exercises the real adapter and
dialog package through Tauri's official IPC mock. Run it with
`bun run test:behavior --tags @desktop-adapter`. Browser App checks use a Tauri
IPC double. Neither launches Rust or an operating system dialog. The
[evidence table and remaining work](../TODO.md) record native and production
prerequisites in one place.
