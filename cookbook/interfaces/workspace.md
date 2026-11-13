# Baseline workspace contract

[workflow.tsp](workflow.tsp) owns load states and outcomes. [baseline.tsp](baseline.tsp)
owns the saved model. The workspace has no HTTP API. File readers, abort signals,
subscriptions, React props, and prepared geometry remain TypeScript bindings.
They do not change the saved baseline format.

[workspace.ts](../../src/architecture/workspace.ts) connects the host file picker,
bounded file reader, [LoadWorkflow](../../src/architecture/load-workflow.ts),
[baseline decoder](baseline-codec.md), and lazy ELK layout. Construction does no
I/O. Neither host needs a repository, analyzer, runtime executable, or evidence
files to open a baseline. The workspace does not write files.

## Loading and cancellation

**Open Baseline** selects a file, reads bounded UTF-8 text, validates its contents,
and prepares its layout. One synchronous commit replaces the baseline and
layout together. The previous view remains visible on selection, reading,
validation, or layout failure and on cancellation before that commit. The
filename does not select the format; legacy diagram contents are rejected.

One load owns the slot from selection through publication. Another load returns
`busy`. **Cancel** aborts the operation before publication. A pending native
picker keeps the slot until it closes, because an AbortSignal cannot close that
picker. A cancelled read or layout may finish later. Its handlers remain
attached, and its result cannot replace a newer baseline. Cancellation after a
commit does not reverse that commit.

**Retry** rereads the resolved selection when available. If selection itself
failed, Retry opens the picker again. A browser File that is no longer readable
produces safe guidance to use Open Baseline and select the file again. Native
and browser input errors retain useful codes and safe messages. Unexpected
exceptions produce a bounded stage-specific error without raw paths or text.

## Publication and rendering

[workspace-view.ts](../../src/architecture/workspace-view.ts) exposes Open
Baseline, Cancel, Retry, subscriptions, and snapshot queries. Disposal stays
with the owner. The workflow copies and deeply freezes each baseline and layout
before publication, including recursive rule JSON, statement lists, and positions.
It does not freeze references held by collaborators. Repeated snapshot reads
are stable; later progress reuses the current baseline and layout.
Subscription changes during notification do not repeat the same notification.

[layoutBaseline](../../src/lib/architecture-layout.ts) prepares a flat component
node list for React Flow, with all recorded groups expanded. Each node has its saved ID,
width, height, position, and optional parent ID. Child positions are relative
to their parent. Parents come before children. The layout checks exact component
coverage, parent IDs, finite geometry, positive sizes, and child containment
below the parent inspection header. Missing or invalid output fails the load.
[ArchitectureDiagram](../../src/components/architecture-diagram.tsx) renders
that prepared data without file access or layout work. It gives React Flow its
own mutable position records. Components show their names and the number of
interfaces they directly own. Counts exclude descendant and unknown owners.
A parent has a border around its children and one small inspection header.
Names can wrap to two lines in a bounded header. Accessible names and panel
details keep the full text. ELK rectangle packing prepares the component overview.
Interfaces and resources have no separate nodes. Interface arcs run
from each recorded allowed consumer to the recorded owner. They show permission
to use the interface, not observed calls. Each arc has the identity
`(interface ID, consumer ID, owner ID)`. Repeated names, parallel permissions,
opposite directions, and an owner that is also a consumer remain distinct.
Arcs attach to the actual component headers, including within nested groups.
They follow the current arrangement without changing the prepared layout.

The view starts with **Connections: Selected**, self-connections off, and no
inspection, so it shows components without arcs. Selected shows arcs directly
incident to the component in the inspection path. An owned interface or resource
keeps that scope. A standalone inspected interface, including direct arc input,
shows its known arcs. Other panels and a closed panel show none. Selecting a
parent does not include descendant-only links. **All** shows the complete known
arc set. Either choice excludes self-loops unless **Show self-connections** is
on. Future collapse excludes an arc when an actual endpoint header is hidden;
it does not redirect the arc to an ancestor.

These are view filters, not changes to recorded knowledge. Keep complete
interface counts, unknown-fact summaries, and validation limits. An empty shown
set says **No connections shown.** without claiming unknown or empty consumer
facts. Keep the connection controls, legend, and empty-message space stable when
the set changes. With no components, omit these controls and retain the lists.

An interface with a null owner or null consumer list produces no arc. A note
counts these interfaces once each and directs the user to Baseline details.
The note also appears when there are no components. Interface details explain
which endpoint facts are unknown and retain any known values. Labels use at
most two lines and the width of a component header; their accessible names
include full interface and endpoint names and IDs. A shown arc reveals its
transparent label on curve/label hover, keyboard focus, or inspection of its
interface. Pointer focus alone does not keep the label revealed. The keyboard
control remains available while its text is hidden; hidden text has no pointer
hit rectangle. Filtered arcs have no input target. Curve-to-label movement keeps
the revealed label stable. Touch can open the interface without prior hover.

The side panel preserves ownership and allowed-consumer statements separately,
including unknown owners, repeated names, and an owner that is also a consumer.
Each statement retains its own value, status, evidence references, and acceptance
reference. Choom does not infer relationships from rules, promises, access rules,
names, or code imports.

