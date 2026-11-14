# CR-002: Detect and review duplicated interfaces

**Status:** Implemented and verified within the platform coverage in the
[evidence record](CR-002-evidence.md). No merge is requested.

**Date:** 2026-11-13

**Scope:** External architecture assessment and browser/desktop viewing of its
saved results. Implementation and verification follow the tickets in this CR.

## Problem and intended result

The previous process recovered components and their interfaces without a required
review for interfaces that offer substantially the same capability.
Ordinary duplicate-code checks do not establish that two public operations are
redundant. This change adds a separate recorded duplication review to the viewer.

Add deterministic candidate collection followed by source-based AI assessment
and independent manager review. Save the result separately from the baseline.
Let a reader load that report, see affected components and interfaces, compare
each pair, and understand the evidence and meaningful differences.

An interface is the public capability recorded in the baseline, including its
public entries and promises. A candidate can involve two interfaces of one
component, interfaces of different components, or two distinct recorded entries
of one interface. Similar TypeScript declarations alone do not establish overlap.

The viewer remains read-only and works without a source checkout, analyzer,
runtime executable, or AI connection. It displays recorded judgments. It does
not run detection, accept findings, edit reports, consolidate code, or infer that
the source has stayed unchanged since the recorded snapshot.

## Evidence from the Choom trial

On 2026-11-13, jscpd 5.4.2 scanned a frozen copy of clean Choom commit
`e6c1835dc535455f088dce2f7b573d146ceffa94`. The native binary's package checksum
matched the repository lockfile. No source or configuration changed.

| Scope and settings | Result |
| --- | --- |
| Current TypeScript/TSX scope; minimum 10 lines; similarity 0.8 | No pairs |
| Same scope; minimum 3 lines; similarity 0.8 | 2 AST links |
| Also include JavaScript helpers and Rust; minimum 3 lines; similarity 0.8 | 17 AST links and 4 exact blocks |
| TypeScript/TSX; minimum 3 lines; similarity 0.7 | The same 2 AST links |

The expanded EDN report held 35 AST candidate pairs. The JSON report held fewer
links because jscpd represents groups with connecting pairs and avoids repeating
pairs already covered by token clones. These counts are not defect counts.

The two app pairs were subscription registration in
[LoadWorkflow](../../src/architecture/load-workflow.ts) and
[ComponentArrangement](../../src/lib/component-arrangement.ts), and the private
`Field`/`Fact` helpers in [architecture details](../../src/components/architecture-details.tsx)
and [interface overview](../../src/components/interface-overview.tsx).
Both pairs scored 1.0. The subscriptions have different state owners and
notification behavior; the UI pair duplicates a private rendering helper.
Neither established a redundant public capability.

The tooling scan found useful differences: [Stage 2 `safeName`](../design/app-a/stage-2-commands.mjs)
and [Stage 4 `safePath`](../design/app-a/stage-4-commands.mjs) scored 1.0 while
rejecting different character sets. Normalizing literals hides the difference
between their regular expressions. Whether the policies should agree remains
a review question. This trial supports using the detector to direct inspection;
it does not measure recall or establish automatic semantic classification.

## Place in the current process

