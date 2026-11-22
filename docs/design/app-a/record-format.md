# Stage 4 and 5 review records

Read this with the [stage 4 cookbook](step-4-cookbook.md) or
[stage 5 cookbook](step-5-cookbook.md). It defines the data that the LLM supplies
to the shared publisher. The publisher is a trusted tool. Review folders contain
data only; do not generate or execute a run-specific save script. The last five
sections define the [settings record](#settings-record) that Stage 1 saves and
Stage 4 reads, the [Git identity record](#git-identity-record) that the Stage 1
capture saves, the [producer code record](#producer-code-record) that every
stage checks, the [decision record](#decision-record) of human decisions
after Stage 6, and the [next baseline version](#next-baseline-version) that a
decision record makes.

## Review folder

The LLM prepares these **nine files**, in a new folder outside `CHOOM_WORK`.
The operator saves them if the LLM cannot write there. Do not ask the operator
to classify source files or fill analysis records. Return complete records,
not patches, ellipses, or example IDs. Keep the full prompt and the complete
visible response. Do not save hidden reasoning.

| File | Contents |
| --- | --- |
| `baseline.proposed.yaml` | Complete proposed baseline. |
| `discovery.proposed.yaml` | Complete working discovery; no `baselineRef` yet. |
| `entry-analysis.yaml` | Complete updated entry analysis. |
| `code-mapping.json` | Every inventory file, or in Stage 5 the parts of a file that symbol selectors divide, with one owner or an explicit unknown owner. |
| `resource-access.json` | Source-supported resource observations, and the name of the resource access candidates of Stage 4 `collect`. |
| `llm/analysis-prompt.md` | Full instructions supplied to the LLM. |
| `llm/analysis-response.md` | Complete visible response, including the exact text of all five candidate records above. No thinking or reasoning blocks and no raw provider output. |
| `llm/analysis-call.yaml` | `provider`, `model`, `date`, `settings`, `hiddenReasoning: not-saved`. Use `unknown` for values not exposed; settings can be a mapping or `unknown`. |
| `llm/review-scope.json` | `formatVersion: 1`, `runRef`, `snapshotRef`, `attemptId`, `suppliedArtifactRefs`, `limits`. The last two are nonempty string arrays. |

The folder must contain exactly these files. The visible response can use fenced
blocks for the five records. Their contents must match the individual files.
The publisher refuses a response with hidden reasoning outside the fenced blocks:

- A line that starts with a `<thinking`, `<reasoning` or `<redacted_thinking`
  tag, or with a `<think>` tag.
- A complete block of one of these tags after other text, such as
  `The review follows. <thinking>...</thinking>`. A tag in inline code does not count.
- A raw provider JSON response, a JSON line, or a `data:` line of an event
  stream that holds a `thinking`, `redacted_thinking` or `reasoning` block, or
  a part with `thought: true`.

It also refuses a call record without `hiddenReasoning: not-saved`.
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
with artifact IDs, source-range IDs, reserved IDs, or other current model IDs. A
baseline item ID uses lowercase letters, digits and hyphens.

The baseline ID is reserved. Stage 6 saves the fixed baseline under that ID, so
no model record can use it: no component, interface, resource, rule, question,
gap or other record. Stages 4, 5 and 6 refuse it with the same check, so a Stage 4
or Stage 5 draft that uses it fails before the stage closes. Stage 1 `finish`
refuses it as the ID of a question or gap, because later stages keep each
question and gap unchanged. Each publication
also reserves the IDs of the records that it saves, such as the Stage 4 or 5
`publication.json` receipt, and the Stage 6 discovery result and attempt files.
The refusal names the reserved ID.

An `evidenceRefs` field is a nonempty array of registered artifact IDs, proposed
current-attempt artifact IDs, saved source-range IDs, or exact JSON Pointers into
those records. Use `/` and `~` escaping from JSON Pointer. References must resolve
against the saved records. A filename alone is not an evidence reference.
Every stage resolves a reference in the same way, so a reference that one stage
accepts stays valid in later stages. A JSON Pointer points into a source record,
or into a JSON (`.json`) or YAML (`.yaml`, `.yml`) file. A list index is `0` or a
number without a leading zero, so `length` is not an index. Cite another file,
such as a `.txt` output, only whole: its ID with no pointer or with an empty one (`#`).
`subjectRefs` identifies the files, components, statements or earlier issues
being discussed; it is not a substitute for `evidenceRefs`. Each subject names
one of these:

- a file of the snapshot inventory, such as `src/billing/invoice.ts`;
- a folder that holds at least one inventory file, written as the membership
  selector `<folder>/**`, such as `src/billing/**`. Name the whole snapshot by
  its ID, not as `**`, `.` or `/`;
- the snapshot ID;
- the ID of a question or gap of the discovery;
- the ID of an entry candidate of the selected entry analysis or of an earlier
  entry analysis that it names with `previousEntryAnalysisRef`, so that a note
  can name a candidate that Stage 3 retired;
- a baseline item (component, interface, resource or rule), as the viewer places
  a record: the item ID, or the ID followed by a dot and more, such as
  `billing.purpose`.

Name a symbol, a missing input or another detail in the `text` or `reason`, not
as a subject. The shared record checks of Stages 4 to 6 (`SubjectChecker`) refuse
any other subject. The message names the subject and the question or gap, such
as `The subject old-billing of the question q-1 names nothing.` Then it gives
the forms above. A folder written without `/**` is refused with the selector to
write, such as `The subject src/billing of the gap g-1 names a folder without
/**. Write the folder as src/billing/**.` Later stages keep
each question and gap unchanged, so a draft cannot rename or remove what an
earlier record names: keep the ID of a component that a question or gap names.

Stages 1 to 3 check the subjects of the records that they add, with the same rule
and the same messages. So a subject that names nothing is refused before later
stages keep the record unchanged. These checks do not read an earlier record
again. The baseline is empty until Stage 4, so before Stage 4 a subject can name
no baseline item. At each check a subject can name a file or folder of the
snapshot and the snapshot ID. It can also name these records:

| Check | Questions and gaps | Entry candidates |
| --- | --- | --- |
| Stage 1 `finish` | Those of the review, and the gaps that `finish` adds from the tool records. | None. Stage 2 adds the first candidates. |
| Stage 2 `plan`, and `start` with a plan | Those of the plan. | Those of the plan. |
| Stage 2 `finish` | Those of the entry analysis. | Those of the entry analysis. A candidate of the plan does not count, because Stages 4 to 6 accept only the candidates of the selected entry analyses. |
| Stage 3 finalizer | Those of the entry analysis. | Those of the entry analysis and of the previous entry analysis. So a note can name a candidate that Stage 3 retires. |

The Stage 3 finalizer also checks the subjects of each inspection priority with
this rule. An example message is `The subject nothing-here of the inspection
priority s3-001-priority-001 names nothing.` A priority with a clue must also
name its source file or the candidate of that file, as the clue check requires.

A gap that Stage 1 `finish` copied from a tool record keeps the subjects of the
tool, which can name a missing input or a path outside the snapshot. The checks
know such a gap by its form: its ID is `s1-<tool>-gap-NNN`, and its only
evidence reference is the place of that gap in the tool record,
`<artifact ID>#/gaps/N` with N one less than NNN, such as `s1-settings-gap-001`
with `settings-001#/gaps/0`. The tool records are the settings record and the
Git identity record. A [required gap of a Stage 3 exports record](#stage-3-required-gaps)
keeps the subjects of its record in the same way, also a compiler input that the
snapshot does not hold. Its ID is `<attempt>-exports-NNN-gap-MMM` of a Stage 3
attempt, and its only evidence reference is `<attempt>-file@exports-NNN.json#/gaps/M`
with M one less than MMM, such as `s3-001-exports-001-gap-001` with
`s3-001-file@exports-001.json#/gaps/0`.

A [required gap of a Stage 4 candidate record](#required-gaps-of-the-candidate-records)
keeps the subjects of the gap that the record lists in the same way. The checks
know it by its form too. Its ID is `<attempt>-behavior-entry-gap-NNN` or
`<attempt>-resource-access-gap-NNN`, with a Stage 4 attempt ID. Its only evidence
reference is that gap of the record,
`<attempt>-file@behavior-entry-candidates.json#/gaps/N` or
`<attempt>-file@resource-access-candidates.json#/gaps/N`, with N one less than
NNN.

A Stage 4 references record (`references-NNN.json`, see the
[stage 4 cookbook](step-4-cookbook.md#find-the-references-to-a-symbol)) is query
evidence. Cite the record, or one entry with a JSON Pointer, such as
`s4-001-file@references-001.json#/references/0`. An entry supports scope and shows
where to read; it is not a reviewed source range and does not prove a call. A
`completeness` of `complete-within-scope` means that the query found no
unresolved entry, not that the references are complete.

A Stage 5 parts record (`parts-NNN.json`, see
[Dependencies of file parts](#dependencies-of-file-parts)) is query evidence too.
Cite the record, or one part or dependency with a JSON Pointer, such as
`s5-001-file@parts-001.json#/parts/0`, in the evidence of the units of a divided
file. It shows the ranges of the units and where the dependencies are; it is not
a reviewed source range.

The behavior entry candidates of Stage 4 `collect`
(`behavior-entry-candidates.json`, see
[Behavior entry candidates](#behavior-entry-candidates)) are tool evidence too.
Cite the record, or one candidate with a JSON Pointer, such as
`s4-001-file@behavior-entry-candidates.json#/candidates/0`. A candidate shows
where to read. It is not a reviewed source range and does not prove an entry.

The resource access candidates of Stage 4 `collect`
(`resource-access-candidates.json`, see
[Resource access candidates](#resource-access-candidates)) are tool evidence in
the same way. Cite the record, or one candidate, such as
`s4-001-file@resource-access-candidates.json#/candidates/0`. A candidate shows
where to read. It does not prove access, the identity of a resource or its owner.

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

All versions have `formatVersion`, `id`, `parentId`, `components`,
`interfaces`, `resources`, and `rules`. The first version of a baseline has
`parentId: null`; a [next version](#next-baseline-version) names its parent.
Versions 3 through 6 permit `sourceUsage`. Versions 4 through 6 also permit `systemEntryPoints`, and
versions 5 and 6 permit [symbol selectors](#version-5-symbol-selectors). The
top-level fields are strict in every version. Stage 4 and Stage 5 of a new project-keyed run write version 6. Stage 4 maps whole files.
For older runs Stage 4 supports versions 1 through 4 and Stage 5 also supports version 5. Keep the initial baseline
ID. All four collections are arrays; at least one component must have supported
evidence for this publication profile. Other collections can be empty.

The Stage 4/5 publisher and Stage 6 check a proposed baseline in this order:

1. The **producer profile**, which is stricter than the shared rules. The
   producer writes `formatVersion` 1 through 6. Stages 4 to 6 write only the first
   version (`parentId: null`); `baseline next` writes the
   [next version](#next-baseline-version). The baseline has at least one
   component. Each component,
   also a parent that only groups other components, has a non-null `purpose`,
   a non-null `groupingReason` and at least one path in `membership.value.paths`.
   In versions 5 and 6, a component can own only symbols: it needs at least one path
   or symbol.
   A question or gap does not make a null purpose or grouping reason valid.
   Each of these cases has its own message.
2. The **shared baseline rules**: `baselineSchema` in `@choom/baseline-model`,
   which the viewer also uses. See the
   [baseline contract](../../../cookbook/interfaces/baseline.md). A refusal names
   the path, the item and the rule, for example `The baseline is invalid at
   components.0.parent.value (component cli): Component parents must not form a
   cycle.`
3. No two components name the same symbol of a file: a symbol has one direct
   owner. Every statement is `proposed`, and the baseline is within the
   [viewer limits](#reader-limits).
4. The run checks: model IDs, resolved evidence, a question or gap for each
   unknown value, the run snapshot and selected mapping, mapped owners, and saved
   source ranges. The run checks divide each file that a symbol selector names, on
   the saved snapshot, and compare the parts with the [code mapping](#code-mapping).
   They divide only with the ts-morph whose module files the stage start pinned:
   the Stage 4/5 publisher checks the files against the `versions.modules` of the
   Stage 5 start handoff, and Stage 6 against the `parserVersions` of its own
   start. A changed file is refused, such as with `Trusted parser module changed
   since Stage 5 start: @ts-morph/common/dist/typescript.js`.

Stage 1 still creates the empty version 1 seed. Versions 1 and 2 remain strict:
version 1 has no interface `documentation`, and neither permits `sourceUsage`.
For a legacy proposal, use `formatVersion: 4` when recording a system-entry assessment. When it is
absent, use version 3 for source use, version 2 for interface documentation,
or version 1 for the original fields. Version 4 retains version 2 interface
documentation and version 3 source use, with their checks and limits. In Stage 5,
use version 5 when symbol selectors divide a file; it retains the version 4 fields. Stage 6
validates the selected version and saves its exact bytes. Completed runs keep
their saved version.

An intent statement has exactly `value`, `status: proposed`, and `evidenceRefs`.
Unknown intent uses `value: null` and a question or gap whose `subjectRefs`
includes the item ID or a field such as `interface-id.allowedConsumers`.
Publication does not accept intent. After Stage 6, a person can accept or
correct statements in a [decision record](#decision-record), and `baseline next`
makes the [next baseline version](#next-baseline-version) from it.

| Collection | Exact item fields |
| --- | --- |
| `components` | `id`, `name`, `purpose`, `membership`, `groupingReason`; optional `parent`. |
| `interfaces` | `id`, `name`, `owner`, `publicAccess`, `allowedConsumers`, `promises`; versions 2–6 also permit `documentation`. |
| `resources` | `id`, `name`, `identity`, `owner`, `accessRules`. |
| `rules` | `id`, `name`, `subject`, `expected`, `check`. |

`id` and `name` are strings. Other fields use intent statements:

- Component `purpose` and `groupingReason` values are nonempty text. `parent`
  names another component or is null; parent cycles are invalid.
- `membership.value` has `paths` and optional `excludePaths`. Each selector is
  an exact snapshot-relative path or a subtree ending in `/**`. Other glob forms
  are unsupported. A selector cannot contain `#`, so that a symbol reference such
  as `src/a.ts#decode` is not read as a path. Version 5 names symbols in a
  separate field; see [Version 5 symbol selectors](#version-5-symbol-selectors). Select a file whose name contains
  `#` through a subtree of its folder. Selectors must assign at most one direct
  owner. Exclude a child's files from its parent; containment does not duplicate
  ownership.
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

Compare the proposed entries with the package or module's reviewed public
declarations. Follow re-exports to the definitions. Include supported members
and exposed error, input or result types, or explain limits on that scope.

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
`input` text, and an optional `result` object. A result has exactly nonempty `text`,
nonempty `summary`, and `scope: complete` or `scope: excerpt`. Compare the displayed
result with the cited assertion, returned value or contract for that input.
Use `complete` only when the evidence establishes the whole output and the display includes
every field and row. Use `excerpt` for a supported portion. Omit `result` if
the evidence supports only the call or input. Source review describes what
the saved lines show and makes no claim that the example ran.

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

Versions 3 and 4 can add one top-level `sourceUsage` object. It records reviewed source
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
Check the inspected caller ranges against the assessment for omitted calls,
other value references and type uses. In executable TypeScript,
`level === Level.Debug` and `class FileSink extends Sink {}` use values.
An annotation that names an exported type is a type use. Check for these
sites in the provider's own source as well as other components.

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
the baseline. Stage 6 also reads the file of the fixed discovery result with it.
It permits one UTF-8 YAML document with JSON-compatible values.
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
does not change. The shared baseline rules in `@choom/baseline-model` enforce the
documentation, source-use and system-entry limits, as the viewer does. The
publisher and Stage 6 also apply the YAML profile and the display limits above,
so a published baseline passes the viewer's decoder and display limits. Reader
success does not replace source review or the publisher's provenance checks.

## Version 4 system entry points

The optional `systemEntryPoints` object has exactly `snapshotRef`,
`mappingRef`, `scope`, `evidenceRefs`, `limitations`, and `entries`.
Use the selected run snapshot and `discovery.codeMappingRef`. If `sourceUsage`
is present, both assessments use those same refs. Describe what was reviewed
in `scope`. Record coverage limits in `limitations`, which can be empty.
An absent assessment means the producer did not record a review. An empty
`entries` list means the review found no supported entries in its stated scope.

Each entry has a local `id` unique in the assessment, `kind` of `startup` or
`external`, `label`, snapshot-relative file `path`, directly mapped
`componentId`, and `evidenceRefs`. Save one startup per distinct start path
and one external entry per callable operation. Use descriptive labels such as
`CLI choom serve`, `HTTP POST /orders`, or `MCP tool search`. Earlier file
candidates and behavior entries can supply evidence. Review launch settings,
registration, or host binding. Keep unresolved candidates in discovery.
These entries record the saved review and carry no intent status.

Evidence lists for both scope and entries must be nonempty and distinct.
Each reference must resolve in the saved registry. Add optional
`source: { evidenceRef, location }` when a single reviewed range identifies
the boundary. The direct source record reference has no fragment and must
occur in the entry evidence. Its location uses the same snapshot, exact entry
path, SHA-256, and inclusive line pair as the saved source range. Evidence of
registration can refer to another file.

Optional `interfaceId` names a modeled interface. Optional `entryId` requires
`interfaceId` and names one of that interface's documentation entries. The
interface owner can differ from the start or handler owner.

Limit the assessment to 2,000 entries and 2 MiB of compact JSON. IDs, evidence
references, and source paths have a 4 KiB UTF-8 limit. Scope, labels, and
limitations have an 8 KiB UTF-8 limit. Use nonblank text and safe relative
paths. The architecture record and link budgets count their existing
collections separately.

## Version 5 symbol selectors

The shared reader in `@choom/baseline-model` also accepts `formatVersion: 5`.
Version 5 is version 4 plus an optional `symbols` list in a component's
`membership.value`: `symbols: [{ path, symbol }]`. Each `path` is one exact
snapshot-relative file path under the selector rules above; a `/**` subtree
and `#` are refused. Each `symbol` is a JavaScript identifier name, such as
`computePrice`, or `default` for a default export. A component cannot repeat a
`{ path, symbol }` pair. In version 5, `paths` can be empty when `symbols` is
not, but a membership needs at least one path or symbol. Version 5 keeps the
version 2 to 4 fields, checks, and limits, and the version 3 and 4 arrow rules.
The reader checks the syntax only. See the
[baseline contract](../../../cookbook/interfaces/baseline.md) for the full rules.

Older runs can publish version 5 from Stage 5 on, and `baseline next` preserves
the version. New project-keyed runs publish version 6. Stage 4 maps whole files.
Stage 5 can divide those files into parts in either format. The producer checks
the selectors against the saved snapshot.

- A version 5 component can own only symbols: `paths` can be empty when
  `symbols` is not.
- A symbol has one direct owner: two components cannot name the same
  `{ path, symbol }`. As for paths, a parent does not repeat its child's symbols.
- Each selector divides its file. The record checks find the parts in the syntax
  tree of the saved file and compare them with the units of the
  [code mapping](#code-mapping). A selector whose file does not declare the
  symbol at the top level matches nothing and is refused, and the message names
  the selector. A reserved word is not refused for its spelling: `default` names
  an anonymous default export.

## Stage 1 role evidence and project key

Each file-purpose record in `review-001#/roles` keeps its selector and purpose
roles. Its `useReview` contains the supported site roles, each with evidence, and
an assessment of the unit. An exclusive non-production classification requires a
declaration or complete review. A partial review lists its limits. A known test
site can coexist with unknown unit scope. The [intake contract](../../../cookbook/interfaces/producer-boundary-intake.tsp)
defines these fields and the candidate and priority fields below.

Stage 1 saves `projectKey` and `referenceBaseline` in `evidence/stage1-inputs.json`
and the published run manifest. An optional reference is the exact bytes of a validated
v6 file at `evidence/reference-baseline.yaml`, registered as `reference-baseline-001`.
Its SHA-256 is computed before decoding. The key comes from that file, an explicit
`CHOOM_PROJECT_KEY`, or a newly generated UUID. An explicit key must be nonblank and fit
in 4096 UTF-8 bytes. Stage 1 keeps its exact text and rejects conflicting keys before
creating the run folder.

## Version 6 boundary review

Stage 1 still seeds an empty version 1 baseline. New Stage 4 and 5 proposals carry
`formatVersion: 6` and the [boundary review](../../../cookbook/interfaces/baseline-boundaries.tsp).
Use the frozen project key, selected inventory's original SHA-256, captured source identity,
analysis roots and selected code mapping. Stage 4 uses whole files. Stage 5 binds both ends
of each site against the final file, symbol or remainder. Retain unknown ownership explicitly.

Cite a reviewed source range with its snapshot-relative path, line range and file digest.
Use the actual written import and the resolved member. Retain an observed nonpublic helper
even when permission is unknown. Link a source-use record by its interface and use ID. Record
each observation once. Combine source and emitted observations only when evidence identifies
those exact original and generated sites. For a bound call, cite the two caller locations
and the reviewed v3 source map linked by the emitted file. Its exact generated position
must map to the original call position and both calls must resolve to the same member.

An operation member can also be the registered name of a package binary or the
literal name of a Node test. Keep the readable operation name separately.
The selected behavior entry identifies its source, owner, file entry and role.
Cite the package declaration and handler for a bin, and the bound registration
and callback for a test. Link any startup and external entries for the same command.

For a reachability check, retain one ordered chain of edges from the saved graph in one
resolution context. Include intermediate files that share an owner. Record the actual target
for each result. Identify the effective rule, authority, supported access kinds, examined
roots and units, and limits. Follow every relevant start and edge before recording absence.
A stopped unresolved edge, omitted applicable root or unsupported kind leaves a gap.
For a private member or a forbidden import path, check the mapped caller against its
saved source and resolution context before claiming absence. For a complete caller
search, account for every bound access in every examined context and declared kind,
including type references. Unresolved calls or loading sites keep the result partial.
An unsupported compiler setting, resolution condition or traversal filter requires an
unknown result.
Add `coverage.inventoryRoots` only when the complete checked inventory accounts for
every captured JavaScript or TypeScript file and its mapped units under those roots.
Each unit needs an owner and must appear among the units examined by that search. Use a
repository declaration in effect or an accepted policy bound to the frozen reference and its
digest. Keep an inferred restriction proposed.

Stage 6 requires a readiness check whose ID is `boundary-review`. Cite the selected Stage 5
proposal's `#/boundaryReview`, the selected code mapping, and the proposal's
`#/boundaryReview/limitations` when it records limits. When an operation is
supported, describe it. For an observed caller, cite the binding to that
operation, access kind, direct owner and use role. A declared port may have no
observed production caller. Give the status and scope of its caller search.
A complete search can support zero outside callers in that role and scope.
Include a test or tooling use when available. Preserve an unknown role with
its reason. Correct an incorrect citation in the external readiness packet.
A change to an observation or owner requires a new proposal. The fixed
baseline contains the exact selected proposal bytes.

## Entry analysis

A candidate's `knipClaims` links each conclusion to its exact mode receipt.
`reported` requires a completed mode and a report naming that candidate.
A skipped or failed mode can support `unknown`. Keep launch evidence in the
candidate's original evidence references. A Stage 3 inspection priority can cite
a registration's operation and role or an unresolved loader's missing binding.
Its `sourceRef` selects an inspected range and a loader also selects the exact
`loading-search.json#/matches/N`. Stage 4 receives this clue in the selected analysis.

Use these fields:

| Field | Required value |
| --- | --- |
| `formatVersion`, `kind`, `snapshotRef` | `1`, `entry-analysis`, current snapshot ID. |
| `previousEntryAnalysisRef` | The selected entry analysis in `discovery.before.yaml`. |
| `planRef`, `knipRunsRef` | Preserve the prior selected references. |
| `candidates` | Preserve prior items unchanged and in order. Append supported candidates under the restrictions below. |
| `inspectionPriorities` | Preserve the prior list exactly. |
| `reviewedFiles` | New source ranges actually read in this stage. Earlier ranges stay in the predecessor chain. |
| `questions`, `gaps` | Preserve earlier records and append new evidence-supported records. Stage 4 also copies each [required gap of the candidate records](#required-gaps-of-the-candidate-records) into `gaps`. |
| `llmReview` | `recorded`. |
| `knipAssessment` | `{action: reuse, reason, evidenceRefs}`; explain why the saved analysis remains applicable. |
| `reachability` | The context-specific graph selection described below. |
| `behaviorEntries` | Source-supported behavior entry records. May be empty when none were established. A behavior entry candidate is not a behavior entry; a behavior entry can cite one. |
| `behaviorEntryCandidatesRef` | Stage 4: the candidates that its `collect` saved, such as `s4-001-file@behavior-entry-candidates.json`. Stage 5: the value of the selected Stage 4 entry analysis. See [Behavior entry candidates](#behavior-entry-candidates). |

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
must belong to that component and lie within a cited reviewed range. The entry
cites the reviewed range itself. One of its `evidenceRefs` is the ID of a
`reviewedFiles` item of the selected entry analysis, or of an earlier one that
it names. The lines of that item include the lines of the source. A JSON Pointer
to a field of the range does not count. A reviewed range takes the ID of the
excerpt that the review read. Thus an excerpt that no `reviewedFiles` item names
is not a reviewed range, also when the excerpt has the same path and lines. The
shared record checks of Stages 4 to 6 refuse such an entry, such as with
`Behavior entry s4-001-orders-route does not cite a reviewed range that contains
its site. An excerpt that no review read is not a reviewed range.`

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

## Behavior entry candidates

Stage 4 `collect` saves `behavior-entry-candidates.json`: the candidates that the
pinned Choom behavior entry rules found in the source files of the graph scope
and in the `package.json` files of the snapshot, and the files that the default
patterns of the Knip plugins in the Stage 2 profile select.
The [stage 4 cookbook](step-4-cookbook.md#find-the-behavior-entry-candidates)
gives the rules, the fields and the limits. The Stage 4 entry analysis names the
record as `behaviorEntryCandidatesRef`, and the Stage 5 entry analysis keeps that
value. The Stage 4/5 publisher refuses any other value.

`behaviorEntries` and the candidates are different records. A candidate is tool
evidence that a syntax rule found (`found: syntax-rule`), or a file that a Knip
plugin pattern selects (`found: knip-plugin-pattern`). A behavior entry is a
reviewed record with a component owner and a reviewed source range. A behavior
entry can cite a candidate in its `evidenceRefs`.

The Knip plugin patterns come from the Stage 2 `preflight.json` that the Knip
receipts of the entry analysis name (`knipRunsRef`, then `preflightRef`). Stage 2
keeps every Knip plugin turned off and records the patterns that it copies in place
of the plugins (see the
[Stage 2 cookbook](step-2-cookbook.md#knip-plugin-patterns)):

| Field of `preflight.json` | Meaning |
| --- | --- |
| `pluginEntryPatterns` | Each copied pattern, as `knip-profile.json` holds it in the entry patterns of its workspace: `workspace`, `manifest` (the `package.json` whose dependency turned the plugin on: the workspace manifest or the manifest of a workspace that holds it), `plugin` (the Knip plugin name), `dependency`, `field` (`entry`, or `production` with a final `!` on the pattern) and `pattern`. |
| `pluginPatternsNotCopied` | Each static pattern of a found plugin that the profile does not copy, with the same fields and the pattern of Knip, and `reason`: it looks like a settings file by its name (a test of names with known misses, which the Stage 2 cookbook lists), or it is a negation. |
| `pluginsNotCopied` | Each found plugin that adds no pattern: `workspace` (or `null` for a manifest that is not a workspace of the plan), `manifest`, `plugin`, `dependency` and `reason`. A plugin that Knip 6.44.1 turns on without a dependency of its enablers (always, by files or manifest fields, or only in its code) has one item, with `workspace`, `manifest` and `dependency` set to `null`. |

When the selected entry analysis names the candidates, the shared record checks
of Stages 4, 5 and 6 check them against the saved snapshot:

- The name is a registered `behavior-entry-candidates.json` artifact of the
  current snapshot with `formatVersion: 1`. `status` is `partial` when
  `omittedCandidates` is more than 0, and `completed` otherwise.
- `rulesRef` is a registered artifact whose SHA-256 is `rulesSha256`. Each
  syntax-rule candidate and each settings gap names a rule of that list by
  `ruleId`, `ruleVersion` and `entryKind`.
- Each syntax-rule candidate has exactly the fields of the record,
  `found: syntax-rule`, `role: test` with a `roleRef` or `role: unknown` with
  `roleRef: null`, a `nameReason` only when `name` is null, and a
  `handlerReason` only when `handler` is null. Collect gives `role: test` only
  when a role record of the Stage 1 review (`review-001`) whose roles include
  `tests` has a selector that is the exact path of the file or a folder that
  holds it; a glob selector or another role name gives no test role.
- `path` and `sha256` name an indexed file of the inventory. `range` lies in the
  saved text of that file, and the text at the range is `expression`, or starts
  with it when `truncated` is true. Lines end at CRLF, CR, LF, U+2028 and
  U+2029, as TypeScript counts them, and a byte order mark is not counted.
- A `handler` names an indexed file, and its `range` lies in the saved text of
  that file. It has exactly `path` and `range`. The handler of a candidate of a
  `package-bin` rule also has `evidence`, which names how the record links the
  file: `kind: snapshot-file` and `binFile`, the path of the handler, or
  `kind: compiler-output` with `binFile`, `compilerSettingsRef`, `outDir` and
  `rootDir`.
- A gap is an `unknown-settings-value` gap, which the checks locate as they
  locate a candidate, or a `missing-compiler-input` gap.
- A candidate with `found: knip-plugin-pattern` has exactly `found`, `role`,
  `roleRef`, `path`, `sha256`, `workspace`, `manifest`, `plugin`, `dependency`,
  `field`, `pattern` and `patternRef`, with the role rule of the other candidates.
  `patternRef` is the preflight record that the Knip receipts of the entry
  analysis name, followed by `#/pluginEntryPatterns/` and an index of that list. The
  pattern there has the same `workspace`, `manifest`, `plugin`, `dependency`,
  `field` and `pattern`. `path` and `sha256` name an indexed file of the inventory.

These checks show that the candidates match the saved files. They do not show
that a candidate is a real entry or that the list is complete. The checks do not
match a Knip plugin pattern against its path again, as they do not run the rules
again.

### Required gaps of the candidate records

Each gap that a candidate record lists, and a record with `status: partial`, need
a gap that cites them. After it saves `behavior-entry-candidates.json` and
`resource-access-candidates.json`, Stage 4 `collect` saves these gaps in
`required-gaps.json`. The record has the form of the
[contract](../../../cookbook/interfaces/producer-run-records.tsp), as the
[required gaps](#required-gaps) of the Knip outcomes do. The collect receipt
records the file, and `finish` registers it as `<attempt>-file@required-gaps.json`.

```json
{
  "formatVersion": 1,
  "gaps": [
    { "id": "s4-001-behavior-entry-gap-001", "kind": "unknown-settings-value", "subjectRefs": ["web/vite.config.ts"],
      "reason": "The behavior entry rule vite-build-rollup-options-input (version 1) cannot read the value at line 9, column 16 of web/vite.config.ts. The value at the property path is not a string literal, so it is known only at run time.",
      "evidenceRefs": ["s4-001-file@behavior-entry-candidates.json#/gaps/0"] },
    { "id": "s4-001-resource-access-gap-001", "kind": "tool-outcome", "subjectRefs": ["snapshot-001"],
      "reason": "The resource access candidates are partial: the record keeps the first 10000 candidates and leaves out 12.",
      "evidenceRefs": ["s4-001-file@resource-access-candidates.json#/status"] }
  ]
}
```

| Field of a gap | Value |
| --- | --- |
| `id` | `<attempt>-behavior-entry-gap-` for the behavior entry candidates, or `<attempt>-resource-access-gap-` for the resource access candidates. After it comes the position of the gap among the required gaps of its record, from 1 in three digits. The gaps of a record are in the order of its `gaps`, and the gap of a partial record is last. The gaps of the behavior entry candidates come first. |
| `kind` | The `kind` of the gap in the record, or `tool-outcome` for a partial record. |
| `subjectRefs` | The file (`path`) of an `unknown-settings-value` gap; the `subjectRefs` of a `missing-compiler-input` gap, which can name a file that the snapshot does not hold; or the snapshot ID for a partial record. |
| `reason` | For an `unknown-settings-value` gap, the rule, the line and the column of the value, and then the `reason` of the gap. For a `missing-compiler-input` gap, its `reason`. For a partial record, the number of the candidates that the record keeps and of those that it leaves out. |
| `evidenceRefs` | The gap in its record, `<record artifact ID>#/gaps/N`, or the status of a partial record, `<record artifact ID>#/status`. |

Both records read the scope with the same snapshot projects. So a compiler input
that the snapshot does not hold is usually a gap of both records. Each record then
gives its own required gap. The record has no gap when neither candidate record
lists a gap and both are `completed`.

The review prompt of `collect` lists the required gaps. The Stage 4 entry analysis
copies each required gap into its `gaps` exactly, in any place of the list. The
discovery has the same gaps. Stage 5 keeps them, as it keeps every earlier question
and gap. `check`, `finish` and `verify` of the Stage 4/5 publisher give the
required gaps again. They read the candidate records of the Stage 4 attempt that
the entry analysis names (`behaviorEntryCandidatesRef`). In Stage 5, that is still
the Stage 4 attempt. They refuse:

- a `required-gaps.json` that differs from those gaps;
- an entry analysis that leaves out or changes a required gap, such as with
  `The entry analysis leaves out the required gap s4-001-behavior-entry-gap-001.
  Copy each gap of s4-001-file@required-gaps.json exactly.`;
- a question or another gap whose ID starts with `<attempt>-behavior-entry-gap-`
  or `<attempt>-resource-access-gap-`, where `<attempt>` is the Stage 4 attempt.

## Code mapping

Use `formatVersion: 1`, `kind: code-mapping`, `snapshotRef`, `scope`, `units`,
and a nonempty `limits` string array. The scope has:

```text
inventoryRef: current inventory artifact ID
basis: all-inventoried-regular-files
unitKind: file, or file-or-part in Stage 5 when symbol selectors divide a file
inspectionMeaning: explanation of reviewed vs unreviewed
selectedEntryAnalysisRef: current attempt entry-analysis ID
historicalEntryAnalysisRefs: predecessor IDs, newest first, following the whole chain
```

A code unit is a file or a recorded part of a file. Start with files. Divide a
file only when a boundary inside it needs examination. With `unitKind: file`,
every inventory file appears exactly once in `units`. Each unit has `id`,
`path`, `sha256`, nonempty `roles`, `owner`, `membershipRef`, `inspection`,
`reason`, and nonempty `evidenceRefs`. Stage 4 always uses `unitKind: file`.

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

### Divided files

With `unitKind: file-or-part`, each unit also has `unitKind`: `file`, `symbol`
or `rest`. The [symbol selectors](#version-5-symbol-selectors) of a version 5
baseline divide each file that they name; every other inventory file is one
`file` unit with the fields above. A divided file has no file unit. It has:

- one `symbol` unit for each symbol that a selector names in the file, owned by
  the component of the selector;
- one `rest` unit for all other text of the file, when there is other text. Its
  owner is the component whose path selectors select the file, by the rules of a
  file unit. When no path selector selects the file, the rest has
  `owner: null`, `membershipRef: null` and `reason: no-path-owner`.

A symbol unit has exactly `id`, `unitKind`, `path`, `sha256`, `symbol`,
`ranges`, `roles`, `owner`, `membershipRef`, `inspection`, `reason` and
`evidenceRefs`. A rest unit has the same fields without `symbol`. `path` and
`sha256` name the inventory file, as for a file unit. `ranges` is a nonempty
list of `[start, end]` ranges of `{ line, column }` positions, 1-based, from the
first character to the position after the last character. A rest often has
several ranges, because a symbol can be in the middle of the file.

The two units of `src/billing.ts`, a file of 10 lines, when the selector of
`pricing` names `computePrice` on lines 7 to 10 and `billing` owns the file by its
paths:

```json
[
  { "id": "s5-001-unit-billing-price", "unitKind": "symbol", "path": "src/billing.ts",
    "sha256": "<inventory digest>", "symbol": "computePrice",
    "ranges": [[{ "line": 7, "column": 1 }, { "line": 10, "column": 2 }]],
    "roles": ["source"], "owner": "pricing",
    "membershipRef": "s5-001-file@baseline.proposed.yaml#/components/3/membership",
    "inspection": "reviewed", "reason": "Pricing names computePrice.", "evidenceRefs": ["s5-001-source-excerpt-002"] },
  { "id": "s5-001-unit-billing-rest", "unitKind": "rest", "path": "src/billing.ts",
    "sha256": "<inventory digest>",
    "ranges": [[{ "line": 1, "column": 1 }, { "line": 7, "column": 1 }], [{ "line": 10, "column": 2 }, { "line": 11, "column": 1 }]],
    "roles": ["source"], "owner": "billing",
    "membershipRef": "s5-001-file@baseline.proposed.yaml#/components/2/membership",
    "inspection": "reviewed", "reason": "The paths of billing select the file.", "evidenceRefs": ["s5-001-source-excerpt-002"] }
]
```

The producer finds the parts in the syntax tree of the saved file and runs no
code:

- A symbol is the name of a top-level declaration of the file: a function,
  class, interface, type, enum or namespace, or a variable statement that
  declares one name. An anonymous default export (`export default function ()
  {}`, `export default class {}` or `export default` with a value) is the symbol
  `default`; a named default export is the symbol of its name. Imports,
  re-exports and other statements are not symbols. They stay in the rest, with
  the module setup, comments and white space.
- A symbol unit holds each declaration of the name, with the comments directly
  above it, with no blank line between, and the comments after it on its last
  line. Declarations of the name that follow each other, such as the overloads
  of a function, share one range. Separate declarations of one name, such as two
  parts of a merged interface, give several ranges.
- The ranges of the units of a file cover its text with no gap and no overlap.
  Lines end at CRLF, CR, LF, U+2028 and U+2029, as TypeScript counts them, and a
  byte order mark is not counted.

The record checks of Stages 5 and 6 divide each such file and refuse units that
differ from these parts. The refusal gives the units that the file must
have, with their owners and ranges; copy them into the mapping. The checks also
refuse a selector of a name that the file does not declare at the top level, a
declaration with several names, such as `export const a = 1, b = 2`, and a file
with syntax errors, a file that is not JavaScript or TypeScript, is not UTF-8
text or is larger than 2 MiB. They refuse a file unit of a divided file, and
symbol or rest units of a file that no selector divides.

The `inspection` of a part follows its file, as for a file unit. The checks of
the source sites stay at file level: a behavior entry, a resource observation, a
source use or a system entry in a divided file can name the owner of any unit of
that file. The component check of an inspected path uses the parts: a reviewed
range covers a part when one of the ranges of the part has text on one of its
lines (see [Discovery](#discovery)). The graph edges and the evidence of Stage 5
`collect` name whole files. The Stage 5 parts request records the
[dependencies of file parts](#dependencies-of-file-parts).

### Dependencies of file parts

After Stage 5 `collect`, `stage-5 parts PATH SYMBOL [SYMBOL ...]` divides one
indexed file by the named symbols, as the symbol selectors do, and saves the
numbered record `parts-NNN.json` (see the
[stage 5 cookbook](step-5-cookbook.md#find-the-parts-of-a-file-and-their-dependencies)).
It lists the dependencies of the file at both levels: each dependency that
belongs to a part, under that part, and each other dependency at file level, with
its reason. The record starts with `formatVersion: 1`, `attemptId`, `runRef` and
`snapshotRef`, and has these fields:

| Field | Value |
| --- | --- |
| `path`, `sha256`, `symbols` | The file, its inventory digest, and the symbols of the request, each once, in request order. |
| `sourceSitesRef` | The Stage 4 `source-sites.json` that the dependencies name. |
| `tool` | `name`, and the `tsMorph` and `typescript` versions that Stage 5 start pinned. |
| `parts` | One part for each symbol, in file order, and then a rest part when the file has other text. A part has `unitKind` (`symbol` or `rest`), `symbol` for a symbol part, `ranges` and `dependencies`. |
| `fileDependencies` | The dependencies that stay at file level, in source order, each with its `reason`, and `usedIn` for a shared one. |
| `notes` | What the record covers and what it does not. |

A part names one code unit of the divided file: the symbol unit of its symbol,
or the rest unit. Its `ranges` are the ranges that the code mapping must give
that unit. A dependency is a loading site of the file, as Stage 4 `collect` lists
them in `source-sites.json`: an import, a re-export, an import `=`, an import
type, a dynamic import, and a `require` or `require.resolve` call. A resource call
is not a dependency. A dependency has `siteRef` (the saved site, or `null` when
no saved site matches), `kind`, `specifier`, `typeOnly`, `dynamic`, `range`,
`expression` (clipped after 4096 code units), `truncated` and `localNames`.

Each dependency is in one part or at file level. It is never left out, and never
in two places:

- A site that binds local names belongs to the part that holds all the uses of
  those names. Such a site is an import, an import `=` with a module, or a
  JavaScript `require` that the compiler reads as an import. A type-only import
  follows the same rule.
- A site with uses in several parts stays at file level with the reason `shared`,
  and `usedIn` lists those parts. A site with no use has the reason `unreferenced`.
- An import that binds no name, such as `import './setup'`, loads its module for
  its effects, and a site with a computed module name, such as `import(name)` or
  `require(name)`, can load any module. Both stay at file level with the reason
  `not-resolved`, also when a symbol holds the site.
- Any other site belongs to the part that holds it: a re-export, which is always
  in the rest, and a dynamic import, `require`, `require.resolve` or import type
  with a literal module name.

The TypeScript type checker of a project that holds only the saved file finds the
uses. A use is a name that refers to the local symbol that the site binds, so
another declaration with the same name is not a use. The project reads no other
file and resolves no import. A use without a name in the file, such as the JSX
factory of JSX syntax or a type in a JSDoc comment, is not found. A use shows that
a part names the dependency, not that the code runs. The record names no owner.

The parts of `src/billing.ts` that `computePrice` divides, from a fixture run
(the fields of the dependencies are shortened):

```json
{
  "path": "src/billing.ts", "symbols": ["computePrice"], "sourceSitesRef": "s4-check-file@source-sites.json",
  "parts": [
    { "unitKind": "symbol", "symbol": "computePrice", "ranges": [[{ "line": 13, "column": 1 }, { "line": 16, "column": 2 }]],
      "dependencies": [{ "siteRef": "s4-check-file@source-sites.json#/sites/0", "kind": "import",
        "specifier": "./money", "expression": "import { round } from './money';", "localNames": ["round"] }] },
    { "unitKind": "rest", "ranges": [[{ "line": 1, "column": 1 }, { "line": 13, "column": 1 }],
      [{ "line": 16, "column": 2 }, { "line": 17, "column": 1 }]],
      "dependencies": [{ "siteRef": "s4-check-file@source-sites.json#/sites/1", "kind": "import",
        "specifier": "./rate", "expression": "import { rate } from './rate';", "localNames": ["rate"] }] }
  ],
  "fileDependencies": [
    { "siteRef": "s4-check-file@source-sites.json#/sites/2", "kind": "import", "specifier": "./setup",
      "expression": "import './setup';", "localNames": [], "reason": "not-resolved" },
    { "siteRef": "s4-check-file@source-sites.json#/sites/3", "kind": "dynamic-import", "specifier": null,
      "expression": "import('./plugins/' + pluginName)", "localNames": [], "reason": "not-resolved" }
  ]
}
```

## Resource observations

Use `formatVersion: 1`, `kind: resource-observations`, `snapshotRef`, `scope`,
`observations`, a nonempty `limits` string array, and `resourceAccessCandidatesRef`.
In Stage 4, `resourceAccessCandidatesRef` names the candidates that its `collect`
saved, such as `s4-001-file@resource-access-candidates.json`; in Stage 5, it keeps
the value of the selected Stage 4 resource observations. The Stage 4/5 publisher
refuses any other value. Scope has
`method: source-inspection`, `reviewedFilesRef` pointing to the current entry
analysis's `#/reviewedFiles`, and `historicalEntryAnalysisRefs` as in the mapping.

Each observation has `id`, `componentRef`, `source: {path, lines: [first, last]}`,
`operation`, `target`, `context`, and nonempty `evidenceRefs`. `target` has
`expression`, `resourceRef` (a modeled resource ID or null), and
`identity: symbolic` or `unknown`. The actor must own the source file. The source
site must lie within a cited reviewed range: the observation cites the reviewed
range itself, as a [behavior entry](#entry-analysis) does. Describe only the
inspected access; do not infer a complete mutation history or exclusive access
policy.
Syntax-query matches identify sites to inspect. Establish the actor, operation
and source context before adding an observation; a registration inside a
deferred function body is not automatically a module-start effect. These
records remain source observations, not runtime verification.

The record keeps observed access separate from inferred identity and ownership:

- The candidates that it names are observed access syntax only: sites,
  operations and names. A candidate with a name has the identity
  `inferred-from-name`, a candidate without a name has the identity `unknown`, and
  no candidate names an owner. Two sites with the same table name need not use the
  same table.
- An observation records an inspected access: the code that accesses
  (`componentRef`, the mapped owner of the source file, not the owner of the
  resource), the `operation`, the `source`, the `context`, and the target. The
  target keeps its observed `expression` apart from its inferred identity:
  `identity` (`symbolic` or `unknown`) and `resourceRef`, a modeled resource or
  `null`.
- Resource ownership is an intent statement (`owner`) in the proposed baseline,
  with its own status and evidence. When a site accesses the resource, follow
  its expression through any arguments or settings that select the target.
  Compare that target with the resource named by the ownership evidence. A plan
  naming the owner of a future store supports only that plan. For a caller-selected
  path with no established link to a modeled resource, retain the expression and
  set `target.resourceRef` to null. If the modeled resource's owner
  is unknown, keep `owner.value: null` and name `<resource-id>.owner` in a
  discovery question or gap.

## Resource access candidates

Stage 4 `collect` saves `resource-access-candidates.json`: the calls that the
pinned Choom resource access rules found in the source files of the graph scope, and
each resource call site of `source-sites.json` that no rule found, with confidence
`name-only`. The [stage 4 cookbook](step-4-cookbook.md#find-the-resource-access-candidates)
gives the rules, the fields and the limits. The Stage 4 resource observations name
the record as `resourceAccessCandidatesRef`, and the Stage 5 resource observations
keep that value.

When the selected resource observations name the candidates, the shared record
checks of Stages 4, 5 and 6 check them against the saved snapshot:

- The name is a registered `resource-access-candidates.json` artifact of the
  current snapshot with `formatVersion: 1`. `status` is `partial` when
  `omittedCandidates` is more than 0, and `completed` otherwise.
- `rulesRef` is a registered artifact whose SHA-256 is `rulesSha256`, and
  `sourceSitesRef` is a registered `source-sites.json` of the current snapshot.
- Each candidate has exactly the fields of the record, so it names no owner. A
  candidate with confidence `receiver-import` or `receiver-type` names a rule of the
  list by `ruleId` and `ruleVersion`, with the `library`, `resourceKind` and
  `operation` of that rule, and a `siteRef` or `null`. A `name-only` candidate has
  `null` in those five fields and a `siteRef`.
- A candidate with a name has `identity: inferred-from-name` and no `nameReason`; a
  candidate with a `null` name has a `nameReason` and `identity: unknown`.
- `path`, `sha256`, `range`, `expression` and `truncated` follow the rules of the
  behavior entry candidates. A `context` of kind `module` has a `null` name and
  range; a `context` of kind `function` or `method` has a range in the saved text of
  the same file.
- A `siteRef` names a `resource-call-candidate` site of the source sites with the same
  path, digest and expression. A `completed` record names each such site in a
  candidate.
- Each gap is a `missing-compiler-input` gap.

These checks show that the candidates match the saved files and the saved source
sites. They do not show that a candidate accesses a resource, which resource it
uses, or that the list is complete.

Each gap of the record, and a `partial` status, gives a required gap with an ID
that starts with `<attempt>-resource-access-gap-`. The review copies it exactly;
see [Required gaps of the candidate records](#required-gaps-of-the-candidate-records).

## Discovery

Top-level fields are exactly `formatVersion: 1`, `kind: architecture-discovery`,
`runRef`, `entryAnalysisRef`, `codeMappingRef`, `dependenciesRef`,
`resourceAccessRef`, `overview`, `inspectedPaths`, `questions`, and `gaps`.
Leave `baselineRef` and `baselineDigest` absent: Stage 6 adds them to the
[fixed discovery result](#fixed-discovery-result).

`overview` has `text` and nonempty `evidenceRefs`. `inspectedPaths` contains source
paths actually reviewed. Each has `id`, `description`, `entryPointRef` naming a
behavior entry, nonempty `componentIds`, `evidenceRefs`, `limits`, and `steps`.
Each step has `action` and `evidenceRefs`. Include the entry's owner among the
path's components. These are source inspections, not runtime traces.
Each step cites at least one reviewed range itself, as a behavior entry does.
One of its `evidenceRefs` is the ID of a `reviewedFiles` item of the selected
entry analysis or of an earlier one that it names. The ID can have an empty
JSON Pointer (`id#`). A JSON Pointer to a field of the range, such as
`id#/lines`, does not count. An excerpt that no `reviewedFiles` item names is
not a reviewed range, also when it has the same path and lines. Each other
saved source range that a step cites must also be a reviewed range. A step can
also cite other records, such as a graph or references record, for its scope.
Each component in `componentIds` owns, in the selected code mapping, a file or a
part that a reviewed range cited by the steps covers. A reviewed range covers a
file unit of its file. It covers a part of a divided file when one of the
ranges of the part has text on one of its lines. A range that only the path
cites, and not a step, does not count. The shared record checks of Stages 4
to 6 refuse a path that breaks these rules, such as with `Inspected path
s4-001-orders-path step 2 does not cite a reviewed range. An excerpt that no
review read is not a reviewed range.` or `Inspected path s4-001-orders-path
names the component cli, but no reviewed range that its steps cite covers code
that cli owns.`

Questions have `id`, `subjectRefs`, `text`, and `evidenceRefs`. Gaps have `id`,
`kind`, `subjectRefs`, `reason`, and `evidenceRefs`. Both lists must be identical
to the lists in the current entry analysis. Keep unsupported languages, missing
inputs, deferred areas and unknown ownership visible.
An analysis that did not run keeps its result record, and a gap cites that
record by its artifact ID, alone or with a JSON Pointer into it: a Knip profile
that the Stage 2 preflight marked `unsupported` needs a gap that cites the
preflight record (`<attempt>-preflight`), and a Knip mode that `failed` or was
`skipped` needs a gap that cites the Knip runs record (`<attempt>-knip-runs`).
For the Knip records, Stage 2 `finish` refuses an analysis that does not copy
each [required gap](#required-gaps) exactly. The Stage 3 finalizer refuses an
analysis that does not copy each [Stage 3 required gap](#stage-3-required-gaps)
exactly: the gap of symbol mentions that are `partial`, `unavailable` or
`skipped`, and the gap of each compiler input that an exports record names and
the snapshot does not hold. The shared record checks of Stages 4 to 6
check the Knip preflight and runs of the selected entry analysis again, such as
with `The normal Knip run in s2-001-knip-runs has the status skipped. Record a gap
that cites s2-001-knip-runs.`
The lists also retain history and linked clarification notes. Their lengths
are record counts, not counts of unresolved questions or defects.
A question or gap has exactly these fields. A linked note that answers or narrows
an earlier record is a new question or gap with the same fields; it names the ID
of the earlier record, such as in its `subjectRefs`.

The questions and gaps keep the limits of the viewer, from the discovery contract
of `@choom/baseline-model` (`validateQuestionsAndGaps`). Each question or gap has
1 to 100 `subjectRefs` and at least one evidence reference. A `text` or `reason`
has at most 16 KiB of UTF-8, and an ID, a `kind` or a reference at most 4 KiB. The
IDs are unique across questions and gaps, there are at most 5,000 questions and
gaps together, and all text values of the discovery have at most 4 MiB together.
For a deferral of many files, name a folder as `<folder>/**`, or a component, in
`subjectRefs`.
Later stages keep each question and gap unchanged, so every stage checks these
rules where a record enters the run: Stage 1 `finish`, Stage 2 `plan` and
`finish`, the Stage 3 finalizer, and the Stage 4/5 publisher with the shared
record checks. A refusal starts with "The questions and gaps do not match the
discovery contract of the viewer." and names the field, such as
`The discovery result exceeds a limit at gaps.0.subjectRefs`. Stage 6 checks the
fixed result again (see [Fixed discovery result](#fixed-discovery-result)).
Each subject also names a snapshot file, a snapshot folder written as
`<folder>/**`, the snapshot ID, a question or gap, an entry candidate or a
baseline item, as [IDs and evidence](#ids-and-evidence) gives. Stage 1 `finish`,
Stage 2 `plan` and `finish` and the Stage 3 finalizer check this after the limits
for the records that they add. The shared record checks of Stages 4 to 6 check it
after the limits for every question and gap. This includes the records that
earlier stages froze.

Stage 4 selects its own graph-results artifact. Stage 5 reuses that graph and
selects its new mapping, resource observations and entry analysis. Source ownership
changes must be reflected in paths, behavior entries and resource actors.

### Fixed discovery result

Stage 6 saves the fixed discovery result as `runs/<run-id>/discovery.yaml`.
It changes `formatVersion` from 1 to 2, keeps the other reviewed fields in
order with their values, and adds two fields at the end.

| Field | Meaning |
| --- | --- |
| `baselineRef` | The ID of the fixed baseline. |
| `baselineDigest` | The SHA-256 of the bytes of the fixed baseline file, `baselines/<baselineRef>/baseline.yaml`, as 64 lowercase hexadecimal characters. It is the `sha256` of the baseline in the `run.yaml` registry. |

IDs such as `baseline-001` repeat across runs, so an ID alone can name the wrong
file. The digest binds the discovery result to the exact baseline file. The
Stage 5 discovery proposal has `formatVersion: 1` and omits both fields. At
publication, Stage 6 replaces the run-root `discovery.yaml` with the exact
bytes of the fixed version 2 result.

Stage 6 `verify` runs the shared record checks on the saved fixed baseline and
discovery result, with the bytes of the saved baseline file. It refuses a fixed
discovery result that is not version 2, that names another baseline ID, or whose
`baselineDigest` is not the SHA-256 of the saved baseline file. A run that an
older producer completed has a fixed discovery result of `formatVersion: 1`, with
`baselineRef` and no digest. The [producer code record](#producer-code-record)
makes such a run use its own producer version, which reads version 1. The viewer
uses `baselineRef` and `baselineDigest` as
[CR-004](../../change-requests/CR-004-discovery-in-viewer.md#binding-to-the-open-baseline)
describes.

Each Stage 6 action also checks that the viewer can open the fixed discovery
result, with the discovery contract of the viewer (`validateDiscoveryResult` in
`@choom/baseline-model/discovery-result`). Each question and gap has exactly its
fields, 1 to 100 subject references and at least one evidence reference. The
IDs are unique across questions and gaps. There are at most 5,000 questions and
gaps together. A text has at most 16 KiB of UTF-8, an ID, a kind or a reference
at most 4 KiB, and all text values of the file together at most 4 MiB. Stage 6
makes this check before it saves any file, and `verify` makes it again on the
saved file. A refusal starts with "The viewer could not open the fixed discovery
result." and names the field, such as
`The discovery result is invalid at questions.0: Unrecognized key: "answer"`.
Stages 1 to 5 check each question and gap with the same rules before they save
it (see [Discovery](#discovery)), so a record does not first fail here after
earlier stages froze it. Do not edit saved files to pass the check.

Stage 6 writes the fixed discovery result as YAML without aliases, also when the
working discovery repeats a value through a YAML alias. Before it saves any file,
it reads the exact bytes back as the viewer reads them, with the bounded YAML
profile of the [reader limits](#reader-limits), and `verify` reads the saved file
with the same profile. A result within the limits above can still give a file
that the profile refuses, such as a file with more than 250,000 lines. Stage 6
refuses it too, for example with "The viewer could not open the fixed discovery
result. Fixed discovery result exceeds the YAML structure limit." Start a new
run with a smaller discovery result.

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
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4-5-publish check 4 "$CHOOM_REVIEW"
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4-5-publish finish 4 "$CHOOM_REVIEW"
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4-5-publish verify 4
```

For stage 5, replace each `4` with `5`. Run commands one at a time and stop on
failure. `check` is read-only. Correct the separate candidate packet and repeat
`check` until it passes; do not change saved evidence to force a pass.

`finish` checks collected receipts, source digests, the review packet, references,
source ranges, ownership and graph traversals. Each numbered request (an excerpt,
in Stage 4 also a references request, and in Stage 5 also a parts request) needs its receipt: a completed request
keeps the digests of its outputs, and a failed request has no output. `finish`
copies the packet into the attempt, registers attempt files by digest, replaces
the working baseline and discovery, and writes the run manifest last. It marks
`componentRecovery` or `remainingCode` complete. It also makes the run summaries
`coverage.inspected` and `coverage.unresolved` current: they name the entry
analysis, code mapping and discovery proposal of the attempt, and the counts of
inspected paths, recorded questions, recorded gaps and files with unknown owners
of the validated records. The question and gap lists keep their history, so
these counts are record counts. `coverage.inventoried` stays as Stage 1 wrote it.
It does not accept intent or verify semantic quality.

`finish` registers every attempt file. So each attempt file must be a file that a
producer action saved:

- a phase receipt or its start record
- an output or a log that a receipt records
- the command log `commands.md`
- a file of the review packet
- the publication receipt `publication.json`

`check`, `finish` and `verify` refuse any other file and name it, for example
`Unexpected attempt file that no producer action saved: notes.md. Do not write
into the attempt; use a fresh attempt.` Keep notes and other files outside the
attempt. Stage 2 `finish` and the Stage 3 finalizer use the same rule. `verify`
checks the completed publication without writing files.

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

## Settings record

Stage 1 `settings` saves the settings record as `evidence/settings.json`, and
Stage 1 `finish` registers the selected record as `settings-001`. Stage 3
`exports` and Stage 4 start read its compiler configurations and its parsing
profile. The record is `formatVersion: 2`.

| Field | Meaning |
| --- | --- |
| `formatVersion`, `snapshotId` | `2` and the snapshot ID of the inventory. |
| `virtualRoot`, `limits` | `/repo`, the snapshot root that the compiler sees, and the byte limit for each configuration file. |
| `packages` | Each `package.json`, with its parsed `data` or its parse `error`. |
| `configs` | Each `tsconfig*.json`, `jsconfig*.json` and extra compiler configuration, and each project that they reference: `path`, `status` (`parsed`, `partial` or `unavailable`) and `diagnostics`, and for a file that parses, `declared`, `compilerOptions`, `fileNames` and `references`. |
| `parsingProfile` | `null` when `configs` has an entry. Otherwise the Choom parsing profile: `id`, `declared.compilerOptions`, `compilerOptions` and `assumptions`. |
| `gaps` | The gaps that the collector found. Each gap has `kind`, `subjectRefs` and `reason`, the fields of a discovery gap without its ID and evidence. Stage 1 `finish` adds each gap to the discovery gaps, as the example below shows. |
| `contentReads`, `contentReadScope` | The snapshot files that the collector read and checked against the inventory, and the limit of that check. |

A snapshot without project settings has no `tsconfig*.json` or `jsconfig*.json`
file, and no extra compiler settings are named. Its record names the profile
`choom-default-v1` and has one `no-project-settings` gap:

```json
{
  "parsingProfile": {
    "id": "choom-default-v1",
    "declared": { "compilerOptions": { "allowJs": true, "jsx": "preserve", "module": "preserve",
      "moduleResolution": "bundler", "target": "es2025" } },
    "compilerOptions": { "allowJs": true, "jsx": 1, "module": 200, "moduleResolution": 100, "target": 12 },
    "assumptions": ["The snapshot has no project settings. Choom chose these options. They are not settings of the project.", "..."]
  },
  "gaps": [
    { "kind": "no-project-settings", "subjectRefs": ["snapshot-001"], "reason": "No project settings were found. ..." }
  ]
}
```

`declared` holds the options as a `tsconfig.json` writes them. `compilerOptions`
holds the same options as the TypeScript API parses them, with the enum values of
the pinned TypeScript 6.0.2, as in a configuration entry. These options are Choom
assumptions, not settings of the project. A configuration that does not parse is
still project settings, so its record names no profile. A changed option or
assumption needs a new profile ID.

Stage 1 `finish` adds each gap of the settings record to the discovery gaps, after
the review gaps. Gap `N` (from 0) gets the ID `s1-settings-gap-` with the number
`N + 1` in three digits, and cites `settings-001#/gaps/N`:

```yaml
gaps:
  - id: s1-settings-gap-001
    kind: no-project-settings
    subjectRefs: [snapshot-001]
    reason: No project settings were found. ...
    evidenceRefs: ["settings-001#/gaps/0"]
```

`finish` refuses a review question or gap with one of these IDs, and Stage 1
`verify` checks that the saved Stage 1 discovery has these gaps.

Stage 4 start puts the source that no parsed compiler selection covers in one
group. When the record names the profile, the group is named after the profile,
uses its target, module, moduleResolution and jsx options, and has
`compilerSettingsRef: settings-001#/parsingProfile`. Otherwise the group is the
configuration-free fallback with no options. Stage 4 start refuses a record that
names an unknown profile. Stage 3 `exports` chooses the settings of one source
file with the same rule: the first parsed compiler selection that selects the
file, else the profile, else no settings. See the
[Stage 3 cookbook](step-3-cookbook.md#list-the-exports-of-a-source-file).
Stage 4 `stage-4-inspect references` uses the same rule for the group of its file.

## Git identity record

Stage 1 `capture` saves `evidence/git-identity.json` after the copy, and Stage 1
`finish` registers it as `git-identity-001`. The record is `formatVersion: 1`.
It names the Git commit, the branch and the local changes of the target folder,
or it says that Git evidence is not available. It does not record the history.

Git runs on the target folder, never on the snapshot. The design forbids
running target code, so Git runs only these commands, which read refs and
objects:

```sh
git version
git rev-parse --is-inside-work-tree --show-prefix
git rev-parse --verify 'HEAD^{commit}'
git symbolic-ref -q HEAD
git ls-tree -r -z --full-name <commit>
```

Each call is `git -C <target> --no-pager -c core.fsmonitor=false
-c core.hooksPath=/dev/null <command>`, so the fsmonitor, hook and pager
settings of the target cannot run a program. The call removes every inherited
`GIT_*` variable and sets these variables:

| Variable | Effect |
| --- | --- |
| `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null` | Git does not read the system and user Git settings. |
| `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0` | Git takes no optional lock and asks no question. |
| `GIT_ALLOW_PROTOCOL=` (empty) and `GIT_NO_LAZY_FETCH=1` | Git uses no transport and fetches no missing object. Without them, a partial clone that misses an object fetches it, and the fetch runs commands of the target settings, such as `remote.<name>.uploadpack`. |
| `GIT_NO_REPLACE_OBJECTS=1` | Git ignores replacement objects, so the listed tree is the tree of the recorded commit. |

The capture does not run `git status`, because it can run the clean and process
filters of the target settings when it compares file contents. Choom compares
the snapshot with the commit itself. The capture saves each Git call as it saves
its rsync calls: `evidence/git/call-001.json` with the command, the arguments,
the exit code, the signal and the error, and `call-001.stdout.txt` and
`call-001.stderr.txt`. The record of a Git call also lists these variables in
`environment`.

A record with Git evidence:

```json
{
  "formatVersion": 1,
  "snapshotRef": "snapshot-001",
  "status": "available",
  "gitVersion": "git version 2.43.0",
  "commit": "9994d1d5a5fdf4f9c444890f9333520c17b85a64",
  "objectFormat": "sha1",
  "branch": "main",
  "targetPrefix": "",
  "localChanges": {
    "changed": ["src/app.ts"],
    "notInCommit": ["notes.md"],
    "notInSnapshot": ["old.ts"],
    "outsideCaptureScope": [".github/workflows/ci.yml"],
    "submodules": []
  },
  "limits": ["Git read the target folder after the copy. If the target folder changed during the capture, this record can differ from the snapshot.", "..."],
  "gaps": []
}
```

| Field | Meaning |
| --- | --- |
| `formatVersion`, `snapshotRef` | `1` and the snapshot ID of the inventory. |
| `status` | `available`, or `not-available` when Git evidence is not available. |
| `gitVersion` | The output of `git version`, or `null` when Git did not run. |
| `commit`, `objectFormat` | The commit of `HEAD`, and `sha1` or `sha256`, from the length of the commit ID. |
| `branch` | The branch of `HEAD` without `refs/heads/`, or `null` when `HEAD` is detached. |
| `targetPrefix` | The folder of the target in the Git work tree: `""` for its top folder, or a path that ends with `/`. The paths in `localChanges` are relative to the target folder, as in the inventory. |
| `localChanges.changed` | Snapshot files whose content differs from the commit. Choom computes the Git object ID of the saved content, the hash of `blob <size>`, a NUL byte and the content with the object format, and compares it with the commit. |
| `localChanges.notInCommit` | Snapshot files that are not in the commit. |
| `localChanges.notInSnapshot` | Commit files in the target folder that are not in the snapshot and that the capture exclusions do not leave out. At capture, the target folder did not have them as regular files: they were deleted, or a folder took their place. |
| `localChanges.outsideCaptureScope` | Commit files that the capture exclusions leave out. They are not compared, and they do not count as deleted. |
| `localChanges.submodules` | The path of each submodule in the target folder. The files in a submodule are not compared. |
| `limits` | The limits of the record in plain text. |
| `reason` | Only when `not-available`: what failed, with Git's message when Git gave one. |
| `gaps` | Empty when Git evidence is available. Otherwise one `git-unavailable` gap with `kind`, `subjectRefs` (the snapshot ID) and `reason`. |

Each list in `localChanges` is sorted. To find the commit files that the capture
exclusions leave out, Choom reads `exclusions.txt` as rsync reads it, for the
rule forms that Stage 1 uses: a pattern with the wildcards `*` and `?`, a
leading `/` that anchors it to the target folder, a trailing `/` that limits it
to folders, and a `- ` prefix. Blank lines and lines that start with `#` or `;`
are comments. For another rule form, such as an include rule (`+ `), `!`, a
character class, `**` or a backslash, Choom does not guess:
`outsideCaptureScope` is empty, `notInSnapshot` can also list files that the
exclusions left out, and `limits` names the rule.

The limits also say that a Git filter, such as line-ending conversion or Git
LFS, can make a file look changed, that file modes are not compared, and that
`notInCommit` can list files that Git ignores, because Git ignore rules do not
set the capture scope.

Git evidence is not available when Git is not installed, the target folder is
not in a Git work tree, `HEAD` has no commit, or Git refuses a command or gives
an unexpected answer. Git refuses a target folder that another user owns
("dubious ownership"). A `safe.directory` setting in the user's Git settings does
not change this, because the capture does not read those settings. In each case
the capture continues, and the record has the reason and the gap:

```json
{
  "formatVersion": 1,
  "snapshotRef": "snapshot-001",
  "status": "not-available",
  "gitVersion": "git version 2.43.0",
  "reason": "`git rev-parse --is-inside-work-tree --show-prefix` failed with exit code 128: fatal: not a git repository (or any of the parent directories): .git",
  "gaps": [
    { "kind": "git-unavailable", "subjectRefs": ["snapshot-001"], "reason": "Git evidence is not available, so the commit, the branch and the local changes of the snapshot are unknown. `git rev-parse --is-inside-work-tree --show-prefix` failed with exit code 128: ..." }
  ]
}
```

Stage 1 `finish` adds this gap to the discovery gaps after the review gaps and
the settings gaps, with the ID `s1-git-identity-gap-001` and the evidence
`git-identity-001#/gaps/0`. `finish` refuses a review question or gap with this
ID, and a Git identity record that is not valid. Stage 1 `verify` checks that
the saved Stage 1 discovery has the gap.

## Knip receipts and required gaps

Stage 2 `prepare` saves `preflight.json`, and Stage 2 `run` saves `knip-runs.json`
(the Knip receipts) and then `required-gaps.json` in the attempt folder. Stage 2
`finish` registers them as `<attempt>-preflight`, `<attempt>-knip-runs` and
`<attempt>-required-gaps`. The
[Stage 2 cookbook](step-2-cookbook.md#4-run-knip-against-the-saved-snapshot)
describes the runs. These fields give the outcomes:

| Record and field | Meaning |
| --- | --- |
| `preflight.json` `status`, `reasons` | `eligible`, or `unsupported` when the fixed Knip profile cannot run on the snapshot, with the reasons. |
| `knip-runs.json` `preflightRef` | The preflight record, `<attempt>-preflight`. |
| `knip-runs.json` `runs` | One run for each mode: index 0 is `normal` and index 1 is `production`. |
| Run `status` | `completed` when Knip ran and gave a valid JSON report; `failed` when Knip ran but the run reached its time limit (`timedOut`), stopped on a signal (`signal`), exited with a code other than 0 or 1 (`exitCode`), had a command error (`errors`) or gave a report that is not valid (`report.error`); `skipped` when Knip did not run. |
| Run `reasons` | Only for `skipped`: why Knip did not run, such as an unsupported preflight, no approved tool image, or a production analysis that the plan did not select. |

### Required gaps

An `unsupported` preflight and each run that is `skipped` or `failed` need a gap
that cites them. `required-gaps.json` holds these gaps, in the form of the
[contract](../../../cookbook/interfaces/producer-run-records.tsp):

```json
{
  "formatVersion": 1,
  "gaps": [
    { "id": "s2-001-knip-gap-001", "kind": "tool-outcome", "subjectRefs": ["snapshot-001"],
      "reason": "Knip preflight marked the profile unsupported. Workspace lacks a captured manifest: package.json.",
      "evidenceRefs": ["s2-001-preflight"] },
    { "id": "s2-001-knip-gap-002", "kind": "tool-outcome", "subjectRefs": ["snapshot-001"],
      "reason": "The normal Knip run was skipped. Workspace lacks a captured manifest: package.json. No approved available tool image: ...",
      "evidenceRefs": ["s2-001-knip-runs#/runs/0"] }
  ]
}
```

| Field of a gap | Value |
| --- | --- |
| `id` | `<attempt>-knip-gap-` and the position of the gap from 1 in three digits. The gap of the preflight comes first, then the gaps of the runs in the order of `runs`. |
| `kind` | `tool-outcome`. |
| `subjectRefs` | The snapshot ID. |
| `reason` | The outcome and each reason of its record. For a `failed` run, the reasons are its time limit, signal, exit code, errors and report error. A reason stays within the 16 KiB limit of the discovery contract. When the reasons do not fit, the reason gives the number of reasons that it leaves out; the cited record keeps them. |
| `evidenceRefs` | The preflight record, `<attempt>-preflight`, or the run in the receipts, `<attempt>-knip-runs#/runs/N`. |

The record has no gap when the preflight is `eligible` and both runs are
`completed`. The entry analysis copies each required gap into its `gaps` exactly,
in any place of the list. Stage 2 `finish` gives the gaps again from the saved
preflight and receipts, and refuses:

- a `required-gaps.json` that differs from them;
- an entry analysis that leaves out or changes a required gap;
- a question or another gap whose ID starts with `<attempt>-knip-gap-`. Stage 2
  `plan` refuses such an ID in the entry plan too.

Later stages keep these gaps unchanged, as they keep every question and gap. The
shared record checks of Stages 4 to 6 check again that a gap cites the preflight
record when it is `unsupported`, and the Knip receipts when a run is `skipped` or
`failed`.

## Stage 3 required gaps

Stage 3 `collect` saves `required-gaps.json`, and each Stage 3 `exports` request
saves `exports-NNN.required-gaps.json` after its record. The receipt of the
action names the file with its SHA-256. The Stage 3 finalizer registers it as
`<attempt>-file@required-gaps.json` or `<attempt>-file@exports-NNN.required-gaps.json`.
Each file has the form of the [Knip required gaps](#required-gaps), the
`RequiredGaps` model of the [contract](../../../cookbook/interfaces/producer-run-records.tsp).
The [Stage 3 cookbook](step-3-cookbook.md#2-collect-focused-evidence) describes
the tool records.

| Tool record | Required gaps |
| --- | --- |
| `symbol-mentions.json` | One gap when the `status` is `partial`, `unavailable` or `skipped`, and none when it is `completed`. The ID is `<attempt>-symbol-mentions-gap-001`, the `kind` is `tool-outcome`, the subject is the snapshot ID and the evidence is the record, `<attempt>-file@symbol-mentions.json`. The `reason` gives the status and each Knip run of the selected Knip receipts that did not complete. |
| `exports-NNN.json` | One gap for each gap of the record, which is a compiler input that the snapshot does not hold. The ID is `<attempt>-exports-NNN-gap-MMM`, with the position of the gap from 1 in three digits. The `kind`, `subjectRefs` and `reason` are those of the record, and the evidence is the place of the gap in the record, `<attempt>-file@exports-NNN.json#/gaps/M`, with M one less than MMM. A record without gaps gives a file without gaps. |

Collect saves this record after a Stage 2 attempt that skipped both Knip runs:

```json
{
  "formatVersion": 1,
  "gaps": [
    { "id": "s3-001-symbol-mentions-gap-001", "kind": "tool-outcome", "subjectRefs": ["snapshot-001"],
      "reason": "The symbol mentions are skipped: Knip did not run, so they cover no reported export or type. The normal Knip run of s2-001-knip-runs was skipped. The production Knip run of s2-001-knip-runs was skipped.",
      "evidenceRefs": ["s3-001-file@symbol-mentions.json"] }
  ]
}
```

A required gap of an exports record keeps the subjects of its record, also a
file that the snapshot does not hold, such as `src/env.d.ts`. The subject checks
know such a gap by its form (see [IDs and evidence](#ids-and-evidence)).

The review prompt of `collect` lists the gaps of `required-gaps.json`. The
message of each exports request names its required-gaps file, and the operator
gives that file to the LLM with the record. The entry analysis copies each
required gap into its `gaps` exactly, in any place of the list. The Stage 3
finalizer gives the gaps again from the saved symbol mentions and exports
records, also with `verify`. It refuses:

- a required-gaps file that differs from them;
- an entry analysis that leaves out or changes a required gap, such as with
  `The entry analysis leaves out the required gap s3-001-exports-001-gap-001.
  Copy each gap of s3-001-file@exports-001.required-gaps.json exactly.`;
- a question or another gap whose ID starts with `<attempt>-symbol-mentions-gap-`,
  or with `<attempt>-exports-NNN-gap-` for a saved `exports-NNN.json`.

Later stages keep these gaps unchanged, as they keep every question and gap.

## Producer code record

Stage 1 `start` saves `evidence/producer.json` in the new run. Stage 1 `finish`
registers it in `run.yaml` as `s1-file@evidence%2Fproducer.json`, so a later
change to the record is a changed registered artifact.

```json
{
  "formatVersion": 1,
  "package": "@choom/producer",
  "version": "0.1.0",
  "codeDigest": "<64 lowercase hexadecimal characters>",
  "commit": "<40 or 64 lowercase hexadecimal characters, or not-available>"
}
```

| Field | Meaning |
| --- | --- |
| `formatVersion` | `1`. |
| `package` | `@choom/producer`. |
| `version` | The `version` in `packages/producer/package.json`. |
| `codeDigest` | The code digest below. |
| `commit` | The Git commit of the tool checkout when the checkout is the top folder of a Git repository; otherwise `not-available`. Local changes are not in the commit; the digest includes them. |

The code digest is the SHA-256 of a text with one line for each regular file in
`packages/producer/src` and `packages/baseline-model/src`. Each line is the
file's SHA-256, two spaces and the file's path, and then a line feed. The path is
relative to the tool checkout and uses `/`. The lines are sorted by the UTF-8 bytes
of the paths. A symbolic link or another entry that is not a regular file or
folder stops the digest, and so does a file name with a control character.
Documents, `package.json` files and installed packages are not part of the digest.

Every stage action after Stage 1 `start` reads the record and computes the digest
of the tool checkout before it reads or writes the run. It refuses the action and
writes nothing when:

- The run has no record: it started before the record existed. Start a new run.
- The record is not valid. Start a new run.
- The digest is different. The message names the recorded commit and digest.
  Continue with that producer version, or start a new run.

The programs that a stage action starts after its check, such as the Stage 2
modules, `inventory-view.py`, `check-knip-image.mjs` and `stage-4-graph.ts`, do
not check again. The duplication assessment, the input consolidation command and
the recovery capture do not use the record.

A file in the run folder is not trusted code. Stage 1 saves `inventory.mjs` only
as a record of the code that lists the snapshot. Stage 2 `start` and `finish` do
not run it: they make the inventory of the saved snapshot with the checkout code
and compare it byte for byte with the registered inventory. The recovery capture
runs the Stage 1 settings collector in the tool checkout, as Stage 1 `settings`
does, and saves no copy of it in the new run. Its settings command record names
the collector and its SHA-256.

## Decision record

Stage 6 publishes a baseline whose statements are all `proposed`. After Stage 6,
a person can accept or correct statements. The person writes a decision file in
YAML, and `baseline decide` checks it and saves it in the run folder as a
decision record. The record does not change the baseline. `baseline next` makes
the [next baseline version](#next-baseline-version) from a saved record. The
[TypeSpec contract](../../../cookbook/interfaces/baseline-decisions.tsp) in
`@choom/baseline-model` defines the value of the file, so the viewer can use it
too. A copied decision-file entry from the viewer starts with a YAML comment
that names the baseline.

```yaml
# Baseline baseline-001, SHA-256 <64 lowercase hexadecimal characters>
formatVersion: 1
id: decisions-001
baselineRef: baseline-001
baselineDigest: <64 lowercase hexadecimal characters>
decider:
  name: Ada Example
  kind: human
decidedAt: 2026-11-15T10:30:00Z
entries:
  - action: accept
    itemId: cli
    field: purpose
  - action: correct
    itemId: billing
    field: purpose
    oldValue: Bill the saved orders.
    newValue: Bill each saved order once.
```

The producer reads a decision file with the [bounded YAML profile](#reader-limits)
of a baseline: one UTF-8 document of at most 16 MiB within the same YAML limits,
the core schema, unique string keys and values that JSON can hold. Comments are
allowed. Anchors, aliases, explicit tags and directives are refused, and a merge
key (`<<`) does not merge: without an alias it is an ordinary key, which the
contract refuses. `decidedAt` stays text. JSON is also YAML, so a decision file
in JSON form is read the same way. A refusal of the profile starts with
"Decision file", such as `Decision file YAML mapping keys must be unique strings.`

| Field | Value |
| --- | --- |
| `formatVersion` | `1`. |
| `id` | The ID of the record: lowercase letters, digits and hyphens, at most 128 characters. The record is saved as `decisions/<id>.yaml`. |
| `baselineRef` | The ID of the published baseline. |
| `baselineDigest` | The SHA-256 of the published baseline file, as 64 lowercase hexadecimal characters. It is the `sha256` of the baseline in the `run.yaml` registry, which Stage 6 computes from the saved bytes. The viewer computes the same digest of the file that it opens. |
| `decider` | `name` of the person who decided, and `kind: human`. |
| `decidedAt` | When the person decided: an RFC 3339 time in UTC, such as `2026-11-15T10:30:00Z`. |
| `entries` | At least one decision. `{action: accept, itemId, field}` accepts a statement with its current value. `{action: correct, itemId, field, oldValue, newValue}` replaces the value; `oldValue` is the current value. Values are data that JSON can hold. There is no reject action: a statement without a decision stays proposed. |

An entry names one statement: an item field with `value`, `status` and
`evidenceRefs`. `itemId` is the ID of a component, interface, resource or rule.
`field` is the path of the statement in the item, as in a discovery subject:

| Item | Fields |
| --- | --- |
| Component | `purpose`, `membership`, `groupingReason`, and `parent` when the component has one. |
| Interface | `owner`, `publicAccess`, `allowedConsumers`, `promises`; in versions 2 to 5 also `documentation.summary`, and for each documentation entry `documentation.entries.<entry-id>.kind`, `.description`, `.signature` and `.interaction` when present, and `.examples.<example-id>.content`. |
| Resource | `identity`, `owner`, `accessRules`. |
| Rule | `subject`, `expected`, `check`. |

The statement name is `<itemId>.<field>`, such as `billing.purpose`. A part of a
value, such as `promises.behavior`, is not a statement.

`validateDecisions` in `@choom/baseline-model` checks the file against the
baseline and its digest. It reads no file, and it refuses:

- a file that does not match the contract;
- a `baselineRef` or `baselineDigest` of another baseline;
- an entry that names no statement of the baseline, and a second entry for
  one statement;
- an entry for a statement that is not `proposed`. No document lets a decision
  change an accepted statement;
- a correction whose `oldValue` is not the current value. The values are
  compared as JSON data: the keys of an object can be in another order, the
  items of an array cannot. The refusal names the statement, the expected value
  and the given value;
- a correction whose `newValue` is the current value. Use `accept`;
- new values that make the baseline invalid under the shared baseline rules,
  together, as the next version will have them.

Set `CHOOM_DECISIONS` to the decision file, outside the run folder. Record the
decisions with:

```sh
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" baseline decide --run "$CHOOM_WORK" "$CHOOM_DECISIONS"
```

The command reads `run.yaml`, which must report `completed` with
`baselineRecovery: complete` and name the published baseline. It checks the
registered SHA-256, the bounded YAML profile and the shared rules of the
published baseline, and reads the decision file with the bounded YAML profile
above. After `validateDecisions` and the decider check below, it checks the next
version that `baseline next` makes from the saved record, with the checks of its
saved form in [Next baseline version](#next-baseline-version), and refuses with
the same messages. So it never saves a record that `baseline next` refuses, such
as a record whose ID gives the version the ID of an item. Then it saves the exact
bytes of the file once, comments included, as `decisions/<id>.yaml`. A second
save with the same ID is refused, also when the content is the same.
The save is all or nothing (`saveDecisionRecord` in `decision-record.ts`). The
command writes the bytes into a new temporary file in `decisions/`, whose name
starts with `.next-` and so cannot be a record ID, and reads them back there.
Then a hard link gives the file its final name, which never replaces a record,
and the command removes the temporary name. After any failure, such as a full
disk, it removes the temporary file and refuses with
`Cannot save the decision record decisions/<id>.yaml: <cause>`, so no part of the
record stays and you can record the decisions again. Only a hard stop of the
process, such as a power loss, can leave a `.next-` file; remove it. The
baseline, the discovery result, `run.yaml` and every other file of the run stay
unchanged, so `run.yaml` does not register the record. The command prints JSON,
as the stage helpers do: the record path and its SHA-256, the baseline, the
decider, the time, each decided statement, and the call records and models that
the decider check compared. Keep the SHA-256 with the run notes. The command is
not a stage action: it does not check the producer code record, because a
person can decide after the run with a later producer.

A later command, such as `baseline next`, reads a saved record with
`readDecisionRecord(run, id)` in
`packages/producer/src/decision-record.ts`. It reads `decisions/<id>.yaml` of a
completed run with the same rules as `baseline decide` and returns its bytes,
its SHA-256 and its value, for `validateDecisions`.

The decider check is a process rule, not proof (decision D10). The command
compares `decider.name` with the `model` value of each LLM call record of the
run: each file that `run.yaml` registers under `evidence/` whose name ends with
`-call.yaml`. These are `evidence/llm-call.yaml` of Stage 1, and
`llm/plan-call.yaml` and `llm/analysis-call.yaml` in the attempt folders of
Stages 2 to 6. It compares the names after it removes white space at their
start and end and changes all letters to lower case, and refuses a match. It
also refuses a run that registers no call record, because the check cannot run;
every completed run has the call records of its stages. A model value
`unknown` is compared too, but it names no model. Files that `run.yaml` does not
register, such as a failed attempt, are not compared. Code cannot prove that a
person made the decisions: any writer can give a person's name. The check stops
a decision file that names a model of the run, and the named person stays
responsible for the decisions.

## Next baseline version

Decisions do not change a saved baseline. `baseline next` makes a new version
from a saved [decision record](#decision-record): the published baseline of the
run, with the decided statements accepted. The new version has no discovery
result until a new run maps it (decision D12). The discovery result of the run
and earlier reports keep the published baseline.

Give the ID of a decision record that `baseline decide` saved:

```sh
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" baseline next --run "$CHOOM_WORK" --decisions decisions-001
```

The command reads the completed run and its published baseline as
`baseline decide` does, and reads `decisions/<id>.yaml` with
`readDecisionRecord`. `nextBaselineVersion` in `@choom/baseline-model` makes
the version. It reads no file. It runs the checks of `validateDecisions`
against the published baseline first, so a record that does not fit that
baseline is refused with every problem. The version:

- has the ID `<parent ID>-<decision record ID>`, such as
  `baseline-001-decisions-001`. Both IDs are lowercase IDs with hyphens, so the
  new ID is one too, and it is never the parent ID. One record always gives
  the same ID, so it makes at most one version;
- has `parentId` set to the ID of the published baseline, and the same
  `formatVersion`;
- has each decided statement `accepted`, with the decision record ID as its
  `acceptanceRef`. A correction also replaces the value. The statement keeps
  its `evidenceRefs`;
- keeps every other field, item and statement of the published baseline, with
  the items and list entries in the same order.

The command also refuses a record whose `id` is not the ID in its file name, and
a decider who is a model of the run, as `baseline decide` does. It writes the
version as YAML, reads the text back with the bounded YAML profile, and checks
it with the shared baseline rules and the producer profile of a next version:

- the parent is the baseline that the decision record is for;
- the saved decision record has the SHA-256 that the version record gives;
- each `accepted` statement names that decision record in its
  `acceptanceRef`, and the record has an entry for the statement: `accept`, or
  `correct` with the value of the statement as its `newValue`. A statement
  without an entry stays `proposed`;
- a symbol has one direct owner: two components cannot name the same symbol of
  a file;
- no item has the ID of the version, because the baseline ID is reserved;
- the version is within the [viewer limits](#reader-limits).

A first version, which Stages 4 to 6 check, has no decision record: its
`parentId` is null, and every statement is `proposed`.

The command saves one new folder with two files, once, all or nothing:

| Path in the run folder | Contents |
| --- | --- |
| `baselines/<version-id>/baseline.yaml` | The next version. |
| `baselines/<version-id>/version.json` | The version record. |

It writes the two files into a new temporary folder in `baselines/`, whose name
starts with `.next-` and so cannot be a baseline ID, and reads each file back
there. Then one rename gives the folder its final name. After any failure, the
command removes the temporary folder and refuses with
`Cannot make the folder baselines/<version-id>: <cause>`, so no part of the
version stays, and a later run can make the version. Only a hard stop of the
process, such as a power loss, can leave a `.next-` folder; remove it.

```json
{
  "formatVersion": 1,
  "baseline": { "id": "baseline-001-decisions-001", "path": "baselines/baseline-001-decisions-001/baseline.yaml", "sha256": "<64 lowercase hexadecimal characters>" },
  "parent": { "id": "baseline-001", "path": "baselines/baseline-001/baseline.yaml", "sha256": "<64 lowercase hexadecimal characters>" },
  "decisions": { "id": "decisions-001", "path": "decisions/decisions-001.yaml", "sha256": "<64 lowercase hexadecimal characters>" }
}
```

The version record links the version to its parent and to its decision record.
Each link gives the ID, the path in the run folder and the SHA-256 of the saved
bytes. The parent SHA-256 is the `sha256` of the published baseline in the
`run.yaml` registry. A later check can read the three files again and compare
their SHA-256 with the version record; the producer profile of a next version
already refuses a decision record with another SHA-256. No command makes this
later check yet. The command does not change the published baseline, the
discovery result, `run.yaml` or the decision record. `run.yaml` does not
register the version, because the version record is enough to check the links.
The viewer opens the new version as any baseline file; it does not read the
version record.

A second `baseline next` with the same record is refused, because the version
folder exists: a saved version does not change. A new decision record about the
published baseline makes another version beside the first; both name the
published baseline as their parent.

The command prints JSON: the version path and SHA-256, the links of the parent
and of the decision record, the path and SHA-256 of the version record, each
decided statement, and the call records and models that the decider check
compared. As for `baseline decide`, the command is not a stage action: it does
not check the producer code record.


## Scoped unit inventories

A complete rule check can name `coverage.inventoryRoots`. Each path identifies a
root for which the producer reconciled the captured source inventory with the
selected mapping and examined units. The comparison uses this record when an
endpoint exists in only one file. A missing declaration or a different line
number alone cannot establish the date of an access change.
