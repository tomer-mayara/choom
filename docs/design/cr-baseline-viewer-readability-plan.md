# Baseline viewer readability plan

Status: **BR-01 to BR-04 are in implementation. BR-05 and BR-06 remain planned.**

Reviewed: **2026-11-11**

## Decision and goal

Show components first. When the user selects a component, show its interfaces
in a side panel. Let the user move components to make the drawing easier to read.

This plan follows the [baseline viewer plan](cr-baseline-viewer-plan.md).
When implemented, it replaces that plan's rules for showing every record on
the canvas, double-click
inspection, and automatic fitting on resize. The baseline format, read-only
file access, recorded statement meanings, and load protections stay in force.

This document contains the implementation plan and expanded tickets. Its
scenarios describe tests to write during implementation; they are not test
results.

## Problem in the starting view

The reviewed baseline contains 5 components, 8 interfaces, and 5 resources.
The current view gives all 18 records large cards. Interfaces and resources sit
outside their owners, with ownership lines crossing the drawing. Repeated IDs,
types, and statuses compete with names, which are often truncated.

The current code also disables dragging. Its detail panel blocks interaction
with the canvas, and resizing fits the whole diagram again.

## Delivery scope

| Stage | Tickets | Result |
| --- | --- | --- |
| First release | BR-01 to BR-04 | Side-panel inspection, a compact component overview, movement, and reset. |
| Follow-up | BR-05 | Expand and collapse component groups. |
| Follow-up | BR-06 | Show the recorded connections of one selected interface. |

BR-05 and BR-06 have full tickets so that the later behavior is clear. They are
not required to release BR-01 to BR-04. Review the first release with the real
baseline before implementing the follow-ups.

For the first release, remember the arrangement while the current baseline
remains open. Saving arrangements across app restarts or successful file opens
is deferred. Also defer multi-selection, comparison panels, global filters,
interface editing, model editing, export, and automatic dependency inference.

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
- Hide interface and resource nodes in the overview. Hide their relationship
  lines as well. Component nesting shows the parent relationship without lines.
- Check limits against the complete baseline before layout. Hiding records does
  not increase the supported limits or make excessive input valid.

### Side panel and record access

Use one side panel. On wide windows it sits beside the canvas and does not
block it. The user can select another component, pan, zoom, and move components
while it is open. Do not retain the current modal overlay or focus trap.
When the window cannot fit both regions, place the panel below the canvas.
Keep both regions usable without horizontal page scrolling. Keep the canvas
and panel header in view; scroll long panel content within its region.

| Action | Result |
| --- | --- |
| Select a component with one click, Enter, or Space | Highlight it. Show its name and directly owned interfaces in the panel. |
| Select the same component again | Keep its panel open; do not toggle it closed. |
| Select an interface in the list | Show its complete recorded details in the same panel. |
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

The camera is the canvas pan and zoom. Outside the later connection view,
inspection preserves the camera and component positions. Keyboard activation
moves focus into the panel. Pointer selection on the canvas keeps focus there.
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
reveal its header and preserve zoom. For a header larger than the canvas, reveal
its focus indicator and name rather than trying to fit the whole parent group.

### Movement, reset, and view state

The baseline remains immutable. Canvas coordinates, selection, panel navigation,
collapse choices, and shown connections are view state, separate from recorded
data.

