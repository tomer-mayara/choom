# Baseline viewer verification

This record tracks the seven tickets in the [baseline viewer plan](../design/cr-baseline-viewer-plan.md).
All seven tickets are implemented and locally verified. Passing a contract,
build, or lint check alone does not establish browser or installed-app behavior.
The draft PRs still require repository review and successful remote checks before merge.

## Environment

- Host: macOS on ARM64, Apple M1 Pro with 8 CPU cores and 16 GiB of memory.
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
| BV-04 | Five browser scenarios failed actual assertions: flat components did not form the recorded groups, and all four excessive-work cases lacked a display-limit error. | Nine focused browser scenarios and the complete affected suites pass. Reviewed and complete. |
| BV-05 | Four browser scenarios failed actual assertions because interface/resource nodes and their relationships were absent. | Five focused browser scenarios and the complete affected suites pass. Reviewed and complete. |
| BV-06 | Nineteen browser scenarios failed explicit assertions for missing controls or record fields. Four existing Escape/focus cases passed. | Twenty-four focused browser scenarios and the complete affected suites pass. Reviewed and complete. |
| BV-07 | All 13 installed-host scenarios failed because the retired operations still returned registered-handler responses. | All 13 retired operations are unavailable. Full local checks and 18 ordinary installed Linux scenarios pass. Reviewed and complete. |

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

PR #20 CI passed web, macOS, Ubuntu, and Windows after one rerun of the same
unchanged Windows analyzer test failure recorded for BV-01 and BV-02.

## BV-04

The first browser run used the normal BV-03 build. All five scenarios failed
product assertions, with 29 steps passed, five failed, and two skipped. The
hierarchy scenario failed component containment. The four limit cases supplied
valid domain and YAML input, then failed because the app did not report
**Too large to display**. The report is `test-results/bv-04-browser-red.json`;
the log is `reports/baseline-viewer/bv-04/browser-red.log`.

Focused TDD first failed the nested geometry, boundary, invalid-layout,
safe size-message, and group-header UI cases. After implementation, independent
review found no actionable defects and passed 50 layout/workflow tests and
nine diagram DOM tests.

The focused browser suite passes nine scenarios and 63 steps. It checks
containment, keyboard inspection of every reviewed component, all four limit
failures, and a 500-component hierarchy with 16 levels in 390×640 and 1600×1000
windows. Fit View and keyboard focus after panning a large parent also pass.

Five component-layout runs on the host measured 183–559 ms for 500 roots and
127–236 ms for 500 components across 16 levels. A 2,000-link input with 100
components took 17–66 ms, but BV-04 only counts those links; it does not yet lay
out or draw them. The raw measurements are in
`reports/baseline-viewer/bv-04/layout-measurements.json`. These are component-only
measurements. Full viewer measurements remain required after BV-05 and BV-06.

Completed candidate checks:

- `bun run check`: 178 native unit tests, 19 DOM tests, 18 native Cucumber
  scenarios with 57 steps, and 19 interface tests passed. Lint, contracts, types,
  cookbook links, dependency boundaries, unused-code, and duplicate-code checks passed.
- The complete browser suite passed 28 scenarios and 185 steps, including the
  existing load, cancellation, starter, resize, focus, and zoom behavior.
- `bun run build`, `bun run check-types`, and `bun run habit-hooks --all` passed.
  The build retains the existing large-chunk warning; the snooze file is empty.
- Changed document links and `git diff --check` passed.

The duplicate-code check first rejected repeated viewport test setup. A shared
test driver now owns that setup for its three callers. The affected DOM tests
and the complete repository check passed after the refactor. Production files
did not change after the complete browser run. The manager reviewed the final
candidate. Logs are retained in `reports/baseline-viewer/bv-04/`.

## BV-05

The first browser run used the unchanged BV-04 build. All four scenarios failed
actual assertions, with 20 steps passed, four failed, and five skipped. The
reviewed fixture had five nodes instead of 18. The unknown-owner interface was
absent. Records without components had no nodes, and the distinct-interface case
had only its two component nodes. The log is
`reports/baseline-viewer/bv-05/browser-red.log`. The focused layout tests then
failed seven assertions before implementation.

