# Connection readability verification

This record covers BR-08A and BR-08B in the
[readability plan](../design/cr-baseline-viewer-readability-plan.md). BR-08C
and BR-08D remain planned at this layer of the stack.

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

The initial BR-08B implementation passed these local checks:

- Combined BR-07, BR-08A, and BR-08B browser acceptance passed 77 scenarios and
  573 steps, including touch and the off-screen keyboard transition.
- The complete Bun suite passed: 230 native tests and 134 DOM tests.
- `bun run check` passed, including 18 constraint scenarios and 25 interface
  tests. The frontend build and type checks also passed.

Cycle details are in `/tmp/choom-br08b-evidence.md`. The browser acceptance log is
`/tmp/choom-br08b-acceptance-green.log`. Fit still measured hidden labels at this
stage; BR-08D owns that change.

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
Only verification text and test-file whitespace changed after the snapshot.
Installed checks cover Linux X11/GTK; other installed platforms remain outside
this local check.

Remote CI is pending. The earlier results record the original BDD/TDD cycle.

### BR-08B

The full browser suite passed 180 scenarios / 1,325 steps, including a fresh
frontend build and type checks. Habit Hooks reported no findings and the
snooze file remains empty. Logs are `/tmp/choom-br08b-stack-browser.log` and
`/tmp/choom-br08b-stack-habit.log`.

The complete `bun run check` passed after the installed helper update:
230 native tests, 134 DOM tests, 25 interface tests, and 18 constraint scenarios /
57 steps, plus the static and contract checks. Its log is
`/tmp/choom-br08b-stack-check-final.log`.

A fresh Linux ARM64 release passed all 21 installed scenarios / 119 steps.
The package and installed executable hashes matched. Its source snapshot is
`b12b83d4c33585221d6f7298391fa1b525957b80`; build, identity, and acceptance logs
are retained with that tree in the local package evidence directory. Only
verification text changed after the snapshot. Remote CI runs on the draft PR.
