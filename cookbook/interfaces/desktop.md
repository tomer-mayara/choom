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
the dialog plugin and repository commands, and starts the generated application
context. Repository filesystem work runs on Tauri's blocking pool.

[`tauri.conf.json`](../../src-tauri/tauri.conf.json) declares the `main` window,
frontend build path, and content security policy.
[`capabilities/main.json`](../../src-tauri/capabilities/main.json) grants
`core:default`, `dialog:allow-open`, and the four repository command permissions
to the local main window. The frontend supplies the
directory-only options; the capability grants the plugin's open operation. It
grants no general filesystem plugin operation. The application command manifest
in [`build.rs`](../../src-tauri/build.rs) puts these commands under Tauri's ACL;
other windows and remote origins cannot invoke them.
[`Cargo.toml`](../../src-tauri/Cargo.toml) pins native dependencies. Cargo and
Tauri check these declarations; dependency-cruiser analyzes TypeScript only.

[`desktop.feature`](../behavior/desktop.feature) exercises the real adapter and
dialog package through Tauri's official IPC mock. Run it with
`bun run test:behavior --tags @desktop-adapter`. Browser App checks use a Tauri
IPC double. Neither launches Rust or an operating system dialog. The
[evidence table and remaining work](../TODO.md) record native and production
prerequisites in one place.

## Repository access

[`DesktopRepositoryAccess`](../../src/platform/repository.ts) implements the
TypeSpec `RepositoryOperations` interface with promises. All commands take one
`request` argument. Each result is either `{ status: "success", value }` or
`{ status: "failure", code, message }`.

| Operation | Native command | Result value |
| --- | --- | --- |
| `openRepository` | `repository_open` | Opaque repository session |
| `readRepositoryText` | `repository_read_text` | Canonical relative file path and UTF-8 text |
| `resolveRepositoryPaths` | `repository_resolve_paths` | Ordered inside paths or opaque outside references |
| `closeRepository` | `repository_close` | `closed: true` |

Open accepts an existing absolute directory path and canonicalizes symlink
roots. A session keeps that root fixed. It is an identifier, not an authorization
token. Close is idempotent for a syntactically valid ID; further reads/resolves
fail with `invalid-session`. The native registry permits at most 16 open
sessions and serializes operations with close.

Read accepts a relative path and never returns text from an outside symlink.
It returns a canonical repository-relative path, with `/` separators and `.`
for the root. A text result is at most 262144 UTF-8 bytes. The native reader
checks file identity/metadata and the resolved path around the read, and reports
detected changes as `source-changed`. This is not a transactional filesystem
snapshot or a sandbox for concurrent hostile filesystem changes.

Resolve accepts a canonical relative base directory and 1–128 paths. Inputs
can be relative to that base or native absolute paths. Each path must exist as
a file or directory. Native path inputs are at most 4096 UTF-8 bytes and contain
no control characters. Inside results contain a canonical path and file kind.
Outside results contain only an opaque reference; the same canonical outside
path gets the same reference within the session. The session permits at most
4096 distinct outside references. Closing it discards the reference map.
The discovery owner applies its stricter literal relative manifest syntax before
calling resolve; the resolver can also classify later analyzer report paths.

Rust validates request fields and bounds. The frontend validates request and
result fields, bounds, path forms, and batch result counts. Both reject unknown
fields. Browser calls return `unavailable` without IPC. Invalid frontend input
returns `invalid-request`, an invalid reply returns `invalid-response`, and a
transport rejection returns `unavailable`. Native failures use the TypeSpec
codes and do not include absolute host paths. Failure messages are local UI
information, not telemetry labels.

[`repository-native.json`](../../test/fixtures/repository-native.json) connects
the Rust serialization checks to the generated-schema and frontend-validator
checks. Rust runs these cases through the production handlers and capability
context under Tauri's MockRuntime, with real temporary files. Separate Rust
tests cover canonical paths, symlinks, read consistency, and resource limits.
These checks do not launch an installed webview. Packaged import acceptance
still needs the later UI workflow.
