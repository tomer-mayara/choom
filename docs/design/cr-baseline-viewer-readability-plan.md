# Baseline viewer readability plan

Status: **BR-01 to BR-04 are merged, with CI checked after each merge. BR-05
remains planned. BR-07A to BR-07D are implemented and verified locally.
BR-07 replaces BR-06.**

Reviewed: **2026-11-12**

## Decision and goal

Show components first. When the user selects a component, show its interfaces
in a side panel. Let the user move components to make the drawing easier to read.
BR-07 adds labelled interface arcs between recorded consumers and owners. Keep
the interface counts and the side panel.

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

## Problem in the starting view

The reviewed baseline contains 5 components, 8 interfaces, and 5 resources.
Before this work, the view gave all 18 records large cards. Interfaces and
resources sat outside their owners, with ownership lines crossing the drawing.
Repeated IDs, types, and statuses competed with names, which were often truncated.

Dragging was disabled. The detail panel blocked interaction with the canvas,
and resizing fitted the whole diagram again.

## Delivery scope

| Stage | Tickets | Result |
| --- | --- | --- |
| Merged | BR-01 to BR-04 | Side-panel inspection, a compact component overview, movement, and reset. |
| Follow-up | BR-05 | Expand and collapse component groups. |
| Superseded | BR-06 | Replaced by BR-07; do not implement the temporary interface node. |
| Implemented and verified locally | BR-07A to BR-07D | Interface arcs, unknown-endpoint explanations, inspection, and complete-drawing Fit. |

BR-07 follows review of the component-only view. It can build directly on BR-04;
it does not require BR-05. The collapse rules below apply when both features
exist. BR-05 remains a separate follow-up.

Remember the arrangement while the current baseline remains open. Saving it
across app restarts or successful file opens remains out of scope, as do
multi-selection, comparison panels, global filters, interface editing, model
editing, export, and automatic dependency inference.

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
  relationship lines. BR-07 adds the interface arcs specified below. Component
  nesting shows the parent relationship without lines; resource details stay
  in the panel.
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
the panel, leave it there. A successful file open has its own focus rule below.
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
| Fit view | Fit all shown components. BR-07 also includes visible arc paths, arrowheads, and labels. Include items outside the viewport; keep all positions. |
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

### BR-07: Interface arcs between components

The arc represents the interface. Show a curved arrow from each recorded allowed
consumer to the recorded owner, labelled with the interface name:

```text
Consumer ── interface name ──▶ Owner
```

Show known arcs in the normal overview. There is no separate connection mode,
temporary interface node, or Show/Hide connections control. When arcs are shown,
include a short legend:
**Arrow: consumer may use the owner's interface.** This describes recorded
permission, not observed calls, data flow, or a confirmed runtime dependency.

#### Recorded facts and unknown values

Read `owner.value` and `allowedConsumers.value` from each interface. An arc
needs both endpoint IDs. The following table applies before collapse visibility.

| Recorded owner | Recorded allowed consumers | Canvas and panel result |
| --- | --- | --- |
| Known | Known, nonempty list | One arc from each listed consumer to the owner. Keep the complete list in the panel. |
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
consumers of one interface. An owner also listed as a consumer gets a self-loop.
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

Labels scale with the diagram. Use at most two lines and no more width than a
component header. Keep the full name in the accessible label and panel. The
accessible label also identifies the consumer and owner, with IDs where names
repeat. Give the curve a generous pointer target and the label a keyboard
control for Enter and Space. The HTML label is the focus return target for
either input route.
Arc input must not start a canvas pan or component drag. A fresh arc click must
work on first open and after a component drag; it needs no prior component press.

| Current inspection | Arc emphasis |
| --- | --- |
| Component | Highlight its incoming and outgoing arcs; dim unrelated arcs. |
| Interface, opened from an arc or a list | Highlight all arcs for that interface; dim unrelated arcs. |
| Resource, Baseline details, Rules, or closed panel | Show arcs normally. |

An arc selection opens the existing interface panel and starts a new inspection
path, without a Back entry. Selection from an owned-interface list keeps that
list's Back behavior and the originating component highlight. Do not add a
second persistent selection model for arcs. Different arcs for one interface
open the same recorded details, but keep the exact initiating arc as the focus
return target.

Pointer selection keeps focus on the arc's label. Keyboard activation moves
focus to the panel heading. Closing the panel restores that label only when
focus was in the panel. Keyboard focus alone does not select an interface.
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

Fit view includes all shown components and the full bounds of visible curves,
arrowheads, and labels, including self-loops outside component bounds. It uses
the actual canvas space beside or above the open panel. Use a positive, finite
zoom small enough to contain those bounds. The current 1% zoom floor must not
clip a widely spread drawing. After Fit, Zoom Out decreases zoom when enabled
or is disabled at the minimum. Zoom In remains available. Neither control may
snap back to a larger minimum. Selection, panel close, resize, and movement
do not fit the view. Initial open and Reset keep the 100% starting-view rule.

Apply the existing view lifetime rules to arcs as well as components. A pending
arc press belongs to the view where it started; releasing it after a successful
open must not select a record in the replacement view, even if IDs repeat.

#### Compatibility with BR-05

