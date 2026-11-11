# Baseline viewer change plan

Status: **Implementation in progress as seven stacked draft PRs.**

Reviewed: **2026-11-10**

Choom will open a saved baseline and show its architecture. Remove **Load Repo**
and the current repository analysis process. Keep baseline generation outside
the viewer.

This plan replaces the earlier ticket list. It also supersedes the requirement
to keep Load Repo in the [analysis design's compatibility section](llm-led-architecture-analysis.md#compatibility).
The broader analysis design and the manual producer remain separate work.

## Review changes

The review found these problems in the earlier plan. The rules below include
the corrections.

| Problem | Correction |
| --- | --- |
| Copy/export was an added recommendation. It required source-byte storage, write operations, and cleanup state. | Defer copy/export. This release only reads baseline files. |
| The broad design and manual record format have different limits. | Define the supported input profile below. Do not reuse the producer's completion checks as viewer checks. |
| No components was treated as an empty model. | Only four empty collections mean an empty model. Other records remain visible. |
| An interface with an unknown owner could lose its known consumers. | Connect consumers to the interface itself. Unknown ownership does not remove a known permission. |
| YAML size limits did not bound layout work. | Check item count, link count, and parent depth before layout. Cancellation prevents a late result from replacing the view. |
| A separate public diagram model added another boundary and duplicate state. | Keep the validated baseline and its layout. Use internal helpers to prepare display data. |
| Most tickets ran before the real app could open a baseline. | Test the normal browser and desktop opening paths in BV-03. |
| "Accepted" and "publication" had more than one meaning. | Say "valid for viewing" for input checks and "replace the current view" for UI updates. Reserve "accepted" for recorded intent. |

The plan now has seven implementation tickets and one final verification
checklist. Each ticket still starts with BDD acceptance and uses small TDD steps.

## Release scope

Provide **Open Baseline**, loading status, Cancel, Retry, the diagram, and item
details. Keep pan, zoom, window resizing, and keyboard access.

Remove Load Repo, Choose directory, Export Diagram, analyzer progress, reported
file counts, and the old analysis/findings panels. Add a Rules list. Replace the
starter example with baseline data that uses the same viewer.

The proposed format policy is a complete switch to baseline content. Reject old
`schemaVersion: 1` diagram content with a useful message. Identify the format from
the data, not the filename: a valid baseline named `example.choom.yaml` still
opens. File pickers accept `.yaml` and `.yml`.

Copy/export, model editing, statement acceptance, evidence loading, observed
dependency overlays, and analysis runs are outside this release. Opening a file
does not change it. No source checkout, Node installation, or analyzer is needed
by the installed viewer.

## Supported baseline format

Use the [manual record format](app-a/record-format.md#baseline) for field shapes.
Also allow a reference to an earlier baseline and accepted statements, as specified
in the [analysis design](llm-led-architecture-analysis.md#end-result-architecture-discovery-files).
Specify this viewer profile in TypeSpec as part of BV-01.

The top-level fields are `formatVersion: 1`, `id`, `parentId`, `components`,
`interfaces`, `resources`, and `rules`. All four collections are required arrays.
`parentId` is null or a reference to an earlier baseline; it is not a component
parent and does not require loading another file.

| Item | Fields |
| --- | --- |
| Component | `id`, `name`, `purpose`, `membership`, `groupingReason`; optional `parent`. |
| Interface | `id`, `name`, `owner`, `publicAccess`, `allowedConsumers`, `promises`. |
| Resource | `id`, `name`, `identity`, `owner`, `accessRules`. |
| Rule | `id`, `name`, `subject`, `expected`, `check`. |

Baseline and item IDs match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, as in the producer.
Item IDs are unique across the four collections. Names are nonblank text and
may repeat. Do not apply the old model's directory IDs, required `.` root,
or unique-name rule.

Each item field other than `id` and `name` is a statement with `value`, `status`,
and a nonempty `evidenceRefs` list of nonblank strings. `status` is `proposed` or
`accepted`. An accepted statement also requires a nonblank `acceptanceRef` string;
a proposed statement must not carry one. References are recorded text, not
instructions or paths to open.
A bare-null statement is invalid; use `value: null` where the field allows it.

Apply these value rules:

- Component purpose and grouping reason are nonblank text. Membership contains
  a nonempty `paths` list and optional `excludePaths`. Selectors are safe relative
  paths or subtrees ending in `/**`. Other globs and symbol selectors are not
  supported in this release. Check the selector syntax, not which files it matches.
- A component parent or an item owner names a component or is null. A component
  can omit its parent. Reject unknown IDs and parent cycles. Do not infer ownership
  from paths or from display position.
- Interface public access is a nonempty list of nonblank strings or null.
  Allowed consumers is a nonempty list of distinct component IDs or null. An empty list is not an
  alternative spelling of unknown policy in this profile.
- Interface promises contain exactly `behavior`, `data`, `errors`, and `lifecycle`.
  Their values are nonblank text or null. The whole promises value may be null.
- Resource identity and access rules are nonblank text or null. Rule subject,
  expectation, and check values are objects or null; an empty object is valid.
  Preserve rule data without interpreting its expressions or running its check.

Reject unknown fields outside the rule-value objects. Preserve null, empty, and
absent values as distinct values. Unsupported versions or selector forms need
explicit errors; do not drop fields or guess replacements.

These checks establish that a baseline is **valid for viewing**. They do not
prove source ownership, rule compliance, evidence availability, acceptance
authority, or completion of an analysis run. Do not require the producer's
first-version, proposed-only, nonempty-component, or evidence-bundle conditions.
Do not require discovery questions or gaps to open a standalone baseline.

Show evidence references as **Evidence not loaded**. Show accepted statements as
**Accepted (recorded)** with their acceptance references. Keep that recorded
status separate from verification. Do not infer that a file is published merely
from its name or location.

## Diagram and details

Use ordinary named nodes for components, interfaces, and resources. This avoids
custom interface ports and gives an interface a stable endpoint even when its
owner is unknown. Reuse the current canvas and detail-panel mechanics.

| Record or relationship | Display rule |
| --- | --- |
| Component parent | Nest component groups using the recorded parent. Keep parent headers inspectable. |
| Interface owner | Show a line from the owner to the interface, labelled **provides**. |
| Allowed consumer | Show an arrow from the consumer to the interface, labelled **may use**. It is a permission, not an observed call. |
| Resource owner | Show a line from the owner to the resource, labelled **owns**. |
| Unknown owner | Keep the item visible and label its owner unknown. Add no ownership line. |
| Unknown consumers | Show **Consumer policy unknown**. Add no consumer arrows. |
| Rule | Show it in the Rules list and details. Do not turn a path expression into a diagram link or a check result. |

Show the status of the statement that defines each relationship. Keep different
statement statuses visible in details; do not give a mixed item one blanket
"accepted" label. Use text as well as visual styles to explain line meanings.

Keep every known consumer connection, including when the interface owner is
unknown. Keep distinct interfaces between the same components. Do not reject a
consumer merely because it is also the interface owner. Retain saved records
about analyzers even after Choom's own analyzer code is removed.

A fully empty baseline shows its ID and **No architecture items modeled**. When
only the component list is empty, show **No components modeled** and keep any
interfaces, resources, and rules available. Do not insert an example or start
analysis to fill missing data.

Details expose all recorded fields and references. All item kinds and the Rules
list support keyboard access. Keep focus visible after panning, preserve zoom
while inspecting, close details with Escape, and return focus to the opener.
Long details scroll inside the panel. A new baseline closes the old selection.

## Loading and limits

The load path is:

`Select file → bounded read → parse and validate → prepare layout → replace view`

Keep one active load. Store the validated baseline and its prepared layout as
one read-only current view. Keep display mapping inside the viewer/layout code;
do not introduce another saved format or a public projection service. Do not
retain the original file bytes for a deferred copy feature.

Replace the view only after validation and layout succeed. Selection cancellation,
read errors, invalid input, display limits, and layout failure keep the previous
view. Retry uses the last selection when that source can be read again. If a
browser file is no longer readable, ask the user to select it again.

Cancellation prevents that load from replacing the view. Ignore late results and
handle their completion or failure. Do not claim that cancellation immediately
stops a synchronous read or layout calculation. Cancellation after a completed
replacement does not undo it. Preserve the existing protection against mutation
through caller-held values and keep view identity stable between updates.

Reuse the existing strict UTF-8 and YAML checks, including the 16 MiB byte limit,
depth limit of 32, and 250,000 YAML-node limit. Keep rejection of aliases, anchors,
tags, duplicate keys, and multiple documents. A UTF-8 byte order mark is allowed;
preserving the original formatting is unnecessary for a read-only viewer.

Add a small, named display-limit policy before layout. Proposed initial limits
are **500 records**, **2,000 explicit links**, and **16 component levels**.
Count records across all four collections, including rules. This bounds both
the diagram and the Rules list. Count ownership and consumer links before
creating them. Parent depth is separate from YAML nesting depth.
Report **Too large to display** instead of silently omitting data.
BV-04 introduces these bounds. The final verification must measure them after
BV-05 and BV-06 complete the viewer, then record the supported values. Lower them
if needed; do not claim a performance guarantee from the parser limits alone.

## Code and removal boundaries

Keep the existing React Flow/ELK libraries, bounded YAML parser, browser file
selection, desktop file reads, and useful view/focus behavior. Replace the
[legacy document model](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/src/domain/architecture-document.ts) and the
repository branches of the [load workflow](../../src/architecture/load-workflow.ts).
Use the current source groups; no new package or service framework is needed.

Remove frontend discovery, manifest import, analyzer execution/conversion,
repository adapters, old document export, and their unused contracts and tests
when the final caller is removed. Keep parser and read helpers that the viewer
still uses. Update manifests and generated contracts in the same ticket.

The final desktop surface keeps `document_file_read` and file selection. Remove
repository and analyzer commands, snapshot commands, `document_export`, and
`document_cleanup`. Remove their services, writable document-cache state,
startup/shutdown cleanup, unused dependencies, and save/confirmation permissions.
Update [lib.rs](../../src-tauri/src/lib.rs), [build.rs](../../src-tauri/build.rs),
and [capabilities](../../src-tauri/capabilities/main.json) together. Preserve file
type, size, identity, and UTF-8 checks when separating reads from storage code.

Keep development dependency checks and the manual baseline producer. Removing
product analysis does not remove dependency-cruiser, Knip, or ts-morph where
development tools still use them. Existing component manifests still link the
repository's constraints.

## Reference fixtures

The reviewed local inputs are:

- `/Users/tomermayara/git/work-choom/analysis-run-001/baseline.yaml`: all four
  collections are empty.
- `/Users/tomermayara/git/work-choom/analysis-run-002/baselines/baseline-002/baseline.yaml`:
  5 components, 8 interfaces, 5 resources, 21 rules, and 129 proposed statements.
  Choom contains Workspace and Native shell. Workspace contains Architecture
  model and Platform adapter. All consumer policies are unknown; one resource
  owner is unknown. There must be no consumer arrows for this file.

Copy these inputs into repository fixtures during implementation. Tests must not
depend on the absolute paths above. Use small synthetic fixtures for individual
rules, including accepted statements, explicit consumers, repeated names, unknown
interface owners with known consumers, and records without components.

## Appendix: Tickets

The Gherkin below defines the required outcomes. Implementation progress and
observed test results are recorded in the [verification record](../change-requests/BV-baseline-viewer-evidence.md).

For each ticket:

1. Write the acceptance test first and make its steps runnable through the stated
   public interface or the app. Observe a failed assertion for the missing
   behavior. Undefined steps, compiler errors, or missing drivers do not count.
2. For each small TDD step, write a failing unit, interface, or integration test.
   Make it pass, then refactor with tests green. Repeat until acceptance passes.
3. Run affected tests and checks. Record the first acceptance failure, the final
   result, and any limits. Existing behavior that must remain unchanged starts
   with passing characterization tests; do not break it to create a false red.

Use the [repository test definitions](../coding-principles.md#test-types) and
[Gherkin guide](../gherkin-guide.md). Put shared fixtures outside category folders.
Add scenarios under `cookbook/behavior/baseline-viewer/` with `@baseline-viewer`
and the ticket tag. Add `@browser` or `@packaged` where applicable. Link features
from the owning manifest and register their steps/suites in the real runners.

Each ticket updates the constraints and documentation that it changes. Follow
the [new feature cookbook](../new-feature-cookbook.md). Do not add behavior tests
for documentation, scripts, or configuration. Use their relevant checks instead.

| Ticket | Result | Depends on |
| --- | --- | --- |
| [BV-01](#bv-01-validate-the-baseline) | One complete baseline validation contract. | None |
| [BV-02](#bv-02-read-baseline-files) | Bounded file input and baseline decoding. | BV-01 |
| [BV-03](#bv-03-open-a-baseline-in-the-app) | Real browser/desktop opening and safe view replacement. | BV-02 |
| [BV-04](#bv-04-show-component-hierarchy) | Nested component layout and display limits. | BV-03 |
| [BV-05](#bv-05-show-interfaces-resources-and-links) | All interfaces, resources, and explicit relationships. | BV-04 |
| [BV-06](#bv-06-inspect-records-and-rules) | Complete details, recorded status, and keyboard access. | BV-05 |
| [BV-07](#bv-07-remove-unused-desktop-operations) | Read-only desktop commands and no analyzer/storage service. | BV-03 |

Keep the existing app compiling until BV-03 switches it to baseline input. That
ticket removes obsolete frontend code as its callers disappear. Later tickets
add the full presentation to the same app path. Do not release the change until
all tickets and the final checks pass. Recheck BV-07 against the complete UI.

### BV-01: Validate the baseline

**Scope:** One TypeSpec contract and domain validator for the supported profile.
Keep shape checks and reference checks under the same owner.

**Acceptance first — `@bv-01`, browser-free:**

```gherkin
Scenario: Read recorded intent without changing it
  Given a supported baseline with proposed and accepted statements
  And its evidence and acceptance records are not available
  When a caller validates it for viewing
  Then its values, statuses, and references are preserved
  And no statement changes status

Scenario Outline: Reject invalid baseline data
  Given an otherwise valid baseline with <problem>
  When a caller validates it for viewing
  Then validation identifies the invalid item or field

  Examples:
    | problem                                     |
    | a duplicate item ID                         |
    | a parent or owner ID that does not exist    |
    | a consumer ID that does not exist           |
    | a cycle of component parents                |
    | an accepted statement without its reference |
    | an unsupported membership selector          |
```

**First failure to observe:** The current document validator rejects baseline
records because it requires analyzer data and a different model.

**TDD steps:**

1. Test the top-level fields, all four item shapes, and unknown-field rejection.
2. Test statement values/status/references, including the accepted/proposed rules.
3. Test IDs, internal references, and parent cycles. Permit repeated names,
   multiple roots, and an external baseline-version reference.
4. Test exact/subtree/exclusion selectors, null values, empty collections, and
   uninterpreted rule objects. Keep external reference resolution out of validation.

**Complete when:** The scenarios, focused domain tests, and contract checks pass.
Both reviewed files and the valid synthetic fixtures are valid for viewing.
The producer's completion checks remain separate.

### BV-02: Read baseline files

**Scope:** Use the existing bounded read and YAML facilities to produce a valid
baseline. Recognize the format by content. Do not retain bytes for copying.

**Acceptance first — `@bv-02`, browser-free input interface:**

```gherkin
Scenario: Read a renamed baseline
  Given a supported baseline saved as "example.choom.yaml"
  When its input is decoded
  Then the baseline model is returned

Scenario Outline: Reject unsupported file content
  Given a selected file contains <problem>
  When its input is decoded
  Then the result identifies the input error

  Examples:
    | problem                       |
    | invalid UTF-8                 |
    | malformed YAML                |
    | duplicate mapping keys        |
    | an unsupported format version |
    | legacy diagram content        |
    | content above the byte limit  |
```

**First failure to observe:** The current codec cannot decode baseline content.
Existing malformed-input rejection is passing characterization, not new behavior.

**TDD steps:**

1. Keep existing parser bounds and syntax protections green. Test baseline
   decoding through BV-01 without weakening the old parser protections.
2. Test useful read, encoding, version, and model errors. Include accepted UTF-8
   with a byte order mark, CRLF, and non-ASCII text.
3. Test the browser/native read results and their size/UTF-8 limits. Preserve
   the current native regular-file and identity checks.

**Complete when:** The scenarios, codec tests, and affected read-interface tests
pass. The reader neither scans source paths nor opens referenced evidence.

### BV-03: Open a baseline in the app

**Scope:** Connect file selection, reading, validation, a basic component view,
and one safe view replacement. Exercise the normal app early. BV-04 adds nested
layout; BV-05/BV-06 complete the other records and details.

**Acceptance first — `@bv-03`, browser and installed desktop:**

```gherkin
Scenario: Open a baseline without its repository
  Given only the reviewed baseline file is available
  When the user opens it in Choom
  Then its ID and five component names are shown
  And Load Repo, Choose directory, and Export Diagram are unavailable

Scenario Outline: An unsuccessful load keeps the current view
  Given Previous is displayed
  When the next load <outcome>
  Then Previous remains displayed
  And the load outcome is shown

  Examples:
    | outcome                     |
    | fails to read the file      |
    | fails validation            |
    | fails to prepare the layout |
    | is cancelled                |

Scenario: A late cancelled result cannot replace the current view
  Given an earlier load was cancelled and Current is now displayed
  When the earlier load finishes
  Then Current remains displayed
```

**First failure to observe:** The normal app still uses the legacy codec and
view contract. New decoder support alone does not connect the baseline route.

**TDD steps:**

1. Test selection, a busy second load, a valid baseline/layout pair, and one
   read-only replacement. Keep view identity stable between changes.
2. Test read/validation/layout failure, cancellation, late results, retry, and
   disposal. Test that caller-held values cannot change the current view.
3. Test controls, useful errors, and the true empty/partial-model distinction.
   Replace the example with baseline data. Remove obsolete frontend analysis,
   legacy export/model code, and tests as each final caller disappears.
4. Use the real desktop picker/read command. Adapt shared fixtures and contract
   checks without deleting native contracts still needed until BV-07.

**Complete when:** Both app-opening routes pass. The installed app opens the
file without a source checkout or Node/analyzer on its PATH; the test driver may
still use Node. Source file contents are unchanged. The basic component view is
temporary release work; full diagram acceptance remains required below.

### BV-04: Show component hierarchy

**Scope:** Extend the real app's component view with nested groups and bounded
layout. Keep mapping helpers internal and positions separate from the baseline.

**Acceptance first — `@bv-04 @browser`, through Open Baseline:**

```gherkin
Scenario: Show recorded component groups
  Given the reviewed five-component baseline
  When the user opens it
  Then Workspace and Native shell appear inside Choom
  And Architecture model and Platform adapter appear inside Workspace
  And each component name and control is reachable

Scenario Outline: Refuse excessive diagram work before layout
  Given Previous is displayed
  And the next baseline exceeds the <limit> display limit
  When the user opens it
  Then Previous remains displayed with a size-limit message

  Examples:
    | limit                   |
    | total record count      |
    | rules-only record count |
    | explicit link count     |
    | parent depth            |
```

**First failure to observe:** The basic component view has no nested layout or
display-work limits. Existing pan/zoom and resizing stay under characterization.

**TDD steps:**

1. Test parent groups, multiple roots, and parent headers. Check complete, finite
   positions and containment without asserting fixed pixel coordinates.
2. Test at-limit and over-limit record/link/depth inputs before layout starts.
   Include a rules-only baseline so that an empty diagram cannot bypass the bound.
   Add failure handling for missing or invalid positions.
3. Test readable group sizes, fit-to-window, pan/zoom, and small/large windows.
   Measure component layout at the proposed limits. Final measurements follow
   the complete rendering work in BV-05 and BV-06.

**Complete when:** Browser scenarios and layout/DOM tests pass. Every component,
including a parent, remains inspectable. All four record counts already enter
the limit checks, even though later tickets complete the interface/resource
display and Rules list.

### BV-05: Show interfaces, resources, and links

**Scope:** Add interface/resource nodes and the three labelled relationship kinds.
Use their model IDs as endpoints. Do not infer links from rule data or prose.

**Acceptance first — `@bv-05 @browser`, through the real app:**

```gherkin
Scenario: Show all records from the reviewed baseline
  Given the reviewed baseline
  When the user opens it
  Then its eight interfaces and five resources are visible with their recorded owners
  And the resource with no owner remains visible
  And all consumer policies are unknown with no consumer arrows

Scenario: Keep known consumers when an interface owner is unknown
  Given an interface has no known owner and explicitly permits Checkout
  When the user opens that baseline
  Then the interface is visible without an ownership line
  And Checkout has a "may use" arrow to that interface

Scenario: Keep records when there are no components
  Given a baseline has no components but has an unowned interface and resource
  When the user opens it
  Then both records remain available and no component is invented
```

**First failure to observe:** The component view does not yet render interfaces,
resources, or their relationships.

**TDD steps:**

1. Test complete item mapping and distinct provides/owns/may-use links. Preserve
   separate interfaces between the same components and self-consumer policies.
2. Test null owners/consumers without inventing endpoints or dropping known data.
   Keep saved analyzer-related records visible.
3. Test relationship status labels and readable layout after adding owned items.
   Use text as well as style; pass recorded fields unchanged to inspection.

**Complete when:** The scenarios and focused mapping/rendering tests pass.
The full fixture has 18 visual items and no consumer arrows. All known relationships
can be traced to the corresponding owner or consumer statement.

### BV-06: Inspect records and rules

**Scope:** Complete item details, the Rules list, status/reference display, and
keyboard access. A valid input or recorded check is not a verified result.

**Acceptance first — `@bv-06 @browser`, through the real app:**

```gherkin
Scenario: Read a recorded rule without evaluating it
  Given a baseline rule has an empty subject object and a recorded check
  And its evidence files have not been loaded
  When the user inspects the rule
  Then its data and statement statuses are readable
  And evidence is marked not loaded with no pass or fail result

Scenario: Keep rules when no components are modeled
  Given a baseline has rules but no components, interfaces, or resources
  When the user opens its Rules list
  Then every recorded rule is available

Scenario Outline: Inspect an item with a keyboard
  Given a baseline contains a <kind>
  When the user opens its details with a keyboard
  Then its recorded fields are readable

  Examples:
    | kind             |
    | parent component |
    | leaf component   |
    | interface        |
    | resource         |
    | rule             |

Scenario: Return focus after inspection
  Given an item's details were opened with a keyboard
  When the user closes them with Escape
  Then focus returns to the item's control
```

**First failure to observe:** Existing details describe imports and analyzer
results. The new view does not yet expose all baseline fields and rules.

**TDD steps:**

1. Test all fields, including membership/exclusions, promises, unknown values,
   nested rule data, and all 21 rules in the reviewed fixture.
2. Test mixed proposed/accepted statuses and acceptance/evidence references.
   Do not run expressions, open a checkout, or load companion files.
3. Test accessible names, activation, focus after panning, Escape/focus return,
   zoom preservation, long details, and closing old details after replacement.

**Complete when:** App scenarios and DOM tests pass for every item kind.
The user can distinguish recorded intent, missing evidence, and unknown values.

### BV-07: Remove unused desktop operations

**Scope:** Keep bounded selected-file reads. Remove repository/analyzer commands,
snapshot/write commands, writable caches, and their unused lifecycle code.
Do not add a command-enumeration API just to test this removal.

**Acceptance first — `@bv-07 @packaged`, through actual host commands:**

```gherkin
Scenario Outline: A retired desktop operation is unavailable
  Given the installed baseline viewer is running
  When a caller requests retired operation "<operation>"
  Then the host reports that the operation is unavailable

  Examples:
    | operation                 |
    | repository_open           |
    | repository_read_text      |
    | repository_resolve_paths  |
    | repository_close          |
    | depcruiser_prepare        |
    | depcruiser_run            |
    | depcruiser_cancel         |
    | depcruiser_release        |
    | document_snapshot_create  |
    | document_snapshot_read    |
    | document_snapshot_release |
    | document_export           |
    | document_cleanup          |
```

**First failure to observe:** These operations are still registered. A request
or session error from a registered command is not an unavailable-command result.

**TDD steps:**

1. Test rejection through the host interface for each retired command family.
   Remove registrations, permissions, and service wiring with those tests green.
2. Keep selected-file read and error behavior green while removing cache/storage
   owners and shutdown cleanup. Add a failing interface test first if the read
   contract must change.
3. Remove unused code, contracts, generated permissions, dependencies, old fixtures,
   and analyzer CI setup. Use build/contract checks for configuration changes.
   Re-run the installed baseline-opening scenario after each relevant removal.

**Complete when:** Retired commands are unavailable, the real installed viewer
still opens baselines, and Rust/desktop checks pass. File selection and bounded
reads remain; no analysis or document-write capability remains in the product.

## Final verification

This checklist is a release gate, not another feature ticket. Do not invent a
failing test for work that earlier tickets already completed.

- Run all baseline-viewer scenarios through their applicable native, browser,
  and packaged profiles. Use `@bv-01` through `@bv-07` for focused runs, with
  `bun run test:behavior`, `bun run test:e2e`, or `bun run test:behavior:packaged`.
  Add `--tags @baseline-viewer` for the complete feature group.
- Verify the final real app with the full 5/8/5/21 fixture, the fully empty file,
  and the synthetic cases for accepted intent, explicit consumers, unknown owners,
  repeated names, and records without components. Preserve the current view on
  errors, cancellation, and display-limit failures.
- Measure the complete viewer at the proposed limits with mixed records, many
  links, deep groups, and rules-only files. Record the environment, load and
  interaction timings, and final supported limits. Recheck the limits if lowered.
- Run changed focused suites, `bun run test`, `bun run check`,
  `bun run check-types`, and `bun run build`. Regenerate TypeSpec outputs when
  contracts change and run `bun run check:contracts`.
- For Rust, run `bun run test:rust`, `bun run desktop:lint`, and
  `bun run desktop:build`. Install Chromium before browser checks. Use the
  installed-application prerequisites for packaged checks; browser doubles do
  not replace that evidence.
- Update README, the older design's compatibility text, constraint links,
  generated outputs, dependency checks, and CI. Keep historical evidence marked
  as historical. Review the full diff and all document links.
- Run `bun run habit-hooks --all`, report findings or environment limits, and
  keep the snooze file empty. Complete required constraint reviews before merge.

Report behavior evidence separately from build, type, lint, and document checks.
If a ticket needs further division, give each child one observable outcome and
its own acceptance/TDD steps. Keep the complete release outcome above unchanged.
