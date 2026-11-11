# Appendix A, step 4: recover candidate components

Use this after the [step 3 cookbook](step-3-cookbook.md) has finalized its result.
For prerequisites and the complete sequence, read [start here](start-here.md).
Start with the saved entry analysis and its inspection priorities. Build
dependency evidence, then use the LLM to recover
the apparent intended architecture from source and documents.

This is baseline recovery. Observed imports do not define allowed access.
Component declarations and directories are clues. Each proposed boundary needs
source evidence and a reason for its grouping. Boundary problems and redesign
belong to Step 2 of the design.

The commands below prepare the evidence, validate the LLM review packet, and
publish the proposed model into the working drafts.

## Contents

- [1. Start an attempt](#1-start-an-attempt)
- [2. Prepare the graph toolchain](#2-prepare-the-graph-toolchain)
- [3. Collect dependency evidence](#3-collect-dependency-evidence)
- [Recover an incomplete saved input](#recover-an-incomplete-saved-input)
- [4. Collect source evidence](#4-collect-source-evidence)
- [5. Ask the LLM to recover components](#5-ask-the-llm-to-recover-components)
- [6. Check the proposed result](#6-check-the-proposed-result)
- [Saved state](#saved-state)

## 1. Start an attempt

Keep `CHOOM_WORK` and `CHOOM_TOOLS` from stage 3. Use a new attempt ID and keep
earlier attempts unchanged.

```sh
export CHOOM_STAGE4_ID="s4-001"
export CHOOM_STAGE4="$CHOOM_WORK/evidence/$CHOOM_STAGE4_ID"

node "$CHOOM_TOOLS/docs/design/app-a/stage-4-commands.mjs" start
```

The helper verifies the working drafts and every registered artifact. It requires
completed stage 3 inspection priorities, a selected entry analysis that supports
Knip reuse, and an empty initial baseline. It saves checkpoints and copies the
tools into the new attempt. Later evidence commands use these saved copies.
The publication commands in section 6 use the matching trusted checkout helper.

Before creating the attempt, it also checks every indexed snapshot path, file
type, and byte count. This catches missing or truncated input before the toolchain
build. It is a metadata check; full content verification still happens when the
inventory-only input is prepared and checked for the graph run.

The helper prepares `graph-profile.json` from the saved source scope, settings,
and explicit entry patterns. These choices are recorded before the graph runs.
Graph scan files and traversal roots are different:

- Scan every supported source file in the selected scope, including files with
  no known entry connection and generated TypeScript.
- Start traversal only from the explicit entry patterns in the retained plan.
  Save the matching files and pattern references. These are Choom's selected
  roots, not a claim about Knip's complete effective roots.

The profile scans every regular JavaScript and TypeScript file in the saved
stage 3 scope, including sources outside conventional `src/` directories. Each
fully parsed compiler configuration uses its saved `fileNames` selection. If a
file belongs to several configurations, each context keeps that file separately.
Files without a supported compiler selection use a named configuration-free
fallback. A repository without compiler configuration can use that fallback.

Each group has separate import and CommonJS passes with platform-neutral
`import`/`require` and `default` conditions. Browser, Node, Bun, custom and
TypeScript-specific package conditions remain unassessed. The helper does not
infer a runtime from a directory name or execute target configuration.

The profile passes only the saved target, module, module-resolution, JSX and
verbatim-module options to the parser. It approximates simple single-target
`paths` aliases within the snapshot. Unsupported aliases and `baseUrl`-only
resolution are recorded in `graph-profile-notes.json`; they can leave unresolved
edges. Compiler context boundaries stop traversal. Do not combine their
reachability results into a complete runtime graph.

This manual graph profile needs at least one regular JS/TS file and a regular-file
inventory. Framework source forms such as `.vue` and `.svelte` need separate
source evidence and stay outside this graph. Source filenames containing glob
characters stop preparation with a reason. The selected settings artifact is
`settings-001`, which stage 1 freezes after its final settings review.

## 2. Prepare the graph toolchain

Check Docker access from the executor that will run the following command,
before consuming this phase. If that executor cannot reach the local daemon,
leave `toolchain` and `run` unconsumed and retain the prepared attempt for an
executor that can. Follow the prerequisites in [start here](start-here.md).
The saved commands, profile, receipts and digests establish the handoff; terminal
output alone does not establish a completed graph run.

```sh
node "$CHOOM_STAGE4/stage-4-commands.mjs" toolchain
```

This builds a dedicated Docker image with dependency-cruiser 18.7.2 and
TypeScript 6.0.2. Dependency installation is confined to the tool image, uses
fixed requested versions, and disables installation scripts and optional peer
tool loading. The build has no target repository mount. It can require network
access to obtain the tool image and packages.

The helper records the image ID, package lock, versions, command outcomes, and
fixture result. The fixture checks aliases, type-only imports, dynamic imports,
conditional package imports, overlapping scan contexts, unresolved targets and
configuration traps. A fixture pass covers those cases; it does not prove
complete target coverage.

The graph engine uses the API and its built-in JSON reporter. It passes
Choom-owned data directly. It does not load a target rule file, custom reporter,
Babel configuration, or target plugins. A broad mount of host `node_modules`
would expose additional tool paths, so this workflow uses the dedicated image.

If this command fails, keep its logs and stop. Fix the toolchain in a new attempt
before running the graph. Do not substitute an unrestricted local analyzer run.

## 3. Collect dependency evidence

```sh
node "$CHOOM_STAGE4/stage-4-commands.mjs" run
```

The input helper prepares or verifies the shared inventory-only copy. Its path
uses the inventory digest; stage 2 and stage 4 can reuse the same verified copy.
The graph container receives that copy at `/repo`, read-only. It also receives
the saved control files, read-only. It has no network and cannot see the live
checkout or excluded source inputs. The helper requires a local Docker endpoint
and records the selected image and command. It verifies the input copy again
after the run.

The engine scans each context separately with these explicit settings:

- `parser: "tsc"` and `tsPreCompilationDeps: "specify"`.
- `exportsFields: ["exports"]` and `importsFields: ["imports"]`.
- Separate `import` and `require` conditions, each with `default`. These are
  platform-neutral source-analysis passes, not claims about the target runtime.
- Resolver targets stay within `/repo`. Installed target dependencies remain
  unavailable. Missing packages remain visible in the raw evidence.
- `doNotFollow: "^"` prevents recursive parsing. Each selected source file is
  supplied as an explicit scan root. This keeps each scan within its context.

`graph-results.json` retains raw dependency-cruiser output for each context and
normalized edges with references back to the raw records. It keeps unresolved
targets, built-ins, missing declared packages, and resolved targets outside the
current context. It records failures as failures or partial results, not empty
successful graphs.
Publication requires an actual completed run with every context completed.
A skipped Knip result from Stage 2 does not permit a skipped or inferred graph.
Read the run and context statuses separately from their coverage limits.
A completed `require` context can contain no dependency edges; an empty edge
list does not by itself mean the tool failed to execute.

Choom traverses retained internal source edges from the recorded roots. This
includes type-only, re-export, and literal dynamic dependencies. It saves reached
files, files not reached in that graph, and edges where traversal stopped.

These results are source relationships. They do not prove runtime execution or
unused code. A target outside the current context is a traversal boundary. Do
not merge incompatible context results or treat missing edges as absence.

The pinned analyzer can lose type-only labels on unresolved imports and combine
static and dynamic imports of the same specifier. The next source query retains
the expressions needed to investigate those limits. Its results do not silently
repair or replace the raw graph.

## Recover an incomplete saved input

An error from `graph-input-prepare.stderr.txt` can mean that a captured file is
now missing or changed. The input copy is checked against the full registered
inventory, including captured build output. A file can block that check even
when it is outside the graph's source scan.

Keep the failed attempt, its logs, and the inventory unchanged. Check the
snapshot and any saved input copies against the inventory. Check all paths for
missing files and type or size differences; the first reported path may not be
the only problem. A metadata check does not verify the remaining file contents.

There are two recovery paths:

- Restore the original bytes from a saved copy. Verify each replacement against
  its registered SHA-256 digest before restoring it. Record the source and
  recovery operation outside the failed attempt. Then verify the complete input
  and start a new stage 4 attempt.
- If the original bytes are unavailable, start a new run with a new snapshot and
  an explicit capture scope. Consider excluding disposable build output while
  keeping required generated source and configuration. Record unavailable inputs
  and rerun the affected discovery stages against the new snapshot.

Do not rebuild a missing binary and assume it matches the captured bytes. Do not
remove failed paths from the old inventory or reinterpret a partial directory as
the complete saved input. A narrower graph input would need its own explicit
scope and provenance; the current helper does not implement that alternative.

For the supported end-to-end route, use [stage 1](step-1-cookbook.md) to create a
fresh capture. If the surviving old snapshot is the intended source, set
`CHOOM_TARGET` to that snapshot, choose new run, snapshot and baseline IDs, and
use a new working folder. Do not nest the new folder inside the old run.

Before capture, record in the new `evidence/scope-notes.md` that the source is an
incomplete older snapshot. List the missing or excluded paths and the inherited
capture limits. A fresh inventory describes only what was captured this time;
it does not certify that all surviving files still match the older inventory.
Verify retained bytes against that inventory separately if that lineage claim
is needed. Keep that verification as evidence. Never repair the old inventory
by removing missing paths.

Then follow all six stages again. Do not reuse old tool reports as results for
the new snapshot. The new source path and explicit scope distinguish this capture
from a fresh capture of the live repository.

[recover-capture.mjs](recover-capture.mjs) is an exceptional utility retained for
the historical prototype. It verifies and copies a specific retained subset,
but writes a legacy capture layout. Its output is not a ready-to-finish input for
`stage-1-commands.mjs`. It needs a separate reviewed publication process. Do not
use that utility as a shortcut through the standard instructions above.

## 4. Collect source evidence

```sh
node "$CHOOM_STAGE4/stage-4-inspect.mjs" collect
```

This reads only indexed files whose saved hashes still match. It parses the
selected JavaScript and TypeScript source as text. It saves:

| Artifact | Contents |
| --- | --- |
| `source-sites.json` | Import and re-export syntax, dynamic imports, and candidate resource calls. Includes query scope, parser version, diagnostics, and limits. |
| `source-excerpts.json` | A bounded initial selection from priority files, entry candidates and component declarations, with file hashes, truncation and skipped paths. |
| `review-prompt.md` | The LLM review instructions with the current paths and evidence references. |
| `artifact-map.json` | Proposed artifact IDs and digests available at collection time. It omits itself, the mutable command log, and later files. |

The syntax query does not resolve bindings. A call named `writeFile`, `query`,
or `invoke` is a candidate site. It does not by itself establish resource access,
resource identity, or ownership. Mixed imports can contain type-only named
specifiers; their complete saved expressions remain available for review.

Initial excerpts contain at most the first 200 lines of a UTF-8 file of at most
2 MiB. Oversize and non-UTF-8 candidates are skipped with a reason; missing or
changed saved input still stops collection. These excerpt limits do not remove
files from the syntax or graph scope. The collector
uses paths named by inspection priorities, root README files, entry candidates
and saved `component.yaml` declarations. It saves at most 40 initial paths.
Omitted or truncated input is explicit. This is tool collection, not a claim
that the LLM has read those files.

Compare the saved selection and skipped paths with the inventory before recovery.
Declarations follow priority paths and entry candidates in the current selector,
so the 40-path cap can omit every `component.yaml`. Request omitted declarations
and relevant contracts, and follow truncated workflow bodies into later ranges
or other files when needed to support each reported path.

When the LLM needs more source, follow [Choose source ranges](start-here.md#choose-source-ranges)
before calling the helper. For example, request lines 1–150 of an indexed file:

```sh
node "$CHOOM_STAGE4/stage-4-inspect.mjs" excerpt \
  "path/from/the/inventory.ts" 1 150
```

Each successful request saves a new numbered artifact and receipt. The helper
clips the end line to the file length when needed. Missing source outside the
inventory needs a new snapshot.
Use the returned source ID, snapshot ID, path, digest and exact saved range in
`reviewedFiles`. Keep that source ID distinct from its excerpt artifact ID.
Use bounded displays, and request any part lost to display truncation before
claiming to have inspected it.

## 5. Ask the LLM to recover components

Give the LLM the saved `review-prompt.md`. In an interactive session, use:

```text
Review Choom Appendix A stage 4 for the prepared attempt.
Read its saved review-prompt.md and follow its evidence rules.
Verify the registered inputs and proposed artifact digests before analysis.
Use the stage 3 inspection priorities and the separate graph contexts.
Request additional numbered source excerpts when needed.
Recover the apparent intended architecture; do not recommend redesigns.
Prepare the proposed baseline and the supporting discovery records described
in step-4-cookbook.md. Keep the working drafts unchanged during review.
```

The LLM first explains representative behavior paths from inspected source. It
uses callers, tests, contracts, and documents to support the candidate groups.
It must distinguish a file entry from a behavior entry. Import references alone
do not establish a completed behavior path.

For each component, explain its purpose, proposed file membership, and grouping
reason. An API, worker, and command can belong to one component. A component can
span directories. Shared directory names and graph clusters are not sufficient
reasons for membership.
Shared contract links support a relationship, not exclusive file ownership.
A test can belong to its main workflow owner while exercising other components;
imports alone neither assign its owner nor prove isolation.

Prepare a complete review packet in a new folder outside `CHOOM_WORK`. Use the
exact filenames, shapes and reference rules in [record-format.md](record-format.md).
The following table explains their purpose:

| Proposed record | Required content |
| --- | --- |
| Baseline | Components, supported interfaces, resource owners, and intended rules. Statements use `{value, status: proposed, evidenceRefs}`. Unknown intent is `null` with a question or gap. |
| Code mapping | Explicit file scope, one direct component owner per file or `owner: null`, reasons, and supporting evidence. Exact mapped files belong here; membership selectors belong in the baseline. |
| Resource observations | Inspected access sites, access kind, target identity or explicit unknown target, context, and source evidence. Observed access does not establish permission. |
| Entry analysis update | Preserve entry history and Knip limits. Add supported behavior entries and references to the separate graph reachability results. |
| Discovery update | Overview, completed inspected paths, proposed fact references, questions, and gaps. `baselineRef` stays unset until the fixed baseline is saved in stage 6. |
| Review record | The prompt, response, supplied evidence, exposed model metadata, and exact source ranges actually inspected. Do not invent unavailable API metadata. |

Keep the dependency facts from the graph separate from the proposed model.
Do not turn every observed import into an allowed-access rule. Keep intended
resource ownership separate from observed reads and writes. Do not invent
interface promises from names or type signatures alone.

Preserve the prior questions and gaps unchanged in this prototype. Append notes
that cite the earlier IDs when evidence resolves part of a gap. Keep conflicting
documents and code visible. Do not create a utilities component to absorb
unexplained files. Stage 5 accounts for remaining code.
Rewrite current summaries and limits to match the proposed packet; the historical
preservation rule does not apply to stale overview text or current counts.

If the review establishes a missing entry or a necessary Knip setting change,
record the affected scope. A new controlled Knip attempt must precede conclusions
that depend on the changed settings. Additional source inspection alone does not
require a rerun.

## 6. Check the proposed result

Apply the [review before publication](start-here.md#review-before-publication)
guidance before `finish`. Check the complete model and fact records:

- Every evidence reference resolves and matches its digest. Source ranges match
  saved numbered excerpts. Tool scans are not recorded as LLM inspections.
- All inferred intent stays proposed. IDs are unique. Parent relationships have
  no cycles. Each mapped file has one direct owner or an explicit unknown owner.
- Membership selectors agree with the exact code mapping. Shared parent groups
  do not duplicate direct ownership.
- An inspected path cites the source that supports its entry, steps, and component
  references. Planned paths stay in the priorities, not in `inspectedPaths`.
- Reachability retains its context, roots, edge policy, stopped edges, and limits.
  No report difference or unreachable file is treated as proof of unused code.
- Resource observations and intended ownership remain separate. Unknown targets,
  missing dependencies, native-code coverage, and uninspected code remain visible.
- Current overview, mapping limits, resource limits and counts agree with the
  selected records. Do not carry an old limit forward merely because it was
  present in a previous packet. Review selected manifest summaries too; use the
  correction guidance for helper-owned prose rather than editing the manifest.
- The proposed draft updates are complete and consistent before any are written.

Use the shared trusted publisher after the review packet is ready. Its packet
schema is [record-format.md](record-format.md). The LLM supplies complete records;
the operator does not write a custom finalizer or classify source files.

```sh
export CHOOM_REVIEW="/absolute/path/to/stage-4-review"
node "$CHOOM_TOOLS/docs/design/app-a/stage-4-5-publish.mjs" check 4 "$CHOOM_REVIEW"
node "$CHOOM_TOOLS/docs/design/app-a/stage-4-5-publish.mjs" finish 4 "$CHOOM_REVIEW"
node "$CHOOM_TOOLS/docs/design/app-a/stage-4-5-publish.mjs" verify 4
```

Run each command separately. `check` validates the complete candidate without
publishing it. `finish` checks it again, preserves the review packet, registers
the attempt evidence, and publishes the working drafts. `verify` checks the
completed handoff. The publisher must match the trusted helper frozen at `start`.
Do not edit a frozen helper to bypass a failed check or run packet contents.

On success, `run.yaml` marks `componentRecovery: complete`. Discovery selects the
new entry analysis, mapping and resource observations plus the existing graph.
The baseline contains proposed statements. Keep this attempt unchanged and
continue to the [step 5 cookbook](step-5-cookbook.md).

## Saved state

| Point | `baseline.yaml` | `discovery.yaml` |
| --- | --- | --- |
| After `start` | Unchanged; empty on this initial pass. | Unchanged; still selects the finalized stage 3 entry analysis. |
| After `toolchain`, `run`, and `collect` | Unchanged. | Unchanged. New evidence exists in the stage 4 attempt but is not registered yet. |
| After the LLM review | Proposed model exists in separate review output. | Proposed mapping, access, entry, and path records exist in separate review output. |
| After `finish` and `verify` | Contains the supported proposed components and related intent. | Selects the new facts, overview, and inspected paths. `baselineRef` remains unset. |

Commands and receipts stay in this attempt. A failed action is not overwritten;
use a new attempt after correcting the cause. Keep successful stage 3 evidence
unchanged. Once stage 4 is published, keep all its registered artifacts unchanged
as well.
For a later correction, follow [start here](start-here.md#record-a-correction).
Do not repair a published artifact in place or rerun its finalizer.
