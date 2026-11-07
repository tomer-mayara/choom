# CR-001-T08 release verification and constraint review

Date: 2026-11-07. Base: `d37fea59fdc4db4179dd4593ef312c2337871ffc`, the merged
[T07 PR](https://github.com/tomer-mayara/choom/pull/10). Candidate branch:
`codex/cr-001-t08`. Verification is in progress; this is not release approval.

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
the final Windows candidate still needs execution.

## Four-constraint review

| Constraint | Candidate review |
| --- | --- |
| Behavioral | T08 Gherkin and real installed bindings cover the added cases. The plan contains the same scenarios. Existing replacement and cleanup tests retain their assertions; none are skipped. |
| Observability | Stages, safe error messages, cancellation, and cleanup outcomes are locally observable. The shared OpenSLO Service stays `unmeasured`: no collector, production baseline, SLI, SLO, or alert is introduced. See [remaining evidence](../../cookbook/TODO.md). |
| Architecture | Reviewed dependency-cruiser rules, Cargo dependencies, command registration, main-window capabilities, and packaging. Neutral injection and render-only boundaries remain enforced. No dependency, capability, or architecture-rule change is needed. |
| Interface | TypeSpec sources, generated outputs, manifest links, wire schemas, and implementation conformance remain the contract. The Windows correction restores existing replacement behavior without changing an operation shape. Runtime guidance now distinguishes an API Node-path override from the UI's PATH discovery. |

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
| Complete `bun run check` | Passed: lint, unit and DOM tests, native Cucumber, TypeSpec and interface conformance, cookbook links, dependency boundaries, unused code, and duplicates. |
| Complete browser Cucumber | Passed against a fresh production build and the separate controlled layout entry. |
| Habit Hooks | Passed; the snooze file remains empty. |
| Final ordinary native builds and installed runs | In progress. |
| Final Windows execution | Pending. |

The local macOS host uses Bun 1.4.3, Node 24.20.0, and Rust 1.99.1. Bun and Node
differ from the repository pins. Linux verification and hosted CI use pinned
Bun 1.4.4 and Node 26.13.0. Record final artifacts and hashes after rebuilding
from this candidate.

## Platform scope and outstanding evidence

| Route | What the evidence establishes | Remaining work |
| --- | --- | --- |
| Browser and simulated desktop | Controller, real conversion/codec/layout/renderer, saved files, and validated transport doubles; controlled layout failures use a separate test entry. | Does not establish native execution or installed layout failure. |
| Linux installed operations | Real native repository, analyzer, and document commands through the installed webview and capability boundary. | Final T08 candidate rerun pending. |
| Linux installed UI | Ordinary release package, native dialogs, declared ownership across subdirectories, source-free viewers, and added failure/recovery cases. | Final T08 candidate run pending; controlled X11 launch does not prove desktop-entry PATH, Wayland, or portals. |
| macOS installed UI | T07's earlier ordinary package proves loading, export, picker cancellation, and reopening without the source repository. | Final T08 package and added fault cases pending; picker cancellation is not analyzer cancellation. |
| Windows | T07 CI reached native behavior and exposed two document failures; its analyzer/process cases passed. | Execute the corrected candidate, then retain ordinary installed UI and file-dialog evidence. |

Installed save-dialog write failures and ordinary-release layout faults remain
unverified unless an explicit result below closes them. Native command tests
and injected browser faults are separate evidence. Signing, notarization, and
distribution approval are also separate from these test packages.

Manager review and human constraint approval are required before any authorized
merge. The review must use the complete candidate and the current check results.