The [display policy](../../src/lib/baseline-display-limits.ts) checks bounds
before the layout graph is built, including when the component list is empty.
It allows at most 500 records across components, interfaces, resources, and
rules; 2,000 explicit links; and 16 component levels, with roots at level 1.
Each non-null interface or resource owner and each allowed-consumer entry is
one link. Parent nesting does not add links. An excessive baseline reports
**Too large to display** and keeps the previous view. The workflow imports this
small policy module; it does not load ELK to handle the error.

Once the canvas has a usable size, the view starts at 100% zoom. It centers all
root bounds when they fit with padding. Otherwise, it reveals the first root
header in baseline order. This happens once per successful open. Resizing and
inspection preserve its pan and zoom. Fit view can zoom out to show the entire
diagram. A single click, Enter, or Space opens
inspection in a nonmodal side panel. On narrow windows, the panel sits below
the canvas. Each record keeps all saved fields available. Each statement shows its value, **Proposed** or **Accepted
(recorded)** status, **Evidence not loaded**, and its evidence references. An
accepted statement also shows its acceptance reference. Missing optional fields
say **Not recorded**. Null statement values say **Unknown (null)**. Empty lists and objects
remain `[]` and `{}`. Membership paths and exclusions are separate fields, and
the four promise fields stay distinct from a wholly unknown promise value.

**Baseline details** shows the format version, baseline ID, and parent baseline
ID. A null parent baseline ID means this is the first baseline and shows **No
parent baseline (null)**. **Rules** lists every rule, including when the baseline has no diagram items.
A native expandable row shows each rule's subject, expected value, and check as
plain JSON text. The viewer formats a rule's details only while its row is open.
It does not evaluate checks, interpret markup, link references, or load evidence.
Long values wrap and the panel scrolls without moving or zooming the diagram.

Component inspection lists interfaces directly owned by that component. Resources
and Recorded details expand its resource list and component fields. Baseline
details also lists every component, interface, and resource, including unknown
owners and records in models with no components. Back restores the originating
list position and row focus. A direct canvas selection starts a new inspection
path; inspecting an owned record keeps its component highlighted. Selecting an
arc or its label opens that interface in a fresh path. Within the shown set,
component inspection emphasizes incoming and outgoing arcs. Interface inspection
emphasizes its arcs and reveals their labels; unrelated shown labels still respond
to hover and keyboard focus. Other panel kinds and a closed panel show normal arcs.

Keyboard activation focuses the panel heading; pointer selection keeps focus on
the canvas. The panel has no overlay or focus trap. Escape and the close button
return focus to the opener when focus was inside the panel and it will remain
shown. In All mode, a restored arc can receive focus when its interface,
consumer, and owner IDs match the initiating arc. If the arc opener is absent,
use its owner’s header, then its nearest visible ancestor, then Baseline details. If closing removes a focused arc outside
the panel, use that focused arc's owner instead. Keep focus on an outside control
that survives. Do not keep hidden arcs just to restore focus. In the Rules list,
Escape from an expanded rule first closes that rule and focuses its summary.
The next Escape closes the list and focuses **Rules**. Keyboard focus brings an
offscreen inspection header or arc label into view without changing zoom.
An oversized control keeps its leading name and focus edge visible. Pointer
selection does not pan the canvas. Arc inspection keeps the exact initiating
label as its preferred focus-return target when it survives. A successful replacement closes
the old details and starts a fresh view, even when baseline and record IDs match.
If focus was in the old canvas or panel, it moves to the new baseline heading;
focus outside that view stays in place.

Header dragging and arrow keys move only viewer-owned geometry. Arrow keys move
10 diagram units and announce the new position. Pointer frames do not produce
repeated announcements. Parents carry descendants through their relative
positions. Child movement stops at the left edge and below the parent header;
right or bottom movement grows every enclosing bound as needed. Other component
origins stay fixed. Unused group space remains available for canvas panning.

Escape, window interruption, or lost pointer capture cancels a drag and restores
its starting positions and bounds. Escape cancels the drag before it can close
inspection. Releasing a drag never selects a component. A later event from a
cancelled gesture or replaced view cannot change the current view.

**Reset layout** ends any held press or drag, restores the prepared initial
positions and bounds, and applies the normal 100% starting view using the current
canvas size. Late pointer events cannot undo the reset or select another record.
Reset keeps the same view owner, inspected record, Back path, panel scroll,
and connection choices. It recomputes label visibility from current input and
inspection rather than stored visibility flags. Reset's
announcement replaces any old keyboard movement coordinates with
**Layout reset.** It does not reread the file or run layout. Repeated resets have the
same result. **Fit view** changes only the camera to include all shown component
bounds, shown arc curves and arrowheads, and labels revealed at activation,
including items outside the viewport. Hidden label rectangles do not enlarge it.
It can zoom below 1% for a widely spread arrangement. Zoom controls remain
consistent with the fitted scale. It uses the canvas beside
or above the panel and preserves manual geometry. Neither action runs on resize.

