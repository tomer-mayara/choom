# Stage 4 and 5 review records

Read this with the [stage 4 cookbook](step-4-cookbook.md) or
[stage 5 cookbook](step-5-cookbook.md). It defines the data that the LLM supplies
to the shared publisher. The publisher is a trusted tool. Review folders contain
data only; do not generate or execute a run-specific save script.

## Review folder

The LLM prepares these **nine files**, in a new folder outside `CHOOM_WORK`.
The operator saves them if the LLM cannot write there. Do not ask the operator
to classify source files or fill analysis records. Return complete records,
not patches, ellipses, or example IDs. Keep the full prompt and response.

| File | Contents |
| --- | --- |
| `baseline.proposed.yaml` | Complete proposed baseline. |
| `discovery.proposed.yaml` | Complete working discovery; no `baselineRef` yet. |
| `entry-analysis.yaml` | Complete updated entry analysis. |
| `code-mapping.json` | Every inventory file, with one owner or an explicit unknown owner. |
| `resource-access.json` | Source-supported resource observations. |
| `llm/analysis-prompt.md` | Full instructions supplied to the LLM. |
| `llm/analysis-response.md` | Full response, including the exact text of all five candidate records above. |
| `llm/analysis-call.yaml` | `provider`, `model`, `date`, `settings`. Use `unknown` for values not exposed; settings can be a mapping or `unknown`. |
| `llm/review-scope.json` | `formatVersion: 1`, `runRef`, `snapshotRef`, `attemptId`, `suppliedArtifactRefs`, `limits`. The last two are nonempty string arrays. |

The folder must contain exactly these files. The full response can use fenced
blocks for the five records. Their contents must match the individual files.
Do not write into the attempt or change the working drafts before publication.

## IDs and evidence

Read IDs from the saved manifest and handoff; do not copy an earlier run's IDs.
For attempt `s4-001`, the publisher registers `entry-analysis.yaml` as
`s4-001-entry-analysis`. Each other attempt file uses
`s4-001-file@` followed by `encodeURIComponent(relativeFilename)`.
For example, `code-mapping.json` becomes `s4-001-file@code-mapping.json`.
Stage 5 uses the same rule with its own attempt ID.

Keep IDs for continuing components, candidates, mapped units and observations.
Prefix new analysis IDs with the current attempt ID. Model IDs must not collide
with artifact IDs, source-range IDs, or other current model IDs. A baseline item
ID uses lowercase letters, digits and hyphens.

An `evidenceRefs` field is a nonempty array of registered artifact IDs, proposed
current-attempt artifact IDs, saved source-range IDs, or exact JSON Pointers into
those records. Use `/` and `~` escaping from JSON Pointer. References must resolve
against the saved records. A filename alone is not an evidence reference.
`subjectRefs` identifies the files, components, statements or earlier issues
being discussed; it is not a substitute for `evidenceRefs`.

Use saved numbered excerpts for source claims. An excerpt being available does
not mean it was read by the LLM. A source review record must use the exact saved
excerpt ID, snapshot ID, hash and range. Request another excerpt for a different
range. Preserve earlier questions and gaps unchanged; append linked resolution
notes instead of deleting or rewriting history.
This preservation rule applies to those historical records, not to current
explanations. Rewrite the selected mapping/resource `limits`, reachability
reason and discovery overview when they become stale. Recompute current counts
from the selected records. Do not keep an obsolete count or a completed stage
described as future work beside a newly appended correction.

## Baseline

All versions have `formatVersion`, `id`, `parentId: null`,
`components`, `interfaces`, `resources`, and `rules`. Version 3 also permits
`sourceUsage`; no other top-level fields are allowed. Keep the initial baseline
ID. All four collections are arrays; at least one component must have supported
evidence for this publication profile. Other collections can be empty.

Stage 1 still creates the empty version 1 seed. Versions 1 and 2 remain strict:
version 1 has no interface `documentation`, and neither permits `sourceUsage`.
Use `formatVersion: 3` for source-use assessments. It retains version 2
documentation, signatures, semantic checks, and limits. Stage 6 validates the
selected version and saves its exact bytes. There is no automatic migration.

