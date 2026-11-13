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
record BR-08A and BR-08B acceptance for selected connections and labels on
demand.

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

Use **Open Baseline** to select a supported `formatVersion: 1` baseline in
the browser or desktop app. The input must be valid UTF-8 and at most 16 MiB.
The [baseline contract](cookbook/interfaces/baseline.md) describes the model;
[input notes](cookbook/interfaces/baseline-codec.md) describe the file limits.
An old `schemaVersion: 1` diagram is not a baseline.

The view shows the baseline ID and nested component groups. Each component has
its name and the number of interfaces it directly owns. An empty baseline is valid.
**Explore example** opens a small baseline through the same viewer. A failed or
cancelled open keeps the current view; **Retry** uses the last selected file.
Only one open operation can run at a time. **Cancel** prevents a pending load
from replacing the current view.

The display accepts at most 500 records across all four collections, 2,000
explicit owner and consumer links, and 16 component levels. Larger inputs show
**Too large to display** and keep the current view. The
[complete viewer measurements](docs/change-requests/BV-baseline-viewer-evidence.md#complete-viewer-measurements)
record the tested workloads, timings, and limits.

The drawing starts at 100% zoom. If all components fit, it centers them. Otherwise,
it starts with the first root component in view. Pan to reach the rest, or use
**Fit view** to see the whole drawing at a smaller scale. Interface and resource
records stay in the panel. An arrow connects each recorded allowed
consumer to the component that owns the interface. It means the consumer may
use that interface; it does not claim that a call occurs. Several consumers
produce several arrows without increasing the owner's interface count.

**Connections: Selected** is the default. The initial view has no arrows.
Select a component to show only arrows where it is the consumer or owner.
Selecting a parent does not include connections only between its children.
Choose **All** to see all known connections. A component that also consumes
its own interface has a loop when that connection is in scope.
The drawing says **No connections shown.** when the current scope has no
arrows. Interface counts always reflect ownership.

An arrow’s label appears when the pointer hovers over its curve or label, when
its control has keyboard focus, or when its interface is open in the panel.
Label backgrounds are transparent. Tab to an arrow to reveal its name. Press
**Enter** or **Space** to inspect it. Pointer and touch input can open details
from the curve in one action.

Choom draws an arc only when both its owner and allowed consumers are known.
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

The arrangement and connection mode last while this view remains open.
Inspection, pan, zoom, resize, failed opens, and cancelled opens keep them.
Each successful file open starts a fresh arrangement in Selected mode with no
inspection, including when reopening the same file. Closing and reopening the
example also starts fresh.

**Fit view** changes only pan and zoom to show the current arrangement, including
components and shown arcs with their arrowheads and labels, even outside the
viewport. Fit also reserves room for hidden labels of shown arrows.
**Reset layout** restores the initial positions and group bounds at 100% zoom.
It keeps the current inspection, Back path, and connection mode.
Reset also ends a held press or drag. Both controls use the available canvas
beside or above the panel; they are absent when there are no components.

Component inspection lists directly owned interfaces. Select a list entry to
read its complete record; **Back** restores the originating list and entry.
**Resources** lists directly owned resources, and **Recorded details** exposes
all component fields. **Baseline details** includes metadata and lists of all
components, interfaces, and resources, including items with unknown owners.
**Rules** opens the recorded rule list.

**Escape** first cancels an active drag and restores its starting positions and
bounds. An interrupted drag does the same. Otherwise, Escape closes the expanded
rule containing focus, then the panel on the next press. Closing the panel
returns focus to its opener if focus was inside the panel and the opener remains
shown. If an arc opener disappears, focus returns to its owner's header. The
same fallback applies when closing removes a focused arc outside the panel;
focus on other surviving controls stays there. A new baseline closes the old
inspection path. If focus was in the replaced view, it moves to the new baseline
heading. Keyboard focus and movement reveal the component name without changing
zoom, even when a header or arc label is wider than the canvas.

Details show all recorded fields, including statement status, evidence references,
and acceptance references. **Accepted (recorded)** describes the saved status;
it is not a verified result. References remain plain text and say **Evidence not
loaded**. Unknown values, omitted fields, and empty objects or lists stay distinct.
Choom does not load referenced files or execute recorded checks.

## Development commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Vite development server on port 1420 |
| `bun run build` | TypeScript 7 checks and production frontend build |
| `bun run preview` | Serve the production frontend |
| `./scripts/run_all_constraints.sh` | Run all four automated constraint validations with a pass/fail summary and diagnostic logs |
| `bun run check` | TypeSpec and implementation conformance, type checks, lint, unit tests, behavioral tests, cookbook policies, dependency boundaries, unused code, and duplication |
| `bun run test` | Native Bun and Happy DOM unit tests in separate processes |
| `bun test` / `bun run test:watch` | Focused architecture-model tests in native Bun |
| `bun run check-types` | Alias for the native TypeScript compiler check |
| `bun run test:behavior` | Baseline and boundary Cucumber scenarios (no browser) |
| `bun run test:behavior:native` | Explicit browser-free Cucumber profile |
| `bun run test:behavior:browser` | Browser Cucumber scenarios against a fresh production build |
| `bun run test:behavior:packaged` | Linux acceptance against a freshly built and installed release package; native drivers required |
| `bun run test:e2e` | Browser Cucumber acceptance against one fresh production build |
| `bun run check:cookbook` | Component path integrity, contract ownership, and small OpenSLO Service shape |
| `bun run check:contracts` | TypeSpec format/compilation, generated-output consistency, TypeScript conformance, and runtime interface tests |
| `bun run check:dependencies` | Import boundary probes, cycles, unresolved imports, and the full frontend dependency graph |
| `bun run contracts:generate` | Regenerate committed TypeScript contracts and JSON schemas from TypeSpec |
| `bun run analyze` | Source inventory using ts-morph |
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
bun test ./test/unit/domain/baseline.test.ts ./test/interface/domain/baseline.test.ts
bun test ./test/unit/lib/baseline-yaml.test.ts ./test/interface/lib/baseline-yaml.test.ts
bun test ./test/unit/architecture
bun test ./test/unit/lib/architecture-layout.test.ts
bun run test:dom
bun run test:e2e --tags @baseline-viewer
bun run check:contracts
```

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
bun test ./test/unit/lib/interface-arc-visibility.test.ts
bun test --preload ./test/preload.ts ./test/unit/components/connection-scope.test.tsx
bun test --preload ./test/preload.ts ./test/unit/components/connection-labels.test.tsx
bun run test:e2e --tags @br-08a
bun run test:e2e --tags @br-08b
```

`bun run test:native` scans `test/unit` for native TypeScript suites.
`bun run test:dom` runs React suites with `test/preload.ts` in a separate process.
Keep DOM globals out of native tests. `bun test` defaults to `test/unit/domain`.
Cucumber loads `test/steps`; its default/native profile excludes `@browser` and
`@packaged`. `test:e2e` runs browser acceptance against a fresh production build.
The browser runner forwards Cucumber arguments such as `--tags` and `--format`.
Failed browser scenarios retain screenshots and traces under `test-results/`.

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
| Behavioral | Bun unit tests, baseline/boundary Cucumber scenarios, and browser Cucumber against one fresh production build |
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
  domain/              Platform-independent baseline model and validation
  lib/                 Bounded YAML input, ELK layout, and class merging
  platform/            Host detection, native file selection/read, and browser file access
src-tauri/             Rust desktop shell and window capabilities
cookbook/              Behavior, TypeSpec contracts, generated schemas, observability
scripts/               Contract generation/checks and separate source-analysis tools
test/                  Unit/interface suites and shared Cucumber steps
```

The root [component manifest](component.yaml) links the four constraints and the
`workspace` and `native-shell` children. The [workspace](src/component.yaml) owns
the app entrypoints and `architecture/`, `components/`, and `lib/`. Its children
are `architecture-model` in `domain/` and `desktop-adapter` in `platform/`.
These manifests describe this repository for development checks. The viewer
reads component records from the selected baseline.

The [dependency rules](.dependency-cruiser.cjs) keep model validation and YAML
decoding separate from platform operations, UI, and layout. The workflow uses
injected file and layout operations. The platform owns Tauri access. React
components use the [workspace view](src/architecture/workspace-view.ts) and
prepared diagram data. App connects the workspace to the UI. ELK loads on demand
before a baseline view is committed.

`bun run check:dependencies` runs [import probes](scripts/check-dependency-boundaries.ts)
in temporary projects and checks the full frontend dependency graph. The probes
cover permitted and rejected imports, including erased types and imports with
runtime effects. Cargo dependencies and Tauri capabilities govern the Rust
boundary. The host registers only `document_file_read` and enables the open-file
dialog. Repository analysis, snapshots, export, writable caches, and their
startup/shutdown services have been removed.

ELK produces a large deferred chunk and a Vite size warning. Opening the example
or a baseline requests that chunk.

## Dependency policy

All requested direct npm and Cargo dependencies use exact versions; commit `bun.lock` and `src-tauri/Cargo.lock` after intentional updates. The JavaScript dialog companion `@tauri-apps/plugin-dialog@2.8.4` is included alongside the Rust plugin. Cucumber 13.3.0 supplies `@cucumber/gherkin@42.0.1` transitively; it is not separately installed.

The [TypeScript side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) is deliberate:

- `@typescript/native` aliases `typescript@7.0.2` and supplies the `tsc` command.
- `typescript` aliases `@typescript/typescript6@6.0.2` and supplies the API for tools such as ESLint, plus `tsc6`.

The compatibility wrapper depends on `@typescript/old` through a `^6` range. A direct `@typescript/old` alias pins that underlying API implementation to TypeScript 6.0.2 as well; Knip exempts this pin because it is consumed by the wrapper. The typecheck script invokes the native compiler by its package path to avoid competing `tsc` executable names.

Use `bun run typecheck` to check with the native compiler. Do not replace the compatibility alias with TypeScript 7: it does not provide the legacy compiler API.

`cn` supplies the `cn` utility; no separate `clsx` or `tailwind-merge` dependency is needed. The shadcn generator may add dependencies or rewrite the utility when generating components; review those changes before accepting them. Knip checks application, test, tooling, and CSS dependencies.

The Codex CLI is a development tool. Authenticate it separately when needed; no
credentials, AI backend, or Codex subprocess are embedded in the app. Rust
serialization and file-identity checks support bounded native reads.

See [the cookbook](cookbook/README.md) for component artifacts, focused checks,
and validation limits. The [evidence table and remaining work](cookbook/TODO.md)
separate local checks from production prerequisites. All manifests share one
unmeasured OpenSLO Service; there is no active production SLI or SLO.