Visual review found two problems after the first implementation passed its
record-count tests. The reviewed baseline formed a tall column with 4-pixel
label bounds. Compact packing then exposed overlapping labels and text covered
by lines. New browser assertions failed before each correction. The final
layout uses ELK rectangle packing for node geometry. React Flow draws the
recorded links. Ownership labels sit above their target, and permission labels
have more space between root items. Edges stay behind inspection controls.

The reviewed fixture has exactly 18 nodes and 12 ownership lines, with no
consumer arrows. At 1280×800, its fit zoom is 0.807 and the smallest relationship
label bounds are 12.1 pixels high. The full and self-consumer cases pass checks
for label overlap, control overlap, and viewport containment. The manager also
inspected their screenshots and the unknown-owner case.

The initial edge-aware ELK layout took 15–17 seconds for 2,000-link inputs and
failed the existing five-second unit timeout. The final node-packing preparation
takes about 35–45 ms for those inputs. The timeout and supported bounds did not
increase. This measures preparation only; complete viewer measurements remain
required after BV-06.

Review also found that long record names and target IDs could be repeated into
every edge's DOM attributes. Failing browser and focused tests preceded the fix.
Internal edge keys are now short ordinals. Edge descriptions abbreviate long
name/ID segments with an ellipsis; exact model IDs remain the endpoints, and
complete names and IDs remain available in details. The saved baseline is unchanged.

Completed candidate checks:

- Focused BV-05 browser acceptance: five scenarios and 38 steps passed.
  The complete browser suite passed 33 scenarios and 223 steps.
- `bun run check`: 181 native unit tests, 25 DOM tests, 18 native Cucumber
  scenarios with 57 steps, and 19 interface tests passed. Lint, contracts, types,
  cookbook links, dependencies, unused-code, and duplicate-code checks passed.
- `bun run build`, `bun run check-types`, and `bun run habit-hooks --all` passed.
  The existing large-chunk warning remains; the snooze file is empty.
- Independent semantic/UI review, manager visual review, document links, and
  whitespace checks passed. Logs are retained in `reports/baseline-viewer/bv-05/`.

PR #21's macOS and Windows jobs passed. Its web job failed to resolve the Ubuntu
package mirror during setup; the Linux desktop job timed out at the same setup
step. The web retry failed at the same mirror lookup. These failed setup steps did not execute product tests. PR #22 also encountered the web setup failure; its macOS and Windows jobs passed. Current retry status is available on the PR checks.

## BV-06

The first explicit assertion run used the unchanged BV-05 build from `cc1496d`.
Of 23 scenarios, 19 failed on missing Baseline details or Rules controls, or on
missing record fields such as Membership, Owner, Identity, and Excluded paths.
Four existing Escape/focus characterizations passed. The run had 113 steps
passed, 19 failed, and 21 skipped. Its report and log are
`reports/baseline-viewer/bv-06/browser-red.json` and `browser-red.log`.

The new steps were first adjusted so that their assertions failed before the
Cucumber step deadline. Only the explicit assertion run above is acceptance-red
evidence; the earlier timeout run is not.

Focused TDD failed the field, record, and Rules cases before each implementation
step. The final focused DOM run passes 29 tests and 263 assertions. Details show
all fields and statement metadata as text. Rule rows format their data only when
expanded. Native keyboard controls and the existing dialog preserve focus and
zoom; new baselines close old selections.

Independent review found that `parentId: null` was labeled as unknown intent.
The design means that this is the first baseline. A new browser assertion and a
focused unit assertion failed before the metadata field changed to **No parent
baseline (null)**. Nullable statement values still say **Unknown (null)**.
The manager inspected component, expanded-rule, and narrow-window metadata panels.

Completed candidate checks:

- The complete browser run passed 56 scenarios and 376 steps. After the small
  parent-label correction, the current focused BV-06 run passes 24 scenarios
  and 159 steps, including the new first-baseline case.
- `bun run check`: 181 native unit tests, 39 DOM tests, 18 native Cucumber
  scenarios with 57 steps, and 19 interface tests passed. Lint, contracts,
  types, cookbook links, dependencies, unused-code, and duplicate-code checks passed.
