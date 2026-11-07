# CR-001-T06: Portable YAML and document storage

Implementation evidence for
[CR-001-T06](CR-001-architecture-import.md#cr-001-t06--persist-candidates-and-export-portable-yaml).
Work started from merged T05 commit `aaf0372` on `codex/cr-001-t06`.
Implementation and applicable local verification are complete. T07 owns file selection, the export UI, layout, and
replacement of the displayed diagram.

## Result and ownership

The shared codec converts the existing semantic model to portable YAML and back.
It preserves declared components, full file-pair evidence across subdirectories,
reported-file counts, and diagnostic roles. It performs no source lookup,
analyzer execution, or layout. A saved file needs no source repository.

`DocumentFiles` encodes a candidate, creates a native snapshot, rereads its bytes,
and decodes them before returning ownership. Cancellation and failure release
the candidate first. Export captures encoded bytes before waiting for a
destination, so later changes to the caller's document do not affect that file.

`DocumentStorage` owns at most two snapshots per application session. OS locks
protect active cache sessions. Startup and retry remove only recognized inactive
cache files; unknown files, symlinks, and replaced identities are preserved.
Cleanup failure retains ownership and blocks further writes until retry succeeds.
Selected-file reads remain available. Export uses a temporary file in the
destination directory and atomic promotion, with explicit replacement consent.

See the [document contract](../../cookbook/interfaces/documents.md) for format
limits, ownership, cleanup, and export guarantees.

## Four constraints

| Constraint | Change and evidence |
| --- | --- |
| Behavioral | Added [public document scenarios](../../cookbook/behavior/architecture-import/t06-api.feature) before production implementation. Separate [installed scenarios](../../cookbook/behavior/architecture-import/t06-installed.feature) cover real analysis, export/reopen, replacement consent, and snapshot capacity through native IPC. |
| Observability | Encoding, decoding, storage, export, and cleanup outcomes include duration. Error messages omit host paths and raw parser or I/O output. The shared OpenSLO remains unmeasured. |
| Architecture | A named dependency rule isolates the codec from platform, UI, and analyzer implementations. Workspace code owns document coordination; the platform exposes six product-specific native operations restricted to the local main window. |
| Interface / contract | Added [documents.tsp](../../cookbook/interfaces/documents.tsp) and [desktop-documents.tsp](../../cookbook/interfaces/desktop-documents.tsp), generated declarations/schemas, exact TypeScript conformance, and shared native wire cases. Closed empty requests generate `Record<string, never>`. |

## Behavior-first development and review

The initial API Cucumber run failed with 16 undefined scenarios before the
implementation. Codec, platform, and workspace tests then failed at absent
implementations. Three compiled native tests first failed against unavailable
storage operations; the IPC check initially reported missing commands. Two
later cleanup-retry scenarios and focused unit cases reproduced loss of an
unconfirmed snapshot release before the recovery fix.
Definitive invalid-ID rejections do not enter the pending-cleanup set; transport
or other uncertain release failures retain their IDs for retry.

Review also reproduced large allocations from malformed YAML containing many
flow separators or invalid scalar escapes. A bounded lexical preflight now runs
before syntax-tree construction, and scalar validation stops at the first
error. Regression tests assert outcomes rather than process memory readings.
Native regressions cover replaced files and leases, inactive/active sessions,
cleanup failure and retry, a destination created before atomic promotion, and
bounded regular UTF-8 reads. Review added real rename-only, unlink, and
replacement-file regressions. Cleanup now distinguishes a moved owned file from
an unlinked one, and live shutdown never adopts replacement files at old names.

## Verification

| Check | Result |
| --- | --- |
| Codec unit/interface cases | 26 passed, including malformed YAML resource limits and multi-directory component round trips. |
| `bun run check` | Passed: 276 native unit tests, one DOM test, 125 Cucumber scenarios / 487 steps, and 77 interface tests. TypeSpec output checks, lint, component links, dependency rules, unused-code checks, and duplication checks also pass. |
| Focused document workflow and platform checks | 32 unit/interface tests / 251 assertions and 18 API scenarios / 94 steps passed. |
| `bun run check-types` and `bun run build` | Passed. The existing deferred ELK chunk-size warning remains. |
| Native Rust suite | 65 passed: 49 unit/IPC and 16 repository integration tests. The document subset has 16 filesystem and IPC tests. |
| Native formatting and Clippy | Passed on macOS with the lockfile and all targets. |
| Windows cross-compilation | The document implementation and tests passed isolated Windows cross-Clippy. This does not prove Windows execution. |
| Ordinary macOS packaging | `bun run desktop:build` passed after the final ownership fixes. Artifact identity is recorded below; this is build evidence, not a native UI journey. |
| Retained browser and original T06 UI cases | Four retained scenarios passed. All 11 original T06 browser cases still fail at absent Load Repo/Open Diagram controls, which T07 must supply. They remain registered and were not weakened. |
| Installed scenario bindings | All four T06 scenarios / 23 steps bind in dry run. |
| Linux installed release | Passed picker smoke (one scenario / six steps), T05 analyzer operations (three / 24), and T06 document operations (four / 23) against the same installed executable. |
| `bun run habit-hooks --all` | Passed without findings. The snooze file remains empty. |
| Review and text checks | Independent source review and manager review completed with no remaining actionable findings. Artifact links and `git diff --check` pass. |

Local checks use macOS 27.0.1 arm64, Rust 1.99.1, Bun 1.4.3, and Node 24.20.0.
Bun and Node differ from the repository pins, which are used in the separate
Linux installed run. Windows cross-Clippy covers the production document module
and its tests; it does not execute them or build the complete Windows installer.

## Release artifacts

The ordinary macOS version 0.1.0 build uses a linker ad-hoc signature without a
TeamIdentifier. It is not release signing or notarization evidence.

- App executable SHA-256: `d3cc2a40a96365c4232a7e5faebe2794f2426da44712ebbf8b1c3312666945eb`.
- DMG SHA-256: `aa0dd2d767e701307f00748a0402c144e7f1ad97b29fa8b20d7a3a4327729da5`.

The separate Linux run uses Debian arm64, pinned Bun 1.4.4, Node 26.13.0, Rust
1.99.1, and dependency-cruiser 18.7.2. It installs the ordinary release `.deb`
outside the checkout as `/usr/bin/choom-desktop` and runs as an unprivileged user.

- Package SHA-256: `de295667bd3bfc61058f8aed115711c14e551ee194d49619bfce679c04eb6a83`.
- Installed executable SHA-256: `170bb0d5e36e787fa81a7f828bf576a186d01215a651cf2041df4b2f5cbe8910`.

All eight installed scenarios passed. The document composition runs in the test
process and crosses real IPC in the installed webview; no test frontend or
production fault-injection command is added. The complete UI remains separate.

The installed document route verifies analysis of one component owning two
source directories, export, removal of the repository, source-free reopen,
unchanged file evidence, and candidate release. Other cases verify refusal to
replace an existing export without consent, the two-snapshot limit, and
candidate replacement without deleting the current snapshot.

Local logs are `/tmp/choom-t06-check-final.log`,
`/tmp/choom-t06-build-final.log`, `/tmp/choom-t06-habit-final.log`,
`/tmp/choom-t06-browser-scope.log`, and `/tmp/choom-t06-native-*.log`.
The Linux package, source/harness hashes, and failed and passing run evidence
are retained in `/tmp/choom-t06-linux-evidence`. Passing run IDs are `TrhY4E`
(picker), `BDZv9t` (analyzer), and `UEhL0Y` (documents).

## Remaining scope

The original browser T06 scenarios still require T07's Open Diagram and export
controls. API and installed-operation evidence does not claim those UI journeys.
No presentation schema or durable current-document pointer was added.

Startup cleanup covers only the application cache. Export temporary files left
in arbitrary destination directories by a crash are not rediscovered. There is
no persistent export journal, search through user directories, power-loss
durability guarantee, or coordination with unrelated file writers. Target
platform execution and the complete UI journey remain separate evidence.