| Operation | Rule |
| --- | --- |
| Drag a component header | Move that component. A parent carries its descendant component positions with it. |
| Move a child | Keep its recorded parent and keep it below the parent's header. Grow enclosing bounds to the right or bottom as needed; stop at the left or top boundary. |
| Move with the keyboard | Arrow keys on a focused component header move it by 10 diagram units. Do not intercept keys used inside panel fields or lists. |
| Finish a drag | Do not treat the release as a click that opens or replaces the panel. |
| Cancel an active drag | Escape or an interrupted drag restores the positions and bounds from the start of that drag. |
| Fit view | In overview, fit all shown components. In connection view, fit the interface and its endpoint headers. Include items outside the viewport; keep all positions. |
| Reset layout | Restore the initial component positions and bounds, then use the same 100% starting view as a new open. Keep panel content. In the follow-ups, expand all groups and end connection view. |

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
keyboard focus reveal and leaving the later connection view. Reset layout,
Fit view, Reveal component, and Show/Hide connections use their explicit camera
rules. They do not run a new automatic arrangement.
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
Expansion, Reveal component, and Show connections use the same ancestor-growth
rule as movement. This keeps restored children inside their parents without
moving parent origins or siblings. Ancestor bounds do not shrink automatically.

If the panel refers to a hidden component, including one opened from the
baseline list, identify its nearest visible collapsed ancestor. **Reveal
component** expands only the ancestors needed to expose it, then pans to its
header at the current zoom. Keep other collapse choices. If collapse hides a
focused canvas control, move focus to the collapsed parent's control.

### Follow-up: one interface's connections

An interface detail has **Show connections**, which becomes **Hide connections**
while active. The connection view adds one temporary interface node and shows
only its recorded links. Keep components as context. Showing another
interface's connections replaces the current one.

Use the existing relationship meanings:

- Owner to interface: **provides**.
- Allowed consumer to interface: **may use**. This is recorded permission.
- Unknown owner: no owner line. Keep known consumer links.
- Unknown consumer policy: no consumer arrows. Keep a known owner line.

Keep relationship kinds and exact defining-statement statuses available in a
list in the panel. Use short kind labels on the connection lines, rather than
repeating status text over the canvas. Do not infer component-to-component
dependencies or give a mixed set of statements one status.

Place the temporary interface node in free space beside the component drawing.
It has no component parent and is not movable in this release. Moving a
component updates its lines; the interface stays in place. With no components,
place it at the normal starting position.

Show connections fits that interface and the headers of its actual endpoints,
with zoom no greater than 100%. Do not fit the whole bounds of a large parent
group. Fit view uses this same set while connections are shown. These explicit
actions change the camera without moving components. Ordinary endpoint movement
does not refit the view.

Expand ancestors of hidden owner/consumer endpoints so each link ends at the
actual recorded component. Do not replace a child endpoint with an ancestor.
Those groups remain expanded after leaving the connection view. If the user
collapses a group that hides an endpoint, end the connection view as part of
that action. Collapsing the endpoint itself keeps its header and links visible.

**Hide connections**, panel close, opening a different record, or hiding an
endpoint removes the temporary node and links. Fit the remaining component
drawing, with zoom no greater than 100%, so an interface-only view cannot leave
the user looking at empty space. Keep positions and apply the usual keyboard
focus rule. Do not store a camera history. If there are no components, show the
normal no-components view. Reset uses its own starting-view rule; a successful
file open uses the new file's starting view. Failed loads keep this view.

An interface can have both an unknown owner and an unknown consumer policy.
Show its node without links and explain both values. The format cannot express
a known empty consumer list: unknown policy must not become "no consumers."

The reviewed baseline has no known consumer policy on any of its eight
interfaces. It must not acquire consumer arrows through this change.

## Implementation boundaries

Reuse React Flow, ELK, the current baseline validator, and the file readers.
No new package, analysis service, storage service, or native command is needed.

| Area | Planned change |
| --- | --- |
| [Architecture diagram](../../src/components/architecture-diagram.tsx) | Selection, movable view positions, and explicit view controls. Remove fitting on resize. |
| [Side panel](../../src/components/architecture-inspector.tsx) and [inspection state](../../src/components/use-architecture-inspection.ts) | Nonmodal inspection, owned-item lists, baseline lists, and local Back navigation. |
| [Recorded fields](../../src/components/architecture-details.tsx) | Preserve complete fields, statement statuses, references, and rule details. |
| [Layout](../../src/lib/architecture-layout.ts) and [geometry](../../src/lib/component-geometry.ts) | Prepare compact component-only geometry with header and child space. Check exact component coverage and valid containment. |
| Connection view (BR-06) | Derive temporary links from saved owner and allowed-consumer statements when this follow-up is implemented. |
| [Workspace view](../../src/architecture/workspace-view.ts) and [app](../../src/App.tsx) | Reset view state on each successful file open. Keep the existing example path. |
| [Workspace contract notes](../../cookbook/interfaces/workspace.md) | Update display coverage, inspection, focus, movement, and fitting rules when their tickets are implemented. |