- `bun run build`, `bun run check-types`, and `bun run habit-hooks --all` passed.
  The existing large-chunk warning remains; the snooze file is empty.
- Independent source review, manager visual review, and whitespace checks passed.
  Check and red/green logs are retained in `reports/baseline-viewer/bv-06/`.

### Complete viewer measurements

The normal production build from clean commit
`2e30b456d97830ee9d32e2963e05807ed071e2d5` completed three runs of each workload
below. The host was the Apple M1 Pro described above, with Chromium 158.0.8127.18,
Playwright 1.65.0, Bun 1.4.4, Node.js 26.13.0, and a 1280×800 viewport.

Each run used a fresh browser context and the real Open Baseline file chooser.
Load time starts before file selection supplies the file and ends after exact
node/link coverage and three stable animation frames. These times include test
driver and observation overhead. No product test doubles were present.

| Workload | Load time, ms | Keyboard details, ms |
| --- | ---: | ---: |
| 500 root components | 377 | 49–51 |
| 500 components across 16 levels | 393–394 | 45–48 |
| 500 mixed records, 2,000 links, 16 levels | 643–661 | 131–144 |
| 120 diagram items with 2,000 links | 494–574 | 100–108 |
| 500 rules with no diagram items | 209–226 | 34–41 for the last rule |
| Reviewed 5/8/5/21 baseline | 226 | 13–15 |

For diagram workloads, Escape and focus return took 6–79 ms and zoom activation
took 29–47 ms. The 500-rule list opened in 42–49 ms; closing the last rule and
restoring summary focus took 2–5 ms. A second Escape closed the list and returned
focus in 6–33 ms. All expected records and links were present, all diagram nodes
fit the initial canvas, and no browser errors or document overflow occurred.
Large diagrams still need zoom and pan to read individual items.

The supported limits remain **500 total records, 2,000 explicit links, and
16 component levels**. These measurements support this local workload; they are
not a latency guarantee for every input, machine, or desktop webview. Source,
build files, and the measurement script remained unchanged throughout the run.
The report records their hashes, fixture hashes, runtime details, and all raw
timings. It is retained at
`reports/baseline-viewer/final/2026-11-11T15-10-31-067Z/measurements.json`.
The manager also inspected the final reviewed-baseline screenshot.

## BV-07

Before removal, the new acceptance scenarios called all 13 retired operations
through the actual installed host. Each operation returned a typed invalid-request
response from its registered handler. The unavailable-operation assertion then
failed: 13 scenarios failed, with 39 steps passed and 13 failed. There were no
undefined steps or setup failures.

The product was the unchanged BV-03 release from `96498ab`; its installed
executable hash matched the recorded package before and after the test. The
test checkout had three acceptance-only overlays. Their hashes matched the
staged tests, and the 30 unchanged harness files matched the source archive.
The overlay passed TypeScript checks. The report is
`work/choom/test-results/packaged/run-gRW5x9/`, with retained evidence under
`work/evidence/bv07-retirement-red/` in the Linux cache.

Five native read characterizations passed before extraction. They cover empty,
BOM, CRLF, Unicode, exact-limit and excessive content; safe wire failures;
invalid requests and UTF-8; unchanged input and sibling bytes; replaced file
and directory identities; and Unix links and FIFOs. A new host-interface test
then failed with responses from all 13 registered handlers. It passed after
their registrations and permissions were removed.

The reader now owns its handles for one read. It retains the file-type, byte,
identity, metadata-change, and UTF-8 checks. The storage service, writable caches,
startup/shutdown cleanup, repository access, analyzer processes, and all write
operations are gone. The local main-window read and open-dialog permissions
remain. Native read paths keep their existing rules; the documentation now
distinguishes those rules from the stricter frontend path validation.

After extraction, all eight retained Rust tests passed. Six interface assertions
failed before the read contract stopped accepting retired write-stage failures.
TypeSpec outputs were regenerated, and 23 focused TypeScript boundary tests
then passed. Early focused command results were observed directly in tool output;
`reports/baseline-viewer/bv-07/sequence.md` records that sequence and is not a raw log.
Independent source review and the manager's native-boundary review found no
actionable defects.

