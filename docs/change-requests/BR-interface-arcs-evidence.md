# Interface arc verification

This record covers BR-07A to BR-07D in the
[readability plan](../design/cr-baseline-viewer-readability-plan.md).
BR-07A to BR-07D are implemented and verified locally. BR-05 remains a separate
follow-up. The results below describe checks completed on 2026-11-12.

## Scope and constraints

An arc shows a recorded permission from an allowed consumer to the interface
owner. It does not show observed calls. The current arrangement supplies its
geometry. The saved baseline, prepared layout, and selected file remain
unchanged.

Unknown owners or allowed consumers produce no arc. The unchanged reviewed
fixture has eight unknown consumer lists. Known-consumer tests use separate
synthetic baselines through the normal file-open route.

Behavior constraints and workspace notes change. The baseline format, native
file-reader contract, load workflow, display limits, dependency boundaries,
and observability contract do not change. No new TypeSpec contract or dependency
is needed.

## Baseline characterization

Before production edits, `bun run test` passed: 199 native tests and 65 DOM
tests. Native and DOM tests ran in separate processes. The local log is
`/tmp/choom-br07-baseline-tests.log`.

## BR-07A: Draw recorded arcs

The first browser acceptance run used the normal build and real Open Baseline
file chooser:

```sh
bun run test:e2e --tags @br-07a --name 'Draw one interface for two allowed consumers'
```

The file opened successfully. The arc assertion failed: expected two paths,
received zero. This was the behavior failure before production edits. Fixture
and tooling setup failures were corrected first and are not counted as red
test evidence.

The local log is `/tmp/choom-br07a-browser-red.log`. The browser runner retained
its screenshot and trace in
`test-results/d8317237-234c-4f3f-9b49-a87f6801903e/`.

Focused red-to-green cycles covered endpoint derivation, multiple consumers,
tuple identity, rendering, nested header positions, parallel and reverse paths,
self-loops, and accessible labels. Position lookup builds one component map
per projection. An empty arc list does no geometry work.

Visual review found partly hidden labels in the two-consumer and reverse-
permission fixtures. Before repair, a browser assertion reported readable
labels `[false, true]`, and native tests found labels intersecting Reporting.
Parallel and reverse curves now bend away from the drawing's center, with
increasing offsets on the same outside side. This uses no obstacle search and
does not move components. The legend occupies a separate row so that it cannot
cover a header.

After repair:

- `bun run test:e2e --tags '@br-07a or @br-02'`: 16 scenarios, 122 steps passed.
- Focused native geometry and movement after both routing repairs: 24 tests
  passed, with 2,363 assertions.
- Focused DOM overview, movement, and reset: 33 tests passed.
- Focused ESLint and dependency-boundary checks passed.

The local repair logs use the prefix `/tmp/choom-br07a-clear-label-`.
The final browser log is
`/tmp/choom-br07a-clear-label-regression.log`.
The reverse-permission regression logs use
`/tmp/choom-br07a-reverse-lane-`. The later combined BR-07 runs verify that final
routing in the browser.

Final review also found that a left component's self-loop could sit under its
right neighbor. The existing self-loop case used the rightmost owner. A new
browser case failed its readable-label assertion, and a native test found the
overlap. Self-loops now use the component's outside-facing side, with additional
loops farther out on that side. The focused browser suite passed 7 scenarios
and 53 steps; native geometry and movement passed 25 tests and 2,370 assertions.
Logs use the prefix `/tmp/choom-br07a-left-loop-`.

## BR-07B: Explain unknown endpoints

The first browser test opened unchanged `full.yaml` at 320 by 640. Its summary
assertion failed because the note was absent. The log is
`/tmp/choom-br07b-browser-red.log`; artifacts are in
`test-results/7005b06c-8b1e-4b74-94b6-5ecc7404fa0d/`.

Focused DOM failures preceded the consumer and owner explanations. The native
summary test expected three incomplete interfaces and received zero before
implementation. A DOM summary test failed before the note was added. The note
is outside the canvas branch, so the no-components case passed without another
production branch. That case is characterization, not an invented red step.

