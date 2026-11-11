# Baseline readability verification

This record covers BR-01 to BR-04 in the
[readability plan](../design/cr-baseline-viewer-readability-plan.md). Each ticket
is a separate draft PR based on the previous ticket. BR-05 and BR-06 are deferred.

The first release is still in progress. Each section records completed checks;
it does not claim that an unfinished ticket or an untested platform works.

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
