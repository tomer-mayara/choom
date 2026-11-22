# Choom

Choom displays saved architecture baselines. Open a `baseline.yaml` in the
browser or desktop app to view its recorded model. The file can have another
YAML name. Choom recognizes its content and does not need the source repository,
evidence files, Node.js, or an analyzer to open it.

The app is read-only. It does not run repository analysis, accept proposals,
change the selected file, or export a diagram. Recorded statement values,
statuses, and references keep their meaning.

The drawing shows the saved component hierarchy. A side panel provides complete
component, interface, and resource details. The Rules list keeps recorded rule
data available without running checks. The desktop host provides file selection
and bounded file reading. See the [viewer plan](docs/design/cr-baseline-viewer-plan.md)
and
[verification record](docs/change-requests/BV-baseline-viewer-evidence.md) for
completed checks and platform limits.

The [readability plan](docs/design/cr-baseline-viewer-readability-plan.md) and
[readability checks](docs/change-requests/BR-readability-evidence.md) cover the
component overview, side panel, interface arcs, movement, and layout controls.
The [interface-arc checks](docs/change-requests/BR-interface-arcs-evidence.md)
record BR-07 acceptance and its platform limits.
The [connection-readability checks](docs/change-requests/BR-connection-readability-evidence.md)
record BR-08 acceptance for connection scope, labels, self-connections, and Fit.

The [manual analysis design](docs/design/llm-led-architecture-analysis.md) and
[producer cookbook](docs/design/app-a/start-here.md) describe a separate workflow
that creates baselines and evidence. Opening a baseline does not start that
workflow.

## Set up

Use **Bun 1.4.4**, **Node.js 26.13.0**, and **Rust 1.99.1**. Versions are pinned in `.bun-version`, `.node-version`, `.nvmrc`, `package.json`, and `rust-toolchain.toml`. Bun manages packages and unit tests; Node runs development CLIs. Rustup installs the pinned Rust toolchain when a Cargo command runs.

```sh
nvm install
nvm use
# If Bun is not already at the pinned version:
curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile
bun run dev
```

Open <http://127.0.0.1:1420>. For the desktop shell, first install the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/), then run:

```sh
bun run desktop
```

## Read a component baseline

Choose **Open Baseline** in the browser or desktop app. Choom accepts baseline
versions 1 through 6 in a UTF-8 file up to 16 MiB. A v6 baseline opens in
**Production**. Check the project, revision or working tree, and choose a card
to see **Provides**, **Uses** and **Evidence**. Provides lists the provider,
permitted callers, and observed outside callers. Expand a caller to inspect its
sites. A complete search can establish zero production callers. A partial
search shows **Caller coverage incomplete**.

Turn on **Show non-production** to include test components, developer tools,
examples and records whose scope is unknown. The switch also reveals original
evidence. To read a published run’s questions and gaps, choose **Discovery**,
then **Open discovery result**, and select `runs/<run-id>/discovery.yaml` from
the same run. For an older nonempty inventory, **Production scope unavailable**
means the file predates role classification. Turn on the switch to inspect
the saved inventory and its known test uses.

## Compare two saved baselines

Open the current v6 file as After. Choose **Compare with earlier baseline** and
select Before from the same project. The two SHA-256 digests identify the
files even when their local baseline IDs match. Expand a finding to see the
actual operation, rule, sites and search coverage from either side. The
selected order determines the direction for two working trees.

A **New violation** requires evidence of the crossing in After and comparable
proof of absence in Before. An existing indirect path that becomes direct
remains an **Existing violation**. **Comparison limited** identifies missing
evidence or a review that needs refresh. A policy decision can change the
result on the same snapshot. Cancel, retry or close a comparison to keep
inspecting the current file. A successful new After starts in Production.
[Comparison walkthrough](docs/design/app-a/isolation-comparison.md)

## Inspect earlier formats

The following inventory and evidence controls are available after opting in to
an older inventory.
Version 2 can add saved interface documentation. Version 3 retains those fields
and can add source-use records with a shared snapshot and code mapping.
Version 4 can also add a saved [system-entry assessment](cookbook/interfaces/baseline-system-entry-points.tsp)
for reviewed startup and external call boundaries.
Component details show the saved Startup and External entries with their paths,
evidence, and optional source lines. An interface link opens the saved operation
or interface Overview, and Back returns to the component entry.
Version 5 retains version 4 and lets a component's membership also name
symbols in a file, such as `computePrice` in `billing/invoice.ts`. Component
details list them under **Membership → Symbols**. The viewer checks their syntax.
Stage 5 checks each symbol against the saved snapshot. New project-keyed runs
carry these selectors in version 6. Try the
[symbol membership example](test/fixtures/baseline-viewer/symbol-membership.yaml).
Versions 1 and 2 keep their strict fields. An interface's **Original record** disclosure retains all saved
values, including documentation and statement references.
For versions 3 to 5, **Baseline details → Original source-use data** retains the
complete source-use object when supplied. Reading it does not fetch source
files or verify their hashes.
The [baseline contract](cookbook/interfaces/baseline.md) describes the model;
[input notes](cookbook/interfaces/baseline-codec.md) describe the file limits.
An old `schemaVersion: 1` diagram is not a baseline.

The view shows the baseline ID and nested component groups. Each component has
its name and the number of interfaces it directly owns. A saved system-entry
assessment adds **Startup** and **External** counts to direct owners in both
connection modes. A startup starts a program. An external call enters a running
program. The plot describes missing, empty, or limited coverage, and **Baseline
details** shows the saved scope, evidence references, and limits. An empty
baseline is valid.
**Explore example** opens a small baseline through the same viewer. A failed or
cancelled open keeps the current view; **Retry** uses the last selected file.
Only one open operation can run at a time. **Cancel** prevents a pending load
from replacing the current view.