BR-07 does not require collapse. When BR-05 and BR-07 are both present, hide an
arc if either actual endpoint header is hidden. Never redirect it to an
ancestor. Collapsing an endpoint itself keeps its header and arcs visible if
the other endpoint remains visible. Expansion restores arcs at stored positions.
Inspection does not expand groups or fit the view. Keyboard focus reveal still
applies.

Keep interface details available and explain when a collapsed group hides a
known connection. Distinguish this from an unknown endpoint. If collapse hides
the focused arc label, move focus to that group's collapse control. If an arc
opener is hidden when the panel closes, use the owner's visible header or its
nearest visible ancestor, then Baseline details. Leave focus alone when it is
already outside the panel. The ticket implemented last must verify this combined
behavior; neither ticket needs to implement the other one.

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
| [Camera rules](../../src/lib/architecture-viewport.ts) | Calculate the normal starting view, keyboard focus reveal, and Fit bounds including BR-07 arcs. |
| Interface arcs (BR-07) | Derive arcs from recorded owners and consumers. Anchor them to current headers, expose inspection, and explain unknown endpoints. |
| [Workspace view](../../src/architecture/workspace-view.ts) and [app](../../src/App.tsx) | Reset view state on each successful file open. Keep the existing example path. |
| [Workspace contract notes](../../cookbook/interfaces/workspace.md) | Update display coverage, inspection, focus, movement, and fitting rules when their tickets are implemented. |

The initial published baseline/layout pair stays read-only. Keep user positions
in a viewer-owned copy. Derive interface ownership lists and counts from the
baseline; do not maintain a second mutable architecture model. Each kind of
view state has one owner: reuse the existing inspection state, arrangement, and
gesture owners. They share the lifetime of the current baseline/layout pair,
which stays stable until a successful open. Do not key that lifetime by saved
IDs or progress updates. No new load ID or persistent cache is needed.

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
`@br-07` plus `@br-07a` through `@br-07d`. Use `@browser` or `@packaged` for the
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

BR-01 preceded hiding nodes in BR-02 so each record retained a route to its
details. BR-01 to BR-04 landed as a PR stack. Keep future tickets reviewable on
their own. BR-07's smaller tickets below define implementation order; this plan
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

**Implemented and verified locally.** This is the umbrella for BR-07A to BR-07D.
See the [verification record](../change-requests/BR-interface-arcs-evidence.md)
for results, source identity, measurements, and platform limits. The expanded
tickets below retain their acceptance and implementation requirements.
Each begins with its own acceptance test. The `@br-07` tag selects their combined
acceptance.

**Scope:** Apply the BR-07 view rules above. Keep the baseline format, original
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

## Verification and review

Use `test/fixtures/baseline-viewer/full.yaml` and `empty.yaml`, plus small
synthetic fixtures for repeated names, long names, multiple roots, mixed
statement statuses, and records without components. For BR-07, include two
consumers of one interface, parallel and opposite arcs, self-use, parent-child
endpoints, all four known/unknown endpoint combinations, and mixed complete and
incomplete interfaces. Keep `full.yaml` unchanged for the unknown-consumer case.
Include at-limit and excessive inputs. Test fixtures must live in the repository.

For each implemented ticket, run its changed tests locally before committing.
Examples of focused commands after the features exist:

```sh
bun run test:e2e --tags @br-01
bun run test:e2e --tags @br-07
bun run test:e2e --tags @br-07d
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
  BR-07, also open a known-consumer fixture, inspect an arc, move an endpoint,
  fit the whole drawing, and reset. Open the reviewed unknown-consumer baseline
  and verify its explanation without arcs. Browser tests alone do not verify
  the installed app. Follow the
  [native acceptance guide](../change-requests/BV-native-acceptance.md).
- If Rust changes become necessary, run Rust tests, formatting, and Clippy too.
  This plan does not require a native behavior change.
- Inspect the reviewed baseline at 1280 by 800, a narrow 320 by 640 viewport, and
  a resized desktop window. Check names, contrast, focus, scrolling, pointer
  movement, and keyboard movement. Test long labels at increased browser text
  size. For BR-07, check arc direction, header attachment, pointer targets,
  keyboard return to the exact label, high-zoom focus reveal, and Fit including
  curve and label bounds. Check duplicate names, fresh arc clicks after dragging,
  and pending arc input during a successful replacement. Do not use pixel
  snapshots as the only readability evidence.
- Recheck the existing workload fixtures at 500 records, 2,000 explicit links,
  and 16 levels. Record time to usable overview and interaction delays on named
  hardware. Compare with the
  [BR-04 measurements](../change-requests/BR-readability-evidence.md#workload-measurements)
  using the same method where practical. These are observed timings, not a new
  latency guarantee. Hidden records still count toward limits. Keep source-link
  counting unchanged when projecting arcs. Include dense known-consumer data;
  a full unknown-consumer fixture alone does not exercise arc rendering. Dense
  paths can cross, but rendering must complete, controls must respond, and every
  interface must remain available through the lists.
- Verify full recorded details and original file bytes after the complete
  inspection/movement/reset journey. Preserve cancellation, retry, limits, and
  protection against a late load replacing the current view.
- Update README, workspace boundary notes, affected constraints, and the
  verification record with actual results and platform limits. Distinguish
  checks run from deferred checks. Do not claim build/lint output proves UI
  behavior.

The manager reviews the complete candidate. Keep PRs as drafts, keep validation
current, and follow the repository's constraint review requirements before merge.