The initial published baseline/layout pair stays read-only. Keep user positions
in a viewer-owned copy. Derive interface ownership lists and counts from the
baseline; do not maintain a second mutable architecture model. Keep a single
owner for view state, tied to the current baseline/layout pair rather than
`baseline.id` or each progress notification. The existing load workflow keeps
that pair stable until the next successful open. No new load identifier or
persistent cache is needed.

Component-only layout changes the geometry coverage rule: the prepared overview
contains every component exactly once, rather than every interface/resource as
well. The complete baseline remains available to the inspector. Keep finite
positions, valid dimensions, parent order, and child containment checks. Runtime
movement applies the same containment rules to its own view geometry.

Assess all four constraint categories in the
[feature cookbook](../new-feature-cookbook.md). Update Cucumber features, relevant
manifest links, and workspace boundary notes. Do not change the baseline
TypeSpec schema for UI-only state. If implementation changes a Choom-owned data
or operation boundary, update its TypeSpec source and generated outputs in the
same ticket. Record unchanged architecture/OpenSLO constraints as unchanged.

## Appendix: Tickets

### Working sequence for every ticket

1. Write the ticket's Cucumber acceptance scenarios first. Connect their steps
   to the real app or an existing public boundary. Run them and observe an
   assertion failure caused by the missing behavior. Undefined steps, syntax
   errors, missing tools, and failed builds do not count as the red result.
2. For each new behavior below, write a focused failing unit, interface, or
   integration test. Make it pass with the smallest useful change, then refactor
   while it remains green. Repeat until the acceptance scenarios pass.
3. Preserve existing behavior with passing characterization tests before a
   refactor. Do not break a working behavior to manufacture a red test.
4. Record the first real acceptance failure, focused red/green evidence, final
   checks, and remaining limits. The examples below are planned acceptance
   tests; add cases when implementation exposes a distinct missing behavior.

