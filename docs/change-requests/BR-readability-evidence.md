# Baseline readability verification

This record covers BR-01 to BR-04 in the
[readability plan](../design/cr-baseline-viewer-readability-plan.md). Each ticket
is a separate draft PR based on the previous ticket. BR-05 and BR-06 are deferred.

BR-01 to BR-04 are implemented and locally verified. The PR stack remains
draft. Each section records completed checks and the platform limits below.

## Environment and scope

- Host: macOS on ARM64, Apple M1 Pro, 8 CPU cores, 16 GiB memory.
- Tools: Bun 1.4.4, Node.js 26.13.0, Rust 1.99.1.
- Browser acceptance uses the built app, Chromium, and the browser file picker.
  Controlled load failures use the existing separate test composition.
- Installed Linux acceptance uses a normal release package, the native picker,
  and the WebKit driver. Its results are recorded separately from browser tests.
- Lint, type checks, and builds are structural checks. Behavior claims require
  the unit, interface, browser, or installed-app checks described below.

## Constraints

The workspace behavior files and boundary notes change with each ticket. The
workspace manifest links the new behavior files. The baseline format, file
access contracts, dependency rules, and OpenSLO definitions do not change.
View state stays inside the workspace; it does not create a new component
boundary or require another TypeSpec model.

The draft PRs require human review of the changed constraint artifacts before
merge, as specified by the [feature cookbook](../new-feature-cookbook.md).

## BR-01: Inspect records in a side panel

The first runnable browser scenario failed because one pointer selection did
not open Component details. Before changing the field renderer, its existing
11 characterization tests passed with 183 assertions.

Focused TDD cycles then failed and passed for single-click nonmodal inspection,
owned-record navigation and baseline lists, and hidden-opener focus fallback.
The last case found a real defect: closing the panel tried to restore focus to
a hidden control. It now uses Baseline details when the opener is unavailable.
Back restores the originating list, expanded section, scroll position, and row
focus. Record identity uses saved IDs, including when names repeat.

Completed local checks:

- Eight new browser scenarios passed, including selection while the panel is
  open, keyboard access, camera preservation, and a 320 by 640 window.
- The full baseline browser selection passed: 52 scenarios, 361 steps.
- The final full browser suite passed: 65 scenarios, 437 steps, including the
  shared example workspace and all focus corrections. The large-hierarchy
  setup has a 30-second budget for its repeated zoom actions; its behavior
  assertions are unchanged.
- `bun run check` passed: 181 native unit tests, 48 DOM tests, 18 native
  Cucumber scenarios, and 25 interface tests. Lint, generated contracts, types,
  artifact links, dependencies, unused-code, and duplicate-code checks passed.
- `bun run habit-hooks --all` passed without findings. Snoozes remain empty.
- `bun run desktop:build` produced the macOS app and DMG. This is a build check,
  not installed macOS interaction evidence.

Logs for the failing and passing steps are under `reports/br-01-*` in the local
worktree. These ignored logs supplement this committed record.

Independent review found that pointer focus depended on browser defaults.
Regression tests failed before the fix. A canvas click now focuses its header
without moving the camera. If a toolbar action removes the focused panel row,
focus moves to the new panel heading. The reviewer checked both corrections
and reported no remaining findings. The focused inspection suite passes nine
tests with 28 assertions.

