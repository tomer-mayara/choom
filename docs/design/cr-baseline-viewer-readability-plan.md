# Baseline viewer readability plan

Status: **BR-01 to BR-04 and BR-07A to BR-07D are merged. BR-07 replaces BR-06.
BR-08A to BR-08D are implemented in the draft PR stack. BR-05 remains planned.**

Reviewed: **2026-11-13**

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

This plan follows the [baseline viewer plan](cr-baseline-viewer-plan.md).
BR-01 to BR-04 replaced that plan's rules for showing every record on the canvas,
double-click inspection, and automatic fitting on resize. The baseline format,
read-only file access, statement meanings, and load protections stay in force.

This document defines the intended behavior and ticket sequence. Its scenarios
are requirements, not test results. See the
[verification record](../change-requests/BR-readability-evidence.md) for completed
checks and platform limits. That record describes checks made before the stack
merged; its draft-PR wording is historical. The status above is current.
See the [BR-07 verification record](../change-requests/BR-interface-arcs-evidence.md)
for interface-arc implementation checks.
See the [BR-08 verification record](../change-requests/BR-connection-readability-evidence.md)
for connection visibility, label, and view-lifetime checks.

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
| Follow-up | BR-05 | Expand and collapse component groups. |
| Superseded | BR-06 | Replaced by BR-07; do not implement the temporary interface node. |
| Merged | BR-07A to BR-07D | Interface arcs, unknown-endpoint explanations, inspection, and complete-drawing Fit. |
| Implemented in the draft PR stack | BR-08A to BR-08D | Selected connections, labels on demand, optional self-connections, and Fit/lifetime checks for the filtered view. |

BR-07 follows review of the component-only view. It can build directly on BR-04;
it does not require BR-05. The collapse rules below apply when both features
exist. BR-05 remains a separate follow-up. BR-08 builds on BR-07D and does not
require BR-05.

Remember the arrangement while the current baseline remains open. Saving it
across app restarts or successful file opens remains out of scope, as do
multi-selection, comparison panels, general record filters, interface editing,
model editing, export, and automatic dependency inference. BR-08 adds only the
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

1. After the predecessor passes, write the Cucumber acceptance scenarios first.
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
