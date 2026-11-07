# R01 behavior and ownership baseline

This is the R01 source baseline for the
[agreed refactoring plan](2026-11-07-agreed-refactoring-plan.md).
It records the behavior to preserve and the gaps assigned to later tickets.
Production code matches `565ecb407e119d29ed8b746ec5818e08a346ebc6`.
Later tickets update the live implementation and boundary notes; the observations
below describe the state before R02–R04.

## Behavioral constraint

### Ownership and transfer

| Responsibility | Owner and transfer |
| --- | --- |
| Declared architecture | The domain catalog assigns each file to its deepest containing declaration. Manifest parent links describe the declared tree. The builder and validator preserve that distinction when forming or reading a document. |
| Load slot and view commit | [LoadWorkflow](../../src/architecture/load-workflow.ts) reserves one slot before selection. It owns the previous selection, cancellation, and the current document and layout. It commits the new view once, after validation and layout. |
| Repository session | [RepositoryDiscovery](../../src/architecture/repository-discovery.ts) releases the session on failure and hands it to the workflow on success. The analyzer borrows the session. The workflow closes it once analyzer cleanup is confirmed and retains known safe sessions when closing fails. Unconfirmed discovery or analyzer cleanup requires restart. |
| Analyzer job and report | The [execution attempt](../../src/architecture/dependency-cruiser/runner.ts) coordinates one job through native prepare, run, cancel, and release. [Rust](../../src-tauri/src/analyzer) owns process descendants and report files. Completed report data reaches conversion only after successful job cleanup. |
| Candidate and current snapshots | [DocumentFiles](../../src/documents/document-files.ts) owns a candidate through creation, reread, and validation. It transfers the ready handle to the workflow, which discards it on rejection or promotes it to current at view commit. The workflow then releases any superseded handle. [Native storage](../../src-tauri/src/documents/mod.rs) owns the physical files and enforces capacity for two snapshots. A saved-file open uses the decoded file without acquiring a candidate. |
| Pending releases and load gate | DocumentFiles coalesces active releases for each ID and retains unconfirmed failures for retry. The workflow owns whether a load can start and tracks export cleanup revisions. A retry that overlaps a newer export cleanup failure cannot clear that gate. |
| Export | DocumentFiles captures encoded bytes before waiting for releases or choosing a desktop destination. [Workspace composition](../../src/architecture/workspace.ts) binds the consent dialog, starts with overwrite disabled, and notifies the workflow of export cleanup failures. Native storage enforces the requested overwrite policy and owns atomic file effects. Browser export encodes the document and passes it to the browser download adapter. |
| Published snapshot | The workflow publishes one snapshot object per update and returns the same object between publications. State, document, layout, and some outcomes still have shared mutable references. R02 owns the change to runtime-isolated publication. |

### Load and export transitions

Scenario links lead to the existing behavioral specifications. Test links give
the corresponding focused evidence and identify cases where a test checks a
stronger or more specific invariant than the scenario.