An intent statement has exactly `value`, `status: proposed`, and `evidenceRefs`.
Unknown intent uses `value: null` and a question or gap whose `subjectRefs`
includes the item ID or a field such as `interface-id.allowedConsumers`.
Publication does not accept intent.

| Collection | Exact item fields |
| --- | --- |
| `components` | `id`, `name`, `purpose`, `membership`, `groupingReason`; optional `parent`. |
| `interfaces` | `id`, `name`, `owner`, `publicAccess`, `allowedConsumers`, `promises`; versions 2/3 also permit `documentation`. |
| `resources` | `id`, `name`, `identity`, `owner`, `accessRules`. |
| `rules` | `id`, `name`, `subject`, `expected`, `check`. |

`id` and `name` are strings. Other fields use intent statements:

- Component `purpose` and `groupingReason` values are nonempty text. `parent`
  names another component or is null; parent cycles are invalid.
- `membership.value` has `paths` and optional `excludePaths`. Each selector is
  an exact snapshot-relative path or a subtree ending in `/**`. Other glob forms
  are unsupported. Selectors must assign at most one direct owner. Exclude a
  child's files from its parent; containment does not duplicate ownership.
- An `owner` value names a component, or is null with an explained gap.
- `publicAccess.value` lists access points as nonempty strings.
  `allowedConsumers.value` is a nonempty list of component IDs, or null when the
  complete positive policy is unknown. Observed callers do not establish it.
- `promises.value` has exactly `behavior`, `data`, `errors`, and `lifecycle`.
  Each is text, or null with a question or gap. The entire promises value may be
  null when unsupported.
- Resource `identity` and `accessRules` values are text or null.
- Rule `subject`, `expected`, and `check` values are objects or null. State the
  affected entities, intended restriction, and proposed check method in those
  objects. A proposed check is not a passed tool result.

### Version 2 interface documentation

Documentation explains an interface to a reader. It does not replace its owner,
public access, access policy, or promises. Do not rename allowed consumers as
observed users. Source inspection does not prove that an example was executed.

`documentation` has exactly `summary`, `entries`, and `sourceNotes`. All three
fields are required when documentation is present. Missing documentation means
that no structured documentation was supplied. Empty `entries` and `examples`
arrays are valid; do not add placeholder entries or examples.

`summary` is an intent statement whose value is nonempty text or null. Each
entry has these fields:

| Field | Value |
| --- | --- |
| `id`, `name` | A local ID and a readable name. Entry IDs are unique within this interface. |
| `accessPoint` | One exact string from this interface's `publicAccess.value`. Do not infer a path or symbol. |
| `kind` | A statement with value `function`, `command`, `type`, `data`, `message`, `workflow`, or null. |
| `description` | A statement with nonempty text or null. |
| `signature` | Optional statement, only for `kind: function`, including methods. Its value is the supported literal declaration with parameters and return type, or null. |
| `interaction` | Optional statement, only for a function, command, or workflow. Its value is an object with exactly `input`, `success`, `failures`, and `effects`. Each fact is nonempty text or null. The object itself is not null. |
| `examples` | An array of the example records below. |

Use the same statement envelope as legacy intent: `value`, `status: proposed`,
and nonempty `evidenceRefs`. `interaction` has one envelope for its four facts;
do not wrap each fact separately. Entry and example IDs use the model ID syntax.
They are local identifiers, not registered artifact or source IDs.

Copy a function or method signature from its saved declaration or registered
contract. Preserve parameter names, parameter types and the return type. Keep
supported modifiers and defaults. Omit the body and its opening brace. Do not
invent types, `void`, defaults or parameters, and do not derive types from prose.
If the complete declaration cannot be supported, record `signature.value: null`
and its exact gap subject. Keep supported interaction facts separately.
An absent signature means not recorded; null means unknown. Omit signatures for
all other entry kinds. The signature has its own status and evidence references;
its sources need not be the same as the description's sources.

