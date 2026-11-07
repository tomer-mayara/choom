# Choom architecture review: agreed refactoring plan

Date: 7 November 2026. Reviewed source:
`565ecb407e119d29ed8b746ec5818e08a346ebc6` on `codex/cr-001-t08`.
This includes the T08 candidate. Implementation must recheck the base commit
before starting; this review does not assume that candidate has merged.

Two independent agents reviewed the project through Robert C. Martin's and
Sandi Metz's design principles, then challenged each other's proposals. The
authors did not participate or endorse these conclusions. Read the independent
[Martin review](2026-11-07-martin.md) and [Metz review](2026-11-07-metz.md),
including their later discussion sections. This shared plan supersedes their
initial sequencing where the discussion changed a recommendation.

Status: approved by both principle-based reviewers after discussion and manager
review. Each independent document records its reviewer's explicit approval.
This is agreement on the plan, not implementation or merge approval. These
tickets describe future work; this change contains review documents only.

## Conclusion

Keep Choom's architecture. Its semantic document, analyzer strategy, platform
adapters, and native resource owners already separate useful responsibilities.
The immediate work is four small changes: establish the behavior and ownership
baseline, protect published workflow state, centralize safe validation messages,
and enforce the intended import boundaries.

Classes are appropriate when they own a rule, resource, lifetime, or collaboration
role. `ComponentCatalog`, `DocumentFiles`, the workflow, discovery runs, and native
resource owners meet that test. Records remain appropriate for portable documents;
functions remain appropriate for canonicalization, path calculations, and layout
projection. A class count or directory count is not a design objective.

## Findings and evidence

Line references in this document refer to the reviewed commit.

| Finding | Evidence and consequence | Decision |
| --- | --- | --- |
| Published workflow state has shared mutation authority | [load-workflow.ts](../../src/architecture/load-workflow.ts), lines 27–29, 108, 183–185 and 411–412, returns retained mutable state. An in-memory reproduction bypassed its cleanup gate by changing a returned field. Current UI callers were not observed doing this. | Fix runtime ownership and narrow the view role in R02. This is an observable boundary defect, not an observed end-user failure or a claim of a security exploit. |
| Validation wording acts as an informal protocol | [architecture-yaml.ts](../../src/lib/architecture-yaml.ts), lines 14–38 and 46–53, copies domain messages and compares exact wording. An independently changed message loses the specific explanation. | Centralize safe messages and their priority in R03. This is a maintenance defect; no current malformed-file failure was demonstrated. |
| The UI depends on more than its consumed role | [workspace.ts](../../src/architecture/workspace.ts), lines 16–19, exposes concrete `LoadWorkflow`; [controls](../../src/components/workspace-controls.tsx), lines 43–90, use only a subset. | Expose a narrow TypeScript role in R02. Keep lifecycle and exporter notifications with composition. |
| Documentation and guards lag intended ownership | [README](../../README.md), lines 306–326, omits `documents/` and understates codec/platform work. [Dependency rules](../../.dependency-cruiser.cjs), lines 31–38 and 61–74, allow all `lib/` imports from the codec and rely on selected filenames for workflow/render guards. | Correct the map in R01; add focused guard coverage in R04. Existing imports pass; these are maintenance and enforcement gaps. |

The manager's bounded reproduction used `workflowDependencies()` from the
[in-memory fixture](../../test/support/load-workflow-fixtures.ts). It performed
no filesystem or native operations:

```text
documentCleanupFailed()
loadRepository()                              -> busy
getSnapshot().state.cleanupRecovery = "none"
loadRepository()                              -> cancelled
```

The last result came from entering the null-returning selector without a cleanup
retry. It establishes the ownership hole, not misuse by the current React view.

## Project structure to retain

Keep the declaration tree and current packages. Do not map directories to
components one-to-one. Only linked declarations create components; a component
continues to own its subdirectories until a more specific declaration takes over.
Manifest parent relationships need not match physical directory nesting.

