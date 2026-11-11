# Baseline viewer verification

This record tracks the seven tickets in the [baseline viewer plan](../design/cr-baseline-viewer-plan.md).
The stack is work in progress. Passing a contract, build, or lint check does not
establish browser or installed-app behavior.

## Environment

- Host: macOS on ARM64.
- Development tools: Bun 1.4.4, Node.js 26.13.0, and Rust 1.99.1.
- Dependencies were installed with `bun install --frozen-lockfile`; Chromium is installed.
- Before production changes, `bun run test:rust` passed 49 module/IPC tests and
  16 repository integration tests.
- Linux installed-app checks require the real packaged app, WebKit driver,
  Xvfb, D-Bus, and native file-picker controls. Browser doubles and Tauri's mock
  runtime are separate evidence.
- A task-owned Ubuntu 24.04 ARM64 container provides the Linux checks. Its first
  ordinary release package was built from BV-01 commit `df8537e`. The installed
  executable matched the package, and the real file-picker smoke test passed.

## Ticket results

Each ticket starts with a runnable failing acceptance test. Focused TDD tests
then drive the implementation. Unchanged behavior starts with passing
characterization tests.

| Ticket | First acceptance failure | Current result |
| --- | --- | --- |
| BV-01 | `bun run test:behavior --tags @bv-01`: 10 scenarios failed real assertions. The old document validator rejected baseline fields and could not identify invalid baseline fields. | 10 scenarios and 96 focused unit/interface tests pass. Reviewed and complete. |
| BV-02 | `bun run test:behavior:native --tags @bv-02`: 3 scenarios failed and 4 existing input protections passed. Baselines were rejected, future versions were misclassified, and legacy diagrams were accepted. | 7 scenarios pass; reviewed and complete. |
| BV-03 | The normal browser and installed desktop app both loaded, then their Open Baseline assertions failed because the control was absent. | Browser, core, host, and ordinary installed Linux acceptance pass. Reviewed and complete. |
| BV-04 | Not run yet. | Pending. |
| BV-05 | Not run yet. | Pending. |
| BV-06 | Not run yet. | Pending. |
| BV-07 | Not run yet. | Pending. |

## BV-01

The first unit step failed 4 shape tests. Later steps failed 11 reference tests,
21 selector/rule-value tests, and 5 tests for non-data rule properties before
each correction. The final focused run passes 88 unit tests and 8 interface tests.
Both copied YAML fixtures are byte-identical to the reviewed source files.

Independent review found rule data that Zod discarded or could not copy safely.
The final validator preserves reserved own keys, rejects non-data properties
without evaluating getters, and returns a validation issue if copying fails.
The reviewer rechecked the original cases and closed the finding.

Completed checks:

- `bun run check`: 432 native unit tests, 25 DOM tests, 168 Cucumber scenarios,
  and 93 interface tests passed. Contract generation, types, lint, dependency,
  unused-code, and duplicate-code checks passed.
- `bun run build`: passed, with the existing large-chunk warning.
- `bun run habit-hooks --all`: passed; the snooze file is empty.
- Document links, fixture copies, and `git diff --check`: passed.

Local logs are in `reports/baseline-viewer/bv-01/`. This ticket verifies the model
contract; it does not yet verify opening or rendering a baseline in the app.

PR #18 CI passed on the web, macOS, Ubuntu, and Windows. The first Windows run
failed an unchanged analyzer job-accounting test. A rerun passed all jobs.

## BV-02

The focused input tests first failed 6 of 19 cases through the old codec. The
strict YAML and browser reader characterizations stayed green. A later review
required an explicit legacy-format message; its unit and acceptance assertions
failed before the correction. The dependency probe also failed before the
existing codec boundary was extended to the new decoder.

Completed checks:

- `bun run test:behavior:native --tags @bv-02`: 7 scenarios and 21 steps passed.
- The baseline codec, legacy parser, and codec interface run passed 51 tests.
  Selected-file contract tests passed 12 cases; browser reads passed 5 cases.
- `bun run check`: 452 native unit tests, 25 DOM tests, 175 Cucumber scenarios,
  and 95 interface tests passed, together with the contract, type, lint,
  dependency, unused-code, and duplicate-code checks.
- `bun run test:rust`: all 65 tests passed. No native production code changed.
- `bun run build` and `bun run habit-hooks --all`: passed. The build retains the
  existing large-chunk warning; the snooze file remains empty.
- Independent review closed its legacy-message finding. `git diff --check` passed.

Local logs are in `reports/baseline-viewer/bv-02/`. App opening is still a later
ticket; passing the decoder does not establish the assembled app route.

PR #19 CI passed on all four jobs after rerunning the same unchanged Windows
analyzer test failure noted for BV-01. That analyzer is removed in BV-07.

## BV-03

The browser acceptance test ran against the normal production build. It failed
one scenario at the Open Baseline assertion, with four steps passed. The report
is `test-results/bv-03-browser-red.json`.

Before the workflow changed, 29 existing workflow, cancellation, and view
ownership tests passed with 152 assertions. The expanded browser acceptance
then failed five scenarios at the missing Open Baseline control, with 21 steps
passed. A focused baseline load test also failed: the old workflow rejected the
baseline as a legacy document.