Each example has exactly `id`, `name`, `basis`, and `content`. Its ID is unique
within its entry. `basis` is `illustrative` or `source-reviewed`. `content` is
one non-null statement. Its value has required nonempty `text`, optional nonempty
`input` text, and an optional `result` object. A result has exactly nonempty `text`, nonempty
`summary`, and `scope: complete` or `scope: excerpt`. Use `excerpt` for shortened
output. Do not invent absent sample output or describe a source review as a run.

A source note has `evidenceRef` and a nonempty `description`. It can also have
`location`. Each note must name a reference cited by a statement in the same
interface, including its legacy fields. One note per reference is allowed.
An unlocated note can explain a registered artifact. A located note must name a
direct source-record ID, without a JSON Pointer fragment. Its location has
exactly `snapshotRef`, snapshot-relative `path`, `sha256`, and
`lines: [first, last]`. Copy these values from that saved source record. The hash
has 64 hexadecimal digits; line numbers are positive safe integers in order.
Never substitute the live checkout, a matching filename, or a newly read range.

For `basis: source-reviewed`, the example's own `content.evidenceRefs` must
include a direct `reviewedFiles` record ID from the selected entry-analysis
predecessor chain. The same interface must have a located source note for that
ID. A collected excerpt, a graph reference, a source note alone, or an unrelated
statement's citation does not establish review. The helper checks this link and
the saved snapshot identity. The reviewer checks whether the cited lines support
the example and any result. An `illustrative` example still needs support from a
registered contract. If neither reviewed source nor a contract supports it, omit
the example and keep the real gap.

For each new unknown fact, add its exact field subject to a question or gap in
the discovery. Use the entry ID, not an array index. For example:

```text
interface-id.documentation.summary
interface-id.documentation.entries.entry-id.kind
interface-id.documentation.entries.entry-id.description
interface-id.documentation.entries.entry-id.signature
interface-id.documentation.entries.entry-id.interaction.input
```

The interaction subject uses the fact name (`input`, `success`, `failures`, or
`effects`) and omits the statement envelope's `value`. One issue can list several
subjects. An interface-wide issue is not sufficient for these nested facts.
Legacy unknown fields keep their existing subject rules. Omitted optional data
and empty lists do not need invented gaps.

This abbreviated shape shows the statement boundaries. Replace its illustrative
IDs with this run's saved IDs and include all legacy interface fields in the
complete proposal. The source reference must resolve in the saved run:

```yaml
documentation:
  summary:
    value: Decode and validate baseline YAML.
    status: proposed
    evidenceRefs: [saved-decoder-review]
  entries:
    - id: decode
      name: Decode baseline YAML
      accessPoint: src/lib/baseline-yaml.ts#decodeBaselineYaml
      kind:
        value: function
        status: proposed
        evidenceRefs: [saved-decoder-review]
      description:
        value: Return a success or failure outcome for the supplied YAML text.
        status: proposed
        evidenceRefs: [saved-decoder-review]
      signature:
        value: "export function decodeBaselineYaml(text: string): DecodeBaselineOutcome"
        status: proposed
        evidenceRefs: [saved-decoder-review]
      interaction:
        value:
          input: Baseline YAML text.
          success: An outcome with the validated baseline and decoding duration.
          failures: An outcome with a failure code and message.
          effects: No file access.
        status: proposed
        evidenceRefs: [saved-decoder-review]
      examples:
        - id: valid-input
          name: Decode supplied text
          basis: illustrative
          content:
            value:
              text: decodeBaselineYaml(text)
            status: proposed
            evidenceRefs: [saved-decoder-review]
  sourceNotes:
    - evidenceRef: saved-decoder-review
      description: Saved decoder contract used for this explanation.
```

### Version 3 source-use assessments

Version 3 can add one top-level `sourceUsage` object. It records reviewed source
use independently from permission. It has no statement status or execution
flag. Component assignments depend on the selected mapping, which can remain
proposed. Keep owner and permission statements unchanged unless separate intent
evidence supports a change. Never fill `allowedConsumers` from caller lists.

