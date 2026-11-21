# CR-005 — Show component interfaces and changes in isolation

**Engineering draft · Reviewed 2026-11-19 against Choom `44f2b8a`**

**Milestone A.** Open one saved baseline. See which production components exist, what each
exposes, and who uses each operation. Turn on **Show non-production** to inspect tests and
tools.

**Milestone B.** Compare two saved baselines. See which caller started or stopped crossing a
known boundary and which rule applies. Show when the evidence is too weak to say what changed.

Milestone A can ship on its own. Both milestones use the producer, the shared baseline model,
the browser and desktop workspace, and the file reader.

```gherkin
Feature: Open a published component view
  Scenario: Browser and desktop read the same saved result
    Given Stage 6 published a baseline with a collector, a loader and a test fixture
    When I open that file in each viewer
    Then both show the loader operation and the collector that calls it
    And both open in Production with the test fixture hidden
```

[Component view](#component-view) · [Saved data](#saved-data) ·
[Isolation diff](#isolation-diff) · [Stage prompts and tickets](#producer-prompts-and-tickets) ·
[Delivery and checks](#delivery-and-checks) · [Implementation and verification record](CR-005-implementation.md)

## Component view

Show the project, captured revision and active scope. If the snapshot includes local changes,
label it **Working tree** and show the base commit when known. If Git identity is unavailable,
show the snapshot identity.

TraceRelic run 001 captured a working tree based on `12ada12`. Its collector card shows two
interfaces and two markers for one history command. The second interface is a package manifest
whose recorded callers are tests. The table illustrates the Production view for the same
collector after a fresh review. [Current cards](../../src/components/component-header.tsx) ·
[TraceRelic command at the reviewed revision](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/cli.ts#L15-L26)

| Component | Provides | What the source shows |
| --- | --- | --- |
| Local collector | `collector history` | Command-line entry. Loads the configuration and prints matching Codex records as JSON. |
| Collector configuration | `GlobalConfigLoader.load()` | The collector CLI calls the loader. |
| Local Codex history | `readLocalHistory(from, to)` | The CLI calls the reader with a date range. |
| Collector storage port | `commit()`, `readCheckpoint()`, `readSession()` | Declared storage contract. Production caller coverage is incomplete in run 001. |

Show the component name, purpose and first visible interface or operation on its card. For
longer lists, show the number of remaining visible operations on a keyboard-accessible
**Show more** control. Group startup and registration evidence under the same operation. Keep
independently callable operations separate. To report a call, identify the source site and the
member it calls.

Selecting a component opens **Provides** and **Uses**. Show the provider, permitted callers and
observed callers separately. For an outgoing use, show the actual member or import path and the
kind of use. Label type references **Type use**. Show a private member when another component
reaches it. Use the direct owner even when components share a package or parent. Put source
locations, the walkthrough, questions and their linked answers in **Evidence**, along with audit
totals and digests.

### Production is the default

Use one keyboard-accessible switch, **Show non-production**. Its help text explains that it also
reveals **Scope unknown**. A successful open of a current baseline starts in Production. Keep
the switch setting during inspection and comparison of that baseline.

| Saved evidence | What to show |
| --- | --- |
| Production entry, implementation or supported library contract | Show the operation and its production uses. A documented production port can have zero known production callers. |
| Test-only component, fixture or adapter | Hide it by default. On opt-in, show **Test component** on its card, list entry, detail heading and accessible name. Label its operations and uses **Test**. |
| Developer tool, build or CI helper, benchmark, example or local environment check | Hide it by default. On opt-in, show its specific role. A shipped operator command can be production even under `scripts/`. |
| Component with production and non-production members | Show only the production members by default. On opt-in, label the component **Mixed scope** and label the additional members. A separately owned test component keeps its own label. |
| Missing or conflicting evidence | Withhold unclassified records from Production. On opt-in, show **Scope unknown** and the reason. |

One test registration proves one test use. A shared helper can also serve production. Label the
whole component **Test component** when its declaration or a complete review establishes that it
serves only tests. Classify generated code by its use and keep its source origin.

With the switch on, label each role in text on cards, operations, caller groups and findings.
Count distinct outside caller **components** per operation and role. Two sites in one component
count as one caller. A mixed caller can appear in both role groups. Show sites on expansion.
Show **0 production callers in reviewed scope** only after a complete search. For a partial
search, show the observed callers and **Caller coverage incomplete**.

Apply the same filtered records to cards, links, layout, fit, counts, entry markers, lists,
attachments, navigation and accessible names. **All connections** respects the switch. Use
structured production labels and notes. Keep raw prose, original records and paths that could
identify hidden targets behind the opt-in. If a selected item disappears, remove it from back
history and move focus to a visible control. A child with a hidden parent can appear under the
nearest visible ancestor in the drawing. Its recorded owner stays the same.

A production caller can violate an explicit rule by importing a test helper. In Production, show
**Production code reaches an excluded target** on the caller, with a safe rule description and a
safe caller location when available. Opt-in reveals the target, raw import and labeled edge.
Findings that originate in tests require opt-in.

## Saved data

Add one boundary review to **baseline v6**. Stage 1 writes the empty v1 starting model. Stage 4
can draft v6 using whole files. Stage 5 can use symbol selectors. Stage 6 publishes the selected
Stage 5 baseline bytes. [Baseline TypeSpec](../../cookbook/interfaces/baseline.tsp) ·
[Producer format](../design/app-a/record-format.md)

| Record | What v6 needs |
| --- | --- |
| Identity | Store the project key, snapshot inventory digest, captured source identity, analysis roots and selected mapping. A project key identifies a series of runs. A file digest identifies exact bytes. |
| Scope and ownership | Record the direct owner of the file or symbol, the use roles, their evidence and any uncertainty. Reuse existing file-purpose roles. Record generated origin separately. Keep an unresolved owner explicitly unknown. |
| Declared interface | Reuse the existing owner, entries, public access points, allowed consumers and decision references. Add evidenced member visibility or a caller/path restriction when available. An absent entry establishes privacy only if an applicable declaration explicitly defines the complete public surface. |
| Observed access | Save the caller unit, written path, resolved unit/member, access kind, role at each end and evidence location. Link an existing source use by interface ID and use ID. Store an unmatched access once even when it has no public entry. Preserve unresolved observations separately from confirmed crossings. |
| Rule result and coverage | Save the rule source, authority, effective settings, checker/version, supported scope and result. Link the sites or dependency path that support it. For each checked rule or caller search, record what was examined, complete/partial/unassessed coverage, and limits. |

The producer uses saved evidence for the supported JavaScript and TypeScript forms. Source
files, configuration and test files from the target are inputs to inspect. Use trusted
collectors and supported declarative rules. The viewer reads the selected files and never
executes a target rule. A reviewer interprets the evidence. The producer validates its structure
and references and checks rules it supports.

**Source evidence.** Save a short source note, snapshot-relative path, line range and source
digest for each cited site. Validate the location and its references. Keep intent in the
existing interface or rule statement. Retain source-use evidence for self, type, test and
tooling references. When a crossing links an existing use, check their shared owner, member and
evidence. Count it once. A relative import and a public export can reach the same function
through different routes. Keep both the written route and the resolved member. Count a
source/emitted pair as one site only when evidence links those exact sites.
[Source-use contract](../../cookbook/interfaces/baseline-source-usage.tsp)

**Permission.** Record an applicable, evidenced repository rule in effect or an accepted
decision before reporting a forbidden access. Record the rule revision and scope. The producer
marks a newly inferred rule as proposed. A proposed restriction, an unsupported rule, a conflict
of unclear precedence, or a missing policy yields **Needs review**. A public entry or allowed
caller can still break a separate path rule. An exception must name the rule it overrides.
Preserve the existing meaning of `allowedConsumers: null` (unknown complete allowlist) and
rejection of an empty list. [Contract semantics](../../cookbook/interfaces/baseline.md)

**Link runs.** Add two optional Stage 1 inputs. Supply `CHOOM_PROJECT_KEY` to group independent
runs, or select a previous v6 file with `CHOOM_REFERENCE_BASELINE` to reuse its key and any
accepted policy. Freeze that reference with its original-byte digest. Reject conflicting keys.
If neither input supplies a key, create one and save it in the run. One baseline remains useful
on its own.

**Match code.** Prefer a unique, stable declaration in the project. Otherwise match the
project-relative unit and qualified member when both are unique. Treat line numbers, hashes and
attempt IDs as evidence. Accept a move when the same stable declaration identifies both
versions, or when the reviewer records an evidenced old-to-new match against the exact reference
baseline. Leave ambiguous renames, splits and merges unresolved.

**Compatibility.** Keep strict v1–v5 readers. For an older nonempty inventory without component
roles, show **Production scope unavailable**. The switch reveals the original records. Preserve
known test-use labels on those uses. Distinguish an empty model, a fully reviewed test-only
model and a partially classified model. For a legacy comparison, show
**Isolation comparison unavailable for this format**. Discovery and duplication attachments stay
bound to After by its ID and original-byte digest. Extend the duplication version binding to v6.
[Discovery](../../cookbook/interfaces/discovery-result.tsp) ·
[Duplication](../../cookbook/interfaces/interface-duplication.tsp)

A decision can change a boundary on the **same snapshot**. When `baseline next` accepts or
corrects a field used for ownership, roles, visibility or policy, mark the derived review
**Needs refresh** in the new file. Keep its raw evidence and suppress its stale counts and
verdicts. For a fresh producer run, select the decision-derived file as the trusted reference.
Use an accepted statement only after matching it to the current units. Cite the reference file
digest and its `acceptanceRef`. New inferences stay proposed.
[Decision contract](../../cookbook/interfaces/baseline-decisions.tsp) ·
[Current copy operation](../../packages/baseline-model/src/baseline-decisions.ts)

**Bounds.** Validate each file before filtering. Keep the existing 16 MiB YAML limit and display
limits. For the new review, reuse the limits of 2,000 sites, 4,000 notes and 2 MiB of compact
UTF-8 JSON. Reference existing evidence once. Match by key and bound the result by the total
number of input records across both files. Refuse oversized input. A producer can publish a
partial review with its omissions listed.
[Reader limits](../../cookbook/interfaces/baseline-codec.md) ·
[Display limits](../../cookbook/interfaces/workspace.md)

## Isolation diff

Open the current file as **After**, then choose **Before** with
**Compare with earlier baseline**. Show both identities and the selected direction. The order
comes from the reader. A finding describes the difference between those files. Require matching
project keys. Equal original-byte digests give **Identical input files**, even with limited
coverage. Different baselines for the same source snapshot may show a decision or analysis
change. Show a stale review as **Comparison limited** and display any supported change in
policy.

Lead with new production violations and any limits that affect that conclusion. For each
finding, name the caller, the member it reached and the rule. Expand it to see sites from both
files. Group existing findings and other changes below.

Match units and members before filtering by role. Compare owners, actual access paths and kinds,
policy and coverage. Group repeated sites for the same crossing. For a reachability rule, group
paths by rule, source unit, **actual target unit** and resolution context. Two files that match
the same forbidden pattern are distinct targets. Save the path in order, including intermediate
files owned by the same component.

One valid path proves reachability. Only mark a check complete when the producer can account for
its inputs and supported access kinds. To prove absence of a path, follow every start and
reachable edge in the rule's stated scope. An unresolved edge that could reach the target leaves
the result unknown. A partial project scan can still cover a specific rule completely.
[Current graph limits](../../packages/producer/src/record-graph.ts) ·
[Mode C design](../design/llm-led-architecture-analysis.md#three-analysis-modes)

| What changed | Result to show |
| --- | --- |
| A forbidden crossing is present After and proven absent Before under the same effective rule | **New violation**. Show the new site or path and the Before scope that establishes absence. |
| A forbidden crossing was present Before and a complete After check proves it is gone under the same rule | **Resolved violation**. Show the Before site, After evidence and any permitted replacement. |
| Both sides show the same forbidden crossing or reachable target | **Existing violation**. A new call site or a shorter path changes the evidence for that finding. |
| An allowed access was added or removed, with adequate evidence on both sides | **Interface use changed**. Distinguish a type use, import and call. |
| The rule, owner or accepted exception changed | **Policy or ownership changed**. If remapping exposes a formerly internal access and Before has no saved site, say the source change is unverified. |
| An unchanged access moves into or out of production | **Entered production scope** or **Left production scope**. Show only safe details of the production side by default. |
| Policy is missing, or identity, coverage or check settings prevent comparison | **Needs review** for an unknown permission. **Comparison limited** for an uncertain change. A known After violation remains visible as first observed. |

For an absence claim, compare the rule's meaning, checker behavior, owners, roles and scope in
the affected area. Equal **partial** scans still leave gaps. Use the scoped inventories to
verify a new or removed unit. An unmatched name is insufficient. When code and policy both
change, report each fact. Show **No new production violations in the compared scope** only when
every relevant check supports it. Otherwise name what was checked and what remains unknown.

**TraceRelic example.** At `3a35b6e`, the CLI loads configuration and gives it to the reader.
History already uses Configuration. The rule `history-receives-global-config` forbids History
from reaching the loader, even indirectly. In a synthetic After, make History import and call
the loader. If Before proves no path existed, report
**Local Codex history now loads configuration directly** as a new violation. The dependency path
proves the rule breach. The call explains its effect. If an indirect route existed Before,
report an existing violation with a new direct path.
[Reader](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/history/local-llm-history-codex.ts#L14-L24)
·
[Rule](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/.dependency-cruiser.collector.json#L18-L23)

**File actions.** Reuse the normal browser and desktop pickers. One load runs at a time. A
concurrent request returns **busy**. Cancelling the picker or an active read yields
**cancelled**. Invalid input, a failed replacement, or a late completion keeps the last valid
view. Retry the selected file. **Close comparison** keeps the current baseline, its attachments,
the current scope and the last selection still visible in that scope. A successful replacement
of After clears the comparison and resets to Production.
[Load workflow](../../src/architecture/load-workflow.ts)

## How to implement a ticket

Write the ticket's Given–When–Then test at the named public entry. Bind its steps and run it
first. Confirm that the missing behavior causes the expected failure. For each **TDD** step,
write and run a failing unit, interface or integration test. Make the smallest change that
passes it, refactor, then rerun. Finish with the outer acceptance test and its focused tests
together. If a behavior already works, retain the passing regression test and drive the missing
outcome. The red results below are expectations for implementation.
[Coding principles](../engineering-guidelines/coding-principles.md)

## Producer prompts and tickets

Update the Markdown **and the prompt the worker actually receives**. Align
[start-here.md](../design/app-a/start-here.md) and
[record-format.md](../design/app-a/record-format.md) with the v6 fields and stage gates. In the
manager assignment, ask for a production operation, a non-production use and any limit, each
supported by evidence in the snapshot. In the handoff, lead with the source identity, component,
operation and caller. Link the full audit trail afterward.

Use reviewed fixture packets to test command behavior without relying on a particular LLM
answer. Separately run one fresh manual analysis to check the instructions and inspect its saved
prompts and visible answers. Change trusted authoring files for new attempts. Keep saved
historical prompts intact.

### Stage 1. Record scope and identity

Update both review prompts in [step-1-cookbook.md](../design/app-a/step-1-cookbook.md). Stage 1
already saves file-purpose roles and evidence. Add supported uses and limits to that review.
Keep `review-scope.json` for the evidence supplied. Freeze the project key and any selected
reference with the run inputs. Capture tests as well as production files.

#### Tickets

##### S1.1 Distinguish a test use from a test-only unit

```gherkin
Feature: Save a role review
  Scenario: A shared helper has one known test use
    Given a test runner uses a helper and its production use has not been checked
    When stage-1 finish accepts the role review
    Then the saved review cites the test use and leaves the helper's overall role unknown
```

**First red** — File-purpose roles alone cannot express this distinction.

**TDD** — Unit-test purpose and use roles separately. Reject an unsupported test-only claim in
the packet. Read the saved role review through the Stage 2 handoff.

##### S1.2 Link follow-up runs to the same project

```gherkin
Feature: Identify a project across runs
  Scenario: A follow-up run selects its previous baseline
    Given a saved v6 reference for project TraceRelic
    When I start a new run with that reference
    Then the run keeps the same project key and records the reference file's exact digest
```

**First red** — The existing Git record identifies a checkout and its local changes. It supplies
no shared project or policy identity.

**TDD** — Unit-test key creation, explicit reuse and conflict. Interface-test reference
validation and freezing. Start two disposable runs and inspect the saved keys and digests.

### Stage 2. Review entry candidates

Update the plan and analysis prompts in
[step-2-cookbook.md](../design/app-a/step-2-cookbook.md). Candidates already carry roles and
evidence. Cite the specific Knip mode and receipt for each tool-dependent conclusion. Keep
launch evidence separate and retain Stage 2's unassessed reachability status. `plan` and
`save-review` take packets. `stage-2 finish` selects the result.

#### Tickets

##### S2.1 Bind a tool claim to the run that supports it

```gherkin
Feature: Select the entry analysis
  Scenario: A production scan was skipped
    Given a declared product command, a compiler root and a skipped production Knip run
    When Stage 2 selects the reviewed entry analysis
    Then the command retains its launch evidence
    And the compiler root's production use is unknown with the skipped-mode receipt
```

**First red** — A reference to the run as a whole cannot support that candidate-specific
conclusion.

**TDD** — Unit-test mode and receipt selection. Reject a positive claim based on a skipped scan.
Open the selected packet through the normal finish path.

### Stage 3. Locate evidence for inspection

Update the marked prompt in [step-3-cookbook.md](../design/app-a/step-3-cookbook.md). Save clues
and inspection priorities in the selected entry analysis. Stage 4 verifies the operation and its
handler. `stage-3 collect` writes the prompt, `stage-3 save-review` copies the packet, and
`stage-3-finish` publishes the selected result.

#### Tickets

##### S3.1 Keep the context of a registration

```gherkin
Feature: Prioritize a source inspection
  Scenario: An HTTP route appears in a test
    Given a saved excerpt that registers GET /health inside a Fastify injection test
    When Stage 3 publishes its inspection priorities
    Then the route candidate cites that test range for Stage 4 to check
```

**First red** — The new handoff needs the candidate's test-context clue tied to its exact source
range.

**TDD** — Interface-test the filled prompt. Test the supplied range. Read the published
candidate through the Stage 4 handoff.

##### S3.2 Keep an unresolved loader visible

```gherkin
Feature: Prioritize a source inspection
  Scenario: A computed import has no known target
    Given a saved computed import whose target the available evidence cannot identify
    When Stage 3 publishes the review
    Then the priority names the loader, the unknown context and the missing binding
```

**First red** — A text match or a general priority does not supply the missing-binding state.

**TDD** — Test a literal and a computed specifier separately. Check that the unresolved priority
reaches Stage 4 without an invented entry.

### Stage 4. Recover operations and check crossings

Update [step-4-cookbook.md](../design/app-a/step-4-cookbook.md) **and** the
[Stage 4 prompt generator](../../packages/producer/src/stage-4-review-prompt.ts).
`stage-4-inspect collect` writes the actual prompt. Ask who reached which member, through which
path, under which rule. Inspect candidates beyond the public entry list. Use whole-file owners
here. For Stages 4 and 5, `stage-4-5-publish check <stage> <packet>` validates the external
packet, `finish <stage> <packet>` publishes it, and `verify <stage>` checks the saved result.

#### Tickets

##### S4.1 Record the access path and the operation

```gherkin
Feature: Publish a proposed component boundary
  Scenario: The caller reaches the loader through an implementation file
    Given a CLI imports the loader's implementation file and calls its exported load method
    When Stage 4 publishes the reviewed proposal
    Then it records the actual import path, the named operation, both owners and their evidence
```

**First red** — The canonical public entry hides the actual access route in today's
per-interface record.

**TDD** — Test binding the specifier and member separately. Check the generated prompt. Publish
a reviewed packet and read back both references.

##### S4.2 Keep uses without public entries

```gherkin
Feature: Publish a proposed component boundary
  Scenario: An outside caller reaches an undocumented helper
    Given a bound call to another component's helper with no public entry or known policy
    When Stage 4 publishes the review
    Then the result names the helper and both owners and marks permission undetermined
```

**First red** — An assessment that requires an interface ID cannot hold this access.

**TDD** — Test an owned internal member, an unresolved target and a proven private rule. Reject
duplicate storage of an existing source use.

##### S4.3 Save evidence for a reachability rule

```gherkin
Feature: Publish a proposed component boundary
  Scenario: A rule is broken through an intermediate module
    Given an active rule forbids History from reaching Loader
    And the saved graph contains History to Helper to Loader in one resolution context
    When the producer checks the rule
    Then one forbidden result cites both edges in order and the effective rule
```

**First red** — The existing graph records edges without a portable result for this rule.

**TDD** — Test the direct and two-hop cases. Include an intermediate same-owner edge. Refuse a
path joined from incompatible contexts. Read the checked result from the proposal.

### Stage 5. Check owners, duplicates and coverage

Update the marked prompt in [step-5-cookbook.md](../design/app-a/step-5-cookbook.md). Recheck
Stage 4 facts against the selected Stage 5 map, including any file split into symbols. Publish
the final v6 review and a production-safe summary. Stages 3 and 5 build the actual prompt from
the marked block in the frozen cookbook. Test that block with real attempt IDs.
[Prompt expansion](../../packages/producer/src/attempt-files.ts)

#### Tickets

##### S5.1 Bind both ends to the final map

```gherkin
Feature: Publish the final mapping
  Scenario: A target symbol changes owner during review
    Given the final symbol map assigns the target to Storage
    When Stage 5 publishes the reconciled crossing
    Then both owners refer to the selected mapping and the target owner is Storage
```

**First red** — The new crossing needs its own exact caller and target bindings.

**TDD** — Test exact symbol lookup and an ambiguous shared file. Reject the stale binding.
Publish the corrected packet.

##### S5.2 Count one logical site once

```gherkin
Feature: Publish the final mapping
  Scenario: An emitted test call has a verified source origin
    Given a test call to commit and an emitted call proven to be its copy
    When Stage 5 publishes the review
    Then one test site retains the two locations
```

**First red** — Physical references can appear twice in today's inventory.

**TDD** — Test the exact source-map or equivalent site link. Keep unproven pairs separate. Check
that the full review retains both references and the production view excludes the test use.

##### S5.3 Support an absence claim

```gherkin
Feature: Publish the final mapping
  Scenario: Two ports have empty caller lists with different coverage
    Given a complete production caller search for one port and a partial search for another
    When Stage 5 publishes their review
    Then the first port has a verified zero
    And the second port has incomplete coverage
```

**First red** — An empty list alone has no search-completeness guarantee.

**TDD** — Test complete, partial and unassessed scopes. For transitive rules, require all
applicable roots and relevant edges. An unresolved edge or omitted relevant root must block a
negative result.

### Stage 6. Verify and publish the fixed files

Update the readiness prompt in [step-6-cookbook.md](../design/app-a/step-6-cookbook.md). It
already checks the selected references and draft digests. For v6, require a readiness check in
the existing checks list that cites the selected boundary review, map and applicable limits.
Have the reviewer trace a production crossing and a non-production or unknown case when present.
Run `stage-6 start <packet>` to prepare the selected files, `stage-6 finish` to publish them and
`stage-6 verify` to check them. Fix a readiness citation in the readiness packet. A wrong role,
owner or access in the model goes back to the stage that produced it through the supported retry
or new-run path.

#### Tickets

##### S6.1 Require the v6 readiness evidence

```gherkin
Feature: Publish exactly what was reviewed
  Scenario: A valid packet omits its boundary-review check
    Given the Stage 5 digests and selected references match but readiness omits the required v6 check
    When stage-6 start checks the readiness packet
    Then preparation stops and names the missing boundary-review check
```

**First red** — The current readiness check accepts general cited checks without this v6
requirement.

**TDD** — Test the new check and its references in an otherwise valid packet. Run start again
with corrected readiness. Let the reviewer judge whether the cited evidence supports the
explanation.

##### S6.2 Hand off the exact reviewed baseline

```gherkin
Feature: Publish exactly what was reviewed
  Scenario: The fixed result opens with its reviewed boundary data
    Given approved Stage 5 v6 bytes with a loader, a test fixture and a coverage limit
    When the manager runs stage-6 finish and verify and opens the fixed file
    Then its bytes equal the proposal and the reader returns the recorded roles, access and limit
```

**First red** — The new end-to-end result is a fixed, readable v6 review. Byte copying and
hashing already have tests.

**TDD** — Reuse the byte-identity and discovery-digest tests. Add a producer-to-reader fixture.
Check the manager handoff gives source identity and links to the supporting evidence.

## Delivery and checks

Implement A1 first. A2 and A3 can then share the same fixtures. A4 verifies their combined
output. Start B1 from the verified v6 facts and run B2 against two published files. The producer
stage tickets above are the A2 work.

The [feature workflow](../engineering-guidelines/new-feature-planning.md) requires four
decisions per affected component. Register new artifacts in the owning `component.yaml`. Keep
the [dependency rules](../../.dependency-cruiser.cjs) and the
[OpenSLO service](../../cookbook/observability/service.yaml) as the starting constraints. This
local feature introduces no new service-level objective.

| Owner | Behavior to test | Signal to inspect | Dependency rule | Interface to update |
| --- | --- | --- | --- | --- |
| [Producer](../../packages/producer/component.yaml) | Publish supported access, role and coverage records | Saved review, limit and readiness reason | Only the producer inspects the repository | [Record format](../design/app-a/record-format.md) and stage packets |
| [Shared model](../../packages/baseline-model/component.yaml) | Validate v6 and compare two records | Field-specific errors and per-rule comparison limits | Pure code with no platform I/O | [Baseline TypeSpec](../../cookbook/interfaces/baseline.tsp), decisions and new comparison types |
| [Workspace](../../src/component.yaml) | Present one filtered view and inspect a pair | Visible and accessible scope, finding and load states | UI uses prepared model data | [Workspace](../../cookbook/interfaces/workspace.md) and [workflow](../../cookbook/interfaces/workflow.tsp) |
| [Document adapter](../../src/platform/component.yaml) and [native shell](../../src-tauri/component.yaml) | Read the file selected for Before | Ready, busy, cancelled or failure | Use the existing bounded file reader | [Document dialogs](../../cookbook/interfaces/document-dialogs.tsp) and [reader](../../cookbook/interfaces/documents.md) |

Proposed files are `cookbook/interfaces/baseline-boundaries.tsp` (A1) and
`cookbook/interfaces/isolation-comparison.tsp` (B1). Put producer acceptance cases in
`cookbook/behavior/producer/component-boundaries.feature`. In
`cookbook/behavior/baseline-viewer/`, put the viewer cases in `component-boundaries.feature`,
`production-scope.feature` and `isolation-comparison.feature`.

### A1. Contract and fixtures

Use serialized fixtures and the public baseline reader. Keep one Before/After pair where only
the source access changes. Supply separate examples for changed policy and changed coverage.

#### Tickets

##### A1.1 Read a complete crossing

```gherkin
Feature: Read a v6 boundary review
  Scenario: One file describes an observed loader call
    Given v6 bytes with a project key, both owners, a bound loader call and its source note
    When the shared baseline codec opens the file
    Then the decoded crossing retains its access path, member, scope and location
```

**First red** — The current reader supports formats 1–5.

**TDD** — Interface-test the decoded fields. Unit-test the role, identity and source-location
rules. Generate the TypeSpec types and read the same bytes through the bounded YAML reader.

##### A1.2 Reject an unsupported evidence reference

```gherkin
Feature: Read a v6 boundary review
  Scenario: A caller cites a missing note
    Given an otherwise valid v6 file with a reference to a missing caller note
    When the codec validates it
    Then the error identifies the crossing and the invalid field
```

**First red** — After A1.1, parsing valid v6 does not prove reference integrity.

**TDD** — Test owner and source-use references, inconsistent duplicate facts, wrong mapping and
unsafe paths. Test the exact size limit and one unit over it.

##### A1.3 Prevent stale results after a decision

```gherkin
Feature: Read a v6 boundary review
  Scenario: A decision changes the permitted callers
    Given a reviewed baseline and a valid decision that changes a boundary policy
    When the producer makes the next baseline for that snapshot
    Then the new review says Needs refresh and its old verdict cannot support a diff
    And the original baseline still opens with its original evidence
```

**First red** — The decision path currently copies the baseline and applies the decision to the
copy.

**TDD** — Test changes in value or authority and an unrelated wording change. Open the decision
copy. In a fresh run, apply an inherited decision only when its acceptance reference and current
bindings are valid.

### A2. Producer and prompts

#### Tickets

Use the six stage sections in order. Each stage consumes its predecessor's saved output.

| Stage | Tickets | Handoff |
| --- | --- | --- |
| [1. File roles and identity](#stage-1-record-scope-and-identity) | S1.1–S1.2 | Role evidence, project key and any selected reference |
| [2. Entry review](#stage-2-review-entry-candidates) | S2.1 | Candidate conclusions linked to tool receipts |
| [3. Inspection priorities](#stage-3-locate-evidence-for-inspection) | S3.1–S3.2 | Test-context clues and unresolved loaders |
| [4. Boundaries](#stage-4-recover-operations-and-check-crossings) | S4.1–S4.3 | Operations, actual accesses and supported rule results |
| [5. Final mapping](#stage-5-check-owners-duplicates-and-coverage) | S5.1–S5.3 | Final owners, coverage and bounded v6 review |
| [6. Publication](#stage-6-verify-and-publish-the-fixed-files) | S6.1–S6.2 | Reviewed, byte-identical fixed baseline |

Verify the prompts at their real entry points. Inspect the frozen Stage 1 and 2 cookbooks and
supplied packets, the filled Stage 3–5 prompts, and the Stage 6 readiness packet. Keep the saved
visible responses. Use the existing
[Stage 3](../../packages/producer/test/interface/stage-3/commands.test.ts),
[Stage 4](../../packages/producer/test/interface/stage-4/inspect.test.ts),
[Stage 5](../../packages/producer/test/interface/stage-5/commands.test.ts), and
[Stage 6](../../packages/producer/test/interface/stage-6/outputs.test.ts) checks.

### A3. Component and interface view

Use the A1 fixture through Open Baseline. Compute layout, counts, navigation and evidence from
the same scope selection.

#### Tickets

##### A3.1 Show the operation and caller

```gherkin
Feature: Read production components
  Scenario: An engineer opens the configuration interface
    Given a production collector calls GlobalConfigLoader.load and its allowlist is unknown
    When I open the baseline
    Then the Configuration card names GlobalConfigLoader.load
    And selecting it shows the collector as caller and the allowed-consumer policy as unknown
```

**First red** — The opening card shows an interface count instead of an operation name.

**TDD** — Test direct ownership and grouping of one command's startup and handler. Check
Provides and Uses, type-use labels and the complete keyboard-accessible list.

##### A3.2 Reveal test components on demand

```gherkin
Feature: Read production components
  Scenario: A fixture is hidden until the reader opts in
    Given the new baseline contains a production port and an in-memory test adapter
    When I open the file and turn on Show non-production
    Then the adapter first appears after opt-in with the visible and accessible label Test component
    And its uses appear as test uses
```

**First red** — There is no global scope switch or test-component label.

**TDD** — Test the default before toggling. Cover mixed roles, tools, examples, CI, generated
runtime and unknown scope. Count two sites from one owner once. Check counts per role for a
mixed caller.

##### A3.3 Remove hidden selections and evidence

```gherkin
Feature: Read production components
  Scenario: A reader turns the switch off while inspecting a fixture
    Given a selected test fixture with all connections and an evidence panel open
    When I return to Production
    Then its node, edge, text, counts and history entry disappear and focus returns to a visible control
```

**First red** — Current navigation, attachments and layout have no shared production filter.

**TDD** — Test history pruning, visible ancestors and keyboard focus. Inspect fit, accessible
names, attached reports and both directions of navigation after toggling.

##### A3.4 Show a production violation safely

```gherkin
Feature: Read production components
  Scenario: Production code imports a forbidden test fixture
    Given a production caller with a proven forbidden dependency on a test helper
    When I open its finding in Production
    Then I see the caller and a safe rule description
    And opt-in reveals the helper, the raw import and its test label
```

**First red** — There is no scoped finding for a hidden target.

**TDD** — Test both caller directions and a location that contains the hidden name. Show safe
structured fields by default. Compare cards, counts and evidence in both scopes.

### A4. Compatibility and release

Use an actual S6.2 file for the browser and packaged desktop release check. Update older
[open](../../cookbook/behavior/baseline-viewer/open.feature),
[overview](../../cookbook/behavior/baseline-viewer/overview.feature),
[installed](../../cookbook/behavior/baseline-viewer/installed.feature) and
[source-use](../../cookbook/behavior/baseline-viewer/source-use-reading.feature) cases. Check
their historical inventories after opt-in. Use v6 for production assertions.

#### Tickets

##### A4.1 Show what an older file can establish

```gherkin
Feature: Open an older baseline
  Scenario: An older nonempty model has no role classification
    Given a valid v4 baseline with unclassified components
    When I open the file
    Then I see Production scope unavailable and can opt in to its original inventory under Scope unknown
```

**First red** — The old initial view displays the entire inventory.

**TDD** — Test v1–v5, a genuinely empty model, fully reviewed test-only data and a partial v6
assessment. Check attachment identity, legacy comparison refusal and read-only bytes on both
hosts.

### B1. Compare observations

Use one change per fixture pair through the pure comparison contract. Update **Report views**,
**Compatibility** and **Three analysis modes** in the
[analysis design](../design/llm-led-architecture-analysis.md).

#### Tickets

##### B1.1 Identify a new forbidden dependency

```gherkin
Feature: Compare isolation between two files
  Scenario: A pre-existing component arrow now has a forbidden path
    Given History uses Configuration and the complete Before check found no path from History to Loader
    When After proves a direct import under the same rule and a call to the loader
    Then one New violation shows the new path, call site and Before scope
```

**First red** — Comparing component arrows misses this change.

**TDD** — Unit-test matching by rule, source and actual target. Check that the prior search was
complete. An indirect Before path and direct After path to the same target give one existing
violation. A second target matching the same pattern gives its own finding.

##### B1.2 Detect a forbidden route to the same member

```gherkin
Feature: Compare isolation between two files
  Scenario Outline: An outside caller uses a route or member
    Given a complete Before check found no such outside access
    When After records the new <access> under <policy>
    Then the finding identifies the actual target and says <result>

    Examples:
      | access                              | policy                       | result        |
      | deep import of a public operation   | an active public-path rule   | New violation |
      | call to an unlisted private helper  | an active owner-only rule    | New violation |
      | call to an unlisted helper          | unknown policy               | Needs review  |
```

**First red** — Matching a symbol alone loses the path change.

**TDD** — Test restricted routes, an unlisted target with confirmed privacy, and a target with
unknown policy. Test a type-only use under a value-only rule.

##### B1.3 Recognize a removed violation

```gherkin
Feature: Compare isolation between two files
  Scenario: The caller now uses the permitted entry
    Given Before proves a forbidden access and After fully covers the same check
    When After proves the forbidden route is gone and records the permitted route
    Then the former access is a Resolved violation with evidence from both sides
```

**First red** — Missing records alone cannot establish removal.

**TDD** — Test comparable absence. Check that a permitted addition gets Interface use changed
and lost After coverage gets Comparison limited.

##### B1.4 Keep an existing finding across edits

```gherkin
Feature: Compare isolation between two files
  Scenario: A second site reaches the same target
    Given Before and After identify the same forbidden crossing
    When the original site moves and a second site is added
    Then one Existing violation lists both After sites and the Before site
```

**First red** — Run-local IDs and line numbers change across edits.

**TDD** — Unit-test stable identities and a proven move. Reorder observations and compare again.
Check deterministic grouping and site counts.

##### B1.5 Explain policy and ownership changes

```gherkin
Feature: Compare isolation between two files
  Scenario: An exception changes the status of an unchanged access
    Given an unchanged access and a new accepted exception naming its rule
    When I compare the two reviews
    Then I see Policy or ownership changed and the exception
```

**First red** — Comparing only verdict labels can turn a policy decision into a source fix.

**TDD** — Unit-test rule authority and an explicit override. Test remapping an internal site to
an outside owner, the reverse case, and simultaneous code and policy edits.

##### B1.6 State when the evidence cannot date a change

```gherkin
Feature: Compare isolation between two files
  Scenario: Both scans miss relevant inputs
    Given both scans have the same gap in Before and After coverage and After shows a forbidden call
    When I compare the snapshots
    Then the call is visible as first observed with Comparison limited
    And the result does not claim a new violation or an all-clear
```

**First red** — Equal partial scopes cannot support a negative conclusion.

**TDD** — Test a missing root, an unresolved transitive edge, an unsupported access kind and an
ambiguous rename. Keep proven findings for independently complete scopes.

##### B1.7 Show entry into or exit from production

```gherkin
Feature: Compare isolation between two files
  Scenario: An existing caller moves out of production
    Given a production caller becomes test-only and the member access is unchanged
    When I compare the files in Production
    Then I see Left production scope on the Before side without a resolved-violation claim
```

**First red** — Filtering before matching would erase one side.

**TDD** — Test both directions, including Entered production scope. Reveal the other side on
opt-in. Changing the switch alone must produce no new comparison fact.

### B2. Open and inspect a pair

Exercise the real file picker. The current file remains After. The scope switch controls both
sides.

#### Tickets

##### B2.1 Inspect the selected pair

```gherkin
Feature: Inspect a comparison
  Scenario: Both files use baseline-001
    Given a current baseline and an earlier file with the same project key and local baseline ID
    When I select the earlier file to compare
    Then I see the two file identities, the direction and the evidence for the selected finding
```

**First red** — There is no two-file action and a local ID cannot distinguish these files.

**TDD** — Test identities and an identical-file selection. Use two working trees with unknown
chronology. Inspect and close a pair on both hosts. Turn off opt-in before closing and restore
only visible focus and history.

##### B2.2 Keep the valid pair on error

```gherkin
Feature: Inspect a comparison
  Scenario: The selected file has a different project key
    Given an open comparison with a selected finding
    When I choose a Before file for a different project
    Then I see a project mismatch and retain the valid pair and selection
```

**First red** — The load workflow has no comparison replacement operation.

**TDD** — Interface-test malformed and oversized files, missing v6 keys and legacy formats. Test
a valid stale review as a limited result. Check retry and a failed replacement of After while
opt-in is on.

##### B2.3 Handle busy and cancelled reads

```gherkin
Feature: Inspect a comparison
  Scenario: A cancelled read finishes late
    Given an open comparison and a pending replacement Before file
    When I cancel the read and it finishes late
    Then the original pair stays visible and Choom reports cancellation
```

**First red** — The existing busy and cancel guards do not cover a comparison operation.

**TDD** — Test a concurrent request returns busy, native picker dismissal and stale completion.
Replace After successfully and check that the pair clears and Production resets.

### Comparison handoff prompt

For Milestone B, add `docs/design/app-a/isolation-comparison.md`. Ask the reader or analyst to
name the Before/After files, access, affected rule, consequence and evidence on both sides.
Explain policy changes and coverage gaps separately. Deliver the guide with B1.1 and B1.6. Use
their fixture pairs as worked examples and open them through B2.1. This is the two-snapshot
comparison guide. The existing
[component-proposal diff](../design/llm-led-architecture-analysis.md#proposals-and-the-component-diff)
compares two models on the same source.

### Release checks

- Run `bun run contracts:generate`, `bun run check:contracts`, `bun run check:cookbook` and
  `bun run check:dependencies`. Verify TypeSpec, generated types, runtime validators and the
  owning component declarations together.
- Run `bun run test` and `bun run test:behavior`. Run `bun run test:producer:docker` for the
  real collection steps that use Docker. Inspect the actual filled prompts and published
  fixture.
- Run `bun run test:behavior:browser` and
  `bun run test:behavior:packaged --tags @baseline-viewer` on the configured installed runner.
  For A, open the same S6.2 file on both hosts, inspect an operation, then reveal the labeled
  fixture. For B, open the same two files and verify the new, existing and limited results and
  recovery after cancellation. Update the [reader guide](../../README.md) and record the file
  digests, results and limits. [CI workflow](../../.github/workflows/ci.yml)
