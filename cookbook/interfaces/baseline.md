# Baseline validation

The architecture-model component owns the baseline viewer profile in
[baseline.tsp](baseline.tsp). `baselineSchema` in
[`src/domain/baseline.ts`](../../src/domain/baseline.ts) validates an unknown value
and returns the generated `Baseline` data type. Use `safeParse` to get field paths
for invalid input. The reader accepts `formatVersion: 1`, `formatVersion: 2`,
`formatVersion: 3`, and `formatVersion: 4`.
Version 1 keeps its original strict fields. Version 2 adds optional interface
documentation, defined in [baseline-documentation.tsp](baseline-documentation.tsp).
The viewer does not upgrade a file or accept the legacy diagram format.

The generated schema checks field shapes, nonblank text, statement statuses,
acceptance references, and list sizes. The runtime validator also checks item ID
uniqueness, component references, parent cycles, and safe membership selectors.
Selectors are relative paths or subtrees ending in `/**`. Exact paths and
exclusions are retained; validation does not match them against source files.

Accepted statements require an `acceptanceRef`; proposed statements cannot have
one. All statements require at least one nonblank evidence reference. The viewer
does not resolve evidence, acceptance records, or `parentId`. Validation neither
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

Versions 3 and 4 retain all version 2 fields and validation. They can add optional
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

Version 4 can also add optional `systemEntryPoints`, defined in
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
4 has both `systemEntryPoints` and `sourceUsage`, their snapshot and mapping
references must match. The reader checks these internal links. It does not
open the source checkout or evidence bundle, or verify deployment and calls.
Versions 1 to 3 reject `systemEntryPoints`.

Rule values are JSON objects or null. Keep nested values and all own keys,
including `__proto__`, without running expressions. Reject non-JSON values and
cycles. No field is silently discarded. Byte and YAML limits belong to the
[input boundary](baseline-codec.md); display limits belong to the
[workspace](workspace.md).

The two reviewed fixture files live in `test/fixtures/baseline-viewer/`. They are
copies of the reviewed empty and full `work-choom` baselines. Tests use repository
paths and need no external checkout or companion records.

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
bun run test:e2e --tags @br-11a
bun test ./test/unit/domain/source-usage.test.ts ./test/unit/domain/source-usage-limits.test.ts
bun test ./test/interface/domain/source-usage.test.ts
bun test ./test/interface/domain/system-entry-points.test.ts
bun run test:e2e --tags @br-10a
bun test ./test/unit/domain/baseline.test.ts
bun test ./test/unit/domain/interface-documentation.test.ts ./test/unit/domain/interface-documentation-limits.test.ts
bun test ./test/interface/domain/baseline.test.ts
bun test ./test/interface/domain/interface-documentation.test.ts
bun run check:contracts
```

The feature and TypeSpec contract are linked from the domain component manifest.
The existing runners discover the new feature, steps, and suites. This change
adds no cross-component dependency or production service, so the architecture
and OpenSLO artifacts remain unchanged.
