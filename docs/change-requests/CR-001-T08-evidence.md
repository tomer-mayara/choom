# CR-001-T08 release verification and constraint review

Date: 2026-11-07. Base: `d37fea59fdc4db4179dd4593ef312c2337871ffc`, the merged
[T07 PR](https://github.com/tomer-mayara/choom/pull/10). Candidate branch:
`codex/cr-001-t08`. The first verification candidate is `54ab22c`. Verification
is in progress; this is not release approval.

## Changes and behavioral evidence

The installed Linux specification now has 11 scenarios. It retains analysis,
export, exact declared components, both deep file pairs, and denied access.
Additional cases cover missing Node, running analyzer cancellation and cleanup,
another load after cancellation, analyzer failure, actual Retry, invalid UTF-8,
and an unsupported document schema. A fresh native viewer opens an export after
the source repository and local analyzer are removed. Its actual process PATH
must name an empty owned directory. The browser consumer has no native analyzer
boundary. These checks establish tool unavailability to the viewer, not removal
of the harness machine's Node installation.

The existing browser Retry binding previously selected the repository again.
It now presses Retry and asserts that no picker response is queued. The focused
missing-manifest recovery scenario passes through that control.

[T07's Windows CI job](https://github.com/tomer-mayara/choom/actions/runs/42400771774)
failed two existing document tests: replacing an open destination and moving a
directory containing open files. This is the production red evidence. The
export implementation now uses `std::fs::rename` for consented Windows
replacement, preserving the held identity handles. The no-clobber path is
unchanged. The restoration test moves held files aside during directory
relocation, then restores them; it retains the identity mismatch, preservation,
retry, and cleanup assertions on every platform.

The [pinned Rust implementation](https://github.com/rust-lang/rust/blob/1.99.1/library/std/src/sys/fs/windows.rs#L1248-L1311)
provides the open-destination replacement fallback. Microsoft's
[rename restrictions](https://learn.microsoft.com/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information#remarks)
explain the original directory-test setup failure. Source inspection and
macOS test results do not establish that the correction works on Windows;
the correction needs Windows execution. Candidate `54ab22c` passed both affected
tests in [Windows CI](https://github.com/tomer-mayara/choom/actions/runs/42402373166):
44 unit and 14 integration tests, formatting, Clippy, and the desktop build.

That candidate's web CI found a separate export timing problem. A normal
in-flight snapshot release was reported as failed cleanup when export began
before it completed. The export then left a retry-cleanup gate in the workspace.
The retained repeated-observation assertion also exported before its reload had
settled, which could inspect the previous diagram. That assertion helper now
waits for the requested load and cleanup to finish. Intentional concurrent-export
cases still exercise overlap.

`DocumentFiles` now retains active release promises separately from unresolved
release IDs. Concurrent requests for one ID share its release. Preparation and
export capture bytes before waiting, then admit an operation in the same turn as
the final release check. The checks also apply after destination selection and
replacement consent. Failed or unconfirmed cleanup still blocks writes.

The new document API Gherkin failed before the correction. Eight focused unit
cases cover captured bytes, cancellation before encoding, in-flight release at
each export prompt, another release starting during a wait, shared release
ownership, and genuine failure recovery. All 31 document unit tests and all 19
document API scenarios pass. These are deterministic boundary checks, distinct
from installed UI evidence. Logs are `/tmp/choom-t08-document-export-bdd-red.log`,
`/tmp/choom-t08-document-concurrency-red.log`,
`/tmp/choom-t08-document-preabort-red.log`,
`/tmp/choom-t08-document-unit-green.log`, and
`/tmp/choom-t08-document-api-green.log`.

## Four-constraint review

| Constraint | Candidate review |
| --- | --- |
| Behavioral | T08 Gherkin and real installed bindings cover the added cases. A document API scenario and deferred unit cases cover export during normal release. The plan contains those scenarios. Existing replacement and cleanup tests retain their assertions; none are skipped. |
| Observability | Stages, safe error messages, cancellation, and cleanup outcomes are locally observable. The shared OpenSLO Service stays `unmeasured`: no collector, production baseline, SLI, SLO, or alert is introduced. See [remaining evidence](../../cookbook/TODO.md). |
| Architecture | Reviewed dependency-cruiser rules, Cargo dependencies, command registration, main-window capabilities, and packaging. Neutral injection and render-only boundaries remain enforced. No dependency, capability, or architecture-rule change is needed. |
| Interface | TypeSpec sources, generated outputs, manifest links, wire schemas, and implementation conformance remain the contract. Both corrections restore existing lifecycle behavior without changing an operation shape. Document boundary notes distinguish active release from failed cleanup. Runtime guidance distinguishes an API Node-path override from the UI's PATH discovery. |

CI now retains the Linux installer, installer and installed-executable hashes,
and source commit with its existing acceptance reports. The two external drivers
and their distinct product environments are recorded with each run. Neither
driver changes the application or replaces native IPC.

## Validation record

| Check | Result |
| --- | --- |
| Focused browser Retry | Passed: 1 scenario / 9 steps with a fresh frontend build. |
| Packaged specification binding check | Passed: 11 scenarios / 90 steps resolve. A dry run does not prove behavior. |
| TypeScript and changed-file lint | Passed after the driver and binding changes. |
| Rust behavior on macOS | Passed: 49 unit and 16 integration tests after the correction. |
| Rust formatting and Clippy | Passed, including all targets with warnings denied. |
| Complete `bun run check` | Passed after the export correction: 335 native unit tests, 16 DOM tests, 157 Cucumber scenarios / 722 steps, and 84 interface tests; lint, TypeSpec, cookbook links, dependency boundaries, unused code, and duplicates also pass. |
| Complete browser Cucumber | Passed against a fresh production build and the separate controlled layout entry. |
| Habit Hooks | Passed; the snooze file remains empty. |
| Candidate `54ab22c` Linux installed | Passed: 19 scenarios / 143 steps across picker, analyzer, document, and T08 UI suites. |
| Candidate `54ab22c` macOS installed | Passed: real analysis/export, denied access, malformed files, analyzer failure/Retry, running child cancellation/cleanup, another load, missing Node, and source-free reopening. |
| Candidate `54ab22c` hosted CI | Linux, macOS, and Windows desktop jobs passed. Web failed the repeated-export timing case described above. |
| Corrected export candidate | In progress; requires fresh frontend and ordinary native packages. |

The local macOS host uses Bun 1.4.3, Node 24.20.0, and Rust 1.99.1. Bun and Node
differ from the repository pins. Linux verification and hosted CI use pinned
Bun 1.4.4 and Node 26.13.0.

## First candidate artifact identity

The production source manifest for `54ab22c` is
`e7d46d3514e061330be940ba7ffee8f52699bec58c472513494b3c9fa10cf92c`.
Both ordinary builds used this manifest. The Windows-only Rust correction leaves
the Linux/macOS executable bytes equal to T07, but each package was freshly built
and verified against its actual installation.

| Artifact | SHA-256 |
| --- | --- |
| Linux arm64 `.deb` | `29c50eb3db662ff4337c6161df72934eb59f7667a3330d0e67fec61b2a573a27` |
| Installed Linux executable | `457d8a5e3bbdcb8463b3d4464f421abc535e897c582186eed35390da059edb38` |
| macOS arm64 DMG | `9a408c89880bd50d9d2b825c5024d0f0f476659b1a225e4b64ee39a2f1d8896f` |
| Installed macOS executable | `121a3b9f23fdb6f3091aa87439990b4fa67e7ecabecb39f97319d8091fae09ee` |
| Actual macOS UI export | `5b1ff1d77e7e5f66f7055df5bba237618271c12201c7a87853f72f32dcdcce1d` |

Linux records are under `/tmp/choom-t08-linux-evidence/candidate-1-54ab22c`;
the four passing runs are `run-i2KzTw`, `run-BnQ8S0`, `run-vGrfhR`, and
`run-pk87QF`. The build label includes the earlier base `d37fea5`; the separately
recorded actual source commit is `54ab22c`, and all manifests and binary hashes
match. macOS records are under `/tmp/choom-t08-macos-evidence`, including process
PATH observations, actual process IDs before cancellation, cleanup checks, UI
observations, exported YAML, and package identity. Native UI state and screenshots
were observed through the computer-use transcript.

The macOS package is ad hoc linker-signed, with no Team ID or notarization. The
Linux package is an unsigned test artifact. These are candidate-specific test
results; the export correction requires new artifact identities.

## Platform scope and outstanding evidence

| Route | What the evidence establishes | Remaining work |
| --- | --- | --- |
| Browser and simulated desktop | Controller, real conversion/codec/layout/renderer, saved files, and validated transport doubles; controlled layout failures use a separate test entry. | Does not establish native execution or installed layout failure. |
| Linux installed operations | Real native repository, analyzer, and document commands through the installed webview and capability boundary. | Export-correction candidate rerun pending. |
| Linux installed UI | Ordinary release package, native dialogs, declared ownership across subdirectories, source-free viewers, and added failure/recovery cases. | Export-correction candidate rerun pending; controlled X11 launch does not prove desktop-entry PATH, Wayland, or portals. |
| macOS installed UI | Candidate `54ab22c` passes the actual actions listed above, including analyzer child cleanup and a fresh viewer with no discoverable Node. | Export-correction package rerun pending; controlled runtime launch does not prove Finder PATH discovery. |
| Windows | Candidate `54ab22c` passes native behavior, including both corrected document tests, and the desktop build. | Ordinary installed UI and file-dialog evidence remains unavailable on this Mac host. |

Installed save-dialog write failures and ordinary-release layout faults remain
unverified unless an explicit result below closes them. Native command tests
and injected browser faults are separate evidence. Signing, notarization, and
distribution approval are also separate from these test packages.

Manager review and human constraint approval are required before any authorized
merge. The review must use the complete candidate and the current check results.
