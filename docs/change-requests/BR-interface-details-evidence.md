# BR-10 interface details evidence

Status: implementation in progress. The six draft PRs follow BR-10A to BR-10F.
The approved scope is in [the plan](../design/cr-baseline-viewer-readability-plan.md#br-10-make-interface-details-useful).

## Scope

The viewer reads version 1 and version 2 files. The external workflow authors
new documentation. The BR-09 graph prototype is separate and is not delivered
by this stack. Reader validation and installed checks will be reported explicitly.

## BR-10A

The first native acceptance run rejected valid v2 input as `unsupported-version`:
10 scenarios failed and the strict-v1 case passed. The focused generated/runtime
contract run then had two failures. The bounds tests had seven failures before
the byte, count, and total-document limits were added. These were assertion
failures, not setup failures.

The Original record DOM test first failed because the disclosure did not exist.
It then passed with the complete saved record and unchanged input. The focused
details suite passed all 12 tests. A shell wrapper used a read-only zsh variable
after the red run; the saved test output independently records the assertion
failure. That shell error is not evidence of a missing feature.

The following checks passed on the A candidate:

- Native `@br-10a`: 11 scenarios and all steps.
- Browser `@br-10a`: 7 scenarios, 47 steps, through the built app and file input.
- Existing browser `@bv-03 or @bv-04`: 15 scenarios, 109 steps.
- Documentation shape, semantic, and limit tests: 30 tests.
- Decoder tests: 23 tests.
- `bun run check`: lint, 258 native unit tests, 152 DOM tests, 29 native Cucumber
  scenarios, 31 interface tests, generated contracts, types, cookbook links,
  dependency boundaries, unused code, and duplication checks.
- `bun run check-types` and the frontend build used by browser acceptance.
- `bun run habit-hooks --all`: passed; the snooze file remains empty.
- Plan and evidence links: 39 local targets exist. `git diff --check` passed.

The first browser attempt exposed shared fixture objects that YAML serialized
as anchors. The fixture now uses independent copies. The reader still rejects
anchors. The unsupported-version regression uses version 3 now that version 2
is supported.

Manager review and a separate contract review found no remaining A correctness
issue. Remote CI results are recorded below when complete. No installed or human
reader result is claimed.
