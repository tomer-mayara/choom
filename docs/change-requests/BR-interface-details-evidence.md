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
issue. [PR 37](https://github.com/tomer-mayara/choom/pull/37) is a draft at
`58b5bc6142e845d6758a06abe08f72e2120bd9ba`.
[CI run 43508348633](https://github.com/tomer-mayara/choom/actions/runs/43508348633)
passed web, macOS, Windows, and Linux jobs. The Linux job includes the existing
installed baseline-viewer acceptance. The complete installed BR-10 reading
journey and human reader check are still pending.

## BR-10B

The first browser scenario opened the unchanged baseline-003 and its interface
successfully, then failed because Overview was absent. The legacy projection
DOM test failed for the same reason. Five enriched browser scenarios and seven
focused DOM tests then failed on missing entry, interaction, or status content.
Each slice was implemented before proceeding. A same-ID reopening test exposed
retained Sources selection; a new inspection-frame key fixed that state leak.

The saved v1 baseline was copied unchanged to
`test/fixtures/baseline-viewer/legacy-baseline-003.yaml`. Both copies have SHA-256
`16e3aa95b0e119ab6e6946df203b4483229b87c7906dbef3cdd60ec8b8d8a34e`.

Validation on the final candidate:

- `bun run check`: passed, including 258 native units, 161 DOM tests,
  29 native Cucumber scenarios, and 31 interface tests. The manager repeated
  this check after the final reading-order and legacy-step corrections.
- The broad affected browser run passed 152 scenarios. Seven self-connection
  cases failed because two old step helpers still looked for raw fields in
  Overview. They now explicitly open Sources; focus assertions happen first.
- The final `@br-10b or @br-08c` run passed all 33 scenarios and 230 steps,
  including all 13 B scenarios and the corrected self-connection checks.
- The browser run rebuilt the frontend and checked types. Final lint,
  `bun run habit-hooks --all`, and whitespace checks passed; snooze is empty.
- Keyboard and viewport checks passed at 1280×800, 320×640, 1280×360, and
  200% text size. Screenshots show vertical scrolling without page-wide
  horizontal overflow. The manager inspected the wide and narrow screenshots.

React and manager review confirmed one mounted owner for entry/tab state,
derived entry lookup, lazy original-record serialization, and no new fetching,
execution, cache, or dependency. The inspector width is unchanged. Installed
test adapters retain complete value, status, reference, and focus assertions;
their assembled run remains part of CI and F.