Known endpoint values, raw nulls, independent statuses, references, owned counts,
and file bytes remain intact. The note counts each incomplete interface once.
Complete interfaces and an empty interface list produce no note. The note is
static text; loading and cancellation retain their existing status announcements.

Checks:

- Focused DOM details, inspection, and endpoint tests: 29 passed.
- Focused native endpoint and baseline contract tests: 104 passed.
- `bun run test:e2e --tags '@br-07a or @br-07b or @bv-05 or @bv-06'`:
  46 scenarios, 331 steps passed.
- After the status-message refinement,
  `bun run test:e2e --tags '@br-07a or @br-07b or @bv-03'`:
  22 scenarios, 168 steps passed.
- Focused ESLint passed. Browser builds included both TypeScript checks.

All BR-07B browser scenarios use a 320 by 640 window. They include mixed facts,
both facts unknown, no components, and direct access through the owner's list
or Baseline details. Local logs use the prefix `/tmp/choom-br07b-`.

## BR-07C: Inspect and highlight arcs

The first browser acceptance run opened a known-consumer baseline through the
real file chooser. Selecting a label or a free part of its curve did not open
the interface panel. Both assertions failed before the inspection wiring was
added. The log is `/tmp/choom-br07c-browser-red.log`.

Focused red-to-green cycles covered pointer activation, compact label width,
arc emphasis, keyboard reveal, and pointer focus without camera movement.
The existing inspector supplied keyboard activation, panel focus, Back, and
return to the exact opener; passing characterization tests protect those rules.
There is no second selection store.

Two additional failures led to small fixes. Focus outlines need padding that
scales with the label. Also, React Flow's HTML label portals kept their old tab
order after records were reordered in a replacement baseline. The label order
now refreshes when the source arc order changes. Moving or inspecting an arc
keeps the same label element.

Checks:

- Combined A, B, C, BR-01, and BR-03 browser acceptance: 61 scenarios,
  468 steps passed.
- Focused DOM inspection, movement, and arc tests: 41 tests passed,
  with 151 assertions.
- Viewport native tests: 12 passed.
- Offscreen and oversized keyboard-focus cases passed three browser repeats,
  with no native page scrolling.
- Focused ESLint, the browser build and type checks, and whitespace checks
  passed.

The combined browser log is `/tmp/choom-br07c-regression-green.log`. Focused
logs use the prefix `/tmp/choom-br07c-`. Manual review of the shipped browser
view confirmed compact labels, clear arrowheads, interface emphasis, and the
leading edge of an oversized focused label in a 320-pixel canvas.

## BR-07D: Fit the complete drawing

The first browser acceptance run opened and inspected a known interface, then
used Fit at 1280 by 800 and 320 by 640. Both containment assertions failed:
the component-only Fit left curves and labels clipped. The selected paths used
the highlighted stroke width. File opening, inspection, and the Fit action
succeeded before those assertions. The log is `/tmp/choom-br07d-browser-red.log`.

The Fit slice passed 4 browser scenarios and 35 steps after focused native
and DOM cycles. It includes a spread that needs less than 1% zoom and checks
that Zoom In and Zoom Out remain usable. The first D4 DOM assertion was too
weak: the initial scene already fit. It was replaced with an offscreen-camera
case, which failed against the old control and passed after the hookup. The
weak assertion is not counted as red evidence. Logs include
`/tmp/choom-br07d-d4-red.log` and `/tmp/choom-br07d-fit-browser-green.log`.

Reset characterization found another real gap. If an arc press began before
Reset, its later release opened a fresh interface path and removed Back from
the retained panel. The browser assertion failed after a real press, keyboard
Reset, and release. DOM tests reproduced the failure both before and after a
component move. Logs use the prefix `/tmp/choom-br07d-reset-press-`.

