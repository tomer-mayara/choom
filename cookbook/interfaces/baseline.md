# Baseline validation

The baseline-model component owns the baseline viewer profile in
[baseline.tsp](baseline.tsp). It is the `@choom/baseline-model` workspace. The
viewer and the producer use these rules. The producer adds a stricter profile
and its run checks; see the
[record format](../../docs/design/app-a/record-format.md#baseline). `baselineSchema` in
[`packages/baseline-model/src/baseline.ts`](../../packages/baseline-model/src/baseline.ts)
validates an unknown value and returns the generated `Baseline` data type.
Import it from `@choom/baseline-model`, and the generated types from
`@choom/baseline-model/contracts`. Use `safeParse` to get field paths
for invalid input. The reader accepts `formatVersion: 1`, `formatVersion: 2`,
`formatVersion: 3`, `formatVersion: 4`, and `formatVersion: 5`.
Version 1 keeps its original strict fields. Version 2 adds optional interface
documentation, defined in [baseline-documentation.tsp](baseline-documentation.tsp).
The viewer does not upgrade a file or accept the legacy diagram format.

The generated schema checks field shapes, nonblank text, statement statuses,
acceptance references, list sizes, and repeated symbol selectors. The runtime
validator also checks item ID uniqueness, component references, parent cycles,
safe membership selectors, and symbol selector syntax.
Selectors are relative paths or subtrees ending in `/**`. A selector cannot
contain `#`, so that a symbol reference such as `src/a.ts#decode` is not read as
a path. Version 5 names symbols in a separate field instead. Exact paths,
exclusions, and symbols are retained; validation does not match them against
source files.

Accepted statements require an `acceptanceRef`; proposed statements cannot have
one. All statements require at least one nonblank evidence reference. The viewer
does not resolve evidence, acceptance records, or `parentId`, but it refuses a
`parentId` equal to the baseline's own `id`. Validation neither
accepts a proposal nor proves its evidence, ownership, or rules.

All four collections are required and may be empty. Names may repeat. An
interface can have unknown ownership and known consumers. Empty consumer lists
are invalid; null means that the complete positive policy is unknown. A component
parent can be absent or a statement whose value is null. These forms remain
distinct.

Version 2 documentation contains a summary statement, documented entries, and
source notes. Each entry names one exact value from the same interface's
`publicAccess.value`. Entry IDs are unique within an interface; example IDs are
unique within an entry. They do not add architecture records or graph links.

An entry's kind and description are separate statements. Only entries whose
recorded kind is `function` can also have a `signature` statement. This includes
methods. A signature saves the declaration as text, including the parameters
and return type where the source supports both. A missing signature means it
was not recorded; a signature with a null value means it is unknown. The
signature has its own status and evidence references, and its own acceptance
reference if accepted. The reader preserves signature text without parsing,
inferring, or running it.

Function, command, and workflow entries can also have one interaction statement
with nullable input, success, failure, and effect text. Each example has its own
content statement, with saved text, optional input, and an optional complete or
excerpt result. The reader preserves every value and status. It does not execute
examples.

A source note describes one evidence reference cited by this interface or its
documentation. Each reference has at most one note. A location has a snapshot
reference, a safe relative path, a SHA-256 digest, and an inclusive line range.
A `source-reviewed` example must cite its own direct source reference with a
matching location note. This checks the saved link only. External publication
must verify the source review; the viewer does not open source files or verify
the claim. An `illustrative` example does not claim source review.

Versions 3 to 5 retain all version 2 fields and validation. They can add optional
`sourceUsage`, defined in [baseline-source-usage.tsp](baseline-source-usage.tsp).
Versions 1/2 reject that field. A source-use object names one saved snapshot and
one code mapping. Its assessments describe reviewed scope, evidence, limitations,
and uses for individual interfaces. An absent object, missing assessment, and
assessed empty use list remain different states. No state proves completeness.

Use IDs are unique within their assessment. Assessments name distinct existing
interfaces. A known consumer names an existing component; null means that its
caller file has no resolved component owner. Kind distinguishes value from type
references; context distinguishes application, tooling, test, and unknown use.
Optional entry and access-point bindings must belong to that interface and agree.
A missing binding does not mean that every entry is used.

Use evidence contains distinct direct source-record IDs without fragments.
`callerRef` must be one of them. Every use reference needs a matching located
source note in its assessment. Notes cite assessment or use evidence and have
unique references within that assessment. All supplied locations use the common
snapshot. Scope-only notes can omit locations. The publisher verifies source
identity and review history; Choom validates the supplied shape and local links.
It does not fetch files, verify digests, infer consumers, or prove execution.
Source observations never replace `allowedConsumers`, which remains a permission
statement. Baseline details exposes the complete **Original source-use data**.

Versions 4 and 5 can also add optional `systemEntryPoints`, defined in
[baseline-system-entry-points.tsp](baseline-system-entry-points.tsp).
Its absence means entry points were not recorded. A present object records a
review scope, at least one scope evidence reference, limits of that review, and
an entry list. An empty list means no supported entry was found in that scope.
Each entry identifies one startup or external call boundary, its saved file
path, and the component that directly owns that file. Its label identifies the
start command or call selector. A system can have many entries of either kind.

Entry IDs are unique within the assessment. Component and optional interface
links must name saved records. An optional `entryId` must name a documented
entry in the linked interface. Entry evidence is nonempty and distinct. If a
source range is present, its direct reference must be in that entry's evidence;
its snapshot and path must match the assessment and entry. The source location
uses the same path, digest, and line-range rules as documentation. When version
4 or 5 has both `systemEntryPoints` and `sourceUsage`, their snapshot and mapping
references must match. The reader checks these internal links. It does not
open the source checkout or evidence bundle, or verify deployment and calls.
Versions 1 to 3 reject `systemEntryPoints`.

Version 5 is version 4 plus optional symbol selectors in a component's
membership value: `symbols: [{ path, symbol }]`. It keeps all version 2 to 4
fields and validation, and it uses the version 3 and 4 arrow rules. A symbol
`path` follows the path selector rules, but it must name one file: a `/**`
subtree and `#` are refused. A `symbol` is a JavaScript identifier name. It
starts with a Unicode ID_Start character, `$`, or `_`, and continues with
ID_Continue characters, `$`, ZWNJ, or ZWJ. The check does not refuse reserved
words, so `default`, the name of a default export, passes. Unicode escape
sequences are not decoded. A component cannot repeat a `{ path, symbol }` pair.
In version 5, `paths` can be empty when `symbols` is not empty, but each
membership needs at least one path or symbol. Versions 1 to 4 keep a non-empty
`paths` list and reject `symbols`. As for paths, the reader checks only the
selector syntax. It does not open files, check that a file declares the symbol,
or check ownership across components. The producer writes version 5 from Stage 5.
Its record checks refuse two owners of one symbol and a symbol that the file does not
declare, and they divide each named file into code units on the saved snapshot; see
the [record format](../../docs/design/app-a/record-format.md#version-5-symbol-selectors).

Rule values are JSON objects or null. Keep nested values and all own keys,
including `__proto__`, without running expressions. Reject non-JSON values and
cycles. No field is silently discarded. Byte and YAML limits belong to the
[input boundary](baseline-codec.md); display limits belong to the
[workspace](workspace.md).

The [decision contract](baseline-decisions.tsp) defines a decision file: human
decisions that accept or correct statements of one saved baseline. The file is
YAML; the producer reads it with the bounded YAML profile of a baseline, and the
contract describes the parsed value. Import `validateDecisions` from
`@choom/baseline-model/baseline-decisions`. It takes that value and the baseline
with the SHA-256 of its saved bytes, reads no file, and returns the typed
decisions or every problem that it found. A statement is an
item field with `value`, `status` and `evidenceRefs`. `baselineStatements` in
`@choom/baseline-model/item-statements` lists them with their paths, and the
producer record checks and the viewer's Recorded statements use the same list.
The [record format](../../docs/design/app-a/record-format.md#decision-record)
gives the fields, the statements that can be decided and the checks.

`nextBaselineVersion` from the same export makes the next version of a saved
baseline from a decision file, after the checks of `validateDecisions`. It reads
no file. The version has the ID `<parent ID>-<decision record ID>` and the
parent ID as its `parentId`. Each decided statement is `accepted`, with the
decision record ID as its `acceptanceRef`; a correction also replaces the value.
All other values stay the same, and the version passes the shared baseline
rules, so the viewer accepts it as any other baseline. The
[record format](../../docs/design/app-a/record-format.md#next-baseline-version)
gives the producer command that saves it.

The [discovery result contract](discovery-result.tsp) defines the part of a fixed
discovery result, `formatVersion: 2`, that the viewer reads: `kind`,
`baselineRef`, `baselineDigest`, `questions` and `gaps`. The other top-level
fields of the [record format](../../docs/design/app-a/record-format.md#discovery)
must be present, and the viewer does not read their values. A question has
exactly `id`, `subjectRefs`, `text` and `evidenceRefs`; a gap has exactly `id`,
`kind`, `subjectRefs`, `reason` and `evidenceRefs`. Any gap kind is kept.
`validateDiscoveryResult` in `@choom/baseline-model/discovery-result` takes the
parsed value and a baseline with the SHA-256 of its saved bytes, reads no file,
and returns the result or its first problem. It checks, in order: the kind; the
format version (version 1 has no digest, decision D20); the fields and the
limits; the IDs, which are unique across questions and gaps; and the baseline ID
and digest. The limits are 5,000 questions and gaps together, 1 to 100 subject
references each, at least one evidence reference, 16 KiB of UTF-8 for a text,
4 KiB for an ID, a kind or a reference, and 4 MiB for all string values of the
file together, counted as for the duplication report. A limit refuses the file;
no record is dropped. The viewer places a question or gap on each component,
interface, resource and rule whose ID equals a subject reference or starts it
before a dot, and lists a record with a subject that names no item as unplaced.
Stage 6 of the producer runs the same check on the fixed discovery result before
it saves a file, so it never publishes a result that the viewer refuses.

The two reviewed fixture files live in `test/fixtures/baseline-viewer/`. They are
copies of the reviewed empty and full `work-choom` baselines. Tests use repository
paths and need no external checkout or companion records. The version 5 example
[`symbol-membership.yaml`](../../test/fixtures/baseline-viewer/symbol-membership.yaml)
in the same folder has a component that owns only one symbol in a file that
another component owns by path.

The documentation fixture in `test/support/interface-documentation-fixtures.ts`
supplies version 2 reader and browser cases. The browser accepts it through the
normal file input. The interface's **Original record** disclosure exposes the
complete saved record before the formatted documentation views are added.

Run the focused checks:

```sh
bun run test:behavior --tags @bv-01
bun run test:behavior --tags @br-10a
bun run test:behavior --tags @br-11a
bun run test:behavior --tags @ep-01
bun run test:behavior --tags @ga-03b
bun run test:e2e --tags @br-11a
bun run test:e2e --tags @ga-03b
bun test ./packages/baseline-model/test/unit/symbol-membership.test.ts ./packages/baseline-model/test/unit/baseline-format.test.ts
bun test ./test/interface/domain/symbol-membership.test.ts
bun test ./packages/baseline-model/test/unit/source-usage.test.ts ./packages/baseline-model/test/unit/source-usage-limits.test.ts
bun test ./test/unit/lib/baseline-display-limits.test.ts
bun test ./test/interface/domain/source-usage.test.ts
bun test ./test/unit/lib/source-connections.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/source-use-reading.test.tsx ./test/unit/components/source-usage-guard.test.tsx
bun test ./test/interface/domain/system-entry-points.test.ts
bun run test:e2e --tags @br-10a
bun test ./packages/baseline-model/test/unit/baseline.test.ts
bun test ./packages/baseline-model/test/unit/interface-documentation.test.ts ./packages/baseline-model/test/unit/interface-documentation-limits.test.ts
bun test ./test/interface/domain/baseline.test.ts
bun test ./test/interface/domain/interface-documentation.test.ts
bun test ./packages/baseline-model/test/unit/baseline-decisions.test.ts ./test/interface/domain/baseline-decisions.test.ts
bun test ./packages/baseline-model/test/unit/item-statements.test.ts
bun test ./packages/baseline-model/test/unit/discovery-result.test.ts ./test/interface/domain/discovery-result.test.ts
bun run test:integration
bun run check:contracts
```

`bun run test:integration` starts Node, not Bun, from the repository root. Node
imports `@choom/baseline-model` through the workspace link, with no build step,
and validates a reviewed baseline. The package uses only TypeScript that Node can
remove (type stripping), so it can run in a Node process such as the producer.
The same command runs the producer record suite, which checks proposed baselines
with these rules and the producer profile.

The feature and TypeSpec contract are linked from the
[baseline-model component manifest](../../packages/baseline-model/component.yaml).
The workspace manifest also links `symbol-membership.feature`, because its
browser scenario covers the component details.
The existing runners discover the new feature, steps, and suites. This change
adds no cross-component dependency or production service, so the architecture
and OpenSLO artifacts remain unchanged.