| Declared component | Owned implementation areas | Required treatment |
| --- | --- | --- |
| `choom` | Root composition metadata and repository tooling outside child roots | Keep the root manifest and its explicit analyzer metadata. |
| `workspace` (`src`) | `architecture/`, `documents/`, `components/`, `lib/`, and app entrypoints | Keep these internal responsibility groups under one declaration. Document file lifecycle and YAML parsing accurately. |
| `architecture-model` (`src/domain`) | Semantic rules, declared ownership, canonical documents, starter data | Keep independent of UI, native access, and vendor reports. |
| `desktop-adapter` (`src/platform`) | Native IPC/dialogs, host detection, and browser document access | Correct its description to include browser access. A component rename is unnecessary for this plan. |
| `native-shell` (`src-tauri`) | Repository sessions, analyzer processes, document storage, native commands | Keep distinct resource owners and platform-specific process/file mechanics. |

These are the declarations in the [root manifest](../../component.yaml) and
[workspace manifest](../../src/component.yaml). No new manifest is required
merely because a helper or role binding gains a file. New source files belong
beside the behavior they serve. Suggested additions are a view-role binding
beside the workflow and a semantic-message catalog in `domain/`; final filenames
should reflect their contents. No broad move into new `core`, `services`, or
`packages` trees is justified.

Keep TypeSpec as the source of truth for Choom-owned data and operation contracts.
Keep runtime validation for semantic rules, including file ownership and graph
consistency. Keep the YAML v1 contract independent of React Flow, positions, and
viewport state. `ArchitecturalLayer` is the analyzer replacement boundary;
`ReportConversion` and `DepCruiserExecution` remain vendor-local roles. A new
analyzer need not adopt dependency-cruiser's report format.

## Ownership and invariants

R01 will confirm this map against the current base and link the matching tests.

| Resource or decision | Owner and transfer rule |
| --- | --- |
| Load exclusion and commit | `LoadWorkflow` reserves the slot before selection. It publishes the new view once, after validation and layout. Pre-commit failure preserves the old view. Cancellation cannot reverse a completed commit. |
| Repository session | Discovery releases it on failure and transfers it on success. The workflow closes it after analyzer cleanup is confirmed. Uncertain analyzer/discovery cleanup retains a restart requirement. |
| Analyzer process and reports | The execution attempt coordinates native operations; Rust owns process descendants and report files. Cleanup failure cannot become a successful or cancelled outcome. |
| Candidate and current snapshots | `DocumentFiles` prepares and rereads a candidate; the workflow owns its handle until discard or commit. Native storage owns the files and limits. Superseded release can block the next load without reversing the new view. |
| Active and failed document releases | `DocumentFiles` coalesces releases and retains unconfirmed failures. The workflow owns the load gate and prevents an older cleanup result from clearing a newer export failure. These are separate facts, not duplicate owners of one fact. |
| Export | The exporter captures document bytes before waiting for a destination and obtains explicit replacement approval through the workspace dialogs. Native storage enforces the requested overwrite policy and owns atomic file effects. Export outcomes do not replace load outcomes. |
| Published view | After R02, the workflow owns immutable publication values. Consumers can read them and send commands; returned views, outcomes, and collaborator-held aliases cannot mutate retained state. |

Preserve one declared component owning multiple subdirectories throughout
discovery, conversion, YAML round trips, and display. Preserve evidence pairs,
unreported import flags, ordered diagnostic paths, zero-file components, and
source-free reopening. These are model semantics, not refactoring options.

## What the discussion changed

| Proposal | Challenge | Agreed result |
| --- | --- | --- |
| Start with read-only TypeScript snapshots | The manager reproduced a runtime cleanup-gate bypass. Martin challenged type-only protection; Metz accepted the evidence. | Own publication values at runtime as well as expressing read-only types. Cover nested values and aliases; preserve stable snapshot identity. |
| Whether the diagnostic catalog needs stable issue IDs | The reviewers compared named constants with issue IDs. Metz's initial review already allowed the smaller option; both agreed it is sufficient for the current consumers. | Domain-owned named safe constants and explicit priority first. Public error codes and messages stay compatible. |
| Extract a uniform selected-document reader now | Metz pointed out the different native and browser waiting/cancellation rules. Moving the branch could hide them. Martin conceded the priority. | Defer until a concrete source/read/retry change justifies the role. |
| Extract a per-load object because the controller has several responsibilities | Metz challenged splitting one resource transaction across callbacks and flags. Martin accepted an evidence gate. | No scheduled `LoadAttempt` rewrite. Move a complete lifetime only if coordination decreases. |
| Centralize analyzer selection now | Both saw duplicate support policy but only one current analyzer. | Do it before adding another enforcer; retain early discovery failure and defensive concrete checks. No registry. |