Reset now increments a transient input generation. Arc presses check that
generation and their view owner before activation. The same label element,
inspected record, and Back path survive Reset. A fresh click still works.
Movement, parent growth, Escape, interruption, replacement with reused IDs,
cancelled loads, and late completion passed their characterization checks.

The combined BR-07 and earlier readability suite passed 100 scenarios and
792 steps before the final group-border correction below. Focused D checks
passed 39 native tests and 33 DOM tests. The final complete checks include the
later correction.

## Final group-header correction

Installed acceptance exposed a one-unit offset at group headers. Their border
places the header one diagram unit inside the group's origin. Arcs used that
outer origin. A Fit zoom above 100% made the gap exceed the native assertion's
one-pixel tolerance.

A new browser scenario reproduced the error at 200% zoom with a 0.1-pixel
tolerance. A focused native test also failed before the repair. One shared
group-border width now controls the wrapper border and the group header origins
used for routing. Component positions, leaf headers, and descendant coordinates
remain unchanged. The native acceptance tolerance was not increased.

After repair, all 48 BR-07 browser scenarios and 379 steps passed. Focused native
geometry tests passed 25 tests and 2,414 assertions; focused DOM tests passed
51 tests and 246 assertions. Logs use `/tmp/choom-br07-group-inset-`.
Independent review found no further issue in this correction or the Reset guard.

## Complete checks

| Check | Final result |
| --- | --- |
| `bun run check` | Passed: lint; 227 native Bun unit tests; 104 DOM tests; 18 browser-free Cucumber scenarios and 57 steps; cookbook checks; TypeSpec, generated outputs, and 25 interface tests; type checks; dependency boundaries; unused-code and duplicate checks. |
| `bun run check-types` | Passed within the contract check; both application and tools TypeScript projects were checked. |
| `bun run test:e2e` | 151 scenarios and 1,132 steps passed against a fresh production build. |
| `bun run build` | Passed through the browser and desktop build commands. |
| `bun run desktop:build` | Built the macOS ARM64 `.app` and `.dmg`. |
| Installed Linux acceptance | 21 scenarios and 119 steps passed against the ordinary installed release. |
| `bun run habit-hooks --all` | Passed with no findings; the snooze file remains `[]`. |
| Workload measurements | All 18 runs passed, including both dense arc workloads. |

The full browser run also found an old setup assumption: a pan started on the
new legend because the test used the outer diagram region's bounds. The test
now uses the actual canvas for panning and focus containment. Its focused 11
scenarios passed before the final complete suite. This was a setup correction,
not a new product behavior.

The final local logs are `/tmp/choom-br07-check-verified.log`,
`/tmp/choom-br07-browser-verified.log`,
`/tmp/choom-br07-macos-verified.log`, and
`/tmp/choom-br07-habit-hooks-verified.log`. Builds retain the existing Vite
chunk-size warning. Browser acceptance also builds the existing controlled test
route; its dynamic-import warning remains.

Manual visual review covered the known-consumer overview and side panel,
1280 by 800 and 320 by 640 windows, and long labels with the page text size
doubled. Fit contained the measured drawing bounds. The unchanged reviewed
baseline showed its note without arcs or page overflow. Six screenshots and
observations are in `reports/baseline-readability/br07/visual/`.

The manager reviewed the complete change. Independent reviews covered arc
derivation, unknown facts, routing, Fit, and the final input and header fixes.
The React review checked derived selection, transient refs, stable label
identity, and bounded geometry work.

## Source and installed-app evidence

The tested source was captured with a temporary Git index. The real index was
preserved. The ordinary Linux package and its harness use the same source tree,
with no test overlay:

