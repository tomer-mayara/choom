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
- A plus the affected BR-07/08/10 browser regressions: 190 scenarios / 1,393
  steps passed.
- PR #43 CI passed web and all three desktop jobs, including installed Linux
  acceptance, at commit `60ae8c402c876d5cfffa4660cd6891d8caac4f6b`.
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


## BR-11B — Source connections

The first browser acceptance failed at the new source arrow: expected one,
received zero. Focused unit and DOM tests then failed for the missing projection
and legend. Legacy permission cases already passed and remain characterization.

Version 3 now draws only application and tooling value references whose consumer
and provider are known. Repeated sites combine by interface and direct endpoints.
Other records stay intact. Unknown permission does not suppress source use, and
missing source data does not cause a fallback to permission. Versions 1/2 keep
their earlier arrow meaning. The legend states the meaning for the open version.

Completed B checks:

- Focused native tests: 18 passed, including existing arc tests. Focused DOM
  tests: three passed, including the existing reading behavior.
- Browser Cucumber: 10 scenarios / 89 steps passed through Open Baseline.
  Coverage includes repeated sites, different permission, omitted references,
  legacy versions, unknown callers, self-use, movement, Fit, and replacement.
- B plus the affected BR-07/08 browser regressions: 117 scenarios / 915 steps
  passed.
- Full `bun run check`: 332 native tests, 215 DOM tests, 49 native Cucumber
  scenarios / 150 steps, and 51 interface tests passed. Types, generated
  contracts, lint, dependency rules, links, unused code, and duplication passed.
- The frontend/browser build and `bun run habit-hooks --all` passed. No finding
  was snoozed. Manager review checked the complete B production and test diff.

PR #44 CI passed web and all three desktop jobs, including installed Linux
acceptance, at commit `ce17b8e37bc7d161f46020e320ac569b92732a8b`.

The first green browser attempt exposed an incorrect test locator (`Fit view`).
It was corrected to the existing accessible label (`Fit View`); no application
change was needed. Later acceptance runs use the corrected locator.


## BR-11C — Read callers and review scope

The first browser acceptance opened the interface but failed because Used by
was absent. Focused DOM tests then failed for the missing consumer groups,
assessment states, inline caller source and separate statement status. Source
projection tests and Sources assertions failed before their matching changes.
Existing Overview and Sources behavior passed as characterization first.

Used by now keeps the whole interface's source uses, grouped by direct consumer.
It preserves each site and entry binding. Type, test, unknown-context and
unmapped references remain available in Other source references. Missing data,
unassessed interfaces and scoped empty results have different messages. Sources
retains the common snapshot/mapping, exact locations, all supporting citations
and original assessment, separately from the original interface and intent
statements. The source notice does not count permission gaps as unknown callers.

Independent review found a large-input defect before commit: 2,000 uses citing
100 shared notes passed the public decoder but expanded into 200,103 list items
on the initial Sources view. New browser and focused DOM assertions failed on
these eagerly shown citations. Each note and evidence reference now has a lazy
Source uses (N) disclosure using the existing inspection state. With the same
valid input, initial Sources has 103 list items; opening Evidence references has
214, and opening one citation list has 2,214, including the last use. These are
rendered element counts, not browser timing claims.

Completed C checks:

- Focused native/DOM checks and the valid large-input regression passed.
- Full `bun run check`: 334 native tests, 236 DOM tests, 49 native Cucumber
  scenarios / 150 steps, and 51 interface tests passed. Types, contracts, lint,
  links, dependency rules, unused code and duplication also passed.
- Frontend build, `bun run check-types`, and Habit Hooks passed; snooze is empty.
- Manager and independent review checked the complete C change. Independent
  verification passed 37 DOM tests and seven provenance tests after the fix.
  No unresolved review finding remains.

The C reading cases cover accepted statements, unknown providers, duplicate
names, interface-wide entry bindings, inline source details, keyboard/touch,
short/narrow windows, Back and successful, failed, or cancelled replacement.
The final C plus BR-10/B browser regression passed 108 scenarios / 770 steps,
including all 19 C scenarios. The assembled published-file and installed
journeys remain F's scope.

## BR-11D — Analysis prompts

The original commands successfully emitted Stage 4/5 prompts, but review found
that they requested version 2 documentation without structured source consumers,
shared mapping, reviewed caller/binding evidence or exact unresolved subjects.
This was a prompt-content failure, not a command failure.

The changed Stage 4 generator and Stage 5 prompt block now request version 3
assessments. They distinguish source use, permission and execution; require
direct caller ownership and reviewed binding chains; retain type/test/tooling
and self-use; and keep partial, empty and manual-command scope explicit. Stage 5
must update the common mapping and recheck carried assignments and bindings,
even when ownership is unchanged. Supported documentation and literal method
signatures remain required. The existing nine-file packet remains unchanged.

Normal start/toolchain/run/collect commands emitted the reviewed prompts in
fresh disposable attempts. All six Stage 4 graph contexts completed. Stage 5
collection used a valid v2 predecessor, so this check does not depend on E.
Both emitted prompts were read in full. Syntax, 123 local file/anchor links,
the fictional YAML example and whitespace checks passed. The full C candidate
checks and Habit Hooks also included these files. No behavior test was added
for prompt tooling.

The new Stage 4 prompt SHA-256 is
`3eb824e9003719bff6f858fe44b29a5dfcea9707488fb05950563b8cc25181fe`;
the Stage 5 prompt hash is
`5fdc167a99129146fa10d5d51752ebe01320da3951aa873c8ca9395fa30a2942`.
The disposable checks used saved run 004 inputs and left its 1,111 registered
artifact hashes and manifest unchanged. They are prompt rehearsals, not new
completed architecture analyses. F records the complete successor publication.
