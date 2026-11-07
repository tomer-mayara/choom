# Workspace contract

The workspace exposes a rendered user interface. It has no HTTP API or event
transport. The source owners are [App](../../src/App.tsx) and
[ArchitecturePreview](../../src/components/architecture-preview.tsx).
The exported App signature stays in source; the feature characterizes UI outcomes.

The workspace consumes the [architecture model](architecture.tsp) and
[desktop operations](desktop.tsp), and owns the [discovery contract](discovery.tsp)
defined in TypeSpec. Those sources own the
component data and operation contracts. React component types, rendering details,
and the outcomes below remain in TypeScript, Gherkin, and these boundary notes.

[Repository discovery](discovery.md) is available as a workspace operation.
The UI does not call it yet; the Load Repo workflow belongs to CR-001-T07.

## Browser interface

- The initial view shows `Architecture starts here.`, a `Browser` badge, and an
  `Explore example` button with `aria-expanded="false"`. The example is hidden
  and no diagram is mounted. There is no directory picker action.
- Opening the example changes the button to `Close example` with
  `aria-expanded="true"`. After layout, the diagram shows `React interface`,
  `Architecture model`, and `Tauri desktop`, with edges from the interface to
  the model and desktop.
- Closing removes the diagram. Reopening creates another preview.
- While the preview module loads, the status is `Loading example…`; while layout
  is pending, it is `Laying out the example…`. A layout rejection shows
  `The example diagram could not be laid out.` in an alert.

## Internal layout

[`layoutArchitecture`](../../src/lib/layout.ts) belongs to the workspace; it is
not a separate component or public interface. It accepts the
[`Architecture` type](../../src/domain/architecture.ts), aligned with the
[TypeSpec model](architecture.tsp), and returns a promise
of nodes with IDs, labels, and positions. It preserves input order and uses
ELK's rightward layered layout. Missing coordinates fall back to zero. It does
not validate the model, and ELK rejection rejects the promise. Exact coordinates
are not stable.

## Desktop view

When the adapter reports Tauri, the badge reads `Desktop` and `Choose directory`
is available. The button is disabled while selection is pending. A selected
nonempty path appears as `Selected directory: <path>` in a status message.
Cancellation preserves the previous selection. Failure shows
`The directory picker could not be opened. Please try again.` in an alert and
makes the button available. The next attempt clears the alert before opening
the picker. See the [desktop contract](desktop.md) for the adapter boundary.

[workspace.feature](../behavior/workspace.feature) characterizes the UI through
the built app. The [evidence table and remaining work](../TODO.md) distinguish
local checks, untested fault paths, and packaged native acceptance.
