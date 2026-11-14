# BR-11 source-consumer evidence

This record tracks implementation of BR-11A through BR-11F in the
[readability plan](../design/cr-baseline-viewer-readability-plan.md#source-consumer-connections).
Source use, recorded permission, and runtime execution have separate meanings.
The viewer reads the saved baseline. The external producer reviews source and
publishes its findings.

## BR-11A — Contract and reader

The first native Cucumber run rejected valid version 3 input as
`unsupported-version`. The new success assertion failed after fixture setup;
the strict version 1 and 2 cases already passed. Invalid-case failures at this
point also reported the unsupported version instead of a field error.

The first browser run also failed two feature assertions: the original source
record disclosure was absent, and a version 3 permission produced an Admin
arrow. The invalid-replacement cases already passed as characterization.

Version 3 now retains the complete source record, applies strict shape and
reference checks, and enforces independent use, note, and byte budgets. It
inherits version 2 documentation checks. Versions 1/2 reject the new field.
The viewer suppresses permission projection for version 3 and exposes its
original source data. B and C add the formatted source connections and details.

Completed A checks:

- A native Cucumber: 19 scenarios / 57 steps passed.
- A browser Cucumber through the normal file control: 4 scenarios / 27 steps passed.
- Full `bun run check`: 319 native unit tests, 214 DOM tests, 49 native Cucumber
  scenarios / 150 steps, and 51 interface tests passed. Lint, cookbook links,
  generated contracts, types, dependency rules, unused-code and duplication
  checks also passed.
- Contract generation, `bun run check-types`, frontend build, whitespace, and
  `bun run habit-hooks --all` passed. The snooze file remains empty.
- Manager review checked the complete A production and test diff, including
  strict old versions, inherited refinements, separate budgets, source-location
  validation, safe error messages, and atomic replacement.

A changes behavioral and interface constraints. It keeps dependency rules and
OpenSLO definitions unchanged. Contract and feature artifacts are linked from
the existing component manifests. Human approval of changed constraints remains
part of review before merge. These checks do not establish an installed-app
journey; F records that assembled route.
