# Appendix A analysis quality plan

This plan covers the six-stage architecture analysis and its published handoff.
The review on 20 November 2026 used TraceRelic run `run-002` and the Choom
producer and viewer changes in [PR 99](https://github.com/tomer-mayara/choom/pull/99).

## Outcome and checks

An operator starting with the manager guide can produce an evidence-backed
account of a different repository, explain what the review missed, and hand
off a baseline and discovery that open together. Use a completed run to learn
how a claim was checked. Establish the facts again on the new snapshot.

| Constraint | Decision | Check |
| --- | --- | --- |
| Behavior | Each Stage 4 graph pass reports its own traversal. Stage 5 traces earlier inspection in the selected entry-analysis history. Stage 6 names a caller only for a bound production call to the selected operation. | Exercise the [evidence scenarios](../../../cookbook/behavior/producer/recovery.feature) and [handoff scenarios](../../../cookbook/behavior/producer/component-boundaries.feature) through the CLI. [Open the worked example](../../../cookbook/behavior/baseline-viewer/discovery-result.feature) through the ordinary viewer file pickers. |
| Observability | Use the saved worker prompts, selected mapping and source ranges, publication receipts and the manager's handoff. | Recount the example from the selected evidence, verify the fixed pair and report any interpretation corrections separately. |
| Architecture | Stage workers collect and interpret evidence. The manager reviews it independently. The viewer reads the two published records. | `bun run check:dependencies` and `bun run check:cookbook`. |
| Interface | Keep the existing CLI, baseline v6, discovery v2 and [review packet format](record-format.md). Distinguish test coverage, source inspection and proof of execution. | `bun run check:contracts`, `bun run test` and the review scenarios. |

The [small-window browser scenario](../../../cookbook/behavior/diagram-workspace.feature)
also covers the viewer handoff. On Linux the scope switch wrapped at 390 × 640
pixels, leaving only 421 pixels for the diagram. Narrowing the horizontal
padding on the small-screen buttons kept the actions on one row and gave the
diagram 443 pixels. The existing minimum is 440 pixels.

## What the TraceRelic review established

The fixed pair opens together. All 96 assigned files agree with the selected
mapping, as do the direct owners of all 226 recorded source uses and 17 resource
access sites. Nine of 105 files have an unknown direct owner. The union of 265
reviewed ranges touched all 105 files and covered every line of 101. Four graph
contexts have partial coverage, all 19 boundary caller searches are partial,
and all six boundary policy results are unknown. Use those denominators when
reading the [worked example and its source identity](examples/tracerelic-run-002/README.md).

| Finding in the fixed analysis | Consequence and correction |
| --- | --- |
| The configuration interface lists only the loader method. The configuration barrel also exports a class, a schema and a type. The history interface test uses the class and schema. | The configuration interface's **Used by** view omits a history consumer. Reconcile exposed members, actual callers and documented scope before comparing interfaces. The observed consumer is a test. [Barrel](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/config/index.ts#L1-L3) · [Consumer](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/test/interface/history/history.steps.ts#L27-L45) |
| The logging assessment omits four runtime enum reads and two subclass references in provider source. | All six are provider self-use. The 221 test and five application uses are counts of saved records. They undercount usage and establish no additional outside caller. In the original, compare `sourceUsage.assessments[5]` with `packages/shared/src/logging/logger.ts` lines 26–31 and the two destination subclasses. These are working-tree sources. |
| Two purpose statements describe the configuration object as immutable. | The source validates and normalizes the path. TypeScript marks the field `readonly`. The implementation provides no runtime immutability guarantee. The teaching extract uses the narrower claim. [Configuration class](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/config/global-config.ts#L4-L13) |
| A history example calls a four-field description complete. The cited assertion checks six fields. | Read the result as an excerpt. The omitted fields are `sourceFile` and `timestamp`. The original readiness check `s6-001-history-example-scope` identifies the assertion. |
| The boundary search for `s4-001-operation-abstract-read` describes the first Node test. Stage 5 then records 14 additional calls in that test file. | The original boundary search remains partial. Give the stage and scope of that search and point to the later interface-use evidence. Treating the older limitation as a description of the final review hides known uses. |

## Changes to the process

- The [manager assignment](start-here.md#manager-and-stage-workers) and stage
  prompts state the evidence a worker can establish at each stage. Early workers
  report roles, roots or clues. Modelers trace declarations and actual uses.
  Readiness checks the member, access kind, direct owner, role and source
  ranges together. An unsupported category carries a search limit.
- Stage 4 reports each graph pass separately. A previous test supplied the
  same edges to import and require passes. The regression now collects a real
  graph where the same root reaches a second file only in the import pass.
- Stage 5 counts ranges in the selected entry-analysis history. Before its
  final file review in TraceRelic, 18 paths outside those ranges already had
  Stage 1 role reviews. The worker can follow earlier ranges to their originating
  records and consult the separate role review.
- Stage 6 used to select an operation and its example caller independently.
  It could cite another operation's call, or present an import as a caller.
  It now selects a bound production call and its operation together. When it
  has only a declaration, it cites the declaration and leaves the caller empty.
- The worked example has its own baseline ID and digest. Its discovery records
  the digest of the distributed bytes. The browser regression opens both files
  from the guide. The original pair remains available by its run-relative
  paths and digests in the example.

## Transfer check on a library

An independent reviewer applied the revised Stage 4–6 source questions to all
13 tracked files of `yocto-queue` v1.2.1. Before receiving the review, the
manager recorded four expected findings. The reviewer reproduced all four.

| Check | Evidence in the pinned revision |
| --- | --- |
| Identify what ships. | The manifest exports a JavaScript library, supplies its TypeScript declaration and lists its test command. [Package entry](https://github.com/sindresorhus/yocto-queue/blob/ce72d41de87b2a4ec7c50e10480300bee674d845/package.json#L13-L27) |
| Attribute provider self-use. | The constructor calls `clear()` and the `drain()` iterator calls `dequeue()` inside the same class. [Constructor](https://github.com/sindresorhus/yocto-queue/blob/ce72d41de87b2a4ec7c50e10480300bee674d845/index.js#L15-L25) · [Drain](https://github.com/sindresorhus/yocto-queue/blob/ce72d41de87b2a4ec7c50e10480300bee674d845/index.js#L79-L83) |
| Trace a test caller. | The AVA test imports the library and iterates over `queue.drain()`. [Import](https://github.com/sindresorhus/yocto-queue/blob/ce72d41de87b2a4ec7c50e10480300bee674d845/test.js#L1-L7) · [Call](https://github.com/sindresorhus/yocto-queue/blob/ce72d41de87b2a4ec7c50e10480300bee674d845/test.js#L73-L80) |
| Bound the caller search. | The captured repository has no separate production consumer. Outside packages and runtime execution were outside the review. The type test and README example have distinct roles. [Type test](https://github.com/sindresorhus/yocto-queue/blob/ce72d41de87b2a4ec7c50e10480300bee674d845/index.test-d.ts) · [Usage example](https://github.com/sindresorhus/yocto-queue/blob/ce72d41de87b2a4ec7c50e10480300bee674d845/readme.md#L15-L35) |

This exercise checked interpretation of source. The next evaluation covers
collection, publication and handoff on a fresh repository.

## Follow-up for the TraceRelic model

Run 002 has a verified publication and documented corrections. A corrected
full model is still open work. For a like-for-like follow-up, use the saved
snapshot and its capture limits with a fresh run ID. The base commit alone
cannot recreate the working tree. Record the source identity of the follow-up.

In Stages 4 and 5, reconcile the configuration barrel with the history test,
review the logging enum and subclass sites, and update the two purpose fields,
the history example and the dated caller-search explanation. In Stage 6, check
each finding above against the new proposal and source range. Open the fixed
pair and confirm the history test consumer appears with its test role. This
produces a corrected input for a later duplicated-interface assessment.

## Next full-run evaluation

1. **Before assigning workers**, select a repository and revision kept apart
   from prompt development. Have an independent reviewer write down the
   public entries, a representative source use, the runtime role of that use,
   and a limitation or unsupported claim. Withhold those answers from workers.
   For a library, include self-use and the scope of evidence about outside
   consumers. Use relevant cases from the [evaluation design](../llm-led-architecture-analysis.md#evaluation).
2. **Run all six stages** from the [manager guide](start-here.md) in a new
   workspace with a pinned Choom checkout. Save the stage packets and receipts.
   Check that the fixed pair opens in the viewer and that discovery names the
   digest of the opened bytes.
3. **Compare the independent answers** with the handoff and its supporting
   ranges. Record matches, false claims, missed source uses and unresolved
   cases with their scopes. Reconcile the reported graph and ownership counts.
   An operation and caller pass when the cited ranges establish that exact
   relation. A negative finding needs a complete search over its stated scope.
4. **Resolve discrepancies** in the stage that introduced them. For an already
   published result, attach dated corrections to the identified version or
   publish a new version. Recheck the affected case on another unseen revision
   before making a broader quality claim.
