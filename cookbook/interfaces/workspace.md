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

[layoutBaseline](../../src/lib/architecture-layout.ts) prepares a flat node list
for React Flow from one nested component tree. Each node has its saved ID,
width, height, position, and optional parent ID. Child positions are relative
to their parent. Parents come before children. The layout checks exact component
coverage, parent IDs, finite geometry, positive sizes, and child containment
below the parent inspection header. Missing or invalid output fails the load.
[ArchitectureDiagram](../../src/components/architecture-diagram.tsx) renders
that prepared data without file access or layout work. It gives React Flow its
own mutable position records. Cards show the recorded component name, ID, and
purpose. A parent has a border around its children and a small inspection
header. No observed-import edges or file counts are invented.

The [display policy](../../src/lib/baseline-display-limits.ts) checks bounds
before the layout graph is built, including when the component list is empty.
It allows at most 500 records across components, interfaces, resources, and
rules; 2,000 explicit links; and 16 component levels, with roots at level 1.
Each non-null interface or resource owner and each allowed-consumer entry is
one link. Parent nesting does not add links. An excessive baseline reports
**Too large to display** and keeps the previous view. The workflow imports this
small policy module; it does not load ELK to handle the error.

The canvas uses the available window and refits on resize. Double-click, Enter,
or Space opens basic component details. Escape and the close button return
focus to the opener. Keyboard focus brings an offscreen inspection header into view
without changing zoom. A replacement baseline closes the old details.

The heading is the baseline ID. An entirely empty model says **No architecture
items modeled**. A baseline with other record kinds but no components says
**No components modeled**. Neither empty state substitutes the example.
Interfaces/resources, rules, and full statement inspection belong
to later tickets in the [viewer plan](../../docs/design/cr-baseline-viewer-plan.md).

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
```

Installed acceptance uses the actual app and picker; see the
[native acceptance record](../../docs/change-requests/BV-native-acceptance.md).
Build and type checks do not establish runtime behavior. Local durations and
safe errors are not a production reliability or latency claim.
