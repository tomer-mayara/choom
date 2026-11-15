# CR-003: Show system entry points on the architecture plot

**Status:** Approved for implementation. Work is in a draft PR stack; merge
review remains open.

**Date:** 2026-11-14

**Scope:** Saved baselines, the manual baseline producer, and the browser and
desktop viewer.

## Goal

The plot shows components and saved connections. It does not show where a
program starts or where an outside call enters a running program. Add markers
for both kinds of system entry point. A system can have many entry points. A
component can have both kinds.

Save each entry point as a separate fact. Show counts on the component that
receives the entry. For example, save 20 HTTP routes as 20 entries, then show
one **External 20** marker on their component. The component details list all
20 routes.

The viewer reads the saved facts. It does not scan source, call an endpoint, or
trace execution. Existing arrows keep their current meaning: permission in
baseline versions 1 and 2, and reviewed source use in versions 3 and 4.

## What counts as an entry point

| Kind | Meaning | Record one for |
| --- | --- | --- |
| **Startup** | A host starts a program or app. | Each distinct start path, such as a CLI, web app, desktop app, or worker. Command aliases to the same start path share one entry. |
| **External** | An outside caller invokes a running program. | Each callable operation, such as an HTTP method and route, MCP operation, webhook, message subscription, or external scheduler callback. |

For example, `HTTP POST /orders` is one entry for the route pattern, not one
entry per request. Two routes that use one handler are two entries. An MCP
server can have a startup entry and one external entry for each exposed tool.
If a scheduler launches a new process, record its bootstrap as Startup. If it
calls a handler in a running process, record that call as External.

“External” means outside the **modeled system**. It does not mean public on the
internet or free of authentication. An import or a call between components is
not a system entry point. A file named `main.ts`, a Knip candidate, and a graph
root can suggest an entry. None proves one on its own. The producer must review
the launch or registration evidence. A recorded entry does not prove that a
deployment is live or that a call ran.

Include application and operational tools that belong to the saved system
scope. Treat test runners and build scripts as outside this feature unless the
baseline explicitly models them as system runtime surfaces. Record included
tooling in the review scope.

Each Startup entry names the component that owns its start code. Each External
entry names the component that owns its registered handler. Do not mark
downstream components or copy a child's marker to its parent. Either kind may
link to a modeled interface operation. That link
does not change the interface owner or copy its contract into the entry record.

The viewer already uses **Entry points** as a heading for entries *inside an
interface*. Rename that heading **Interface entries** when adding **System
entry points**. The two terms must stay distinct in the UI and documentation.

## Saved baseline

The [baseline model](../../cookbook/interfaces/baseline.tsp) is strict through
version 3. Add `formatVersion: 4` with an optional top-level
`systemEntryPoints` object. Version 4 keeps version 2 interface documentation
and optional version 3 `sourceUsage`. Version 4 with no `sourceUsage` shows no
source arrows. Versions 1 through 3 keep their exact fields and behavior.
There is no automatic migration. An older viewer reports version 4 as
unsupported.

`systemEntryPoints` is optional. Its absence means **not recorded**. When the
object is present, it states what the producer reviewed. An empty entry list
means that no supported entries were found *in that scope*. It never means
that the whole system has no entry points. The producer keeps unresolved
candidates in discovery, not in the baseline.

### Proposed record

`systemEntryPoints` has these fields:

- `snapshotRef` and `mappingRef` name the saved snapshot and code mapping. If
  `sourceUsage` is also present, both objects must name the same snapshot and
  mapping.
- `scope`, `evidenceRefs`, and `limitations` state what was reviewed and what
  remains unknown. Scope evidence is nonempty. The limits list may be empty.
- `entries` holds the supported entry points in saved order.

Each entry has a unique local `id`, a `kind` of `startup` or `external`, a
`label`, a `path`, a `componentId`, and nonempty, distinct `evidenceRefs`. The
label identifies the start or call selector. Examples are `CLI choom serve`,
`HTTP POST /orders`, and `MCP tool search`. `path` names the saved start or
handler file. `componentId` names its direct component owner.

An entry can also have these fields:

- `source: { evidenceRef, location }` uses the existing source-location shape:
  snapshot ID, relative path, file digest, and line range. Its evidence
  reference must be a direct source-record reference without a fragment and
  must occur in the entry evidence. Its path must equal the entry `path`.
  Omit `source` when no single reviewed range identifies the boundary.