## Tickets

Execute R01 first. R02 and R03 can then be separate small changes. Complete R04
against their final imports. Each ticket assesses all four cookbook constraints;
unchanged artifacts need no artificial edits. The Gherkin below states acceptance
intent. Reuse matching existing scenarios rather than creating duplicate suites.
Only R02 introduces a newly specified runtime guarantee in this plan.

### R01 — Establish behavior and correct the ownership map

**Result:** a current responsibility/transition map and passing characterization
for the behavior the later changes must retain. Correct the README tree and
inaccurate component descriptions. Keep declaration names and child links.

**Behavioral:** begin with the existing
[domain scenarios](../../cookbook/behavior/architecture-import/t02-domain.feature),
[workflow scenarios](../../cookbook/behavior/architecture-import/t07-api.feature),
and [document scenarios](../../cookbook/behavior/architecture-import/t06-api.feature).
For example, retain this existing domain scenario:

```gherkin
Scenario: A component owns files in ordinary subdirectories
  Given the declared workspace reports files and imports across three subdirectories
  When the architecture document is built
  Then only the declared components appear, with three files in the workspace
  And the workspace's internal imports create no relationships
```

Map cancellation, atomic commit, retry, cleanup precedence, export byte capture,
and snapshot identity to their existing suites. Record any missing coverage for
the implementation ticket that needs it. Do not invent failing tests for unchanged
behavior or add behavior tests for documentation itself.

**Observability:** document the existing stages and outcomes. The shared
[OpenSLO service](../../cookbook/observability/service.yaml) remains unmeasured;
this plan creates no telemetry or reliability claim.

**Architecture / dependency-cruiser:** document allowed imports and composition
exceptions as a small responsibility table. Record current guard gaps for R04.
Keep one component owning multiple directories.

**Interface / TypeSpec:** verify the ownership notes against
[workflow.tsp](../../cookbook/interfaces/workflow.tsp) and
[workspace.md](../../cookbook/interfaces/workspace.md). Correct prose drift;
keep data/operation contracts unchanged.

**Validation and done:** inspect links and manifest references; run the affected
existing domain, workflow, and document characterization as the refactor baseline.
Record actual results and environment limits. Run Habit Hooks on the candidate.
This ticket creates no production abstraction.

### R02 — Protect published state and expose the view's role

**Result:** a consumer cannot alter the current diagram or clear a load gate by
editing a returned value. UI types expose only subscription, snapshot access,
load/open/cancel/retry/cleanup commands, and the export operation they need.

Own a document/layout copy once per successful commit, then freeze its nested
data. Own and freeze small state/outcome values at publication. Reuse the frozen
graph through progress updates and keep `getSnapshot()` stable between
notifications. Do not freeze caller-owned inputs in place or clone/traverse the
graph on every getter. Protect aliases through returned operation outcomes,
failure details, and references retained by layout/document collaborators.

Define a narrow structural TypeScript role beside the workflow. Derive command
types from the existing TypeSpec-generated operations; document live subscription
and read-only view bindings separately. Keep `dispose` and exporter cleanup
notification with the owning composition code. No forwarding service or DI
container is needed. Read-only types must cover nested collections, not only the
outer property.

**Behavioral:** add this API scenario and a focused failing regression before
the fix. The observer is a public API consumer, not an invented screen action.

```gherkin
Scenario: An observer cannot clear an outstanding cleanup failure
  Given a diagram is current and a previous snapshot still needs cleanup
  And an observer has received the current workspace view
  When the observer tries to clear the cleanup failure through that view
  Then the current diagram is unchanged
  And another load remains blocked until cleanup succeeds
```

