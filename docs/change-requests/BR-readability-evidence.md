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