Completed candidate checks:

- `bun run check`: 181 native unit tests, 39 DOM tests, 18 native Cucumber
  scenarios with 57 steps, and 25 interface tests passed. Contract generation,
  types, lint, cookbook links, dependency boundaries, unused-code, and duplicate
  checks passed.
- The final browser suite passed 57 scenarios and 382 steps. It covers the full
  and empty baselines, unknown owners, recorded consumers, accepted statements,
  repeated names, all record kinds, view preservation, and keyboard behavior.
- `bun run check-types`, `bun run build`, and `bun run habit-hooks --all` passed.
  The snooze file is empty; the existing large deferred ELK chunk warning remains.
- `bun run test:rust` passed all eight retained tests. Cargo formatting and
  Clippy passed. `bun run desktop:build` produced the macOS app and DMG.
- Document inspection checked 267 local link targets and 246 saved source links.
  Every target exists. External websites and Markdown anchors were not fetched.
  `git diff --check` passed.

The macOS DMG SHA-256 is
`7d6e23aaa70af17a8d40d9145a951e98a61ebfb9b99ad3cf21c86a89e977c197`;
its app executable SHA-256 is
`52e37abf7d4a07f3976c77c243f6802e00853fc951e8121ae72405f2b0d60337`.
This is build evidence, not an installed macOS UI check.

### Final installed Linux release

The ordinary Ubuntu 24.04 ARM64 release passed all 18 scenarios and 94 steps in
29.355 seconds. Run `run-izotIy` used the real native picker and file reader,
an empty product runtime PATH, and a working directory outside the checkout.
It checked all 18 reviewed items, exactly 12 ownership links, no consumer arrows,
and expansion of all 21 rules. Cancellation and invalid files preserved the
view and selected bytes. All 13 retired commands returned host ACL rejections.

To run each new test before committing, the package was built from the exact
staged Git tree `daa12b2720f25e73cd1af8f3b38528cad3ed269f`. After testing, that
same tree was committed as `c0bc7254793d413297ce23f727971b4a4aee4abc`.
The original report labels the build as a precommit tree, not a commit.

Recorded SHA-256 identities:

- Source archive: `b751c3ec27c6972e73ed2306fa0ba2aca8ef67950ab2c5acf8403fb5ef0bff2d`.
- Release package: `be38998aa7c942f2903977096c4d4e3c9593930a79fe8b49a93b19e430e3481d`.
- Extracted and installed executable: `e173d4b6d115853735f424896f6beedd81625b9fd47ec481f49b02f7b338717a`.
- Staged binary diff from parent `e6bcf8bc2e9fa16b76855b1bd875ced14d20d874`:
  `fde00fb14b8e2e7de93fd29abf6561015639e671edf5c8535e1f508af5e82f68`.

All 222 source files and all 41 harness files matched the archive. The manager
also checked every harness file against the committed tree. The installed
executable matched the package before and after the run. No app, driver, or Xvfb
process remained after cleanup. The package is an unsigned local Linux/X11 build.

The Linux cache retains the archive, package, identities, logs, reports, and
screenshots under
`work/evidence/products/tree-daa12b2720f25e73cd1af8f3b38528cad3ed269f/`.
Its `linux-verification.json` records the command rejections and comparisons.
A separate commit correlation record preserves the original precommit evidence.
Local check logs are also retained in `reports/baseline-viewer/bv-07/`.

## Release checks

All local release checks above passed, and complete viewer measurements retained
the supported limits. This verifies the browser and the ordinary Linux/X11
installed route. Installed macOS, Windows, Wayland, desktop-portal, and signed
release behavior remain unverified; builds and browser results do not replace
those observations.

Remote CI is separate. PRs #18–#20 passed all jobs. Later web/Linux jobs encountered
Ubuntu mirror DNS failures before product checks. PR #23 also hit the unchanged
Windows analyzer test already recorded above; BV-07 removes that analyzer and
test. Retry and final-stack status belong to the PR checks. No remote setup
failure is counted as a behavior pass. Human constraint review and required
repository checks remain necessary before merge.