The published baseline/layout pair stays immutable. Its viewer-owned arrangement
survives inspection, resize, pan, zoom, loading progress, and unsuccessful loads.
Each successful open gets a new arrangement and default connection choices;
closing the example ends its view. Failed, cancelled, and ignored late loads
keep the choices. Arc presses belong to their published view and are cancelled
when their arc disappears. A reappearing tuple or a same-ID replacement cannot
revive the old press. Movement and connection choices add no file writes,
storage permission, or persistent cache.

The heading is the baseline ID. An entirely empty model says **No architecture
items modeled**. A baseline with other record kinds but no components says
**No components modeled**. Neither empty state substitutes the example.
Interfaces and resources remain available through Baseline details when there
are no components. No diagram layout is needed in that case. An empty
Rules list says **No rules modeled**. Fit view and Reset layout controls are
absent without canvas nodes.

## Interface reading view

Interface inspection starts in Overview with the recorded name and friendly
provider name. Null ownership reads **Provider unknown**. Legacy promises keep
their saved text under Behavior, Data exchanged, Failures, and What changes and
when it ends. An unclassified access point remains a Recorded entry reference.

Version 2 entries appear in saved order. The first entry starts selected, and
each selection names the contract it describes. Explicit function, command, and
workflow facts can show input, success, failures, and effects. Missing interaction
details, partly unknown facts, and wholly unknown facts remain distinct. Type,
data, and message entries have no invented call contract. Rich entry details put
the unchanged general promises in Interface-wide contract. Access rule resolves
component names, keeps self-use, and distinguishes permission from activity.

Overview, Example, and Sources use standard keyboard tabs in the existing inspector width.
Sources retains the original fields and a lazy Original record disclosure.
Recorded statuses remain separate from verification. No source reference is
resolved or executed. Tab and entry choices belong to one mounted inspection
frame. A fresh direct selection has a new frame key even when its ID is unchanged.
Tab changes keep that frame mounted; interfaces add no deeper navigation path.
This avoids a global cache or duplicate state in the inspection hook. Existing
Back, focus return, successful replacement, and failed-load behavior still apply.

Example uses the entry selected in Overview. It starts with that entry's first
saved case, or says that no example is recorded. A sample is neutral text: type,
data, and message examples do not imply a call. Optional input and output keep
their saved text. The result summary precedes a lazy result disclosure, which
labels excerpts. The basis and the example's own status remain visible. Choom
does not run, fetch, or interpret sample content.

Copy example writes exactly the selected sample text to the host clipboard.
Success is announced only after that write completes. An unavailable or denied
clipboard leaves selectable text and manual-copy guidance. The latest request
owns feedback. A new entry, case, frame, or baseline invalidates older feedback,
even when local IDs repeat or a user returns to an earlier entry. Tab changes
keep the same request current. This does not cancel a write at the operating
system boundary.

The mounted interface frame owns the selected case, result disclosure, copy
feedback, and one scroll position per tab. New entry and case selections close
the result, clear feedback, and reset the Example position. An entry change in
Overview does not move Overview. Sticky tabs remain reachable; restoration and
reset keep the focused control visible within a narrow or short Record content
area. Only this container scrolls. No per-entry history or global cache is added.

## Starter and checks

The initial heading is **Architecture starts here.** with a Desktop or Browser
badge. **Explore example** opens a starter baseline in the same component viewer.
It can be closed and opened again. Loading and layout failures are announced.
A successfully opened baseline replaces the example.

Use `bun run test`, `bun run test:behavior`, and `bun run test:e2e` for unit,
public-boundary, and built-browser behavior. Focused checks are:

```sh
bun test ./test/unit/architecture/baseline-workflow.test.ts
bun test ./test/interface/architecture/load-workflow.test.ts
bun run test:behavior --tags @bv-03
bun run build
bun scripts/run-browser-behavior.ts --tags @bv-03
bun test ./test/unit/lib/architecture-layout.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/architecture-diagram.test.tsx
bun scripts/run-browser-behavior.ts --tags @bv-04
bun scripts/run-browser-behavior.ts --tags @bv-05
bun test ./test/unit/lib/architecture-viewport.test.ts
bun scripts/run-browser-behavior.ts --tags @br-02
bun test ./test/unit/lib/component-arrangement.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/component-layout-controls.test.tsx
bun scripts/run-browser-behavior.ts --tags @br-04
bun scripts/run-browser-behavior.ts --tags @br-07
bun scripts/run-browser-behavior.ts --tags @br-08
bun test --preload ./test/preload.ts ./test/unit/components/architecture-details.test.tsx
bun scripts/run-browser-behavior.ts --tags @bv-06
bun test --preload ./test/preload.ts ./test/unit/components/interface-overview.test.tsx
bun scripts/run-browser-behavior.ts --tags @br-10b
bun test --preload ./test/preload.ts ./test/unit/components/interface-examples.test.tsx
bun scripts/run-browser-behavior.ts --tags @br-10c
```

Installed acceptance uses the actual app and picker; see the
[native acceptance record](../../docs/change-requests/BV-native-acceptance.md).
Build and type checks do not establish runtime behavior. Local durations and
safe errors are not a production reliability or latency claim.