The object has exactly `snapshotRef`, `mappingRef`, and `assessments`.
`snapshotRef` must equal `run.snapshot.id`, even when assessments are empty.
`mappingRef` must equal the candidate `discovery.codeMappingRef`, whose mapping
uses the same snapshot. Use one common mapping; do not repeat it in use records.

Each assessment has these required fields:

| Field | Value |
| --- | --- |
| `interfaceId` | An existing interface ID, unique across assessments. |
| `scope` | Nonblank text explaining which callers and files were reviewed. |
| `evidenceRefs` | Nonempty, distinct references supporting this scope. General graph or query evidence can occur here. |
| `limitations` | An array of nonblank explanations; it can be empty. The assessment can still omit other uses. |
| `uses` | The saved use records below. An empty list means no uses found in this scope, not that the interface is unused. |
| `sourceNotes` | Notes for cited assessment or use references. Reuse the documentation note/location shape, scoped to this assessment. |

Each use has these fields, with no additional keys:

| Field | Value |
| --- | --- |
| `id` | A stable model ID, unique within this assessment. |
| `consumerId` | The caller file's direct owner in the selected mapping, or null when that owner is unresolved. A known ID names an existing component. |
| `kind` | `value` or `type`. Value use includes a reviewed call, value reference, callback/JSX binding, or resolved IPC binding. It does not prove execution. |
| `context` | `application`, `tooling`, `test`, or `unknown`, based on source review. Do not classify solely from the filename. |
| `description` | Nonblank text explaining the use, including unresolved ownership or context when present. |
| `callerRef` | A direct saved source-record ID without a fragment. It must occur in this use's `evidenceRefs`. |
| `evidenceRefs` | Nonempty, distinct direct saved source-record IDs without fragments. They support the caller and any declaration, configuration, or binding chain. |
| `accessPoint` | Optional exact item from this interface's `publicAccess.value`. |
| `entryId` | Optional documented entry ID in this interface. If both binding fields exist, its access point must equal `accessPoint`. |

A source record is distinct from its containing artifact ID. Every use reference
must name a source record in the selected entry-analysis `reviewedFiles` chain.
A collected but unread excerpt is insufficient, including supporting bindings.
Graph, query, and import-index artifacts cannot replace direct use evidence.
Saved declaration and configuration text can support a binding; source evidence
is not limited to JavaScript, TypeScript, or Rust.

Every use reference requires a matching source note with the source record's
exact snapshot, path, hash, and saved range. All supplied note locations must use
the common `snapshotRef`. A note must cite a reference from this assessment or
one of its uses; allow one note per reference. Scope-only notes may omit location.
The publisher checks identity and review history. The manager checks that the
cited code supports the claim and records that review in `llm/analysis-response.md`.
The viewer does not fetch source, check digests, execute examples, or verify calls.

Read concrete calls and bindings. Follow aliases, injected callbacks, JSX, and
native command registration as needed. An import match alone does not establish
which interface is used. Keep an unresolved interface finding in discovery
instead of attaching it to a guessed interface. Entry binding is optional when
the interface is supported but a precise entry is not; absence does not mean
that every method is used. Preserve repeated caller sites and self-use.

If the caller's owner or context is unresolved, explain it in `description` and
add a discovery question or gap with the exact corresponding subject:

```text
interface-id.sourceUsage.uses.use-id.consumerId
interface-id.sourceUsage.uses.use-id.context
```

A permission gap does not explain an unresolved source consumer. No source-use
object means not recorded; no assessment means not assessed for that interface.
Neither absence nor a scoped empty list requires an invented gap. Record a
manual command with no established source caller in scope limitations, supported
by evidence. Do not invent a root component or external actor as its consumer.

Stage 5 updates the common `mappingRef` to its candidate mapping even when all
owners stay the same. Recheck every carried consumer assignment and interface
or entry binding. Reuse unchanged reviewed caller evidence. Stage 6 retains the
published Stage 5 mapping and bytes; saving does not revise source use.

The following fragment illustrates one resolved callback use. Its IDs and digest
are fictional. Replace them with this run's saved identities and include the
rest of the baseline. Here both source ranges were reviewed, the mapping assigns
`src/workspace.ts` to `workspace`, and `read-text` is an entry of `file-reader`:

