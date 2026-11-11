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

## Ticket results

Each ticket starts with a runnable failing acceptance test. Focused TDD tests
then drive the implementation. Unchanged behavior starts with passing
characterization tests.

| Ticket | First acceptance failure | Current result |
| --- | --- | --- |
| BV-01 | `bun run test:behavior --tags @bv-01`: 10 scenarios failed real assertions. The old document validator rejected baseline fields and could not identify invalid baseline fields. | 10 scenarios and 96 focused unit/interface tests pass. Reviewed and complete. |
| BV-02 | `bun run test:behavior:native --tags @bv-02`: 3 scenarios failed and 4 existing input protections passed. Baselines were rejected, future versions were misclassified, and legacy diagrams were accepted. | 7 scenarios pass; reviewed and complete. |
| BV-03 | Not run yet. | Pending. |
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

## Release checks

Full browser and installed-app acceptance, display-limit measurements, and final
repository checks remain pending. Each PR must report its own completed checks
and remaining limits. Constraint changes still need human review before merge.