Add focused coverage for nested graph/layout mutation, operation-result aliases,
and collaborator-held aliases after commit. Preserve existing characterization
for identity, cancellation, retry, export independence, and cleanup revision
ordering. Verify both strict-mode mutation attempts and the resulting retained
state; a thrown write alone is not the invariant.

**Observability:** retain current stage/outcome meaning and duration units. No
new events, metrics, or OpenSLO changes.

**Architecture / dependency-cruiser:** the UI consumes the view role; composition
still creates and owns `LoadWorkflow`. Keep the role free of concrete adapter,
React, and analyzer dependencies. Record its exact path for R04's guard.

**Interface / TypeSpec:** YAML and native IPC shapes stay unchanged. Update the
live-binding ownership contract in workspace notes and implementation conformance
checks. Reuse generated command/data types; do not hand-edit generated outputs
or make all generated DTOs globally immutable to solve one publication boundary.

**Validation and done:** run the focused red/green regression, workflow and
document concurrency suites, DOM/interface suites, and affected browser cases.
Run required TypeScript checks and the frontend build. Measure commit time and
peak memory before/after on a representative large valid document and a valid
case near the existing document limits; report the cost. Confirm that repeated
reads/progress do not repeat graph copies and that React Flow renders frozen
input correctly. Preserve supported inputs rather than silently reducing limits.
Run packaged acceptance for the changed assembled desktop load route and report
platform gaps separately. Do not combine this fix with a lifecycle rewrite.

### R03 — Give safe semantic diagnostics one owner

**Result:** domain validation and the YAML boundary use one catalog of safe
message constants and one explicit precedence order. The codec no longer
maintains a second list of independently authored domain wording.

Place the catalog with domain validation. Update the validators and codec
together, preserving current public messages, error categories, and ordering.
Using catalog references for matching is sufficient here; this does not require
a new serialized issue-ID protocol. Keep unknown/parser diagnostics behind safe
fallback messages. Do not expose paths, unknown keys, or raw exceptions.

**Behavioral:** keep passing characterization before changing structure. Retain
specific rejection reasons and privacy through the public codec, including
multiple simultaneous defects and safe fallbacks. Acceptance intent:

```gherkin
Scenario: A document explains an ownership error without replacing the current view
  Given a diagram is current
  And a saved diagram attributes an evidence file to a component that does not own it
  When I open the saved diagram
  Then loading is refused because the evidence ownership does not match its relationship
  And the current diagram is unchanged
```

Map this intent to existing saved-file and codec coverage; add only a missing
characterization case. A wording change is not part of this refactor.

**Observability:** retain failure stages/codes and safe user messages. No events
or OpenSLO changes.

**Architecture / dependency-cruiser:** the catalog stays in the independent
domain. The codec may depend on it; the domain may not depend on YAML, storage,
React, or platform access. No global error framework.

**Interface / TypeSpec:** the public document and failure contracts stay unchanged.
The catalog is an implementation detail, not a new transport contract. Verify
codec outputs against the existing generated schema. If a later change exposes
issue IDs as a boundary contract, define them in TypeSpec in that separate change.

**Validation and done:** domain/codec unit and interface checks, relevant T02/T06
behavior and saved-file browser cases, required TypeScript checks, frontend build,
and Habit Hooks pass. Preserve exact safe messages and their chosen priority.

### R04 — Enforce the agreed import boundaries

**Result:** dependency-cruiser rejects representative violations of the documented
roles, including type imports, while accepting the actual composition paths.

Protect discovery, workflow helpers, and document lifecycle code from UI imports
and reverse dependencies on composition. Restrict codec dependencies to its own
helpers, generated format contracts, semantic domain, and required parsing
libraries; `lib/` must not become a route into layout or unrelated mechanisms.
Keep concrete analyzer construction at the named composition boundary. Guard
the new UI-facing role against concrete workflow/adapter dependencies where
applicable. Base matching on the agreed responsibility paths and audit helper
coverage; renaming `load-*` must not silently remove a boundary.

**Behavioral:** accepted behavior is unchanged. Retain the saved-document journey:

