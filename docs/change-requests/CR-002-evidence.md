# CR-002 implementation evidence

Status: implemented. This record separates the original implementation checks
from the PR #45 follow-up below. An earlier GTK picker timeout remains
unexplained. The later macOS observation was an automated selection failure;
a [follow-up manual control](BV-macos-picker-investigation.md) opened the same
baseline in the unchanged app. The passing platform coverage is stated below.
The starting revision was
`e6c1835dc535455f088dce2f7b573d146ceffa94`; the original PR commit was
`b2ed4a62f5d17888a105571a44df3c45efe1e695`.

## Result and scope

[CR-002](CR-002-duplicated-interface-detection.md) adds an external assessment
after baseline recovery and a separate saved report in Choom. The producer
verifies a completed run, scans its saved source with pinned jscpd 5.4.2,
retains full EDN and JSON evidence, and accepts a recorded worker/manager review
packet. Publication uses the same strict decoder as the viewer. The process
still requires human or AI source review; the CLI does not invoke a model.

The browser and desktop read the baseline's original-byte SHA-256, then attach
only a matching report to that view session. Invalid replacement, cancellation
and late results preserve the current view. Reports have independent immutable
publication and navigation state. The Duplicates panel shows coverage, direct
owner counts, comparison facts and exact-entry inspection. Back restores the
previous reading state. No detector or evidence access is added to the viewer.

## Test-first evidence

The initial assembled browser scenario ran against the unchanged application.
Opening the baseline passed; the assertion that Duplicates was visible failed.
It had four passed steps, one failed assertion and two downstream skipped steps.
An existing installed release failed the corresponding assertion through its
real file picker. Missing dependencies and skipped steps were not counted as red.

Existing workflow and UI cases passed as characterization before their state
structure changed. Focused tests then covered each missing behavior. Cases
already satisfied by the shared load lifecycle stayed green; no production
behavior was broken to manufacture another failure. Later assembled scenarios
expanded the original journey after the smaller pieces worked.

| Tickets | Observed red boundary and resulting checks |
| --- | --- |
| DI-01-01–04 | Saved-run fixture specifications cover the inventory, real detector output, public mapping, bounded capability review, review dispositions and publication. The final producer record below identifies its test run and fixture provenance. |
| DI-02-01–02 | Cucumber and focused interface assertions received a failure instead of a decoded matching report or `baseline-mismatch`. Decoder and domain checks now cover strict YAML, identity, all four verdicts, references, grouped pairs, bounds and evidence shape. |
| DI-02-03 | Browser acceptance received no SHA-256; focused browser and native envelope assertions failed. Native command and file-reader assertions also failed before the digest was added. Tests now cover original BOM/CRLF bytes, byte limits and valid IPC envelopes. |
| DI-02-04 | Workspace acceptance received an unsupported-operation failure instead of an attached report. Ten focused cases now cover attachment, retained baseline identity, replacement, retry, cancellation, late completion and removal. |
| DI-02-05 / DI-04 | The initial ordinary browser and installed file journeys lacked Duplicates. The report picker contract also had no report request before its implementation. Final assembled runs use published producer files rather than a hand-written happy-path report. |
| DI-03-01–03 | Focused DOM assertions first failed for missing list, comparison and navigation behavior. Browser cases cover grouped same-owner counts, recorded judgments, exact second-entry selection, filtered Back, invalid replacement, removal and narrow keyboard use. |

Independent review found two ordinary-inspection regressions. Report replacement
and removal reset scroll from 94 to 0; a separate test showed that the focused
Remove report control disappeared and left focus on the document body. Both
were observed before fixes. The regression checks preserve tab, disclosure and
scroll, and transfer focus only when its control disappears.

Cross-contract review found that exact-token observations carried a null score
that the report reader rejected. A real jscpd token fixture reproduced failure
at publication. The producer now records score 1 and method `exact-token-block`:
equality under that token profile, not behavioral equivalence. Source-review
observations still have no structural score.

Independent producer review also exposed an ambiguous-mapping error. Whole
interface and entry mappings for the same source range could be treated as no
mapping and excluded as private helpers. The corrected collector distinguishes
zero matches from ambiguous matches. Ambiguity remains an unmapped coverage
gap. When jscpd counts fewer files than the selected source inventory without
explaining the omission, collection is partial; a complete capability review
does not erase that detector limit.

A second source-mapping case used private methods inside exported classes.
Containing class ranges must not map those clones to the public class interface.
The producer now requires an exact recorded range and leaves unsupported
containment as a mapping gap. Explicit token sub-block mappings retain separate
public declaration evidence. Both cases use actual pinned detector output.

