# CR-005 implementation and verification

Open a saved baseline in Production to find a component's operation and callers. Open
a second file to identify changes in access and the evidence that supports each conclusion.

The [change request](CR-005-component-interfaces-and-isolation-diff.md) defines the
individual ticket scenarios, failure cases and order. Start with A1.1–A1.3. Review
the six producer stages in order for A2. Use the shared fixtures for A3.1–A3.4, then
verify A4.1. Compare the verified facts through B1.1–B1.7 before B2.1–B2.3.

| Owner | Behavior | Observability | Architecture | Interface |
| --- | --- | --- | --- | --- |
| Shared baseline model | [Read and validate v6](../../cookbook/behavior/baseline-viewer/component-boundaries.feature), [compare reviewed crossings](../../cookbook/behavior/baseline-viewer/isolation-comparison.feature). Keep strict older readers. | Field-specific validation errors, review freshness, per-check limits and original file identities. | Keep the model pure under the [existing rules](../../.dependency-cruiser.cjs). | Extend [baseline](../../cookbook/interfaces/baseline.tsp) with [boundary data](../../cookbook/interfaces/baseline-boundaries.tsp) and [comparison](../../cookbook/interfaces/isolation-comparison.tsp). Retain [decision input](../../cookbook/interfaces/baseline-decisions.tsp). |
| Producer | [Save role evidence, check rule paths and publish the approved bytes](../../cookbook/behavior/producer/component-boundaries.feature). | Selected packets, evidence notes, tool receipts, limitations and readiness references. | Only the producer reads source. The shared model validates saved data. Existing dependency rules cover both. | Update [published records and stage handoffs](../design/app-a/record-format.md) and the actual stage prompts. Freeze reference bytes and distinguish accepted policy from inference. |
| Workspace | [Select scope](../../cookbook/behavior/baseline-viewer/production-scope.feature), inspect interfaces and [compare files](../../cookbook/behavior/baseline-viewer/isolation-comparison.feature). | Visible and accessible role, review, finding, focus and load states. | The workspace projects validated data before layout and inspection. Components receive prepared data through the workspace view. | Extend [workspace](../../cookbook/interfaces/workspace.md) and [operations](../../cookbook/interfaces/workflow.tsp). Bind attachments to After. |
| Document adapter and native shell | Read selected Before and After files on each host. Preserve the previous pair on a failed or cancelled read. | Picker cancellation, busy, read errors, original-byte digest. | Reuse the existing bounded, read-only browser/native path and native IPC. | Extend [dialog selection](../../cookbook/interfaces/document-dialogs.tsp). Keep the [native read contract](../../cookbook/interfaces/desktop-documents.tsp) and 16 MiB bound. |

These local operations use the [existing service objectives](../../cookbook/observability/service.yaml).
The public scenarios carry one tag per ticket. Run the ticket tag and its focused unit,
interface and integration checks together. Generate the contracts and run
`check:contracts`, `check:cookbook`, `check:dependencies`, `lint`, `test`,
`test:behavior`, `test:producer:docker`, the built browser suite and installed
baseline-viewer suite for release. Record actual input digests and host results here.

## Ticket outcomes

| Tickets | Verified behavior |
| --- | --- |
| A1.1–A1.3 | Read serialized v6 records, reject a missing source note at the offending field, and mark a decision-derived review that changes a boundary as needing refresh. |
| S1.1–S1.2 | Record an observed test use without labeling an entire helper test-only. Freeze the project key and the original bytes of the selected reference file. |
| S2.1, S3.1–S3.2 | Bind candidate claims to the corresponding Knip runs. Keep registration context, unresolved loading expressions and the reviewed source ranges. |
| S4.1–S4.3 | Retain the written route and actual member, including members with no public entry. Check supported declarations against the captured source and graph. Save ordered paths and limits. |
| S5.1–S5.3 | Rebind both ends to the final ownership map. Count an emitted copy once with proof of its origin. Distinguish a reviewed zero from a partial search. |
| S6.1–S6.2 | Require evidence for the boundary readiness check. Publish the approved bytes and verify them through the public reader. |
| A3.1–A3.4, A4.1 | Inspect operations and distinct callers by role. Apply the scope to the diagram, navigation, focus and evidence. Show a safe production finding for an excluded target. Preserve access to older inventories. |
| B1.1–B1.4 | Compare the actual route, member and rule. Date a new or resolved violation only with adequate evidence on both sides. Keep an already reachable target as an existing finding. |
| B1.5–B1.7 | Report changes to policy, ownership or production scope. Show a limited result when identity, scope, coverage or the available observations cannot date the change. |
| B2.1–B2.3 | Inspect the selected Before and After identities. Preserve a valid pair and selection after an error, busy request or cancellation. Close the comparison and return to After. |