- `interfaceId` links to a modeled interface. `entryId` can link to one of that
  interface's documented entries. An `entryId` requires `interfaceId`. Both
  Startup and External entries can have this link.

The single label replaces separate name, protocol, and trigger fields. The
interface link does not repeat `publicAccess`. The required path identifies
the file and its mapped owner. Add `source` when one reviewed range identifies
the start or handler. The entry still needs evidence for its trigger when
there is no such range.

Reject unknown fields, duplicate entry IDs, unknown component or interface IDs,
invalid interface links, duplicate evidence references, unsafe paths, and
invalid source locations. If `source` is present, its snapshot must match
`snapshotRef` and its path must match the entry path.
If `sourceUsage` is also present, reject mismatched snapshot or mapping refs.
The producer checks the saved evidence and direct ownership against the
selected file mapping. The entry path must map to its `componentId`.
Registration evidence in another component can remain in `evidenceRefs`. The
viewer checks the record's structure and internal links.
It cannot open the evidence bundle or check the live source. The interface
owner can differ from the handler component; the producer must review that
binding instead of forcing the IDs to match.

These are recorded entry facts, not accepted architecture intent. Do not add
`proposed` or `accepted` status to them. Show their scope and evidence, and
do not describe them as verified runtime calls.

Limit the assessment to 2,000 entries and 2 MiB of compact JSON. Limit each new
ID, evidence reference, and source path to 4 KiB of UTF-8. Limit each label,
scope, and limitation to 8 KiB. The existing YAML input limit is 16 MiB.
Entries add no graph nodes or links, so they do not count toward the existing
500 architecture-record limit. Reject a file that exceeds a limit; do not hide
or drop its entries.

## Producer work

1. Keep Stage 2 focused on **file entry candidates**. It already considers
   application starts and published APIs. Do not turn each HTTP route or MCP
   tool into a Stage 2 file candidate.
2. In Stages 4 and 5, inspect launch settings and behavior entries. Review the
   registration or host binding for each external operation. Trace a built
   entry file to source only when the saved evidence supports that link. Use
   the selected file mapping to identify the direct component owner. The
   current producer maps whole files, not parts of files. Keep uncertain
   triggers, files, and owners in discovery as questions or gaps.
3. Review all identified start paths and callable operations in the saved
   system scope. Make one baseline entry for each supported one. Reuse saved
   candidate and behavior-entry evidence. Record exclusions and unresolved
   entries as limits or gaps. A graph root or an interface `publicAccess`
   string is not proof of an entry. Link an entry to its interface operation
   when the evidence supports the link.
4. At Stage 6, check the new records against the selected snapshot, mapping,
   evidence registry, and baseline. Update the
   [record format](../design/app-a/record-format.md), stage cookbooks, and
   publication checks. Save version 4 when an entry assessment is present.
   When it is absent, keep the version required by the other saved fields.
   Leave completed runs unchanged.

The producer inspects saved material. It does not start the target program,
call endpoints, or claim that it found every entry outside its stated scope.

## Viewer work

- Show **Startup N** and **External N** on each component that directly owns
  entries. Show both when needed. Use words and distinct visual accents; color
  alone must not carry the meaning. Keep selection, focus, and existing
  duplication markers clear.
- Keep entry markers visible in both connection modes. Explain them in the
  legend, apart from connection arrows. Do not add a synthetic outside actor
  or a new arrow. State that markers cover the saved review scope, not every
  possible runtime path.
- In component details, group entries by kind. Show each label, path, and
  evidence reference. Show the line range and link to a modeled interface
  operation when present. Keep all entries available, including long lists.
- Show the review scope and limits in Baseline details. Make the coverage state
  visible near the plot: **Entry points not recorded** when absent, **No entry
  points found in this scope** for an empty assessment, and **Review has limits**
  when the limits list is not empty. A component with no entry must not imply
  that the whole system was checked.
- Keep full accessible names, keyboard selection, focus restoration, zoom, Fit
  view, movement, and narrow layouts. If badges do not fit, update the shared
  component geometry and its layout checks. Do not clip names or badges.

