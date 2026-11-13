# Connection readability verification

This record covers BR-08A in the
[readability plan](../design/cr-baseline-viewer-readability-plan.md). BR-08A is
implemented. BR-08B to BR-08D remain planned at this layer of the stack.

## Scope and constraints

Selected mode starts with a component overview and no arrows. The existing
inspection path determines which connections are shown. All mode displays the
complete known arc set. Each successful open starts a new view. Failed and
cancelled opens preserve the current connection mode.

The behavioral constraint and workspace notes describe the viewer change. The
baseline format, native file-reader contract, load workflow, dependency
boundaries, and OpenSLO contract retain their existing definitions. Counts,
unknown endpoint meanings, validation limits, and original file bytes still
reflect the complete baseline.

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

The initial BR-08A implementation passed these local checks:

- The complete Bun suite passed: 230 native tests and 121 DOM tests.
- Combined BR-07 and BR-08A browser acceptance passed 65 scenarios and 489 steps.
- Lint, cookbook links, frontend build/type checks, and whitespace checks passed.

Earlier BR-07 tests now choose All when they require the complete arc set.
Unknown-endpoint cases also run in All, so the quiet Selected default cannot
make a no-arcs assertion pass without checking endpoint eligibility. Local
cycle details are in `/tmp/choom-br08a-evidence.md`; the browser acceptance log is
`/tmp/choom-br08a-acceptance-green.log`.

## Draft stack validation

### BR-08A

The reconstructed BR-08A branch passed `bun run check`: 230 native tests,
121 DOM tests, 25 interface tests, and 18 constraint scenarios / 57 steps.
The full browser suite passed 168 scenarios / 1,242 steps, including a fresh
frontend build and type checks. Habit Hooks reported no findings; the snooze
file remains empty. Logs are `/tmp/choom-br08a-stack-check.log`,
`/tmp/choom-br08a-stack-browser.log`, and `/tmp/choom-br08a-stack-habit.log`.

A fresh Linux ARM64 release package passed all 21 installed scenarios /
119 steps. The packaged and installed executable hashes matched. The source
snapshot is `3299df179a45bf205d15fa07e704bdf6d9262b3a`; build and acceptance
logs are retained with that tree in the local package evidence directory.
Only verification text changed after the snapshot. Installed checks cover
Linux X11/GTK; other installed platforms remain outside this local check.

Remote CI is pending. The earlier results record the original BDD/TDD cycle.