| Transition or invariant | Existing Gherkin | Focused test evidence |
| --- | --- | --- |
| Idle → selection. Either kind of load reserves the slot and a concurrent load returns busy. | [Selection reserves the load operation](../../cookbook/behavior/architecture-import/t07-api.feature#L3) | [Selection already owns the one load slot](../../test/unit/architecture/load-workflow.test.ts#L10) |
| Discovery → failure or handoff. Discovery releases its own session on failure. On success the caller receives the live session. | [Failure releases the repository session](../../cookbook/behavior/architecture-import/t03-api.feature#L61), [Success transfers the repository session to its caller](../../cookbook/behavior/architecture-import/t03-api.feature#L67) | [Discovery follows declarations and transfers a live session](../../test/unit/architecture/repository-discovery.test.ts#L29), [Invalid YAML releases the session](../../test/unit/architecture/repository-discovery.test.ts#L56) |
| Analysis → conversion or cleanup failure. Analysis borrows the session, waits for native job cleanup on cancellation, and suppresses a completed result if release fails. | [Cancellation waits for native cleanup](../../cookbook/behavior/architecture-import/t05-api.feature#L48), [Analysis borrows the repository session](../../cookbook/behavior/architecture-import/t05-api.feature#L75), [Cleanup failure is not reported as successful cancellation](../../cookbook/behavior/architecture-import/t05-api.feature#L70) | [Successful job release while borrowing the session](../../test/unit/architecture/dependency-cruiser/execution.test.ts#L19), [Release failure prevents document production](../../test/unit/architecture/dependency-cruiser/execution.test.ts#L101) |
| Storage → ready or discard. Candidate preparation uses the decoded reread. Cancellation after creation waits for disposal. Failed release takes precedence over cancellation or invalid bytes. | [A candidate must be reopened before it is ready](../../cookbook/behavior/architecture-import/t06-api.feature#L28), [An unreadable candidate cannot become ready](../../cookbook/behavior/architecture-import/t06-api.feature#L33), [Failed cleanup cannot be reported as cancellation](../../cookbook/behavior/architecture-import/t06-api.feature#L43) | [Candidate transfers the decoded stored bytes](../../test/unit/documents/document-files.test.ts#L8), [Cleanup failure wins over cancellation](../../test/unit/documents/document-files.test.ts#L97), [Cleanup failure wins over invalid bytes](../../test/unit/documents/document-files.test.ts#L116) |
| Precommit cancellation → settle. The slot remains held while native selection, discovery, analysis, native reads, or candidate work is pending. The workflow waits for acquired resource cleanup. | [Cancellation waits for resources acquired during discovery](../../cookbook/behavior/architecture-import/t07-api.feature#L8), [A load stays cancellable while its repository is being released](../../cookbook/behavior/architecture-import/t07-api.feature#L13), [Cancellation after analysis releases the candidate](../../cookbook/behavior/architecture-import/t07-api.feature#L23) | [Pending picker holds the slot](../../test/unit/architecture/load-workflow.test.ts#L24), [Analyzer cleanup precedes repository close](../../test/unit/architecture/load-workflow-cancellation.test.ts#L42), [Candidate creation must settle](../../test/unit/architecture/load-workflow-cancellation.test.ts#L90) |
| Precommit cancellation → ignore late results. Browser reads and layout can settle later. A cancelled operation cannot publish over a later one. | [A late result cannot replace a later document](../../cookbook/behavior/architecture-import/t07-api.feature#L28) | [Late layout and progress cannot replace a newer document](../../test/unit/architecture/load-workflow-cancellation.test.ts#L132), [A cancelled browser read rejects the eventual bytes](../../test/unit/platform/browser-documents.test.tsx#L37) |
| Valid document and layout → one commit. The previous view stays visible until that commit and on precommit failure. Cancellation after commit preserves success, including during superseded release. | [A candidate is not displayed before layout completes](../../cookbook/behavior/architecture-import/t07-api.feature#L18), [A failed load preserves the current document](../../cookbook/behavior/architecture-import/t07-api.feature#L34), [Cancellation cannot reverse a committed document](../../cookbook/behavior/architecture-import/t07-api.feature#L48) | [A neutral layer supplies the candidate and the workflow displays its reread](../../test/unit/architecture/load-workflow.test.ts#L55), [A failed layout retains the displayed document](../../test/unit/components/workspace.test.tsx#L79), [Cancellation while superseded cleanup is pending](../../test/unit/architecture/load-workflow-cancellation.test.ts#L170) |
| Load failure → retry. A new attempt uses the resolved selection when available and reopens the picker if selection failed. | [Retry uses the previous selection after a fix](../../cookbook/behavior/architecture-import/t07-api.feature#L74), [Retry after correcting a missing manifest](../../cookbook/behavior/architecture-import/t07-workflows.feature#L58) | [Retry reuses the resolved selection after the manifest is restored](../../test/unit/architecture/load-workflow.test.ts#L123), [A failed selection permits another attempt](../../test/unit/architecture/load-workflow.test.ts#L43) |
| Superseded release → ready or retry gate. If cleanup fails after commit, the new diagram and successful load remain. Retry releases the known failed owners before another load. | [Failed cleanup after display keeps the new document](../../cookbook/behavior/architecture-import/t07-api.feature#L53), [Retrying cleanup preserves the current document](../../cookbook/behavior/architecture-import/t07-api.feature#L59) | [Superseded cleanup preserves success and blocks growth](../../test/unit/architecture/load-workflow-cleanup.test.ts#L11), [A close failure retains its known session](../../test/unit/architecture/load-workflow-cleanup.test.ts#L58) |
| Unconfirmed native job or discovery cleanup → restart gate. Document cleanup cannot release an unsafe repository or reduce restart to retry. | [Unknown analyzer cleanup cannot be cleared by document cleanup](../../cookbook/behavior/architecture-import/t07-api.feature#L64) | [Unavailable discovery cleanup handle requires restart](../../test/unit/architecture/load-workflow-cleanup.test.ts#L98), [Export cleanup cannot downgrade restart](../../test/unit/architecture/load-workflow-cleanup.test.ts#L156) |
| Snapshot release → pending, failed, or removed. Native storage bounds snapshot count. DocumentFiles joins active releases and blocks writes on unconfirmed failure. | [Current and candidate snapshots bound cache growth](../../cookbook/behavior/architecture-import/t06-installed.feature#L16), [Unresolved cleanup prevents further writes](../../cookbook/behavior/architecture-import/t06-api.feature#L59), [Failed cleanup retains ownership for a later retry](../../cookbook/behavior/architecture-import/t06-api.feature#L54) | [Native snapshot capacity returns only after release](../../src-tauri/src/documents/tests.rs#L32), [Unconfirmed release blocks candidate and export writes](../../test/unit/documents/document-files.test.ts#L212), [Cleanup retry joins a running release](../../test/unit/documents/document-files-concurrency.test.ts#L144) |
| Export start → capture → destination → write. The export keeps its original bytes while a load commits or a release runs. Replacement uses explicit consent and the same bytes. | [Export captures the architecture selected when it starts](../../cookbook/behavior/architecture-import/t06-api.feature#L64), [Export remains available while the previous document is being removed](../../cookbook/behavior/architecture-import/t06-api.feature#L70), [Replacement follows the user's explicit decision](../../cookbook/behavior/architecture-import/t07-dialogs.feature#L36) | [Export waits for release using captured bytes](../../test/unit/documents/document-files-concurrency.test.ts#L16), [Consent applies to the same bytes](../../test/unit/documents/document-files.test.ts#L272), [Native atomic replacement consent](../../src-tauri/src/documents/tests.rs#L69) |
| Export cleanup failure → shared load gate. The export leaves load outcomes intact. An older cleanup result cannot clear a newer failure. | [Export cleanup does not change a successful load](../../cookbook/behavior/architecture-import/t07-api.feature#L80), [Export cleanup does not change a cancelled load](../../cookbook/behavior/architecture-import/t07-api.feature#L85), [Another export can need cleanup while cleanup is being retried](../../cookbook/behavior/architecture-import/t07-api.feature#L90) | [External cleanup preserves a successful load](../../test/unit/architecture/load-workflow-cleanup.test.ts#L111), [A cleanup completion cannot clear a newer failure](../../test/unit/architecture/load-workflow-cleanup.test.ts#L170) |
| Observe between publications. Repeated reads return the same snapshot and subscriber exceptions cannot interrupt the load. | [A candidate is not displayed before layout completes](../../cookbook/behavior/architecture-import/t07-api.feature#L18) checks the visible view. Reference identity and observer exceptions are unit assertions. | [Subscriptions expose stable snapshots and tolerate observer failure](../../test/unit/architecture/load-workflow.test.ts#L140) |

### Architecture meaning

| Invariant | Existing Gherkin | Focused test evidence |
| --- | --- | --- |
| A declaration owns ordinary subdirectories until a deeper declaration takes over. Discovery, analysis, and YAML preserve one component across those directories. | [Only linked declarations become components](../../cookbook/behavior/architecture-import/t03-api.feature#L3), [A component owns files in ordinary subdirectories](../../cookbook/behavior/architecture-import/t02-domain.feature#L3), [The deepest containing declaration owns each file](../../cookbook/behavior/architecture-import/t02-domain.feature#L9), [Portable YAML preserves a component that owns several directories](../../cookbook/behavior/architecture-import/t06-api.feature#L3) | [Ordinary subdirectory and deepest ownership](../../test/unit/domain/build-architecture-document.test.ts#L32), [Conversion across multiple directories](../../test/unit/architecture/dependency-cruiser/converter.test.ts#L5), [YAML round trip](../../test/unit/lib/architecture-yaml.test.ts#L6) |
| Keep complete evidence pairs, distinct reported and unknown flags, ordered diagnostic paths, and zero-file declarations. Display one card for each declaration. | [One relationship preserves each file pair and import variant](../../cookbook/behavior/architecture-import/t02-domain.feature#L16), [Finding paths retain order and repeated references](../../cookbook/behavior/architecture-import/t04-converter.feature#L51), [Every declared component has a card even without reported files](../../cookbook/behavior/architecture-import/t07-workflows.feature#L48) | [Import flags keep false, true, and unknown distinct](../../test/unit/domain/build-architecture-document.test.ts#L90), [Finding paths and roles](../../test/unit/components/architecture-details.test.tsx#L38), [Canvas uses declared components](../../test/unit/components/architecture-diagram.test.tsx#L8) |
| A saved file opens without a repository or analyzer. An invalid saved file preserves the current diagram. | [A saved document needs no repository or analyzer](../../cookbook/behavior/architecture-import/t07-api.feature#L69), [An invalid saved file preserves the installed application's view](../../cookbook/behavior/architecture-import/t08-installed.feature#L75) | [Open uses stored text and the common decoder](../../test/unit/documents/document-files.test.ts#L258), [Semantic failures give safe reasons](../../test/unit/lib/architecture-yaml.test.ts#L73) |

### Mutation isolation gap for R02

Stable identity does not give callers an isolated view. The
[review probe](2026-11-07-agreed-refactoring-plan.md#findings-and-evidence)
changed the returned `cleanupRecovery` field and let a second load enter
selection. Existing characterization exercises observation, ordering, and
cancellation. R02 needs a public API scenario for the cleanup gate and focused
assertions for nested document and layout data, returned outcomes and failure
details, and aliases retained by document or layout collaborators. Verify the
retained view and gate after the attempted writes as well as stable identity
between updates.

## Observability constraint

Workflow phases are `idle`, `loading`, `cancelling`, and `cleanup`. The
coarse stages are selection, discovery, setup, analysis, conversion, storage,
reading, validation, layout, and cleanup. Which stages appear depends on the
operation. A terminal workflow outcome is success, cancelled, busy, or failure.
Failures carry the stage, code, safe message, and nonnegative local duration in
milliseconds. A cleanup gate has its own failure and recovery state alongside
the last load outcome. A committed load reports success at view commit, before
the superseded release finishes.

Analyzer progress also reports elapsed milliseconds. The
[progress and elapsed time scenario](../../cookbook/behavior/architecture-import/t05-api.feature#L81)
and [execution test](../../test/unit/architecture/dependency-cruiser/execution.test.ts#L19)
check the reported stages and nondecreasing elapsed time. The
[workflow interface suite](../../test/interface/architecture/load-workflow.test.ts)
checks emitted state and outcome shapes.
The shared [OpenSLO Service](../../cookbook/observability/service.yaml) remains
unmeasured. These values describe local operations. R01 changes no events,
metrics, or OpenSLO artifacts.

## Architecture constraint

The [README tree](../../README.md#project-structure) describes internal
responsibility groups and the existing declarations. Component names, child
links, and artifact ownership remain as declared.

| Responsibility | Allowed dependencies and composition |
| --- | --- |
| Semantic domain | Domain types and helpers, plus required validation libraries. The model is independent of YAML, UI, platform, and vendor reports. |
| Discovery and manifest parsing | Discovery helpers and generated data, the domain catalog, and the injected repository-access type and its generated platform contracts. Manifest parsing uses YAML and validation libraries. |
| Workflow | Its generated operations, the neutral domain and discovery contracts, the codec, layout data types, generated platform data, and the required DocumentFiles operations. Concrete I/O and layout enter as injected collaborators. |
| Document file lifecycle | The codec and domain data, generated contracts, and the injected document-access type. The platform owns concrete desktop I/O and browser selection, reading, and download. |
| YAML codec | Its parsing helpers, generated format contracts, the domain validator and types, and required YAML parsing code. Layout and storage have separate owners. |
| Analyzer integration | The vendor folder owns execution, conversion, and report details. It uses the neutral domain boundary and injected platform access types. [create-architectural-layer.ts](../../src/architecture/create-architectural-layer.ts) is the named external entrypoint for constructing the concrete analyzer and its adapters. |
| Composition and React | [workspace.ts](../../src/architecture/workspace.ts) binds host-specific selection, access, codec, layout, and the analyzer factory. [App.tsx](../../src/App.tsx) uses that composition and retains host detection and the directory picker. Workspace controls use generated state, while diagram and details render prepared data. The starter preview still uses its own starter layout. |
| Platform and native shell | Platform modules use their own adapters and contracts, required validation libraries, Tauri APIs or browser APIs. Cargo and Tauri capabilities govern the native boundary. |

The current [dependency-cruiser rules](../../.dependency-cruiser.cjs) include
type-only dependencies. They reject cycles and unresolved imports, keep
frontend Tauri access in platform, keep platform imports within that group
among application modules, and restrict concrete analyzer imports to its
vendor folder and the named factory. The following intended restrictions need
more precise guards in R04.

- Discovery, its helpers, and document lifecycle have no dedicated guard
  against importing the UI or composition. The workflow guard relies on the
  `load-` filename prefix, which can miss helpers or a rename. The workflow
  guard currently permits the full platform generated directory.
- The codec guard allows any `lib/` sibling, including layout. It also names
  selected external packages to forbid, leaving other unrelated libraries
  outside that restriction.
- Only diagram and details have the prepared-data guard. The UI currently
  receives the concrete workflow in `WorkspaceBinding`. R04 should verify
  the role path introduced in R02 and keep the actual composition exceptions
  above. Test allowed and forbidden imports, including type imports.

## Interface constraint

[workflow.tsp](../../cookbook/interfaces/workflow.tsp) defines workflow data
and operation outcomes. The [generated TypeScript](../../src/architecture/generated/workflow.ts)
gives their data signatures. `LoadWorkflow` binds the load, open, cancel, retry,
and cleanup retry commands to promises. `documentCleanupFailed` is the
synchronous notification from the independent exporter. The
[workspace contract](../../cookbook/interfaces/workspace.md) describes the
live TypeScript bindings, including selection, abort signals, subscriptions,
and prepared positions. The interface suite checks asynchronous conformance
and validates emitted state and outcomes against the generated schemas.

[architecture.tsp](../../cookbook/interfaces/architecture.tsp) owns the semantic
document. [documents.tsp](../../cookbook/interfaces/documents.tsp) owns the
portable codec operations and
[desktop-documents.tsp](../../cookbook/interfaces/desktop-documents.tsp) owns
native file operations. Layout and viewport state stay outside YAML v1.
Runtime validation owns graph consistency, declared ownership, and bounded
parsing. R01 changes no TypeSpec sources, generated outputs, or conformance
checks.

## R01 verification

The baseline unit and Cucumber checks used Bun 1.4.4 and Node 26.13.0.

| Check | Result and scope |
| --- | --- |
| `bun test ./test/unit/domain ./test/unit/architecture ./test/unit/documents` | 284 passed, 813 assertions in 17 files. |
| `bun run test:behavior:native --tags '@cr-001-t02-domain or @cr-001-t06-api or @cr-001-t07-api'` | 52 scenarios and 291 steps passed. |
| `bun run check:dependencies` | Passed with 67 modules and 186 dependencies. |
| `bun run check:cookbook` | Component links, contract ownership, and the OpenSLO Service shape passed. |
| `bun run habit-hooks --all` | Passed. The snooze file is empty. |
| Markdown inspection | Local link targets and anchors, whitespace, and code fences checked. |

Browser acceptance, packaged desktop acceptance, and Rust suites were outside
the R01 rerun. The [T08 evidence record](../change-requests/CR-001-T08-evidence.md)
keeps the earlier results and their platform limits.