The full browser regression run found that the added toolbar action collapsed
the baseline heading to zero width at 320 px. That red run was stopped after
the cause was confirmed. The toolbar now wraps its heading above compact
controls on small screens. Dedicated 320/390 px assertions and the existing
narrow baseline scenarios cover visibility as well as panel overflow.
At 320×640, a second assertion caught the report controls leaving too little
height to read the full verdict. Compact mobile actions and padding now preserve
readable content and the existing canvas/panel split. Desktop action labels are
unchanged; the mobile Open report action keeps its full accessible name.

A report ID at the valid 4-KiB limit also pushed the interface outside the
viewport when echoed in the fixed workspace announcement. Browser acceptance
observed a viewport ratio of zero, and a focused workspace test failed before
the change. The success announcement is now concise; the full report ID stays
in scrollable report details. All ten duplication browser scenarios pass with
these cases included.

The source interfaces are linked from [component manifests](../../src/component.yaml).
Focused reproduction commands are in the [README](../../README.md#duplication-review),
[report contract](../../cookbook/interfaces/interface-duplication.md) and
[producer guide](../design/app-a/duplication-assessment.md).

## Fixture review and limits

The calibration snapshot contains a lookup, alias, thin wrapper, different
lookup implementation, subscription functions, validation policies, and private
rendering helpers. The manager inspected source, mappings, coverage and review
decisions independently of the producer worker.

- Lookup, alias and wrapper return the same recorded invoice capability. The
  alternative Map implementation supports a source-review lead without an AST
  match. These are potential redundancies, not approved refactors.
- The subscription functions have separate state owners. One iterates a
  snapshot and isolates listener errors; the other iterates its live Set and
  propagates errors. Their structural match supports a justified distinction.
- The validators reject different character sets. Their AST score does not
  establish a shared policy; the report names the missing intent as insufficient
  evidence.
- Private helper clones remain in detector evidence and do not produce public
  findings or component badges. Type and data entries do not acquire invented
  call contracts.

The review identities in the saved test packet are fixture identities. They do
not claim an unattended model judged these examples. These tests verify the
recorded process and data flow. They do not measure semantic accuracy, false
positive rate or recall on production repositories. The initial Choom trial in
the CR is historical evidence, separate from these controlled examples.

Draft PR review identified a tool-identity limit in the original commit. The
manifest hashed the `duplication-*.mjs` helpers and lockfile and recorded the
runtime, but did not hash their imported shared codec, domain, parser and layout
sources. No shared source changed during the recorded runs. The PR #45 follow-up
below records the correction. Historical assessments retain their original
fingerprints and require the original trusted tool revision for producer checks;
the saved viewer report remains portable.

The final literal `start → collect → review → publish` CLI run used 21 public
endpoints in four bounded groups. It retained three AST pairs, one helper-only
exclusion and zero unmapped pairs. The detector examined seven of nine supported
inventory files; one other file was unsupported and the unexplained exclusion
count remained unknown. The scan and publication are partial; the recorded
capability review is completed. Five findings remain: three potential
redundancies, one justified distinction and one insufficient-evidence decision.
Sixteen producer specifications pass in both Node and Bun, including real token
collection and the mapping failures above. The independent reviewer reran them.

The published files and their [provenance](../../test/fixtures/interface-duplication/producer-provenance.json)
are saved in the test fixtures:

| Binding | SHA-256 |
| --- | --- |
| [Baseline](../../test/fixtures/interface-duplication/producer-baseline.yaml) | `76deb8a8fc7cc3afce97a61ea9e2001e1bbb8497052e082f4baa512a954d9254` |
| [Report](../../test/fixtures/interface-duplication/producer-review.yaml) | `e44c4f8ac779ec62b6a5c71d82c6af8979b2691ebd34bd29047228e1aa65886c` |
| Original snapshot inventory | `e368fc736e2b4382f977f04bc27cd1c0522733d7c728ac9737caf165c9dad3a9` |

## Choom source assessment and UI review

On 2026-11-14 UTC, assessment `duplication-choom-001` ran the actual
`start → collect → review → publish` commands against completed `run-004`.
It used `baseline-004` and `snapshot-004`, captured before the CR-002 changes.
The original run stayed unchanged. The saved assessment is a local analysis
artifact, not a repository test fixture or an audit of the newer working tree.

Three workers inspected all 10 whole interfaces and 28 documented entries.
The manager independently reviewed their source mappings and decisions.
There were no supported potential redundancies. All 14 saved source-review
comparisons had justified distinctions and no structural score. Examples are
Open versus Retry, browser versus desktop readers, and a generated declaration
versus its implementation. Target tests were read as evidence, not executed.

jscpd returned 35 AST and four exact-token observations. Of these 39 pairs,
38 were private helpers. The remaining pair matched `LoadWorkflow.subscribe`
and `ComponentArrangement.subscribe`; the latter has no endpoint in the bound
baseline. It remains an unmapped coverage gap. The detector examined 73 files;
152 files were unsupported by the profile, and total exclusions were unknown.
The bounded capability review completed, but the scan and assessment stayed
partial. This run does not establish semantic accuracy or recall.

The published report loaded with the matching baseline in Choom's built browser
viewer. The default list had no actionable findings; **Show reviewed
distinctions** exposed all 14 comparisons. Open/Retry, browser/desktop read and
Check/Publish comparisons displayed the saved differences. Inspect B on
Open/Retry selected the exact Retry entry; Back returned to the comparison.
Evidence showed source locations, hashes, opposing evidence and independent
review provenance. Recorded baseline facts kept their Proposed status.

The review identified a UI labeling issue and a native-picker verification limit:

- **Review incomplete** appears beside **Review: completed** when the scan is
  partial. The PR #45 follow-up changes the overall heading to
  **Assessment incomplete** and retains the separate scan and review states.
- The automated macOS native picker check left Open disabled for the selected
  YAML file. Its cause was not determined at that time. Browser-extension upload
  was unavailable with the current file-URL permission, so the UI review used
  the in-app browser. No permissions were changed. This was not a passing
  installed macOS journey.

A read-only PR comparison found no demonstrated picker regression: baseline
dialog options, YAML extensions, Tauri permissions, registration and dialog
dependency versions match `main`. The added report picker uses the same
extensions. Mocked IPC tests check those options, not the macOS panel. The
observation remained an acceptance limit without an established cause. The
[later investigation](BV-macos-picker-investigation.md) confirmed manual baseline
opening in this unchanged app and classified the automated attempt separately.
It did not establish a product fix or a passing complete macOS acceptance suite.

The producer and shared portable codec verified all 157 registered artifacts
and the original input identity after publication. The local report bindings are:

| Artifact | SHA-256 |
| --- | --- |
| Choom `baseline-004` | `272d7b251c6a853e462118a76f557ff1ab03e533e76175c5d78d26647233693a` |
| Choom duplication report | `91096113028dea746b9860a2e0dd40241d5a5da08a02965cd1e6b8d41635dcb8` |
| `snapshot-004` inventory | `d49862f14b7818ec5b3538c6c91b2e0f9e7370deb6a08dd7910c4ccff047b2d3` |

## Constraint review

| Constraint | Change and evidence |
| --- | --- |
| Behavior | Acceptance, focused unit/interface tests, real detector fixtures and installed file journeys cover the feature and existing viewer regressions. Test summaries follow below. |
| Interfaces | TypeSpec owns report, decoding, digest, picker and workflow contracts. Generated schema and TypeScript outputs remain current; `check:contracts` checks implementation conformance. |
| Dependencies | The report codec is platform independent. Boundary probes forbid filesystem/analyzer dependencies from it and keep jscpd outside production. No desktop capability or writable file access was added. |
| Observability | Load outcomes distinguish baseline/report operations. The report shows scan and review states, known or unknown counts, diagnostics and mapping gaps. There is no new production SLO or claim of measured reliability. |

The parser bounds file bytes, depth and nodes. Reports allow at most 1,000
findings and, per finding, 100 observations, 100 facts and 100 source records; 16 KiB per text
value, 4 KiB per reference, and 4 MiB across all string-value occurrences.
Boundary tests check valid limits and rejection above them. Scalar evidence and
diagnostic lists render as bounded text regions instead of a separate DOM
element for every string.

During UI review, the built Chromium viewer was measured with a valid 1,000-finding report
(1,177,699 bytes) and a 46-interface baseline (145,269 bytes) at 1280×800.
File selection to all 1,000 rows painted took 395 ms; opening a comparison took
51 ms; Back took 126 ms. The list had 7,031 DOM descendants and the camera stayed
unchanged. At 390 px, panel scroll width and client width were both 390 px.
These are single local observations, not a latency guarantee or a production SLO.
The manager also inspected installed comparison screenshots at 1200×800 and
740×800: the panel stayed readable and moved below the canvas at the narrow size.

## Original implementation checks

Verification uses Bun 1.4.4, Node 26.13.0 and Rust 1.99.1. The check commands
below ran before the follow-up, including shared viewer callers.

| Check | Result |
| --- | --- |
| `bun run check` | Passed: 298 native unit tests, 238 DOM tests, 36 browser-free Cucumber scenarios / 114 steps, 75 interface tests, lint, cookbook validation, generated contracts and type conformance, dependency probes, unused-code and duplicate-code gates. |
| `bun run check-types` / frontend build | Passed as part of the complete contract and fresh browser-build checks. These are static/build results, not behavior evidence. |
| `bun run test:e2e --tags @interface-duplication` | Passed: 10 scenarios / 65 steps using the final published fixture and bounded-ID variation. |
| `bun run test:e2e --tags @baseline-viewer` | Passed: 283 scenarios / 2,088 steps on the final product source, including version 1/2 baseline-only and duplication journeys. |
| `node --test test/interface/duplication/*.test.mjs` | Passed: 16 executable producer specifications. Bun also ran all 16 through the interface suite. |
| `bun run test:rust` | Passed: 10 Rust tests, including actual registered command/serializer and file-reader checks. |
| `bun run desktop:lint` | Cargo formatting and Clippy passed. |
| Linux `bun run test:behavior:packaged --tags @baseline-viewer` | Passed: 24 scenarios / 143 steps in the final serial run on the installed release executable. See the native record for earlier attempts and the selector correction. |
| `bun run desktop:build` | Passed on macOS ARM64; produced the final `.app` and `.dmg`. This is build evidence, not an installed macOS acceptance run. |
| `bun run habit-hooks --all` | Passed; `.habit-hooks/snooze.json` remains `[]`. Independent review findings were resolved. |
| Document text, relative file links and `git diff --check` | Passed. |

The [Linux package record](BV-native-acceptance.md#cr-002-linux-package-identity)
identifies frozen source tree `67d31b7a6d93d97fee57922dbb2156cc6c98e8cd`, package
and executable hashes, and the test-selector overlay. Product bytes were
unchanged by that overlay. The installed executable matched the package bytes
before and after the final serial run. One earlier GTK file picker did not close
after the driver entered a path. Its cause was not established; the failure and
the clean rerun are both retained. A later pass does not establish reliability.

The final macOS ARM64 build produced:

| Artifact | SHA-256 |
| --- | --- |
| `Choom_0.1.0_aarch64.dmg` | `0fa4f573002542f039274ce6df85fa3d23a466c9e240da1ada6363554d314c83` |
| `Choom.app/Contents/MacOS/choom` | `2f3ad8188e014a9b2b07db04d6efd9492a52356a45835d524354d9b56a6f649c` |

Installed acceptance covers Linux ARM64 with X11/GTK only.
macOS and Windows installed flows, Wayland and desktop portals remain outside
the observed acceptance evidence. Build warnings about existing large chunks
and the controlled browser harness's mixed static/dynamic layout import remain;
they are not behavior failures.

## PR #45 follow-up

The user requested CI and review checks, fixes, and merge. At the start of the
follow-up, both CI runs for `b2ed4a62f5d17888a105571a44df3c45efe1e695` passed:
web plus desktop on Linux, macOS and Windows. The
[PR workflow](https://github.com/tomer-mayara/choom/actions/runs/43558664281)
also passed installed Linux acceptance. There were no GitHub review submissions,
comments or unresolved review threads, and no required branch approvals.

The manager reviewed and corrected the two documented implementation issues:

- Tool identity now also hashes package metadata, the shared layout helper,
  both codecs, generated codec contracts, and all files in the domain and YAML
  parser folders. The sorted file set detects additions and removals as well
  as changed bytes. The manager checked that coverage against the current local
  import graph. The producer guide states that imports outside this coverage
  require an update. Existing assessments and saved fixtures were not rewritten.
- The overall coverage label is now **Assessment incomplete**. The separate
  **Scan: partial. Review: completed.** line remains. The Cucumber scenario and
  focused DOM test first failed for the missing corrected label, then passed.
  Only this observable wording changed; the report and workflow contracts did
  not change.

A disposable-copy experiment confirmed the fingerprint defect before the fix:
a changed `duplication-binding.ts` was accepted by the old check. After the fix,
11 mutations across the covered source groups, package metadata, CLI helper,
and added or removed domain files were rejected before phase output was written.
An unchanged control passed. This was a manual tooling check; no behavior tests
were added for tooling.

The complete `bun run check` passed again: 298 native unit tests, 238 DOM tests,
36 browser-free scenarios / 114 steps, 75 interface tests, and all static gates.
`bun run check-types` passed. The 16 producer specifications also passed under
Node. The corrected browser scenario passed all eight steps, and its focused
DOM file passed all ten tests.
