# Baseline viewer readability plan

Status: **BR-01 to BR-04, BR-07A to BR-07D, BR-08A to BR-08D, and
BR-10A to BR-10F are merged. BR-11A to BR-11F are in implementation as a draft
PR stack. BR-05 is superseded by the separate BR-09 graph design;
BR-07 replaced BR-06.**

Reviewed: **2026-11-14 UTC**

## Decision and goal

Show components first. When the user selects a component, show its interfaces
in a side panel. Let the user move components to make the drawing easier to read.
BR-07 adds interface arcs between recorded consumers and owners. BR-08 reduces
their visual load: show connections for the selected component, reveal labels
on demand, and hide self-connections by default. Keep the interface counts and
the side panel. Provide explicit controls to see all connections or self-use.

The view rules below describe the target after BR-08. BR-08 replaces BR-07's
always-visible arcs and labels, default self-loops, and focus rules for controls
that a filter removes. The completed BR-07 tickets remain a delivery history;
their superseded assertions are identified in BR-08.

[BR-11](#source-consumer-connections) adds connections found in reviewed source.
It keeps permission policy separate from source use. Its version 3 rules replace
the arc data source, legend, and missing-data messages for that version only.
Version 1/2 files retain permission arrows. Selection, movement, labels on demand,
and hidden self-connections keep the BR-08 behavior.

This plan follows the [baseline viewer plan](cr-baseline-viewer-plan.md).
BR-01 to BR-04 replaced that plan's rules for showing every record on the canvas,
double-click inspection, and automatic fitting on resize. Read-only file access,
statement meanings, and load protections stay in force. BR-10 adds the explicit
version 2 extension below while retaining strict version 1 support. BR-11 adds
an explicit version 3 extension; it does not reinterpret either older format.

This document defines the intended behavior and ticket sequence. Its scenarios
are requirements, not test results. See the
[verification record](../change-requests/BR-readability-evidence.md) for completed
checks and platform limits. That record describes checks made before the stack
merged; its draft-PR wording is historical. The status above is current.
See the [BR-07 verification record](../change-requests/BR-interface-arcs-evidence.md)
for interface-arc implementation checks.
See the [BR-08 verification record](../change-requests/BR-connection-readability-evidence.md)
for connection visibility, label, and view-lifetime checks.
See the [BR-10 verification record](../change-requests/BR-interface-details-evidence.md)
for interface documentation, signature, publication, and reading checks. Its
draft-stack wording describes the checks before merge.
See the [BR-11 verification record](../change-requests/BR-source-consumer-evidence.md)
for source-consumer implementation checks and publication evidence.

## Problem in the starting view

The original baseline-002 example contains 5 components, 8 interfaces, and
5 resources. Before BR-01, the view gave all 18 records large cards. Interfaces
and resources sat outside their owners, with ownership lines crossing the drawing.
Repeated IDs, types, and statuses competed with names, which were often truncated.

Dragging was disabled. The detail panel blocked interaction with the canvas,
and resizing fitted the whole diagram again.

After BR-07, the baseline-003 screenshot shows nine arrows, including three
self-loops. Long curves and always-visible labels compete with the components.
Opaque label backgrounds hide parts of other curves. Showing every connection
at once makes even this small model hard to read.

## Delivery scope

| Stage | Tickets | Result |
| --- | --- | --- |
| Merged | BR-01 to BR-04 | Side-panel inspection, a compact component overview, movement, and reset. |
| Superseded | BR-05 | The separate BR-09 graph design replaces canvas collapse. |
| Superseded | BR-06 | Replaced by BR-07; do not implement the temporary interface node. |
| Merged | BR-07A to BR-07D | Interface arcs, unknown-endpoint explanations, inspection, and complete-drawing Fit. |
| Merged | BR-08A to BR-08D | Selected connections, labels on demand, optional self-connections, and Fit/lifetime checks for the filtered view. |
| Merged | BR-10A to BR-10F | Versioned interface documentation, saved signatures, examples, sources, and publication checks. |
| In implementation | BR-11A to BR-11F | Source-consumer records, usage arrows, readable caller details, and supported external analysis/publication. |

BR-07 follows review of the component-only view. It can build directly on BR-04;
it does not require BR-05. The collapse rules below apply when both features
exist. BR-05 is retained below as history. BR-08 builds on BR-07D and does not
require BR-05. BR-10 keeps the merged graph behavior while improving interface details.
The separate BR-09 graph prototype still needs reader validation.
BR-11 builds on BR-10 and does not require BR-09B to BR-09F. It does not approve
or implement the pending graph redesign.

Remember the arrangement while the current baseline remains open. Saving it
across app restarts or successful file opens remains out of scope, as do
multi-selection, comparison panels, general record filters, interface editing,
model editing, export, and automatic dependency inference inside Choom. BR-11
updates the separate analysis workflow to supply reviewed source-use records.
BR-08 adds only the
two connection controls defined below. New routing algorithms, connection
bundling, and group collapse are outside this change.

## View behavior

### Component overview

- Show components and their recorded nesting. Start with all component groups
  expanded. Do not reduce a single-root baseline to one closed root card.
- Use a small, selectable name header on a parent boundary. Do not put another
  full component card inside that boundary to repeat the parent name.
- A component shows its name and the number of interfaces it directly owns.
  The count excludes interfaces owned by descendants and unknown owners.
- Keep the five reviewed component names readable at the initial overview on a
  1280 by 800 viewport. Allow names to wrap. For unusually long names, use a
  bounded card with an accessible full name and complete text in the panel.
  Keep the normal card font size. Start at 100% zoom. If the drawing fits,
  center it; otherwise start with the first root header in view, in baseline
  order. Larger drawings can require panning. Explicit Fit view can zoom out
  to show the whole drawing.
- Keep IDs, purpose, membership, evidence, and statement status in the panel.
  Do not assign a single accepted/proposed status to a whole component.
- Keep interface and resource nodes off the canvas. BR-01 to BR-04 hide all
  relationship lines. BR-07 adds arcs; BR-08 controls their visibility below.
  Component nesting shows the parent relationship without lines; resource
  details stay in the panel.
- Check limits against the complete baseline before layout. Hiding records does
  not increase the supported limits or make excessive input valid.

### Side panel and record access

Use one side panel. On wide windows it sits beside the canvas and does not
block it. The user can select another component, pan, zoom, and move components
while it is open. Keep this existing behavior, without an overlay or focus trap.
When the window cannot fit both regions, place the panel below the canvas.
Keep both regions usable without horizontal page scrolling. Keep the canvas
and panel header in view; scroll long panel content within its region.

| Action | Result |
| --- | --- |
| Select a component with one click, Enter, or Space | Highlight it. Show its name and directly owned interfaces in the panel. |
| Select the same component again | Keep its panel open; do not toggle it closed. |
| Select an interface in the list | Show its complete recorded details in the same panel. |
| Select an interface arc (BR-07) | Show that interface in the same panel, starting a new inspection path. |
| Use Back in record details | Return to the originating component or baseline list and restore the list position and row focus. |
| Expand Resources | List resources directly owned by this component. Each opens complete details. |
| Expand Recorded details | Show all fields of the selected component, with exact statement statuses and references. |
| Open Baseline details | Show baseline metadata and lists of all components, interfaces, and resources. Label unknown owners explicitly. |
| Open Rules | Keep the recorded rule list and complete rule details available. |
| Close the panel | Clear inspection selection. Restore focus only as specified below. |

Baseline lists provide a route to every record, including records whose owner
is unknown and records hidden by a collapsed group. An interface listed under
a component is directly owned by it; being an allowed consumer does not make
the component its owner. Lists use IDs for identity. Repeated names remain
distinct and show an ID where needed to tell them apart. Keep list order equal
to baseline order; do not add sorting controls.

Keep panel navigation small: Baseline details can open a component; a component
can open an owned interface or resource. Back returns one level, restoring that
list's scroll position and row focus. A direct canvas selection, Baseline
details, or Rules starts a new path. Do not keep an unrelated visit history.
Keep the originating component highlighted while inspecting one of its owned
records. Baseline details and Rules have no component highlight. Keyboard focus
alone and component movement do not change the record being inspected.

Show a useful empty message for a component without owned interfaces or
resources. A baseline with no components still exposes interfaces, resources,
and rules through its lists. Four empty collections show **No architecture
items modeled**. Preserve the distinction from **No components modeled**.

The camera is the canvas pan and zoom. Inspection preserves the camera and
component positions. Keyboard activation moves focus into the panel. Pointer
selection on the canvas keeps focus there.
If a panel update removes the focused row, move focus to the new record heading.
Clicking canvas background keeps the panel open.

Handle Escape in this order: cancel an active drag; otherwise collapse the
expanded rule that contains keyboard focus; otherwise close the panel. One
press performs one action. Collapsing a rule returns focus to its summary.

If focus was inside the closing panel, return it to the control that opened
that inspection path. If that control is hidden, use its nearest visible
ancestor, then Baseline details as the fallback. If focus is already outside
the panel, leave it there if that control survives the view change. Apply the
arc focus fallback below when filtering removes it. A successful file open has
its own focus rule below.
If keyboard focus reaches an off-screen canvas control, pan only enough to
reveal it and preserve zoom. Apply the same rule after keyboard movement. If
the control is larger than the canvas, reveal its start and the nearby focus
outline; do not fit the whole group or reduce zoom. This also applies to BR-07 labels.

### Movement, reset, and view state

The baseline remains immutable. Canvas coordinates, selection, panel navigation,
and collapse choices are view state, separate from recorded data. Derive arcs
from the baseline and current component geometry; do not store edited links.

| Operation | Rule |
| --- | --- |
| Drag a component header | Move that component. A parent carries its descendant component positions with it. |
| Move a child | Keep its recorded parent and keep it below the parent's header. Grow enclosing bounds to the right or bottom as needed; stop at the left or top boundary. |
| Move with the keyboard | Arrow keys on a focused component header move it by 10 diagram units, then reveal it at the current zoom if needed. Leave panel keys alone. |
| Finish a drag | Do not treat the release as a click that opens or replaces the panel. |
| Cancel an active drag | Escape or an interrupted drag restores the positions and bounds from the start of that drag. |
| Fit view | Fit all shown components and arcs, including arrowheads and currently revealed labels. Include items outside the viewport; keep all positions. |
| Reset layout | Restore the initial component positions and bounds, then use the same 100% starting view as a new open. Keep panel content and redraw arcs. With BR-05, expand all groups. |

Use the same movement rules for pointer and keyboard input. Keyboard moves are
announced without announcing every pointer frame. Automatic layout starts
without overlapping components. Manual movement may create overlap; do not
move unrelated components to repair it automatically. Reset restores the initial
arrangement and brings it back into view. Fit view keeps the user's arrangement.
Reset also ends an active drag; later events from that drag must not undo it.

Keep manual positions during selection, panel navigation, pan, zoom, and resize.
Failed or cancelled loads keep the arrangement, panel, and camera unchanged.
Keep example availability as it is today: the user
can open it before a baseline file is loaded. The example uses the same viewer
interactions and keeps its arrangement if a file load fails or is cancelled.
Closing the example ends that view; opening it again starts fresh. Successfully
opening a file replaces the example with a fresh view of that file.

A successful load starts a fresh view, even when reopening the same file or
using the same baseline and item IDs. Set the starting view once after the
canvas has a usable size. Close the old panel, end any active drag, and ignore
later events from that old view. If focus was in the old canvas or panel, move
it to the new baseline heading; otherwise leave focus where it is.
A late cancelled load cannot replace or reset the current view.

Resize preserves pan, zoom, and positions. Panel changes do too, except for
keyboard focus reveal. Reset layout, Fit view, and Reveal component use their
explicit camera rules. They do not run a new automatic arrangement.
Reset uses the prepared initial layout; it does not read the file or run layout
again. With no canvas nodes, Fit view and Reset layout are unavailable and
baseline lists remain usable.

### Follow-up: collapse component groups

Give a parent a separate expand/collapse control. Selecting its name still
opens the panel. A collapsed parent shows its name, owned-interface count, and
number of hidden descendant components.

Collapse hides descendant component nodes, without changing recorded parents
or throwing away their positions. Keep the parent origin and unrelated nodes
fixed. The group can become smaller, leaving free space in the drawing.
Expanding restores the stored child positions and the children's own collapse
choices. Moving a collapsed parent carries its hidden descendants too.
Expansion and Reveal component use the same ancestor-growth rule as movement.
This keeps restored children inside their parents without moving parent origins
or siblings. Ancestor bounds do not shrink automatically.

If the panel refers to a hidden component, including one opened from the
baseline list, identify its nearest visible collapsed ancestor. **Reveal
component** expands only the ancestors needed to expose it, then pans to its
header at the current zoom. Keep other collapse choices. If collapse hides a
focused canvas control, move focus to the collapsed parent's control.

### Interface arcs: BR-07 facts and BR-08 view rules

The permission rules in this section remain the version 1/2 behavior.
[BR-11](#source-consumer-connections) defines version 3 source-use arrows and
their messages. It keeps the scope, drawing, inspection, and movement rules
below unless it explicitly replaces them.

The arc represents the interface. Show a curved arrow from each recorded allowed
consumer to the recorded owner. Reveal the interface name on demand:

```text
Consumer ── interface name ──▶ Owner
```

Keep a short legend beside the connection controls:
**Arrow: consumer may use the owner's interface.** This describes recorded
permission, not observed calls, data flow, or a confirmed runtime dependency.
Do not add temporary interface nodes.

#### Connection scope

Add **Connections: Selected / All**, with **Selected** as the default. Keep the
same component cards at the same positions when the user switches choices.
Selected shows direct connections for the component in the current inspection path. It does
not include descendant-only connections when a parent is selected.

Derive the scope from the existing inspection path. A component reached through
Baseline details counts as a selected component too. Do not add a second stored
selection just for arrows.

| Inspection in Selected mode | Arcs eligible to be shown |
| --- | --- |
| Component, or an owned interface/resource with that component in the path | Arcs where that component is the consumer or owner. |
| Interface with no component in the path, including a direct arc selection | Arcs for that interface. This keeps its connections visible while its details are open. |
| Closed panel, Baseline details, Rules, or a resource without a component in the path | None. |

**All** shows all known arcs regardless of the inspection path. It does not
change the open panel. Both choices also apply the self-connection rule and,
when BR-05 exists, the collapse rule below.

Add **Show self-connections**, off by default. A self-connection has the same
component as consumer and owner. When enabled, show its loop only if it belongs
to the current scope. Keep self-use in the recorded details and interface counts
when the loop is hidden. Do not classify hidden self-use as unknown.

Keep these controls and the legend in a stable area above the canvas, including
when no arcs are shown. A selection must not insert a row and shift the drawing.
Use the neutral message **No connections shown.** in either mode when the
filtered set is empty. Reserve its space when it is absent, including at narrow
widths and enlarged text sizes. This message does not mean that
the baseline has no consumers or that its endpoint facts are unknown. With no
components, retain the existing no-components view and lists; omit canvas
connection controls.

Changing scope, showing self-connections, or inspecting a record must not move
components or fit the camera. Clicking empty canvas keeps the current panel and
scope, as it does today. Closing the panel clears the Selected scope. The All
choice remains active until changed or a new view opens.

#### Recorded facts and unknown values

Read `owner.value` and `allowedConsumers.value` from each interface. An arc
needs both endpoint IDs. The following table defines the complete set of known
arcs before any view filtering.

| Recorded owner | Recorded allowed consumers | Canvas and panel result |
| --- | --- | --- |
| Known | Known, nonempty list | One eligible arc from each listed consumer to the owner. Keep the complete list in the panel. |
| Known | `null` | No arc. Keep the owner's interface count. Show **Allowed consumers are unknown.** in the interface panel. |
| `null` | Known, nonempty list | No arc. Show **Owner is unknown.** and keep the known consumer list in the panel. |
| `null` | `null` | No arc. Explain both unknown values in the panel. |

Unknown consumers do not mean no consumers. The current format cannot express
a known empty consumer list. Preserve validation of empty lists, duplicate
consumer IDs, and references to missing components; invalid input must not
become a partial diagram. A valid `null` is missing knowledge, not a load error.
Do not infer endpoints from component nesting, `publicAccess`, rules, names,
source code, or repository analysis. Do not add placeholder components or
unconnected arrow stubs.

When any interface has an unknown owner or allowed-consumer list, show a short
note above the canvas or the no-components message. For example: **8 interfaces
have unknown owners or allowed consumers. Open Baseline details to inspect them.**
Count each interface once, even when both facts are unknown. Use the existing
Baseline details route. Keep the note readable at narrow widths without covering the
drawing controls. With no unknown endpoint facts, omit the note. A baseline
with no interfaces needs no unknown-interface note.

The reviewed `test/fixtures/baseline-viewer/full.yaml` records an owner for each
of its eight interfaces, but all eight allowed-consumer lists are unknown. It
must show the explanation and no arcs. New arcs require consumers recorded by
the baseline author; BR-07 does not change that file's meaning. Use separate
synthetic fixtures to verify arcs.

Use `(interface ID, consumer ID, owner ID)` as arc identity. Preserve distinct
interfaces between the same components, opposite directions, and multiple
consumers of one interface. An owner also listed as a consumer has a known
self-connection; draw its loop only when the view rules allow it.
The owned-interface count still counts each directly owned interface once.

Keep the exact owner and allowed-consumer statements, statuses, and evidence in
the panel. They can have different statuses. Do not give their combined arc a
single accepted/proposed status or repeat status text along the drawing.

#### Drawing and inspection

Attach arcs to the actual header borders, including parent-child links. Arcs
must remain visible inside groups; header names and controls must stay readable
and usable. Test these outcomes with nested groups rather than prescribing a
global layer order. The same baseline and positions produce the same curves.
Separate parallel arcs enough to identify them in small diagrams. Manual moves
can cause crossings or overlap; do not move other components to repair them.

Reveal a shown arc's label when its curve or label is hovered, its control has
keyboard focus, or its interface is the current inspected record. Hide the
text otherwise. Selecting a component alone does not reveal all its arc labels.
Keep the label visible while the pointer moves from the curve to the label.
Pointer or touch activation of a curve opens details in one action; hover is
not required. Focus set by pointer input alone does not keep a label revealed
after hover and inspection end. Use the existing input-mode distinction.

Use a transparent label background. A small text halo may help contrast, but
no filled label rectangle may cover other curves. Labels scale with the diagram.
Use at most two lines and no more width than a component header. Keep the full
name in the accessible label and panel. The accessible label also identifies
the consumer and owner, with IDs where names repeat.

Give the curve a generous pointer target and retain one keyboard control for
each shown arc, even while its text is visually hidden. Keyboard focus reveals
the label and a visible focus outline. Hidden text must not leave an invisible
rectangle that intercepts pointer input. An arc excluded by the scope or self-connection
rule has no pointer target or keyboard stop. Preserve the identity and keyboard
order of surviving controls when visibility changes.
Arc input must not start a canvas pan or component drag. The first press after
an arc is shown must work, including after a component drag; it needs no earlier
press to enable arc input.

| Current inspection | Emphasis within the shown arcs |
| --- | --- |
| Component | Highlight its incoming and outgoing arcs; dim unrelated arcs in All mode. |
| Interface, opened from an arc or a list | Highlight its shown arcs and reveal their labels; dim other shown arcs. Other shown labels still respond to hover and keyboard focus. |
| Resource, Baseline details, Rules, or closed panel | Show arcs normally. |

An arc selection opens the existing interface panel and starts a new inspection
path, without a Back entry. Selection from an owned-interface list keeps that
list's Back behavior and the originating component highlight. Do not add a
second persistent selection model for arcs. Direct arc selection uses the
interface-only scope in Selected mode. Different arcs for one interface open
the same recorded details. Retain the exact initiating arc as the preferred
focus return target.

Pointer selection keeps focus on the arc's label. Keyboard activation moves
focus to the panel heading. When closing the panel, restore the initiating
control if focus was in the panel and that control will remain shown. If an arc
opener will not remain shown, return focus to its owner header instead, then
its nearest visible ancestor, then Baseline details. Apply this fallback also
when closing the panel removes an
arc that currently has focus outside the panel; use that focused arc's owner,
which can differ from the opener's owner. If focus is already on an
outside control that survives, leave it there. Never keep an arc visible only
to restore focus. Keep the existing Escape order: cancel an active move before
closing inspection.

Keyboard focus alone reveals a label; it does not select an interface or change
the connection scope.
Keyboard navigation and keyboard focus return use the shared focus-reveal rule,
including its fallback when the enlarged label cannot fit in the canvas.
Pointer-driven label focus must not pan, even when the clicked curve is visible
and its label is off-screen. Do not fit the whole arc. Keep arc keyboard order
stable in interface order, then consumer order.
The existing lists remain an alternative way to inspect every interface.

#### Movement, fitting, and view lifetime

Derive arc paths from the current arrangement. Pointer and keyboard movement,
parent movement, ancestor growth, cancellation, and Reset must update them.
Arcs have no separate manual positions or saved arrangement.

Fit view includes all shown components and the full bounds of shown curves and
arrowheads. Include only labels revealed when Fit is activated. A hidden label's
HTML bounds must not enlarge the fit. Include self-loops only when shown. It uses
the actual canvas space beside or above the open panel. Use a positive, finite
zoom small enough to contain those bounds. The current 1% zoom floor must not
clip a widely spread drawing. After Fit, Zoom Out decreases zoom when enabled
or is disabled at the minimum. Zoom In remains available. Neither control may
snap back to a larger minimum. Selection, panel close, resize, movement, label
reveal, and connection choices do not fit the view. Initial open and Reset keep
the 100% starting-view rule. Reset restores positions and camera; it keeps the
inspection path and connection choices. Label visibility follows actual hover,
focus, and inspection after the reset, rather than saved visibility flags.

Apply the existing view lifetime rules to arcs as well as components. A pending
arc press belongs to the view where it started; releasing it after a successful
open must not select a record in the replacement view, even if IDs repeat.
Hiding an arc also cancels its pending press. Showing the same tuple again must
not revive that press. Reset cancels pending input too.

Cancelled, failed, and ignored late loads preserve the current view choices.
Every successful open starts with Selected, self-connections off, no inspection,
and the existing initial camera, even if the new file repeats the same IDs.

#### Compatibility with BR-05

BR-07 does not require collapse. When BR-05 and BR-07 are both present, hide an
otherwise eligible arc if either actual endpoint header is hidden. Never redirect
it to an ancestor. Collapsing an endpoint itself keeps its header and arcs visible if
the other endpoint remains visible. Expansion restores arcs at stored positions.
Inspection does not expand groups or fit the view. Keyboard focus reveal still
applies.

Keep interface details available and explain when a collapsed group hides a
known connection. Distinguish this from an unknown endpoint. If collapse hides
the focused arc label, move focus to that group's collapse control. If an arc
opener is hidden when the panel closes, use the owner's visible header or its
nearest visible ancestor, then Baseline details. Leave focus alone when it is
already on an outside control that survives. The ticket implemented last must
verify this combined behavior; neither ticket needs to implement the other one.

## Implementation boundaries

Reuse React Flow, ELK, the current baseline validator, and the file readers.
No new package, analysis service, storage service, or native command is needed.

| Area | Responsibility |
| --- | --- |
| [Architecture diagram](../../src/components/architecture-diagram.tsx) | Selection, movable view positions, and explicit view controls. Preserve the camera on resize. |
| [Side panel](../../src/components/architecture-inspector.tsx) and [inspection state](../../src/components/use-architecture-inspection.ts) | Nonmodal inspection, owned-item lists, baseline lists, and local Back navigation. |
| [Recorded fields](../../src/components/architecture-details.tsx) | Preserve complete fields, statement statuses, references, and rule details. |
| [Layout](../../src/lib/architecture-layout.ts) and [geometry](../../src/lib/component-geometry.ts) | Prepare compact component-only geometry with header and child space. Check exact component coverage and valid containment. |
| [Arrangement](../../src/lib/component-arrangement.ts) and [gestures](../../src/components/use-component-gestures.ts) | Own manual positions, containment, ancestor growth, cancellation, and Reset for one current view. |
| [Camera rules](../../src/lib/architecture-viewport.ts), [bounds](../../src/lib/architecture-bounds.ts), and [Fit control](../../src/components/fit-drawing-control.tsx) | Calculate the starting view, keyboard focus reveal, and Fit bounds for the currently shown drawing. |
| [Arc projection](../../src/lib/interface-arcs.ts) and [arc controls](../../src/components/interface-arc.tsx) | Preserve complete recorded arcs and unknown-endpoint facts. Filter the displayed set, anchor arcs to current headers, and reveal labels on demand. |
| [Workspace view](../../src/architecture/workspace-view.ts) and [app](../../src/App.tsx) | Reset view state on each successful file open. Keep the existing example path. |
| [Workspace contract notes](../../cookbook/interfaces/workspace.md) | Update display coverage, inspection, focus, movement, and fitting rules when their tickets are implemented. |

The initial published baseline/layout pair stays read-only. Keep user positions
in a viewer-owned copy. Derive interface ownership lists and counts from the
baseline; do not maintain a second mutable architecture model. Each kind of
view state has one owner: reuse the existing inspection state, arrangement, and
gesture owners. They share the lifetime of the current baseline/layout pair,
which stays stable until a successful open. Do not key that lifetime by saved
IDs or progress updates. No new load ID or persistent cache is needed. Keep the
two connection choices local to that view. Derive shown arcs and labels from
those choices and existing inspection, hover, and focus; do not copy them into
a second mutable graph. Keep existing layout and routing. Filtering must not
rerun ELK or rearrange the remaining components.

The prepared layout already contains every component exactly once and no
interface or resource nodes. Keep that coverage. All records remain available
to the inspector. Keep finite positions, valid dimensions, parent order, and
child containment checks. Runtime
movement applies the same containment rules to its own view geometry.

Assess all four constraint categories in the
[feature cookbook](../new-feature-cookbook.md). Update Cucumber features, relevant
manifest links, and workspace boundary notes. Do not change the baseline
TypeSpec schema for UI-only state. If implementation changes a Choom-owned data
or operation boundary, update its TypeSpec source and generated outputs in the
same ticket. Record unchanged architecture/OpenSLO constraints as unchanged.

## Appendix: Tickets

### Working sequence for planned tickets

1. For production behavior, after the predecessor passes, write the Cucumber
   acceptance scenarios first.
   Connect them to the real app or an existing public boundary. Each scenario
   has one When–Then pair. Record an assertion failure caused by missing behavior.
   For an absent arc or control, assert the expected presence or count after
   setup succeeds; do not rely on a failed attempt to click it.
2. Work through each TDD row in order. **Red:** write a focused test and observe
   its behavior assertion fail. **Green:** make the smallest useful change that
   passes it. **Refactor:** simplify the working code with tests green. Do not
   add an abstraction just to have a refactor change.
3. Keep existing behavior as passing characterization before changing it. If an
   earlier step already makes a later case pass, record that and keep the test;
   never break working behavior to manufacture red. Missing steps, imports,
   tools, fixtures, type errors, and locator-action errors are setup failures.
4. Rerun the relevant acceptance when its behavior is connected to the app.
   Before closing a ticket, run all its scenarios, changed focused tests, affected
   earlier acceptance, and the required checks below. Record actual red/green
   assertions, commands, results, and limits. Build output is not behavior evidence.

Use the [test definitions](../coding-principles.md#test-types), the DRY3 rule in
the [coding principles](../coding-principles.md), and the
[Gherkin guide](../gherkin-guide.md). Here, **native unit** means calculations
within the root workspace; **DOM unit** means its React behavior. Use interface
tests for public contracts and integration tests for real interactions between
Choom workspaces. Test layout, focus, and input outcomes in the browser too.

Put focused suites under the corresponding `test/unit/lib/` or
`test/unit/components/` group. Keep native and DOM tests in separate processes.
Shared fixtures belong in `test/support/` or `test/fixtures/`; browser steps go
in `test/steps/`. Reuse the existing validator contract tests as characterization.

Put features under `cookbook/behavior/baseline-viewer/`, tagged
`@baseline-viewer`, `@baseline-readability`, and the ticket ID. BR-07 uses
`@br-07` plus `@br-07a` through `@br-07d`; BR-08 uses `@br-08` plus `@br-08a`
through `@br-08d`. Use `@browser` or `@packaged` for the
execution environment. Register changed artifacts with the real runners and
owning manifests. Do not add the superseded BR-06 cases or tests for this plan.
BR-11 production scenarios use `@br-11` and the ticket tag. Its prompt and
publication tickets use real command/artifact checks, as BR-10E does; do not
add behavior tests solely for scripts or documents.

The scenarios and TDD steps are requirements, not evidence that tests have run.
The verification records above contain actual implementation and test results.

| Ticket | Deliverable | Depends on |
| --- | --- | --- |
| [BR-01](#br-01-inspect-components-in-a-side-panel) | Side panel, owned-item navigation, and access to every saved record. | Existing BV viewer |
| [BR-02](#br-02-show-a-compact-component-overview) | Components-only initial drawing and smaller group headers. | BR-01 |
| [BR-03](#br-03-move-components-and-retain-the-current-arrangement) | Pointer/keyboard movement and view state that survives ordinary use. | BR-02 |
| [BR-04](#br-04-separate-reset-layout-from-fit-view) | Restore the initial arrangement or fit the current one. | BR-03 |
| [BR-05](#br-05-expand-and-collapse-component-groups) | Stable group expansion and collapse. Follow-up. | BR-04 |
| [BR-06](#br-06-show-one-interfaces-recorded-connections) | Superseded by BR-07. | Not scheduled |
| [BR-07](#br-07-use-interface-arcs-between-components) | Recorded interface arcs, unknown-endpoint explanations, inspection, and stable geometry. | BR-04 |
| [BR-08](#br-08-reduce-connection-clutter) | Selected connections, labels on demand, optional self-connections, and view-state checks. | BR-07D |
| [BR-11](#br-11-record-and-show-source-consumer-connections) | Source-use contract, viewer, analysis prompts, and publication. | Merged BR-10 |

BR-01 preceded hiding nodes in BR-02 so each record retained a route to its
details. BR-01 to BR-04 landed as a PR stack. Keep future tickets reviewable on
their own. Each umbrella ticket's smaller tickets define implementation order; this plan
does not change the repository's pull-request review and approval rules.

### BR-01: Inspect components in a side panel

**Merged.** One selection opens a nonmodal panel. Owned lists, Baseline details,
Rules, and Back keep every record reachable, with the specified focus behavior.
Keep the [inspection acceptance](../../cookbook/behavior/baseline-viewer/inspection.feature)
as regression coverage. Completed checks are in the
[BR-01 evidence](../change-requests/BR-readability-evidence.md#br-01-inspect-records-in-a-side-panel).

### BR-02: Show a compact component overview

**Merged.** The canvas shows nested components with direct-owned interface counts
and starts at 100% zoom. Records remain available through the panel. BR-07
replaces the general no-lines rule for interfaces with known endpoints.
Keep the [overview acceptance](../../cookbook/behavior/baseline-viewer/overview.feature)
and [record-meaning acceptance](../../cookbook/behavior/baseline-viewer/relationships.feature).
See the [BR-02 evidence](../change-requests/BR-readability-evidence.md#br-02-show-a-compact-component-overview).

### BR-03: Move components and retain the current arrangement

**Merged.** Pointer and keyboard movement preserve recorded nesting. Parent
moves carry descendants; cancellation restores positions and bounds. The
current baseline/layout pair owns the view lifetime, including reused IDs.
Keep the [movement acceptance](../../cookbook/behavior/baseline-viewer/movement.feature).
See the [BR-03 evidence](../change-requests/BR-readability-evidence.md#br-03-move-components-and-keep-the-current-arrangement).

### BR-04: Separate Reset layout from Fit view

**Merged.** Reset restores initial geometry at 100% and keeps inspection. Fit
changes the camera without moving components. BR-07 extends Fit to include arcs.
Keep the [layout-control acceptance](../../cookbook/behavior/baseline-viewer/reset.feature).
See the [BR-04 evidence](../change-requests/BR-readability-evidence.md#br-04-restore-the-initial-layout-or-fit-the-current-arrangement).

### BR-05: Expand and collapse component groups

**Follow-up. Acceptance first — `@br-05 @browser`:**

```gherkin
Scenario: Offer a separate collapse action
  Given a baseline contains a parent component with a child
  When the user opens the baseline
  Then the parent offers separate selection and collapse actions

Scenario: Collapse a parent without moving its neighbors
  Given Workspace and its descendants are expanded
  When the user collapses Workspace
  Then its descendants are hidden and its hidden-component count is shown
  And Workspace's origin and Native shell's position remain unchanged

Scenario: Restore a manually arranged subtree
  Given the user has moved Architecture model inside Workspace
  And Workspace is collapsed
  When the user expands Workspace
  Then Architecture model returns at its stored position relative to Workspace

Scenario: Move a collapsed subtree
  Given Workspace is collapsed
  And the user has moved it to the right edge of Choom
  When the user expands Workspace
  Then its descendants appear at their stored positions relative to its new origin
  And Choom grows to contain the expanded Workspace without moving other components

Scenario: Preserve a child's collapse choice
  Given a collapsed child group is inside a collapsed parent group
  When the user expands the parent group
  Then the child group remains collapsed

Scenario: Keep hidden selection understandable
  Given Architecture model is selected
  When the user collapses its ancestor Workspace
  Then Architecture model's panel remains available
  And the panel identifies Workspace as the ancestor hiding it
  And Reveal component is available

Scenario: Reveal a hidden component without expanding unrelated branches
  Given the inspected component is hidden and another branch is collapsed
  When the user reveals the inspected component
  Then its required ancestors expand and its header comes into view at the current zoom
  And the other branch remains collapsed
```

**Expected first failure:** After a successful open, the assertion that the
parent offers a separate collapse action fails. Do not attempt to activate a
missing control as the first red result.

**Small TDD cycles:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Visibility | Native unit: collapse hides descendants and counts them while retaining the parent. | Derive visibility from parentage and collapse choices. | Reuse ancestry rules; keep direct-interface counts unchanged. |
| 2 — Stored geometry | Native unit: a moved collapsed subtree expands at stored positions and grows enclosing bounds. | Keep hidden positions and nested collapse choices. | Reuse movement containment; do not rerun layout. |
| 3 — Controls | DOM unit: select and collapse have separate actions and preserve unrelated positions. | Add the collapse control and render the derived view. | Keep component selection with its existing owner. |
| 4 — Reveal and focus | DOM unit: a hidden inspected component identifies its ancestor and can be revealed at unchanged zoom. | Expand only required ancestors and apply the existing reveal rule. | Share focus fallback only where the rules match. |
| 5 — Lifetime | DOM unit: Reset expands all groups while keeping details; successful opens clear choices and failed opens keep them. | Tie collapse choices to the current view and Reset action. | Reuse existing lifetime boundaries. Keep cases already passing as characterization. |

**Complete when:** Collapse reduces visible detail without losing context,
positions, or record access. Review a 16-level fixture and the real five-component
baseline. If BR-07 is already present, also verify its collapse compatibility
rules. Collapse does not block implementation of BR-07.

### BR-06: Show one interface's recorded connections

**Superseded by [BR-07](#br-07-use-interface-arcs-between-components).**
The temporary interface node and Show/Hide connections mode are no longer
planned. Retain this ticket ID for reference; its old acceptance scenarios do
not apply to BR-07.

### BR-07: Use interface arcs between components

**Merged.** This is the umbrella for BR-07A to BR-07D.
See the [verification record](../change-requests/BR-interface-arcs-evidence.md)
for results, source identity, measurements, and platform limits. The expanded
tickets below retain their original acceptance and implementation sequence.
They are a record of BR-07, not instructions to restore its old display defaults.
BR-08 replaces the assertions listed in its compatibility table below; retain
the remaining BR-07 behavior as characterization under the new view choices.
Each begins with its own acceptance test. The `@br-07` tag selects their combined
acceptance.

**Original scope:** Keep the baseline format, original
file bytes, component nesting, owned counts, and resource access unchanged.
BR-07 replaces BR-06 and depends only on BR-04. It adds no repository analysis,
inferred consumers, model editing, saved positions, or new connection mode.
It also replaces BR-02's general ban on relationship lines. Update tests that
assert no lines for known-consumer data; keep the reviewed baseline's no-arcs
assertion because its consumers are unknown.

The four outcomes are separate: draw arcs, explain unknown facts, inspect arcs,
and fit the complete drawing. Keep small implementation cycles within these
user-facing tickets instead of creating tickets for helpers alone.

| Ticket | Result | Depends on |
| --- | --- | --- |
| [BR-07A](#br-07a-draw-recorded-interface-arcs) | Correct arcs, endpoints, labels, and direction. | BR-04 |
| [BR-07B](#br-07b-explain-unknown-endpoints) | Clear reasons for absent arcs, with complete details. | BR-07A |
| [BR-07C](#br-07c-inspect-and-highlight-interface-arcs) | Pointer and keyboard inspection with stable focus. | BR-07B |
| [BR-07D](#br-07d-fit-arcs-and-preserve-them-through-view-changes) | Fit includes arcs; movement and load lifetime remain correct. | BR-07C |

Follow the [planned-ticket sequence](#working-sequence-for-planned-tickets).
Keep each ticket's acceptance green before proceeding to its successor.

**Complete when:** All four tickets pass their acceptance tests and the complete
viewer journey. Record the known-consumer and unknown-consumer cases separately.
The reviewed baseline must stay truthful even though it still has no arcs.

#### BR-07A: Draw recorded interface arcs

**Acceptance first — `@br-07 @br-07a @browser`:**

```gherkin
Scenario: Draw one interface for two allowed consumers
  Given Billing owns Invoice API and has no other owned interfaces
  And Checkout and Reporting are its recorded allowed consumers
  When the user opens the baseline
  Then two arcs labelled Invoice API point from those consumers to Billing
  And the legend explains that the arrows mean may use
  And Billing shows 1 interface
  And the canvas has no separate interface or resource nodes

Scenario: Preserve two interfaces between the same components
  Given two interfaces with the same name connect Checkout to Billing
  When the user opens the baseline
  Then two distinct arcs point from Checkout to Billing
  And their accessible names distinguish their interface IDs

Scenario: Preserve opposite permissions
  Given one interface permits Checkout to use Billing's interface
  And another permits Billing to use Checkout's interface
  When the user opens the baseline
  Then separate arcs show each interface and its recorded direction

Scenario: Show an owner using its own interface
  Given Billing owns Invoice API and is also its allowed consumer
  When the user opens the baseline
  Then a labelled self-loop starts and ends at Billing's header
  And Billing shows 1 interface

Scenario: Connect the actual headers in a nested group
  Given a parent is an allowed consumer of its child's interface
  When the user opens the baseline
  Then the arc starts at the parent's header and ends at the child's header
  And the arrow is visible inside the group while both headers remain usable

Scenario: Bound a long label without losing its name
  Given an interface name is too long for its canvas label
  When the user opens the baseline
  Then the label uses at most two lines and is no wider than a component header
  And its full interface name and endpoints are available to assistive technology
```

**Expected first failure:** The first scenario expects two arcs; the current
canvas renders none. Owned counts and component-only nodes already work and
remain characterization checks.

**Before implementation:** BR-04 must pass. Keep passing characterization for
direct-owned counts, component-only nodes, nesting, complete recorded fields,
and source limits. Preserve the reviewed baseline's unknown consumers.

**Small TDD cycles, in order:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| A1 — One endpoint pair | Native unit: one known owner and one allowed consumer produce exactly one consumer-to-owner arc. A null owner or consumer-list value produces none. | Derive the endpoint pair and interface ID from the two recorded fields. Do not infer missing values. | Keep this calculation separate from drawing coordinates; preserve the tested result. |
| A2 — Several consumers | Native unit: one interface with two consumers produces two arcs in recorded order. | Derive one arc per listed consumer. Keep one interface record and the existing owned count. | Remove duplicate traversal only where it makes the rule clearer. |
| A3 — Distinct identity | Native unit: repeated names, IDs containing separators, reverse permissions, and reordered input retain distinct identities. | Use an unambiguous interface/consumer/owner tuple; keep display order equal to input order. | Keep names out of identity and simplify lookup code without changing order. |
| A4 — Visible arrow | DOM unit: the diagram renders the known arc, its interface name, direction, and permission legend. | Connect the derived arc to the existing component canvas and render an arrow and label. | Keep rendering separate from baseline interpretation. Do not add a new state owner. |
| A5 — Actual header anchors | Native unit: arc endpoints use current header borders for separate roots and parent-child pairs, with finite coordinates. | Use actual component header geometry, including parent offsets. | Reuse existing geometry rules instead of duplicating parent-position logic. |
| A6 — Parallel and reverse paths | Native unit: two arcs sharing endpoints, including opposite directions, have distinct stable paths. | Add deterministic curve offsets without moving components. | Simplify path calculations; keep identity and routing order independent of names. |
| A7 — Self-loop | Native unit: an owner listed as its consumer has a finite loop outside its header with both endpoints on that header. | Handle coincident endpoint IDs explicitly. | Keep the loop rule small and separate from ordinary endpoint routing where useful. |
| A8 — Accessible labels | DOM unit: labels expose the full interface and endpoint names, with IDs that distinguish repeated names. | Use a two-line label no wider than a header, scaled with the diagram, and provide its full accessible name. | Reuse typography; keep display text separate from identity. |

Rerun the matching browser scenario after its supporting cycles pass. Browser
acceptance must check visible arrows, actual header attachment, usable headers, and
long-label bounds; native or DOM geometry tests alone cannot prove those
results. Do not snapshot incidental ELK positions or private SVG path strings.

**Where to work:** The diagram and its component geometry. Keep new calculations
near the owning viewer code. The prepared layout still contains components
only. This ticket does not add inspection behavior; BR-07C connects the arcs to
the existing inspector.

**Checks and completion:** Run `bun run test:e2e --tags @br-07a` and the shared
ticket checks, including affected overview acceptance. In small fixtures, arcs
must remain distinct and headers usable. Source limits still count recorded
links, not rendered arcs; format and layout coverage stay unchanged.

#### BR-07B: Explain unknown endpoints

**Acceptance first — `@br-07 @br-07b @browser`:**

```gherkin
Scenario: Explain the reviewed baseline's missing arcs
  Given full.yaml records owners for all eight interfaces
  And all eight allowed-consumer lists are null
  When the user opens the baseline
  Then a visible note says 8 interfaces have unknown owners or allowed consumers
  And no interface arcs are shown
  And the recorded owners retain their interface counts

Scenario: Explain an unknown consumer list in interface details
  Given the reviewed baseline is open and an interface's allowed-consumer list is unknown
  When the user inspects that interface from its owner's list
  Then the panel says Allowed consumers are unknown
  And its recorded null value, status, and evidence remain available

Scenario Outline: Preserve partial endpoint knowledge
  Given an interface has <owner> ownership and <consumers> allowed consumers
  When the user opens its details from Baseline details
  Then its panel explains <reason>
  And its known endpoint values remain available
  And it contributes no arc and exactly one interface to the unknown-endpoint note

  Examples:
    | owner   | consumers | reason                                    |
    | known   | unknown   | Allowed consumers are unknown             |
    | unknown | known     | Owner is unknown                          |
    | unknown | unknown   | Owner and allowed consumers are unknown   |

Scenario: Keep known arcs beside unknown endpoint facts
  Given one interface has a recorded owner and allowed consumer
  And another interface has an unknown allowed-consumer list
  When the user opens the baseline
  Then the first interface has its recorded arc
  And the second has no arc
  And the note counts only the second interface

Scenario: Explain missing endpoints without a component drawing
  Given a valid baseline has no components and one interface with both endpoint facts unknown
  When the user opens the baseline
  Then the no-components message and the note about 1 incomplete interface are visible

Scenario: Inspect an interface when there are no components
  Given a baseline is open with no components and an interface with both endpoint facts unknown
  When the user inspects that interface from Baseline details
  Then its panel explains both unknown values and keeps all recorded fields available

Scenario Outline: Omit an unnecessary unknown-endpoint note
  Given the baseline contains <data>
  When the user opens the baseline
  Then no unknown-endpoint note is shown

  Examples:
    | data                                       |
    | only interfaces with both endpoints known  |
    | no interfaces                              |
```

**Expected first failure:** The current viewer has no visible explanation of
missing arcs and no specific allowed-consumer explanation in interface details.
The new explanatory-text assertion must fail. Absence of guessed arcs and the
existing raw `Unknown (null)` field are passing characterization, not red tests.

**Before implementation:** BR-07A must pass. Keep the absence of guessed arcs,
raw `Unknown (null)` fields, known endpoint values, independent statuses and
evidence, and original file bytes as passing characterization. The existing
validator already rejects empty consumer lists, duplicate consumer IDs, and
references to missing components. Add any missing contract characterization
before changing related code; do not change these rules for this ticket.

**Small TDD cycles, in order:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| B1 — Unknown consumers | DOM unit: an interface with a known owner and null consumers shows the specific unknown-consumer explanation alongside its recorded fields. | Add the explanation from the null consumer value. Keep the owner and owned count. | Keep the explanation separate from the raw statement renderer. |
| B2 — Unknown owner | DOM unit: a null owner produces its own explanation while a known consumer list remains visible; both null values show both reasons. | Add the owner reason independently of the consumer reason. | Simplify the four known/unknown combinations without replacing distinct facts with one status. |
| B3 — Summary count | Native unit: a mixed baseline counts incomplete interfaces once, including an interface missing both facts; complete and empty collections give zero. | Count interfaces with either endpoint fact unknown. | Keep summary counting consistent with the panel reasons without storing another mutable count. |
| B4 — Summary display | DOM unit: incomplete interfaces produce the visible note and the existing Baseline details route stays available. | Render the summary when its count is positive, with singular/plural text. | Keep the message concise and reuse the existing record-access route. |
| B5 — No component drawing | DOM unit: a valid baseline with interfaces but no components shows the note beside the empty-view message and keeps interface inspection available. | Place the note in the common viewer region, outside the canvas-only branch. | Share the note rendering where useful; do not add an empty-state navigation path. |

Keep passing cases for no note on complete/no-interface data and known arcs in
mixed data. If B4 already makes B5 pass, record B5 as characterization and keep
that simpler implementation. Do not add a branch just to create a red test.

**Where to work:** The viewer message and existing interface panel. Reuse the
baseline lists and raw recorded-field display. No new unknown placeholder nodes,
validation rule, schema, or file write is needed.

**Checks and completion:** Run `bun run test:e2e --tags @br-07b` and the shared
ticket checks, including BR-07A and record-details acceptance. Verify the note
and all known facts at 320 by 640, including the no-components case. Use the
unchanged full fixture and repository synthetic data; preserve source bytes.

#### BR-07C: Inspect and highlight interface arcs

**Acceptance first — `@br-07 @br-07c @browser`:**

```gherkin
Scenario Outline: Inspect an arc with one pointer selection
  Given Invoice API has two arcs and another interface has an unrelated arc
  And the user has not pressed a component header
  When the user clicks an Invoice API arc's <target>
  Then the panel shows Invoice API's complete details without a Back entry
  And both Invoice API arcs are highlighted while the unrelated arc is dimmed
  And focus stays on the initiating arc's label
  And the camera and component positions are unchanged

  Examples:
    | target |
    | curve  |
    | label  |

Scenario: Inspect a visible curve whose label is off-screen
  Given an Invoice API curve is visible but its label is outside the viewport
  When the user clicks that curve
  Then Invoice API details open and focus moves to that arc's label
  And the camera does not pan or zoom

Scenario Outline: Inspect an arc with the keyboard
  Given two arcs represent Invoice API
  And keyboard focus is on the second arc's label
  When the user activates it with <key>
  Then focus moves to the Invoice API panel heading
  And both Invoice API arcs are highlighted

  Examples:
    | key   |
    | Enter |
    | Space |

Scenario: Return keyboard focus to the exact arc
  Given Invoice API's panel was opened from the second of its two arc labels
  And focus is inside the panel
  When the user closes the panel
  Then focus returns to that second arc's label
  And all arcs remain visible with normal emphasis

Scenario: Show a component's relevant connections
  Given a component has incoming and outgoing arcs and an unrelated arc exists
  When the user selects the component
  Then its incoming and outgoing arcs are highlighted and the unrelated arc is dimmed

Scenario: Emphasize an interface opened from its owner's list
  Given a component's panel lists its owned interfaces
  When the user inspects one of those interfaces
  Then only that interface's arcs are highlighted
  And the component remains highlighted

Scenario: Restore component context with Back
  Given an interface was opened from a scrolled list in its owner's panel
  When the user goes Back
  Then its list position and row focus are restored
  And the component's incoming and outgoing arcs are highlighted again

Scenario: Reach an off-screen arc label
  Given an arc label is outside the viewport but would fit at the current zoom
  When keyboard focus reaches the label
  Then the canvas pans only enough to reveal its label and focus indicator
  And zoom and the inspected record stay unchanged

Scenario: Reach a label larger than the available canvas
  Given an enlarged arc label is wider or taller than the available canvas
  When keyboard focus reaches the label
  Then the start of its name and the nearby focus outline come into view
  And zoom and the inspected record stay unchanged

Scenario Outline: Accept a fresh arc click after a component drag
  Given a component drag has <ending> without changing inspection
  When the user makes a new pointer press and release on an arc
  Then that interface's details open
  And the camera and component positions stay unchanged

  Examples:
    | ending         |
    | finished       |
    | been cancelled |
```

**Expected first failure:** BR-07A's drawn arcs do not yet open the interface
panel or apply the specified emphasis. Assert the visible panel after a real
arc click; a missing test locator alone is not acceptance evidence.

**Before implementation:** BR-07B must pass. The current inspection operation
already accepts an interface record and an HTML opener. Its fresh-path, Back,
scroll, focus-entry, and close behavior is characterization. The new arc control
must call that operation correctly; do not rewrite it to create a failing test.
Keep component movement and the drag-release guard green.

**Small TDD cycles, in order:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| C1 — Label selection | DOM unit: a first click on an arc label opens that interface as a fresh path without Back, with no prior component press. | Pass the interface ID and HTML opener to inspection. Keep component-only click permission out of arc activation. | Reuse the inspection owner; keep direct selection separate from list navigation. |
| C2 — Curve selection | DOM unit: clicking the curve opens the same details and focuses that arc's label without starting a pan or drag. | Give the curve a pointer target and route its action through the same inspection behavior. | Keep pointer handling small; remove repeated selection logic only where it clarifies the behavior. |
| C3 — Keyboard entry | DOM unit: Enter and Space on an arc label open the correct interface and focus its panel heading. | Connect the label's keyboard activation and input-mode flag. | Use the existing keyboard/pointer distinction; avoid parallel event paths that activate twice. |
| C4 — Exact opener | DOM unit: opening each of two arcs for the same interface and closing from the panel returns focus to that exact label. | Supply the complete arc identity to the rendered control and preserve its opener through inspection. | Reuse existing close behavior. If C1–C3 already pass this case, keep it as characterization. |
| C5 — Component emphasis | DOM unit: selecting a component emphasizes its incoming and outgoing arcs and dims unrelated arcs. | Derive emphasis from the inspected component and each arc's endpoints. | Keep emphasis derived rather than storing selected edge IDs. |
| C6 — Interface emphasis | DOM unit: inspecting an interface emphasizes all its arcs, through either route, and retains the owner's highlight only for list navigation. | Give the current interface panel precedence over component-based arc emphasis. | Keep one readable decision for the inspection states; reuse the existing path for component highlight. |
| C7 — Label reveal calculation | Native unit: reveal a label fully when it fits, or reveal its start and focus edge when it is larger than the canvas, without changing zoom. | Apply the existing header-reveal rule to scaled label bounds. | Reuse viewport calculations; keep component and label dimensions explicit. |
| C8 — Keyboard reveal | DOM unit: keyboard navigation to an off-screen label applies that reveal without selecting the interface. | Connect keyboard focus and keyboard focus return to the label reveal. | Keep focus separate from activation; simplify the connection to existing focus handling. |
| C9 — Pointer focus guard | DOM unit: selecting a visible curve with an off-screen label opens details without changing the camera. | Suppress keyboard reveal for pointer-driven label focus. | Keep input-mode handling in one place; preserve keyboard reveal and panel focus rules. |

Keep normal arc emphasis on resources, Baseline details, Rules, and panel close
as characterization, along with focus-only navigation, Back/scroll restoration,
and external focus on close. Check that a component drag release does not open
an arc, but a fresh arc click and later keyboard activation still work. If
these cases or C9 already pass after earlier cycles, keep them green.

**Where to work:** The diagram's arc controls and existing inspection hook.
Touch gesture or viewport code only for the input or reveal rules it owns.
Keep the inspected interface ID separate from the initiating arc's identity.
Do not introduce a second selection store or a new navigation history.

**Checks and completion:** Run `bun run test:e2e --tags @br-07c` and the shared
ticket checks, including inspection and movement acceptance. Verify hit areas,
both activation keys, exact focus return, tab order, oversized-label reveal,
and fresh clicks after dragging in the browser. Lists must still provide full
record access without using arcs.

#### BR-07D: Fit arcs and preserve them through view changes

**Acceptance first — `@br-07 @br-07d @browser`:**

```gherkin
Scenario: Fit the complete drawing with an open panel
  Given visible arc curves, a self-loop, and labels extend beyond component bounds
  And the interface panel is open
  When the user chooses Fit view
  Then all shown components, curves, arrowheads, and labels fit in the available canvas
  And component positions and inspected details are unchanged

Scenario: Fit a widely spread drawing in a narrow canvas
  Given the drawing is too wide to fit at 1% zoom in the available canvas
  When the user chooses Fit view
  Then the complete drawing fits at a positive zoom below 1%
  And component positions and inspected details are unchanged

Scenario: Keep zoom controls usable after a small-scale Fit
  Given the drawing has been fitted below 1% zoom
  When the user requests Zoom Out
  Then an enabled control decreases zoom to a positive finite value
  And at the minimum the control is disabled and zoom stays unchanged
  And Zoom In remains available

Scenario: Keep arcs attached when a parent is dragged
  Given a consumer is inside a parent group and its interface arc is shown
  And the parent's header and destination are inside the viewport
  When the user drags the parent with the pointer
  Then the consumer and its arc endpoint move with it
  And inspection and the camera remain unchanged

Scenario: Restore arcs after a cancelled drag
  Given a consumer is being dragged and its parent bounds have grown
  When the user cancels the drag with Escape
  Then the component positions, grown bounds, and arcs return to their pre-drag state
  And the panel and camera remain unchanged

Scenario: Reset geometry without clearing interface inspection
  Given components have been moved and an interface is being inspected
  When the user resets the layout
  Then components and arcs return to the initial arrangement
  And the canvas uses the normal 100% component starting view
  And the interface details remain open

Scenario: Replace arcs even when record IDs repeat
  Given a baseline is open with an inspected interface arc
  When a different baseline with the same IDs and different endpoint facts opens successfully
  Then only the new baseline's recorded arcs are shown in a fresh view
  And the old panel is closed

Scenario Outline: Ignore input started in a replaced view
  Given a new baseline opened while an old <input> was unfinished
  And both views use the same component and interface IDs
  When the old input is released
  Then the new view's arcs, positions, camera, and inspection stay unchanged

  Examples:
    | input          |
    | component drag |
    | arc press      |

Scenario Outline: Preserve arcs after an unsuccessful open
  Given a baseline has moved components and an inspected interface arc
  When another file open <outcome>
  Then its arcs, positions, panel, and camera remain unchanged

  Examples:
    | outcome      |
    | fails        |
    | is cancelled |
```

**Expected first failure:** Existing Fit view uses component bounds only. Use a
fixture with curves or a self-loop beyond that fit, including its padding, and
assert the actual visible bounds. A second case exposes the current 1% minimum:
including all geometry is not enough if the chosen zoom still clips it.
Attachment and load behavior already passing is characterization.

**Before implementation:** BR-07C must pass. Capture passing characterization
for current manual positions, inspection paths, normal 100% starting view,
Reset, and load lifetime. Use arc paths derived from the current arrangement.
Do not add a second position store to make Fit work.

**Small TDD cycles, in order:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| D1 — Curve bounds | Native unit: the drawing bounds contain a curved arc and self-loop that extend beyond the components, including negative coordinates. | Include the full path bounds with component bounds. | Keep bounds derived from the same routing geometry; avoid a second routing calculation. |
| D2 — Arrow and label bounds | Native unit: an arrowhead or bounded label outside those path bounds is included in Fit. | Extend the bounds to include the visible arrow and label extents. | Reuse one bounds-combination rule where it removes repeated knowledge. |
| D3 — Available canvas | Native unit: wide and narrow canvases contain the complete bounds, including a spread that requires zoom below 1%. | Calculate a positive finite Fit zoom from the actual bounds and available size, without the clipping floor. | Reuse viewport calculations; keep Fit separate from initial open and Reset. |
| D4 — Fit control | DOM unit: the explicit Fit action uses the current arc-inclusive bounds while retaining the panel and arrangement. | Connect the existing control to the complete bounds and current canvas size. | Remove obsolete node-only fitting from this action; keep one explicit Fit path. |
| D5 — Zoom controls | DOM unit: after Fit below 1%, Zoom Out decreases zoom when enabled or is disabled at the minimum; Zoom In remains available and positions stay unchanged. | Keep the allowed zoom range compatible with the Fit result, without snapping to the old minimum. | Keep one zoom policy; do not introduce automatic fitting on ordinary view events. |

Once Fit is connected to the app, run the clipping scenarios against the actual
canvas. Computed bounds alone do not prove that curves, arrows, and labels fit.
For Zoom Out, assert a disabled control's state without activating it; otherwise
activate it and assert a real decrease. An enabled control that does nothing
does not pass.
Keep the no-arcs case and no-components controls as characterization. Initial
open and Reset remain at 100%.

**Characterization and fixes for view lifetime:**

Run these cases before changing their owning code. Keep passing cases as
characterization; use the shared acceptance-first/TDD sequence for each real gap.
Add an acceptance scenario only when the missing outcome is not covered.

| Area | Cases and expected outcome | Focused test if a gap exists |
| --- | --- | --- |
| Movement | Child and parent movement, ancestor growth, and keyboard moves keep arcs on current headers. Both input methods preserve inspection and never trigger Fit. Keyboard movement can use the existing minimal reveal pan at unchanged zoom. | Native unit for coordinates; DOM unit for arrangement-to-render updates. |
| Cancellation | Escape or interruption restores starting positions, bounds, and arc paths. | Native unit for restored geometry; DOM unit for cancellation through the gesture owner. |
| Reset | Reset restores initial geometry and paths at 100%, keeps inspection and Back, and ends a held press or drag. Later events cannot undo it. | DOM unit through the existing Reset action; preserve the arrangement tests. |
| Successful open | Reopening a file or reusing IDs creates fresh arcs and closes inspection. An old component drag or arc press cannot act on the new view. | DOM unit through the workspace/view boundary; release old input after replacement. |
| Failed or cancelled open | Rejection, cancellation, and a late cancelled result preserve the current arcs, positions, panel, and camera. | DOM unit through the existing load boundary with controlled completion. |
| Example lifetime | A failed open keeps the example; closing and reopening it starts fresh; a successful file open replaces it. | DOM unit through the existing example and open actions. |

Keep baseline data, source bytes, and prepared geometry unchanged throughout.
Movement, Fit, cancellation, and Reset must not read the file or rerun layout.

**BR-05 compatibility:** If collapse exists, verify each
[combined behavior](#compatibility-with-br-05) with its own acceptance scenario
and focused TDD cycle for any missing outcome. Otherwise leave those cases with
BR-05; do not add collapse here.

**Where to work:** The diagram's Fit action and viewport calculations. Change
arrangement, gesture, or load code only when a behavior test shows a real gap.
Preserve the current baseline/layout pair as the view lifetime boundary.

**Checks and completion:** Run `bun run test:e2e --tags @br-07d`, the shared
ticket checks, and the complete `@br-07` and `@baseline-readability` acceptance.
Verify actual drawing bounds at 1280 by 800 and 320 by 640 with the panel open,
including a Fit below 1%. Complete the installed-app journey and the verification
below for dense data, original bytes, full details, and supported limits.

### BR-08: Reduce connection clutter

The draft PR stack implements selected connections, labels on demand, and
self-connections that start hidden. Fit includes the shown arcs and revealed
labels. The side panel and lists keep complete recorded facts available. See
the [draft stack verification](../change-requests/BR-connection-readability-evidence.md#draft-stack-validation).

| Ticket | Result | Depends on |
| --- | --- | --- |
| [BR-08A](#br-08a-show-connections-for-the-current-selection) | Selected/All scope, stable inspection, and safe focus when an arc disappears. | BR-07D |
| [BR-08B](#br-08b-reveal-labels-on-demand) | Hover, keyboard focus, and inspection reveal transparent labels. | BR-08A |
| [BR-08C](#br-08c-hide-self-connections-by-default) | Self-loops are hidden by default and available through one checkbox. | BR-08B |
| [BR-08D](#br-08d-fit-the-shown-drawing-and-preserve-view-choices) | Fit uses shown content; Reset and file-open behavior respect view lifetime. | BR-08C |

Each ticket starts with acceptance, then small TDD cycles. Use the working
sequence above. Keep each predecessor green. Do not implement group collapse,
new routing, bundled arrows, saved preferences, or additional direction filters.

#### Shared fixture and existing assertions

Use a small repository fixture with four components and these permissions:

| Interface | Owner | Allowed consumers |
| --- | --- | --- |
| Invoice API | Billing | Checkout, Reporting |
| Checkout status | Checkout | Billing |
| Identity API | Identity | Reporting |

This gives four non-self arcs. Checkout has two incident arcs; Billing has
three. Identity API is unrelated to either selected component. Use these
explicit sets as acceptance assertions, not a loop over whatever arcs happen
to render. Add nesting and repeated-name variants only for the cases that need
them. Do not depend on files under a developer's analysis-run folder.

For BR-08C, extend this fixture by adding Billing to Invoice API's consumers
and a Health interface owned and consumed only by Billing. Billing then owns
two interfaces. The extension adds two self-loops without changing the four
non-self arcs. Keep the original fixture for BR-08A and BR-08B.

| Earlier assertion | Replacement and owner |
| --- | --- |
| BR-07A draws all known arcs on open. | BR-08A opens with no arcs; selecting a component shows its direct arcs, and All shows all known arcs allowed by the self rule. |
| BR-07A shows every arc name at all times. | BR-08B reveals names only on hover, keyboard focus, or interface inspection. Accessible names remain complete. |
| BR-07A draws self-loops on open. | BR-08A sets up All for existing self-loop tests; BR-08C also enables Show self-connections. |
| BR-07C always dims unrelated arcs. | BR-08A excludes unrelated arcs in Selected mode. All keeps the earlier emphasis rules. |
| BR-07C always returns to the initiating arc after panel close. | BR-08A returns to that arc only if it survives; otherwise use its owner's header fallback. |
| BR-07D and installed acceptance assume every label affects Fit. | BR-08D includes only shown arcs and labels revealed at activation. |

Update the superseded executable expectations in the ticket that changes the
behavior, including installed acceptance helpers. Keep coverage of direction,
identity, unknown facts, input, original bytes, and record access. Do not disable
the old suites or add contradictory defaults. Treat unchanged behavior as
passing characterization; do not claim a new red result for it.
Run known/unknown endpoint cases in All as well as Selected: an empty Selected
overview alone cannot prove that endpoint eligibility is correct. The mixed
fixture must show exactly its known arcs in All, with the same unknown-facts note.

#### BR-08A: Show connections for the current selection

**Acceptance first — `@br-08 @br-08a @browser`:**

```gherkin
Scenario: Start with a quiet component overview
  Given the shared four-arc baseline is valid
  When the user opens it
  Then all four components and their owned-interface counts are shown
  And no interface arcs or arc keyboard stops are present
  And Connections is Selected

Scenario: Show only the selected component's direct connections
  Given the shared baseline is open with Connections set to Selected
  When the user selects Checkout
  Then Invoice API points from Checkout to Billing
  And Checkout status points from Billing to Checkout
  And those are the only two arcs
  And every component stays at its current position

Scenario: Keep an interface visible after selecting its arc
  Given Checkout is selected in the shared baseline
  When the user activates the Invoice API arc with the keyboard
  Then the Interface details heading has focus with no Back entry
  And the panel shows the Invoice API record
  And its two arcs from Checkout and Reporting to Billing are shown
  And no other arcs are shown
  And the component positions and zoom are unchanged

Scenario: Close an interface whose opener will disappear
  Given Invoice API was opened directly from an arc in Selected mode
  And keyboard focus is inside its panel
  When the user closes the panel
  Then no interface arcs are shown
  And Billing's header has focus
  And zoom is unchanged

Scenario: Inspect with all connections visible
  Given Checkout is selected in the shared baseline
  When the user chooses All connections
  Then all four known arcs are shown
  And Checkout's two arcs are highlighted
  And the component panel and camera are unchanged
```

**First red:** Opening the known-consumer fixture currently draws four arcs.
The first scenario must fail on the expected zero count after a successful load.
For the missing scope control, assert its presence before using it. Missing
locators or step definitions are setup failures, not behavior evidence.

Add these cases to the acceptance before their implementation steps:

| Case | Required outcome |
| --- | --- |
| Switch directly from Checkout to Billing. | Replace the two-arc set with Billing's three-arc set. Preserve the identity and order of the two shared controls. |
| Select a parent with an arc only between its descendants. | Do not show that descendant-only arc. Show parent-child arcs only when the parent is an actual endpoint. |
| Reach Billing through Baseline details, then open an owned interface or resource. | Keep Billing's three-arc scope. Interface inspection emphasizes only its shown arcs. Back restores the component list, scroll, and row focus. |
| Open Invoice API directly through Baseline details. | Show its two known arcs. Returning to Baseline details shows none. |
| Show Rules, Baseline details, or a resource with no component in its path. | Show no arcs in Selected mode. All mode keeps all four. |
| Close inspection while an arc outside the panel has focus. | If filtering removes it, focus its owner's header. If it survives in All mode, keep focus there. |
| Close a keyboard-opened arc panel in All mode. | Restore the exact initiating arc, including when names repeat. |
| Switch scope while its choice control has focus. | Keep focus on that control. Do not refit, rearrange, or shift the canvas by adding/removing the legend row. |
| Press an arc, hide it, show it again, then release the old press. | Do not open any record. A new press works. |

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Scope calculation | Native unit: exact arc sets for no inspection, Checkout, Billing, a parent, and All. | Filter complete known arcs by direct consumer/owner IDs and the chosen scope. | Keep recorded facts separate from visibility; reuse tuple identity. |
| 2 — Inspection context | Native or DOM unit: an owned-item path keeps its component scope; a standalone interface uses its own arcs. | Derive scope from existing inspection frames and current panel. | Share existing context lookup; do not store a second selected component. |
| 3 — View control | DOM unit: initial Selected has zero arcs; All has four, with the existing panel and positions intact. | Add the two-choice control and render the derived set. Keep a stable control/legend area. | Keep scope state with the current view; avoid a second copy of the arc graph. |
| 4 — Focus after removal | DOM unit: panel close or Escape removes an active arc and focuses its owner's header; All restores the exact opener. | Resolve focus against the next shown set, with the specified ancestor/Baseline details fallback. | Reuse the inspection focus owner and input-mode reveal rules. |
| 5 — Surviving controls | DOM unit: changing scope preserves a surviving arc's control identity and recorded order; filtered arcs have no input targets. | Keep stable tuple keys and expose controls only for shown arcs. | Preserve required portal ordering without remounting controls on ordinary scope changes. |
| 6 — Pending input | DOM unit: a press followed by hide/show and release cannot activate the reappearing arc. | Invalidate pending input when its arc leaves the shown set. | Reuse existing view/gesture cancellation; keep already-passing cases as characterization. |

**Where to work:** The diagram, existing inspection state, and a small pure
visibility calculation if needed. Preserve arc derivation, geometry, labels,
and self-loop behavior until their later tickets. The non-self fixture keeps
this ticket's acceptance valid after those changes. Add the generic empty-scope
message here; later self-only cases reuse it. Update legacy known-arc tests to
select a component or All before asserting arcs, including self-loop tests.
Tie the Selected/All choice to the published view now. BR-08C does the same for
its checkbox; BR-08D verifies their combined lifetime and fixes any remaining gaps.

**Complete when:** The browser verifies every scope and focus transition above,
including actual keyboard traversal and pointer activation after dragging.
Run `bun run test:e2e --tags @br-08a`, affected BR-07 inspection acceptance, and
the shared checks. Record positions, zoom, expected arc tuples, and focus targets.

#### BR-08B: Reveal labels on demand

**Acceptance first — `@br-08 @br-08b @browser`:**

```gherkin
Scenario: Select a component without showing every name
  Given the shared baseline is open and the pointer is away from its arcs
  When the user selects Checkout
  Then its two arcs are shown with neither label text visible
  And each arc has a complete accessible name

Scenario: Reveal one label by hover
  Given Checkout is selected and no arc has focus
  When the pointer enters the Invoice API curve
  Then only that arc's label is revealed
  And its background is transparent
  And the camera and component positions are unchanged

Scenario: Reveal a label before keyboard activation
  Given Checkout is selected and its arc labels are hidden
  When the user tabs to the first arc control
  Then its label and focus outline become visible
  And the full interface and endpoint names are available to accessibility tools
  And component inspection remains open
  And zoom is unchanged

Scenario: Keep labels for the inspected interface
  Given Checkout is selected with no arc label hovered
  When the user activates the Invoice API curve with a pointer
  Then its interface details open in one action
  And both shown Invoice API labels remain visible after the pointer leaves
  And the camera is unchanged
```

**First red:** With Checkout selected and neither hover nor arc focus, the
current renderer shows both labels. Assert whether the text is painted, using
computed display/visibility/opacity as needed. Text presence or a generic
visibility assertion alone does not detect opacity-zero text. Keep the keyboard
controls accessible.

Add these cases before the corresponding implementation steps:

| Case | Required outcome |
| --- | --- |
| Move the pointer from the curve onto its revealed label, then away from both. | No flicker between targets. Hide the label on leaving unless keyboard focus or inspection still requires it. |
| Move over the rectangle of a hidden label away from its curve. | It does not block a component control, start arc input, or reveal itself. |
| Activate a curve by touch without prior hover. | Open the correct interface in one action, without panning or moving a component. |
| Open an owned interface in Billing's panel. | Automatically reveal that interface's shown labels; other shown labels still respond to hover/keyboard focus. Keep Billing's scope and Back behavior. |
| Focus a label outside the viewport, including an enlarged two-line label. | Use the existing minimal keyboard pan at unchanged zoom. Pointer-driven focus does not pan. |
| Toggle labels with duplicate names or parallel arcs. | Keep distinct accessible names, stable control identity, and interface/consumer order. |
| Return focus after closing inspection. | Apply BR-08A's surviving-arc or owner-header rule; keyboard return to a surviving arc reveals its label. Pointer input alone does not leave a label revealed. |

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Reveal conditions | DOM unit: shown arc text is hidden until hover, keyboard focus, or its interface is inspected; each condition can keep it visible independently. Pointer focus alone cannot. | Derive label visibility from these three conditions and the existing input mode. | Keep inspection as the only record selection; avoid stored label-selection state. |
| 2 — Pointer handoff | DOM unit: curve-to-label movement retains visibility; leaving both clears hover; hidden labels have no pointer target. | Handle the SVG curve and HTML label as one hover region without an invisible label hit box. | Keep the handoff local to the arc and remove unnecessary event state. |
| 3 — Keyboard access | DOM unit: a visually hidden label remains a keyboard stop and reveals before activation; Enter and Space inspect the right record. | Retain the arc control and expose visible text/focus feedback on focus. | Reuse existing activation and input-mode handling. |
| 4 — Appearance | DOM unit plus browser assertion: the revealed label has no filled rectangle and stays within the existing two-line/width bounds. | Remove the opaque background; add only the contrast treatment needed. | Reuse existing text and focus styles where their behavior matches. |
| 5 — Focus reveal and identity | DOM unit: a newly revealed off-screen label is measured before keyboard pan; hover changes do not replace its control. | Measure revealed content for the existing focus-reveal calculation and keep stable control keys. | Reuse the camera rules; keep passing pointer-focus and ordering cases as characterization. |

**Where to work:** Arc rendering, label styles, and existing focus reveal. Keep
path routing and scope unchanged. BR-08D owns Fit's use of label measurements;
this ticket makes actual label visibility available for that calculation.

**Complete when:** Browser checks cover real SVG/HTML hover handoff, transparent
backgrounds, touch, and keyboard focus at normal and enlarged text sizes. Run
`bun run test:e2e --tags @br-08b`, BR-08A, updated label/input characterizations,
and the shared checks. Update old always-visible-label assertions in this ticket.

#### BR-08C: Hide self-connections by default

**Acceptance first — `@br-08 @br-08c @browser`:**

```gherkin
Scenario: Hide self-use without losing facts
  Given the extended fixture with two Billing self-connections is open
  When the user selects Billing
  Then its three non-self arcs are the only shown arcs
  And Show self-connections is off
  And Billing still shows 2 interfaces

Scenario: Read self-use in the recorded details
  Given Billing is selected with Show self-connections off
  When the user opens Invoice API from Billing's owned-interface list
  Then its panel shows Billing as owner and Checkout, Reporting, and Billing as consumers
  And Billing's three non-self arcs are still the only shown arcs
  And no unknown-interface note is shown for this complete fixture

Scenario: Reveal self-use within the current scope
  Given Billing is selected in the extended fixture
  When the user enables Show self-connections
  Then Billing's three non-self arcs and two self-loops are shown
  And the unrelated Identity API arc is not shown
  And the component positions, panel, and camera are unchanged

Scenario: Inspect an interface with only self-use
  Given Show self-connections is off in the extended fixture
  When the user opens Health through Baseline details
  Then Health's owner and consumer are both shown as Billing in the panel
  And no arc is shown
  And the view says No connections shown
  And Health does not increase the unknown-interface count

Scenario: Apply the self rule in All mode
  Given the extended fixture is open with Connections set to All
  And Show self-connections is off
  When the user enables Show self-connections
  Then exactly six arcs are shown, including two self-loops
  And the current inspection and camera are unchanged
```

**First red:** Under BR-08A's Billing scope, the existing renderer still draws
both self-loops. Assert three shown arcs rather than five. Assert the new
checkbox's presence and initial state before using it.

Add acceptance for turning the checkbox off again, changing Selected/All while
it stays on, and closing the panel while it stays on. The checkbox never broadens
the current scope: Selected with no inspection still shows zero arcs. Toggling
it preserves focus on the checkbox. When a loop is eligible and shown, it uses
BR-08B's label rules and the existing arc inspection/input rules.
Also inspect a loop directly, then turn the checkbox off. Keep the details open
and focus on the checkbox. Closing later from inside the panel uses the hidden
opener's owner-header fallback.

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Self filter | Native unit: suppress tuples whose consumer equals owner while retaining the same interface's other consumers. | Apply the self flag after deriving the inspection scope. | Keep the complete arc facts immutable and reuse tuple IDs. |
| 2 — Control | DOM unit: the checkbox starts off and switches Billing between three and five shown arcs without changing inspection or camera. | Add one view-local checkbox and pass its value to the filter. | Keep the two connection choices together with their existing view lifetime. |
| 3 — Scope combination | Native/DOM unit: All has four or six arcs; Selected with no context has zero in either checkbox state. | Combine the scope and self rules without either overriding the other. | Use one displayed-set calculation for rendering and later Fit. |
| 4 — Self-only explanation | DOM unit: a self-only inspected interface remains fully readable with a neutral empty-scope message. Characterize A's message; record red only for a missing self-only outcome. | Fix only the missing outcome, keeping the unknown-facts note independent. | Reuse existing recorded details and empty-view presentation. |
| 5 — Input removal | DOM unit: a held loop press followed by hide/show cannot activate on release. | Apply BR-08A's cancellation to this filter too. | Share the same removal path; retain already-passing cases as characterization. |

Keep passing characterization for complete interface counts, mixed self/other
consumer lists, null endpoint facts, validation limits, and original bytes.
Hiding self-use must not change these facts or their validation. Do not add a
new baseline property or a new self-use record type.

**Complete when:** Browser acceptance verifies the exact sets in both modes,
self-only inspection, and checkbox focus. Run `bun run test:e2e --tags @br-08c`,
BR-08A/B, updated BR-07 self-loop acceptance with the checkbox enabled, and the
shared checks. Keep the reviewed unknown-consumer fixture unchanged.

#### BR-08D: Fit the shown drawing and preserve view choices

**Acceptance first — `@br-08 @br-08d @browser`:**

```gherkin
Scenario: Fit without hidden labels
  Given the fixed Fit fixture is open with its owner selected
  And its one non-self arc is shown with its label hidden
  And the label would extend beyond the shown component and curve bounds
  And the side panel is open
  When the user activates Fit view
  Then the fit uses the shown components, curves, and arrowheads
  And the hidden label's rectangle does not enlarge those bounds
  And the drawing fits within the canvas space beside or above the panel

Scenario: Fit a revealed label
  Given the fixed Fit fixture is open with its owner selected
  And its interface has been opened through the owner's list
  And the shown arc set, positions, and canvas dimensions match the hidden-label case
  And its label is revealed beyond the curve bounds
  When the user activates Fit view
  Then the fit also contains the complete revealed label bounds
  And any filtered-out arcs or self-loops do not enlarge the fit

Scenario: Reset arrangement while keeping view choices
  Given the user has moved Billing and selected All connections
  And Show self-connections is on with an interface panel open
  When the user resets the layout
  Then the initial component positions and 100 percent camera are restored
  And All, Show self-connections, and the inspection path are retained
  And arc geometry follows the restored positions

Scenario: Start new choices for a successfully opened file
  Given the current view has All connections and self-connections enabled
  And an interface is open
  When a new file opens successfully with the same record IDs
  Then Connections is Selected and Show self-connections is off
  And the panel is closed with no arcs shown
  And the initial positions and camera are restored

Scenario: Reject a press from the replaced view
  Given an Invoice API arc press started in the old view
  And a replacement with the same IDs opened successfully
  And Checkout is selected so the same arc is shown in the replacement
  When the old press is released
  Then Checkout's panel and the new positions remain unchanged

Scenario: Accept fresh input after rejecting an old press
  Given the old press was rejected in the replacement view
  And Checkout's Invoice API arc is shown
  When the user makes a new pointer press and release on that arc
  Then Invoice API's details open
```

**First red:** Fit currently measures every label element. After BR-08B, start
with a hidden label whose measured rectangle would enlarge the bounds, then
assert that Fit excludes it. Keep the geometry and canvas size fixed so the
assertion can distinguish hidden and revealed labels. Keep the same shown arc
set too: use a one-arc fixture and open details through the owner's list, which
retains component scope. A different zoom alone is not sufficient unless the
fixture proves that the label extends the bounds.
If an earlier step already passes a case, record it as characterization and
use the next missing behavior for the red cycle.

Add acceptance for these outcomes before their implementation steps:

| Case | Required outcome |
| --- | --- |
| Fit in Selected with no inspection, or in either mode with no shown arcs. | Fit all shown components only. All with shown arcs includes those arcs even when nothing is selected. |
| Activate Fit by keyboard while the pointer still hovers a curve. | Include that revealed label. Use visibility at activation, not a stale measurement. |
| Change selection, hover, focus, inspection, connection choices, panel size, or window size. | Do not auto-fit or rearrange. Preserve camera except the existing minimal keyboard focus reveal. |
| Enable a self-loop that extends beyond the components. | Fit includes it only while shown. Existing sub-1-percent Fit and subsequent zoom controls remain valid. |
| Move a child or parent while only some arcs are shown. | Recompute shown routes; revealing a previously hidden arc uses the latest positions. |
| Reset while an arc press is held. | Cancel the press. Recompute label visibility from current hover/focus/inspection rather than restoring old flags. |
| Cancel or fail a file open, or receive an ignored late result. | Preserve positions, camera, panel/path, and both connection choices. |
| Open a replacement or example successfully with repeated IDs. | Start a fresh view and reject input from the previous view. |

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Fit inputs | Native unit and DOM unit: excluded arcs and hidden label measurements cannot enlarge bounds, while shown content can. | Pass the displayed arc set and measurements of currently revealed labels to the existing bounds calculation. | Use the same displayed set as rendering; retain existing curve/arrowhead bounds. |
| 2 — Fit at activation | DOM unit: the Fit action measures current label visibility and actual canvas space after scope/panel changes. | Collect current visible dimensions when the action runs. | Reuse the existing explicit Fit control; avoid cached bounds or auto-fit effects. |
| 3 — Reset and movement | DOM unit: Reset keeps both choices and inspection while cancelling held input; hidden-then-shown arcs follow current geometry. | Keep view choices separate from arrangement reset and derive routes from current positions. | Reuse the arrangement owner; keep already-passing movement cases as characterization. |
| 4 — View lifetime | DOM unit: a successful new baseline/layout pair resets both choices, while cancelled/failed/late opens preserve them. Characterize A/C's lifetime wiring first; record red for any combined gap. | Fix that gap at the existing published view lifetime boundary. | Avoid ID-based lifetime keys, new load IDs, or preference storage. |
| 5 — Assembled flow | Browser/installed acceptance: complete the journey below with exact shown sets, label visibility, focus, and final file bytes. | Connect any remaining behavior through existing public app boundaries. | Reuse shared fixtures and steps only where their assertions remain clear; no production changes for test convenience. |

**Assembled journey:** Open the extended fixture with known consumers and verify
the quiet overview.
Select Billing, inspect an arc, close it, and verify owner-header focus. Switch
to All, reveal a label by keyboard, enable self-connections, move an endpoint,
and Fit. Inspect a self-loop, Reset, and verify that choices and details remain.
Cancel and fail a replacement, then successfully open a same-ID replacement.
Verify fresh defaults, original bytes, and full record access. Also open
`full.yaml`: its eight unknown consumer lists still produce no arcs in either
mode and remain explained. Adapt the existing installed acceptance to this
journey rather than adding a separate app or runner.

**Complete when:** Run `bun run test:e2e --tags @br-08d`, complete `@br-08` and
updated `@br-07`/`@baseline-readability` acceptance, and the shared checks below.
Verify Fit at 1280 by 800 and 320 by 640 with the panel open, long labels, enabled
self-loops, and widely separated components. Complete the installed-app journey
and record actual results, limits, and any deferred platform checks.

## Verification and review

Use `test/fixtures/baseline-viewer/full.yaml` and `empty.yaml`, plus small
synthetic fixtures for repeated names, long names, multiple roots, mixed
statement statuses, and records without components. For BR-07, include two
consumers of one interface, parallel and opposite arcs, self-use, parent-child
endpoints, all four known/unknown endpoint combinations, and mixed complete and
incomplete interfaces. For BR-08, add the small four-arc fixture and its self-use
extension. Verify exact displayed sets, keyboard stops, labels, and counts in
each scope. Keep `full.yaml` unchanged for the unknown-consumer case. Include
at-limit and excessive inputs. Test fixtures must live in the repository.

For each implemented ticket, run its changed tests locally before committing.
Examples of focused commands after the features exist:

```sh
bun run test:e2e --tags @br-01
bun run test:e2e --tags @br-07
bun run test:e2e --tags @br-07d
bun run test:e2e --tags @br-08
bun run test:e2e --tags @br-08d
bun run test:e2e --tags @baseline-readability
bun run test:behavior --tags @baseline-viewer
```

Run native TypeScript and DOM tests in their separate environments. Use the
relevant suites under `test/unit/components/`, `test/unit/lib/`, and
`test/unit/architecture/`, with interface/integration suites only where the
repository definitions call for them. Keep DOM globals out of native tests.

For each implemented follow-up release:

- Run affected behavior tests, `bun run test`, `bun run check`,
  `bun run check-types`, `bun run build`, and `bun run habit-hooks --all`.
  Run contract generation/checks if a contract changes. Keep the snooze file empty.
- Build the desktop app and check the assembled route. Run installed acceptance
  for opening the baseline, side-panel inspection, movement, and reset. For
  BR-08, complete the assembled journey above: select a component, reveal labels,
  inspect an arc, change connection choices, move, Fit, Reset, and replace the
  view. Check the quiet initial overview and filtered focus return. Open the
  reviewed unknown-consumer baseline and verify its explanation without arcs
  in either connection mode. Browser tests alone do not verify
  the installed app. Follow the
  [native acceptance guide](../change-requests/BV-native-acceptance.md).
- If Rust changes become necessary, run Rust tests, formatting, and Clippy too.
  This plan does not require a native behavior change.
- Inspect the reviewed baseline at 1280 by 800, a narrow 320 by 640 viewport, and
  a resized desktop window. Check names, contrast, focus, scrolling, pointer
  movement, and keyboard movement. Test long labels at increased browser text
  size. Check arc direction, header attachment, pointer targets, surviving-arc
  or owner-header focus return, and high-zoom focus reveal. Verify transparent
  labels and real curve-to-label hover handoff. Fit must use shown curves and
  revealed labels; hidden items must not enlarge it. Check duplicate names,
  fresh arc clicks after dragging, and pending input across filtering and
  successful replacement. Keep the control area stable as scope changes. Do not
  use pixel snapshots as the only readability evidence.
- Recheck the existing workload fixtures at 500 records, 2,000 explicit links,
  and 16 levels. Record time to usable overview and interaction delays on named
  hardware. Compare with the
  [BR-04 measurements](../change-requests/BR-readability-evidence.md#workload-measurements)
  using the same method where practical. These are observed timings, not a new
  latency guarantee. Hidden records still count toward limits. Keep source-link
  counting unchanged when projecting arcs. Include dense known-consumer data;
  a full unknown-consumer fixture alone does not exercise arc rendering. Dense
  paths can cross, but rendering must complete, controls must respond, and every
  interface must remain available through the lists. Check both Selected and
  All with self-connections off and on. Hiding arcs must not bypass baseline
  validation or change the unknown-interface count.
- Verify full recorded details and original file bytes after the complete
  inspection/movement/reset journey. Preserve cancellation, retry, limits, and
  protection against a late load replacing the current view.
- Update README, workspace boundary notes, affected constraints, and the
  verification record with actual results and platform limits. Distinguish
  checks run from deferred checks. Do not claim build/lint output proves UI
  behavior.

The manager reviews the complete candidate. Keep PRs as drafts, keep validation
current, and follow the repository's constraint review requirements before merge.


## Interface details and supporting baseline data

### Reading order and compatibility

BR-10 uses the existing inspector. It does not copy the mock's three-item picker,
second relationship drawing, fixed fixture content, or wide panel. Keep the
current panel width and stack content within it. A width change requires a new
BR-09A visibility check before it can become part of the graph plan.

The interface heading shows its recorded name and a friendly provider name.
Use **Provider unknown** when `owner.value` is null. Show **Overview**,
**Example**, and **Sources** as keyboard-accessible tabs in the same panel.

| View | Content |
| --- | --- |
| Overview | Purpose, entry points, a saved method signature when supplied, the selected entry's recorded input/result/failure/effects, and the existing interface-wide behavior. |
| Example | Name the selected entry. Show its saved example text, input if supplied, and a short result explanation before the detailed result. |
| Sources | Statement statuses and acceptance references, useful saved source notes, deduplicated evidence IDs with field associations, and all original interface fields. |

Keep the main reading path short. Put **Access rule** and **What changes and
when it ends** in secondary disclosures. Resolve component IDs to names; retain
IDs where names repeat and in Sources. Access rule explains who the record
permits to use the interface. It does not describe observed calls or runtime
authorization. Keep self-use in this list. Unknown permission must say that the
permitted components are not recorded; it does not mean none or everybody.

Old files need an honest, useful view. They must not need a fresh analysis just
to remain readable:

| Saved value | Reading label or behavior |
| --- | --- |
| `promises.behavior` | **Behavior**; show the saved text directly. |
| `promises.data` | **Data exchanged**; do not split prose into invented input and result fields. |
| `promises.errors` | **Failures**. |
| `promises.lifecycle` | **What changes and when it ends**. |
| `publicAccess` without an explicit new entry description | **Recorded entry reference**; keep the string without guessing its kind or signature. |
| No saved examples | **No example recorded for this entry**, or **No examples recorded** when there are no documented entries. |
| Null statement value | State that the fact is unknown. |

If all promises are unknown, say that behavior is not recorded. Do not construct
a description from the interface name, a source path, or another interface.
Unchanged baseline-003 must not acquire the mock's `safeParse` signature,
classified entry points, or examples through an ID-specific fallback.

New entry descriptions supplement the existing interface-wide promises. When
an entry has a recorded description or a known interaction fact, show that
detail first and put the existing promises in **Interface-wide contract**.
This is a secondary disclosure. Otherwise, keep the existing prose in the main
view. Do not rewrite or discard it. The producer must review both descriptions
for contradictions; schema validation cannot establish that their prose agrees.

Initially select the first documented entry in saved order. Identify that entry
beside its details so readers cannot mistake one operation's contract for every
entry point. Select entries in Overview; Example names the same selected entry
without adding a second entry selector. Keep every recorded access reference reachable, including references
with no richer description. Several documented operations may refer to the same
recorded access point; their stable entry IDs distinguish them.

For a function or method, show **Signature** near the selected entry's name.
Use the saved declaration, including its parameters and return type, as literal
text. Methods use the existing `function` kind. Do not infer types from an entry
name, access reference, example, or prose. Missing signature data says
**Signature not recorded**; an explicit null says **Signature is unknown**.
Other entry kinds have no method-signature block. Keep the signature's own
recorded status and references available. This addition follows the user's
implementation review; A supplies the contract, D supplies its final UI, E
supplies authoring support, and F checks the published result.

Show input/result cards only for a saved function, command, or workflow that
has known interaction facts. If all four facts are null, show one
**Interaction facts are unknown** summary instead of four empty cards. Retain
the individual unknown fields in Sources. A type, data value, or message remains
a named entry with its saved description and examples. Do not give it a fake call,
success response, or HTTP transport. A message-specific reference layout is
outside this series. Use **Example** and **Copy example** for all entry kinds.
Optional sample input and result describe that example; they do not make a
type, data value, or message a callable operation. Label a result as an example
outcome, never as output observed by Choom.

### Baseline version 2 extension

Use an explicit `formatVersion: 2`. Version 1 remains strict and supported.
Do not add new fields to version 1, rewrite old files, or maintain an implicit
migration copy. The new reader accepts versions 1 and 2; unsupported versions
and malformed known fields remain load errors. Older readers reject version 2
with their existing unsupported-version outcome. Ship the reader before the
external workflow starts publishing version 2.

Keep the top-level fields, four collections, existing interface fields, and
their meanings. A version 2 interface may add one optional `documentation`
object. Absence means no richer documentation was supplied. In particular,
`owner` and `allowedConsumers` keep their existing meaning and validation.
Documentation creates no architecture record, consumer, edge, or owned count.

The extension has these fields. BR-10A defines them in TypeSpec and generated
contracts before implementing the validator; this table fixes their meaning.

| Location | Fields and rules |
| --- | --- |
| `documentation` | `summary`, `entries`, and `sourceNotes`. All three are required when the object exists. `summary` is a nullable text statement; the other two are arrays. |
| Entry | `id`, `name`, `accessPoint`, `kind`, `description`, `examples`, and optional `signature` and `interaction`. IDs are unique within the interface. `accessPoint` must equal an existing string in that interface's `publicAccess.value`. Unknown access points cannot be enriched until that fact is recorded. |
| Entry `kind` | A statement whose value is `function`, `command`, `type`, `data`, `message`, `workflow`, or null. Null means unclassified. The viewer does not infer a kind. |
| Entry `description` | A nullable text statement explaining this entry's purpose. The short `name` is a display label, as with interface names. |
| Entry `signature` | Optional nullable text statement for the `function` kind only, including methods. It records a supported declaration with its parameters and return type, without a function body. Preserve its syntax and line breaks. The viewer does not parse, infer, or execute it. |
| Entry `interaction` | Optional statement for `function`, `command`, or `workflow` only. Its value is an object with `input`, `success`, `failures`, and `effects`; each is nonempty text or null. The object itself cannot be null. Review these four descriptions together, as with existing promises. They are not executable schemas. |
| Example | `id`, `name`, `basis`, and `content`. IDs are unique within their entry. `basis` is `illustrative` or `source-reviewed`. `content` is one statement for the complete example, with its own status and evidence. |
| Example content value | Required `text`; optional `input` text and optional `result`. A result contains `text`, `summary`, and `scope: complete` or `scope: excerpt`. Each supplied text is nonempty. Examples are saved text only; no executable flag or test-run claim is supported. |
| Source note | `evidenceRef`, `description`, and optional `location`. The reference must occur in a statement of this interface, including its documentation. One note per reference per interface. |
| Source location | `snapshotRef`, safe snapshot-relative `path`, file `sha256`, and `lines: [first, last]`. Both line numbers are positive safe integers; `last` is at least `first`. This describes an inclusive saved source range. It does not request a read of the live checkout. |

Use the existing statement structure for every new claim: `value`, `status`,
and nonempty `evidenceRefs`; accepted statements also require `acceptanceRef`.
Summary, entry kind, entry description, signature, the whole interaction, and each example
have separate statements. An interaction has one status and evidence list for
its four facts. An example's status applies to its content and recorded basis.
Do not flatten these statuses into ownership status. Existing promises keep
their current grouping. Source notes describe references; they do not introduce
another acceptance state.

A `source-reviewed` example must cite at least one direct source-record ID in
its own `content.evidenceRefs`, with a source note for that exact ID and a saved
location. A note cited only by another statement does not qualify. The reader
checks this in-file link. It cannot establish that the source was reviewed.
The external workflow checks that separately, as described below.

All objects have explicit allowed keys. Apply the existing ID syntax to new
entry and example IDs. Local IDs are scoped by baseline session, interface, and
entry as appropriate; they need not be globally unique architecture record IDs.
Retain the saved entry and example order. Do not reinterpret an access-point
string as a URI, shell command, or selector to execute.

Use these missing-data rules consistently:

- Missing `documentation`: use the existing prose and entry references.
- Missing `signature`: no declaration was recorded. A null signature means its
  complete declaration is unknown. Neither case means no parameters or no return value.
- An empty `entries`, `examples`, or `sourceNotes` array: none of those
  documentation items was supplied. This says nothing about component usage.
- Missing `interaction`: no structured interaction description was supplied.
  For a callable entry, say **Interaction details not recorded**. Do not imply
  that it has no parameters or errors.
- A null summary, kind, description, or fact inside `interaction.value`: unknown.
  A known no-input or no-side-effect claim must be explicit supported text, such as
  **Accepts no arguments**; null cannot express it.
- A missing sample input or result: that part of the example was not supplied.
  Do not present it as a returned null, successful void result, or runtime fact.
- Example content cannot be null. Use an empty example list when there is no
  example to show. Optional sample parts avoid placeholder claims.

The complete positive consumer policy remains a nonempty distinct list or null.
Do not add empty consumer lists, partial permissions, or observed-caller fields
as part of this version 2 extension. BR-11 introduces separate source-use data
in version 3; it leaves this policy rule unchanged.

### Bounds and provenance

Keep the current 16 MiB file, YAML parser, 500-record, 2,000-explicit-link, and
16-parent-level limits. Add bounded documentation work: at most 32 entries per
interface, 8 examples per entry, 8 KiB per name, signature, or descriptive text value, and
16 KiB per example input, example text, or result text. A result summary uses
the 8 KiB description limit. Bound each new identifier/reference/path by 4 KiB
and each SHA-256 by its exact 64-hex-character form. These limits apply only to the new
fields; do not tighten valid version 1 fields incidentally.

Count the UTF-8 bytes of compact JSON serialization of one array containing
each present `documentation` object, in baseline interface order. Include the
array brackets and commas, source notes, statement metadata, and repeated
strings. That count must not exceed 2 MiB. Use the same definition in reader
and publisher. Parser limits still apply to the complete YAML first. New
documentation shape, reference, item, and byte violations return
`invalid-document`, with the affected path and a clear limit message where
applicable. Keep existing parser-limit failure codes. Never drop invalid
documentation and publish a partial replacement view.

Validate before deriving the drawing. Documentation IDs and references do not
count as architecture links; their own byte and item limits bound them. Render
only the inspected interface and selected example, with secondary content
disclosed on request. Measure the supported limit cases in BR-10F; a byte cap
alone does not prove usable rendering speed.

The viewer displays provenance recorded in the baseline. It does not inspect
source, resolve external artifacts, fetch URLs, verify hashes, or execute
examples. Label a source-reviewed example **Source-reviewed (recorded)** and an
illustrative one **Illustrative example**. Neither label says the viewer ran a
test. Do not offer Run, Try request, or automatic file-opening actions.

In Sources, show saved source paths, ranges, snapshot identity, and what each
note supports. Keep raw evidence IDs in one collapsed list, deduplicated for
display but retaining links to all statement paths that cite them. Unresolved
IDs stay plain text with **Evidence content is not included**. Do not decode
an ID into an invented source location or show a dead link as an action.
Keep every status, acceptance reference, and original field available. Original
record means all saved field values; it does not promise the original YAML
whitespace, comments, or byte serialization.

A heading may summarize a uniform recorded status. If statuses differ, show
**Mixed recorded statuses** and retain each field's status near its detail and
in Sources. Never describe the whole interface as verified because one example
was reviewed or one statement was accepted.

### External authoring and publication

The external six-stage workflow owns richer content. Stage 4 and Stage 5 must
prepare it from the selected saved snapshot and registered evidence, in the
review packet. Use short purpose sentences, concrete inputs and outcomes,
explicit failure conditions, and effects that matter to the caller. Keep
unknowns and their discovery questions/gaps. Publication continues to produce
proposed intent only.

The Stage 4 and Stage 5 review prompts must request function and method
signatures from reviewed source or a supported contract. Include the parameter
list and return type. Do not add guessed types, defaults, or a `void` return.
If the complete declaration is unsupported, retain a null signature and its
exact discovery subject; keep any known input or result prose separately.
Update the actual emitted prompts as well as their Markdown guidance.

Reuse the existing evidence resolver and saved-source checks. Walk every new
nested statement. Apply these rules:

- A source note without a location describes a registered cited reference. It
  does not establish a source range. A note with a location must name a direct
  source-record ID, without a fragment, and match its snapshot, path, digest,
  and range exactly.
- A source-reviewed example must cite a `reviewedFiles` record from the selected
  entry-analysis history, with the matching location note in the baseline.
  Use the existing reviewed-range list. A collected excerpt alone is not proof
  that someone reviewed it. Tools check membership and source identity; a
  reviewer checks whether the range supports the example text and outcome.
- An illustrative example cites registered evidence for the contract it
  illustrates. It need not claim a new source review. If support is absent,
  omit the example and retain any real unresolved finding.

For new null facts, use stable discovery subjects such as
`interface-id.documentation.summary` and
`interface-id.documentation.entries.entry-id.interaction.input`. These subjects
use local IDs, not array positions, and omit the statement's `value` wrapper.
Each new null fact needs an exact matching question or gap subject; one issue
can name several fields. A gap about consumers cannot explain an unknown input.
Use `interface-id.documentation.entries.entry-id.signature` for an unknown
signature; a consumer-policy gap does not explain it.
Keep legacy gap matching unchanged. Missing optional documentation or sample
parts, and empty documentation arrays, do not require placeholder gaps.

The publisher checks structure, references, bounds, and source identity. Record
semantic review of the descriptions, examples, and existing promises in the
packet's existing `llm/analysis-response.md`, beside the complete candidate
records. Record implementation compatibility commands and outcomes in the
BR-10 verification evidence. Do not add a tenth packet file or change a receipt
schema to store these results. These checks do not prove runtime behavior.
This series does not introduce executed-example receipts or an example runner.

Stage 1 may keep its empty version 1 seed, and Stage 4 may keep its existing
seed check. New Stage 4 output may be version 2. Stage 5 must accept a supported
version 1 or 2 working baseline before collection starts. Update that input
check as well as the shared Stage 4/5/6 record validation. Stage 4/5 `check`,
`finish`, and `verify`, and Stage 6 readiness/save must agree on the output profile.

Reject invalid documentation before draft replacement. Preserve publication
order, digest checks, immutable attempts, and recovery rules. Publisher file
limits differ from viewer limits: Stage 4/5 reads allow 128 MiB per file; Stage 6
review files allow 16 MiB each. Neither proves that a baseline can open. Check
the actual baseline bytes, YAML and documentation limits, and the separate
500-record, 2,000-link, and 16-parent-level display checks. Decoder success alone
is insufficient.

Only the baseline version changes. Keep discovery, run manifest, and review
packet versions unchanged unless their own contracts change in a separate
proposal. Preserve saved version 1 runs, including analysis-run-003. The new
viewer opens their baseline files. Historical attempts are verified with the
matching trusted tool revision and recorded environment; current tool bytes
need not match old attempts. Keep the tool pins and receipts intact. Never
replace frozen helpers inside an active attempt. Finish it with matching tools
or start a fresh attempt/run under the new tools, as the workflow permits.
Demonstrate new publication in a disposable run; do not rewrite historical output.

### Interface navigation and input

Keep interface UI state in its existing inspection frame: selected tab, selected
entry, example choice, disclosure choices, and per-tab scroll. Do not add a
global cache keyed only by interface ID. Direct selection starts a fresh frame
on Overview and its first documented entry. Panel Back restores the opening
list's row and scroll. BR-10 adds no deeper record-navigation route from an
interface. Selecting an entry starts with its first example. Tab changes
preserve the frame's other choices and each tab's scroll position. Changing
entry or example resets Example to the top with its detailed result collapsed
and copy feedback cleared. Returning to the same content keeps its reading
position. In a narrow or short panel, keep the focused control visible after
restoring or resetting that position, including below the sticky tab strip.
Scroll only the record area. An entry change in Overview resets the Example
bookmark without moving Overview. Do not add per-entry or per-example scroll
histories.

Use standard tab keyboard behavior: Left/Right, Home/End, and Tab into the
selected panel. Keep focus on the tab when switching tabs. Keyboard interface
activation follows the existing panel-heading rule. Tab, entry, example, and
disclosure changes do not alter graph scope, positions, or camera. Record
selection and panel Back retain the current drawing rules: BR-08 changes the
visible arrows with the inspected record; BR-09 keeps graph scope separate.
BR-10 does not implement that pending graph change. When BR-09 lands, its graph
changes must preserve a valid inspection frame within the same session.

Successful file opens clear old interface frames even when IDs repeat. Failed,
cancelled, and ignored late opens preserve them. Only the latest copy request
for an unchanged session, frame, entry, and example may update feedback.
Changing any part of that selection invalidates pending feedback, even if the
user returns to the same IDs. Do not claim that changing selection cancels an
operating-system clipboard write already requested.

**Copy example** copies exactly the selected example's `text` and announces
the result. On clipboard failure, keep the text selectable and explain how to
copy it manually. Do not change the baseline or report success after failure.
Render all saved prose and sample text literally. Do not interpret HTML, execute
code, or navigate automatically from saved text.

Keep long names, code, and paths accessible at 320 CSS pixels, with enlarged text,
and in short desktop windows. Code may scroll within its own region; the page
must not require horizontal scrolling to reach controls. Use the app's themes
and focus styles. Keep both the canvas and panel usable without widening the
panel as a substitute for a readable information order.

## BR-10 delivery tickets

### BR-10: Make interface details useful

**Implemented in a draft PR stack; delivery results are in the verification record.** Use the approved mock as an information-design reference, not as
production code or as a hidden source of descriptions. BR-10 can follow the
merged viewer without waiting for the separate BR-09 graph experiment. It does
not waive that experiment's gate or change its layout requirements.

| Ticket | Result | Depends on |
| --- | --- | --- |
| [BR-10A](#br-10a-read-and-validate-versioned-interface-documentation) | Strict version 1/2 reader, generated contract, bounds, and complete record access. | Current baseline reader |
| [BR-10B](#br-10b-explain-the-interface-and-its-entry-points) | Readable Overview, classified entries when recorded, and useful old-file fallback. | BR-10A |
| [BR-10C](#br-10c-read-prepared-examples-without-running-them) | Saved example selection, readable results, and honest copy feedback. | BR-10B |
| [BR-10D](#br-10d-explain-sources-and-preserve-inspection-context) | Useful provenance, complete original fields, and stable panel navigation. | BR-10C |
| [BR-10E](#br-10e-publish-supported-interface-documentation) | External authoring and publication agree with the new reader. | BR-10A to BR-10D available in the target reader |
| [BR-10F](#br-10f-validate-published-files-and-reader-understanding) | Complete browser/installed journeys and recorded reader results. | BR-10E |

Land reader support before the producer emits version 2. Each step keeps all
saved fields accessible. BR-10A may expose new fields through a simple Original
record disclosure that later moves into Sources. BR-10B introduces Overview and
Sources; BR-10C adds Example. Do not display a false empty-example state while
examples exist only in raw data during this sequence. BR-10D improves Sources
and verifies context; earlier tickets must already preserve existing Back and
load behavior. Do not defer known defects to BR-10F to manufacture a red test.

#### Shared fixtures and evidence for BR-10

Keep the original baseline-003 and `full.yaml` unchanged as version 1 fixtures.
Add a separate version 2 fixture with the same architecture facts and supported
documentation. It must produce the same component counts, permissions, graph
endpoints, and internal-use membership as its version 1 counterpart.

The enriched fixture includes a function with valid/invalid examples, a type,
example data, a native command, and a workflow with unknown consumers. Add small
variants for unclassified references, partial documentation, all-null interaction
facts, missing sample parts, mixed statement statuses, accepted statements,
duplicate display names, unknown owners, and reused local IDs across interfaces
and entries. Include entries with no examples beside entries with examples.
Keep a message entry and a data/type sample without a fake request/response UI.

Mutation fixtures cover unsupported versions, new fields in version 1, unknown
keys, duplicate local IDs, dangling access references, illegal kind/interaction
combinations, invalid example basis/scope, invalid source ranges, notes for
uncited references, missing or mismatched source notes for reviewed examples,
and all new size/count boundaries. Use exact UTF-8 boundary
values and multibyte text. Keep arbitrary HTML-like and command-like text as a
literal-rendering fixture, without executing it.

Place production fixtures with existing test support. Preserve the complete
source/proposal records; do not copy only the fields convenient for the mock.
Producer checks use a separate disposable review packet and saved snapshot.
Record fixture provenance and hashes in a BR-10 implementation evidence document
when implementation begins. Scenario text below states expected behavior; it is
not a record that a test has failed or passed.

#### BR-10A: Read and validate versioned interface documentation

**Acceptance first — `@br-10a`: the decoding cases use the public decoder
in the native profile; replacement and record-access cases use `@browser`:**

```gherkin
Scenario: Decode a supported enriched baseline
  Given a valid version 2 baseline with documented entries and examples
  When the public baseline decoder reads the file
  Then it returns all saved architecture and documentation fields unchanged

Scenario: Keep the old format strict
  Given a version 1 baseline containing a documentation field
  When the public baseline decoder reads the file
  Then it rejects the unsupported field rather than silently upgrading the file

Scenario: Preserve a recorded method signature
  Given a version 2 function entry has a signature with parameters and a return type
  When the public baseline decoder reads the file
  Then its exact text, status, evidence, and acceptance reference are retained
  And older version 2 entries without a signature still load

Scenario Outline: Reject malformed documentation
  Given a version 2 baseline with <defect>
  When the public baseline decoder reads the file
  Then it returns an invalid-document failure that identifies the affected field

  Examples:
    | defect                                      |
    | a duplicate entry ID in one interface        |
    | an entry bound to another interface's access |
    | interaction facts on a type entry            |
    | a signature on an entry whose kind is not function |
    | a signature with missing statement metadata  |
    | an unsupported example basis                 |
    | an excerpt without a valid scope value       |
    | a source note for an uncited reference       |
    | a reversed source line range                 |
    | a reviewed example with no matching location note |
    | a reviewed example whose note is cited only by another statement |

Scenario Outline: Reject excessive documentation before replacing the view
  Given a readable baseline is open and a version 2 candidate exceeds <limit>
  When the user opens the candidate
  Then the app reports an invalid-document failure naming the exceeded limit
  And it keeps the previous view and inspection

  Examples:
    | limit                      |
    | entries per interface      |
    | examples per entry          |
    | descriptive text bytes     |
    | sample text bytes          |
    | total documentation bytes  |

Scenario: Retain complete access before the formatted panel lands
  Given a supported enriched baseline is open
  When the user opens an interface's Original record disclosure
  Then every saved field value and statement status is available
```

**First red:** Decode a valid version 2 fixture through the existing decoder
and assert success with its documentation. Today it reports an unsupported
version. Keep existing version 1 success/failure cases, file limits, and late-load
protection as passing characterization. Do not weaken those cases to accept v2.

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Versioned contract | Public interface test: the decoder accepts a valid v2 and preserves the existing v1 profile, including nulls and accepted statements. | Define the extension in `baseline.tsp`; regenerate types/schema; dispatch to strict version-specific runtime schemas. | Keep the common architecture fields shared without widening v1 or creating a second mutable baseline. |
| 2 — Nested facts | Interface/native tests: reject missing statement metadata, missing accepted references, unknown keys, bad kind/interaction combinations, empty supplied text, and malformed examples. | Validate each new statement and its explicit value shape. | Reuse statement validation; review the four interaction facts together and each example separately. |
| 3 — Local references | Native tests: entry/example IDs have the declared scopes; access bindings resolve; a reviewed example cites its own matching source note with a location. | Add local reference and source-note linkage checks after shape validation. | Reuse validated indexes; leave external review and source-identity checks to the publisher. |
| 4 — Bounds | Boundary tests: exact limits pass; one item/byte over fails, including multibyte strings and total metadata. | Add the documented entry/example/text/total budget checks before view publication. | Share the budget definition and failure mapping; keep parser and architecture limits intact. |
| 5 — Shared readers | Native/DOM tests: paired v1/v2 fixtures produce identical architecture facts and both retain all original fields. | Update generated-type callers and add the minimal Original record disclosure. | Derive common facts directly from the validated union; avoid ID-specific adapters or hidden data loss. |
| 6 — Replacement failure | Browser acceptance: a structurally valid but excessive v2 keeps the prior interface frame; valid same-ID replacement starts a new session. | Route failures and successes through the existing load publication boundary. | Preserve existing cancellation and late-result guards. |
| 7 — Saved signatures | Native/interface tests: retain known, missing, and null signatures; reject other kinds and invalid metadata; enforce exact UTF-8 and reference limits; allow source notes cited only by a signature. | Add the optional function-only statement to TypeSpec, generated contracts, runtime validation, and statement walks. | Reuse nullable text, provenance, and total-budget rules. Do not add a parameter schema or infer a declaration. |

**Complete when:** Native and browser `@br-10a` scenarios, affected decoder/domain
interface tests, and existing load/limit acceptance pass. Run contract generation,
contract conformance, type checks, frontend build, and shared production checks.
Review the generated contract and update its boundary notes and owning artifacts.
Only the baseline format changes; native file-read and run-manifest contracts do not.

#### BR-10B: Explain the interface and its entry points

**Acceptance first — `@br-10b @browser`:**

```gherkin
Scenario: Read the existing baseline without invented detail
  Given unchanged version 1 baseline-003 is open
  When the user inspects Baseline data and validation
  Then Overview shows its friendly provider and saved behavior, data, failures, and lifetime
  And no generated signature, input/result split, or prepared example is added
  And evidence IDs and repeated field bookkeeping are outside the main reading path

Scenario: Explain the selected entry's contract
  Given an enriched interface has a function entry, a type entry, and a data entry
  When the user opens its Overview
  Then the first documented entry is identified and its saved description and interaction facts are shown
  And every documented entry and unmatched access reference remains reachable

Scenario: Keep a type distinct from an operation
  Given an enriched interface with a function and a type is open
  When the user selects the type entry
  Then its saved type description replaces the function's interaction cards
  And no call, success response, or inferred signature appears for that type

Scenario: Keep unknown interaction facts explicit
  Given the selected function has unknown input and failure facts but known success and effects
  When the user reads its interaction description
  Then those facts are labelled unknown rather than no arguments or no failures

Scenario: Summarize a wholly unknown interaction
  Given every fact in the selected entry's interaction statement is null
  When the user reads Overview
  Then one unknown-interaction summary appears without four empty cards
  And the original fields and their shared status remain available in Sources

Scenario: Keep the general contract available without repeating it
  Given a selected entry has known interaction facts and saved interface-wide promises
  When the user reads Overview
  Then the selected entry's details appear first and the general promises remain in Interface-wide contract

Scenario: Inspect an interface with no known provider
  Given an interface has an unknown owner
  When the user opens it from Baseline details
  Then its name and Provider unknown appear without an invented component

Scenario: Explain permission separately from activity
  Given an interface names Baseline workspace as a permitted component
  When the user expands Access rule
  Then it names Baseline workspace and explains that call activity is not recorded

Scenario: Keep unknown permission unknown
  Given an interface has no recorded consumer policy
  When the user expands Access rule
  Then it says the permitted components are not recorded without inventing a user or a connection

Scenario: Preserve mixed recorded statuses
  Given ownership is accepted and an interaction description is proposed
  When the user reads the interface
  Then the view identifies mixed statuses and retains the distinct field statuses
  And it does not label the interface verified
```

**First red:** Open the existing screenshot interface through a working
inspection route, then assert the new Overview and the absence of visible raw
evidence lists there. Current rendering prints each statement's metadata inline.
Keep old record values and access routes as characterization.

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Old-file projection | Native/DOM tests: each old promise maps to its reading label, null stays unknown, and unclassified references remain references. | Render the saved prose under the specified headings. | Keep label mapping separate from saved values; do not parse prose or look up mock IDs. |
| 2 — Entry selection | DOM tests: saved order, selected-entry identity, missing descriptions, duplicate names, and unmatched access references remain clear. | Add the saved entry list and one selected-entry detail area. | Scope selection to the inspection frame; derive it from the validated record. |
| 3 — Interaction kinds | DOM tests: only known callable/workflow facts produce interaction cards; missing, partly unknown, and wholly unknown facts have clear states. | Render the grouped interaction statement and neutral descriptions for other kinds; keep general promises in the specified fallback or disclosure. | Reuse text/statement presentation without duplicating contracts or adding a generic HTTP model. |
| 4 — Status and policy | DOM tests: mixed statuses stay distinct, known/unknown providers display correctly, self-use remains listed, and unknown permission is explicit. | Add concise status, Access rule, and lifetime disclosures. | Use existing component-name resolution and statement semantics. |
| 5 — Panel shell | DOM/browser tests: Overview and Sources are accessible, original fields remain available, and long content fits the existing panel. | Place the reading view and original record in the current nonmodal inspector. | Reuse app theme and focus primitives; do not ship the mock's picker or second diagram. |

**Complete when:** `@br-10b`, affected existing details/unknown-value acceptance,
new focused tests, and shared production checks pass. Inspect wide, narrow, short,
and enlarged-text views. The panel width and graph positions remain unchanged.

#### BR-10C: Read prepared examples without running them

**Acceptance first — `@br-10c @browser`:**

```gherkin
Scenario: Read a saved failure example
  Given an enriched function has a success example and a failure example
  When the user selects the failure example in Example
  Then its saved input, example text, result explanation, and result text are shown
  And the example's recorded basis and statement status remain visible

Scenario: Identify a partial result
  Given a saved example marks its result as an excerpt
  When the user opens that example's detailed result
  Then the result is labelled an excerpt without filling missing fields

Scenario: Keep absent examples explicit
  Given the selected entry has no examples but another entry has saved examples
  When the user opens Example
  Then the selected entry is named and No example recorded for this entry is shown
  And no Run action or fabricated sample appears

Scenario: Read a data sample without implying a call
  Given a selected data entry has a saved example
  When the user opens Example
  Then its sample is shown as Example without an invented call or response

Scenario: Copy the displayed example
  Given an example is selected and clipboard writing succeeds
  When the user activates Copy example
  Then exactly the selected example text is copied and success is announced

Scenario: Keep a failed copy honest
  Given an example is selected and clipboard writing is denied
  When the user activates Copy example
  Then the sample remains selectable and the app explains manual copying without reporting success

Scenario: Ignore copy feedback for a replaced selection
  Given a copy request is pending and the entry, example, or baseline selection has changed
  When the old clipboard request completes
  Then it changes no feedback or selection in the current view

Scenario: Ignore an older copy after returning to the same IDs
  Given a copy is pending and the user selected another entry before returning to the original example
  When the old copy request completes
  Then no old success or error appears in the current view

Scenario: Report only the latest copy request
  Given two copy requests were made for the current example and the newer request has completed
  When the older request completes
  Then it does not replace feedback from the newer request

Scenario: Treat a saved command as text
  Given an example contains HTML-like text and a command-like sample
  When the user selects it
  Then the text is displayed literally and no command, file request, or network request runs
```

**First red:** After valid enriched-file setup and interface inspection, assert
that Example and the saved example choices exist. Then assert that selecting a
different choice changes the displayed example. Missing controls are presence
failures, not failed clicks. No app example runner is part of the green change.

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Example state | DOM tests: identify the entry, handle empty/populated entries and repeated local IDs, reset content/scroll/result/copy state on selection change, and preserve state on tab return. | Add Example to the inspector with the specified frame and session lifetime. | Avoid per-entry history, a global example cache, or duplicated copied content. |
| 2 — Reading order | DOM/browser tests: show the saved explanation before detailed output, label excerpts, and explain absent sample parts. | Render the saved text with a result disclosure and responsive input/result layout. | Keep result summaries authored; do not generate them by inspecting code or output text. |
| 3 — Basis and status | DOM tests: illustrative/source-reviewed labels describe saved claims and never change a proposed statement into a verified one. | Display the recorded basis and the example's own status. | Reuse the statement metadata view from BR-10B. |
| 4 — Copy | DOM tests with controlled clipboard promises: exact bytes, failure, repeated IDs across entries, A→B→A selection, and out-of-order copies follow the latest-request rule. | Add Copy example with accessible feedback; invalidate earlier feedback on request or selection changes. | Keep one request lifetime at the UI boundary, without persistent copy history or clipboard cancellation claims. |
| 5 — Literal content | DOM/browser tests: markup remains text and selecting/copying makes no filesystem, IPC, command, or network call. | Use escaped text/code nodes with no executable preview. | Avoid new syntax-highlighting or sample-execution dependencies. |

**Complete when:** `@br-10c`, new focused tests, affected selection/session checks,
and shared production checks pass. Check keyboard and touch selection and copy
in the real browser. Record platform limits for clipboard support.

#### BR-10D: Explain sources and preserve inspection context

**Acceptance first — `@br-10d @browser`:**

```gherkin
Scenario: Read a method's parameters and return type
  Given a supported function entry records its method signature
  When the user selects that entry in Overview
  Then Signature shows the exact declaration and its recorded status
  And Sources retains the signature's own evidence and acceptance reference

Scenario: Keep missing signatures explicit
  Given function entries have missing and null signature statements
  When the user selects each entry
  Then the view distinguishes not recorded from unknown without inventing parameters or a return type
  And a type or data entry has no method-signature block

Scenario: Read useful saved source notes
  Given an interface has two source notes with saved locations and one without a location
  When the user opens Sources
  Then the saved descriptions and available locations are shown without inventing a missing path
  And the app makes no source-file or network request

Scenario: Keep provenance complete without repeating it
  Given several statements cite the same evidence ID and one has an acceptance reference
  When the user expands the evidence reference list in Sources
  Then that ID appears once with every citing statement path and the acceptance reference remains available
  And unresolved evidence stays plain text without an invented link

Scenario: Preserve all original field values
  Given an enriched interface is being read through the new tabs
  When the user expands Original record
  Then all saved interface fields and values remain available without a byte-format claim

Scenario: Return to the opening list
  Given an interface was opened from a scrolled owned-interface list
  When the user goes Back after reading an example
  Then the opening list's row and scroll position return
  And the drawing follows its existing component-selection rules without moving cards or camera

Scenario: Return to a tab without losing the reading position
  Given Example has a selected entry, example, and scroll position before Sources is opened
  When the user returns to the Example tab
  Then the same entry, example, and scroll position remain without adding a Back-history entry

Scenario Outline: Preserve inspection after an unsuccessful replacement
  Given an interface is open on Example with a selected saved case
  When opening a replacement baseline <outcome>
  Then its frame, selected example, disclosures, and scroll remain unchanged

  Examples:
    | outcome      |
    | fails        |
    | is cancelled |

Scenario: Start fresh on a successful same-ID replacement
  Given an interface is open on Sources with expanded evidence
  When a new baseline with the same saved IDs opens successfully
  Then the old interface frame is removed and a later direct selection starts on Overview

Scenario: Reach details without a pointer
  Given a long interface is open in a narrow or short window
  When the user moves through tabs, examples, and disclosures with Tab and Shift Tab
  Then all controls and text remain reachable with visible focus and no page-wide horizontal scroll
  And the sticky tabs do not cover the focused control

Scenario: Select a partly visible control with the pointer
  Given an example choice is partly visible below the sticky tabs
  When the user presses and releases its visible part
  Then the press does not move the choice before release
  And that example becomes selected
```

**First red:** Assert that Sources renders a supplied human-readable note and
its source location. Raw record access and existing Back/load behavior should
already pass; keep them as characterization and add a red focused test only for
a real new state gap. When BR-09's grouped controls exist, run the same Back
journey through its connection member list too.

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Provenance projection | Native tests: deduplicate IDs while preserving statement paths, field statuses, accepted references, and saved notes. | Derive the source view from the one validated interface. | Keep raw values immutable and avoid a second evidence store. |
| 2 — Source reading | DOM tests: render useful notes, label unloaded evidence, and preserve every original value behind a disclosure. | Format Sources with readable labels and plain source locations. | Reuse record serialization only for full-field access, not as the main UI. |
| 3 — Inspection frame | DOM tests: Back, direct selection, tab/entry changes, close, and same-ID replacement apply the specified frame lifetime. | Extend the existing inspection state with only the new UI choices. | Reuse existing history and session identity; remove duplicate state owners. |
| 4 — Asynchronous feedback | Controlled-completion tests: late loads and old copy feedback cannot update a replacement frame. | Add any missing guard at the existing owner. | Keep passing load-race behavior as characterization. |
| 5 — Real input and layout | Browser tests: forward and reverse tab keys, pointer presses, Back row focus, touch, code-region scrolling, narrow width, short height, and larger text remain usable. | Reveal keyboard-focused controls below sticky tabs without moving a pressed control or resetting tab bookmarks. Fix wrapping or focus routing at its UI owner. | Preserve panel width and graph navigation; do not use font reduction to fit content. |
| 6 — Method reading | After A accepts signatures, first fail a browser assertion on the absent Signature view. Add focused DOM/projection tests for exact multiline text, missing/null values, kind restrictions, independent status, and all citing paths. | Render the saved function declaration near the entry name and include it in the common statement traversal. | Keep signatures literal and separate from examples. Preserve legacy files and current panel width. |

**Complete when:** `@br-10d`, affected inspection and lifetime acceptance, new
focused tests, and shared production checks pass. Review both themes and the
actual panel width. If BR-09 has landed, include its member-list and focus-view
regressions; otherwise BR-09B/F must run these BR-10 regressions when integrating.

#### BR-10E: Publish supported interface documentation

**Acceptance specification first — external command/artifact checks:**

```gherkin
Scenario: Publish a supported enriched candidate
  Given a disposable review packet has a valid version 2 baseline and registered supporting source ranges
  When the normal Stage 4 check, finish, and verify sequence completes
  Then the published baseline retains the reviewed documentation and passes the target reader's compatibility check

Scenario: Carry version 2 through the next stages
  Given Stage 4 published a version 2 baseline in a disposable run under the new tools
  When Stage 5 start, collect, check, finish, and verify complete, followed by Stage 6 readiness and save
  Then each stage accepts the supported format and the saved baseline matches the reviewed Stage 5 bytes

Scenario Outline: Reject unsupported publication before replacement
  Given a disposable review packet has <defect>
  When the publication check validates the candidate
  Then it reports the defect without replacing a working draft or completed attempt

  Examples:
    | defect                                              |
    | an unknown nested statement evidence reference       |
    | source location metadata that differs from its range |
    | a source-reviewed example citing only an unreviewed collected excerpt |
    | a reviewed example whose location note is cited only by another statement |
    | a null input fact explained only by a consumer-policy gap |
    | documentation that exceeds the reader's byte limit   |
    | a baseline that decodes but exceeds a display limit  |

Scenario: Keep readiness aligned with the reader
  Given a published enriched baseline and its reviewed Stage 6 packet
  When the normal readiness and save sequence completes
  Then the saved baseline preserves its reviewed bytes and the selected draft digests remain correct

Scenario: Preserve historical version 1 runs
  Given a disposable version 1 run and its matching trusted historical tools and environment
  When the normal verification commands inspect the run
  Then verification passes without changing its files, pins, or declared version

Scenario: Reject changed tools within an attempt
  Given a disposable attempt was started with one trusted tool revision
  When a later command runs with changed frozen-helper bytes
  Then it rejects the mismatch without rewriting the attempt or weakening the pin checks
```

**First failing check:** Submit a valid enriched packet to the current shared
record validator through its normal command. It rejects version 2. Record that
result separately from the later success. Keep existing manifest/digest and
publication-recovery checks as characterization; do not rerun a completed
`finish` action to create artificial failures. Start fresh disposable attempts
when tool bytes change. Do not patch frozen helpers to reuse an old test attempt.

This ticket changes external scripts and guidance. Follow the repository rule:
use real command, schema, artifact, and manual checks rather than adding unit
tests or Cucumber wrappers whose only purpose is to test a script. The scenarios
above are the executable review specification. If the work exposes a production
reader defect, add its failing production test before fixing that boundary.

**Small check–change–simplify cycles:**

| Step | Failing check or recorded review first | Smallest passing change | Simplify after success |
| --- | --- | --- | --- |
| 1 — Authoring profile | Inspect a packet prepared under current guidance; richer descriptions, entry roles, and sample provenance are unspecified. | Update record-format and Stage 4/5 guidance to the reviewed v2 profile, with a minimal worked record and unknown cases. | Reuse current promises and statement meanings; do not create a competing contract source. |
| 2 — Versions and claims | Run valid v2 through the Stage 5 input check and shared validator. Check nested references and exact gap subjects, including repeated local IDs. | Accept supported working-baseline versions in Stage 5; validate all new statements and null facts. | Keep the v1 seed, legacy validation, and shared Stage 4/5/6 rules; do not globalize local IDs. |
| 3 — Source binding | Check wrong source metadata, collected-but-unreviewed excerpts, and evidence cited only by another statement. Also check a valid location-free note. | Match located notes to saved source records; match reviewed examples to their own cited reviewed-range IDs and notes. | Reuse the selected entry-analysis history and source checks; do not add a review registry. |
| 4 — Reader compatibility | Check exact and excessive byte/item limits, plus a candidate that decodes but fails a display limit. | Align publication checks with the public decoder and display-limit boundary; record the actual outcomes. | Use the complete reader boundary, not a packet-size check or decoder success alone. |
| 5 — Stage transitions | Run Stage 4 publication → Stage 5 start/collect/publication → Stage 6 readiness/save. Verify an old run with matching tools, and reject changed tools in an active attempt. | Update only format-specific stage checks; preserve reviewed bytes, selected digests, tool pins, and manifest-last recovery. | Keep run/discovery/packet formats unchanged and use fresh disposable attempts for each tool revision. |
| 6 — Human content review | Review one enriched record against its source and old interface-wide promises; identify unsupported claims or contradictions. | Correct the candidate or retain explicit gaps before publication; save the review in the existing analysis response. | Keep concise purpose, input/result, failure, and effect descriptions; do not fill fields merely to make cards look complete. |
| 7 — Signature authoring | Check the actual Stage 4/5 emitted prompts and submit a supported signature through the ordinary publisher. Reject wrong-kind and unexplained-null records; review the source for unsupported type claims. | Request declarations in both prompt owners, validate the optional statement, and publish a source-backed example in a fresh run. | Reuse the exact-null subject and existing source evidence rules. Preserve completed runs and their frozen tools. |

**Complete when:** The reader supporting BR-10A to BR-10D is available; both
valid and invalid command outcomes are recorded; the disposable published
candidate opens through it; and historical verification passes with matching
trusted tools. Old baseline files must also open in the new reader. Update
`start-here.md`, `record-format.md`,
Stage 4/5/6 guidance, the Stage 5 input check, and shared validator/publisher
owners as needed. Use syntax, contract/artifact checks, the
real command sequences, link review, and Habit Hooks. Preserve unrelated local
edits in those files. Do not run a fresh user analysis or alter analysis-run-003
as an incidental part of this ticket.

#### BR-10F: Validate published files and reader understanding

**Acceptance and characterization first — `@br-10f @browser`; the installed
file-opening journey also uses `@packaged`:**

```gherkin
Scenario: Read a published enriched baseline end to end
  Given the normal file control opens a candidate published by the external workflow
  When the user completes the interface reading journey
  Then Overview, Example, Sources, access rules, and original fields agree with the published record
  And the original file bytes and architecture relationships remain unchanged

Scenario: Keep existing baselines readable
  Given baseline-003 and full.yaml are unchanged version 1 files
  When the user reads their interfaces through the normal file control
  Then saved prose and unknown facts remain available without invented examples or call activity

Scenario: Handle the largest supported documentation
  Given a baseline reaches one documented item or byte limit while respecting all other limits
  When the user opens an interface and selects its last example
  Then its complete saved content and all controls remain usable without losing records

Scenario: Reject invalid documentation atomically
  Given an enriched interface is open with a selected example
  When a malformed or excessive candidate is opened through the installed app
  Then the old view and example remain usable with a clear load failure
```

**First check:** Run the assembled journey after BR-10A to BR-10E. Keep passing
behavior as characterization. Record a genuine failing assertion only when it
reveals a gap. Add a focused failing test at that gap's production boundary,
make it pass, and refactor. This ticket can close with verification and evidence
alone if all required outcomes already pass.

**Verification and TDD for any discovered gap:**

| Step | Check first | If it fails: smallest correction | Refactor while green |
| --- | --- | --- | --- |
| 1 — Published artifact | Open the same published bytes in browser and installed app; compare all new field values and relationships. | Fix the owning reader, publisher, or presentation boundary with its proper failing test/check first. | Keep one data contract and normal file route. |
| 2 — Session and input | Complete Back, direct selection, entry/example/tab changes, copy, failed/cancelled opens, and successful same-ID replacement. | Fix the uncovered frame/focus/session transition. | Reuse existing view-lifetime behavior; avoid special cases for sample IDs. |
| 3 — Size and layout | Exercise exact and excessive bounds, long text, narrow/short windows, enlarged text, both themes, and touch/keyboard. | Fix validation or rendering at its owner without weakening limits or hiding saved facts. | Render only selected content and keep secondary records disclosed on demand. |
| 4 — Reader understanding | Run the questions below with a reader who did not build the view. Record answers, mistakes, help, and viewport. | Revise the content contract, labels, or reading order responsible for confusion; add production regression tests for changed behavior. | Remove unnecessary detail before adding another permanent pane or control. |

**Reading journey:** Open an owned interface, identify its provider and purpose,
read its recorded parameters and return type, switch between a function and type,
read a failure example and its excerpt,
inspect its recorded basis and source note, inspect its access rule, and return
to the opening list. Open an unknown-owner interface through Baseline details.
Repeat with unknown permission, an entry with no examples, a data sample, and a
legacy file. Exercise copy failure and same-ID replacement. Use current canvas
controls; if grouped connections are available, repeat through their member lists.

**Reader questions:** What does this entry need, return, and reject? What does
it change? How does the type differ from the function? Does valid baseline data
prove the architecture is correct? What does the permission list establish,
and what is unknown about actual calls? Was the example executed by Choom?
What supports the description? Use an unfamiliar equivalent record for transfer
rather than reusing an answer the reader learned from the mock.

**Complete when:** All BR-10 acceptance, affected earlier acceptance, production
checks, producer checks, and the installed route are recorded. Measure loading,
time to open an interface, and example switching at supported limits on named
hardware; do not promise a latency threshold without measurements. Record a
reader proceed/revise decision. Passing CI or identifying a control does not
prove understanding. Record unresolved platform or performance limits, update
affected README/boundary/contract documents, and keep BR-09's separate graph
validation status accurate.

**Reader-check delivery note:** The user gave positive visual feedback and
asked the manager to check the view too. The manager completed the reading
questions and inspected wide, narrow, and short windows. The evidence keeps
that self-check separate from user feedback. It does not claim an independent
human comprehension study or record answers the user did not give.


BR-10 uses acceptance-first Cucumber scenarios for production behavior and the
small red/green/refactor steps above. Existing behavior stays as characterization.
External scripts use real command and artifact checks. Register affected features
with their component manifests. Run focused native/browser acceptance, full
`bun run check`, `bun run check-types`, `bun run build`, and Habit Hooks before
closing each production ticket. Use native `@br-10a`, browser `@br-10`, and the
installed BR-10F journey. Record actual failures, fixes, and platform limits in
[the BR-10 evidence record](../change-requests/BR-interface-details-evidence.md).

## Source-consumer connections

BR-11 answers **Which components use this interface in the saved source?**
The existing `allowedConsumers` field answers **Which components may use it?**
Keep these questions and records separate. Source inspection can establish a
caller without establishing a full permission list or proving execution.

The baseline-004 review found consumers for nine of its ten interfaces, while
all ten permission policies remained unknown. The current app therefore draws
no arrows. Changing those null policies to the caller lists would give the
arrows a false meaning. Change the contract, viewer, and external producer
together. Keep Choom a read-only, single-file viewer.

### Version 3 contract

Add strict `formatVersion: 3`. Retain all version 2 architecture and documentation
fields, statement meanings, signatures, reference checks, and limits. Versions
1/2 remain strict and supported. They reject the new field. Older readers reject
version 3 as unsupported. Ship the reader before publishing version 3 for users.

A version 3 baseline may add one top-level `sourceUsage` object. Its absence
means source use was not recorded. It does not enable a fallback to permission
arrows. Use one saved snapshot per object; this change does not compare snapshots.

| Location | Fields and rules |
| --- | --- |
| `sourceUsage` | Required `snapshotRef`, `mappingRef`, and `assessments`. All uses share this snapshot and code mapping. Assessments may be empty. |
| Assessment | Required `interfaceId`, `scope`, `evidenceRefs`, `limitations`, `uses`, and `sourceNotes`. Each interface has at most one assessment. The ID must name an existing interface. |
| Assessment scope | `scope` is nonempty text describing which callers and files were reviewed. `evidenceRefs` is a nonempty distinct list supporting that scope. `limitations` is an array of nonempty text; it may be empty. Every assessment may omit other uses, even when no additional limitation is supplied. |
| Use | Required local `id`, nullable `consumerId`, `kind`, `context`, `description`, `callerRef`, and nonempty distinct `evidenceRefs`. Optional `accessPoint` and `entryId` identify the entry used. IDs are unique within the assessment. |
| Consumer | A known `consumerId` names an existing component. Null means the caller file has no resolved component owner. The description must explain an unresolved owner or context. A null consumer is not an external actor ID. |
| Kind and context | `kind` is `value` or `type`. Value use includes a reviewed call, data/value reference, callback/JSX binding, or resolved IPC binding. `context` is `application`, `tooling`, `test`, or `unknown`. These are saved classifications; the viewer does not infer them from paths. |
| Entry binding | A supplied `accessPoint` must equal an item in this interface's `publicAccess.value`. A supplied `entryId` must name this interface's documented entry. If both exist, they must agree. Neither is required when source review establishes interface use without a more precise entry binding. |
| Common mapping | `sourceUsage.mappingRef` names the one selected code-mapping artifact. It assigns each caller file to its direct component owner, including an explicit null owner. It is separate from each use's source evidence. |
| Use evidence | Each `evidenceRefs` entry names a direct saved source record, without a fragment. `callerRef` must be one of these entries and identifies the caller site. Other entries support declarations and binding chains. General graph/query evidence belongs in assessment scope, not use evidence. |
| Source notes | Reuse the BR-10 source-note and source-location shapes, scoped to this assessment. Each note describes a cited assessment/use reference; duplicate notes for one reference are invalid. Every use evidence reference requires a note with a location. All supplied locations must use `sourceUsage.snapshotRef`. Scope-only notes may omit a location. |

All objects have explicit allowed keys. Apply existing model-ID syntax to local
use IDs and component/interface/entry IDs. Required text and references,
including `snapshotRef` and descriptions, must be nonblank. Optional fields
must satisfy their full rule when supplied; do not accept blank placeholders.

Use records describe source observations. They have no proposed/accepted wrapper,
permission status, or execution flag. Their component assignment depends on the
recorded mapping, which can remain proposed. Existing owner and permission
statements keep their own statuses. Never give a combined arc one acceptance
status. The publisher checks evidence identity and mapping consistency; a
reviewer checks that the cited code supports the use. Choom displays the saved
record and does not fetch source, execute a call, or verify a digest. In version
3, label the existing combined status as **Interface statement status**, or keep
statuses beside those statements. A status above the panel must not appear to
certify source uses or execution.

The offline reader checks the supplied fields and links. The publisher checks
that each use reference resolves to reviewed source. Saved declaration and
configuration text can support a binding; source records are not limited to
TypeScript or Rust files.

Do not turn an import match into a resolved interface use. Follow aliases,
injected callbacks, and IPC registration where needed. If the interface itself
cannot be resolved, retain the finding in discovery; do not attach it to a
guessed interface. A documented operator command belongs in the assessment's
limitations, with supporting scope evidence. It does not create a component
caller. Keep declarations, configuration, and examples separate from actual
source references to an interface.

| Recorded state | Meaning and display |
| --- | --- |
| No `sourceUsage` | **Source use not recorded.** No source arrows. |
| No assessment for this interface | **Source use not assessed for this interface.** |
| Assessment with `uses: []` | **No uses found in the reviewed scope.** Show that scope and its limits; do not say “unused.” |
| One or more uses | Show every saved use, even when coverage is partial. Known uses do not need a complete caller list. |
| Null consumer, unknown context, or unknown interface owner | Explain the missing fact. Suppress only the affected arrow; retain other supported connections and all details. |

Keep the 16 MiB file, YAML, 500-record, and 16-parent-level limits. Keep the
separate BR-10 documentation budget. Add these source-use limits before layout:

- At most 2,000 use records and 4,000 source notes across all assessments. Count
  all records before combining repeated sites or filtering. The assessment count
  cannot exceed the interface count because assessment interface IDs are unique.
- At most 4 KiB of UTF-8 per new ID, reference, access point, or path; at most
  8 KiB per description, scope, or limitation text. Retain the existing exact
  SHA-256 form and safe relative path/positive line-range rules.
- At most 2 MiB of UTF-8 for compact JSON serialization of the complete
  `sourceUsage` object, including metadata, notes, and repeated strings.
- Keep the existing 2,000-explicit-link limit for owners and allowed consumers.
  Enforce it separately from the source-use limits. Each source arrow needs at
  least one use record, so the 2,000-use cap also bounds source arrows. Do not add
  source uses to the permission-link total; the two meanings are never drawn
  together. Both data sets remain bounded before filtering.

Source-use shape, reference, count, or byte failures return `invalid-document`
with the affected path and useful reason. The existing architecture display
limit failure remains **Too large to display**. Validate the full candidate
before replacing a view. Hidden data cannot bypass a limit. Version 3 must run
all version 2 documentation refinements, not only accept its structural shape.

### Viewer rules and compatibility

Use the file version to select one relationship meaning. Add no new relationship
mode switch and never mix policy and source use into one arrow.

| File | Eligible connections and explanation |
| --- | --- |
| Version 1/2 | Keep recorded `allowedConsumers → owner` arcs and the permission legend. Preserve existing unknown-policy behavior without calling it observed use. |
| Version 3 | Use source records only. Draw `consumerId → owner.value` for `value` uses in `application` or `tooling` context with both endpoints known. Unknown permission never hides a source arrow. |

For version 3, use **Arrow: component uses the interface in saved source.**
State that the canvas includes application/tooling value references; type and
test references stay in details. Source inspection does not establish runtime
execution. This explanation must remain available when no arrows qualify.

Combine eligible sites into one arc per `(interfaceId, consumerId, ownerId)`.
Keep this existing arc identity. The file version selects one meaning, and a
successful file open resets the view; no relationship namespace is needed.
Preserve every use record in details, separate interfaces between the same
components, opposite directions, and multiple consumers. Owned-interface counts
still count each directly owned interface once.

Keep BR-08 Selected/All scope, label reveal, movement, Fit, focus recovery, and
the current inspection path. No arrows appear on initial open in Selected mode.
Do not roll a child's use up to its parent. Keep all self-use records; hide their
loops by default and show eligible loops with **Show self-connections**. Changing
scope, opening details, or reading sources must not rearrange the diagram.

In version 3, replace the permission-based unknown-consumer banner with one
source notice. Omit it when the baseline has no interfaces. Use these states:

| Source-use data | Notice |
| --- | --- |
| Object absent | **Source use not recorded.** |
| Object present with no assessments | **No interface source assessments recorded.** |
| One or more assessments | **Source review is partial. See interface details for scope and gaps.** |

Keep precise unassessed, unmapped, unknown-context, and unknown-provider reasons
in interface details. Add no global issue counters. An assessed empty list is
not unknown. Permission gaps stay in Access rule and Baseline details; they
must not create a “10 unknown consumers” notice beside known source connections.

Place **Used by** in interface Overview after the provider and short purpose.
Group known consumers by component ID and display their names. Order groups by
first appearance and rows by saved order. If names repeat, also show their IDs;
do not merge the components. Mark internal use only when the known consumer and
provider IDs match. Show application/tooling value uses first. Put type, test,
unknown-context, and unmapped records in a clearly named
**Other source references** disclosure within Used by. Show its count even when
the primary list is empty, and explain why these records have no canvas arrow.
Group that section by the same rules. Every row retains its kind, context,
description, and recorded entry binding. Label Used by as interface-wide use.
Changing the selected method does not filter it. A missing entry binding does
not mean that a consumer uses every method.

Keep **Access rule** below this section, with its existing permission wording.
Show permission and source use as separate facts. Permission-violation checking
is outside this change. Unknown owner does not prevent reading the known consumer
list. Manual/operator limitations remain readable even with no uses.
For version 3, clarify that **Runtime execution is not recorded**; do not use
wording that suggests its saved source references are absent.

Each use row has an inline **Caller source** disclosure for its saved caller
note and location. Reuse the existing disclosure state and location rendering.
Do not add a jump between tabs or a new selected-source state.

The existing Sources tab shows the common snapshot/mapping reference, scope,
limitations, and all caller/binding evidence. Group repeated evidence IDs while
retaining every use that cites them. Label source uses separately from intent
statements. Keep the current assessment plus common provenance in a disclosure
there and the full `sourceUsage` object in Baseline details. The interface's
Original record remains the interface record. Source locations stay plain text.
Normal tab focus, saved scroll, and disclosure state follow BR-10. This ticket
adds no new component-navigation path from Used by.

Legacy interfaces say **Source use not recorded.** and retain their permission
list and existing details. A successful file replacement resets version-specific
legend, use inspection, and view choices, including when saved IDs repeat. A
failed, cancelled, or superseded load preserves the complete current view.

### Analysis and publication rules

Update the actual Stage 4 emitted prompt in `app-a/stage-4-inspect.mjs` and the
Stage 5 prompt block in `app-a/step-5-cookbook.md`, which
`app-a/stage-5-commands.mjs` expands. Updating guidance alone is insufficient.
Keep one producer workflow and the existing nine-file review packet.

For each interface, request a source assessment or leave it explicitly
unassessed. Review public entries, caller sites, concrete callback bindings,
and native command registration as applicable. Map caller files to their direct
owners in the selected mapping. Keep test/type/tooling distinctions, self-use,
multiple sites, and partial scope. Stage 5 updates the one `sourceUsage.mappingRef`
to its candidate mapping and rechecks every carried assignment and interface
binding. Reuse unchanged caller evidence. Changed owners or interfaces must not
leave stale consumer IDs or entry references.

Do not require a consumer for every interface. Do not change `allowedConsumers`
without separate permission evidence. Preserve source-reviewed signatures,
unknown facts, descriptions, examples, and the evidence supporting them.
For an unresolved consumer or context, require an exact discovery question/gap
subject: `interface-id.sourceUsage.uses.use-id.consumerId` or
`interface-id.sourceUsage.uses.use-id.context`. These use stable IDs, not array
positions. An absent assessment or scoped empty list needs no fabricated gap.
The assessment's scope and limitations must still explain what was reviewed.

Shared Stage 4/5/6 validation checks the new structure, references, limits,
source identity, and mapping. Require `sourceUsage.snapshotRef === run.snapshot.id`
even when assessments are empty. Require `sourceUsage.mappingRef` to equal the
candidate's `discovery.codeMappingRef`; that mapping must use the same snapshot.
Check each caller file's direct owner against `consumerId`, including null.

During Stage 4/5 checks, use the candidate mapping, not the previous working
draft's mapping. The normal candidate artifact map
already admits that packet's planned mapping reference before registration.
Keep that specific path; do not allow arbitrary unregistered or foreign refs.
Stage 6 retains the published Stage 5 mapping selection.

Every use evidence reference must resolve to a direct source record in the
selected reviewed-file chain. This includes caller, declaration, configuration,
and binding support. Match each located note to that exact saved source record.
An unreviewed excerpt or a graph/query result cannot replace this evidence.
Graph/query artifacts can still describe assessment scope. Validate entry/access
bindings without claiming a tool proved the code's meaning.

Keep semantic review in the existing `llm/analysis-response.md`. Check the
complete candidate and representative binding chains. A validator can detect a
wrong hash or owner assignment; it cannot prove that a type import is a value
use. Preserve exposed prompt/model metadata and exact reviewed ranges.

Update `app-a/start-here.md`, `record-format.md`, Stage 4/5/6 guidance, the
Stage 5 working-baseline gate, shared validators, and the analysis design's
intent/observation description. Run evidence stays authoritative; version 3
embeds an explicitly scoped copy of reviewed source-use facts for offline viewing.
Keep run/discovery/packet versions unchanged unless their contracts actually
change. Keep the Stage 1 empty seed and existing immutable publication order.

Completed run 004 remains unchanged. A material correction requires a new run,
snapshot identity, baseline ID, and publication under the updated tools. A new
capture may use its saved snapshot as input, carrying forward all original
exclusions and capture limits. Do not mix in the live checkout or claim omitted
inputs were recovered. Never patch old frozen helpers, reset progress, replace
fixed files, or weaken digest checks to retrofit source use into run 004.

## BR-11 delivery tickets

### BR-11: Record and show source-consumer connections

**Planned.** This series adds the version 3 contract, viewer, analysis prompts,
and a supported successor to baseline 004. It does not change the graph layout
design or start a repository-analysis service inside Choom.

| Ticket | Deliverable | Depends on |
| --- | --- | --- |
| [BR-11A](#br-11a-read-and-validate-source-use-records) | Strict version 3 contract, complete validation, and original-record access. | Merged BR-10 |
| [BR-11B](#br-11b-draw-source-consumer-connections) | Source-use arrows with legacy policy compatibility and BR-08 controls. | BR-11A |
| [BR-11C](#br-11c-explain-consumers-and-review-scope) | Used by, source evidence, and clear missing/partial states. | BR-11B |
| [BR-11D](#br-11d-request-source-consumers-in-analysis-prompts) | Actual emitted prompts and a reviewed source-use packet. | BR-11A contract |
| [BR-11E](#br-11e-validate-and-publish-source-use-data) | Producer validation and normal Stage 4 → 5 → 6 publication. | BR-11C and BR-11D |
| [BR-11F](#br-11f-verify-the-published-connections) | Browser/installed validation and a new published successor to baseline 004. | BR-11E |

Use A → B → C → D → E → F as the reviewable delivery order. For production work,
write failing Cucumber acceptance first, then follow each small red/green/refactor
step. Keep passing legacy behavior as characterization. Expected failures below
are predictions, not claims that tests have run. If an earlier ticket already
makes a scenario pass, retain it; never create an artificial failure.

D/E change prompts and external tooling. Their Given-When-Then specifications
drive recorded document/command/artifact checks. They do not require unit tests
or Cucumber wrappers for scripts. If they expose a production defect, first add
a failing test at the affected reader/viewer boundary. This follows the same
repository rule as BR-10E.

#### Shared fixtures and the run 004 check

Use small synthetic fixtures for individual contract and UI cases. Include an
interface with known source callers and unknown permission; different known
permission and source lists; several sites for one connection; opposite directions;
several interfaces between one pair; self-use; type/test/tooling/unknown contexts;
unknown consumer and owner; repeated component names; unassessed and scoped-empty
assessments; and bindings to named entries. Preserve unchanged version 1/2
fixtures. Do not make legacy
fixtures appear to contain source observations by relabeling permission lists.

Unless a scenario says otherwise, source-use fixtures have known endpoints,
`kind: value`, `context: application`, and valid caller/binding evidence. Use
both legacy versions for compatibility cases. Keep an empty baseline and a v3
file without `sourceUsage` as valid inputs. Malformed fixtures change one rule
at a time so each rejection has a clear cause.

Build a separate reviewed fixture from the run 004 saved source and mapping.
The following interface IDs have prefix `s4-001-`. These relations are the
expected set for this bounded fixture, not a complete-repository absence claim.

| Consumer | Interface suffix | Provider | Relation |
| --- | --- | --- | --- |
| Workspace | `baseline-model` | Architecture model | Cross-component |
| Workspace | `browser-file-input` | Desktop adapter | Cross-component |
| Workspace | `desktop-selection` | Desktop adapter | Cross-component |
| Workspace | `desktop-file-read` | Desktop adapter | Cross-component |
| Desktop adapter | `native-file-read` | Native shell | Cross-component |
| Workspace | `load-workflow` | Workspace | Self |
| Workspace | `baseline-decoder` | Workspace | Self |
| Workspace | `prepared-layout` | Workspace | Self |
| Workspace | `interface-inspection` | Workspace | Self |
| Desktop adapter | `desktop-selection` | Desktop adapter | Self |
| Native shell | `native-file-read` | Native shell | Self |

The cross-component evidence is `src/lib/baseline-yaml.ts:19`,
`src/architecture/workspace.ts:11–21`, and the IPC chain in
`src/platform/documents.ts:33–46` → `src-tauri/src/lib.rs:13–15`.
Preserve exact registered source locations and mapping references when authoring
the new packet; line numbers alone are not evidence identity.

Keep all ten original permission values null. Do not add a Choom-root caller.
The manual publication interface, `s5-001-producer-publication`, has no modeled
caller established in this review. Retain its operator-command limitation.
The fixture has five cross-component and six self connections. Additional
test/type records remain separately classified and do not add canvas arrows.

Carry all 28 documented entries, 20 known signatures, one explicitly unknown
function signature, and seven entries that do not require a signature. The new
publication must review and rebind evidence to its own selected snapshot and
record chain; do not paste foreign evidence IDs into a new run.

#### BR-11A: Read and validate source-use records

**Acceptance first — `@br-11a`; decoder cases use the native profile,
file replacement and record access use `@browser`:**

```gherkin
Scenario: Read source use independently from permission
  Given a valid version 3 baseline records a source consumer and an unknown permission policy
  When the public decoder reads the baseline
  Then it retains the use, its evidence, and the unchanged null permission

Scenario Outline: Keep old formats strict
  Given a version <version> baseline contains sourceUsage
  When the public decoder reads the baseline
  Then it rejects the unsupported field without upgrading the file

  Examples:
    | version |
    | 1 |
    | 2 |

Scenario: Read a version 3 file without source-use data
  Given a valid version 3 baseline has no sourceUsage object
  When the public decoder reads the baseline
  Then it retains the architecture and documentation without inventing source-use records

Scenario Outline: Reject invalid source-use records
  Given a version 3 candidate contains <defect>
  When the public decoder reads the candidate
  Then it reports invalid-document at the affected field

  Examples:
    | defect |
    | duplicate interface assessments |
    | duplicate use IDs within one assessment |
    | a missing component reference |
    | a missing interface reference |
    | a blank shared mapping reference |
    | a callerRef with no matching located source note |
    | binding evidence with no matching located source note |
    | a use evidence reference containing a fragment |
    | a source note from a different snapshot |
    | conflicting entry and access-point bindings |
    | an unsupported kind or context |
    | a source-use count or byte limit exceeded |
    | invalid version 2 documentation inside version 3 |

Scenario: Retain the current view on an invalid replacement
  Given a readable baseline is open with an interface and example selected
  When the user opens malformed or excessive version 3 data
  Then the failure leaves the current drawing, legend, inspection, and choices intact

Scenario: Keep source records accessible before the formatted panel lands
  Given a version 3 baseline is open
  When the user opens its original source-use data in Baseline details
  Then every saved assessment and use value is available

Scenario: Do not apply permission projection to the new format
  Given a version 3 interface permits Admin and records Client as its only source consumer
  When the user selects All connections
  Then no permission arrow or permission-based unknown-consumer message is shown
```

**First red:** A valid version 3 fixture currently returns unsupported-version.
Assert decoded success and retained data after setup succeeds. Keep valid
version 1/2 and unsupported-future-version cases as characterization.

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Versioned boundary | Public decoder/interface test accepts v3, retains all fields, and keeps v1/2 strict. | Add TypeSpec v3 and generated outputs; update decoder dispatch and strict runtime validation. | Share unchanged architecture/documentation shapes without widening older versions. |
| 2 — Local integrity | Domain tests reject duplicate IDs, bad kinds/contexts, dangling references, and conflicting entry bindings. | Add the declared reference and local-ID rules. | Use validated indexes; avoid a second mutable model. |
| 3 — Evidence shape | Interface tests require a shared mapping reference, callerRef in its use evidence, direct reference syntax, a located note for every use reference, matching snapshot, and safe locations. Include caller and binding-note failures. | Validate in-file evidence structure. | Reuse BR-10 location checks; leave artifact-kind and review-chain checks to the producer. |
| 4 — Bounds | Exact and one-over count/UTF-8/total limits, including multibyte text and filtered records, produce the specified outcomes. A file within the separate source and legacy-link budgets passes even when their sum exceeds 2,000. | Enforce source-use budgets before layout and retain the existing architecture limits. | Keep documentation, source-use, and architecture budgets independent; do not count source records twice. |
| 5 — Documentation inheritance | V3 rejects the same invalid signature, local reference, and source-reviewed example cases as v2. | Extend every v2-only refinement to v3, including the total documentation budget. | Share the semantic checks rather than copying them. |
| 6 — Version guard | DOM/browser tests exclude permission arrows, legend, and missing-policy banners for v3 even when it contains known permissions. | Guard the old projection and explanations now; B adds source rendering and C adds its detailed summary. | Derive meaning from the file version at one boundary. |
| 7 — Complete load | Browser acceptance rejects bad replacements atomically and exposes valid original source-use data. | Connect the new union to existing load publication and Baseline details. | Retain cancellation, late-result, and same-ID session rules. |

**Complete when:** The native/browser scenarios and affected contract/load tests
pass; TypeSpec, generated outputs, decoder notes, and limits agree. No source
fetching, native command, permission migration, or producer publication is added.

#### BR-11B: Draw source-consumer connections

**Acceptance first — `@br-11b @browser`:**

```gherkin
Scenario: Show known source use with unknown permission
  Given a version 3 interface has two reviewed application value-use sites from Client to Provider and null allowedConsumers
  When the user selects Client
  Then one source-use arrow connects Client to Provider for that interface
  And the legend describes saved source use

Scenario: Keep different relationship meanings separate
  Given a version 3 interface permits Admin but records only Client as a source consumer
  When the user selects All connections
  Then only the Client source-use arrow is shown
  And Admin remains in Access rule

Scenario: Explain an excluded source reference
  Given a version 3 interface has only type or test uses
  When the user selects its provider
  Then no canvas arrow appears and the explanation directs those references to details

Scenario Outline: Preserve legacy permission arrows
  Given an unchanged version <version> file records a permitted consumer
  When the user selects that consumer
  Then its existing arrow is shown with the permission legend

  Examples:
    | version |
    | 1 |
    | 2 |

Scenario: Draw a tool's recorded value use
  Given a version 3 tool component has a reviewed value use of another component's interface
  When the user selects the tool component
  Then its source-use arrow is shown with the same direction as application use

Scenario: Keep unknown endpoints local to their records
  Given an interface has one known source consumer and a different use with no mapped consumer
  When the user selects its known provider
  Then the known connection is shown without an arrow or placeholder for the unmapped use

Scenario: Do not infer a source connection from permission
  Given a version 3 file records a permitted consumer but no sourceUsage
  When the user selects All connections
  Then no arrow is inferred from that permission

Scenario: Keep self-use optional
  Given a version 3 file has a self-use and a cross-component use in All mode
  When the user enables Show self-connections
  Then the self-loop joins the cross-component arrow without moving components
```

**First red:** After A, the new file opens but the current arc calculation cannot
show its source-use arrow when permission is null. Assert the expected arrow
count; a failed click on an absent curve is not the red assertion.

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Arc calculation | Native unit cases derive application/tooling value connections despite null permission; v3 absence produces no fallback. | Derive source arcs for v3 and legacy permission arcs for v1/2. | Keep the calculation read-only and select its meaning by file version. |
| 2 — Eligibility | Unit cases exclude type/test/unknown-context and unresolved endpoints while retaining other valid connections. | Apply the fixed eligibility rules per use. | Keep missing data separate from canvas filtering. |
| 3 — Identity | Several sites become one connection; interfaces, opposite directions, and distinct consumers remain distinct. | Reuse the existing endpoint identity and preserve each saved use record. | Avoid new namespaces or one arc per method/evidence site. |
| 4 — Rendering | DOM tests expose the correct legend and complete accessible names for each version. | Connect source arcs to current handles, routing, labels, and inspection. | Reuse arc rendering rather than adding a second diagram. |
| 5 — View rules | Browser cases cover Selected/All, direct interface inspection, hidden/enabled self-use, movement, and Fit. | Apply BR-08 filters and geometry to the new connections. | Keep passing gesture/focus behavior as characterization. |
| 6 — Replacement | Browser cases replace v3 with v2 and back, including repeated IDs and a failed open. | Derive meaning from the published baseline and retain existing session lifetime. | Remove stale kind-specific state rather than keying it by saved IDs. |

**Complete when:** B acceptance and affected BR-07/08 geometry, focus, label,
filter, and load checks pass. Derive all five reviewed cross-component
connections; the visible subset depends on the existing selection rules.

#### BR-11C: Explain consumers and review scope

**Acceptance first — `@br-11c @browser`:**

```gherkin
Scenario: Read usage separately from permission
  Given an interface records Client as a source consumer and Admin as a permitted consumer
  When the user opens its Overview
  Then Used by names Client and Access rule names Admin with their separate meanings

Scenario Outline: Explain the assessed state
  Given the interface has <state>
  When the user opens Used by
  Then it shows <explanation> without inventing a consumer

  Examples:
    | state | explanation |
    | no sourceUsage object | Source use not recorded |
    | no interface assessment | Source use not assessed for this interface |
    | an assessed empty list | No uses found in the reviewed scope |
    | a known consumer with partial coverage | the known consumer and the review limits |
    | a known consumer and unknown provider | the known consumer and Provider unknown |
    | a use with no component owner | the caller location and unresolved mapping reason |
    | only type or test references | the Other source references count and why no arrow is shown |

Scenario: Inspect a caller's support
  Given an interface has several sites supporting the same consumer
  When the user expands Caller source on one use row
  Then that row shows its saved caller note and location without changing tabs
  And no source file or command is opened or executed

Scenario: Keep common mapping and binding evidence available
  Given an interface has several sites and a resolved callback binding
  When the user opens Sources
  Then the common snapshot and mapping and each site's supporting evidence remain available

Scenario: Do not apply interface approval to source use
  Given the interface's intent statements are accepted and it has source uses
  When the user opens its details
  Then the accepted status is labeled for interface statements and does not certify source use or execution

Scenario: Keep interface-wide use clear during method inspection
  Given different uses name different entries of one interface
  When the user selects another entry
  Then Used by retains the interface-wide list with the recorded entry bindings

Scenario: Explain policy gaps without hiding source use
  Given a version 3 file has assessed uses and all ten permission policies are unknown
  When the user inspects its connections
  Then the source notice says the review is partial without counting permission gaps as unknown consumers
```

**First red:** After B, arrows work but Overview has no readable Used by section.
Assert the consumer name and distinct permission text after the panel opens.

**TDD steps:**

| Step | Red: focused test first | Green: smallest passing change | Refactor while green |
| --- | --- | --- | --- |
| 1 — Assessment states | DOM tests distinguish absent object, absent assessment, scoped empty list, and known uses from partial review. | Render the defined state text and scope. | Derive state from records; add no completeness flag. |
| 2 — Consumer groups | DOM tests keep same-name components distinct, retain all sites and entry bindings, and show known consumers when the provider is unknown. Entry changes do not imply method-wide use. | Group by consumer ID, label interface-wide use, show IDs when names repeat, and retain unresolved rows. | Reuse existing name and entry rendering; do not add a navigation stack. |
| 3 — Source inspection | DOM/browser tests expand caller details without changing tabs; Sources retains the common mapping, binding evidence, and complete record. Normal tab changes keep scroll and disclosure state. | Reuse inline disclosures and extend Sources to the assessment. | Share location rendering; add no cross-tab jump or selected-source state. |
| 4 — Notice and statuses | DOM cases cover absent data, no assessments, partial assessments, and zero interfaces. Accepted intent and unknown permission do not alter source-use meaning. | Use the three source notices and label intent status separately; retain the legacy policy explanation. | Keep exact missing-data reasons in details and remove global issue counters. |
| 5 — Input and layout | Browser cases cover keyboard/touch, narrow and short panels, long names/locations, Back, and cancelled/replaced loads. | Correct any new focus, overflow, or stale-selection gaps at their owner. | Retain selected-content rendering and existing inspection lifetime. |

**Complete when:** C acceptance and affected BR-10 reading/navigation checks pass.
Every recorded use remains reachable, including those omitted from the canvas.
Source review, proposed component mapping, permission, and execution are not
presented as interchangeable claims.

#### BR-11D: Request source consumers in analysis prompts

**Acceptance specification first — document and emitted-prompt review:**

```gherkin
Scenario: Request source use in the prompts the analyst receives
  Given disposable Stage 4 and Stage 5 attempts use the new trusted tools
  When the normal preparation commands emit their review prompts
  Then both prompts request source uses, exact caller evidence, selected ownership, and partial scope
  And they keep permission policy and execution claims separate

Scenario: Recover a concrete binding
  Given reviewed source constructs a reader, injects its callback, and invokes it through a workflow
  When the analyst prepares the source-use assessment
  Then the record cites the caller and binding chain with the direct consumer owner

Scenario: Retain useful results from partial review
  Given the reviewed scope contains value use, self-use, type/test references, and a manual command
  When the analyst prepares the packet
  Then the packet preserves each category without guessing a manual component caller or complete permission policy

Scenario: Recheck uses when ownership changes
  Given Stage 5 changes the direct owner of a caller file
  When the analyst prepares the complete Stage 5 packet
  Then sourceUsage names the candidate mapping and every carried consumer matches that mapping

Scenario: Carry unchanged uses to the next selected mapping
  Given Stage 5 emits a new mapping with unchanged caller assignments
  When the analyst prepares the complete Stage 5 packet
  Then the one shared mapping reference changes and valid caller evidence is retained
```

**First failing review:** Inspect the actual current emitted prompts. Record
that they request permission/documentation but do not require this structured
source-use assessment. Do not label an absent tool or failed setup as a feature
failure, and do not test prompts by requiring exact prose.

**Small check–change–simplify cycles:**

| Step | Failing check or review first | Smallest passing change | Simplify after success |
| --- | --- | --- | --- |
| 1 — Meaning | Compare current authoring guidance with a caller whose permission is unknown. | Document the v3 record and independent source/policy questions. | Reuse existing evidence and mapping concepts; no new analysis mode. |
| 2 — Emitted prompts | Prepare fresh attempts and read the actual Stage 4/5 prompt artifacts. | Update Stage 4's prompt owner and Stage 5's marked block, with concrete call/binding/type/test/self cases. | Keep one authoritative prompt source for each stage. |
| 3 — Reviewed packet | Review a bounded packet against the synthetic and run 004 source cases. | Require direct caller mapping, reviewed caller/binding ranges, scoped empty results, and unresolved reasons. | Remove guessed consumers and redundant claims; retain known uses. |
| 4 — Carry-forward | Review Stage 5 candidates with unchanged and changed owners but a stale shared mapping reference. | Update the shared mapping reference once and recheck every carried assignment and binding. | Reuse unchanged caller evidence; add no per-use mapping copies or patch protocol. |
| 5 — Guidance consistency | Trace start-here → stage prompts → record format → analysis design; inspect a worked record and unknown case. | Update the affected Markdown guidance and source/intent explanation. | Keep one contract definition and short examples, preserving signature instructions. |

**Complete when:** The emitted prompts and a reviewed packet cover the specified
cases; their saved metadata and source ranges are truthful. No production code
or completed user run is changed by this ticket. E owns executable publication
support; D does not claim an unpublished packet already passes it.
For D's Stage 5 prompt check, use a valid version 1/2 predecessor. This lets D
verify the emitted prompt before E adds version 3 publication. Save the v3
candidate for E's command checks.

#### BR-11E: Validate and publish source-use data

**Acceptance specification first — real command and artifact checks:**

```gherkin
Scenario: Publish a reviewed source-use candidate through all stages
  Given a disposable packet has valid v3 uses, one selected mapping, and reviewed source records
  When normal Stage 4 publication, Stage 5 collection/publication, and Stage 6 readiness/save complete
  Then the fixed baseline matches the reviewed Stage 5 bytes and opens in the new reader

Scenario Outline: Reject unsupported source use before replacing drafts
  Given a disposable review packet has <defect>
  When the normal publication check validates it
  Then it reports the defect without replacing drafts or completed artifacts

  Examples:
    | defect |
    | a caller hash, snapshot, path, or range mismatch |
    | sourceUsage with an empty assessments list naming a different run snapshot |
    | a collected caller excerpt absent from the selected reviewed-file chain |
    | a reviewed caller whose binding evidence was collected but not reviewed |
    | a graph artifact supplied as use evidence instead of reviewed source |
    | a caller assigned to a different component in the selected mapping |
    | a shared mapping reference from an earlier selection |
    | an unresolved consumer explained only by a permission gap |
    | a source-use or inherited documentation limit exceeded |
    | a decodable file that exceeds the complete display-link limit |

Scenario: Reject a semantically false use
  Given a candidate labels a type-only import as an application value use
  When the manager reviews the cited source and complete candidate
  Then the claim is corrected or rejected before publication

Scenario: Preserve historical runs
  Given a completed version 1 or 2 run and its matching trusted tools
  When the normal verification command checks it
  Then verification passes without changing the run's registered files or pins

Scenario: Reject changed tools within an attempt
  Given a disposable new attempt has pinned tools
  When the attempt is checked with changed tool bytes
  Then it is rejected without replacing its frozen files
```

**First failing check:** Submit a valid v3 packet to the current publisher. It
rejects the format. Record that outcome before the change and the later success.
Use fresh attempts when helper bytes change; never patch frozen tools to keep
using an earlier disposable attempt.

**Small check–change–simplify cycles:**

| Step | Failing check or review first | Smallest passing change | Simplify after success |
| --- | --- | --- | --- |
| 1 — Version gates | Run v3 through the Stage 5 working-baseline gate and shared Stage 4/5/6 validator. | Accept the agreed v3 profile while preserving v1/2 and the seed path. | Keep one shared record-validation path. |
| 2 — Evidence and ownership | Submit a wrong common snapshot or mapping, unreviewed caller/binding ranges, and wrong/null owner assignments. Include empty assessments so checks cannot depend on a caller's existence. | Check the run snapshot and candidate mapping once; check every cited source use and caller assignment before replacement. | Reuse evidence resolution and immutable snapshots; no second registry or per-use mapping copies. |
| 3 — Binding and unknowns | Check conflicting entry/access bindings and exact discovery subjects for null consumer/unknown context. | Enforce local bindings and existing gap rules extended to the new subjects. | Keep manual limitations and assessed empty lists out of fabricated unknown gaps. |
| 4 — Reader agreement | Compare exact/over bounds, a file within the separate source/legacy-link budgets, and a decode-success/display-failure candidate with the public reader boundary. | Enforce the same separate source, documentation, file, and architecture limits. | Do not sum independent link budgets or treat packet size as viewer compatibility. |
| 5 — Publication lifecycle | Rehearse Stage 4 → 5 → 6, old-run verification, changed-tool rejection, and failed publication recovery. | Update format-specific gates while retaining byte preservation and manifest-last publication. | Keep nine-file packets, run/discovery formats, pins, and receipts intact. |
| 6 — Semantic review | Review callback/IPC resolution, type/test context, manual scope, and unchanged permission against saved source. | Correct unsupported claims and retain actual limits before approval. | Keep the semantic result in the existing analysis response rather than inventing a runtime-proof flag. |

**Complete when:** Valid/invalid command outcomes and selected artifact digests
are recorded, and the normal reader opens a disposable published v3 baseline.
Primary tooling owners are `app-a/stage-6-records.mjs`,
`app-a/stage-4-5-publish.mjs`, and the Stage 5/6 command gates. Use syntax,
contract, command, artifact, and manual checks for these scripts. Fix a production
reader defect with a failing production test first. Historical files stay intact.

#### BR-11F: Verify the published connections

**Acceptance and characterization first — `@br-11f @browser` and the normal
installed opening journey with `@packaged`:**

```gherkin
Scenario: Read the reviewed Choom connections
  Given the normal file control opens the published v3 review fixture
  When the user selects All connections with self-connections off
  Then five interface arrows represent the reviewed cross-component uses
  And all ten permission policies remain unknown

Scenario: Inspect a focused component
  Given the published review fixture is open in Selected mode
  When the user selects Workspace
  Then four cross-component interface arrows are shown without moving components
  And no descendant-only or Choom-parent use is invented

Scenario: Include recorded internal use
  Given the published review fixture is open in All mode
  When the user enables Show self-connections
  Then its five cross-component and six self connections are shown

Scenario: Read callers and signatures from the same published bytes
  Given the published fixture has source uses and all retained BR-10 documentation
  When the user completes the interface reading journey
  Then callers, evidence, scope, entry signatures, examples, and permission agree with the file

Scenario: Preserve the old run when publishing its successor
  Given the completed run 004 and its saved source are retained
  When the normal new-run workflow publishes the reviewed source-use successor
  Then it has new run, snapshot, and baseline identities and the original run's registered files are unchanged
```

The last scenario is a real publication/artifact check, not a Cucumber wrapper
for a script. The UI scenarios use the same published bytes in browser and
installed app. Exact relation counts apply to the bounded fixture above. A later
broader analysis can find additional supported callers; it must not delete them
to satisfy this fixture's count.

**First check:** Run the complete published-file journey after A–E. Keep passing
outcomes as characterization. If an assertion exposes a real gap, write the
small failing test at its production owner, fix it, and refactor while green.
This ticket can complete with verification and publication evidence when the
production behavior already passes.

**Verification and TDD for discovered gaps:**

| Step | Check first | If it fails: smallest correction | Refactor while green |
| --- | --- | --- | --- |
| 1 — Published artifact | Open identical published bytes in browser and installed app; compare the five cross/six self connections and all original permissions. | Fix the responsible reader, arc calculation, or publisher with its appropriate red test/check. | Keep the normal file route and one supported contract. |
| 2 — Full reading journey | Read Used by, inline caller details, other references, scope, common mapping/binding evidence, entry signatures, Example, and Access rule; return with Back. | Fix missing or misleading content, focus, or navigation at its owner. | Reuse BR-10 reading frames and BR-08 graph state. |
| 3 — Lifecycle and limits | Exercise v1/v2/v3 transitions, repeated IDs, failed/cancelled opens, late work, exact bounds, long text, and narrow/short windows. | Add a focused failing regression for any newly exposed behavior. | Retain old protections; do not raise limits or silently drop data to pass. |
| 4 — Reader meaning | Ask a reader to distinguish source use, permission, partial coverage, hidden self-use, and executed calls. Record actual answers or a manager self-check and its limits. | Revise misleading labels or reading order and test changed UI behavior. | Remove redundant explanations before adding new permanent controls. |
| 5 — Successor publication | Publish under new tools from a new capture of the saved run 004 snapshot, carrying original exclusions/limits; compare old registered hashes. | Correct the new candidate or stop a failed publication through normal recovery. | Never edit the old run or use an in-place finalizer. |

**Complete when:** The browser and installed checks identify the tested build,
platform, file hash, and any remaining environment limits. A new published
successor is available to open in Choom, and run 004 is unchanged. Confirm that
the source snapshot used for the successor is the saved input, not the changed
live viewer. At supported upper limits, record file-open and interface-open
times on named hardware and check that the last use and its source are reachable.
Do not claim a performance threshold without measurement. The result is a source
review, not runtime verification.

### BR-11 verification and implementation boundaries

The [BR-11 verification record](../change-requests/BR-source-consumer-evidence.md)
records actual red/green assertions, producer checks, artifact hashes, manual
review, and platform limits as implementation proceeds. The requirements above
do not establish that those checks passed.

Expected production owners are TypeSpec/generated domain contracts,
`src/domain/baseline.ts`, documentation refinements, the public YAML decoder,
display limits, interface arc projection, and the existing diagram/inspector.
Keep platform file APIs and native commands unchanged unless a demonstrated gap
requires a separate contract change. Keep TypeSpec as the contract source; do
not hand-edit generated output or use a second ad hoc schema in the viewer.

Register A–C and F's browser/installed Cucumber journeys with existing runners
and component manifests, even if F finds no production defect. Add focused TDD
suites for production changes and any discovered gaps. Use native `@br-11a`, browser
`@br-11`, and installed `@br-11f`; classify focused tests by the repository's
unit/interface/integration definitions. Run changed tests, affected BR-07/08/10
acceptance, `bun run check`, `bun run check-types`, `bun run build`, and
`bun run habit-hooks --all`. Generate and check TypeSpec when contracts change.
The assembled desktop journey needs a freshly built installed app; browser
tests and IPC doubles do not establish that route. Record unavailable platforms
as limits, not passing evidence.

D/E use syntax, link, emitted-prompt, real command, and artifact checks rather
than new behavior tests for scripts. Run Habit Hooks on the complete candidate
and keep the snooze file empty. Review all four constraint categories; update
only changed artifacts and leave unrelated architecture/OpenSLO rules alone.
If PRs are later requested, keep the tickets in a draft stack and follow the
existing review and merge rules. Approval of this plan is not a test result.