| Item | SHA or identity |
| --- | --- |
| Source tree | `16ede66987e37461e6aedd4ff55450f6f34b0eb7` |
| Parent commit | `9cd079b2eec6124ec80d04198c8a0804264f2bdc` |
| Source archive SHA-256 | `b484e11b4eedcd678ab75aa264dc78236dcccb36855a30417a3f89bad5e87495` |
| Linux `.deb` SHA-256 | `6d782be99f54a381b1a17ed706908a358b0e1317dee4cfd03f77525d50c5cf72` |
| Installed/extracted Linux executable SHA-256 | `77fda21fc1fd3c6e9a2d5f2c975cde6acac2e03aeec1d41caf86db0d09ad99ef` |
| macOS `.dmg` SHA-256 | `631fa77a00cc320a536167e7ce9c6a6fca4b2780baff98a2914b269ee1b9048c` |
| macOS bundled executable SHA-256 | `96cce11e1fc768b5167c25c8990d93d7bb80d5317d120750cf940f105c47a58e` |

All 276 source files and 65 runner harness files matched the archive. Among the
captured source files, only this verification record and the plan's status were
updated after the frozen checks and measurements. The application and tests did
not change after verification.

The installed run used Ubuntu 24.04.5 ARM64, GTK 3.24.41, WebKitGTK 2.52.6,
tauri-driver 2.1.0, Bun 1.4.4, Node 26.13.0, and Rust 1.99.1. The ordinary `.deb`
was built with `bun run tauri build --bundles deb -- --locked`, installed, and
run through `/usr/bin/choom-desktop` outside the checkout. The real GTK picker
and native reader opened the selected file. The product had an empty runtime
`PATH` and no test plugin or mocked IPC.

Run `run-3FQd0u` passed the known-consumer journey, including inspection,
movement, Fit, Reset, Back, and original file bytes. Its 54 endpoint observations
were within 0.000102 screen pixels of the actual header borders. Canvas and
viewport native scroll stayed zero. The unchanged `full.yaml` also passed its
unknown-consumer note, zero-arcs, detail access, and original-byte checks.
Its SHA-256 remains
`da2c0800e21354f5e161ee0eeeff3fb418a50b6b4d36e546272cc2e2333bfe32`.

Earlier attempts are retained as failures. The first native observer omitted
CSS zoom when reading WebKit's SVG screen matrix. A second attempt exposed the
legacy SVGPoint method's matrix-type restriction. The corrected observer uses
the actual CSS viewport matrix and canvas origin through
`DOMMatrix.transformPoint`. It keeps the attachment and Fit assertions and
checks for native scrolling. That observer exposed the real group-border defect
described above; the corrected product then passed the complete suite.

The local ledger is `reports/br-07-installed-evidence.md`. The source archive,
package, logs, screenshots, coordinates, and `verification.json` are retained at:

`/Users/tomermayara/.cache/choom-bv-linux-arm64-dfb8a298/work/evidence/products/tree-16ede66987e37461e6aedd4ff55450f6f34b0eb7`

The owned native processes stopped, and the task container is stopped. Installed
evidence covers Linux ARM64 with X11 and GTK. macOS evidence covers building the
bundles. macOS and Windows installed behavior, Wayland, desktop portals,
launcher integration, and distribution signing were not checked here.

## Workload measurements

The six saved inputs have the same hashes as the BR-04 measurements. Each ran
three times in a fresh Chromium context at 1280 by 800. The normal production
build opened each file through Open Baseline. The clock ends after exact component
coverage, expected arc and label tuples, finite geometry, and three stable
frames. Expected tuples come from saved facts, not the production projection.

All times are milliseconds. The dense fixtures contain 1,750 and 1,980 arcs;
source-link counting still includes owners and allowed-consumer entries.

| Workload | Arcs | BR-04 median | BR-07 range | BR-07 median |
| --- | ---: | ---: | ---: | ---: |
| 500 root components | 0 | 452.0 | 392.0–426.1 | 392.3 |
| 500 components, 16 levels | 0 | 522.6 | 424.7–476.3 | 428.2 |
| 500 mixed records, 2,000 links, 16 levels | 1,750 | 452.9 | 731.3–749.3 | 749.0 |
| 120 records, 2,000 links | 1,980 | 436.3 | 733.6–765.6 | 747.6 |
| 500 rules, no components | 0 | 416.7 | 237.6–273.1 | 237.6 |
| Reviewed baseline, 39 records | 0 | 472.0 | 219.5–224.6 | 223.4 |