Keep all six stages of [start-here.md](../design/app-a/start-here.md) as design
Step 1: baseline recovery. Add duplicated-interface assessment to
[design Step 2](../design/llm-led-architecture-analysis.md#step-2-investigate-isolation-and-granularity),
then publish its findings for
[Step 3](../design/llm-led-architecture-analysis.md#step-3-show-findings-on-the-baseline).
The start-here handoff names this follow-up.
Require a recorded duplication-assessment outcome: completed, partial, or not
checked with a reason. Completion of the six baseline stages remains independent
and must not be presented as a completed duplication check.

1. Start a new assessment run referencing the completed Step 1 baseline and
   snapshot. Verify their saved digests and reuse matching trusted tool inputs.
   Use a new manifest and artifact registry; do not rewrite the completed Step 1
   manifest, baseline, discovery, saved helpers or tool pins.
2. Collect deterministic candidates and coverage into registered evidence files.
3. Map each candidate to supported public interface identities. Keep unmatched
   implementation clones and ambiguous mappings in the assessment evidence.
4. Have the worker inspect mapped candidates, contracts, callers and relevant
   tests. Reading tests does not establish that they passed.
5. Have the manager independently review mappings, explanations, opposing
   evidence, coverage and the complete candidate packet before publication.
6. Validate and save the report and its evidence in the new assessment manifest.
   Preserve unfinished review as explicit coverage; publication does not accept
   a baseline statement or authorize a refactor.

## Deterministic collection and AI assessment

Use the already pinned jscpd 5.4.2, with its
[versioned function-similarity behavior](https://github.com/kucherenko/jscpd/blob/v5.4.2/docs/rust.md#function-level-similarity-with---similarity).
The first advisory profile compares JavaScript/TypeScript implementations,
including JSX, TSX, `.mjs` and `.cjs`, at similarity 0.8, minimum 3 lines and
minimum 20 normalized AST nodes. Keep exact-token results separately, using
weak mode and the current 100-token minimum. The token minimum does not govern
AST units. Keep the existing repository duplication gate unchanged.

Run against saved source with a trusted, explicit configuration. Record the
binary/version, configuration, source inventory and output digests, invocation,
limits, exclusions, exit status and diagnostics. Do not load target executable
configuration, install target dependencies, run target code, or enable embedding
or remote-analysis modes. Use controlled output paths outside the snapshot.

Retain both JSON and EDN, including the full EDN candidate set. Validate their
structure and reconcile their counts before using them. An exit caused by an
advisory duplication threshold is distinct from a failed detector. A missing,
invalid, failed or empty-scope run must never become a successful zero result.
Report scan state as `completed`, `partial`, `failed` or `skipped` with reasons.

Record unsupported languages, bodyless declarations, excluded tests/generated
files, small functions, unresolved imports and incomplete interface mapping.
Inventory counts are not eligible-function counts. Use unknown counts when the
tool cannot supply them. Rust may be evaluated under a separate recorded profile;
the initial producer profile does not claim Rust or cross-language coverage.

Use saved ownership, declarations, exports/re-exports and references to establish
the connection from source ranges to baseline interfaces. Record that mapping's
evidence. Do not assign a private helper clone to its nearest public interface.
Keep helper-only duplication outside interface alert counts. An unresolved
endpoint stays in coverage evidence until it can be mapped without guessing.

The worker may propose a pair through source review even when jscpd finds no
match. Record origin `source-review` and a null structural score. Each pair must
state the overlapping capability and compare accepted inputs, success results,
failures, side effects, ordering, state/resource ownership, lifecycle, callers,
access policy, compatibility requirements and reasons to keep both operations.
Missing facts remain unknown. Matching names, signatures or scores cannot fill them.

| Recorded status | Meaning and required explanation |
| --- | --- |
| `needs-review` | Public endpoints are mapped; semantic assessment is pending. |
| `potential-redundancy` | The worker and manager support a shared capability and a reason to consider consolidation, with evidence and meaningful differences. |
| `justified-distinction` | Review supports retaining separate capabilities; record the decisive distinction and evidence. |
| `insufficient-evidence` | The endpoints are known, but missing facts prevent a supported judgment; state the exact gaps. |

These are assessment statuses, separate from baseline proposed/accepted status.
Potential redundancy is a recorded judgment, not proof of equivalence or a confirmed
rule violation. Recommendations remain optional proposals. Apply
[DRY3](../coding-principles.md#share-proven-concepts-and-keep-abstractions-simple)
to a later extraction decision; it does not suppress detection of a pair.

## Portable report and identity

Publish an optional `interface-duplication-review.yaml` alongside the external
assessment artifacts. Its content has document kind `interface-duplication-review`
and report `formatVersion: 1`. The filename is conventional. This is a separate
document contract; baseline formats 1 and 2 and their exact fields stay unchanged.

| Record | Required meaning |
| --- | --- |
| Report metadata | Unique report ID, run reference, creation time and producer/version. |
| Baseline binding | Baseline ID, baseline format version and SHA-256 of the original baseline file bytes. |
| Snapshot binding | Snapshot ID and inventory digest used by collection and review. |
| Scan and coverage | Profile/version/settings, scope references, examined/excluded/unsupported counts when known, scan state, diagnostics and mapping gaps. |
| Review coverage | `pending`, `partial` or `completed`, with inspected and pending pair counts and remaining limits. `completed` cannot contain `needs-review` pairs. |
| Pair | Stable ID, two endpoints, saved comparison statements, origins, detector observations, recorded status, overlap statement, differences, rationale, evidence, counterevidence, gaps and optional recommendation. |
| Endpoint | Existing `interfaceId` and optional existing `entryId`; mapping evidence identifies the supporting saved declaration or access point. |
| Comparison fact | Endpoint and topic (`input`, `success`, `failures`, `effects` or `lifecycle`). A `recorded-contract` fact references a supported baseline statement without copying it. A `source-review` fact has a state: `known` with value and evidence, `unknown` with a named gap, or `not-applicable` with a reason. |
| Source reference | Snapshot ID, safe snapshot-relative path, file SHA-256, positive inclusive line range, and registered evidence reference. |
| Review provenance | Worker/model identity and settings reference, manager review identity, review time and decision references; concise rationale, no hidden reasoning. |

An endpoint's owner and display name come from the bound baseline. Unknown
owners remain valid. A report cannot introduce foreign interface or entry IDs.
Version 1 baselines support whole-interface pairs only; never invent entry IDs.
Endpoints must name different interfaces, or two distinct recorded version 2
entries of the same interface. Reject an interface paired with its own entry,
as well as an endpoint paired with itself.

Keep applicable comparison facts; do not require five copied facts for every
endpoint. Missing applicable information stays unknown with a named gap. Preserve
separate facts where the recorded contract and source review differ; validate
baseline statement references against the bound record. The viewer renders these facts without
extracting facts from prose or changing the baseline's promises or statuses.

Group observations between two different interfaces under one interface-pair
finding, including whole-interface and entry observations. A pair of distinct
entries of the same interface forms an entry-pair finding. Produce a stable ID
from the baseline digest, snapshot identity, finding kind and sorted interface
IDs, or the owning interface ID and sorted entry IDs for an entry pair. Preserve
the exact endpoints of each observation. Each finding has one status and count.
Do not infer A/C overlap from A/B and B/C. Preserve independent pair judgments.
Structural scores are finite values from 0 to 1, with method and tool provenance;
null means no structural score. They are not confidence or probability values.

The producer validates registered evidence, source ranges and hashes before
publication. The viewer validates the report's shape and its links to the loaded
baseline; it does not fetch evidence paths or verify the source checkout.
Show external evidence references as recorded references with evidence not loaded.

Use strict single-document UTF-8 YAML with the existing parser protections.
Reject unknown fields, unsupported versions, invalid references, duplicate pair
identities and non-finite scores. Apply these bounds before publishing the view:

| Limit | Bound |
| --- | --- |
| Selected report file | 16 MiB, with existing depth 32 and 250,000-node parser limits |
| Findings | 1,000, including hidden `justified-distinction` records |
| Text value | 16 KiB of UTF-8 bytes |
| IDs, paths and reference strings | 4,096 UTF-8 bytes each |
| Source records | 100 per finding |
| Observations and comparison facts | At most 100 observations and 100 facts per finding |
| Total metadata | 4 MiB: sum every string value in the report, including IDs, paths, digests, references, diagnostics and prose; count repeated occurrences without deduplication |

Keep the baseline's existing record, link and depth limits. Report limits are
additional. Reject excessive reports with a useful limit error; never silently
drop findings or truncate their evidence to make a report fit.

## Loading and view lifetime

After a saved baseline is open, **Open duplication report** explicitly selects
one YAML file. Match its baseline ID, format version and original-byte SHA-256.
Do not discover adjacent files or follow report references automatically.
The built-in example has no selected-file digest and cannot attach a report;
explain that the reader must first open a saved baseline.

Compute the baseline digest at each bounded read boundary before UTF-8 decoding.
The current [browser decoder](../../src/platform/browser-documents.ts) removes a
UTF-8 BOM, so hashing its decoded/re-encoded text would not identify the original
bytes. Native reading must use the same byte rule. Extend the relevant TypeSpec
read/workflow contracts and implementation bindings to carry the digest. Retain
the digest alongside the current view; retaining original baseline bytes is not
required. Reformatting the file intentionally requires a newly bound report.

Bind report loading to the current baseline session as well as its digest.
Validate completely, then attach atomically. Wrong ID/version/digest, invalid
references, read failure, cancellation or exceeded limits preserve the baseline
and previously attached report. Ignore late results after the session changes.
A successful baseline open clears the report even when record IDs repeat.
A failed baseline open preserves both. Successful report replacement starts a
new report-navigation session; failure preserves current navigation and filters.
**Remove report** detaches only the in-memory attachment and its badges. It
invalidates pending attachment results and clears all navigation frames and
filters tied to that report, including endpoint frames reached through a pair.
If the current path uses the report, show the empty Duplicates panel and focus
**Open duplication report**. Otherwise preserve ordinary record inspection.

Use one active file-load operation. Keep Cancel/Retry behavior explicit for the
selected operation; do not let a report retry reopen a baseline or vice versa.
Keep the current read-only native capabilities. No analyzer process, network,
file-writing or evidence-following capability is added to the installed viewer.

## UI presentation

Keep the [component-first canvas and single side panel](../design/cr-baseline-viewer-readability-plan.md).
Add a workspace action **Duplicates** that opens the report list in that panel.
With no attachment, show **No duplication report loaded** and the explicit
**Open duplication report** action. Loading a baseline alone makes no duplication
claim. After loading, show report date, baseline binding, coverage and separate
counts for the four assessment statuses.
In narrow windows, the action reads **Open report** and keeps the full accessible
name. Compact controls must leave the comparison content readable at 320×640.

The list shows `needs-review`, `potential-redundancy` and `insufficient-evidence` by
default. **Show reviewed distinctions** also shows `justified-distinction`. Keep report order
stable. Each row names both interfaces, owners or **Owner unknown**, entry names
when present, status and a short overlap/difference statement. Use IDs where
names repeat. A score is secondary evidence, never the row's verdict.

| Location | Display and count rule |
| --- | --- |
| Component card/header | **N possible duplicates** counts unique finding IDs except `justified-distinction`, touching directly owned interfaces. A pair inside one component counts once. Descendant-owned and unknown-owner interfaces do not increase the parent's count. Keep the existing owned-interface count separate. |
| Interface list row/details | Show the number of related findings except `justified-distinction` and an action to open its filtered list. Reviewed distinctions remain available through the filter. |
| Global Duplicates list | Include all valid endpoint pairs, including unknown-owner and same-component pairs. Component badge totals need not add up to the global pair count. |
| Selected pair | Show the recorded status, both endpoint identities, overlapping capability, important differences, comparison facts, evidence and gaps. |

Hide zero component/interface badges. For partial scan, review or mapping
coverage, label the summary **Review incomplete** and explain missing scope;
missing badges are not a clean bill of health. Show helper-only and unmapped
candidate counts separately in coverage, or unknown when unavailable. A completed
zero-candidate assessment says **No public-interface candidate pairs found in
the recorded scope**. An assessment whose mapped pairs are all `justified-distinction` says
**All recorded pairs have reviewed distinctions**, alongside any coverage limits.
Failed/skipped scans say detection was not completed; show their diagnostics
rather than a zero-result message.

In a pair, label the two endpoints **A** and **B** and compare input, success,
failures, effects and lifecycle using supported saved facts. Keep baseline
statement statuses visible. Default to stacked sections in the existing narrow
side panel; use columns only where both remain readable. Place method and
**Structural similarity** under Evidence, with text that it does not measure
behavioral equivalence. A null score reads **No structural score**.

Illustrative pair panel; this fictional example is not a Choom finding:

```text
Back to Duplicates
Justified distinction — recorded judgment
A  Billing / Invoice lookup / findInvoice
B  Support / Invoice lookup / getInvoice
Overlap: both return an invoice by its stable ID.
Difference: B applies a support-role access check.
[Inspect A] [Inspect B]
Evidence: source locations, review references, structural score
```

Add no duplicate relationship arcs. Existing **may use** arcs retain their
permission meaning and current visibility controls. Opening a duplicate list or
pair preserves camera, component positions and layout; do not fit automatically.
Under **Connections: Selected**, a list or pair opened from a component or
interface keeps that originating record's connection scope and highlight. The
global Duplicates action starts with no selected record scope. **Connections:
All** keeps its existing meaning. Endpoint inspection uses that interface's
normal scope; Back restores the preceding scope with its inspection frame.

Selecting either endpoint opens its normal interface details in the same panel.
For an entry endpoint, select its exact recorded `entryId`; a whole-interface
endpoint uses the normal initial entry. Do not substitute the first entry for
the operation named by a finding.
Back restores the pair, then its originating list or interface context, including
filters, selected entry/tab, disclosures, scroll and row focus. Scope this state
to the current view/report session, not a global cache keyed only by record IDs.

Direct canvas selection starts a new inspection path. Escape keeps active-drag
cancellation precedence, then existing disclosure/panel behavior. Keyboard
activation focuses the new panel heading; pointer selection keeps its expected
canvas focus. Returning focus must handle a removed opener. Keep the panel
non-modal, stack it below the canvas on narrow windows, and use text labels as
well as color. The viewer offers no accept, reject, dismiss or merge controls.

## Acceptance requirements and delivery

These are the required outcomes. Production work starts with failing Cucumber
acceptance and focused TDD, preserving current behavior with characterization
where needed. Tooling uses executable fixture specifications and manual review.
The completion evidence records observed results and platform limits separately.

| Case | Required observable outcome |
| --- | --- |
| Two public operations serve the same supported need | A mapped pair records its overlap, differences, evidence and independent review; UI shows the saved status. |
| Identical subscription code has different state owners | Review can record `justified-distinction`; a score of 1.0 does not force overlap or consolidation. |
| Identical shape with different validation literals | Review preserves different accepted inputs and an unresolved policy question when intent is unknown. |
| A private helper clone has no public-interface mapping | Retain it in tool evidence; add no interface pair or component badge. |
| Source review finds overlap with no AST match | Save origin `source-review`, null score and evidence; UI renders the candidate normally. |
| Small/bodyless/unsupported code or ambiguous mapping | Coverage states the omission; a zero tool result makes no complete-coverage claim. |
| Repeated A/B evidence and A/B plus B/C | Deduplicate A/B observations; do not invent A/C or multiply badge counts. |
| Whole interface paired with its own entry | Reject trivial containment; permit two distinct recorded entries of the same interface. |
| Absent, zero, all-distinct, partial, failed or skipped report | Each has its specified distinct message and honest counts. |
| Correct report with unknown owners or two interfaces of one owner | Global access works; same-owner pair counts once; unknown owners receive no inferred badge. |
| Matching IDs but different file bytes/version, or foreign endpoint | Reject attachment and retain the prior view/report. |
| Baseline with BOM, CRLF, or changed formatting | Browser/native producer and reader agree on exact original-byte binding. |
| Cancellation, late completion, replacement, retry or removal | Commit only to the intended session; preserve prior state on failure; clear attachment on successful baseline replacement. |
| Pair → endpoint → Back; keyboard and narrow window | Open the named entry and restore the specified inspection and connection scope without changing camera or positions; all content and focus remain usable. |
| Report removal while inspecting an endpoint reached from a pair | Remove obsolete return frames, filters and badges; show the empty Duplicates panel and focus Open duplication report. |
| Exact report bounds and one value over each bound | Accept valid boundary input; reject excessive input without partial display. |
| Existing version 1/2 baseline with no report | Existing opening, interface reading, arcs and layout behavior remain available. |

| Phase | Deliverable and completion gate |
| --- | --- |
| DI-01 — Producer assessment | Controlled detector profile, complete-pair normalization, source/interface mapping and review packet; fixture/manual evidence covers positive overlap, distinctions, gaps and failures. Update start-here handoff and Step 2/3 guidance in that change. |
| DI-02 — Saved contract and binding | TypeSpec report/read contracts, generated outputs, strict runtime validation and byte-digest/session rules. Interface checks cover identity, bounds, versions and invalid references in both read paths. |
| DI-03 — Viewer | Report loading, status/list/count projection, pair inspection and navigation. Browser acceptance covers the complete saved-file journey and existing view regressions. |
| DI-04 — Assembled verification | Producer output opens through ordinary browser and packaged desktop file controls. Record platform, fixture hashes, coverage and reading-task results; resolve material failures before completion. |

Assess all four constraints under the [new feature cookbook](../new-feature-cookbook.md).
Behavior changes need Cucumber artifacts; interface changes need TypeSpec and
generated-output/conformance checks. Dependency rules must keep the detector in
external tooling and parsing independent of UI/platform effects. Observability
must report scan/review/load outcomes and gaps without claiming measured
production reliability; change OpenSLO artifacts only when that contract changes.
Update affected `component.yaml` links and CI checks with implementation.

Use repository-pinned runtimes and dependencies for implementation verification.
Run affected behavior checks, `bun run check`, `bun run check-types`, frontend
build and `bun run habit-hooks --all`; keep the snooze file empty. Native changes
also require Cargo tests, formatting, Clippy and packaged desktop acceptance.
Record environment limits explicitly. Review document text and links separately
from the behavior checks.
See the [implementation evidence](CR-002-evidence.md) for observed results and
the final published fixture identities.

Calibrate detector thresholds and review effort before making this an enforced
gate. Measure false positives, missed public overlaps, mapping gaps and bounded
viewer responsiveness on representative repositories. The trial supplies no
recall estimate. Keep old reports tied to their pinned tools and snapshots;
updated tool behavior requires a new assessment, not rewritten historical results.
A finding is not resolved merely because a later scope or detector reports fewer
matches; record comparable evidence and a new review decision.

## Appendix — Tickets

All 12 tickets are implemented in the local candidate. The initial appendix was
a plan; its scenarios were not executed by the documentation change. Red and
green below define the implementation sequence. The
[completion evidence](CR-002-evidence.md) records observed failures, passing
checks and limits. The main CR uses the same verdicts, finding identity and fact
rules as these tickets.

The implementation work is split into 12 tickets. Each ticket has its own
acceptance case, expected missing behavior, dependencies and focused TDD slices.
Keep the separate report file as the current delivery choice; a bundled format
would need a separate design decision before changing these tickets.

The following rules govern the implementation:

| Subject | Ticket rule |
| --- | --- |
| Verdict | Use `needs-review`, `potential-redundancy`, `justified-distinction` or `insufficient-evidence`. The latter three are mutually exclusive reviewed outcomes; overlap alone does not select a verdict. |
| Identity and counts | Group whole-interface and entry observations for two different interfaces under one canonical interface-pair finding. Two distinct entries of the same interface form an entry-pair finding. Each finding owns one status, scoped rationale and count; observations retain their exact endpoints and evidence. |
| Comparison facts | Reference supported baseline facts and add applicable source facts. Do not require five copied facts for every endpoint. Distinguish unknown from not applicable; unresolved findings need not invent an overlap claim. |
| Discovery | Review the bounded public inventory even when jscpd finds no match. Save review coverage and source-supported leads; do not infer semantic equivalence from a score. |

Start implementation by registering the assembled acceptance gate below. Use a
frozen example report until the producer can supply the saved fixture. Run the
browser case against the current app and record the missing report-opening
behavior. Run the installed case against an existing bundle on its target
platform when available. Record any platform limit. Continue with the producer
and contract tickets at their own boundaries, then return to the assembled
journey with the producer's output.

1. Write and run the acceptance scenario first. For production changes, put it
   in a Cucumber `.feature` file and run it through the relevant public path.
   For external producer behavior, use the scenario as an executable fixture
   specification at the assessment boundary. Check that an assertion fails
   for the missing behavior. Undefined or skipped steps, missing dependencies,
   and setup errors do not establish red. Record the failure and its cause.
2. For **each** numbered TDD slice, write and run a failing unit, interface or
   integration test; make it pass with the smallest implementation; then refactor
   with the test green. Run the focused test again after refactoring. The slices
   below state the behavior each test protects. Producer tests use saved inputs,
   outputs and review decisions, without a live model call. These tests validate
   the recorded process and data; they do not establish semantic equivalence.
   The worker and manager must also review the real fixture evidence. Check
   document text, configuration and tool setup with their relevant checks;
   do not invent behavior tests for prose or for jscpd's internal implementation.
3. Rerun acceptance and affected regressions. Establish passing characterization
   of existing behavior before changing its structure. When a slice needs more
   than one independent behavior change, give it a child ticket with its own
   acceptance and focused checks. If earlier work already makes a case pass,
   keep it green and narrow the ticket to the remaining missing behavior. Do not
   break an existing feature or add redundant code to manufacture a red result.
4. Link the changed constraints and document their focused commands. Define
   changed Choom-owned contracts in TypeSpec and regenerate their outputs.
   Link production feature files under `cookbook/behavior/` from the owning
   `component.yaml`. Register new step code with the relevant runner and use
   ticket IDs as tags. Keep native Bun and DOM checks in their separate runners.
   Apply DRY3 when refactoring. Use the verification commands in this CR and
   record any platform or environment limits in the completion evidence.
5. Classify tests by the repository definitions. An interface test checks a
   public contract; integration needs real collaboration between Choom
   workspaces. Do not add a workspace just to obtain an integration test. Put
   suites under the owning component in `test/unit/`, `test/interface/`,
   `test/integration/` or `test/acceptance/`, as applicable. Keep shared fixtures
   outside those folders and register new suite locations in local runs and CI.

For each completed ticket, retain the acceptance red and green results, focused
test results for the TDD slices, the refactor checks, and any unresolved limits.
A ticket is not complete while its required acceptance case is failing.

### DI-01-01 — Start an assessment with a public endpoint inventory

```gherkin
Scenario: Inventory the public endpoints of a saved baseline
  Given a completed baseline and its saved snapshot include callable, type and data interfaces
  When the analyst starts a duplication assessment
  Then the assessment records its own run and the public endpoints in scope
  And it lists coverage gaps with their reasons
```

Expected red: The follow-up has no assessment run with endpoint coverage tied
to the saved baseline. Depends on no earlier ticket.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Interface test with saved fixtures.** A matching baseline and snapshot open
   a new assessment run with its own manifest and artifact registry. A changed digest produces a
   diagnostic before collection. Compare the original run's file hashes before
   and after both cases.
2. **Unit test.** Inventory interfaces and, for version 2, their recorded
   entries, including aliases, exported wrappers, bodyless declarations and
   type/data records. Keep unresolved mappings, excluded paths, unsupported
   languages and omitted scope visible. Distinguish unknown totals from known
   zero, and source file counts from detector-eligible function counts.

Done when the saved inventory and gap reasons can stand on their own. Record the
scope and the stable references used by the next ticket.

### DI-01-02 — Collect and account for detector evidence

```gherkin
Scenario: Preserve the clone observations from a controlled scan
  Given an assessment inventory covers a saved JavaScript and TypeScript fixture
  When the analyst runs the approved detector profile
  Then the assessment retains the detector's observations and invocation evidence
```

Expected red: There is no registered advisory scan for the assessment or
reconciliation of its JSON and EDN results. Depends on DI-01-01.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Interface test with saved fixtures.** Run the pinned detector against
   trusted, explicit inputs.
   Record binary and version, settings, limits, exclusions, input and output
   digests, invocation, exit status and diagnostics. Check that the snapshot
   stays untouched and no target configuration or code executes.
2. **Interface test with saved outputs.** A valid grouped result retains the
   full EDN pair set and
   keeps AST observations separate from token clones. Check both structures and
   account for the differing JSON and EDN link counts before normalization.
3. **Unit test.** Exercise valid zero results, a threshold exit with valid
   artifacts, missing or invalid output, a detector error, partial scan and
   empty scope. Confirm the outcome records the actual scan state and reasons.

Done when the assessment manifest links the raw outputs, normalized evidence,
coverage and diagnostics. The advisory profile uses the existing tool pin.

### DI-01-03 — Map leads and review capabilities beyond clones

```gherkin
Scenario: Include a source-reviewed capability without a public clone match
  Given a saved source review identifies two public access points for the same capability
  And the detector found only a private helper clone in the recorded inventory
  When the analyst prepares the assessment's candidate packet
  Then the assessment records the public pair with source evidence and no structural score
  And the private helper clone remains tool evidence
```

Expected red: There is no required capability review or rule to map clone
observations to saved public identities. Depends on DI-01-01 and DI-01-02.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Interface test with saved fixtures.** Use saved ownership, declarations,
   exports, re-exports and references to map known public access points. An ambiguous alias remains a
   mapping gap, and a helper-only clone has no interface candidate or alert.
2. **Interface test with recorded review inputs.** Require bounded capability
   review coverage over the public inventory before calling it complete. Accept
   supported source-review leads with a null score even without a detector match.
   Include alias, thin-wrapper and differently implemented capability fixtures.
   Require examined endpoints, comparison scope, limits and unresolved mappings;
   missing required review work prevents a completed assessment.
3. **Unit test.** Reverse and repeat a mapped pair, then add an observation
   for its entries and a separate pair that shares one interface. Keep one
   finding for each distinct-interface pair and preserve entry observations
   inside it. Use the unordered interface IDs for a cross-interface finding,
   and the owning interface ID plus unordered distinct entry IDs for a finding
   inside one interface. Include the finding kind, bound baseline and snapshot
   identities. Two interfaces can reuse entry IDs; verify that their internal
   pairs do not collide. Verify no inferred third pair and no self or own-entry
   finding.

Done when the review packet distinguishes source-review leads, clone leads,
helper-only evidence and mapping gaps using saved references. Also conduct and
record the actual worker review of the alias, thin-wrapper and different-body
fixtures. A fixture record alone does not prove useful detection. Source
inspection can resolve identities where the current syntax-only tools cannot.

### DI-01-04 — Record a supported disposition and coverage

```gherkin
Scenario: Record the decisive difference for an overlapping capability
  Given a worker and manager reviewed two overlapping operations with different state owners
  And their recorded evidence justifies retaining both operations
  When the analyst saves the reviewed assessment
  Then the assessment records one justified distinction with the decisive evidence
  And the shared capability is visible in the comparison
```

Expected red: The assessment has no evidence-backed disposition or independent
review record. Depends on DI-01-03.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Unit test.** Compare public operations with evidence of shared input,
   result or effect. Reuse baseline facts and add applicable source facts. Use
   callable, type and data examples to distinguish an unknown applicable fact
   from an inapplicable topic. Retain both sources when they disagree, along
   with differences and counterevidence.
2. **Interface test with recorded review inputs.** Require one exclusive
   disposition for each reviewed finding. Record `potential-redundancy` for
   supported overlap with reason to investigate consolidation. Record `justified-distinction` when
   supported differences explain keeping both, including where they overlap.
   Record `insufficient-evidence` when a gap prevents either judgment. Include a
   1.0 subscription clone with different owners and a validation clone where
   different accepted inputs are known and policy intent remains unresolved.
   Require the rationale to name the judged scope: one redundant entry does not
   mean that the complete interfaces are equivalent. Reject competing verdicts.
   If overlap is known but its necessity cannot be judged, preserve it as
   `insufficient-evidence` with the missing fact, rather than dropping the pair.
3. **Unit test.** Use recorded worker and manager inputs to validate saved
   decisions, without a live model connection. A mapped finding waiting for
   review stays `needs-review`. Check coverage tallies, manager provenance and
   decision references.
   A completed review requires all in-scope findings to have a disposition and
   all required review work to be accounted for.

Done when a manager can sign off the packet using the saved evidence, including
useful positive cases and justified distinctions from the actual fixture review.
This is the gate before committing to the saved contract and viewer work. Update
start-here and the Step 2 and Step 3 guidance with the assessment handoff and
completion states. Review those edits as documents.

### DI-02-01 — Validate the saved report format

```gherkin
Scenario: Read a report as a separate saved document
  Given a valid saved duplication report
  When the report reader decodes the document
  Then it returns the report's saved observations, coverage and dispositions
```

Expected red: The report reader has no format for the proposed sidecar. Depends
on DI-01-03 and DI-01-04 for the agreed record shape.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Interface test.** Accept the separate document kind and supported report
   version. Reject unknown fields, invalid disposition/coverage combinations,
   unsupported versions and extra YAML documents. Characterize normal strict
   version 1 and 2 baseline decoding before reusing parser protections.
2. **Interface test.** Accept applicable comparison facts with baseline or
   source references. Reject value-bearing facts without evidence and unknown
   applicable facts without a named gap. Keep inapplicable topics distinct.
   Accept scores at 0 and 1 and null for observations without a score. Reject
   non-finite or out-of-range values.
3. **Interface test.** At the report boundary, exercise the legal finding,
   string, source-record, observation, comparison-fact and cumulative-metadata
   limits and one over each.
   Check depth and node boundaries at the shared parser boundary; a closed
   report shape need not reach every parser limit. For invalid shapes, assert
   the correct parser or schema error. Keep existing parser-limit cases green
   as characterization. Check original-file byte limits at the reader boundary.

Done when the TypeSpec source, generated types and schemas, runtime validator
and contract checks agree. Existing baseline fixtures pass unchanged.

### DI-02-02 — Bind and publish a report with verified evidence

```gherkin
Scenario: Reject a report with an endpoint outside its baseline
  Given a saved report binds to the selected baseline and snapshot
  And a report endpoint names an entry on a different interface
  When the report reader validates the report against the baseline
  Then it reports the invalid reference
```

Expected red: The reader has no report identity or cross-reference checks for
this case. Depends on DI-02-01. Use the baseline bytes from the fixture directly
until platform readers carry the digest.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Interface test.** Accept the matching ID, format version and byte digest.
   Report each mismatch, foreign interface, foreign entry or invalid baseline
   statement reference. Allow unknown owners. Allow whole-interface endpoints
   for version 1 and valid entry references only for version 2.
2. **Unit test.** Exercise stable canonical identities with reversed observations,
   whole-interface and entry observations for one interface pair, and a pair
   of distinct entries of the same interface. Reject duplicate finding IDs,
   self pairs, own-entry containment and a second record for the same canonical
   finding under a different ID. Cover repeated local entry IDs on different
   interfaces. Preserve separate pair decisions.
3. **Interface test with saved fixtures.** Publish a valid report and evidence
   through the assessment output. Check snapshot identity, file hashes, evidence registration and
   source ranges at that boundary. Try an invalid evidence reference and an
   unsafe relative path. The portable reader verifies saved shape and baseline
   references using only the selected files.

Done when the assessment manifest registers a valid report, invalid evidence
stops publication, and the viewer reader can validate the saved result with no
source checkout. Keep the separate sidecar transport for this release.

### DI-02-03 — Identify original baseline bytes on both read paths

```gherkin
Scenario Outline: Preserve original-byte identity when reading a saved baseline
  Given a saved baseline contains a UTF-8 byte order mark and CRLF line endings
  When the <reader> reads the selected baseline
  Then the read result includes the SHA-256 digest of the exact file bytes

  Examples:
    | reader  |
    | browser |
    | native  |
```

Expected red: The bounded read paths return decoded text without an
original-byte digest. No report or UI is required to exercise these read
contracts. Depends on DI-01-04; it can then start alongside DI-02-01.
Run the browser row through browser-free Cucumber and the real byte reader.
Implement the native row as an equivalent executable specification in the
existing Rust IPC fixture harness, run by `bun run test:rust` on desktop CI.
Do not add Rust-dependent steps to the default web profile. No file picker is
needed here. An IPC double cannot establish native byte identity; installed
selection is separate in DI-02-05.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Interface test.** Check browser selected-file results against fixed byte
   fixtures with a BOM, CRLF and equivalent reformatting. Preserve the current
   decoding, invalid UTF-8 and file-size behavior. Check exact raw-byte limits
   and one byte over, including a BOM; decoded text length is not file size.
   Return a different digest when the bytes differ.
2. **Interface test.** Use the real native command boundary and the same byte
   fixtures. Verify the same digest. Keep existing size, UTF-8, unsafe-file and
   `source-changed` error cases green as characterization. Check
   that the desktop adapter carries the digest into the read result.
3. **Unit test.** Open a saved baseline through the workflow and retain its
   returned digest with the committed view. The example view has no file digest.

Done when browser and native fixture results match the producer's SHA-256 of
original bytes. Update read/workflow TypeSpec contracts and generated outputs.
Record the Rust checks and run installed selection separately in DI-02-05.

### DI-02-04 — Attach a report to its baseline session

```gherkin
Scenario: Attach a matching report to a saved baseline
  Given a saved baseline is open and a matching duplication report is available
  When the reader opens the report
  Then the workspace attaches that report to the current baseline session

Scenario: Preserve the attached report when replacement fails
  Given a saved baseline has a valid report attached
  When the reader opens a report bound to different baseline bytes
  Then the reader sees an error and keeps the previous baseline and report
```

Expected red: The workflow has no explicit report operation or session-bound
attachment. Depends on DI-02-02 and DI-02-03. Exercise the public workflow with
controlled file selection and read outcomes. Keep only the intended file
selection and prevent automatic lookups for adjacent reports.
Make the attachment case green before executing the replacement case; the
replacement failure must be an assertion about preservation, not a broken Given.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Unit test.** Attach a valid selection atomically to the open saved baseline.
   Offer an actionable error for the built-in example. An invalid or failed
   replacement preserves the previous baseline and report. A valid replacement
   creates a new report session.
2. **Interface test.** Check the workflow contract for one active baseline or
   report load, and Cancel/Retry for the selected operation. A report retry
   reuses its report selection. A baseline retry uses its baseline selection.
3. **Unit test.** Cancel a late read and switch to a baseline with repeated IDs.
   Ignore the late result, clear the report on successful baseline replacement
   and preserve it on a failed baseline open. Removing the report invalidates
   any pending attachment and leaves the baseline committed.

Done when the workflow exposes success, failure, cancellation and retry outcomes
with session transitions that the panel can use. Recheck existing baseline load
behavior and update the workflow contract when needed.

### DI-02-05 — Open reports through ordinary browser and desktop file controls

```gherkin
@di-02-05 @baseline-viewer
Scenario Outline: Attach a saved assessment through the viewer
  Given a saved baseline is open in the <viewer>
  And a matching duplication report is available as a local file
  When the reader selects the report through the viewer's file controls
  Then the viewer identifies the report attached to the current baseline

  @browser
  Examples:
    | viewer             |
    | production browser |

  @packaged
  Examples:
    | viewer           |
    | packaged desktop |
```

Expected red: The normal file controls cannot select and attach a report.
Depends on DI-02-04. Use the published fixture from DI-02-02; the findings list
is not required to show the loaded report identity and load outcome.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Interface test.** Bind the browser file selector and bounded reader to the
   report operation. Check selected-file results, cancellation and retry at this
   public boundary. Opening a baseline alone performs no report read.
2. **Interface test.** Bind the desktop file selector and bounded read to the
   same operation. Check selected-file results and errors, then exercise the
   actual installed route for acceptance. Keep native capabilities read-only.
3. **Unit test.** Show the report file control, loaded identity and operation
   errors in the workspace. Check cancellation, invalid replacement and retry
   through view actions; preserve the committed baseline and prior attachment.

Done when both hosts can select and attach the same published report through
normal controls. Use the current [installed acceptance guide](BV-native-acceptance.md),
which automates Linux/X11; record separate evidence or limits for other platforms.
These controls provide the real entry path for the following UI acceptance cases.

### DI-03-01 — Show findings, coverage and direct-owner counts

```gherkin
@browser
Scenario: Count a finding once when both interfaces have the same owner
  Given an attached report has one potential-redundancy finding between two interfaces of Billing
  And the finding includes whole-interface and entry observations
  When the reader opens Duplicates
  Then the list shows one finding and Billing shows one possible duplicate
```

Expected red: The viewer has no report list, coverage summary or duplicate
counts. Depends on DI-02-05. Load the fixture through ordinary controls in
browser acceptance; use focused rendering tests for the projection rules.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Unit test.** Present no attachment, completed zero, all reviewed
   distinctions, partial coverage, failed scan and skipped scan with their
   respective messages. Show report date, binding, four separate status counts, diagnostics
   and helper or mapping gaps, including unknown counts where recorded.
   Count each finding once in its status. Keep completed zero, all justified
   distinctions and unknown coverage observably different.
2. **Unit test.** Count distinct finding IDs by directly owned interface. Check
   that pending, potential-redundancy and insufficient-evidence findings count.
   A justified distinction is available in the list without a badge increment.
   Verify one same-owner count, one count per direct owner for a cross-owner
   finding, and exclusion of parent-only and unknown owners. Hide zero badges
   and keep the existing owned-interface count. Keep same-interface entry and
   unknown-owner findings in the global list.
3. **Unit test.** Filter the list by component or interface, and make justified
   distinctions available through **Show reviewed distinctions**. Retain report
   order. Show endpoint, owner and entry names with IDs where needed.

Done when the workspace exposes the list globally and from record details. Badge
and list tests agree on identity and filtering. The list marks incomplete review
whenever the report records an incomplete scan, mapping or review.

### DI-03-02 — Compare saved facts and open the recorded entry

```gherkin
@browser
Scenario: Read the saved comparison for a finding
  Given the reader has opened a report with a reviewed finding
  When the reader opens that finding
  Then the panel shows its scoped verdict, overlap, differences and evidence

@browser
Scenario: Open the entry named by a finding
  Given the reader is inspecting a finding with an entry different from the interface's initial one
  When the reader inspects that endpoint from the finding
  Then the interface panel opens at the recorded entry
```

Expected red: The panel has no saved comparison or endpoint action from a
finding. Depends on DI-03-01. Make comparison opening green before testing its
endpoint actions through the browser.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Unit test.** Render the two endpoints, one disposition, overlap,
   differences, rationale, facts, provenance, counterevidence and gaps. Show
   baseline statement status and applicable content, including unknown facts.
   Treat external references as saved references with evidence not loaded.
2. **Unit test.** Show structural method and score under Evidence, a clear
   no-score state, and the recorded distinction between evidence and verdict.
   Preserve exact entry identities for grouped observations. Each observation
   offers inspection of its own endpoints; it does not create another finding
   or verdict. A whole-interface action keeps normal initial-entry selection.
3. **Unit test.** Exercise both endpoint actions. Open the exact entry when
   provided and preserve normal initial-entry selection for whole-interface
   actions. Cover repeated names and missing owners using saved identities.

Done when a reader can compare the supplied record in a single stacked panel and
inspect its saved endpoint. Existing interface details continue to work.

### DI-03-03 — Restore report navigation and scope

```gherkin
@browser
Scenario: Return from an endpoint to the originating filtered list
  Given the reader opened a finding from a filtered interface list
  And the reader is inspecting a recorded endpoint
  When the reader returns through the comparison to the originating list
  Then the original filter, scroll position, row focus and connection scope are restored

@browser
Scenario: Keep the inspection path when a replacement report is invalid
  Given the reader is inspecting an endpoint reached through a saved finding
  When the reader opens a report bound to a different baseline
  Then the error leaves the report, endpoint and Back path unchanged

@browser
Scenario: Remove the report while inspecting one of its endpoints
  Given the reader is inspecting an endpoint reached through a saved finding
  When the reader removes the report
  Then the empty Duplicates panel focuses Open duplication report
  And the old report's badges and return path are gone

@browser
Scenario: Inspect a finding with a keyboard on a narrow window
  Given the reader has a loaded report on a narrow window
  When the reader opens a finding using the keyboard
  Then the panel heading has focus and its content and controls remain usable
```

Expected red: Existing inspection Back has no report-scoped frames. Depends on
DI-03-02.

TDD slices — repeat red → green → refactor for each numbered step:

1. **Unit test.** Preserve camera and component positions across list, pair and
   endpoint inspection. Verify Selected scope from a record and from the global
   action, endpoint scope and restoration on Back. Keep All mode and existing
   **may use** arcs. Direct canvas selection starts a new inspection path.
2. **Unit test.** Restore filters, selected entry/tab, disclosures, scroll and
   row focus on Back. A failed report replacement keeps these values. A new
   report or baseline session drops report navigation from the old session.
3. **Unit test.** Remove a report while its endpoint is open. Verify that the
   return path and badges clear, and focus goes to **Open duplication report**
   in the empty Duplicates panel. Preserve ordinary record inspection when it
   has no report frame. Check focus when the original opener has gone away.
4. **Unit test.** Keyboard activation focuses the panel heading and pointer
   inspection retains expected focus. Check Escape precedence for drag,
   disclosures and panel. Keep status labels accessible without color.

Done when the focused workspace checks cover Back, removal and keyboard use
with an attached report. Include these outcomes in the assembled browser checks.
Inspect the stacked, non-modal panel on a narrow viewport and verify that the
canvas, panel content and controls remain usable.

### Assembled acceptance gate — DI-04

This is completion evidence for the implementation tickets, not a new
implementation ticket. Register its acceptance first, record the missing
report-opening behavior, and keep it in the relevant test profiles throughout
the work. The tickets describe one complete delivery candidate: unfinished
acceptance keeps that candidate red, even when an individual ticket's focused
checks pass. Do not claim a passing candidate or merge it until all required
acceptance passes. Do not create a fresh artificial failure at final verification.

```gherkin
@di-04 @baseline-viewer
Scenario Outline: Read a published assessment offline
  Given the producer saved a baseline and a matching duplication report
  And the reader has the two saved files available offline
  When the reader opens both files through the <viewer> file controls
  Then the viewer displays the saved finding and its endpoint evidence

  @browser
  Examples:
    | viewer             |
    | production browser |

  @packaged
  Examples:
    | viewer           |
    | packaged desktop |
```

Run after DI-03-03 and DI-02-02, using the published fixture for the final runs.
The gate passes when a fresh production browser build and the actual installed desktop
route both open the same producer output without analyzer or source access.
Record the platform, release artifact, fixture hashes and coverage, and the
results of opening the report, comparing findings, following an endpoint and
returning. Recheck baseline-only opening and inspection for versions 1 and 2.
Run the report-specific navigation, invalid-replacement, removal and keyboard
scenarios from DI-03-03 in the browser. Also verify exact-entry inspection and
Back through the real installed route. Use the
[installed acceptance guide](BV-native-acceptance.md) and record evidence
separately by platform. Capture calibration evidence for candidate usefulness, gaps and viewer
responsiveness before proposing any enforced gate or change to report transport.