Opening a valid version 4 baseline remains one view commit. Invalid data,
cancellation, and late results leave the current view in place. The viewer
needs no source checkout or evidence bundle. Use a version 4 acceptance
fixture to show the new behavior; the existing built-in example need not change.

## Compatibility and delivery

Update TypeSpec, generated contracts, runtime validation, the YAML decoder,
and the display limits together. Audit every version 3 check in source-use
validation, arrows, notices, and interface details so version 4 keeps the
version 3 source-use behavior. Extend the duplication report's baseline-version
binding to 4. Keep its ID and original-file-digest checks. Old baselines and
their attached reports retain their behavior.

For each ticket, add failing Gherkin scenarios for the user outcomes before
implementation. Then use focused TDD tests for the new baseline contract and
viewer behavior.
Review the [four feature constraints](../new-feature-cookbook.md). The behavior
feature and TypeSpec contract will change. Update their `component.yaml`
links and CI registration. Change an architecture rule or OpenSLO only if this
work changes that constraint. Human review of changed constraint artifacts is
required before a later merge.

Implement in this order:

1. Agree on the version 4 record and write its behavior scenarios.
2. Add the contract, decoder, limits, and version compatibility.
3. Update the producer review and publication steps. Check a small saved run
   with one startup, two HTTP routes on one component, one MCP operation, and
   one unresolved candidate. Test the published data contract through the
   producer's public output. Check source and artifact evidence separately.
4. Add the plot markers, detail list, coverage notice, and interface-heading
   rename. Check the browser and packaged desktop routes.
5. Review the complete change and update README and contract notes. Record
   actual check results and any limits before a later merge request.

Acceptance must show that:

- Multiple Startup and External entries count on their direct component.
  A parent does not inherit a child's count. A component can show both kinds.
- Distinct HTTP routes and MCP operations stay separate even when they share a
  handler. Each saved entry is available in component details.
- The existing **Interface entries** section remains distinct from **System
  entry points**. A supported link opens the matching interface operation.
- Old baselines still open with their current arrow meaning. Version 4 keeps
  source-use arrows only when it has `sourceUsage`.
- Missing, empty, and limited assessments have distinct messages. An
  unresolved candidate does not produce a marker.
- Invalid entry data or an exceeded limit rejects the whole file and keeps the
  current view. A valid file opens without source or evidence files.
- Badges, details, and counts work with a keyboard and assistive technology at
  the supported narrow viewport.

Run the affected tests and the complete `bun run test`,
`bun run test:behavior`, and `bun run test:e2e` suites. Run
`bun run contracts:generate`, `bun run check:contracts`, `bun run check`,
`bun run check-types`, `bun run build`, and `bun run habit-hooks --all`.
Build and test the assembled desktop route with `bun run desktop:build` and
`bun run test:behavior:packaged`. If Rust changes, add its tests, formatting,
and Clippy checks. A build or type check alone does not verify behavior.

## Appendix: Tickets

The scenarios below specify the six implementation tickets. The CR itself does
not change product behavior. At the start of
each ticket, add and run its acceptance test. Put Cucumber scenarios in the
relevant feature file.
Put the decoder cases in `cookbook/behavior/baseline-viewer/system-entry-points.feature`
and the browser cases in a browser-tagged feature in the same folder. Add the
fixtures and step definitions needed to reach the public behavior. Confirm that
the test fails because product behavior is missing, not because a step is
undefined or setup failed. Keep existing passing scenarios green. The producer
ticket uses a public output test as an equivalent executable specification.

For every numbered TDD step, follow the same sequence: add the focused test and
see it fail; make the smallest change that passes it; refactor with the test
green. Use the test category shown in the step. Keep shared fixtures under
`test/support/` or `test/fixtures/`. Put step definitions under `test/steps/`.
Link new feature files from the owning `component.yaml` and register new test
paths with the appropriate runner. Run the ticket's focused tests before the
full checks listed above.

### EP-01: Read and validate version 4 entries

**Acceptance first** — add a browser-free Cucumber scenario under
`cookbook/behavior/baseline-viewer/`:

```gherkin
Scenario: Read saved system entry points
  Given a valid version 4 baseline with a Startup and an External entry
  And no source repository or evidence bundle is available
  When the public baseline decoder reads the file
  Then it returns both entries with their paths and interface links

Scenario Outline: Reject invalid system entry data
  Given a version 4 baseline with <problem>
  When the public baseline decoder reads the file
  Then it reports the invalid entry field

  Examples:
    | problem                                    |
    | an unknown component                       |
    | a source path different from its entry path |
    | a mapping ref different from source use     |
    | more than 2,000 entries                    |
```