```yaml
sourceUsage:
  snapshotRef: snapshot-example
  mappingRef: s4-example-file@code-mapping.json
  assessments:
    - interfaceId: file-reader
      scope: Reviewed the workspace reader construction and callback invocation.
      evidenceRefs: [s4-example-caller, s4-example-binding]
      limitations: [Other callers and runtime execution were not assessed.]
      uses:
        - id: workspace-read
          consumerId: workspace
          kind: value
          context: application
          description: The workspace invokes the injected reader to obtain selected text.
          callerRef: s4-example-caller
          evidenceRefs: [s4-example-caller, s4-example-binding]
          entryId: read-text
      sourceNotes:
        - evidenceRef: s4-example-caller
          description: The saved workflow invokes the reader callback.
          location:
            snapshotRef: snapshot-example
            path: src/workspace.ts
            sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
            lines: [10, 30]
        - evidenceRef: s4-example-binding
          description: The saved composition passes the file reader to the workflow.
          location:
            snapshotRef: snapshot-example
            path: src/composition.ts
            sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
            lines: [1, 20]
```

### Reader limits

The publisher and Stage 6 use the viewer's bounded YAML profile before parsing
the baseline. It permits one UTF-8 YAML document with JSON-compatible values.
Aliases, anchors, explicit tags, directives, duplicate keys, non-string keys,
and invalid flow separators are rejected. Limits are 16 MiB per baseline,
32 YAML levels, 250,000 YAML nodes and line breaks, and 1,500,000 lexer tokens.

The complete architecture permits at most 500 records, 2,000 explicit owner and
allowed-consumer links, and 16 component levels. These are viewer limits, separate from
the command readers' larger per-file ceilings. Stage 4 and 5 can read at most
128 MiB per artifact; Stage 6 review files are limited to 16 MiB each. Those
ceilings do not establish viewer compatibility.

Documentation permits at most 32 entries per interface and 8 examples per entry.
Names, descriptions, signatures, summary text, interaction facts, source-note
descriptions, and result summaries each use at most 8 KiB of UTF-8. Example text,
input and result text each use at most 16 KiB. New IDs, references, access points, snapshot
references and paths each use at most 4,096 bytes. Required or supplied text must
not be blank. Nullable facts use null rather than an empty string.

The combined documentation limit is 2 MiB. Count UTF-8 bytes of
`JSON.stringify` applied to the array of all present documentation objects, in
interface order. Include array delimiters, metadata, punctuation and repeated
values. Do not count only displayed text or deduplicate references for the limit.

Source use has a separate limit of 2,000 use records and 4,000 source notes
across all assessments. Count all uses before combining sites or filtering the
canvas. IDs, references, access points, and paths each have a 4 KiB UTF-8 limit;
descriptions, scope, and limitation text each have an 8 KiB limit. Require
nonblank text, safe snapshot-relative paths, 64-digit hexadecimal SHA-256, and
positive ordered safe-integer line ranges, as for documentation. The complete
`sourceUsage` object has a 2 MiB UTF-8 limit using compact `JSON.stringify`,
including metadata and repeated strings. Enforce these budgets independently
from documentation and legacy owner/allowed-consumer links. Do not add source
uses to the permission-link total or ignore data hidden by a view filter.

Before publishing, review the documentation's meaning with its exact saved
source ranges. Keep the review in `llm/analysis-response.md`. The nine-file packet
does not change. During tool development, check versions 1, 2, and 3
with the public reader and display boundary, and record those
results outside the publication packet. Reader success does not replace source
review or the publisher's provenance checks.

## Entry analysis

Use these fields:

