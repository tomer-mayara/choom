# BR-11 source-consumer evidence

This record tracks implementation of BR-11A through BR-11F in the
[readability plan](../design/cr-baseline-viewer-readability-plan.md#source-consumer-connections).
Source use, recorded permission, and runtime execution have separate meanings.
The viewer reads the saved baseline. The external producer reviews source and
publishes its findings.
The [integration checks](#integration-with-the-latest-main-branch) cover the
current stack after the duplicated-interface feature merged into main.

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

## BR-11E — Publisher validation

Before the change, the shared validator and the normal nine-file publisher
accepted a v2 candidate but rejected the corresponding valid v3 candidate at
the version gate. The changed shared validator and Stage 5 gate now accept the
strict v3 profile. They verify the run snapshot, current candidate mapping,
reviewed caller/binding records, direct caller ownership, exact unknown-field
subjects, local entry bindings and all reader budgets before replacing drafts.
Source locations reuse the documentation validator. The existing packet,
registry, frozen tools and manifest-last publication remain in place.

Completed E checks:

- 61 command/artifact cases passed, including empty assessments, direct source
  records, selected review history, wrong snapshots/mappings/owners, exact gaps,
  binding conflicts, inherited documentation limits and exact/over source bounds.
- 17 normal publisher CLI cases matched. Rejected packets left all three working
  draft hashes unchanged.
- Five public reader/display comparisons matched the publisher, including both
  independent 2,000-link/use caps and exactly 2 MiB of source data.
- Changed tools rejected an earlier pinned disposable attempt. Syntax and
  whitespace checks passed. No script behavior-test wrapper was introduced.
- Manager and independent review passed. Review found and fixed a valid-ID case:
  the component ID `unknown` is known; only a null consumer needs its ownership
  gap. The failing artifact probe passed after that correction.

A deliberate unpublished probe labeled a Baseline type import as a value use.
Structural validation accepted its shape. Manager source review corrected it to
a type reference with no arrow, demonstrating the need for semantic review.
The unsupported claim was not published.

Original run 004 verification passed with matching trusted tool bytes: 1,111
registered artifacts, 349 files, 5,737 references and 263 source records; no
writes. Its 1,114 checked registered/draft file hashes stayed equal. Its manifest
remains `d158566d677339e25a2f7cdd56488c125b45cf2eedd594ae6e21e777514c87e2`.
The pinned old tool path required a coordinated temporary restoration of four
trusted inputs. A finally block restored the current bytes and checked hashes;
no frozen run file or pin changed.

The normal v3 Stage 4 → 5 → 6 positive flow completed in F's fresh run 005.
Each stage passed manager review and independent verification. Its final
publication, digests and reader checks are recorded below.


## BR-11F — Published-file and installed verification

The first browser acceptance failed because the Used by section was absent.
The completed implementation passes the reading journey through the normal file
control. The fixture is an exact copy of the new published baseline; it is not
a hand-edited substitute for the publication.

The browser checks compare each arrow's interface, consumer and provider. They
cover All and Selected modes, hidden and shown self-connections, and unchanged
component positions. The complete reading journey covers all ten assessments,
all 28 documented entries, caller locations, supporting notes, original records,
examples, signatures and unknown permission. Native acceptance repeats this
journey through the installed application's real file picker and checks that
malformed, excessive and cancelled opens retain the current view.

### Fresh successor publication

The normal six-stage workflow published a new `run-005` / `snapshot-005` /
`baseline-005` under `/Users/tomermayara/git/work-choom/analysis-run-005/`.
Each stage used a fresh worker, manager review before publication, and an
independent manager check of its saved handoff. The trusted D/E tools were used
without changing their bytes during an attempt. The Stage 4/5 emitted prompts
and exact review packets were retained; Stage 6 used its normal readiness,
start, check, finish and verify commands.

The source is a new capture of the saved run 004 snapshot, with all 349 file
paths and hashes unchanged and the original exclusions and non-atomic capture
limits retained. It describes the saved v1/v2 viewer, not the live BR-11 code.
All 1,813 saved run 004 files were checked against their before hashes and are
unchanged. The old manifest remains
`d158566d677339e25a2f7cdd56488c125b45cf2eedd594ae6e21e777514c87e2`.

| Fixed record | SHA-256 |
| --- | --- |
| `baselines/baseline-005/baseline.yaml` | `25b6d48c510c4c7abf16a52f895ac9f9a15b36c15aac1c568d740aa038537a9e` |
| `runs/run-005/discovery.yaml` | `77f6a6064adc8ddf80d96bb037581ddd262eb1a4a8dad411ba0385ec22ccddad` |
| `run.yaml` | `53817fa3b3f781aa5d9e64b627188cf764ebaed4d9b58b00f1512cff08f3108f` |

The 188,714-byte baseline exactly matches the committed review fixture.
Completed-state verification checked 624 registered artifacts, 349 indexed
files, 6,511 references and 146 source records, with no writes. The final
coverage summaries name the selected reviewed ranges and four inspected paths;
they no longer say recovery is pending.

The result has six components, ten interfaces, 67 source-use records and all
28 documented entries. Source uses split into 28 application value, 13 test
value, 22 application type and four test type records. They produce five cross-
component and six self relations. All 20 known signatures match cited saved
declarations; one function signature remains explicitly unknown. The nine
application interfaces retain their previous documentation facts; the manual
producer's three command descriptions were refined against its saved dispatcher.
All ten permission policies remain null. The manual producer has no established
component caller in its stated review scope; operator examples do not create one.

The mapping has 161 proposed direct file owners and 188 unknown owners. Reviewed
ranges cover parts of 93 files. Graph and source scope remain partial. Five
question records and 40 gap records include history and linked clarifications;
they are not counts of current defects. Publication does not accept proposed
intent or establish runtime execution.

### Reader and layout check

The manager used the built viewer at 1440 × 900 and inspected its rendered
Overview, caller disclosure, Access rule and Sources. The displayed data supports
these answers:

- Used by describes references in the saved source. It does not show executed
  calls or a complete list of possible callers.
- Access rule describes permission. The ten policies remain unknown despite
  the known source connections.
- Selected mode and hidden self-connections filter the drawing. They do not
  remove the source-use records from interface details.
- Caller source and Sources show saved locations, scope and supporting notes.
  Choom does not load those files or verify their hashes.
- The retained method signatures are literal saved declarations. Examples are
  displayed text; Choom has not run them.

The manager inspected Saved baseline model validation. Overview identified
Baseline workspace and its `decodeBaselineYaml` call. The caller disclosure
showed `src/lib/baseline-yaml.ts`, lines 1–43, snapshot and full hash. The 17 type
references stayed in Other source references. Access rule explicitly said that
permitted components are not recorded. Sources showed the selected mapping and
partial review scope. The manager could distinguish all of these meanings and
would proceed with this source-use feature. Reaching the caller still required
vertical scrolling; the content remained readable. No browser errors occurred.
This check does not validate the deferred BR-09 diagram redesign.

This is a manager self-check, not a separate user study. The browser tests also
check 390 × 640 and 1280 × 400 windows. They measure the actual Record content
scroll area and bring the final caller/note, path, line range and hash into the
viewport below the sticky tabs. No horizontal clipping was found in those cases.

### Supported-limit measurements

Measured on an Apple M1 Pro with eight logical processors and 16 GiB RAM,
macOS 27.0.1 (26A434), Chromium through Playwright 1.65.0, Bun 1.4.4 and Node
26.13.0. These measurements were repeated after main integration. Values below
are elapsed milliseconds, rounded to the nearest millisecond.

| Input and window | File open | Interface open | Final source reached |
| --- | ---: | ---: | ---: |
| 2,000 uses / 4,000 notes; 390 × 640 | 1019 | 7132 | 11762 |
| 2,000 uses / 4,000 notes; 1280 × 400 | 845 | 6925 | 11159 |

The final-source time starts when interface opening starts. The exact-limit
payload is 2,097,152 compact JSON bytes of source data and 2,620,465 YAML bytes.
Its file SHA-256 is
`a58003997251b3eabdae69da7b3ff67d2c40003f8add768632c37bc44d6c465d`.
Opening the largest supported interface still takes about seven seconds on this
host; these checks establish reachability, not fast interaction.

The 2,000-callers/100-shared-notes case opened its file in 1454 ms and
Sources in 205 ms. The final use in one expanded citation list was reachable
after 593 ms from opening Sources. Its 99 other lists stayed closed. This
input has 1,731,408 source-data bytes and 4,266,569 YAML bytes; file SHA-256
`1263d5548106ae6c5a74d90acf62a9e3719ee60e66c39ac219083598923f7a1d`.

The times include browser automation and normal control interactions. They are
measurements on the named host, not a performance guarantee. The final use and
its source remain reachable. Shared citations open on demand; unopened notes do
not create hundreds of thousands of repeated rows.

### Installed build before main integration

The package checked before main integration was built and installed from Git tree
`8b88053cf4093a48fea630e76b7e9f3c785cd4ab`, captured with a temporary index.
The real index was unchanged. All 388 archived source files matched after the
build, and all 130 test-harness files matched during acceptance. There were no
test overlays. Later changes to the plan and this evidence document do not alter
the built application, harness or fixture.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Source archive | 4,024,320 | `3157256d19c8454de4b9096a77c2755cdabcb3f709321da6dd8ac4769a249674` |
| `Choom_0.1.0_arm64.deb` | 3,750,232 | `ee1bc2c86d4ad5079b8ebc5cca1a78c9d93e9c7fc8e1f7e80d3385c31086fbcf` |
| Installed executable | 11,834,968 | `5e8744bab9cc756d09b0e4d349052211ad5c47c4c39eae897a3f08c421494e2c` |

The installed executable matched the package-extracted executable. The actual
native picker opened a copy of the fixed publication, not injected application
state. The driver recorded the real executable, external working directory and
an empty analyzer-runtime PATH through `/proc`.

Platform: Ubuntu 24.04.5 ARM64, four visible CPUs, Linux 6.8.0-117-generic,
Bun 1.4.4, Node 26.13.0, Rust/Cargo 1.99.1, tauri-driver 2.1.0 and
WebKitGTK/driver 2.52.6. Focused F acceptance passed two scenarios / 13 steps in
run `run-9sWBFZ` against the fixed publication. The full installed
`@baseline-viewer` regression then passed 25 scenarios / 148 steps in
`run-vHvXMI`, using the same package, fixture and unmodified harness.

Build/install used the existing task-owned `choom-br10-validation` container
and the frozen archive. The installed acceptance command was:

```sh
CHOOM_PACKAGED_APP=/usr/bin/choom-desktop \
CHOOM_PACKAGED_BUILD_ID=git-tree:8b88053cf4093a48fea630e76b7e9f3c785cd4ab \
xvfb-run -a dbus-run-session -- bun scripts/run-packaged-behavior.ts --tags @br-11f
```

The product evidence is under
`/Users/tomermayara/.cache/choom-br10-validation/work/evidence/products/tree-8b88053cf4093a48fea630e76b7e9f3c785cd4ab/`.
The run evidence is under the same work root at
`choom/test-results/packaged/run-9sWBFZ/`. Browser readings, measurements,
publication audits and manager screenshots are under
`/Users/tomermayara/.codex/tmp/br11f-manager/`.

Local checks before main integration passed:

- `bun run check`: 334 native unit tests, 236 DOM tests, 49 native Cucumber
  scenarios / 150 steps, and 51 interface tests. Lint, generated contracts,
  cookbook links, dependency rules, unused code and duplication also passed.
- `bun run check-types` and `bun run build`: TypeScript checks and the
  production frontend build passed.
  The existing bundle-size and mixed static/dynamic import warnings remain;
  a build result is not behavior evidence.
- F browser acceptance: five scenarios / 44 steps through the normal file
  control, including the exact reviewed baseline and supported-limit cases.
- `bun run habit-hooks --all` passed on the complete candidate; the snooze
  file is empty. Manager and independent F review found no open issue.
- Earlier A–C evidence records legacy version transitions, late work, movement,
  Back, failed/cancelled opens and the affected BR-07/08/10 regressions. F reuses
  these passing protections and adds the assembled published-file journey.

The capacity regression belongs to C's independently found large-input defect;
F retains its focused DOM test in this verification change. Native feedback
found two test-harness problems (object-property ordering and an ambiguous
heading selector). Their fixes passed against the installed application; no
production change was needed. Independent review also strengthened the final
field visibility checks to measure the inspection area itself.

The native checks cover a local unsigned Linux ARM64 release package under
X11/GTK, with desktop portals disabled. macOS and Windows CI compile, lint and
test the native shell; they do not establish installed interaction on those
platforms. No target behavior was executed during the source analysis itself; viewer acceptance is a separate
check of the newly built Choom application.

## Integration with the latest main branch

PR #45 added duplicated-interface review while this stack was in progress.
All six BR-11 branches now include main commit
`ddd78b9`. The integration keeps both features. Earlier sections retain the
checks made before this update; the checks below apply to the combined candidate.

The duplicate-report reader initially rejected a valid report bound to a
version 3 baseline. A new native acceptance case failed at `baseline.formatVersion`.
Five focused assertions also failed for schema acceptance, entry binding,
recorded facts and entry names. BR-11A now supports version 3 at those boundaries.
The report format remains version 1. Exact baseline identity and byte-hash binding,
version 1 entry restrictions, and recorded statement meanings remain unchanged.
TypeSpec outputs were regenerated.

After the fix, 26 focused tests / 90 assertions, five native report scenarios /
19 steps, and 11 browser report scenarios / 75 steps passed. The unchanged
external report producer also completed normal start, collect, review and
publish commands against a disposable fictional version 3 run. The public reader
resolved its saved signature. Input hashes stayed unchanged; this rehearsal did
not change either published analysis.

BR-11C preserves the reading state introduced by duplicate review. A passing
browser characterization attaches a report through its normal file control,
checks the exact source arrow, follows a comparison to a non-initial entry, and
returns. It checks caller and citation disclosures, separate tab positions,
focus, component positions, camera and unchanged input bytes. The combined
source-reading and duplicate-review regression passed 31 scenarios / 226 steps.
No production correction was needed for that navigation.

The combined candidate passed `bun run check`: 361 native unit tests, 263 DOM
tests, 56 native Cucumber scenarios / 175 steps, and 87 interface tests. Lint,
generated contracts, cookbook links, types, dependency rules, unused code and
duplication checks passed. Explicit type checking and the frontend build also
passed. Native checks passed ten Rust tests, formatting and Clippy.
The full browser baseline-viewer regression passed 323 scenarios / 2,410 steps,
including all F published-file and capacity checks. The supported-limit
measurements above were refreshed from this run. The final records remained
readable below the sticky tabs without horizontal clipping.
`bun run habit-hooks --all` passed on the complete candidate. No finding was
snoozed. The manager reviewed the final diff and the independent review result.

Normal Stage 6 verification still checked 624 registered artifacts, 349 indexed
files, 6,511 references and 146 source records, with `writes: []`. The fixed
baseline and committed fixture retain the published hash above. All 1,813 run
004 file hashes remain unchanged.

The manager reopened the fixed baseline in the combined production build at
1440 × 900. Caller source, mapping, review limits, and unknown permission remained
readable and separate. The rendered caller still identified `decodeBaselineYaml`
and its saved source location. No browser errors occurred. The independent
integration review found no actionable issue in the contracts, prompts, reading
state, native driver or published fixture.

### Current installed package

The combined candidate was built and installed from committed Git tree
`42773afe6605ae014d3f9dab98b505856d5331e4`. All 443 archived file hashes and
154 acceptance-harness hashes matched during both runs. There were no overlays.
The installed executable matched the executable extracted from the package.
Only this evidence document changed after the source was frozen.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Source archive | 4,495,360 | `aadfc827532b32faeb04920d368fa72d519601076ea1b5dc31ff6f8b4388bc27` |
| `Choom_0.1.0_arm64.deb` | 3,768,218 | `64762719bcebcb7ec1df2d867012435aa4871d002de2b22b0bed30e2c92f9f0d` |
| Installed executable | 11,835,640 | `a1e54d353f958f0a92b90ba5a7577f9aa298ee2a9bd886f5f55df60d24078b8c` |

Focused installed F acceptance passed two scenarios / 13 reported steps in
`run-vDB3DN`. The full installed baseline-viewer suite passed 26 scenarios /
156 reported steps in `run-dKE6uR`. These counts include reported hook steps.
The full suite includes the native duplicate-report open, comparison, entry,
Back/focus, invalid replacement and removal flow. Both runs used the real picker,
the same package and exact published baseline bytes. No harness fix was needed.

The platform and installed command are the same as above, with
`CHOOM_PACKAGED_BUILD_ID=git-tree:42773afe6605ae014d3f9dab98b505856d5331e4`.
The product folder is
`/Users/tomermayara/.cache/choom-br10-validation/work/evidence/products/tree-42773afe6605ae014d3f9dab98b505856d5331e4/`.
Its per-run summaries record the package, executable, source and harness hashes.
The manager independently checked the source archive and package digests.
Linux X11/GTK remains the tested installed platform.