**First failure:** The decoder reports version 4 as unsupported.

**TDD steps:**

1. **Red, interface:** A version 4 object with required entry fields fails the
   public baseline schema. **Green:** Add the TypeSpec record, generated types,
   and runtime schema. **Refactor:** Reuse version 2 and 3 fields without
   weakening their strict schemas.
2. **Red, interface:** Unknown component or interface IDs, duplicate entry IDs,
   unsafe paths, and bad source links are accepted. **Green:** Add the record
   checks. **Refactor:** Keep reference checks in one domain owner.
3. **Red, interface:** Entry data over its count, text, or byte limit is
   accepted; entry and source-use refs can disagree. **Green:** Enforce the
   limits and shared snapshot and mapping rule. **Refactor:** Keep the checks
   separate from the existing core-record and source-use budgets.
4. **Red, interface:** A valid version 4 YAML file is rejected by the public
   decoder. **Green:** Recognize version 4 and return the saved entries.
   **Refactor:** Preserve safe field errors and strict versions 1 through 3.

Keep the existing version 1 through 3 decoder cases green as characterization.
Finish this ticket when the new Cucumber scenario and focused interface tests
pass. No plot marker is required yet.

### EP-02: Publish reviewed entries from the producer

**Acceptance first** — add an equivalent executable specification in
`test/interface/entry-points/producer-publication.test.mjs`. It runs a frozen
producer packet through the public publication command and checks the saved
result:

```gherkin
Scenario: Publish supported entry points
  Given a saved run with a CLI start, two HTTP routes, and an MCP tool
  And its mapping and entry evidence are registered
  And one unresolved candidate is recorded as a gap
  When Stage 6 publishes the baseline
  Then the version 4 baseline contains four entries with direct owners
  And the unresolved candidate remains in discovery without a plot entry
  And the public baseline decoder accepts the saved file
```

**First failure:** Stage 6 rejects the version 4 field.

**TDD steps:**

1. **Red, interface:** The publisher rejects a valid entry assessment.
   **Green:** Accept its exact fields and save version 4. **Refactor:** Reuse
   the existing evidence registry and version checks.
2. **Red, interface:** A path mapped to another component, a missing path, or
   a stale snapshot or mapping ref can pass publication. **Green:** Check each
   entry against the selected file mapping and run. **Refactor:** Keep file
   ownership checks in the existing mapping owner.
3. **Red, interface:** Empty or unregistered entry evidence, or an invalid
   optional source or interface link, can pass publication. **Green:** Check
   the evidence registry and links. **Refactor:** Reuse source-range checks
   where they already exist.

Update the Stage 2 and Stages 4–6 instructions after these tests pass. Stage 2
still records file candidates; the later review records operations. A manager
reviews whether the cited evidence really supports each entry. The test checks
the public output and deterministic rules, not the LLM's judgment or private
script steps.

### EP-03: Preserve source-use behavior in version 4

**Acceptance first** — add a browser Cucumber scenario:

```gherkin
Scenario: Show version 4 source use without permission arrows
  Given a version 4 baseline permits Admin to use an interface
  And it records Checkout as a source consumer of that interface
  When the user shows all connections
  Then the plot shows Checkout's source-use arrow
  And it shows no Admin permission arrow

Scenario: Read version 4 source consumers
  Given a version 4 baseline records Checkout as a source consumer
  When the user reads that interface
  Then the interface details name Checkout as a source consumer
```

**First failure:** Version 4 takes the older permission-arrow path and hides
source-use details.

**TDD steps:**

1. **Red, unit:** Version 4 with source use produces permission arrows, or
   version 4 without source use produces fallback arrows. **Green:** Apply the
   source-use arc rule to versions 3 and 4. **Refactor:** Share one version
   predicate across affected arc decisions.
2. **Red, interface:** Invalid version 4 `sourceUsage` passes validation.
   **Green:** Run the existing source-use checks for version 4. **Refactor:**
   Keep one source-use validator for both versions.