| Field | Required value |
| --- | --- |
| `formatVersion`, `kind`, `snapshotRef` | `1`, `entry-analysis`, current snapshot ID. |
| `previousEntryAnalysisRef` | The selected entry analysis in `discovery.before.yaml`. |
| `planRef`, `knipRunsRef` | Preserve the prior selected references. |
| `candidates` | Preserve prior items unchanged and in order. Append supported candidates under the restrictions below. |
| `inspectionPriorities` | Preserve the prior list exactly. |
| `reviewedFiles` | New source ranges actually read in this stage. Earlier ranges stay in the predecessor chain. |
| `questions`, `gaps` | Preserve earlier records and append new evidence-supported records. |
| `llmReview` | `recorded`. |
| `knipAssessment` | `{action: reuse, reason, evidenceRefs}`; explain why the saved analysis remains applicable. |
| `reachability` | The context-specific graph selection described below. |
| `behaviorEntries` | Source-supported behavior entry records. May be empty when none were established. |

A `reviewedFiles` item has `id`, `snapshotRef`, `path`, `sha256`, and
`lines: [first, last]`. It must match a saved excerpt. An inspected range does not
establish complete file coverage or runtime execution.

Set `reachability` to:

```text
status: assessed-with-limits
method: context-specific-source-graph-traversal
dependenciesRef: selected graph-results artifact ID
reason: explanation of scope and limits
contexts: [{id: context ID, resultRef: graph artifact ID + '#/contexts/N/reachability'}]
```

Use the graph context order and zero-based `N`. Do not combine incompatible
contexts. The deterministic graph result owns the traversal, not the LLM.

Each behavior entry has `id`, `kind`, `expression`,
`source: {path, lines: [first, last]}`, `fileEntryRefs`, `componentRef`, and
`evidenceRefs`. File entry references must name retained candidates. The source
must belong to that component and lie within a cited reviewed range.

New candidates may describe unresolved expressions, non-JavaScript/TypeScript
entries outside the graph profile, or JavaScript/TypeScript files already in the
saved graph roots. They still need evidence and explicit scope limits. They do
not change saved entry patterns or turn an unresolved candidate into a root.

This publisher preserves tool settings and the graph root set. If those need to
change during Stage 4 review, stop before publication and return to the affected
earlier cookbook with fresh attempt IDs. Once Stage 4 has been published, these
helpers cannot rewind the model. A later root/settings change needs a new run
with a new capture and corrected settings. That capture can use the saved
snapshot as its source if the original exclusions and limits remain explicit.
Do not publish facts that depend on analysis with different inputs.

## Code mapping

Use `formatVersion: 1`, `kind: code-mapping`, `snapshotRef`, `scope`, `units`,
and a nonempty `limits` string array. The scope has:

```text
inventoryRef: current inventory artifact ID
basis: all-inventoried-regular-files
unitKind: file
inspectionMeaning: explanation of reviewed vs unreviewed
selectedEntryAnalysisRef: current attempt entry-analysis ID
historicalEntryAnalysisRefs: predecessor IDs, newest first, following the whole chain
```

Every inventory file appears exactly once in `units`. Each unit has `id`,
`path`, `sha256`, nonempty `roles`, `owner`, `membershipRef`, `inspection`,
`reason`, and nonempty `evidenceRefs`.

An owner is a component ID or null. With an owner, `membershipRef` points to that
component's membership statement in the proposed baseline. With no owner, it is
null and `reason` explains the uncertainty. Exact ownership must agree with all
membership selectors. `inspection` is `reviewed` if any range for that path occurs
in the selected entry-analysis chain; otherwise it is `unreviewed`. This flag is
not full-file coverage. Keep the ranges in their source review records.

Ownership and inspection answer different questions. A declared input can have
an owner without an inspected body; a reviewed shared contract can still have
an unknown exclusive owner. Shared artifact links do not assign ownership.
A mixed test can follow its main workflow owner while exercising another
component. Explain unknown ownership and deferred inspection using the checked
scope and missing evidence, without a catch-all component or unused-code claim.

## Resource observations

Use `formatVersion: 1`, `kind: resource-observations`, `snapshotRef`, `scope`,
`observations`, and a nonempty `limits` string array. Scope has
`method: source-inspection`, `reviewedFilesRef` pointing to the current entry
analysis's `#/reviewedFiles`, and `historicalEntryAnalysisRefs` as in the mapping.