Review found an inherited observer loop: an observer that removed and added its
subscription during notification could prevent the load from finishing. A new
public-workflow scenario failed with 20 notifications instead of one. The
workflow now takes a fixed list of listeners for each update; that scenario and
its focused regression test pass.

Review also found that an unreadable browser file lost useful recovery guidance.
The focused test failed before the browser reader returned a safe `io-error`
message that asks the user to use Open Baseline and select the file again. The
five browser reader tests then passed with 14 assertions. Independent boundary
probes confirmed native read limits, strict UTF-8, content-based format selection,
safe errors, and Retry without another native picker. The new composition calls
only dialog open and `document_file_read`; native IPC contracts remain unchanged
until BV-07.

The installed acceptance test used the ordinary BV-01 Linux release built from
`df8537ee578b70c3261005e87523b015f60081c7`. Only three new test files were copied
into its test checkout. The product remained unchanged. The native window,
installed executable, independent working directory, and empty runtime PATH
checks passed. The scenario then failed because Open Baseline was absent:
one scenario failed, two steps passed, one failed, and three were skipped.

Recorded SHA-256 identities:

- Release package: `eaf234c9725617d6dcad8979b4caece59dd1f1fa9618e7ce36badf9c1e116ff2`.
- Installed executable: `c01955a1a2933f88bfff62dd2a875f2f4b80aca2394d3ef6c547bd134f5e49f9`.
- Test-only overlay: `97fc01378b0baa36ecda24b5af94d43567f90cc0abea829a727e6f885ccf3b84`.

The Linux cache retains the installed report under
`work/choom/test-results/packaged/run-c7vv8U/` and the separate harness manifest
under `work/evidence/bv03-acceptance-overlay-red.json`. The runner recorded a
scenario failure, not a setup failure.

The completed installed harness adds real picker cancellation and malformed or
legacy input checks. All four scenarios failed at the absent Open Baseline
control on the same frozen product, with eight steps passed. Its report is
`work/choom/test-results/packaged/run-G65FbM/`; the test overlay SHA-256 is
`30dd2c582bd7e68a7be1815347c22c26aba56418847191c3168842ac7134f145`.

The simplified runner was also checked for failure classification. An unsupported
host and a selection with no matching scenarios each return setup failure with
exit 2. The CI package-extraction check ran against the actual release package
and matched the installed executable hash.

Completed candidate checks:

- `bun run check`: 146 native unit tests, 16 DOM tests, 18 native Cucumber
  scenarios with 57 steps, and 19 interface tests passed. Contract generation,
  types, lint, component links, unused-code, and duplicate-code checks passed.
- The built browser suite passed 19 scenarios and 122 steps. Its six BV-03 cases
  cover normal opening, empty input, legacy input, read failure and Retry,
  cancellation and late completion, and layout failure. Existing canvas,
  keyboard, focus, resizing, and starter behavior also passed.
- Ten decoder stress characterizations were retained from the retired codec.
  They cover lexical limits, extreme depth, separator floods, scalar escapes,
  and line breaks. All 30 focused baseline decoder tests passed.
- Dependency checks passed 25 allowed and 38 forbidden import probes plus the
  complete source scan. Product code cannot import the development analyzers.
  Workflow and prepared-view code cannot import the layout engine at runtime.
- `bun run test:rust`: all 65 tests passed. One existing analyzer test named a
  deleted frontend module; its input was changed to the current baseline module.
  Native production behavior and native IPC contracts did not change.
- `bun run desktop:lint`: Cargo formatting and Clippy passed.
- `bun run habit-hooks --all`: passed; the snooze file is empty.
- All 363 local Markdown links passed. Historical source links were checked
  against their saved Git revisions. Whitespace checks passed.

Independent reviews covered workflow lifetime and immutable publication,
file-input boundaries, dependency rules, and current and historical documents.
The manager closed the reported findings. Local check logs are in
`reports/baseline-viewer/bv-03/`.

The ordinary Linux ARM64 release from commit
`96498ab9090079384b13f4b61a32eba64b27358e` passed all four installed scenarios
and 34 steps in 16.949 seconds. The app used its real native picker and read
command with an empty runtime PATH. Cancellation completed and enabled another
open. Invalid files preserved the prior view, and selected bytes were unchanged.

Green-run SHA-256 identities:

- Source archive: `708456c54ea9309bb7b48fe35e14a503f78aaabc128bc27c8bb43b5229a74c84`.
- Release package: `635988fdcd927c83961463baca3b44b8444e2041d8e29f5b8c4625d20ceef213`.
- Installed executable: `b4a5421d3731a3566fb9be4d4384cd059b7f74f0e4b4d11f83770d31a0cfc995`.

The installed executable matched the package before and after the run. All 31
recorded harness files matched the source archive. The report is
`work/choom/test-results/packaged/run-AcFAph/` in the Linux cache. The package,
source, build log, and report are retained under
`work/evidence/products/96498ab9090079384b13f4b61a32eba64b27358e/`.
The package is an unsigned local Linux/X11 build. This result does not establish
macOS, Windows, Wayland, or desktop-portal behavior. The later evidence commit
changes only this document.

## Release checks

Full browser and installed-app acceptance, display-limit measurements, and final
repository checks remain pending. Each PR must report its own completed checks
and remaining limits. Constraint changes still need human review before merge.