## Published inputs

The browser and installed checks use each file's original bytes. The [comparison guide](../design/app-a/isolation-comparison.md)
opens the same After against each of the three Before files.

| Stage 6 file | SHA-256 |
| --- | --- |
| [After with a direct access](../../test/fixtures/baseline-viewer/published-boundary-after.yaml) | `8d4583d8db80e281f7d62774a45ce53086a0182aaabd25aa08a351184a28023e` |
| [Before with a complete check](../../test/fixtures/baseline-viewer/published-boundary-before.yaml) | `025e4c27539c47d1ea53b801ef62c7348c209739413a68a67e2211d06fe17f10` |
| [Before with an indirect route](../../test/fixtures/baseline-viewer/published-boundary-indirect.yaml) | `fc91218fc1dd714092150ef6dbc2aec2e7dd662bf0f46088492efbfb60b71819` |
| [Before with an unresolved route](../../test/fixtures/baseline-viewer/published-boundary-unresolved.yaml) | `18ef7043a2d15337c1ae2084fad26913323d4e4b2d6be7b755210b2a7a2f8081` |

## Fresh manual analysis

Reading-room commit `120cba611c13c86630d8f2b9ebff1a90f44355d5` has five
captured files. Its command calls `openingHour()` and prints the result. A
separately owned Node test calls the same function directly. The reviewed
imports and calls identify one outside caller in each role. The test does
not exercise the command launch or its output.

Each of the six stages used its saved inputs and a fresh analyst. The manager
reviewed each filled prompt and visible answer before publication. Both real
Knip modes completed with zero issue records. The real dependency graph
resolved the two imports. The analysts recorded partial caller coverage and
unknown rule results because installed callers and the checker invocation
were outside the evidence. The manifest and rule configuration have no
known exclusive owner.

Stage 6 verified 365 registered artifacts, five indexed files and 24 reviewed
source records. Its fixed v6 file has the exact Stage 5 proposal bytes, SHA-256
`8f5b71dc2a851d5ea136ce24861f73fe53430e73cc729d4a40214121d82b3f87`.
The local run, stage receipts, prompts and visible answers are under
`test-results/cr005-manual`. The Stage 3 log retains an initial attempt
whose review path was noncanonical. A fresh attempt repeated the collection
and passed before Stage 4 started.

The manual review exposed two instructions or checks that needed correction.
The Stage 5 symbol instruction now specifies v6 for a project-keyed run. The
producer now recognizes commands and callbacks from their evidenced
registrations as well as named JavaScript declarations. The final shared
reader and producer record validator both accepted the original manual file.
The record validator rechecked 172 references against the saved inputs.

## Release checks

The unit, DOM and integration suites passed 1,454, 299 and 208 tests
respectively. The default behavior suite passed 143 scenarios and 1,319 steps.
TypeSpec formatting, contract generation, both TypeScript projects and all
699 interface tests passed. Cookbook links, lint, unused-code and duplication
checks passed. The dependency check passed all 43 allowed and 54 forbidden probes
and found no violations across 240 modules. The Docker integration test and
both Docker behavior scenarios passed all 39 scenario steps with the pinned
collection tools.

The full built-browser suite passed 366 scenarios and 2,694 steps. The
installed Linux arm64 suite passed 29 scenarios and 175 steps through native
GTK pickers. The six frontend files in the tested browser build matched the
packaged build byte for byte. Both hosts opened the same four files listed
above, inspected the three comparison outcomes, cancelled a replacement
and returned to After.

The Debian package SHA-256 was
`44563fd73b6035726afcc80dd041713883f3ae9cacde289bbc7b4c3b93bbb38e`.
The installed executable and its package payload both had SHA-256
`af2309df1bf52789fd7b8f6b10fc866a5503b62a332386d790cbe0ba4c76837f`.
Local evidence is under `test-results/cr005-runner/verified-evidence`,
including the Cucumber result, screenshots and original-byte identities.
