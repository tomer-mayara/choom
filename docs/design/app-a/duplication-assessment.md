# Review duplicated interfaces

Run this assessment after the six stages of [Step 1](start-here.md) finish.
It adds evidence for [Step 2](../llm-led-architecture-analysis.md#step-2-investigate-isolation-and-granularity).
Keep the completed Step 1 folder unchanged. The assessment has a new ID,
manifest and output folder. Choom reads its saved report; the viewer does not
run a detector or an LLM.

The detector finds source similarities. A worker and an independent manager
review public capabilities, including aliases, small wrappers, types, data and
different implementations that the detector can miss. Similar code, a matching
name or a high score does not establish redundant interfaces.

## Prepare and collect

Use the trusted Choom checkout, its pinned Node and Bun versions, and
`bun install --frozen-lockfile`. Use one tool revision and runtime for an
assessment. The commands record helper hashes, the lockfile digest and runtime;
collection also records the native jscpd 5.4.2 binary digest and exact arguments.
The tool fingerprint also covers `package.json`, the shared run-layout helper,
both codec entry files, generated codec contracts, and all files in `src/domain/`
and `src/lib/architecture-yaml/`. Sorted paths and file hashes detect changes,
additions and removals in those folders. This covers the producer's local source
dependencies; extend the explicit coverage if an import moves outside it.
The assessment rejects changed registered inputs, fingerprinted sources,
lockfile or runtime between commands. Keep the trusted checkout unchanged
during each command and retain its revision and installed dependencies.

Existing assessments keep their recorded tool identity. Use their original
trusted revision for later verification; this expanded fingerprint does not
upgrade an old assessment. A run with changed tools needs a new assessment
folder. Do not rewrite a saved manifest or report to make it match.

Use absolute paths. The output parent must exist and the output folder must be
new. Prefer a location outside both the completed run and the trusted checkout.
An output directly under the checkout's `work-choom/` is also allowed.

```sh
export CHOOM_TOOLS=/absolute/path/to/trusted/choom
export CHOOM_RUN=/absolute/path/to/completed-step-1
export CHOOM_DUP=/absolute/path/to/duplication-001
export CHOOM_DUP_REVIEW=/absolute/path/to/review-input.json

node "$CHOOM_TOOLS/docs/design/app-a/duplication-commands.mjs" start "$CHOOM_RUN" "$CHOOM_DUP" duplication-001
node "$CHOOM_TOOLS/docs/design/app-a/duplication-commands.mjs" collect "$CHOOM_DUP"
```

`start` verifies the selected baseline, original inventory bytes and every
snapshot file against the completed run. It copies the baseline and inventory
into the new assessment and inventories all baseline interfaces and v2 entries.
It does not add artifacts to the old run.

`collect` scans the saved snapshot with an explicit configuration from the
trusted producer. It does not load target configuration, install target
dependencies, run target code or invoke a model. The fixed profile uses JS/TS,
JSX/TSX, a 0.8 AST threshold, 20 AST nodes, 100 tokens, three lines, weak token
mode, and a 1 MiB source-file limit. It excludes generated, test, dependency and
build output paths. See the saved `evidence/profile.json` for exact settings.

Keep both raw JSON and EDN reports. EDN contains the complete AST candidate set;
JSON can summarize that set as fewer links. The producer reconciles both and
retains EDN score precision. An exact token block has score `1` under the saved
token profile. This means token equality, not equal capabilities. Source-review
observations have no detector score.

Collection records `completed`, `partial`, `failed` or `skipped`. When the tool
reports fewer examined files than the selected inventory and cannot explain the
omissions, collection is partial. A failed command is not a successful empty
scan. If collection cannot be attempted, record the reason:

```sh
node "$CHOOM_TOOLS/docs/design/app-a/duplication-commands.mjs" skip "$CHOOM_DUP" "Pinned detector is unavailable on this host."
```

Use `skip` only before collection. A retry or changed profile needs a new
assessment. Review can continue with failed or skipped detector coverage; that
assessment remains partial.

## Review the bounded public inventory

Give the worker `baseline.yaml`, `evidence/endpoints.json`, the saved source
inventory, detector results and source files from the completed run. Record the
worker, model and settings, then have a different manager inspect the packet,
its sources and its conclusions. The helper validates the recorded identities
and references; it cannot establish that an AI or person performed sound review.

The worker must:

1. Inspect every public endpoint in the bounded inventory. Record comparison
   groups and why each group belongs together. Include useful capability leads
   without clone matches; do not require a detector score to start a finding.
2. Map each used detector range to an exact interface or v2 entry with source
   evidence. Check aliases, re-exports and wrappers in source. Ambiguous ranges
   remain unmapped. A mapping must match the exact recorded range; a containing
   class or file does not establish access-point identity. To map a token
   sub-block, explicitly review and record its exact range with the public
   declaration evidence. Never assign a private helper to its nearest interface.
3. Compare supported inputs, success results, failures, effects, state ownership
   and lifecycle where applicable. Inspect literal differences and relevant
   callers or contracts. Keep unknown intent explicit; non-callable entries can
   have inapplicable comparison topics with reasons.
4. Look for decisive reasons to keep both endpoints, such as different state
   owners, notification policies or compatibility obligations. Save opposing
   evidence as well as the overlap.
5. Record the examined endpoints, comparison groups, exact findings, helper
   exclusions and gaps. Coverage of a group does not imply that every possible
   pair in it was compared. Do not infer further findings by transitivity.

The manager reviews the source mappings and all decisions before the `review`
command. Missing endpoint coverage or pending findings produces a partial
review. Detector exclusions, unsupported sources and unresolved mappings remain
visible even when the recorded capability review is complete.

## Save the review packet

Write a JSON data file. Its top-level fields are:

| Field | Contents |
| --- | --- |
| `sources` | Snapshot ID, safe source path, whole-file SHA-256, inclusive line pair and a unique `evidenceRef`. The producer verifies these and saves the actual excerpts. |
| `mappings` | `{ endpoint, sourceRef }`; the endpoint has `interfaceId`, optional `entryId`, and `evidenceRefs` including that source reference. Only exact range matches produce a mapped detector lead; enclosing ranges do not. |
| `scope` | `examined` endpoint array, `groups` with `name`, `interfaces` and `reason`, and explicit `gaps`. Include whole interfaces and each v2 entry from the inventory. |
| `findings` | One saved comparison per canonical group, following the [report contract](../../../cookbook/interfaces/interface-duplication.md). |
| `exclusions` | Detector observation index, `kind: "helper-only"`, reason and evidence references. Both ranges must have zero public mapping matches and no ambiguity. Other unmapped or ambiguous pairs remain coverage gaps. |
| `reviewer` | `worker`, `model`, `settingsRef`, independent `manager`, `reviewedAt` and `decisionRefs`; required even for zero findings. |

Use registered artifact IDs for evidence references, or a source reference
declared in `sources`. `review-input` identifies the complete saved packet and
can hold model settings and manager decisions. Include those details in the
packet when using this reference; an identity label alone is not review evidence.
The [synthetic fixture packet builder](../../../test/fixtures/duplication-producer/review.mjs)
shows the shape. Its recorded fixture identities are test data, not real model
invocations. Replace them with the actual assessment provenance.

Across interfaces, group all entry observations under the unordered interface
pair. Within one interface, use the unordered pair of distinct entry IDs. Keep
the exact entry endpoints on each observation. Reject self-pairs and a whole
interface paired with its own entry. The publisher assigns a stable finding ID
from the bound baseline, snapshot and canonical group.

Each finding has exactly one verdict:

| Verdict | Required meaning |
| --- | --- |
| `needs-review` | No semantic decision yet. Unreviewed mapped detector leads receive this status. |
| `potential-redundancy` | A reviewed, supported capability overlap; record the overlap and rationale. |
| `justified-distinction` | A reviewed reason to keep both; record the decisive differences. |
| `insufficient-evidence` | Review cannot decide; record the precise gap. |

Recorded contract facts reference fields in the bound baseline without changing
their status. Source-review facts state `known`, `unknown` or `not-applicable`
and carry evidence or a reason. Do not fill missing facts with guessed values.
Preserve source references and reviewer provenance when merging observations.

```sh
node "$CHOOM_TOOLS/docs/design/app-a/duplication-commands.mjs" review "$CHOOM_DUP" "$CHOOM_DUP_REVIEW"
node "$CHOOM_TOOLS/docs/design/app-a/duplication-commands.mjs" publish "$CHOOM_DUP"
```

Publication verifies registered evidence and the same portable report codec used
by Choom. The phases are `started`, `collected`, `reviewed`, then `published`.
Each phase runs once. Keep a failed attempt for diagnosis and use a fresh folder
for a correction; do not repair digests or overwrite published artifacts.

## Handoff and display

Keep `assessment.yaml`, `baseline.yaml`, `interface-duplication-review.yaml` and
the complete `evidence/` folder, together with access to the original Step 1 run
and matching trusted tools. The manifest binds the assessment to the original
run, exact baseline bytes and snapshot inventory. The portable viewer only
needs the baseline and saved report; it does not resolve or execute evidence
references.

The report separates detector and review coverage. Detector `examined`,
`excluded` and `unsupported` counts count files. `helperOnly` and `unmapped`
count candidate pairs. Unknown counts are `null`, including exclusions when
jscpd does not explain all omitted files. Eligible-function coverage is unknown.
Review `inspected` and `pending` count findings; endpoint coverage is preserved
in the registered review input. A successful scoped scan does not prove full
source coverage or semantic accuracy.

In Choom, attach the saved report to the exact baseline. Open **Duplicates** for
the list, coverage and pair comparison. The default view includes
potential redundancy and unresolved cases; justified distinctions are available
through the status filter. Component counts count distinct findings involving
their directly owned interfaces, excluding justified distinctions regardless of
the list filter. Comparison links open the recorded interface and exact v2
entry. These are advisory findings, not dependencies or confirmed rule
violations. Opening a report does not change the baseline.

If this assessment has not run, the Step 1 handoff says **not checked** and gives
the reason. Afterward, link the new assessment and report its actual scan,
review and publication outcomes. Do not add that link by rewriting the completed
Step 1 manifest.

## Focused verification

```sh
node --test test/interface/duplication/*.test.mjs
bun test ./test/interface/duplication
```

These checks exercise actual pinned collection, complete EDN accounting,
immutable input identity, reviewed source-only leads, pending coverage, helper
exclusion, and publication through the shared reader. The existing
`bun run check:contracts` discovers these `.mjs` specifications through
`test/interface`; no viewer dependency on jscpd is added.