```gherkin
Scenario: A saved diagram preserves a component that owns several directories
  Given a saved diagram records one component owning files in several subdirectories
  And its source repository and analyzer are unavailable
  When I open the saved diagram
  Then the declared component and its recorded relationships are displayed
  And the subdirectories do not become extra components
```

Use existing portable-document coverage. Configuration enforcement needs
allowed/forbidden edge probes, not new product behavior tests.

**Observability:** unchanged; a static import check is not a production SLI.

**Architecture / dependency-cruiser:** this is the changed constraint. Verify both
ordinary and type-only imports with representative temporary fixtures or config
probes. Check allowed composition, domain/codec imports, and forbidden UI/storage/
vendor crossings. Do not use a broad generated-directory exemption to hide a
direction error. Keep component declarations and artifact paths valid.

**Interface / TypeSpec:** no data/operation change. Ensure generated type imports
still obey the intended ownership and run contract consistency checks. A role
binding move must update its consumers without inventing a second DTO definition.

**Validation and done:** positive and negative dependency probes, the complete
dependency check, type/contract/cookbook checks, and Habit Hooks pass. Inspect the
diff for rule exceptions. For configuration-only edits, do not claim new behavior
coverage; any source move brings the affected production checks into scope.

## Deferred changes and their triggers

| Change | Revisit when | Required design condition |
| --- | --- | --- |
| Selected-document reader capability | A third source, changed read/retry semantics, or repeated host-driven workflow changes | Preserve native slot retention and rejection of late browser results. The role must remove knowledge without spreading cancellation flags or owners. |
| Analyzer support policy in composition | Before adding or replacing an enforcer | Inject a small support policy into discovery and select the matching strategy from the same policy owner. Preserve early `unsupported-enforcer` failure, session cleanup, and concrete vendor validation. No plugin registry. |
| Private load-attempt/repository-load owner | A concrete feature exposes repeated lifetime coordination after R02–R04 | Move a complete lifetime with explicit resource transfer and fewer coordination points. Keep one commit/load-gate owner. Reject shared-flag or callback-heavy extraction. |
| Additional packages, components, or Rust module splits | A demonstrated independent consumer, responsibility, or change cost | Preserve lock order, process/file ownership, platform-specific behavior, and cookbook links. File length alone is insufficient. |

Keep the example and retained directory picker; removing them is a separate
product behavior decision. Keep explicit composition, the current single-workspace
lifetime, and distinct IPC adapters. Do not merge their different error, progress,
timing, cardinality, or cleanup rules merely because the syntax repeats.

## Verification and completion

For production tickets, establish the relevant passing characterization first;
for the R02 behavior correction, add Gherkin and a focused red test before the
fix. Run each changed test locally, affected behavior checks, `bun run check`,
`bun run check-types`, `bun run build`, and `bun run habit-hooks --all`. Keep
the snooze file empty. Run relevant browser/installed acceptance when the assembled
route changes. Rust changes additionally require Cargo tests, formatting, Clippy,
and the relevant desktop build. Native refactoring remains deferred.

Keep evidence scoped to what ran. The
[T08 evidence record](../change-requests/CR-001-T08-evidence.md) retains the native
UI, launcher/runtime-discovery, packaging, and platform limits. This architecture
review does not close them or claim measured production reliability. Each future
PR must update affected documents and constraints and follow the cookbook's
human review requirements before merge.

The manager completed these checks for this documentation review:

| Check | Result and scope |
| --- | --- |
| `bun run check:dependencies` | Passed: 67 modules and 186 dependencies under the existing rules. |
| In-memory snapshot mutation probe | Confirmed the cleanup-gate exposure described above; no native/file effects. |
| Markdown inspection | Three documents, 71 local links, and no missing targets, trailing whitespace, or unbalanced code fences. |
| Ticket Gherkin syntax | All four blocks parsed and compiled with the installed Cucumber parser. Their steps were not executed. |
| `bun run habit-hooks --all` | Passed. The snooze file remains empty. |

No production code changed. Browser, native, and full behavior suites were not
rerun for these documents; earlier results remain in their original evidence
records. Both reviewers explicitly approved this final plan after the discussion.