3. **Red, DOM unit:** Version 4 interface panels omit recorded source users or
   show version 1 and 2 wording. **Green:** Update the panel and notice gates.
   **Refactor:** Remove repeated version checks where one source-use decision
   can serve the same behavior.

Finish with the browser scenario and the existing version 3 source-use
scenarios green.

### EP-04: Bind duplication reports to version 4

**Acceptance first** — add a browser Cucumber scenario:

```gherkin
Scenario: Attach a report to its exact version 4 baseline
  Given a version 4 baseline is open
  And a duplication report names its ID, format version, and original-byte digest
  When the user opens that report
  Then its findings are available
```

**First failure:** The report contract rejects baseline version 4.

**TDD step:**

1. **Red, interface and integration:** Tests for decoding and attaching an
   exact version 4 report fail. **Green:** Extend the report's TypeSpec and
   runtime baseline-version binding. **Refactor:** Keep the existing ID and
   digest checks in one place. Include wrong-version and wrong-digest cases
   in the same focused test set.

Keep report binding for versions 1 through 3 green. Finish when the browser
scenario passes without loosening byte identity.

### EP-05: Mark direct components on the plot

**Acceptance first** — add a browser Cucumber scenario:

```gherkin
Scenario Outline: Show entry counts in <mode> connection mode
  Given a version 4 baseline has one Startup and three External entries
  And the External component sits inside a parent group
  When the user views the plot in <mode> connection mode
  Then the direct components show Startup 1 and External 3
  And the parent has no inherited entry marker

  Examples:
    | mode     |
    | Selected |
    | All      |

Scenario: Explain entry markers
  Given a baseline has Startup and External entries
  When the user views the plot legend
  Then it distinguishes both markers from connection arrows

Scenario Outline: Explain entry review coverage
  Given a baseline whose entry review is <state>
  When the user views the plot
  Then the plot says <message>

  Examples:
    | state                    | message                             |
    | not recorded             | Entry points not recorded           |
    | empty in its stated scope | No entry points found in this scope |
    | recorded with limits     | Review has limits                   |
```

**First failure:** The plot has no entry markers.

**TDD steps:**

1. **Red, unit:** A projection cannot count entry kinds by direct component,
   or it includes child entries in the parent. **Green:** Build the counts from
   saved `componentId` values. **Refactor:** Keep the projection independent
   of rendering and connection filters.
2. **Red, DOM unit:** Component controls omit the two labels and accessible
   counts. **Green:** Render the badges and their accessible text. **Refactor:**
   Keep the component control as one keyboard target.
3. **Red, DOM unit:** Missing, empty, and limited assessments have no distinct
   plot notice. **Green:** Add the coverage text and legend. **Refactor:** Reuse
   the saved scope state in both the plot and Baseline details.

Run the browser scenario at normal and narrow sizes. If badges need more
space, update the shared component geometry and its layout checks. Keep the
existing movement, Fit view, and connection scenarios green.

### EP-06: Inspect entries and follow interface links

**Acceptance first** — add a browser Cucumber scenario and run its user path
in the packaged desktop app:

```gherkin
Scenario: Read every entry on a component
  Given a component has one Startup and twenty External entries
  When the user reads that component's details
  Then all twenty-one entries and their saved paths are available

Scenario: Follow an entry to its interface operation
  Given a component entry links to a documented interface operation
  When the user follows that entry's interface link
  Then the matching operation opens under Interface entries
```

**First failure:** Component details have no system entry list or link.

**TDD steps:**

1. **Red, DOM unit:** Component details omit grouped entries, paths, optional
   line ranges, or evidence references. **Green:** Render the saved facts.
   **Refactor:** Share the existing record display controls where they fit.
2. **Red, integration:** Following an `entryId` link does not open that exact
   interface operation and return to the prior component view. **Green:** Use
   the current inspection navigation. **Refactor:** Keep one Back path.
3. **Red, DOM unit:** A whole-interface link fails to open the overview, or an
   entry without a link shows a dead control. **Green:** Handle both optional
   link cases. **Refactor:** Keep system entry navigation separate from
   interface-entry selection.

Finish with the browser and packaged desktop journeys, including keyboard
selection and the narrow viewport. Rename the existing interface heading to
**Interface entries** as part of making the second scenario pass. Preserve the
complete entry list at the saved limit.

This CR defines the approved scope. It does not by itself approve changed
constraint artifacts or a merge.
