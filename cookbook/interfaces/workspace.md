# Workspace contract

The workspace has a React user interface and in-process operations. It has no
HTTP API. [workflow.tsp](workflow.tsp) owns load state and outcomes;
[architecture.tsp](architecture.tsp) owns the portable semantic document.
Abort signals, subscriptions, file readers, React props, and prepared positions
stay in TypeScript. They are not saved as document data.

[workspace.ts](../../src/architecture/workspace.ts) composes one
[LoadWorkflow](../../src/architecture/load-workflow.ts), one `DocumentFiles`,
repository access, file selectors, a neutral analyzer factory, and ELK layout.
Construction performs no I/O. Only a live repository load constructs an
`ArchitecturalLayer`. Browser viewing and saved desktop viewing do not need a
repository, Node, or analyzer installation.

[workspace-view.ts](../../src/architecture/workspace-view.ts) defines the role
used by React. It exposes load, cancel, retry, cleanup retry, subscription, and
snapshot queries. Composition retains lifecycle disposal and export-cleanup
notifications. A view can use this role without depending on the concrete
workflow class. Its asynchronous command results retain the TypeSpec shapes.

The workflow publishes read-only snapshots. Each document and prepared layout
is copied and frozen before its view commit, including nested collections,
findings, and positions. References held by a collaborator remain mutable and
cannot change the committed copy. State and outcomes are copied and frozen
when published; an observer cannot change a cleanup gate or retained outcome.
Repeated snapshot reads return the same object until a notification. Progress
updates reuse the committed document and layout, so they do not traverse or
copy the graph again. These ownership rules belong to the live TypeScript
binding and do not change the saved YAML or generated TypeSpec data shapes.

## Loading and cancellation

Desktop offers **Load Repo**. Desktop and browser offer **Open Diagram**.
Both actions share one load slot from selection through final layout and view
commit. Another load returns `busy` while that slot or a cleanup gate is held.
The UI disables both actions and reports coarse progress. Desktop explains that
repository analysis runs its JavaScript configuration and requires trust.

A repository load discovers the root and linked component declarations, calls
the neutral layer, and closes its repository session after analysis cleanup.
It encodes a private candidate, writes it, reads and decodes the stored bytes,
and prepares the diagram layout. A saved file uses the same decoder and layout.
Native and browser reads require bounded UTF-8 text. The browser never invokes
native file or analyzer commands.

One synchronous commit replaces both the semantic document and its prepared
layout. Before that commit, selection, discovery, analysis, file, validation,
or layout failure leaves the previous diagram visible. Retry uses the previous
selection when available and starts a new operation. A failed picker is opened
again on retry.

Cancel before commit prevents replacement. Resource-acquiring work, such as
native selection, discovery, analysis, and candidate creation, must finish and
release its owned resources before the slot becomes available. Pure layout and
browser reads may finish later; operation identity prevents their results from
replacing a newer diagram. Cancel after commit cannot reverse that commit.

## Cleanup ownership

The workspace retains at most one current snapshot and one candidate. Rejected
candidates and superseded snapshots are released. Postcommit cleanup keeps the
new diagram and successful load outcome even if cleanup fails.

Known failed snapshot and repository owners remain available for **Retry
cleanup**. Cleanup failure keeps both load actions unavailable until recovery.
If analyzer or discovery cleanup cannot return an owner that can be retried,
the UI requires restarting Choom. Retrying document cleanup cannot clear an
unconfirmed analyzer job. Independent export cleanup failures notify this same
owner without replacing the current load outcome. A newer failure cannot be
cleared by an older cleanup retry. Failures have fixed safe messages, a stage, code, and
local duration; source paths and raw exception text are not telemetry labels.
The shared OpenSLO Service remains unmeasured.

## Rendering and export

[layoutArchitectureDocument](../../src/lib/architecture-layout.ts) loads ELK
on demand, lays out exactly the declared component IDs and import edges, and
requires finite coordinates for every component. Its positions are transient.
[ArchitectureDiagram](../../src/components/architecture-diagram.tsx) renders
only the committed document and prepared positions; it does not run discovery,
analysis, storage, or layout.
It gives React Flow its own node position records while keeping semantic data
read-only.

Each declaration produces one card, including isolated declarations and those
with zero reported files. A component may own files in several subdirectories.
Evidence paths, folders, and parent relationships do not produce extra cards or
import arrows. Cards show names, IDs, and reported-file counts. Zero is labelled
**No files reported**. A text table and keyboard-operated disclosures expose
the same components, complete import file pairs and variants, findings with
source and target roles, ordered cycle/via paths, metrics, and provenance.

**Export Diagram** captures encoded bytes before waiting for a destination.
Another load may complete while export waits without changing those bytes.
Export cancellation or failure does not replace the current view. Desktop
uses the [diagram dialogs](document-dialogs.tsp) and explicit replacement
consent; browser uses a YAML download. See [documents.md](documents.md) for
storage, replacement, and encoding rules.

## Retained starter behavior

The initial heading is **Architecture starts here.** with a **Desktop** or
**Browser** badge. **Explore example** begins collapsed. Opening it shows the
starter's three labelled cards and two directed edges; closing removes the
preview. Its module and layout have separate loading messages, and layout
failure shows an alert. A committed document replaces the starter canvas.

Desktop retains **Choose directory**. A selected path appears in a status
message; cancellation preserves it. The action is disabled while its picker or
a load is pending. Picker failure shows a safe error and allows retry. Browser
hides this action. See the [desktop contract](desktop.md).

[T07 workflow scenarios](../behavior/architecture-import/t07-workflows.feature)
exercise rendered behavior. [API scenarios](../behavior/architecture-import/t07-api.feature)
and interface tests cover lifecycle and generated state/outcome conformance.
Browser desktop simulations use validated transport doubles; they do not prove
native execution. See [the evidence table](../TODO.md) for verification scope
and installed-platform limits.
