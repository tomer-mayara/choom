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

The first B CI run passed all three desktop jobs, including installed acceptance.
Web CI exposed 15 failures in the old relationship and Reset scenarios. Two
shared helpers still expected raw interface fields in Overview. Both now enter
Sources before those reads; all original field, status, reference, geometry,
scroll, and Back assertions remain.

The focused `@bv-05 or @br-04` browser run passed 18 scenarios and 161 steps
after this correction. It used the shared checkout's then-current built C
artifact, which retains the same Sources contract. The B follow-up commit
contains only those two helper changes and this evidence; its new CI run checks
the exact B snapshot independently of C.

Before the signature restack, [PR 38](https://github.com/tomer-mayara/choom/pull/38)
was checked at
`cf0242cb973fc55391a896007ccbd82e95871e92`.
[CI run 43513816522](https://github.com/tomer-mayara/choom/actions/runs/43513816522)
passed all four jobs, including full browser acceptance and the Linux installed
baseline-viewer journey, on that corrected B snapshot.

## BR-10C

The first browser run opened a valid interface and passed 35 setup steps, then
eight scenarios failed because Example was absent. Five reading tests and then
12 copy/lifetime tests failed before their respective implementations. A real
tab-return test exposed lost scroll position; the focused test also showed
Sources inheriting Example's position. One position per tab and sticky tab
controls fixed both cases.

Narrow and short-window tests then exposed focus outside the visible record
area. Post-commit restoration now scrolls only Record content and keeps its
focused control visible. Visual review found that the sticky strip could still
cover that control by 20 pixels. Stronger browser and DOM assertions captured
that failure before the padding/border correction. An entry change in Overview
clears the Example bookmark without moving Overview.

Copy feedback belongs to the current request and mounted frame. Tests cover
exact saved whitespace and Unicode, missing or denied clipboard access,
synchronous and asynchronous failures, both out-of-order outcomes, repeated
local IDs, entry A→B→A, direct same-ID selection, closing, and baseline replacement.
Tab changes keep the current case and request. No test or UI claims to cancel
an operating-system clipboard write.

The broad browser run passed 90 scenarios and 643 steps across BR-10 and
BR-01/07C/08C. The focused DOM suite passed 21 tests and 80 assertions. The full
check passed 258 native tests, 182 DOM tests, 29 native constraints, and 31
interface tests, plus contracts, types, lint, links, boundaries, unused-code,
and duplication checks. After the visual-review correction, the rebuilt
`@br-10c` run passed all 27 scenarios and 185 steps. The complete check passed
again with the same counts, and Habit Hooks and whitespace checks passed.
The snooze file is empty. Final settled screenshots at 1280×800, 320×640,
1280×360, and 200% text size show the focused choice below the sticky tabs.

The manager reviewed state ownership, copy lifetime, lazy content, and actual
wide/narrow screenshots. Overview/Sources disclosure persistence remains D's
scope; installed clipboard behavior remains F's scope. The inspector width,
graph navigation, source-file behavior, and baseline bytes are unchanged.

Before the signature restack, [PR 39](https://github.com/tomer-mayara/choom/pull/39)
was checked at
`a7f8e32ce6767efbfa86bc143882d410a6e29281`.
[CI run 43515327307](https://github.com/tomer-mayara/choom/actions/runs/43515327307)
passed all four jobs, including full browser and Linux installed acceptance.


## BR-10A signature follow-up

The reader now preserves an optional signature statement for function entries,
including methods. It retains literal parameters and return type, independent
status and references, and the difference between missing and unknown. Other
entry kinds reject the field. The existing UTF-8 field and aggregate limits
include it; a saved source note can cite a signature alone.

The new native acceptance scenario failed at the unsupported field before the
implementation. The focused contract suites first had 20 failures, then passed
all 51 tests. Native acceptance passed 12 scenarios / 36 steps; browser
acceptance passed 7 scenarios / 47 steps, including full Original record equality.
The A snapshot's full check passed 269 native tests, 152 DOM tests, 30 native
constraints / 93 steps, and 41 interface tests. Types, frontend build, generated
contracts, lint, boundaries, unused-code and duplicate checks, and Habit Hooks
passed. The manager reviewed the contract, semantic rules, generated diff,
limits and reference tests. The follow-up commit is
`077026ab6e1f7e5e705ba48e804d246a99cfaf65`. CI must run again on the restacked heads.

## BR-10D

Sources starts with saved descriptions and supplied source locations. Recorded
statements, deduplicated evidence IDs with all citing paths, and the complete
Original record are separate disclosures. The source projection also supplies
the header's mixed-status summary. Choom does not read or verify source files.
One explanation says evidence content is not included. The Original record
preserves field values, not YAML formatting.

A valid-file browser acceptance case first failed at the missing source note.
Focused projection and UI tests failed before their implementations. Existing
Original record behavior remained characterized. Native disclosure choices now
belong to the mounted interface frame and survive tab changes. Legacy tests
read the complete record without dropping value, reference, focus, or graph
assertions.

The full browser suite found two long-example scroll regressions after Sources
became shorter. Focus and mouse-down could repeat a tab transition, and Radix
mounted the new body after the parent tried to restore its position. A focused
red test captured the duplicate transition. A synchronous guard and restoration
from the mounted lazy body fixed both causes. A later short-window failure
showed a deferred disclosure opening below an already focused control. Its
focused test failed before a separate focus-only reveal fixed it. These changes
do not reset reading position during copy feedback or move focus outside the
record.

The final D run passed all 266 browser scenarios / 1960 steps. The complete
check passed 262 native tests, 196 DOM tests, 29 native constraints / 90 steps,
and 31 interface tests. Frontend builds, type checks, lint, cookbook, contracts,
boundaries, unused-code and duplicate checks, Habit Hooks, and whitespace checks
passed. The snooze file is empty. The manager reviewed the projection, lazy
content, state ownership, and scroll/focus fixes. Screenshots were inspected at
1280×800, 320×640, 1280×360, and 200% text. Both OS color preferences use the
app's current light palette; this is not a dark-theme claim.

These D results precede the signature UI follow-up. Its checks and the final
installed-app and reader checks are recorded below when complete.


### Signature display and restacked validation

A valid signature baseline first loaded through the browser file control, then
failed at the missing Signature block. Focused UI and projection tests failed
before the declaration display and common statement traversal were added. The
selected function now shows its literal declaration, parameters, and return
type. Unknown and missing signatures have different messages; other entry kinds
have no method-signature block. Signature-only evidence, independent status,
acceptance reference, and Original record are retained.

Manager review caught a reading-order issue in the first implementation: a
signature alone hid the existing general behavior. A failing characterization
captured it. The older prose now stays visible until a saved description or
known interaction supplies explanatory detail.

All 68 BR-10 browser scenarios / 466 steps passed after the signature change.
The final nine signature scenarios / 65 steps also passed with a stronger real
mouse-wheel check: readers can bring the return type into view below the sticky
tabs at narrow and short sizes. Long literal declarations remain wrapped, retain
their exact text, and cause no source request or navigation. The full check
passed 274 native tests, 209 DOM tests, 30 native constraints / 93 steps, and 41
interface tests. Build, types, code hygiene and Habit Hooks passed; the snooze
file is empty. The manager inspected the code and actual wide/narrow/short
rendered panels. Final assembled acceptance is recorded in BR-10F below.

The contract addition was restacked without changing the B/C behavior patches.
All four CI jobs passed on these updated heads:

| PR | Head | CI |
| --- | --- | --- |
| [37](https://github.com/tomer-mayara/choom/pull/37) | `077026ab6e1f7e5e705ba48e804d246a99cfaf65` | [43521403660](https://github.com/tomer-mayara/choom/actions/runs/43521403660) |
| [38](https://github.com/tomer-mayara/choom/pull/38) | `4edc237627cb4c3d92265d0fbc0f04070af50535` | [43521407254](https://github.com/tomer-mayara/choom/actions/runs/43521407254) |


## BR-10E

The separate producer supports version 2 documentation with the same shapes,
UTF-8 limits and display limits as the reader. It keeps existing version 1
records readable. Saved proposed statements need resolving evidence; unknown
facts need their exact discovery subject. Source-reviewed examples need their
own reviewed range and matching source note. Located notes retain the captured
snapshot, path, hash and line range. No publisher turns an inference into an
accepted claim.

Both the Markdown prompts and actual Stage 4/5 emitted prompts request source-
supported function declarations with parameters and return types. Signatures
have their own statement and evidence. Missing types stay unknown; no type or
parameter is inferred from prose. The shared publisher rejects wrong-kind
signatures, missing metadata, unexplained nulls, unsupported references and
excessive content before replacing drafts. Frozen tools and manifest-last
publication remain intact. The bounded YAML reader also enforces the viewer's
file, syntax and structure profile before publication.

Command checks first demonstrated the old producer rejecting documented v2 and
later rejecting the new signature key. Valid and invalid candidate artifacts
then checked the corrected boundary. Checks include 22 documentation rejection
cases, bounded YAML cases, 15 signature artifact cases and six signature cases
through the ordinary publisher. Rejections left working drafts unchanged.
These are command/artifact checks for external tools, not product unit tests.

Manager review corrected two semantic issues that schema checks cannot detect:
the exported schema object had initially been classified as a function, and
a later starter-value description claimed startup behavior unsupported by its
source. It is now a data entry, and its description only says it supplies an
example baseline value. Each correction used a fresh run. Prior completed runs,
fixed baselines, and their tool pins were preserved.

The final demonstration is a replay of the captured analysis snapshot, not a
new analysis of the BR-10 implementation. The normal Stage 4→5→6 sequence
completed in `/Users/tomermayara/.codex/tmp/choom-br10e-flow-006/`. It inspected six
dependency contexts and the saved 40 Stage 4 plus 89 Stage 5 source requests.
Final verification checked 1,191 artifacts, 280 snapshot files and 272 source
records, resolved 3,984 references, and reported `writes: []`. The manager reran
that read-only verification successfully.

Final baseline: `baselines/baseline-003/baseline.yaml` in that run. It is 46,990
bytes, SHA-256 `cc16625927985c9cc05e85ed9152ad5d0d24ffaa040663cbb9a7007eaf34adda`.
All four publication copies are byte-identical. Its literal declaration is
`export function decodeBaselineYaml(text: string): DecodeBaselineOutcome`.
The manager checked it against captured `src/lib/baseline-yaml.ts:6` and inspected
its rendering and source location through the normal browser file control.
New v2 with a signature, prior v2 without one, and original v1 pass the current
public decoder and display boundary. F commits a byte-identical published fixture
and checks the installed route.

Five changed script syntax checks, 45 relative Markdown links, and whitespace
checks passed. The complete candidate's existing build/type/Habit Hooks checks
also include these unchanged ten app-a files. The original analysis run and its
input copy still match across all 1,755 files. All 96 pre-existing original
checkout documents also retain their saved hashes. Unrelated BR-09 work remains
in its original checkout.