The six dense arc observations measured keyboard inspection at 170.3–183.1 ms,
Escape and exact focus return at 120.9–181.5 ms, Fit with the panel open at
140.0–218.8 ms, and Reset with inspection retained at 147.0–168.2 ms. Component
inspection, keyboard movement, reset, zoom, and the 500-rule list also passed.
All expected paths and labels rendered. Source bytes, positions, and path
identity stayed intact. Fit included all measured rectangles, Reset returned
to 100%, and selected and unrelated arcs had different emphasis.

The machine was an Apple M1 Pro with 8 logical CPUs and 16 GiB of memory,
running Darwin 27.0.0 ARM64, Bun 1.4.4, Node 26.13.0, Chromium 158.0.8127.18,
and Playwright 1.65.0. Initial load averages were 27.41, 16.15, and 10.85.
The run completed at 2026-11-12 09:54:57 UTC, with no browser warnings or errors.
Source files, built files, the measurement script, and selected bytes stayed
unchanged throughout all 18 runs.

These are observed timings, not a latency guarantee or a controlled speed
comparison. Host load was uncontrolled. BR-04 rendered no links; BR-07 adds
paths, labels, and their observation work. The measurement's Fit checks cover
node, path, and label rectangles; acceptance separately checks arrowhead bounds.

The local report is
`reports/baseline-readability/br07/2026-11-12T09-54-27-955Z/measurements.json`.
Its SHA-256 is
`35de8b362d2e1291266c879171d959418b9cb688f5406239f28ff03ce06cbbd5`.
The measurement script SHA-256 is
`d9d870de60858237289e514ed663ec45272a5e666b83007daa6b8425ff62e24e`.

## Draft PR stack validation

The verified change was split into four dependent branches, A through D.
This split uses characterization of working behavior; the original acceptance
RED and focused TDD evidence above still describes implementation.

Each stage passed `bun run check`, `bun run check-types`, the frontend build,
browser acceptance, and `bun run habit-hooks --all` before commit. The snooze
file stayed empty. Local results are:

| Stage | Native units | DOM units | Browser scenarios | Browser steps |
| --- | ---: | ---: | ---: | ---: |
| BR-07A | 212 | 68 | 72 | 542 |
| BR-07B | 215 | 77 | 121 | 890 |
| BR-07C | 220 | 97 | 135 | 1,002 |
| BR-07D | 227 | 104 | 151 | 1,132 |

A runs BR-07A, BR-01 to BR-04, and diagram-workspace acceptance. Later stages
run the complete browser suite. The complete check also runs 18 native Cucumber
scenarios and 25 interface tests, plus lint, contracts, dependency, unused-code,
and duplicate checks. Logs use `/tmp/choom-br07-stack-<stage>-` with suffixes
`check.log`, `types.log`, `habit.log`, and `browser.log`.

In A, adding explicit handles prevented the existing component Fit from completing
after movement. The first A browser run failed three existing BR-04 cases:
narrow Fit did not finish, and a queued
Fit could overwrite Reset. A focused DOM test then failed with the camera still
offscreen. React Flow needed the current measured dimensions when explicit
handles were supplied. A, B, and C provide those dimensions from the current
arrangement; the regression and existing control tests then passed. Logs are
`/tmp/choom-br07-stack-a-fit-red.log` and
`/tmp/choom-br07-stack-a-fit-green.log`.

D replaces that queued Fit API and its compatibility test with complete-drawing
Fit and its broader coverage. Before adding this note, all 276 files matched
the saved verified tree `9dd77648a2f59b67f430c5ec259780d2d15550e4` byte for byte.
This note is the only remaining difference. Product code, test inputs, and
behavior constraints are unchanged from that verified tree. CI results belong
to the draft PRs and are reported there.
