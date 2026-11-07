# CR-001-T03: Manifest metadata and repository discovery

Implementation and review evidence for
[CR-001-T03](CR-001-architecture-import.md#cr-001-t03--add-manifest-metadata-and-repository-discovery).
Work started from merged T02 commit `464cdc6` on `codex/cr-001-t03`.

## Result and ownership

[`RepositoryDiscovery`](../../src/architecture/repository-discovery.ts) follows
only the selected root's declared manifest tree. A declared component can own
several source directories. Inputs and unlinked manifests create no components.
Canonical directory IDs determine ownership; declared parents remain independent
of directory nesting. Discovery selects one explicitly annotated root analyzer
and returns its canonical configuration and inputs without executing it.

The workspace owns manifest interpretation and the bounded YAML reader.
[`DesktopRepositoryAccess`](../../src/platform/repository.ts) validates the
request/result boundary. The native `RepositoryService` owns canonical roots,
bounded text reads, path classification, and session lifetime. The service and
commands are in [`src-tauri/src`](../../src-tauri/src/repository.rs).
Filesystem work runs on the blocking pool. Tauri's application command manifest
and capability restrict the four commands to the local main window.

A successful discovery transfers its open repository session to the caller.
Failures release it and report cleanup failures when release cannot complete.
The caller must close successful sessions after the later import operation.
Outside paths are represented by stable, opaque session-local references and
cannot be read through the text operation. These IDs are not authorization
tokens. Filesystem checks detect common source changes; they do not provide a
transactional snapshot or sandbox concurrent hostile filesystem mutations.

See the [discovery contract](../../cookbook/interfaces/discovery.md) and
[desktop contract](../../cookbook/interfaces/desktop.md#repository-access) for
all limits and reference semantics. The existing `yaml` version moved from a
development dependency to a production dependency. No package version changed.

## Four constraints

| Constraint | Change and evidence |
| --- | --- |
| Behavioral | Added [22 public API scenarios](../../cookbook/behavior/architecture-import/t03-api.feature) before implementation. They exercise discovery through a repository transport double. Existing UI Gherkin stays registered and unchanged. Native filesystem and command tests verify the boundary that the double cannot establish. |
| Observability | Discovery outcomes contain the stage, stable failure code, safe message, and nonnegative duration. OpenSLO is unchanged: there is no collection route, measured baseline, or agreed timing objective. |
| Architecture | Existing dependency-cruiser rules allow workspace-to-domain/platform dependencies and keep platform independent of workspace. No rule change was needed. Native AppManifest command declarations, generated permissions, and the main-window capability changed. A dev-only Tauri test feature supports real handler/ACL checks; native crate versions are unchanged. |
| Interface / contract | Added [discovery.tsp](../../cookbook/interfaces/discovery.tsp) and repository operations in [desktop.tsp](../../cookbook/interfaces/desktop.tsp), then regenerated types and schemas. New DTOs are closed. The generator supports explicit references between registered owners. Runtime conformance covers manifests, results, both transport boundaries, and Rust serialization through shared wire cases. |

The root manifest now declares `dependency-cruiser` with input `src`. Linking
guidance and cookbook validation accept architecture-only analyzer metadata.
Tooling retains Choom's stricter artifact inventory and legacy path-only roots;
imported repositories do not inherit those CI requirements. Child metadata does
not select additional jobs. Its artifact paths are checked, while unused child
analyzer inputs are not resolved.

## Behavior-first development and review

The initial new Cucumber run failed with undefined steps before production
implementation. Focused workspace, platform, and Rust tests then failed at the
missing public implementations. Bound steps now call the real discovery API.
Additional focused red/green cases caught trailing YAML documents, invalid
session IDs that could throw during parsing, request byte limits, blank input
classification, and the YAML depth boundary.

Independent review found two tooling path mismatches: root-manifest symlink
inputs used the selected root as their base, and lexical normalization of `..`
could remove a symlink traversal before canonicalization. The checker now uses
the canonical declaring manifest's directory and resolves path segments in
filesystem order. Manual cases cover both failures, missing/file intermediate
segments, and outside traversal that finishes inside the root.

Review also found that an alias could produce a canonical analyzer path with
glob or leading-option syntax. Discovery and tooling now recheck selected
canonical configuration and input paths. Four regression cases failed before
the fix and pass after it. Ordinary component and artifact targets retain their
broader canonical path format.
The final independent review found no remaining actionable code findings.

## Verification

Run on macOS arm64 with Bun 1.4.3, Node 24.20.0, and Rust 1.99.1. Bun and Node
are below this repository's pins (1.4.4 and 26.13.0); the pinned CI environment
still needs to confirm these results.

| Check | Result |
| --- | --- |
| T03 native Cucumber | 22 scenarios and 70 steps pass. |
| Workspace discovery/parser tests | 59 unit tests and 11 interface tests pass, including boundary fixtures for per-text/total bytes, declaration count, YAML nodes/depth/aliases, and manifest lists. |
| Platform repository boundary | 8 unit tests and 5 interface tests pass, including malformed requests/replies and shared native wire cases. |
| Native behavior | 20 Rust tests pass: 16 filesystem/service, 2 read-consistency, and 2 registered-handler/ACL cases. Unix symlink cases ran on this Mac. |
| Rust formatting and Clippy | Pass with the locked dependencies and warnings denied. |
| Tooling operations | 37 manual metadata/path cases pass; cookbook validation and generated-output consistency pass. No tooling behavior tests were added. |
| Complete frontend candidate | `bun run check` passes: lint, 150 native unit tests, 1 DOM unit test, 56 native Cucumber scenarios, cookbook validation, contract generation/type checks, 61 interface tests, dependencies, unused-code checks, and duplication checks. `bun run check-types` also passes through the build. |
| Build and hygiene | Frontend build and `bun run habit-hooks --all` pass after review fixes. The snooze file is empty. Vite retains the existing large example-chunk warning. |
| Retained browser acceptance | 4 scenarios and 51 steps pass against the production build. |
| Desktop packaging | macOS release executable, `Choom.app`, and arm64 DMG build successfully. |
| Packaged manual smoke | Fresh release bundle launches. Native directory selection displays the chosen path; cancellation preserves it. The example renders three nodes and both directed edges. |
| Original T03 browser acceptance | All 17 scenarios fail at the missing Load Repo action; no undefined or ambiguous steps. They require the later import UI workflow. |

The shared [wire fixture](../../test/fixtures/repository-native.json) is verified
by actual production command handlers under Tauri MockRuntime using real files.
TypeScript checks the same values against TypeSpec schemas and frontend
validators. MockRuntime verifies command dispatch and ACL decisions; it does
not establish installed-webview IPC behavior for the new operations.

## Remaining limits

T04–T07 still own dependency-cruiser conversion/execution, saved documents, and
the Load Repo UI. The new repository commands have no UI caller yet, so packaged
import acceptance remains open. Linux/Windows native execution and installed
acceptance were not run on this Mac. No Tauri process, file-write operation,
analysis job, or imported diagram rendering was added in T03.

Resource caps have boundary fixtures but no measured large-repository workload
baseline. Production telemetry and OpenSLO evidence remain absent. Human review
of the changed constraint artifacts is required before merge.