The display accepts at most 500 records across all four collections, 2,000
explicit owner and consumer links, and 16 component levels. Larger inputs show
**Too large to display** and keep the current view. The
[complete viewer measurements](docs/change-requests/BV-baseline-viewer-evidence.md#complete-viewer-measurements)
record the tested workloads, timings, and limits.
Versions 3 to 5 also accept at most 2,000 source-use records, 4,000 source notes, and
2 MiB of compact JSON for the complete source-use object. These limits are
separate from the documentation and explicit permission-link limits. Invalid
source data leaves the current view intact.

The drawing starts at 100% zoom. If all components fit, it centers them. Otherwise,
it starts with the first root component in view. Pan to reach the rest, or use
**Fit view** to see the whole drawing at a smaller scale. Interface and resource
records stay in the panel. In versions 1 and 2, an arrow connects each recorded allowed
consumer to the component that owns the interface. It means the consumer may
use that interface; it does not claim that a call occurs. Several consumers
produce several arrows without increasing the owner's interface count.

Versions 3 to 5 draw saved source use from each consumer to the interface's
provider. They include value references in application and tooling code when
both components are known. Several sites for the same interface and endpoints
produce one arrow. Type, test, unknown-context, and unmapped references remain
in the saved data. A source arrow does not establish permission or execution.
If source-use data is absent, versions 3 to 5 show no arrows.

**Connections: Selected** is the default. The initial view has no arrows.
Select a component to show only arrows where it is the consumer or owner.
Selecting a parent does not include connections only between its children.
Choose **All** to see all known connections. **Show self-connections** is off
by default; turn it on to include eligible loops from a component to itself.
These choices change the drawing, not the saved facts or interface counts.

An arrow's label appears when its curve or label is hovered, its control has
keyboard focus, or its interface is open in the panel. Label backgrounds are
transparent. Tab to an arrow to reveal its name; Enter or Space opens its details.
Pointer and touch input can activate a curve directly without revealing a label
first. Complete names and recorded details remain available through the lists.

For versions 1 and 2, Choom draws an arc only when both its owner and allowed consumers are known.
It does not infer consumers. A note identifies interfaces with missing endpoint
facts; their full records remain in **Baseline details**. The reviewed
`full.yaml` fixture has eight unknown consumer lists, so it shows the note and
no arcs. To try the arc view, open the separate
[known-consumer example](test/fixtures/baseline-viewer/installed-known-consumers.yaml).
It includes two consumers of one interface and an interface used by its own owner.

Select a component or group header once to inspect it. With a keyboard, focus the
control and press **Enter** or **Space**. The side panel keeps the canvas usable;
it sits below the canvas in a narrow window. Inspection and resizing preserve
pan and zoom. Select an arc or its label to inspect the interface. With a
keyboard, focus its control and press **Enter** or **Space**. An owned-item list
keeps the selected component's connections and Back path. Selecting an arc or
opening an interface directly from Baseline details shows that interface's
connections in Selected mode. In All mode, unrelated arrows stay visible but
dimmed. **Fit view** remains available when the drawing is outside the view.

Drag a component header to move it. A parent carries its children. A child stays
inside its recorded parent and below the parent header; enclosing groups grow
to the right or bottom when needed. Arrow keys on a focused header move it by
10 diagram units. Drag unused group space to pan. Movement does not select a
record or change the saved baseline. A drag release does not open inspection.

The arrangement lasts while this view remains open. Inspection, pan, zoom,
resize, failed opens, and cancelled opens keep it. Each successful file open
starts a fresh arrangement, including reopening the same file. Closing and
reopening the example also starts fresh. A fresh view uses Selected with
self-connections off and no inspection. Failed and cancelled opens keep both
connection choices. No arrangement or connection preference is saved to disk.

**Fit view** changes only pan and zoom to show the current arrangement, including
components, shown arcs, arrowheads, and currently revealed labels outside the
view. Hidden arcs and labels do not enlarge the fit. **Reset layout** restores
the initial positions and group bounds at 100% zoom. It keeps the current
inspection, Back path, and connection choices.
Reset also ends a held press or drag. Both controls use the available canvas
beside or above the panel; they are absent when there are no components.

Component inspection lists directly owned interfaces. Select a list entry to
read its complete record; **Back** restores the originating list and entry.
**Resources** lists directly owned resources, and **Recorded details** exposes
all component fields. **Baseline details** includes metadata and lists of all
components, interfaces, and resources, including items with unknown owners.
**Rules** opens the recorded rule list.

Interface inspection starts with **Overview**. It names the provider and shows
the saved contract as readable text. Version 1 promises appear as **Behavior**,
**Data exchanged**, **Failures**, and **What changes and when it ends**. Versions 2
and 3 can add named entries and explicit interaction facts. Select an entry to read
its own description. A function or method can show a saved **Signature**, including
its parameters and return type. Choom shows the exact declaration and its own
recorded status. **Signature not recorded.** and **Signature is unknown.** are
different states. Other entry kinds do not show a Signature block. A type or data
entry does not acquire invented call details.
Unknown facts stay unknown. **Access rule** lists permitted components; it does
not report actual calls or runtime authorization. Use arrow keys, Home, or End
to change tabs. A direct interface selection starts a fresh Overview.

In versions 3 to 5, **Used by** groups saved application and tooling value references
by their direct consumer. The list covers the whole interface, even when an
entry is selected. Each site keeps its entry binding, kind, context, and
description. **Caller source** shows the saved caller note and location inline.
**Other source references** keeps type, test, unknown-context, and unmapped
references available without drawing them as connections. Internal use stays
listed when self-connections are hidden on the drawing.

Missing source data, an unassessed interface, and an assessed empty result have
different explanations. A saved assessment remains a partial source review.
**Sources** keeps its scope, limits, shared snapshot and mapping, all supporting
references, and original assessment. The access rule and interface statement
status remain separate; neither establishes runtime execution.

**Example** names the selected entry and lists its saved examples. Select a case
to read its sample and, when supplied, its input and result summary. **Detailed
result** shows the recorded output and marks excerpts. Missing parts stay
explicit. **Source-reviewed (recorded)** and **Illustrative example** describe the saved
basis; Choom does not run examples. **Copy example** copies only the selected
sample text. If copying fails, the text stays selectable for manual copying.

Changing entries or examples clears old copy feedback and closes the result.
A late clipboard response cannot change feedback for a newer choice or request.
Switching tabs preserves the current case, result disclosure, copy feedback, and
one reading position per tab. Tab controls remain reachable while scrolling.
When a panel is short, restoring or resetting its position also keeps the
focused control visible.

**Sources** starts with saved source descriptions and the locations supplied by
the baseline. It does not fetch or verify source files. Expand **Recorded
statements** for field paths, statuses, and acceptance references. **Evidence
references** lists each saved ID once with all the statements that cite it.
Evidence content is not included. **Original record** retains every saved
interface value; it does not preserve YAML comments or formatting. Overview and
Sources disclosures keep their open state across tab and entry changes. Back
returns to the opening list and row. A failed or cancelled baseline replacement
keeps the current inspection; a successful replacement starts a new session.

**Escape** first cancels an active drag and restores its starting positions and
bounds. An interrupted drag does the same. Otherwise, Escape closes the expanded
rule containing focus, then the panel on the next press. Closing the panel
returns focus to its opener if focus was inside the panel and the opener is
shown. In All mode, a loop hidden and shown again can receive focus as the same
connection. If the arc opener is absent, focus returns to its owner’s header. The
same fallback applies when closing removes a focused arc outside the panel;
focus on other surviving controls stays there. A new baseline closes the old
inspection path. If focus was in the replaced view, it moves to the new baseline
heading. Keyboard focus and movement reveal the component name without changing
zoom, even when a header or arc label is wider than the canvas.

Details keep all recorded fields, including statement status, evidence references,
and acceptance references. **Accepted (recorded)** describes the saved status;
it is not a verified result. References remain plain text. Component, resource,
and rule records mark them **Evidence not loaded**. Unknown values, omitted
fields, and empty objects or lists stay distinct.
Choom does not load referenced files or execute recorded checks.

## Duplication review

After opening a saved baseline, choose **Duplicates**, then **Open duplication
report** (**Open report** in narrow windows). Select the report published by the external assessment. Its baseline
ID, format version and SHA-256 must match the original baseline file bytes.
Report version 1 can bind to baseline versions 1 through 6.
Reformatting a baseline requires a new bound report. Browser file reading needs
HTTPS or loopback for SHA-256; the desktop reader hashes the bytes locally.

The list shows saved review status and coverage. Component and interface counts
include directly related findings; **Show reviewed distinctions** also shows
pairs whose differences justify keeping them separate. A comparison shows the
overlap, differences, supported facts and evidence references. Structural
similarity is not a measure of behavioral equivalence. **Inspect A/B** opens the
interface, and entry-observation actions open the exact recorded entry. **Back**
restores the previous reading position and filter.

An invalid report leaves the current view and attachment intact. **Remove
report** clears the attachment; it does not change either file. A successful
baseline open starts a new session without a report. The example needs to be
replaced by a saved baseline before a report can attach. The viewer does not run
jscpd, fetch evidence or decide whether to consolidate interfaces.

See the [report contract](cookbook/interfaces/interface-duplication.md),
[assessment commands](docs/design/app-a/duplication-assessment.md), and
[CR-002](docs/change-requests/CR-002-duplicated-interface-detection.md).

## Discovery questions and gaps

After opening a saved baseline, choose **Discovery**, then **Open discovery
result**. Select the `discovery.yaml` of the run that saved the baseline. It must
have `formatVersion: 2`, and its `baselineRef` and `baselineDigest` must match
the ID and the SHA-256 of the original baseline file bytes. The viewer refuses
version 1, which has no digest, because an ID alone can match the wrong
baseline. Make a new run with a producer that writes version 2. The built-in
example has no file digest, so it cannot have a discovery result.

The viewer reads only the selected file. It does not open the files that the
result names, load evidence or run checks. It shows each recorded question and
gap beside the items that it names. A subject reference names an item when it
equals the item's ID or starts with the ID and a dot, such as `billing.purpose`.
A component header shows the number of recorded questions and gaps about the
component or its fields; those about its interfaces are in the interface
details. The details of each component, interface, resource and rule list the
records that name it. **Unplaced** in the Discovery panel lists the records with
a subject that names no item, such as a file. Deferred gaps have their own group,
which the reader can collapse. A gap kind that the viewer does not know keeps
its recorded text.

The lists keep their history, so the viewer says **recorded questions** and
**recorded gaps**, never open or unresolved. They are items to review, **not
defects**. Without an attachment, the viewer says **No discovery result
attached**.

The limits are 16 MiB with the parser limits of a baseline, 5,000 questions and
gaps together, 100 subject references for each, 16 KiB of UTF-8 for a text,
4 KiB for an ID or a reference, and 4 MiB for all text values together. A larger
file is refused with a message; no record is dropped. Loading follows the rules
of the duplication report: one load at a time, Cancel and Retry, and a refused
file keeps the baseline and both attachments. Opening another baseline removes
the discovery result, and **Remove discovery result** removes only the
discovery result. A duplication report and a discovery result can be attached
together.

Each proposed statement in the details panel has **Copy decision**. It copies an
`accept` entry of the [decision file](docs/design/app-a/record-format.md#decision-record)
for that statement, after a YAML comment that names the baseline ID and file
digest. To correct the value, change the action to `correct` and add `oldValue`
and `newValue`. The producer records the decision; the viewer changes no file
and not the open baseline. An accepted statement and the built-in example have
no Copy decision. A next version, which names its parent in `parentId`, has no
Copy decision either: the producer records decisions only about the baseline
that a run published, which has no parent. See
[CR-004](docs/change-requests/CR-004-discovery-in-viewer.md).

## Development commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Vite development server on port 1420 |
| `bun run build` | TypeScript 7 checks and production frontend build |
| `bun run preview` | Serve the production frontend |
| `./scripts/run_all_constraints.sh` | Run all four automated constraint validations with a pass/fail summary and diagnostic logs |
| `bun run check` | TypeSpec and implementation conformance, type checks, lint, unit tests, behavioral tests, cookbook policies, dependency boundaries, unused code, and duplication |
| `bun run test` | Native Bun and Happy DOM unit tests in separate processes, then `test:integration` |
| `bun run test:integration` | Node 26 imports `@choom/baseline-model` with no build step and validates a reviewed baseline; the producer record validator runs with the shared baseline rules |
| `bun run test:producer:docker` | Producer checks that need a Docker engine: the Stage 4 graph image and `@docker` Cucumber scenarios; not part of `bun run check` |
| `bun test` / `bun run test:watch` | Focused architecture-model tests in native Bun |
| `bun run check-types` | Alias for the native TypeScript compiler check |
| `bun run test:behavior` | Baseline and boundary Cucumber scenarios (no browser) |
| `bun run test:behavior:native` | Explicit browser-free Cucumber profile |
| `bun run test:behavior:browser` | Browser Cucumber scenarios against a fresh production build |
| `bun run test:behavior:packaged` | Linux acceptance against a freshly built and installed release package; native drivers required |
| `bun run test:e2e` | Browser Cucumber acceptance against one fresh production build |
| `bun run check:cookbook` | Component path integrity, contract ownership, and small OpenSLO Service shape |
| `bun run check:contracts` | TypeSpec format/compilation, generated-output consistency, TypeScript conformance, and runtime interface tests |
| `bun run check:dependencies` | Import boundary probes, cycles, unresolved imports, and the full frontend, baseline-model and producer dependency graph |
| `bun run contracts:generate` | Regenerate committed TypeScript contracts and JSON schemas from TypeSpec |
| `bun run analyze` | Source inventory using ts-morph |
| `bun run producer <command> [action] [arguments...]` | Run a manual producer helper through its command line on Node 26; see the [producer cookbook](docs/design/app-a/start-here.md) |
| `bun run habit-hooks --all` | Manual TypeScript and generic code-hygiene scan |
| `bun run desktop:check` | Check the Rust shell with its lockfile |
| `bun run desktop:lint` | Rust formatting and Clippy |
| `bun run desktop:test` | Rust test harness |
| `bun run desktop:build` | Build the platform's desktop bundles |
| `bun run ui:add <component>` | Run the pinned shadcn generator |
| `bun run codex --help` | Run the pinned Codex CLI |

Install Chromium once before browser tests:

```sh
bunx --no-install playwright install chromium
bun run test:e2e
```

Run the focused baseline checks with:

```sh
bun run test:behavior --tags @baseline-viewer
bun test ./packages/baseline-model/test/unit ./test/interface/domain/baseline.test.ts
bun run test:integration
bun test ./test/unit/lib/baseline-yaml.test.ts ./test/interface/lib/baseline-yaml.test.ts
bun test ./test/unit/architecture
bun test ./test/unit/lib/architecture-layout.test.ts
bun run test:dom
bun run test:e2e --tags @baseline-viewer
bun run test:e2e --tags @br-10
bun run check:contracts
```

The built-in example nests Architecture model and Platform adapter in Workspace,
and Workspace excludes their files, so each file has one direct owner. Run its
focused checks with:

```sh
bun test ./packages/producer/test/integration/records/starter-baseline.test.ts
bun run test:e2e --name "starter baseline"
```

The suite checks the example with the path rule of the producer's code mapping
check, which `pathOwners` in `code-units.ts` holds.

Run the focused side-panel checks with:

```sh
bun test --preload ./test/preload.ts ./test/unit/components/architecture-inspection.test.tsx
bun run test:e2e --tags @br-01
```

Run the focused component-overview checks with:

```sh
bun test ./test/unit/lib/architecture-layout.test.ts ./test/unit/lib/architecture-viewport.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/architecture-diagram.test.tsx
bun run test:e2e --tags @br-02
```

Run the focused component-movement checks with:

```sh
bun test ./test/unit/lib/component-arrangement.test.ts ./test/unit/lib/architecture-viewport.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/component-movement.test.tsx ./test/unit/components/workspace.test.tsx
bun run test:e2e --tags @br-03
```

Run the focused layout-control checks with:

```sh
bun test ./test/unit/lib/component-arrangement.test.ts ./test/unit/lib/architecture-viewport.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/component-layout-controls.test.tsx
bun run test:e2e --tags @br-04
```

Run the focused interface-arc checks with:

```sh
bun test ./test/unit/lib/interface-*.test.ts ./test/unit/lib/architecture-bounds.test.ts ./test/unit/lib/architecture-viewport.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/interface-*.test.tsx
bun run test:e2e --tags @br-07
```

Run the focused connection-readability checks with:

```sh
bun run test:e2e --tags @br-08
bun run test:e2e --tags @br-08a
bun run test:e2e --tags @br-08b
bun run test:e2e --tags @br-08c
bun run test:e2e --tags @br-08d
```

`bun run test:native` scans `test/unit`, `packages/baseline-model/test/unit` and
`packages/producer/test/unit` for native TypeScript suites.
`bun run test:dom` runs React suites with `test/preload.ts` in a separate process.
Keep DOM globals out of native tests. `bun test` defaults to `test/unit/domain`.
`bun run test:integration` runs `packages/baseline-model/test/integration`. It
starts the `node` on `PATH` and requires the major version in `.node-version`.
It also runs `packages/producer/test/integration/records`, where the producer
record validator runs with the shared baseline rules of `@choom/baseline-model`.
The same folder holds the suites of the `baseline decide` and `baseline next` commands,
and the suite that checks the direct owners of the built-in example.
Run all suites from the repository root.
`bun run test:producer:docker` runs `packages/producer/test/integration/docker`
and the `docker` Cucumber profile. These suites need a Docker engine and stop
with a "need Docker" message without one; the CI `producer` job runs them.
Cucumber loads `test/steps`; its default/native profile excludes `@browser`,
`@packaged` and `@docker`. `test:e2e` runs browser acceptance against a fresh
production build.
The browser runner forwards Cucumber arguments such as `--tags` and `--format`.
Failed browser scenarios retain screenshots and traces under `test-results/`.
The app ships its Inter font (see [Dependency policy](#dependency-policy)), so a
browser run draws the same text and layout on each machine, whatever fonts the
machine has. The browser driver (`test/support/baseline-viewer/browser-driver.ts`)
waits until that font is loaded before a step can measure the page, and it fails
the scenario when the app does not draw its text in that font.

Run the duplication checks with:

```sh
node --test packages/producer/test/interface/duplication/*.test.mjs
bun run test:behavior --tags '@interface-duplication or @duplication-report-codec or @di-02-03'
bun test ./test/unit/architecture/duplication-workflow.test.ts ./test/unit/domain/interface-duplication.test.ts
bun test ./test/interface/lib/interface-duplication-yaml.test.ts ./test/interface/lib/duplication-report-limits.test.ts
bun test ./test/unit/architecture/duplication-v4.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/interface-duplication.test.tsx ./test/unit/components/duplication-comparison.test.tsx ./test/unit/components/duplication-navigation.test.tsx
bun run test:e2e --tags @interface-duplication
bun run test:behavior:packaged --tags @interface-duplication
```

Run the discovery result checks with:

```sh
bun test ./packages/baseline-model/test/unit/discovery-result.test.ts ./test/interface/domain/discovery-result.test.ts
bun test ./test/interface/lib/discovery-result-yaml.test.ts ./test/interface/lib/decision-entry.test.ts
bun test ./test/unit/lib/discovery-placement.test.ts ./test/unit/architecture/discovery-workflow.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/discovery-result.test.tsx ./test/unit/components/copy-decision.test.tsx
bun run test:e2e --tags @discovery-result
```

The unit suite of `@choom/baseline-model` checks the kind, version 1, the
binding, the repeated IDs and each limit at its bound. The interface suites
compare the generated schema of the contract with the runtime schema, check the
codec outcomes and check a copied entry with `validateDecisions` of the decision
contract. The browser scenarios open a baseline and a hand-written version 2
discovery result through the real file inputs.

Run the system-entry marker checks with:

```sh
bun test ./test/unit/lib/system-entry-points.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/system-entry-markers.test.tsx
bun run test:e2e --tags @ep-05
```

Run the focused system-entry detail checks with:

```sh
bun test --preload ./test/preload.ts ./test/unit/components/system-entry-details.test.tsx ./test/unit/components/interface-overview.test.tsx
bun run test:e2e --tags @ep-06
bun run test:behavior:packaged --tags @ep-06
```

Run the Stage 6 system-entry publication check with:

```sh
bun test ./packages/producer/test/interface/entry-points/producer-publication.test.mjs
```

It opens the fixed version 4 baseline through the public decoder and checks the
producer's mapping and evidence rules against a frozen Stage 5 packet. The
[record format](docs/design/app-a/record-format.md#version-4-system-entry-points)
describes the review and publication requirements.

The Stage 6 suites run preflight, start, check, finish and verify on the Stage 6
producer fixture through the command line. They record each result, the
receipts, the prepared and fixed records, the completed run manifest with its
run summary, the refusals with their messages, a finish or verify after
ts-morph changed in a copied tool checkout, and a start or finish that
fails after it wrote files. For a failure, a fault double
(`packages/producer/test/support/doubles/stage-6-faults.ts`) runs as a Node
preload in the helper process and makes one file operation fail. Run them with:

```sh
bun test ./packages/producer/test/interface/stage-6
```

Stage 2 finish, the Stage 3 finalizer and the Stage 4/5 publisher publish their
working drafts as one update (`draft-update.ts`): they save each new draft as a
temporary file, and replace the drafts one by one, `run.yaml` last. When a step
fails before `run.yaml` is replaced, the update gives each replaced draft its
bytes from before, removes its temporary files and names each file that another
writer changed. The rollback suites use a fault double in the same way
(`packages/producer/test/support/doubles/draft-faults.ts`). Run them with:

```sh
bun test ./packages/producer/test/unit/draft-update.test.ts
bun test ./packages/producer/test/interface/stage-2/rollback.test.ts ./packages/producer/test/interface/stage-3/rollback.test.ts ./packages/producer/test/interface/stage-4/publication-rollback.test.ts
```

The same publishers register every file of the attempt folder. So each attempt
file must be a phase receipt, a file that a receipt names, or a file that the
stage names itself, such as the review packet and the command log. The
publishers refuse any other file and name it. The rule is in
`saved-attempt-files.ts`. Run its unit test with:

```sh
bun test ./packages/producer/test/unit/saved-attempt-files.test.ts
```

Stage 6 saves the fixed discovery result with `formatVersion: 2`: the reviewed
working discovery, `baselineRef`, and `baselineDigest`, the SHA-256 of the bytes
of the fixed baseline file that it saves. `fixedDiscovery` in `stage-6-records.ts`
makes the record. Stage 6 `verify` runs the shared record checks on the saved
fixed records with the bytes of the saved baseline file, and refuses a discovery
result whose baseline ID or digest does not match. The reviewed Stage 5 proposal
uses version 1. Stage 6 `finish` writes the same version 2 bytes to the run-root
and fixed discovery files. The [record format](docs/design/app-a/record-format.md#fixed-discovery-result)
gives the fields. The `@producer` scenarios save a Stage 6 result through the
command line and check its digest, and refuse a run whose discovery result names
another digest or whose saved baseline file changed. Run the focused checks of
the discovery digest with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/integration/records/fixed-discovery.test.ts ./packages/producer/test/integration/records/stage-6-records.test.ts
bun test ./packages/producer/test/interface/stage-6
```

Each Stage 6 action also checks the fixed discovery result with the discovery
contract of the viewer (`validateDiscoveryResult`), before it saves a file, and
`verify` checks the saved file again. Stage 6 writes the file as YAML without
aliases and reads the exact bytes back with the bounded YAML profile of the
viewer (`fixedDiscoveryYaml` and `readFixedDiscoveryYaml`), and `verify` reads the
saved file in the same way. So Stage 6 never publishes a result that the viewer
refuses, such as a question with another field or a file with more than 250,000
lines. The fixed-discovery suite checks the refusals of the contract, the Stage 6
refusal suite refuses a file over the YAML limits and a saved file with an
alias, and the viewer-discovery suite opens the saved result of the Stage 6
producer fixture with the viewer codec, also when its working discovery repeats
a list through a YAML alias:

```sh
bun test ./packages/producer/test/integration/records/fixed-discovery.test.ts ./packages/producer/test/integration/records/viewer-discovery.test.ts
bun test ./packages/producer/test/interface/stage-6/refusals.test.ts
```

Stages 1 to 5 check each question and gap with the same rules
(`validateQuestionsAndGaps`) where it enters the run: Stage 1 finish, Stage 2
plan and finish, the Stage 3 finalizer and the shared record checks of the
Stage 4/5 publisher. Run the focused checks with:

```sh
bun test ./packages/baseline-model/test/unit/discovery-result.test.ts ./packages/producer/test/integration/records/fixed-discovery.test.ts
bun test ./packages/producer/test/interface/stage-1/review-checks.test.ts ./packages/producer/test/interface/stage-2/plan-checks.test.ts ./packages/producer/test/interface/stage-2/finish-checks.test.ts ./packages/producer/test/interface/stage-3/finish-checks.test.ts
```

The shared record checks of Stages 4 to 6 also check that each question and gap
subject names something of the run (`SubjectChecker` in `record-subjects.ts`): a
file of the snapshot, a folder of the snapshot written as `<folder>/**`, the
snapshot ID, a question or gap, an entry candidate of an entry analysis that the
run registers or of the record that the stage checks (`entryCandidates`), or a
baseline item by the rule of the viewer (`SubjectItems`). A
gap that Stage 1 finish copied from a tool record keeps its subjects
(`isToolGap` in `stage-1-gaps.ts`). Stage 1 finish, Stage 2 plan and finish and
the Stage 3 finalizer check the records that they add in the same way. The
Stage 3 finalizer also checks the subjects of each inspection priority. Before
Stage 4 the baseline has no items, and Stage 2 adds the first entry candidates
(`SubjectChecker.beforeBaseline` and `SubjectChecker.forEntryRecord`). The
[record format](docs/design/app-a/record-format.md#ids-and-evidence) gives the
rule. They also check that each step of an inspected path cites a reviewed range
of the selected history by its ID, as a behavior entry and a resource access
observation do, so that an excerpt that no review read does not support a step.
Each component of the path must own code that a reviewed range cited by the
steps covers ([discovery](docs/design/app-a/record-format.md#discovery)). Run
the focused checks with:

```sh
bun test ./packages/producer/test/unit/record-subjects.test.ts ./packages/producer/test/unit/stage-1-gaps.test.ts ./packages/baseline-model/test/unit/subject-items.test.ts
bun test ./packages/producer/test/integration/records/stage-6-records.test.ts ./packages/producer/test/interface/stage-4/publication.test.ts
bun test ./packages/producer/test/interface/stage-1/review-checks.test.ts ./packages/producer/test/interface/stage-2/plan-checks.test.ts ./packages/producer/test/interface/stage-2/finish-checks.test.ts ./packages/producer/test/interface/stage-3/finish-checks.test.ts
```

An analysis that did not run needs a gap that cites its record. Stage 2 `run`
saves the gaps that the Knip outcomes require in `required-gaps.json`: one for a
preflight that marked the Knip profile unsupported, and one for each Knip mode
that failed or was skipped (`tool-gaps.ts`). Stage 2 finish refuses an analysis
that leaves out or changes a required gap, or that gives another question or gap
a reserved ID ([record format](docs/design/app-a/record-format.md#required-gaps)).
The Stage 3 finalizer refuses an analysis without a gap that cites the symbol
mentions record when the mentions are unavailable or skipped (`result-gaps.ts`).
The shared record checks of Stages 4 to 6 check the Knip records of the selected
entry analysis again. Run the focused checks with:

```sh
bun test ./packages/producer/test/unit/tool-gaps.test.ts ./packages/producer/test/integration/records/stage-6-records.test.ts
bun test ./packages/producer/test/interface/stage-2/required-gaps.test.ts ./packages/producer/test/interface/stage-2/finish-checks.test.ts ./packages/producer/test/interface/stage-3/finish-checks.test.ts
```

Stage 4 `collect` also saves `required-gaps.json` (`candidate-gaps.ts`). It holds
one gap for each gap that the behavior entry or resource access candidates list,
and one for a partial candidate record. The Stage 4/5 publisher refuses a Stage 4
or Stage 5 packet that leaves out or changes one of these gaps. It also refuses a
reserved ID for another question or gap
([record format](docs/design/app-a/record-format.md#required-gaps-of-the-candidate-records)).
Run the focused checks with:

```sh
bun test ./packages/producer/test/unit/candidate-gaps.test.ts ./packages/producer/test/unit/record-subjects.test.ts
bun test ./packages/producer/test/interface/stage-4/required-gaps.test.ts ./packages/producer/test/interface/stage-5/required-gaps.test.ts
```

The producer interface tests also run in `check:contracts`. The duplication tests execute the
pinned detector on saved fixtures and use recorded review inputs; they do not
call a model or prove the truth of a semantic judgment. Packaged checks require
the native driver setup described below.

Run the focused producer checks with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit ./packages/producer/test/integration/records ./packages/producer/test/interface
bun run producer --help
```

The `@producer` scenarios save a Stage 6 result from a reviewed fixture through
the producer command line, and open the saved baseline with the viewer's decoder
and display limits. They refuse a Stage 4 draft that uses the baseline ID as a
model ID. They also check that Stage 1 start records the
producer code, and that a later action refuses the run after that code changed.
They refuse a Stage 1 review whose saved LLM response holds a hidden reasoning
block, and accept a visible response. They check that the Stage 1 settings record
of a snapshot without compiler settings names the Choom parsing profile, its
assumptions and a gap. They check that the Stage 1 capture of a Git repository
records its commit and a changed file, and that a folder without Git is captured
with a gap. They search a saved snapshot with the Stage 3 text search and check
that the record lists each match with its file, line and text, the searched scope
and the ripgrep version, and that a search with no match names the searched files
and the capture exclusions. They list the exports of a snapshot file with the
Stage 3 exports action and check each kind and source range, and that a
declaration file that the compiler settings name and the capture did not save is
a gap of an open project. They ask Stage 4 inspect for the references to a
function and check the importing files with their ranges and the compiler
settings of the query, and that a computed import is an unresolved possible use
that makes the list partial. They build the Stage 4 graph of small packages and check
that a JavaScript file gets the target of the condition of its syntax, that
TypeScript that compiles to CommonJS gets the `require` target and no
`pre-compilation-only` mark, and that TypeScript that compiles to an ES module
keeps the `import` target. The unit suites check the producer code digest and record, the
command mapping, the check of the visible LLM response and the call record, the
parsing profile, the settings collector, the Git identity, the capture exclusion
rules, the installed ripgrep program, the text search, the snapshot project, the
export list, the references to a symbol and their unresolved loading sites,
the Stage 4 graph profile, the module kinds, the profile checks of the
Stage 4 graph helper and the skip reasons of the Stage 5 syntax
query. The integration suite checks the shared record validator
with the shared baseline rules of `@choom/baseline-model`: the producer profile, the
shared-rule messages, the reserved IDs, the run checks and the bounded YAML
reader. The interface suites run each helper with no
action or an unknown action, check that each stage start saves its documents and
no producer code, refuse each stage action when the run's producer code record is
missing or does not match, and run the graph fixture, Knip image check, inventory
view, recovery check and duplication start without Docker. They need `python3`
and `git` on `PATH`. Docker-based Knip and graph runs are not part of these checks.

The Stage 1 and Stage 2 interface suites run each stage through its commands on
small fixtures. Python test doubles in `packages/producer/test/support/doubles/`
take the place of `rsync` and Docker. The `rsync` double applies the capture
exclusion rules in the forms that Stage 1 uses. The Stage 1 suites run the real
Git on temporary repositories. The suites record the capture, the Git identity
record, the settings record, the Knip profile, the preflight and tool image
decisions, the Knip receipts, the finish checks, the recovery capture and the
input consolidation.
They also show that each action after start refuses the run after a producer code
file changed in a copied tool checkout. Run them with:

```sh
bun test ./packages/producer/test/interface/stage-1 ./packages/producer/test/interface/stage-2
```

The Stage 3 suite finishes a Stage 2 attempt through its commands, then runs
Stage 3 start, collect, save-review and the finalizer. It records a published
attempt, verify, and the finalizer refusals. It records the files that start,
collect, excerpt and save-review save and their refusals, and the loading search
of other source forms. It runs the text search
with the real ripgrep on a snapshot with hidden, ignored, binary, compressed,
linked and large files, and its refusals. It runs the exports action with the
real ts-morph for a configuration, the parsing profile and the fallback, with its
gaps and refusals, and shows that a later action refuses a changed ts-morph in a
copied tool checkout. Run it with:

```sh
bun test ./packages/producer/test/interface/stage-3
```

The Stage 4 start suite records the graph profile for parsed compiler settings,
for the Choom parsing profile and for the configuration-free fallback, the
snapshot preflight, and the toolchain and graph refusals without Docker. The
Stage 4 publication suite prepares a run after Stage 3, runs Stage 4 start
and the source collection, and writes the toolchain and graph receipts that need
Docker. The Stage 4/5 publisher checks, publishes and verifies the reviewed
packet, and refuses a component ID equal to the baseline ID without writing.
When it publishes, it writes the run summary, `coverage` in `run.yaml`, for the
new records: the file count of the inventory, the entry analysis and code
mapping of the attempt, the record counts of the questions and gaps, which keep
their history and linked notes, and the stages that are still pending. `verify`
makes the summary again and refuses a different one. The other publishers of
Stages 1, 2, 3 and 6 write the summary of their records in the same way
(`packages/producer/src/run-summary.ts`). Because `finish` registers every
attempt file, the publisher refuses an attempt file that no producer action
saved, in `check`, `finish` and `verify`.
The Stage 4 inspection suite runs the source collection and the excerpt action on
that attempt: each kind of source site with its lines, the parser record with the
ts-morph and TypeScript versions, the source forms, a file with a byte order mark,
the first excerpts and their skip reasons, and the refusals. It shows that a later
action refuses a changed ts-morph in a copied tool checkout.
The Stage 4 references suite runs the references action on such an attempt, and
the publication suite checks the excerpt and references receipts and a citation
of a reference.
Run the checks of the shared baseline rules in the producer with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/integration/records ./packages/producer/test/interface/stage-4
bun test ./packages/producer/test/interface/entry-points/producer-publication.test.mjs
```

The Stage 4 graph helper `stage-4-graph.ts` is TypeScript. The graph container
gets only this file, as `/producer/stage-4-graph.mts`, and Node runs it as an ES
module with type stripping. The graph helper suite runs it as a command: the
usage and tool folder refusals, and that a graph profile run always uses the tool
folder of the image. The local checks run its fixture with the checkout's
dependency-cruiser, also from a copy of the helper alone in a folder with no
`package.json`, as the container gets it. The graph passes suite runs Stage 4
start and the helper's `collect` on three small packages whose dependency has
separate import and require targets (`test/fixtures/module-kinds/`). It records
the passes and edges: the CommonJS pass gives TypeScript that compiles to CommonJS
the `require` target, and the edges of JavaScript and of ES module TypeScript keep
the condition of their syntax. The CommonJS pass suite runs the three passes on a
file with every import form, with `module: commonjs` and with `nodenext`. The unit
suites record the module kind rule (`stage-4-module-kinds.ts`), the passes and
module kinds of the graph profile, and the profile checks of the helper. The
Docker suite checks that the image runs the helper, with its CommonJS fixture
pass, and writes no stderr. Run the graph helper and module kind checks with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/stage-4-module-kinds.test.ts ./packages/producer/test/unit/stage-4-graph-profile.test.ts ./packages/producer/test/unit/stage-4-graph.test.ts
bun test ./packages/producer/test/interface/stage-4/graph-helper.test.ts ./packages/producer/test/interface/stage-4/graph-passes.test.ts ./packages/producer/test/interface/stage-4/graph-commonjs-pass.test.ts ./packages/producer/test/interface/local-checks.test.ts
bun run test:producer:docker
```

The Stage 5 suite publishes the Stage 4 fixture with more snapshot files, then
runs Stage 5 start, collect and excerpt, and a parts request before collect.
It records the handoff with the pinned
tool versions, the query scope, each kind of syntax candidate with its scope and
lines, the parser diagnostics, the skipped files and the limits, the owner-null
units, the coverage, the excerpts and the refusals. It shows that a later action
refuses a changed ts-morph in a copied tool checkout. A unit suite gives the
syntax query the skip reasons that a published Stage 4 run cannot have. Run them
with:

```sh
bun test ./packages/producer/test/interface/stage-5 ./packages/producer/test/unit/stage-5-query.test.ts
bun test ./packages/producer/test/interface/stage-4/inspect.test.ts
```

In Stage 5, the symbol selectors of a version 5 or 6 baseline divide a file into code
units: one unit for each named top-level symbol and one rest unit for all other
text. `divideFile` in `code-units.ts` finds the parts in the syntax tree of the
saved file and runs no code. The shared record checks (`record-code-mapping.ts`)
divide each such file again and refuse a code mapping whose units differ, with the
units that the file must have. They divide with the ts-morph whose module files
the stage start pinned (`ts-morph-modules.ts`): the Stage 4/5 publisher checks the
files against the Stage 5 start handoff, and Stage 6 against its own start, and
both refuse a changed file. Stage 4 keeps whole files. The
[record format](docs/design/app-a/record-format.md#divided-files) gives the shape
and the rules. The `@producer` scenarios check a Stage 5 packet that divides a file
through the command line. Run the focused checks of the code units with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/code-units.test.ts ./packages/producer/test/unit/record-code-mapping.test.ts ./packages/producer/test/unit/snapshot-project.test.ts
bun test ./packages/producer/test/unit/ts-morph-modules.test.ts
bun test ./packages/producer/test/integration/records/code-units.test.ts ./packages/producer/test/integration/records/stage-6-records.test.ts
bun test ./packages/producer/test/interface/stage-5/code-units.test.ts ./packages/producer/test/interface/stage-4/code-units.test.ts
```

After Stage 5 collect, `stage-5 parts PATH SYMBOL [SYMBOL ...]` divides one file
by the named symbols, as the symbol selectors do, and saves `parts-NNN.json`: each
part with the ranges of its code unit and its dependencies, and the dependencies
at file level with their reasons. `part-dependencies.ts` places each loading site
of the file. An import belongs to the part that holds all the uses of its names,
which the type checker of the saved file finds (`checkSnapshotText` in
`snapshot-project.ts`). An import with uses in several parts or none stays at file
level as `shared` or `unreferenced`, and a side-effect import or a site with a
computed module name as `not-resolved`. Any other site belongs to the part that
holds it. The Stage 4/5 publisher checks the receipt of each parts request. The
[record format](docs/design/app-a/record-format.md#dependencies-of-file-parts)
gives the fields. The `@producer` scenarios ask for the parts of a divided file
through the command line. Run the focused checks of the dependencies of file
parts with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/part-dependencies.test.ts ./packages/producer/test/unit/stage-5-parts.test.ts ./packages/producer/test/unit/snapshot-project.test.ts ./packages/producer/test/unit/record-code-mapping.test.ts
bun test ./packages/producer/test/interface/stage-5/parts.test.ts ./packages/producer/test/interface/stage-5/commands.test.ts ./packages/producer/test/interface/commands.test.ts
```

Each stage that saves an LLM call record refuses a saved response with a hidden
reasoning block and a call record without `hiddenReasoning: not-saved`: Stage 1
finish, Stage 2 plan, save-review and finish, the Stage 3 finalizer, the Stage 4/5
publisher and the Stage 6 readiness review. Run the focused checks of the visible
LLM response with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/llm-response.test.ts ./packages/producer/test/integration/records
bun test ./packages/producer/test/interface/stage-1 ./packages/producer/test/interface/stage-2 ./packages/producer/test/interface/stage-3 ./packages/producer/test/interface/stage-4
```

Without project settings, Stage 1 names the Choom parsing profile
`choom-default-v1` in the settings record, with its assumptions and a
`no-project-settings` gap. Stage 1 finish adds that gap to the discovery gaps,
and Stage 4 start parses the source with the profile's options.
The [record format](docs/design/app-a/record-format.md#settings-record) gives the
fields. Run the focused checks of the named parsing profile with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/parsing-profile.test.ts ./packages/producer/test/unit/stage-1-settings.test.ts ./packages/producer/test/unit/stage-1-gaps.test.ts ./packages/producer/test/unit/stage-4-graph-profile.test.ts
bun test ./packages/producer/test/interface/stage-1 ./packages/producer/test/interface/recover-capture.test.ts ./packages/producer/test/interface/stage-4
```

Stage 1 capture records the Git identity of the target in
`evidence/git-identity.json`: the commit, the branch and the local changes. Git
runs only commands that read refs and objects, with the Git settings of the
target that can run a program turned off, and never `git status`. Choom compares
the snapshot with the commit itself. Without Git evidence, the capture continues,
and Stage 1 finish adds a `git-unavailable` gap to the discovery gaps. The
[record format](docs/design/app-a/record-format.md#git-identity-record) gives the
commands, the settings and the fields. Run the focused checks of the Git identity
with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/stage-1-git.test.ts ./packages/producer/test/unit/stage-1-exclusions.test.ts ./packages/producer/test/unit/stage-1-gaps.test.ts
bun test ./packages/producer/test/interface/stage-1
```

Stage 3 `text-search` searches the text of the saved snapshot with ripgrep from
`@vscode/ripgrep`. It passes `--no-config`, `--hidden`, `--no-ignore` and the
snapshot root as the only path, never follows links or decompresses files, and
removes `RIPGREP_CONFIG_PATH`. Each search saves a tool-call record with the
query, the ripgrep version and arguments, the searched scope with the capture
exclusions, the limits, the outcome (`match`, `no-match` or `truncated`), the
matches and the digests of the raw output. The
[Stage 3 cookbook](docs/design/app-a/step-3-cookbook.md#search-the-snapshot-text)
gives the arguments and the fields. Run the focused checks of the text search with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/ripgrep.test.ts ./packages/producer/test/unit/stage-3-text-search.test.ts ./packages/producer/test/unit/stage-1-exclusions.test.ts
bun test ./packages/producer/test/interface/stage-3
```

Stage 3 `exports PATH` lists the exports of one indexed JavaScript or TypeScript
file of the saved snapshot. It opens a ts-morph project on an in-memory file
system that holds only the indexed snapshot files, each checked against its
inventory digest, and it never reads the disk outside them. The compiler settings
of the file are chosen as for the Stage 4 graph groups: the first fully parsed
configuration of `settings-001` that selects the file, else the named Choom
parsing profile, else no settings. Each request saves `exports-NNN.json` with the
settings and their reference, the ts-morph and TypeScript versions, the exports
with their kinds and source ranges, the compiler inputs that the snapshot does not
hold as gaps, and the requests for paths outside the snapshot. The source queries
of Stage 3 `collect`, Stage 4 `stage-4-inspect collect` and Stage 5 `collect`
parse their files with the same project, without compiler settings. The
[Stage 3 cookbook](docs/design/app-a/step-3-cookbook.md#list-the-exports-of-a-source-file)
gives the fields. Run the focused checks of the snapshot project and the exports
with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/snapshot-project.test.ts ./packages/producer/test/unit/snapshot-exports.test.ts ./packages/producer/test/unit/stage-4-graph-profile.test.ts ./packages/producer/test/unit/stage-1-settings.test.ts
bun test ./packages/producer/test/interface/stage-3
```

Stage 4 `stage-4-inspect references PATH SYMBOL` lists the references to a
top-level symbol of a source file of the graph scope, after `collect`. It opens
the same snapshot project with the files of the import pass of the graph group
that holds the file, and with the compiler settings of that group, chosen by the
same rule as Stage 3 `exports`, and with the module format that the compiler
gives each file. The TypeScript type checker follows renamed imports and exports,
`export * from`, namespace imports, the local names of a destructured module
object and the other aliases to the declaration. Each request saves
`references-NNN.json` with the settings, the scope, the tool versions, the
declarations, each reference with its kind, range and local name, and as
unresolved entries, each with its reason, the loading sites of the scope with a
computed module name, the `require` calls of its TypeScript files and the relative
imports and `paths` aliases that the compiler settings do not resolve;
`completeness` is `partial` when there is one. `complete-within-scope` means only
that no unresolved entry was found. The
[Stage 4 cookbook](docs/design/app-a/step-4-cookbook.md#find-the-references-to-a-symbol)
gives the fields. Run the focused checks of the references with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/snapshot-references.test.ts ./packages/producer/test/unit/stage-4-references.test.ts
bun test ./packages/producer/test/interface/stage-4/references.test.ts ./packages/producer/test/interface/stage-4/publication.test.ts ./packages/producer/test/interface/stage-3/exports.test.ts
```

Stage 4 `stage-4-inspect collect` also applies the pinned list of Choom behavior
entry rules (`packages/producer/rules/behavior-entry-rules.yaml`, with its
[contract](cookbook/interfaces/behavior-entry-rules.tsp)) to the source files of
the graph scope and to the `package.json` files of the snapshot.
Stage 4 start saves a copy of the list and its SHA-256, and each
later Stage 4 action refuses a changed list. Each candidate in
`behavior-entry-candidates.json` names its rule, its call site, its name or `null`
with a reason, its handler range or `null` with a reason, its role and
`found: syntax-rule`: a candidate is not a proven entry. The Stage 4 entry
analysis names the record, and the shared record checks check its ranges against
the saved snapshot. The `@producer` scenarios collect the candidate of an
Express route and of a route whose name the code makes at run time, the
route candidates of an Express router, a Fastify server and a Hono app, the
start sites of a worker thread and a BullMQ queue worker, and the entries of a
Vite settings file, with a gap for an entry that the code computes.
They also collect the commands of a commander program and a yargs program, and
the bin commands of a package, each linked to the file that it runs only with evidence. The
[Stage 4 cookbook](docs/design/app-a/step-4-cookbook.md#find-the-behavior-entry-candidates)
gives the rules and their limits. Each call rule of the list needs a sample call
from the documentation of its library, each settings-literal rule a sample
settings file in the form that the documentation of its tool shows,
and each package-bin rule a sample package.json from the npm documentation, in
`packages/producer/test/unit/behavior-entry-rule-samples.test.ts`. Run the focused
checks of the behavior entry candidates with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/behavior-entry-rules.test.ts ./packages/producer/test/unit/behavior-entry-calls.test.ts ./packages/producer/test/unit/behavior-entry-settings.test.ts ./packages/producer/test/unit/stage-4-behavior-entries.test.ts ./packages/producer/test/unit/record-behavior-candidates.test.ts
bun test ./packages/producer/test/unit/behavior-entry-bins.test.ts
bun test ./packages/producer/test/unit/behavior-entry-rule-samples.test.ts
bun test ./packages/producer/test/interface/behavior-entry-rules.test.ts ./packages/producer/test/interface/stage-4/behavior-entries.test.ts ./packages/producer/test/interface/stage-4/publication.test.ts
bun test ./packages/producer/test/interface/stage-4/rule-lists.test.ts
bun test ./packages/producer/test/interface/stage-4/rule-scope.test.ts
bun test ./packages/producer/test/integration/records/stage-6-records.test.ts
```

Stage 2 runs Knip 6.44.1 with every plugin turned off, so Knip loads no settings
file of the target. A plugin set to `{ config: [] }` can still load a settings file
that a package script or a second plugin names, as
`packages/producer/test/interface/stage-2/knip-plugin-settings.test.ts` records. In
place of the plugins, Stage 2 prepare copies the default `entry` and `production`
patterns of each Knip plugin that a dependency of a workspace manifest turns on, from
the plugin definitions of the installed Knip (`stage-2-plugin-patterns.ts`), into
the entry patterns of the workspace. `preflight.json` records each copied pattern
with its plugin, dependency and manifest (`pluginEntryPatterns`), and each pattern
and plugin that it does not copy, with the reason. Knip's report lists issues, not
entries, so Stage 4 collect (`stage-4-plugin-entries.ts`) lists each indexed file
that a copied pattern selects as a behavior entry candidate with
`found: knip-plugin-pattern`, after the syntax-rule candidates. The shared record
checks check its source against the preflight record. The `@producer @docker`
scenarios run Stage 2 with the pinned Knip image, then Stage 3 and Stage 4 collect,
on a Next.js app and on a Vite app whose settings file is a probe script; the CI
`producer` job runs them. The native interface test runs the same profile with the
local Knip. The [Stage 2 cookbook](docs/design/app-a/step-2-cookbook.md#knip-plugin-patterns)
gives the rules and their limits. Run the focused checks of the Knip plugin patterns
with:

```sh
bun test ./packages/producer/test/unit/stage-2-plugin-patterns.test.ts ./packages/producer/test/unit/stage-4-plugin-entries.test.ts ./packages/producer/test/unit/record-behavior-candidates.test.ts
bun test ./packages/producer/test/interface/stage-2/knip-plugin-settings.test.ts ./packages/producer/test/interface/stage-2/knip-plugin-patterns.test.ts ./packages/producer/test/interface/stage-2/entry-analysis.test.ts ./packages/producer/test/interface/stage-4/plugin-entries.test.ts
bun run test:producer:docker
```

Stage 4 `stage-4-inspect collect` also applies the pinned list of Choom resource
access rules (`packages/producer/rules/resource-access-rules.yaml`, with its
[contract](cookbook/interfaces/resource-access-rules.tsp)) to the source files of
the graph scope. Stage 4 start saves a copy of the list and its SHA-256, and each
later Stage 4 action refuses a changed list. A rule finds a call whose receiver comes
from its import (`receiver-import`) or has a declared type of that import, such as a
parameter `db: Knex` (`receiver-type`). Each candidate in
`resource-access-candidates.json` names its operation, its name or `null` with a
reason, an identity that is inferred from the name and is not proven, and its source
context; it names no owner. Each resource call site of `source-sites.json` that no
rule found stays in the record with confidence `name-only`. The Stage 4 resource
observations name the record, and the shared record checks check it against the
saved snapshot. The `@producer` scenario collects a write to the invoices table
through a typed Knex client. The
[Stage 4 cookbook](docs/design/app-a/step-4-cookbook.md#find-the-resource-access-candidates)
gives the rules and their limits. Run the focused checks of the resource access
candidates with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/resource-access-calls.test.ts ./packages/producer/test/unit/stage-4-resource-access.test.ts ./packages/producer/test/unit/record-resource-candidates.test.ts
bun test ./packages/producer/test/interface/resource-access-rules.test.ts ./packages/producer/test/interface/stage-4/resource-access.test.ts ./packages/producer/test/interface/stage-4/publication.test.ts
bun test ./packages/producer/test/interface/stage-4/rule-lists.test.ts
bun test ./packages/producer/test/interface/stage-4/rule-scope.test.ts
bun test ./packages/producer/test/integration/records/stage-6-records.test.ts
```

Run the focused checks of the producer code record with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/producer/test/unit/producer-code.test.ts ./packages/producer/test/interface/producer-code.test.ts
bun test ./packages/producer/test/interface/stage-1 ./packages/producer/test/interface/stage-2/producer-code.test.ts
```

After Stage 6, `bun run producer baseline decide --run RUN_FOLDER DECISION_FILE`
records human decisions about the published baseline: a person accepts or
corrects proposed statements in a YAML decision file. The producer reads the
file with the bounded YAML profile of a baseline, and `validateDecisions` in
`@choom/baseline-model` checks it against the baseline and the SHA-256 of its
file. The producer refuses a decider who has the name of a model in the run's
LLM call records. That check is a process rule; it does not prove that a person
decided. The command also runs the checks of the next version that `baseline
next` makes from the record (`next-version-checks.ts`), so it refuses a record
that `baseline next` would refuse, with the same message. The command saves the
exact file once as `decisions/<id>.yaml`, all or nothing: it writes a temporary
file, reads it back and links it to its final name (`saveDecisionRecord`). It
changes no other file of the run. `readDecisionRecord` in `decision-record.ts`
reads a saved record with the same rules. The
[record format](docs/design/app-a/record-format.md#decision-record) gives the
fields and the checks. The `@producer` scenarios record an accept and a
correction from YAML files that start with a comment, for a run that the Stage 6
command line completed, and refuse a decider that is the model of the run and a
correction of a value that the baseline does not have. The unit suites check the
decision contract rules, the statements of a baseline, the YAML decision file and
the saved record with its all-or-nothing save, the completed run reader and the decider check; the interface
suite checks the contract; the integration suite runs the command. Run them with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/baseline-model/test/unit/baseline-decisions.test.ts ./test/interface/domain/baseline-decisions.test.ts
bun test ./packages/producer/test/unit/decision-record.test.ts ./packages/producer/test/unit/completed-run.test.ts ./packages/producer/test/unit/decider-check.test.ts
bun test ./packages/producer/test/integration/records/baseline-decide.test.ts
```

`bun run producer baseline next --run RUN_FOLDER --decisions DECISION_ID` makes
the next baseline version from a saved decision record. `nextBaselineVersion` in
`@choom/baseline-model` runs the checks of `validateDecisions` and makes the
version: its ID is `<parent ID>-<decision record ID>`, its parent is the
published baseline, and each decided statement is `accepted` with the decision
record ID as its `acceptanceRef`. A correction also replaces the value. The
producer profile of a next version accepts an accepted statement only when it
names the decision record of the version, the saved record has the SHA-256 that
the version record gives, and the record decides that statement. The command
saves the version once as `baselines/<version-id>/baseline.yaml`, with the
version record `version.json`, all or nothing: it writes both files in a
temporary folder and renames the folder. It changes no other file of the run.
The [record format](docs/design/app-a/record-format.md#next-baseline-version)
gives the rules and the files. The `@producer` scenarios record decisions for a
run that the Stage 6 command line completed, make the next version, and validate
it as the viewer does. The unit suites check the version rules and the
all-or-nothing save of the folder, the producer record suite checks the statuses
of a next version, and the integration suite runs the command. Run them with:

```sh
bun run test:behavior --tags @producer
bun test ./packages/baseline-model/test/unit/baseline-decisions.test.ts
bun test ./packages/producer/test/unit/version-folder.test.ts
bun test ./packages/producer/test/integration/records/record-baseline.test.ts ./packages/producer/test/integration/records/baseline-next.test.ts
```

The decision checks, the producer record checks and the viewer's **Recorded
statements** use one list of the statements of a baseline and their paths:
`item-statements.ts` in `@choom/baseline-model`. Run the checks of the list and
of its users with:

```sh
bun test ./packages/baseline-model/test/unit/item-statements.test.ts
bun test ./packages/producer/test/integration/records/record-baseline.test.ts ./test/unit/lib/interface-provenance.test.ts
```

The normal browser opening test uses the real app, file reader, decoder, layout,
and component view. Controlled workflow tests cover failures, cancellation,
concurrent requests, and late results. Browser tests and IPC doubles do not
prove native file selection or installed-app behavior.

Follow the [installed baseline acceptance guide](docs/change-requests/BV-native-acceptance.md)
for the Linux/X11 driver, release artifact, and environment settings. It opens
a baseline through the ordinary installed app with an empty product `PATH`.
The runner does not require analyzer fixtures. macOS and Windows need their own
installed-app evidence. Keep results tied to the tested build and platform.

```sh
bun run test:rust
bun run test:behavior:packaged --tags @baseline-viewer
```

The [CR-001 records](docs/change-requests/CR-001-architecture-import.md) and
[architecture review](docs/architecture-reviews/2026-11-07-agreed-refactoring-plan.md)
describe the former repository-analysis app. Their commands and results are
historical, not current baseline-viewer evidence.

BR-10's assembled reading checks use the same published version 2 fixture in
the browser and installed app. See the [fixture provenance](test/fixtures/baseline-viewer/interface-reading-fixtures.json)
for its hash and the separate fictional reader exercise. The Linux harness needs
`xclip` to verify real clipboard writes. Run `--tags @br-10f` for these focused
journeys, or `--tags @baseline-viewer` for the complete installed baseline suite.
Automated checks and manager review do not establish human comprehension.

TypeSpec sources in [`cookbook/interfaces/`](cookbook/interfaces/main.tsp) define
Choom-owned component data and operations for internal and external callers.
After a contract edit, run `bun run contracts:generate`, review the source and
generated diff, then run `bun run check:contracts`. Generated TypeScript lives
under each source owner's `generated/` directory; structural JSON schemas live
under `cookbook/interfaces/generated/`. Commit these outputs with their sources.
Checks report missing or stale output instead of rewriting it. Existing runtime
validation and behavior tests still enforce graph invariants and operation
semantics. See the [cookbook](cookbook/README.md) for the exact scope.

## Validate the four constraints

Use the pinned Bun and Node versions from setup, then install dependencies and
Chromium once:

```sh
bun install --frozen-lockfile
bunx --no-install playwright install chromium
./scripts/run_all_constraints.sh
```

The script uses Bash and ordinary local tools; it makes no LLM calls and does
not install dependencies. It resolves the repository from its own path, so it
also works when invoked by absolute path from another directory. It runs all
checks even if one fails, prints each result and its purpose, and reports the
four constraint results together. Failure output explains which command failed;
full command logs are retained under `reports/constraints/`.

Exit codes are `0` for a passing run, `1` for failed checks, `2` for setup or
usage errors, and `130`/`143` for SIGINT/SIGTERM cancellation. Cancellation stops
the active command group and keeps partial logs. Use `--help` for a quick guide;
set `NO_COLOR=1` for plain terminal output.

| Constraint | Checks |
| --- | --- |
| Behavioral | Bun unit tests, the Node import test of the baseline model, baseline/boundary Cucumber scenarios, and browser Cucumber against one fresh production build |
| Observability | Component links, contract ownership, and the OpenSLO Service shape |
| Architectural | TypeScript dependency boundaries, cycles, and unresolved imports |
| Interface | TypeSpec compilation and generated-output consistency, TypeScript implementation conformance, and runtime interface cases; broader schema/adapter behavior also runs in Behavioral |

A passing summary means these implemented checks passed. The OpenSLO Service
has no measured production SLI or SLO, and browser IPC doubles do not prove native
dialog or capability behavior. Native compilation/configuration checks remain
in the separate desktop CI job. See the [cookbook](cookbook/README.md) for exact
commands and the [evidence and remaining work](cookbook/TODO.md) for coverage gaps.

The script replaces the overlapping constraint steps in web CI. Lint, unused-code,
and duplication checks still run separately; `bun run check` remains available
for the existing browser-free development check.

## Habit-hooks scans

This project uses the Habit Hooks configuration from `choom-ai`, pinned to
`habit-hooks[typescript]==1.5.0`. After installing the Bun dependencies, install
[uv](https://docs.astral.sh/uv/getting-started/installation/) so `uvx` is on
`PATH`. Habit Hooks requires Python 3.11 or later; the TypeScript detectors use
the project's Node.js runtime and installed development tools.
Knip recognizes `uvx` as an external prerequisite rather than an npm binary.

```sh
bun run habit-hooks --all
bun run habit-hooks --file src/App.tsx
bun run habit-hooks --branch main
```

These are manual scans. The configuration installs no automatic Git or agent
hook. It covers all repository TypeScript and TSX, including the UI components,
tests, and scripts. Dependencies, build output, Rust targets, generated Tauri
schemas, and coverage are excluded. Knip examines the project dependency graph
even when scanning a single file.

The copied policy permits 60 code lines per TypeScript function, 120 for TSX,
and 200 for tests and scripts. The test override covers `test/`. File length is limited to 500 code lines,
complexity to 25, parameters to 5, and nesting depth to 4. Duplicate blocks need
at least 10 lines and 100 tokens, with comment-only matches ignored. ESLint owns
the length limits; the separate line-count and comment-presence sensors are
disabled. The remaining hygiene and unused-code sensors stay enabled.

`bun run lint` also applies these ESLint rules alongside the existing typed
lint rules. The full scan is separate from `bun run check`, as in the reference
setup. Review its findings as well as its exit status: some sensors report
findings with exit 0. Correct findings or document why they remain, and keep
`.habit-hooks/snooze.json` empty (`[]`). Custom length-review guides live under
`.habit-hooks/generic/guides/`.

## Project structure

```text
src/
  architecture/        Baseline opening, view ownership, and app composition
  components/          React components and shadcn-compatible UI
  domain/              Duplication-report validation and the starter baseline
  lib/                 Bounded YAML input, ELK layout, and class merging
  platform/            Host detection, native file selection/read, and browser file access
packages/
  baseline-model/      @choom/baseline-model: baseline validation and generated contract types
  producer/            @choom/producer: manual producer helpers, their command line, and tests
src-tauri/             Rust desktop shell and window capabilities
cookbook/              Behavior, TypeSpec contracts, generated schemas, observability
scripts/               Contract generation/checks and separate source-analysis tools
test/                  Unit/interface suites and shared Cucumber steps
```

The root [component manifest](component.yaml) links the four constraints and the
`workspace`, `baseline-model`, `producer`, and `native-shell` children. The [workspace](src/component.yaml) owns
the app entrypoints and `architecture/`, `components/`, and `lib/`. Its children
are `architecture-model` in `domain/` and `desktop-adapter` in `platform/`.
These manifests describe this repository for development checks. The viewer
reads component records from the selected baseline.

The [baseline model](packages/baseline-model/component.yaml) is a Bun workspace.
It owns the baseline format rules: `baselineSchema` and the generated `Baseline`
types. The viewer imports it as `@choom/baseline-model`. The producer imports it
too, for the baseline shape, and adds its stricter profile and its run checks
(see the [record format](docs/design/app-a/record-format.md#baseline)). Its exports are `.` (the validator), `./contracts`,
`./baseline-format`, and `./readonly-data`. It uses only TypeScript that Node
can remove, so a Node process imports it with no build step.
The `./baseline-decisions` export checks a decision file against a saved
baseline (`validateDecisions`) and makes the next version from it
(`nextBaselineVersion`). The `./item-statements` export lists the
statements of a baseline with their paths, for the decision checks, the
producer record checks and the viewer's Recorded statements.
The `./subject-items` export (`SubjectItems`) gives the item that a subject
reference of a question or gap names, for the viewer placement and the producer
record checks.
The `./discovery-result` export checks a version 2 discovery result against a
saved baseline file (`validateDiscoveryResult`), for the viewer and for Stage 6
of the producer.

The [producer](packages/producer/component.yaml) is the `@choom/producer` Bun
workspace. It holds the manual Stage 1 to 6 helpers, the duplication helpers,
and `cli.ts`, which `bun run producer` runs on Node 26. The cookbooks, the
[record format](docs/design/app-a/record-format.md), and the duplication guide
stay in `docs/design/app-a/`. The cookbooks hold only the commands that an operator
types, the LLM prompts and the review steps. The code that Stage 1 and Stage 2
ran from their cookbooks is in TypeScript modules: the Stage 1 settings collector
(`stage-1-settings.ts`), the Stage 2 steps (`stage-2-handoff.ts`,
`stage-2-knip-profile.ts`, `stage-2-knip-input.ts`, `stage-2-tool-image.ts`,
`stage-2-knip-run.ts` and `stage-2-finish.ts`) and the input consolidation command
(`stage-2-consolidate-inputs.ts`). The Knip profile takes the Knip plugin patterns
from `stage-2-plugin-patterns.ts`. The Stage 3 helper (`stage-3-commands.ts`) uses
`stage-3-inputs.ts` for the checked run and snapshot files, `stage-3-collect.ts`
for the evidence of `collect`, `stage-3-text-search.ts` with `ripgrep.ts` for
the text search, and `stage-3-exports.ts` for the exports action. The Stage 4
inspection helper (`stage-4-inspect.ts`) uses `stage-4-source-sites.ts` for the
source sites, `stage-4-review-prompt.ts` for the review prompt,
`stage-4-plugin-entries.ts` for the candidates of the Knip plugin patterns and
`stage-4-references.ts` for the references action. The Stage 5
helper (`stage-5-commands.ts`) uses `stage-5-inputs.ts` for the checked run and
snapshot files, `stage-5-query.ts` with `stage-5-syntax.ts` for the evidence
of `collect`, and `stage-5-parts.ts` with `part-dependencies.ts` for the parts
action.
The Stage 6 helper (`stage-6-commands.ts`) uses `stage-6-inputs.ts` for the
trusted YAML package and ts-morph, the registered artifacts and the indexed snapshot files,
and `stage-6-files.ts` for its checked reads, the files and folders that it owns
and the publication lock.
`attempt-files.ts` holds the review prompt of a saved cookbook and
the command log of Stages 3 and 5. The snapshot project (`snapshot-project.ts`)
opens a ts-morph project on the in-memory file system of the Stage 1 settings
collector, and `snapshot-exports.ts` lists the exports of one of its files. The
source queries of Stages 3, 4 and 5 read their files with its syntax reader.
`snapshot-references.ts` finds the references to a symbol of one of its files, and
`compiler-settings.ts` chooses the compiler settings of a file for the Stage 3
exports and Stage 4 references actions.
`code-units.ts` divides one parsed file by named top-level symbols into code units
for the checks of the code mapping and the Stage 5 parts action.
`ts-morph-modules.ts` loads the ts-morph that divides a file and checks its module
files against the pins of a stage start.
Every stage action runs the code in the tool checkout. Stage 1 start saves the
producer code record (`producer-code.ts`): the package version, the Git commit
when there is one, and one digest of
`packages/producer/src` and `packages/baseline-model/src`. Every later stage
action checks that digest first and refuses a changed producer, so the code
cannot change during a run. Stage 1 capture saves the Git identity of the target
(`stage-1-git.ts`, with the capture exclusion rules from `stage-1-exclusions.ts`),
and Stage 1 finish adds the gaps of the settings record and the Git identity
record to the discovery gaps (`stage-1-gaps.ts`). `tool-gaps.ts` gives these gaps
and the required gaps of the Stage 2 Knip outcomes, and checks that a review
copies the required gaps exactly. The stage starts save their
cookbooks, and Stages 4
and 5 also the record format, as records; Stages 3 and 5 read their review prompt
from the saved cookbook. `run-layout.d.mts` gives TypeScript callers the types of
`run-layout.mjs`. The shared record validator of Stages 4 to 6
(`stage-6-records.ts` with `record-baseline.ts`, `record-sources.ts`,
`record-graph.ts`, `record-code-mapping.ts`, `record-subjects.ts`,
`record-reviewed-source.ts` and `record-checks.ts`) checks the baseline shape with
`@choom/baseline-model`, as the viewer does, and adds the producer profile, the
reserved IDs and the checks against the saved run records. Every stage resolves
an evidence reference with the one resolver in `record-checks.ts`.
`result-gaps.ts` requires a gap that cites an analysis that did not run, and
`draft-update.ts` publishes the working drafts of Stages 2 to 5 as one update,
`run.yaml` last. Their publishers refuse an attempt file that no producer action
saved with `saved-attempt-files.ts`. `llm-response.ts`
holds the design rule "Do not save hidden reasoning": every stage that saves an
LLM call record checks that the response holds only the visible answer and that
the call record has `hiddenReasoning: not-saved`.
The baseline command (`baseline-commands.ts`) records human decisions after
Stage 6: `baseline-decide.ts` reads the completed run with `completed-run.ts`,
reads the YAML decision file with `decision-record.ts`, which uses the bounded
YAML profile of `stage-6-records.ts`, and checks the decider with `decider-check.ts`.
`baseline-next.ts` makes the next baseline version from a saved decision record,
and `version-folder.ts` saves its folder all or nothing. Both actions check the
saved form of the next version with `next-version-checks.ts`.

The [dependency rules](.dependency-cruiser.cjs) keep model validation and YAML
decoding separate from platform operations, UI, and layout. The baseline model
imports no app code from `src/` and no package other than `zod`. The producer
imports the baseline rules from `@choom/baseline-model`. It imports no app code,
with one listed exception: the duplication helpers
keep their use of the viewer's baseline and report YAML readers and the
duplication key. The workflow uses
injected file and layout operations. The platform owns Tauri access. React
components use the [workspace view](src/architecture/workspace-view.ts) and
prepared diagram data. App connects the workspace to the UI. ELK loads on demand
before a baseline view is committed.

`bun run check:dependencies` runs [import probes](scripts/check-dependency-boundaries.ts)
in temporary projects and checks the full frontend, baseline-model and producer dependency graph. The probes
cover permitted and rejected imports, including erased types and imports with
runtime effects. Cargo dependencies and Tauri capabilities govern the Rust
boundary. The host registers only `document_file_read` and enables the open-file
dialog. Repository analysis, snapshots, export, writable caches, and their
startup/shutdown services have been removed.

ELK produces a large deferred chunk and a Vite size warning. Opening the example
or a baseline requests that chunk.

## Dependency policy

All requested direct npm and Cargo dependencies use exact versions; commit `bun.lock` and `src-tauri/Cargo.lock` after intentional updates. The root `package.json` declares the `packages/*` workspaces, and the app depends on `@choom/baseline-model` with `workspace:*`. `bunfig.toml` keeps the hoisted linker, so all workspaces share one `node_modules` tree. The JavaScript dialog companion `@tauri-apps/plugin-dialog@2.8.4` is included alongside the Rust plugin. Cucumber 13.3.0 supplies `@cucumber/gherkin@42.0.1` transitively; it is not separately installed.

The [TypeScript side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) is deliberate:

- `@typescript/native` aliases `typescript@7.0.2` and supplies the `tsc` command.
- `typescript` aliases `@typescript/typescript6@6.0.2` and supplies the API for tools such as ESLint, plus `tsc6`.

The compatibility wrapper depends on `@typescript/old` through a `^6` range. A direct `@typescript/old` alias pins that underlying API implementation to TypeScript 6.0.2 as well; Knip exempts this pin because it is consumed by the wrapper. The typecheck script invokes the native compiler by its package path to avoid competing `tsc` executable names.

Use `bun run typecheck` to check with the native compiler. Do not replace the compatibility alias with TypeScript 7: it does not provide the legacy compiler API.

`cn` supplies the `cn` utility; no separate `clsx` or `tailwind-merge` dependency is needed. The shadcn generator may add dependencies or rewrite the utility when generating components; review those changes before accepting them. Knip checks application, test, tooling, and CSS dependencies.

`@fontsource-variable/inter` at `5.3.0` supplies the Inter font. The `@font-face`
rule in `src/styles.css` uses only its Latin file, `inter-latin-wght-normal.woff2`
(48 KB, weights 100 to 900), and the build copies it into `dist/assets/`. The
browser app and the desktop app load it from the app itself, with no network;
the Tauri rule `font-src 'self'` allows it. The rule hides an Inter that the
machine has installed, so each machine draws the same text and layout. A
character outside the Latin file, such as `↔`, uses a system font. The font is
under the SIL Open Font License 1.1. `public/licenses/inter-ofl.txt` is a copy of
the package licence, and the build ships it with the font; copy it again when
the package changes. The package has no install script, so it is not in
`trustedDependencies`.

`packages/producer/package.json` declares the packages that the producer helpers load
from the tool checkout, at the versions already in `bun.lock`: `yaml`, `picomatch`,
`typescript`, `ts-morph`, `knip`, `dependency-cruiser`, and `jscpd`. It also
declares `@choom/baseline-model` with `workspace:*`, as the app does. The helpers
resolve them from the root `node_modules`, which the hoisted linker keeps in place.
The workspace link resolves to `packages/baseline-model` in the same checkout,
whose code the producer code digest covers.
The producer also declares `@vscode/ripgrep` at `1.18.0` for the Stage 3 text
search. That version takes the ripgrep program from one package for each
platform, which `bun.lock` lists with its operating system, processor and
integrity hash, so `bun install` puts the program in place with no install script
and no download from GitHub. The package is not in `trustedDependencies`: it has
no script to trust, and that list would replace Bun's default list of trusted
packages.
Knip ignores `dependency-cruiser` and `picomatch` in that workspace: the Stage 4
graph helper loads dependency-cruiser by file path, and Stage 4 loads picomatch by
a name in a variable, so Knip cannot see either use.

The Codex CLI is a development tool. Authenticate it separately when needed; no
credentials, AI backend, or Codex subprocess are embedded in the app. Rust
serialization and file-identity checks support bounded native reads.

See [the cookbook](cookbook/README.md) for component artifacts, focused checks,
and validation limits. The [evidence table and remaining work](cookbook/TODO.md)
separate local checks from production prerequisites. All manifests share one
unmeasured OpenSLO Service; there is no active production SLI or SLO.