[PR #25](https://github.com/tomer-mayara/choom/pull/25) is draft.
[CI run 133](https://github.com/tomer-mayara/choom/actions/runs/43113165013)
passed on web, macOS, Ubuntu, and Windows for commit `bc39194`. Ubuntu also
passed the existing installed Linux suite. The final local macOS build produced
the app and DMG from the same production source. The later tickets add installed
movement and Reset coverage.

## BR-02: Show a compact component overview

The first runnable acceptance test used the built BR-01 app. It required five
component nodes and found eighteen. Focused TDD then drove component-only
layout, the 100% starting view, and compact component controls. All baseline
records still count toward the input limits. Interfaces, resources, and rules
remain available in the panel.

The new geometry uses one 240 by 88 control size for leaves and parent headers.
It starts at 100% zoom, centers the drawing when it fits, and otherwise reveals
the first root header in baseline order. Explicit Fit view keeps its existing
role. The obsolete ownership/permission edge renderer and mapping helper are
removed; the later connection-view ticket will derive its links from statements.

Independent review found internal text clipping at 125% text size. A stronger
browser assertion failed before the shared height and spacing were corrected.
It now checks whole name and count lines, their containment, and complete text
in the panel. The reviewer rechecked the correction and reported no remaining
source or test findings. Current native acceptance instructions were also updated.

Completed local checks:

- The final full browser suite passed: 68 scenarios, 463 steps. It includes
  readable reviewed names, explicit Fit, complete record access, unknown
  owners with known consumers, same-named interfaces, owner-as-consumer,
  independent statement statuses/references, and long text.
- `bun run check` passed: 184 native unit tests, 46 DOM tests, 18 native
  Cucumber scenarios, and 25 interface tests, plus the structural checks.
- The frontend build, TypeScript checks, and `bun run habit-hooks --all` passed.
  Snoozes remain empty. Existing Vite warnings are unchanged.
- Manager visual review passed for the 1280 by 800 overview and Workspace
  panel, the 320 by 640 stacked view, and long names at 125% text size.
  Screenshots and red/green logs are under `reports/br-02-*`.

Installed Linux verification passed: 18 scenarios and 95 steps in run
`run-mrUxBs`. The updated scenario checks five components without edges and
opens every reviewed interface/resource through the catalog, checking IDs,
owners, and statuses. The suite also checks all 21 Rules entries, native picker
cancellation and invalid files, original file bytes, and the 13 retired commands.

Before installing the candidate, the changed scenario failed a real assertion
against the unchanged BV-07 package, whose canvas had 18 nodes and 12 edges.
That run used the new harness but retained the old product identity separately.

The ordinary ARM64 release was built from reviewed tree
`26527f75f518e6a473abfee8633dff9925a335b8`. Production and harness files are
unchanged after that snapshot; this result was added afterward. The source
archive SHA-256 is
`ea2ad85c4206c970df9d0e0710f0a4f308b043289efcca0ad22df9d42e916102`.
The installed executable matches the package and the test runner metadata:
`92dacb23ec35b762b69b65b3fe1707c788f6761c2c7f8f77fb669914b55c5d64`.
The package SHA-256 is
`99054acdd61b3eed85cc5e41222ccee8ec4eb6368f11fdb064608e8659a00cc9`.
All 234 source files and 45 harness files matched the archive. The executable
hash stayed unchanged through the run, and all owned processes were cleaned up.
The archive, package, hashes, red/green reports, and logs remain in the task's
Linux evidence directory. Local `reports/br-02-installed-evidence.md` records
their paths and the separate product/harness identities.

[PR #26](https://github.com/tomer-mayara/choom/pull/26) is draft and is based on
BR-01. [CI run 135](https://github.com/tomer-mayara/choom/actions/runs/43121194697)
and the push workflow passed for commit `7a4e95b`. Web, macOS, Ubuntu, and Windows
checks passed. Ubuntu also passed the installed Linux acceptance suite.

## BR-03: Move components and keep the current arrangement

The first browser acceptance test ran against the unchanged, built BR-02 app.
Setup and the pointer gesture completed. The assertion required Workspace to
move 35 diagram units horizontally and observed zero movement. This was the
expected missing-feature failure, recorded in `reports/br-03-acceptance-red.log`.

Focused red/green tests drove an owned geometry copy, parent movement, child
containment, growth through ancestors, and rollback of positions and bounds.
The same rules handle pointer movement and 10-unit arrow-key steps. Pointer
events belong to the view that received the press. Cancellation and replacement
invalidate those events, including a release that would otherwise open details.

The inspection path, arrangement, and starting camera use the current
baseline/layout pair. Either object changing starts a fresh view. Ordinary
inspection, resizing, and failed or cancelled loads retain the current view.
Keyboard focus reveals a header with the smallest needed pan at the same zoom;
an oversized header exposes its leading name and focus edge.

Independent review found two defects, each covered by a failing regression
test before its fix. An intentional blur could leave stale focus ownership and
move focus on publication. A replacement that closed the panel could start its
camera using the previous, narrower canvas size. The fixes distinguish an
intentional blur from removal of a focused record and read the committed canvas
bounds for the starting view. The reviewer reported no other actionable findings.

Completed local checks:

- `bun run check` passed with 195 native unit tests, 60 DOM tests, 18 native
  Cucumber scenarios, and 25 interface tests, plus the structural checks.
  The limit case covers movement and rollback at 500 components and 16 levels.
- The final full browser suite passed: 91 scenarios and 642 steps, including
  all 23 BR-03 scenarios. The build and TypeScript checks passed.
- `bun run habit-hooks --all` passed without findings. Snoozes remain empty.
  Whitespace checks and 51 local Markdown link targets passed.

The final focus scenario captures the actual external focus target during a
held load. It does not require focus on Open Baseline after that button becomes
disabled. The camera and replacement assertions are unchanged. Intermediate
failures and final results are retained under `reports/br-03-*`.

Two installed attempts against the unchanged BR-02 package stopped at the
native picker before reaching movement. Those setup failures are kept separate
and are not claimed as missing-feature red. Native captures showed the correct
dialog and the location entry during its reveal. The test helper now gives
Ctrl+L and Ctrl+A the same 200-millisecond key cadence used for End and Return;
the file path and picker-close assertion are unchanged.

The normal harness then produced a clean native red in `run-zo8KDR`. File
opening and side-panel inspection passed; the real pointer drag failed the
assertion that Workspace must move. The old installed executable remained
`92dacb23ec35b762b69b65b3fe1707c788f6761c2c7f8f77fb669914b55c5d64`.
Its BR-02 product identity is separate from the new harness hashes. Final
verification used an ordinary BR-03 release package and passed: 19 scenarios
and 102 steps in `run-yvad7O`. The new journey checks real parent dragging,
child keyboard movement, retained inspection and camera, containment, focus,
and unchanged selected file bytes. The existing complete-record, native-picker,
invalid-input, and retired-command cases remain green.

The release was built from reviewed tree
`bbfc1d58b682bfef6b60852e6509573e626456de`, with source archive SHA-256
`6bcd10a1e4ee3b21af90d4d66a7d6a0516008318d832954d00d0b4d375dfda67`.
The package SHA-256 is
`c5cebfa23bf53174b679882c67c314a68886e33cc59937579181420e7b2d285d`.
The extracted and installed executable hashes match:
`28070fe68e47afda3f8970dce0075f4c3b833f34d556aee773e85b66cf5d29cd`.
All 241 source files and 48 harness files matched the archive after acceptance.
The executable hash stayed unchanged, and no owned app or driver process
remained. Production and harness files are unchanged after the tested snapshot;
this result was added afterward. Full identities and local paths are in
`reports/br-03-installed-evidence.md`.

[PR #27](https://github.com/tomer-mayara/choom/pull/27) is draft and is based on
BR-02. [CI run 137](https://github.com/tomer-mayara/choom/actions/runs/43128349950)
and the push workflow passed for commit `d3f4aa4`: web, macOS, Ubuntu, and
Windows checks are green, including installed Linux acceptance.

## BR-04: Restore the initial layout or fit the current arrangement

The first browser acceptance test ran against the built BR-03 app. Real file
opening, component movement, grown bounds, and navigation from the catalog to
an owned interface all passed. The explicit visible-control assertion then
failed because Reset layout did not exist. This was an assertion about the
missing feature, not a build, setup, or scenario-watchdog failure. Its log is
`reports/br-04-browser-red.log`.

Focused red/green tests drove restoration from the owned initial geometry,
repeated Reset, drag-token invalidation, current-canvas starting view, and
retained inspector content, scroll, and Back navigation. Reset uses the current
gesture owner and arrangement. It does not remount the viewer, reread the file,
or call the layout engine. Fit continues to change only the camera.

Independent review found that the live region kept old arrow-move coordinates
after Reset. A browser regression and a DOM regression failed before the fix.
Reset now uses the existing announcer to report **Layout reset.** The reviewer
rechecked the change and reported no further findings.

The final focused browser run passed 12 scenarios and 111 steps. The complete
browser suite passed 103 scenarios and 753 steps. `bun run check` passed with
199 native tests, 65 DOM tests, 18 native Cucumber scenarios, and 25 interface
tests, plus all structural checks. Explicit type checks, the frontend build,
and Habit Hooks passed; snoozes remain empty.

The clean installed red, `run-djM9ux`, used the unchanged BR-03 package with the
new harness. Opening, movement, the owned-interface path, and Fit completed.
The assertion then failed because the accessible Reset control was absent.
Earlier selector diagnostics are retained separately. The final installed run,
`run-Rc7z3I`, passed all 19 scenarios and 105 reported steps. The step count
includes Cucumber cleanup hooks. It verifies real parent dragging, child
keyboard movement, camera-only Fit, Reset with the current open-panel canvas,
retained interface details, Back through Workspace to the catalog, and original
file bytes. The complete-record, native-picker, invalid-input, and retired-command
cases also passed.

The ordinary Linux ARM64 release was built from reviewed tree
`af35b242e3e9cecde3fe26fbbf219ba2774febd7`, with archive SHA-256
`61027acac973db82e8e4f7d8a93b16a924a90ba05b54130cc3942e3cc1e2cfd9`.
The retained package SHA-256 is
`989c81c378fd5058790660d6f843a994458d02393bb74dc6745272649ea071d3`.
Its extracted and installed executable hashes match:
`d52f6b89534d7f02ca4e148bee076d5d24d36a74763dc7074b9ef3928b115017`.
All 244 source files and 50 harness files matched the archive after acceptance.
The executable hash stayed unchanged. Owned processes were cleaned up and the
container was stopped. Production and harness files remain unchanged after
that snapshot; these verification results were added afterward. Full identities,
logs, and paths are in `reports/br-04-installed-evidence.md`.

The final `bun run desktop:build` also passed on the macOS ARM64 host. It produced
`Choom.app` and `Choom_0.1.0_aarch64.dmg`. This verifies packaging; the installed
interaction evidence above comes from Linux.

The manager reviewed the complete candidate. The final Habit Hooks scan passed
without findings, with an empty snooze file. Whitespace checks and all 63 local
Markdown link targets and anchors passed. The final check, build, and scan logs
are retained under `reports/br-04-final-*`.

### Visual review of the complete first release

Manager review covered twelve captures from the ordinary built app. At 1280 by
800, all five component names and their interface counts are readable. The
Workspace panel shows its five owned interfaces without covering the canvas.
Pointer focus stays on the component; keyboard activation gives the panel a
visible focus indicator. Parent movement carries children. Child movement can
grow its ancestors and go off screen; Fit brings the current bounds into view,
and Reset restores the initial arrangement at 100% zoom. Inspection stays open.

Resizing to 1024 by 720 preserves the camera and positions, so some content can
remain outside the viewport. Fit and Reset remain reachable. At 320 by 640,
the panel sits below a usable canvas without horizontal page overflow. At 125%
text size, unusually long names occupy two complete lines on the component;
their full text wraps in the panel, which scrolls independently. Recorded
details remain reachable below the long text.

The first review found a filled Reset icon caused by React Flow's SVG rule.
The control now explicitly keeps the icon unfilled. Independent source review,
the complete check, and a fresh frontend build passed after this correction.
The final twelve captures were inspected again and show the outline correctly.
The visual script also confirmed unchanged source, build files, and selected
baseline bytes, with no browser errors. Its final report and observations are
under `reports/baseline-readability/final/visual-2026-11-12T00-53-18.872Z/`.

### Workload measurements

The final ordinary frontend build completed all eighteen runs: three fresh
browser contexts for each workload below. Chromium 158.0.8127.18 and Playwright
1.65.0 ran on the host described above, at 1280 by 800. The clock starts just
before the file picker receives the file and ends after exact component
coverage, zero diagram links, and three stable animation frames. Times include
automation and observation overhead. No latency target is asserted.

| Workload | Previous viewer load range (ms) | BR-04 load range (ms) | BR-04 median (ms) |
| --- | ---: | ---: | ---: |
| 500 root components | 377–377 | 446–523 | 452 |
| 500 components, 16 levels | 393–394 | 490–724 | 523 |
| 500 mixed records, 2,000 links, 16 levels | 643–661 | 387–537 | 453 |
| 120 records, 2,000 links | 494–574 | 350–469 | 436 |
| 500 rules, no components | 209–226 | 344–444 | 417 |
| Reviewed baseline, 39 records | 226–226 | 338–487 | 472 |

Both samples used the same host and browser versions, but the host was more
loaded in the final sample: one-minute load average 26.0 versus 4.8 previously,
on eight logical CPUs. Some observations are slower and some are faster. These
runs establish completion and record observed delay; they do not establish a
controlled performance comparison or a speed improvement.

Across component workloads, keyboard inspection took 11–66 ms, Escape with
focus return 6–53 ms, keyboard movement 4–44 ms, Reset 32–98 ms, and zoom
21–48 ms. Opening the 500-rule list took 33–66 ms; opening its last rule took
16–32 ms. All runs retained the selected file bytes. Component coverage,
finite geometry, and record access checks passed. Source, built files, and the
measurement script were unchanged during the sample. The report stores their
SHA-256 hashes, fixture counts and hashes, runtime versions, and host details.

Final measurements are in
`reports/baseline-readability/final/2026-11-12T00-53-53-288Z/measurements.json`.
The comparison sample is in
`reports/baseline-viewer/final/2026-11-11T15-10-31-067Z/measurements.json`.
Both are local ignored evidence; the observations above are the committed
record. The 120-second operation watchdog is not a performance requirement.

### Platform scope

Local installed acceptance verifies an unsigned Linux ARM64 release on
Ubuntu 24.04.5 with X11, GTK 3.24.41, and WebKit 2.52.6. It uses the native file
picker and the real app, without a test bridge or mocked file reader. The app
runs outside the checkout with an empty runtime PATH. The 320 by 640 checks
apply to the browser; the desktop window has a larger minimum size.

The macOS app and DMG build passed. Installed macOS, Windows, Wayland, and
desktop portal interaction checks remain unverified. CI platform build results
do not replace those interaction checks. The draft stack still needs the
repository's human review before merge.