Use the [test definitions](../coding-principles.md#test-types), the DRY3 rule in
the [coding principles](../coding-principles.md), and the
[Gherkin guide](../gherkin-guide.md). A React/library test in one Choom workspace
is a unit test; crossing Choom workspaces through their real boundaries makes
it an integration test. Test public data/operation contracts with interface
tests. Keep assertions about user interaction in browser acceptance where
layout, focus, or input behavior matters.

Put features under `cookbook/behavior/baseline-viewer/`, with
`@baseline-viewer`, `@baseline-readability`, and `@br-01` through `@br-06`.
Use `@browser` or `@packaged` for their execution environment. Register features,
steps, and any new suite locations in the real runners and owning manifests.
Shared fixtures stay outside the test category directories. Do not add tests
for this plan itself.

| Ticket | Deliverable | Depends on |
| --- | --- | --- |
| [BR-01](#br-01-inspect-components-in-a-side-panel) | Side panel, owned-item navigation, and access to every saved record. | Existing BV viewer |
| [BR-02](#br-02-show-a-compact-component-overview) | Components-only initial drawing and smaller group headers. | BR-01 |
| [BR-03](#br-03-move-components-and-retain-the-current-arrangement) | Pointer/keyboard movement and view state that survives ordinary use. | BR-02 |
| [BR-04](#br-04-separate-reset-layout-from-fit-view) | Restore the initial arrangement or fit the current one. | BR-03 |
| [BR-05](#br-05-expand-and-collapse-component-groups) | Stable group expansion and collapse. Follow-up. | BR-04 |
| [BR-06](#br-06-show-one-interfaces-recorded-connections) | Focused interface node, exact endpoints, and recorded links. Follow-up. | BR-05 |

Implement BR-01 before hiding nodes in BR-02, so each record has another route
to its details. Keep tickets reviewable on their own. Do not create PRs or
implement these tickets as part of saving this plan.

### BR-01: Inspect components in a side panel

**Acceptance first — `@br-01 @browser`:**

```gherkin
Scenario: Inspect a component with one selection
  Given the reviewed baseline is open
  When the user selects Workspace once
  Then the side panel lists the five interfaces owned by Workspace
  And the diagram keeps its positions, pan, and zoom

Scenario: Keep the drawing usable during inspection
  Given Workspace is selected in the side panel
  When the user selects Native shell on the drawing
  Then the panel shows Native shell and its owned interfaces
  And the canvas remains available for pan and zoom

Scenario: Return from an interface to its originating list
  Given the user is inspecting an interface opened from Workspace
  When the user returns to Workspace in the panel
  Then the same interface list position is restored
  And keyboard focus returns to the interface entry

Scenario: Inspect a record without a component owner
  Given a baseline contains an unowned resource and no components
  When the user selects the resource from Baseline details
  Then its complete recorded details are shown
  And its owner is identified as unknown

Scenario: Reach inspection with the keyboard
  Given a component control has keyboard focus
  When the user activates it
  Then the component side panel opens with focus inside it
  And the canvas remains reachable without closing the panel

Scenario: Close inspection without taking focus from the canvas
  Given Workspace details are open and Native shell has keyboard focus
  When the user closes the panel with Escape
  Then the panel closes
  And Native shell keeps keyboard focus
```

**Expected first failure:** One pointer selection does not open details, and
current component details have no owned-interface list. The current modal also
blocks selecting another canvas item while details are open.

**TDD and characterization steps:**

1. Unit-test directly owned interface/resource lists, stable input order,
   counts, unknown owners, repeated names, and empty results. Derive these
   results from saved IDs and owner values.
2. Unit-test panel selection, same-component selection, component-to-record
   navigation, Back, and baseline lists. Keep panel routes local and bounded;
   do not add application-wide routing or an unlimited navigation history.
3. Unit-test complete field access, optional/null/empty distinctions, exact
   statement statuses, and the existing Rules behavior. Reuse passing field
   characterization tests; add failures only for missing navigation outcomes.
4. Test panel focus entry, Back, close, and hidden-opener fallback. Preserve
   external focus and let Escape collapse only the rule containing focus.
   Browser-test tab order, pointer access to the canvas, long content, and the
   narrow layout. Distinguish keyboard focus from the inspected record.
5. Test that panel changes and window resize preserve the camera. Remove
   automatic fitting on resize. Keep the existing initial fit until BR-02
   changes the starting view. Verify on the rendered canvas.

**Complete when:** All saved record kinds remain reachable without double-click.
The panel is usable with the keyboard and does not block the canvas. Update the
workspace notes, inspection help, README interaction text, and affected
BV-06 acceptance expectations. Keep the existing full canvas until BR-02.

### BR-02: Show a compact component overview

**Acceptance first — `@br-02 @browser`:**

```gherkin
Scenario: Open the reviewed baseline as a component overview
  Given the reviewed baseline contains five components
  And it contains eight interfaces and five resources
  When the user opens the baseline
  Then the drawing shows exactly the five components in their saved hierarchy
  And interface nodes, resource nodes, and relationship lines are hidden

Scenario: Show only directly owned interface counts
  Given Workspace owns five interfaces
  And its child Architecture model owns one interface
  When the user views the component overview
  Then Workspace shows an owned-interface count of five
  And Architecture model shows an owned-interface count of one

Scenario: Inspect records omitted from the overview
  Given the component overview is displayed
  When the user opens the baseline record lists
  Then all eight interfaces and five resources are available
  And records with unknown owners can be inspected

Scenario: Read the reviewed component names at the initial view
  Given the app viewport is 1280 by 800
  When the user opens the reviewed baseline
  Then all five component names are readable without opening details
  And component cards and parent headers do not overlap

Scenario: Start a large drawing at a readable position
  Given a supported baseline is too large to fit at 100% zoom
  When the user opens the baseline
  Then the view starts at 100% zoom with the first root header visible
  And other components can be reached by panning or keyboard navigation

Scenario: Inspect known permission when ownership is unknown
  Given an interface has unknown ownership and explicitly permits Workspace
  When the user inspects that interface through Baseline details
  Then its owner is shown as unknown and Workspace as an allowed consumer
  And each statement keeps its own status and references

Scenario: Keep same-named interfaces and their statement meanings distinct
  Given two same-named interfaces both permit their owner
  And their ownership and permission statements have different recorded statuses
  When the user inspects those interfaces in turn
  Then each interface keeps its own ID, values, statuses, and references
  And ownership and permission are presented as separate statements
```

**Expected first failure:** Opening the baseline currently creates 18 cards and
their ownership lines. Its prepared geometry also requires all 18 records.

**TDD and characterization steps:**

1. Unit-test component-only layout input and exact component coverage in its
   output. Test multiple roots, repeated names, nested groups, and zero
   components. Keep validation of finite geometry and recorded parent IDs.
2. Unit-test compact leaf/header geometry and child containment. Test bounded
   handling of long names and names without spaces. Avoid assertions tied to
   one incidental ELK coordinate result.
3. Unit-test visible names, direct ownership counts, separate parent
   headers, and absence of interface/resource nodes and lines. Ensure accessible
   names and complete panel text still identify repeated or truncated names.
4. Characterize empty and partial baselines, complete record access, and all
   input/display limits. The 500-record, 2,000-link, and 16-level bounds still
   apply to hidden data. Keep rejection before layout and view replacement.
5. Test the starting view once per successful open, including the first root
   on a large drawing and zero-component input. Replace BV-04's expectation
   that all 500 components fit on initial open. Keep its explicit Fit view and
   keyboard-reveal acceptance, including unchanged zoom during keyboard reveal.
6. Replace BV-05's initial-card/line expectations with browser acceptance through
   the panel. Preserve unknown owners with known consumers, same-named records,
   owner-as-consumer, separate statuses, and complete long text. Mapping tests
   alone do not verify these user outcomes. Update installed acceptance that
   currently expects all 18 initial cards too.

**Complete when:** The reviewed baseline has a readable five-component overview,
and no record loses its inspection route. Update layout coverage notes and
affected display documentation. Use repository fixtures, not the external
`work-choom` path, in automated tests.

### BR-03: Move components and retain the current arrangement

**Acceptance first — `@br-03 @browser`:**

```gherkin
Scenario: Move a parent and its contents
  Given Workspace contains Architecture model and Platform adapter
  When the user drags Workspace to another position
  Then both children move with Workspace and keep their relative positions
  And Native shell keeps its position

Scenario: Move a child without changing its recorded parent
  Given Architecture model is inside Workspace
  When the user moves Architecture model beyond the current right boundary
  Then Workspace grows to contain it
  And the saved parent and all baseline statements are unchanged

Scenario: Move a component with the keyboard
  Given Workspace has keyboard focus on the canvas
  When the user moves it one step to the right with the keyboard
  Then Workspace and its descendants move ten diagram units to the right
  And focus remains on Workspace

Scenario: Cancel a drag
  Given the user is dragging a component and its parent bounds have grown
  When the user cancels the drag
  Then the positions and bounds from before the drag are restored
  And the existing panel selection is unchanged

Scenario Outline: Retain an arrangement during ordinary use
  Given the component overview has a manual arrangement and camera position
  When <event>
  Then the manual positions and camera are retained

  Examples:
    | event                                         |
    | the user inspects another component            |
    | the window is resized                         |
    | another baseline fails validation              |
    | another baseline load is cancelled             |

Scenario: Retain the example arrangement after an unsuccessful file open
  Given the example is open and the user has moved a component
  When the first baseline file fails to open
  Then the example keeps its arrangement
  And its component details remain available

Scenario: A successful load gets separate view state
  Given the user has moved a component in the current baseline
  And a different file uses the same baseline ID and item IDs
  When that file is successfully opened
  Then its initial arrangement is shown
  And the earlier selection and movement are not applied to it

Scenario: An old drag cannot change a newly opened baseline
  Given a new baseline opened while a component in the previous view was being dragged
  And both files use the same item IDs
  When the earlier drag ends
  Then the new baseline keeps its initial arrangement
  And the old selection does not return
```

**Expected first failure:** Component dragging and movement are disabled. The
renderer recreates its positions from the prepared layout and has no owner for
the user's arrangement across the required view events.

**TDD and characterization steps:**

1. Unit-test a viewer-owned position copy and component movement by ID. Test
   parent/descendant relative coordinates and unchanged unrelated components.
   Verify that the frozen published layout and baseline are never mutated.
2. Unit-test child bounds, header exclusion, left/top limits, and right/bottom
   growth through multiple ancestors. Test finite coordinates and cancelled
   drag restoration. Keep pointer and keyboard movement on the same rules.
3. Unit-test position changes, click-versus-drag behavior, and keyboard
   activation versus arrow movement. Browser-test dragging, interrupted/cancelled
   gestures, unchanged inspection selection, and movement with the panel open.
4. Unit-test state lifetime against the current baseline/layout pair, including
   reopened files and reused IDs. Ignore old drag events after replacement.
   Keep the arrangement during progress and unsuccessful loads. Characterize
   existing protection against late cancelled loads.
5. Test the existing example path during loading, failure, and cancellation.
   A successful file open starts fresh; closing and reopening the example does
   too. Keep a single state owner per current view without adding a baseline
   cache or a new loaded-file/example switch.

**Complete when:** Pointer and keyboard movement agree, inspection does not
undo it, and successful loads start cleanly. Verify saved file bytes are
unchanged through a normal app journey. Record that persistence ends at a
successful file open or app restart; no storage permission is added.

### BR-04: Separate Reset layout from Fit view

**Acceptance first — `@br-04 @browser`:**

```gherkin
Scenario: Reset positions while retaining inspection
  Given the user has moved Workspace and grown its bounds
  And its side panel is open while the camera is far from the initial drawing
  When the user resets the layout
  Then the prepared initial component positions and bounds are restored
  And the normal starting view is shown with the same panel content

Scenario: Fit the current arrangement
  Given the user has moved a component outside the visible canvas
  When the user fits the view
  Then all shown components fit in the canvas region beside the panel
  And the manual component positions remain unchanged

Scenario: Resize without resetting the view
  Given the user has chosen a manual arrangement and zoom
  When the window changes size
  Then the positions and camera transform remain unchanged
  And Fit view remains available

Scenario: A reset ends the current drag
  Given the user is dragging a component
  When the user resets the layout
  Then the initial arrangement and starting view are restored
  And later events from that drag cannot change the reset arrangement
```

**Expected first failure:** There is no Reset layout action. Existing Fit view
and BR-01 resize behavior are characterization; keep their tests green.

**TDD and characterization steps:**

1. Unit-test resetting manual positions and grown bounds from the immutable
   prepared layout. Test repeated reset, active-drag termination, and preserved
   panel navigation. With no nodes, keep the controls unavailable.
2. Unit-test accessible Reset layout and Fit view controls. Reset reuses BR-02's
   starting-view rule and must not read files, change the model, or run layout.
3. Browser-test camera-only fitting against the real canvas size with the panel
   open. Include keyboard access and the narrow stacked arrangement.
4. Keep BR-01's stable-camera and BR-02's starting-view tests green. Explicit Fit
   view can zoom out below 100%; Reset restores the readable starting view.

**Complete when:** Reset restores the initial drawing; Fit keeps manual
positions. Add short guidance and focused test commands. Complete the first-release
verification below before calling BR-01 to BR-04 ready.

### BR-05: Expand and collapse component groups

**Follow-up. Acceptance first — `@br-05 @browser`:**

```gherkin
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

**Expected first failure:** There is no control or view state for collapsing a
component group.

**TDD and characterization steps:**

1. Unit-test visibility from recorded parentage and collapsed IDs, including
   nested collapsed groups and multiple roots. Count all hidden descendants
   without changing direct-interface counts.
2. Unit-test stored child positions, nested collapse choices, and movement of
   hidden descendants. Expansion restores positions and grows enclosing bounds
   where needed; it does not run layout or move unrelated components.
3. Unit-test separate select/collapse controls, hidden-selection context, and
   Reveal component from both a component panel and the baseline list.
   Browser-test focus fallback, keyboard access, and reveal at unchanged zoom.
4. Test that Reset layout expands all groups and restores initial geometry and
   the starting view while keeping selected details. A successful load clears
   collapse choices; failed loads preserve them.

**Complete when:** Collapse reduces visible detail without losing context,
positions, or record access. Review a 16-level fixture and the real five-component
baseline before proceeding to the connection view.

### BR-06: Show one interface's recorded connections

**Follow-up. Acceptance first — `@br-06 @browser`:**

```gherkin
Scenario: Focus one interface's recorded relationships
  Given an interface has a known owner and two explicit allowed consumers
  When the user shows that interface's connections
  Then the canvas shows that interface, its provides line, and two may use arrows
  And unrelated interfaces and their lines remain hidden
  And the interface and endpoint headers fit in view without moving components

Scenario: Keep consumers when ownership is unknown
  Given an interface has an unknown owner and a known allowed consumer
  When the user shows its connections
  Then its may use arrow is shown without an owner line
  And the panel identifies ownership as unknown

Scenario: Preserve unknown consumer policy
  Given an interface has a known owner and unknown consumer policy
  When the user shows its connections
  Then its provides line is shown without consumer arrows
  And the panel identifies consumer policy as unknown

Scenario: Reveal the actual endpoint of a permission
  Given an interface's allowed consumer is hidden inside a collapsed group
  When the user shows the interface's connections
  Then that consumer's ancestors are expanded
  And the permission arrow ends at the recorded consumer

Scenario: Return to the component overview
  Given an interface with unknown owner and consumer policy is shown outside the component drawing
  When the user hides its connections
  Then the temporary interface and its lines are removed
  And the component overview is brought into view without moving components

Scenario: Inspect a component while connections are shown
  Given an interface owned by Workspace is shown in connection view
  When the user selects Workspace on the canvas
  Then Workspace details and the component overview are shown
  And the overview is fitted without changing component positions

Scenario: Fit only the connections being inspected
  Given one interface's connections are shown among other components
  And the user has panned away from them
  When the user fits the view
  Then that interface and its endpoint headers fit in the canvas
  And unrelated components do not determine the fit

Scenario: Collapse an endpoint without hiding its header
  Given a parent component is an endpoint in the connection view
  And none of its descendants is another endpoint
  When the user collapses that component
  Then its recorded links remain attached to its visible header
  And the connection view remains open
```

**Expected first failure:** Interface details have no Show connections action.
The component overview cannot reveal one interface and only its recorded links.

**TDD and characterization steps:**

1. Unit-test the selected interface and links using existing recorded meanings.
   Include unknown owners, unknown consumers, repeated names, an owner also
   named as a consumer, and two interfaces between the same components. Preserve
   every source ID and the status of the statement that defines each link.
2. Unit-test placement of one temporary node outside component bounds.
   Do not move existing components, add component parentage, or mutate the
   prepared layout. Test unknown owner/consumers with no components and long
   names. An entirely empty baseline has no Show connections action.
3. Unit-test required ancestor expansion and exact endpoints. Do not aggregate
   links to parent components. Test that collapsing an endpoint's ancestor
   closes the connection view without discarding its panel details.
4. Unit-test the relationship list, short labels, exact statuses, and changing
   the shown interface. Test Hide connections, panel close, record changes,
   hidden endpoints, Reset, and successful/failed loads. Each exit removes the
   temporary node and uses the specified view rule. Keep the panel usable when
   no components remain to fit.
5. Browser-test Show connections and Fit view against endpoint headers, including
   a very large parent. Test exit from an isolated interface back to a visible
   overview and links after endpoint movement without automatic refitting.
   Keyboard users can inspect the same meanings in the panel without targeting
   thin lines. Keep the first-release semantic acceptance green.

**Complete when:** The connection view shows only recorded relationships and
removes them cleanly. Recheck record/link/depth limits. Add canvas acceptance
beside the first-release panel checks. Resource details remain in the panel;
showing resources on the canvas is outside this ticket.

## Verification and review

Use `test/fixtures/baseline-viewer/full.yaml` and `empty.yaml`, plus small
synthetic fixtures for repeated names, long names, multiple roots, mixed
statement statuses, unknown owners with known consumers, owner-as-consumer,
and records without components. Include at-limit and excessive inputs.

For each implemented ticket, run its changed tests locally before committing.
Examples of focused commands after the features exist:

```sh
bun run test:e2e --tags @br-01
bun run test:e2e --tags @baseline-readability
bun run test:behavior --tags @baseline-viewer
```

Run native TypeScript and DOM tests in their separate environments. Use the
relevant suites under `test/unit/components/`, `test/unit/lib/`, and
`test/unit/architecture/`, with interface/integration suites only where the
repository definitions call for them. Keep DOM globals out of native tests.

For the complete first release, and again for each follow-up release:

- Run affected behavior tests, `bun run test`, `bun run check`,
  `bun run check-types`, `bun run build`, and `bun run habit-hooks --all`.
  Run contract generation/checks if a contract changes. Keep the snooze file empty.
- Build the desktop app and check the assembled route. Run installed acceptance
  for opening the baseline, side-panel inspection, movement, and reset. Browser
  tests alone do not verify the installed app. Follow the
  [native acceptance guide](../change-requests/BV-native-acceptance.md).
- If Rust changes become necessary, run Rust tests, formatting, and Clippy too.
  This plan does not require a native behavior change.
- Inspect the reviewed baseline at 1280 by 800, a narrow 320 by 640 viewport, and
  a resized desktop window. Check names, contrast, focus, scrolling, pointer
  movement, and keyboard movement. Test long labels at increased browser text
  size. Do not use pixel snapshots as the only readability evidence.
- Recheck the existing workload fixtures at 500 records, 2,000 explicit links,
  and 16 levels. Record time to usable overview and interaction delays on named
  hardware. Use the existing measurements in the
  [BV evidence record](../change-requests/BV-baseline-viewer-evidence.md#complete-viewer-measurements)
  as the comparison; hidden records still count toward limits.
- Verify full recorded details and original file bytes after the complete
  inspection/movement/reset journey. Preserve cancellation, retry, limits, and
  protection against a late load replacing the current view.
- Update README, workspace boundary notes, affected constraints, and the new
  verification record with actual results and platform limits. Distinguish
  checks run from deferred checks. Do not claim build/lint output proves UI
  behavior.

The manager reviews the complete candidate. If PRs are later requested, open
them as drafts, keep validation current, and follow the repository's constraint
review requirements before merge. This plan authorizes no implementation or PR
creation by itself.