Each observation has `id`, `componentRef`, `source: {path, lines: [first, last]}`,
`operation`, `target`, `context`, and nonempty `evidenceRefs`. `target` has
`expression`, `resourceRef` (a modeled resource ID or null), and
`identity: symbolic` or `unknown`. The actor must own the source file. The source
site must lie within a cited reviewed range. Describe only the inspected access;
do not infer a complete mutation history or exclusive access policy.
Syntax-query matches identify sites to inspect. Establish the actor, operation
and source context before adding an observation; a registration inside a
deferred function body is not automatically a module-start effect. These
records remain source observations, not runtime verification.

## Discovery

Top-level fields are exactly `formatVersion: 1`, `kind: architecture-discovery`,
`runRef`, `entryAnalysisRef`, `codeMappingRef`, `dependenciesRef`,
`resourceAccessRef`, `overview`, `inspectedPaths`, `questions`, and `gaps`.
Leave `baselineRef` absent until stage 6.

`overview` has `text` and nonempty `evidenceRefs`. `inspectedPaths` contains source
paths actually reviewed. Each has `id`, `description`, `entryPointRef` naming a
behavior entry, nonempty `componentIds`, `evidenceRefs`, `limits`, and `steps`.
Each step has `action` and `evidenceRefs`. Include the entry's owner among the
path's components. These are source inspections, not runtime traces.

Questions have `id`, `subjectRefs`, `text`, and `evidenceRefs`. Gaps have `id`,
`kind`, `subjectRefs`, `reason`, and `evidenceRefs`. Both lists must be identical
to the lists in the current entry analysis. Keep unsupported languages, missing
inputs, deferred areas and unknown ownership visible.
The lists also retain history and linked clarification notes. Their lengths
are record counts, not counts of unresolved questions or defects.

Stage 4 selects its own graph-results artifact. Stage 5 reuses that graph and
selects its new mapping, resource observations and entry analysis. Source ownership
changes must be reflected in paths, behavior entries and resource actors.

## Check, publish and verify

Apply the [review before publication](start-here.md#review-before-publication)
guidance to the complete proposed packet before `finish`. Check the meaning of
the source claims and current prose as well as the record structure. Include
mapping/resource limits, the overview, selected manifest summaries and all
current counts. Helper checks cannot detect an obsolete explanatory sentence.
Keep full prompts and responses when correcting a packet before publication.

Set `CHOOM_REVIEW` to the canonical absolute review-folder path. Keep the current
stage's environment from its cookbook. For stage 4:

```sh
node "$CHOOM_TOOLS/docs/design/app-a/stage-4-5-publish.mjs" check 4 "$CHOOM_REVIEW"
node "$CHOOM_TOOLS/docs/design/app-a/stage-4-5-publish.mjs" finish 4 "$CHOOM_REVIEW"
node "$CHOOM_TOOLS/docs/design/app-a/stage-4-5-publish.mjs" verify 4
```

For stage 5, replace each `4` with `5`. Run commands one at a time and stop on
failure. `check` is read-only. Correct the separate candidate packet and repeat
`check` until it passes; do not change saved evidence to force a pass.

`finish` checks collected receipts, source digests, the review packet, references,
source ranges, ownership and graph traversals. It copies the packet into the
attempt, registers attempt files by digest, replaces the working baseline and
discovery, and writes the run manifest last. It marks `componentRecovery` or
`remainingCode` complete. It does not accept intent or verify semantic quality.
`verify` checks the completed publication without writing files.

Only one publisher may operate on a run at a time. Keep failed attempts and
receipts. If `finish` fails after saving files, inspect the reported state and use
a fresh attempt after correcting the cause; it is not a resumable transaction.
Do not rerun a successful `finish` or change its evidence. A leftover publication
lock or temporary file needs inspection before proceeding.
After publication, use [correction guidance](start-here.md#record-a-correction)
for a minor explanatory error. Do not change selected records, reopen completed
Stage 5, or generate an in-place finalizer. Stage 5 can still refine the Stage 4
proposal through its normal publication. A material ownership, interface, root
or policy correction needs a new run when the next unpublished stage cannot
handle it. If that run uses a saved snapshot as its source, preserve the original
capture exclusions and limits in the new scope record.
