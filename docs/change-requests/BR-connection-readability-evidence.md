# Connection readability verification

This record covers BR-08A to BR-08D in the
[readability plan](../design/cr-baseline-viewer-readability-plan.md). It preserves
the implementation and verification from the original local snapshot on
2026-11-13. The [draft stack validation](#draft-stack-validation) records checks
for the rebuilt branches. For current remote CI, use each draft PR’s Checks tab.
[BR-08A PR #33 Checks](https://github.com/tomer-mayara/choom/pull/33/checks).

## Scope and constraints

Selected connections, labels on demand, and optional self-connections change
the drawing. They do not change baseline facts, interface counts, unknown
endpoint meanings, validation limits, or selected file bytes. The existing
inspection path determines which connections are shown. Each successful open
starts a new view; failed and cancelled opens preserve the current one.

Behavior constraints and workspace notes change. The baseline format, native
file-reader contract, load workflow, dependency boundaries, and OpenSLO contract
remain unchanged. No new TypeSpec contract, dependency, analysis process, or
persistent preference is needed.

## BR-08A: Selected connections

Before production edits, the existing complete Bun suite passed: 227 native
tests and 104 DOM tests, in separate processes. The local log is
`/tmp/choom-br08a-characterization.log`.

The first browser acceptance opened a valid four-arc fixture through the real
Open Baseline route. Its count assertion failed: expected zero arcs, received
four. This is the intended missing-behavior failure, before production edits.
The local log is `/tmp/choom-br08a-red.log`.

Focused red-to-green cycles covered scope changes, component/list context,
owner-header focus return, and the recorded order of surviving controls. Pointer
activation regressions also covered hosts that do not focus toolbar buttons or
radios on click. A control that removes an active arc now leaves focus on a
surviving control or the new panel heading. Existing hide/show press cancellation
passed characterization; it was not changed to manufacture a failure.

Routes are computed from the complete known arc set, then filtered. A surviving
parallel arc keeps its lane when inspection hides another interface. React Flow
label portals keep their element identity and recorded keyboard order. Already
ordered controls avoid a scan or DOM move on mount.

At the end of BR-08A:

- The complete Bun suite passed: 230 native tests and 121 DOM tests.
- Combined BR-07 and BR-08A browser acceptance passed 65 scenarios and 489 steps.
- Lint, cookbook links, frontend build/type checks, and whitespace checks passed.

Earlier BR-07 tests now choose All when they require the complete arc set.
Unknown-endpoint cases also run in All, so the quiet Selected default cannot
make a no-arcs assertion pass without checking endpoint eligibility. Local
cycle details are in `/tmp/choom-br08a-evidence.md`; the final browser log is
`/tmp/choom-br08a-acceptance-green.log`.

## BR-08B: Labels on demand

The first browser scenario selected Checkout and expected no painted arc names.
It failed because both names were painted. The observer checks text and its
ancestors, including opacity; an invisible but mounted control does not count
as visible text. The log is `/tmp/choom-br08b-red.log`.

Focused red-to-green cycles covered hover, keyboard focus, interface inspection,
pointer pass-through while hidden, curve-to-label hover, and a transparent
background. Pointer focus alone does not keep a name visible. A real touch tap
opens an interface without requiring hover. This activation path already worked
and remains characterization coverage.

Review found a missing keyboard transition: after a pointer selected a visible
curve with its label off-screen, Escape could reveal that label without bringing
it into view. A browser assertion and focused DOM tests failed before the fix.
Actionable keyboard input now uses the existing minimal reveal pan. Modifier
keys alone do not reveal text, and Tab leaves reveal to its destination control.
Pointer activation still keeps the camera unchanged.

At the end of BR-08B:

- Combined BR-07, BR-08A, and BR-08B browser acceptance passed 77 scenarios and
  573 steps, including touch and the off-screen keyboard transition.
- The complete Bun suite passed: 230 native tests and 134 DOM tests.
- `bun run check` passed, including 18 constraint scenarios and 25 interface
  tests. The frontend build and type checks also passed.

Cycle details are in `/tmp/choom-br08b-evidence.md`. The final browser log is
`/tmp/choom-br08b-acceptance-green.log`. Fit still measured hidden labels at this
stage; BR-08D owns that change.

## BR-08C: Optional self-connections

The first browser assertion selected Billing in a six-arc fixture. It expected
three non-self arcs but found five arcs, including two loops. Native filter
tests then failed on the same distinction. The filter now excludes equal
consumer and owner IDs unless Show self-connections is on. Complete baseline
facts, interface counts, and surviving route objects remain unchanged.

Focused DOM tests covered the default, independent control values, truthful
mixed and self-only interface details, and checkbox focus. Focus assertions
failed before the checkbox explicitly retained focus on change. Existing
hidden-opener fallback and held-press cancellation passed characterization.
A surviving loop also keeps its route and control when another loop is hidden.

Combined BR-07 and BR-08A–C browser acceptance passed 88 scenarios and 676 steps.
The complete Bun suite passed 232 native tests and 143 DOM tests. The full check
passed through dependency checks, then stopped because the separate installed
test helper was still being connected. This was not a complete passing check;
the final candidate check below covers the assembled result.

Cycle details are in `/tmp/choom-br08c-evidence.md`; the first failure is in
`/tmp/choom-br08c-red.log` and final browser acceptance is in
`/tmp/choom-br08c-acceptance.log`. The browser scenarios also check unchanged
selected file bytes.

Final review found one additional focus case: in All mode, inspect a loop, hide
it, show it again, then close its panel. Browser and DOM assertions expected the
restored arc but received its owner header. The original DOM opener had been
removed. Focus return now finds the currently shown control by the full
interface/consumer/owner tuple within this drawing. It uses the owner fallback
if that arc is still absent. The fix passed 55 affected browser scenarios and
47 focused DOM tests, plus type checking and focused lint. Local red/green
details are in `/tmp/choom-br08-focus-review-evidence.md`.

## BR-08D: Fit and view lifetime

The first browser scenario used one arc with a long label. It proved that the
hidden label extended beyond the padded curve bounds, then compared hidden and
revealed labels with the same scope, positions, and canvas. Both Fits produced
zoom 1.71313, so the expected difference failed. Two focused DOM assertions also
failed before Fit measured only controls whose labels were currently revealed.
The existing route and bounds calculations did not need a change.

The resulting checks cover the label dimensions and canvas space at activation,
keyboard Fit while hovering a curve, and self-connections off/on/off in All.
Already-passing characterizations cover Reset, moved endpoints, cancelled and
failed opens, ignored late layout results, and fresh defaults after successful
same-ID opens and example reopening. Those checks did not require new load or
arrangement code. The browser compares rendered geometry independently of the
production bounds calculation.

Local red/green details are in `/tmp/choom-br08d-evidence.md`, with the first
browser failure in `/tmp/choom-br08d-red.log` and focused DOM failures in
`/tmp/choom-br08d-dom-red.log`. The final candidate results below include the
updated compatibility scenarios and complete installed journey.

## Original complete candidate checks

The first full browser run found one real regression: the three-row toolbar
pushed the last reviewed component header below the initial view. A compact
toolbar now fits on one wide row and wraps on narrow screens. It keeps the
empty-message space stable. The existing overview acceptance failed before
this fix and passed afterward; component text and the starting zoom stay at
their normal size.

Seven other failures came from older pan and Reset tests measuring the whole
diagram wrapper, including the new toolbar. Those tests now measure the actual
React Flow canvas. The related overview, movement, and hierarchy checks use the
same surface for clipping and reachability. New scenarios were also split so
each has one When–Then pair, with fresh and stale input checked separately.

The original complete candidate passed these local checks:

| Check | Result |
| --- | --- |
| `bun run check` | 233 native and 151 DOM unit tests; 25 interface tests; 18 constraint scenarios / 57 steps; lint, cookbook links, contracts, types, dependency boundaries, unused-code checks, and duplicate checks passed. |
| `bun run test:e2e` | All 207 browser scenarios / 1,554 steps passed. Includes a fresh frontend build and type checks. |
| `bun run habit-hooks --all` | Passed with no reported findings. The snooze file remains `[]`. |
| `bun run desktop:build` | macOS ARM64 `.app` and `.dmg` built. |
| Linux release build and installed acceptance | Fresh `.deb` built and reinstalled; 21 scenarios / 121 steps passed against `/usr/bin/choom-desktop`. |
| Workload and visual checks below | All 18 workload runs and 18 visual captures passed their checks. |

The final full browser log is `/tmp/choom-br08-final-full-browser.log`; the full
check log is `/tmp/choom-br08d-check-final.log`. Copies of the final build, test,
and scan logs are retained with the source and package artifacts below. No Rust
behavior changed. Rust test/Clippy suites were not rerun for this UI change;
both desktop builds compiled the shell, and installed acceptance exercised its
assembled native route. Builds and static checks are separate from behavior
evidence.

## Original source and desktop package identity

The original local verification used an uncommitted snapshot from
`codex/br-08-connection-readability`, based on
`bc673e3a11250cbf2acfc75989d8852959523267`. The package used temporary Git tree
`8782b1926d5d2770e5d8c2a7749a2f2876615bab`, captured without changing the index.
That tree includes new files and unrelated local design edits. The later
verification text and plan status changes left the tested production and test
files identical to that captured source. The hashes below identify the
original snapshot and its artifacts.

Local artifact directory:
`/Users/tomermayara/.cache/choom-bv-linux-arm64-dfb8a298/work/evidence/products/tree-8782b1926d5d2770e5d8c2a7749a2f2876615bab/`

| Artifact | SHA-256 |
| --- | --- |
| `source.tar` | `3203f53b730bce3f8f2064d255bde3f30bd60d0f33a883d5e3f2f97948233451` |
| `candidate.patch`, including added files | `d49f1d946640d77c55705bb2492ea3c618ec587fc46b29255e508762551a0c4e` |
| `Choom_0.1.0_arm64.deb` | `fd4c003f752013fd018da4d7004ea9c4e894a61de588e515f7e1375a5493017f` |
| Installed Linux executable | `3606b83850aa38700232b64049b6119bba54d7a3192f834c60924fef183dadc4` |
| macOS ARM64 `.dmg` | `e5c3ccc604e3e39a0c92a9540a5b18b33360590a80a7e32f4e2ccbae939ece5e` |

`source.json` records all 297 source file hashes. The installed executable
matches the executable extracted from the `.deb`. Installed evidence is in
`installed-run-fkE3If/`, including `run.json`, Cucumber results, screenshots,
HTML, and driver logs. It records Linux ARM64, kernel 6.8.0-117-generic, X11/GTK,
Node 26.13.0, and the exact driver hashes. The product ran outside the checkout
with an empty runtime PATH and NODE_PATH. Input came through WebDriver and the
native GTK picker; DOM queries only observed the drawing.

The installed journey checked exact selected/all/self arc sets, hover and
keyboard labels, focus return, endpoint movement, Fit, Reset, Back navigation,
cancelled and invalid opens, successful same-file replacement, complete recorded
interface details, and unchanged file bytes. The unknown-consumer fixture still
showed no arcs in All and retained its eight-interface explanation.

The macOS build used macOS 27.0.1 on Apple M1 Pro. Installed behavior was verified
on Linux ARM64 only. macOS installed picker behavior, Windows, Wayland, desktop
portals, signed distribution, and launcher integration were not verified. The
Linux package is an unsigned local test package.

## Workload measurements

The six fixtures have the same byte hashes as the BR-04 and BR-07 measurements.
Each ran three times through the ordinary Open Baseline route in headless
Chromium 158.0.8127.18 with Playwright 1.65.0. The host was Apple M1 Pro with
8 logical CPUs, Bun 1.4.4, and Node 26.13.0. Timing includes browser observation
and three unchanged animation frames.

| Fixture | BR-08 median / range (ms) | BR-04 median (ms) |
| --- | --- | --- |
| 500 root components | 367.9 / 367.3–371.0 | 452.0 |
| 500 components, 16 levels | 400.9 / 400.5–403.0 | 522.6 |
| 500 mixed records, 2,000 links, 16 levels | 311.8 / 310.5–312.6 | 452.9 |
| Dense 2,000-link baseline | 245.0 / 242.8–245.7 | 436.3 |
| 500 rules, no components | 208.1 / 206.5–210.0 | 416.7 |
| Reviewed full baseline | 210.6 / 209.3–210.7 | 472.0 |

These are observations, not a speed guarantee or a controlled comparison. The
one-minute host load was 4.05, compared with 26.03 for BR-04 and 27.41 for BR-07.
BR-04 and BR-08 start without arcs; BR-07 included all arcs and labels. Browser
observation costs and concurrent local verification can also affect the times.

The mixed fixture showed 28 selected arcs and 1,750 in All. The dense fixture's
selected hub touches every arc: both Selected and All showed 1,960 non-self arcs,
or 1,980 with its 20 self-loops. Selection took 70.3–406.5 ms. Switching to All
took 95.1–848.9 ms, including the first mount of the complete arc set. Other
connection toggles remained below 323 ms with the same observation costs.
All 153 interface records across the fixtures opened through the catalog.
Source bytes and build files stayed unchanged; no browser errors were reported.

Local report:
`reports/baseline-readability/br08/2026-11-13T08-30-19-668Z/measurements.json`.

## Visual review and limits

Reviewed 18 captures at 1280×800, 320×640, a resized 1024×720 view, and 200 percent
text size. Shown shapes fit after explicit Fit. Controls wrap, panels scroll,
and there is no horizontal page overflow or native canvas scrolling. Labels
have transparent backgrounds. Their bounded two-line names and complete panel
headings remain available at enlarged text size.

The original run-003 baseline was opened read-only from
`/Users/tomermayara/git/work-choom/analysis-run-003/baselines/baseline-003/baseline.yaml`.
It has nine eligible tuples, including three self-loops. The overview showed
zero arcs; selecting Baseline workspace showed five arcs with no painted names;
opening its owned YAML decoder showed those five arcs with one revealed name.
Its SHA-256 remained
`16e3aa95b0e119ab6e6946df203b4483229b87c7906dbef3cdd60ec8b8d8a34e`.

Fit can make text small when large curves must fit in a narrow canvas. In the
320×640 run-003 capture, Fit used 18.2 percent zoom; the full interface name was
readable in the panel. Transparent text can overlap its own curve. This change
controls visibility and preserves existing routing; it does not remove all
crossings or guarantee readable canvas text at every Fit scale.

Captures and observations are in
`reports/baseline-readability/br08/visual-2026-11-13T08-30-55-522Z/`.

## Draft stack validation

The draft stack was rebuilt on main at `0b451e7e676f66fd3bf0a0ecceb8080ff962bb85`
after BR-07 merged. Results below apply to those layer candidates. The original
local snapshot retains its separate evidence above.

| Layer | Draft PR and source identity | `bun run check` | Full browser acceptance | Linux ARM64 installed acceptance |
| --- | --- | --- | --- | --- |
| BR-08A | [#33](https://github.com/tomer-mayara/choom/pull/33), commit `8af14c2`, package source tree `3299df179a45bf205d15fa07e704bdf6d9262b3a` | 230 native, 121 DOM, 25 interface, 18 constraint scenarios / 57 steps passed | 168 scenarios / 1,242 steps passed | 21 scenarios / 119 steps passed |
| BR-08B | [#34](https://github.com/tomer-mayara/choom/pull/34), commit `aff9b85`, package source tree `b12b83d4c33585221d6f7298391fa1b525957b80` | 230 native, 134 DOM, 25 interface, 18 constraint scenarios / 57 steps passed | 180 scenarios / 1,325 steps passed | 21 scenarios / 119 steps passed |
| BR-08C | [#35](https://github.com/tomer-mayara/choom/pull/35), commit `67a36c6`, package source tree `54ec52d86be42a03b2d3040677159b1a2fd829cd` | 232 native, 144 DOM, 25 interface, 18 constraint scenarios / 57 steps passed | 200 scenarios / 1,469 steps passed | 21 scenarios / 119 steps passed |
| BR-08D | This branch; package source tree `6e2f879eaf87a29cd2c6e6623e8eaa344a81cf9f` | 233 native, 151 DOM, 25 interface, 18 constraint scenarios / 57 steps passed | 207 scenarios / 1,554 steps passed | 21 scenarios / 121 steps passed |

Each completed layer's package was freshly built and installed. Its packaged
and installed executable hashes matched. Local logs are retained with each
package source tree. Browser runs included frontend builds and type checks.
Habit Hooks reported no findings, and the snooze file stays empty.

The final stack source, tests, and behavioral features match the original
verified candidate byte for byte. The six unrelated analysis documents remain
unchanged locally and are excluded from all four PRs. Final stack logs are
`/tmp/choom-br08d-stack-check.log`, `/tmp/choom-br08d-stack-browser.log`, and
`/tmp/choom-br08d-stack-habit.log`. Installed evidence is retained with the D
package source tree. Only verification text changed after that snapshot.

Use the Checks tab on each draft PR for its current remote CI result. The local
counts here record the reviewed branch candidates and their available platform
checks.
