# Choom

A Bun / TypeScript / React workspace with a Tauri desktop shell. Choom analyzes
declared repository components and displays their imports with React Flow and
ELK. Portable YAML keeps the semantic architecture independent of rendering.

The proposed [LLM-led architecture analysis design](docs/design/llm-led-architecture-analysis.md)
defines a three-step review of component isolation and granularity: establish an
architecture baseline, investigate boundary problems, and overlay findings and
proposed changes. It specifies tools, LLM responsibilities, saved evidence, and
outputs for whole-repository, regional, and change analysis.

The [baseline viewer plan](docs/design/cr-baseline-viewer-plan.md) replaces the
product's repository analysis with a saved-baseline viewer. The implementation
is split into seven draft PRs. See the [verification record](docs/change-requests/BV-baseline-viewer-evidence.md)
for completed checks and remaining work. The first two tickets add baseline
validation and bounded YAML input; the current app route changes in BV-03.

Run the baseline contract checks with:

```sh
bun run test:behavior --tags @baseline-viewer
bun test ./test/unit/domain/baseline.test.ts ./test/interface/domain/baseline.test.ts
bun test ./test/unit/lib/baseline-yaml.test.ts ./test/interface/lib/baseline-yaml.test.ts
bun run check:contracts
```

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

Use **Load Repo** in desktop Choom to select a repository root with a
`component.yaml`, explicit analyzer metadata, and dependency-cruiser **18.7.2**
installed at that root's `node_modules/dependency-cruiser`. Stable Node **22, 24,
or 26 and later** must be available on the desktop application's `PATH` (the
analyzer's range is `^22||^24||>=26`; prereleases, 23, and 25 are excluded).
The UI has no Node-path setting. A terminal's runtime environment does not prove
that Finder or a desktop shortcut can find the same runtime. Loading runs the repository's JavaScript
configuration; only load repositories you trust. One declared component may own
several subdirectories. Choom does not infer extra components from folders.

Use **Open Diagram** in desktop or browser to view a saved `.choom.yaml` without
the repository or analyzer. **Export Diagram** saves the current semantic
document. A failed or cancelled load preserves the current diagram; **Retry**
reuses the last selection. Cleanup failures keep new loads blocked until cleanup
succeeds. Unconfirmed analyzer or discovery cleanup requires restarting the app.

The retained **Choose directory** action only displays a path. Desktop
capabilities are restricted to the main window; the browser hides desktop-only
actions.

Workspace actions sit in a compact bar above the diagram. The canvas fills the
remaining window and grows when the window is resized. Use **?** for recorded
analysis and **Findings** for diagnostics. Double-click a component to inspect
its declaration and incoming or outgoing imports. With a keyboard, focus a
component and press **Enter** or **Space**. Close the panel with **Escape** or
its close button to return to the diagram.

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
| `bun run test:behavior` | Model and desktop-adapter Cucumber scenarios (no browser) |
| `bun run test:behavior:native` | Explicit browser-free Cucumber profile |
| `bun run test:behavior:browser` | Browser Cucumber scenarios against a fresh production build |
| `bun run test:behavior:packaged` | Installed Linux application acceptance; requires native drivers and a fresh frontend build |
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

Run `bun run test:e2e --tags @diagram-workspace` for canvas sizing, analysis,
component details, findings, and keyboard access. The focused React suites are
included in `bun run test:dom`.

`bun run test:native` scans `test/unit` for native TypeScript suites;
`bun run test:dom` runs the React suite with `test/preload.ts` in a separate
process. Add new DOM suites to that command. `bun test` defaults to
`test/unit/domain`. Cucumber loads `test/steps`; its default/native profile excludes
`@browser` and `@packaged`. `test:e2e` runs the browser profile using Playwright through
`test:behavior:browser`, with a production build and preview. Layout fault cases
use a separate test entry that injects a controlled layout into the real App and
workflow; it never enters the production bundle. Failed browser scenarios
retain screenshots and traces under `test-results/`. `bun run check` stays
browser-free. GitHub Actions runs the constraint script and separate code-hygiene
checks on Linux, plus desktop executable builds on Linux, macOS, and Windows.
Linux also installs the release package and runs the native picker
characterization, native analyzer and document operations, and then the architecture-import
scenarios. CI retains browser, constraint, and installed-app reports, plus the
Linux installer, installed-executable hash, and source commit.

[CR-001-T01](docs/change-requests/CR-001-T01-evidence.md) adds the architecture
import specification before its production implementation. New behavior is
expected to fail until later tickets implement it; existing characterization
must remain green. The complete CI route includes the new scenarios. Focused
commands help distinguish missing behavior from regressions:

```sh
bun run test:behavior:native
bun run test:e2e --tags 'not @cr-001'
bun run test:e2e --tags '@cr-001'
```

[CR-001-T02](docs/change-requests/CR-001-T02-evidence.md) adds the analyzer-neutral
domain contract, document builder, and strict version-1 validator. A declared
component owns its subdirectories until a more-specific declaration takes over.
These public APIs are covered without a browser and consumed by the T07 load
workflow. Run the focused checks with:

```sh
bun run test:behavior:native --tags @cr-001-t02-domain
bun test ./test/unit/domain
bun test ./test/interface/domain/architecture-document.test.ts ./test/interface/domain/architectural-layer.test.ts
```

[CR-001-T03](docs/change-requests/CR-001-T03-evidence.md) adds manifest discovery
and bounded native repository access. The workspace follows linked declarations
and explicit root analyzer metadata; one component can own multiple source
directories. Discovery does not run an analyzer; the load workflow composes it
with the neutral architectural layer.
See the [discovery contract](cookbook/interfaces/discovery.md) for path rules,
session ownership, and resource limits. Focused checks:

```sh
bun run test:behavior:native --tags @cr-001-t03-api
bun test ./test/unit/architecture ./test/unit/platform
bun test ./test/interface/architecture ./test/interface/platform
bun run test:rust
```

[CR-001-T04](docs/change-requests/CR-001-T04-evidence.md) adds conversion of
completed dependency-cruiser 18.7.2 JSON reports into the neutral architecture
document. Conversion preserves declared ownership, canonical file evidence,
findings, and analysis scope. See the [converter contract](cookbook/interfaces/dependency-cruiser.md)
for supported semantics and limits. T05 supplies the runner; T07 supplies the
import UI.

```sh
bun run test:behavior:native --tags @cr-001-t04-api
bun test ./test/unit/architecture/dependency-cruiser
bun test ./test/interface/architecture/dependency-cruiser
```

[CR-001-T05](docs/change-requests/CR-001-T05-evidence.md) adds the concrete
architectural layer and desktop analyzer jobs. The runner handles cancellation
and cleanup before conversion; Rust selects the local runtime and analyzer and
owns bounded process execution. See the [native execution contract](cookbook/interfaces/desktop-analyzer.md)
for package layouts, path restrictions, and resource limits. Focused checks:

```sh
bun run test:behavior:native --tags @cr-001-t05-api
bun test ./test/unit/architecture/dependency-cruiser ./test/unit/platform
bun test ./test/interface/architecture/dependency-cruiser ./test/interface/platform
bun run test:rust
```

The Linux installed route also runs
`bun run test:behavior:packaged --tags @packaged-native-analysis` after picker
smoke. Follow the [installed acceptance guide](docs/change-requests/CR-001-native-acceptance.md)
for its release artifact, runtime, and independent dependency prerequisites.

[CR-001-T06](docs/change-requests/CR-001-T06-evidence.md) adds portable YAML,
validated candidate snapshots, selected-file reads, and atomic export. The codec
preserves declared components and their full file evidence without the source
repository. Native storage keeps at most a current snapshot and a candidate;
failed cleanup blocks further writes until retry succeeds. See the
[document contract](cookbook/interfaces/documents.md) for format limits and file
ownership. T07 supplies the selection, export, and viewing UI. Focused checks:

```sh
bun run test:behavior:native --tags @cr-001-t06-api
bun test ./test/unit/lib ./test/unit/documents ./test/unit/platform/documents.test.ts
bun test ./test/interface/lib ./test/interface/platform/documents.test.ts
bun run test:rust
```

The installed Linux route runs
`bun run test:behavior:packaged --tags @packaged-native-documents` after analyzer
operations. It checks source-to-document export/reopen through real native IPC,
replacement consent, and bounded candidate storage.

[CR-001-T07](docs/change-requests/CR-001-T07-evidence.md) connects selection, discovery, analysis, candidate validation, layout,
and one final view commit. It renders declared components, import evidence,
findings, and provenance. The [workspace contract](cookbook/interfaces/workspace.md)
describes cancellation, retry, cleanup ownership, and export independence.
Focused checks:

```sh
bun run test:behavior:native --tags '@cr-001-t07-api or @cr-001-t07-dialogs'
bun test ./test/unit/architecture
bun run test:dom
bun run test:e2e --tags @cr-001-t07
```

[CR-001-T08](docs/change-requests/CR-001-T08-evidence.md) reviews the complete
constraint and platform evidence. The installed Linux cases also cover missing
Node, real analyzer cancellation and cleanup, Retry after analyzer failure, and
invalid saved files. A fresh native viewer opens an export with the source
repository removed and `PATH` pointing only to an empty directory. See the evidence record for
results and the remaining platform limits.

[R02 publication evidence](docs/architecture-reviews/R02-publication-evidence.md)
records the workspace's immutable view contract, focused regression commands,
and the measured copy cost for large saved documents.
[R03 diagnostics evidence](docs/architecture-reviews/R03-diagnostics-evidence.md)
records the shared safe-message catalog and its compatibility checks.

The browser runner forwards Cucumber arguments such as `--tags` and `--format`.
Desktop simulations double native dialogs and validate repository, analyzer,
and document commands against their TypeSpec contracts. They use real fixture
files and recorded analyzer reports, then run the real conversion and document
workflow. Scenarios cannot pass until their required inputs and controls have
runtime observations; staging facts alone supplies no evidence. These
simulations do not prove native execution or failure handling. See the
[installed acceptance guide](docs/change-requests/CR-001-native-acceptance.md)
for Linux prerequisites, explicit application/dependency paths, and manual
macOS/Windows checks. Build the frontend once with `bun run build` before using
`bun run test:behavior:packaged`.

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
| Behavioral | Bun unit tests, model/adapter Cucumber scenarios, and browser Cucumber against one fresh production build |
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
  architecture/        Load workflow, composition, discovery, and analyzer integration
  components/          React components and shadcn-compatible UI
  documents/           Candidate preparation, snapshot release, and desktop export
  domain/              Platform-independent architecture model
  lib/                 Portable YAML codec, ELK layout, and class merging
  platform/            Host detection, desktop dialogs and IPC, and browser document access
src-tauri/             Rust desktop shell and window capabilities
cookbook/              Behavior, TypeSpec contracts, generated schemas, observability
scripts/               Contract generation/checks and ts-morph analysis
test/                  Unit/interface suites and shared Cucumber steps
```

The root [component manifest](component.yaml) links the four constraints and the
`workspace` and `native-shell` children. The [workspace](src/component.yaml) owns
the app entrypoints and `architecture/`, `components/`, `documents/`, and `lib/`.
Its child declarations are `architecture-model` in `domain/` and
`desktop-adapter` in `platform/`. One component can own several ordinary
subdirectories. Only linked declarations add components. See the
[behavior and ownership baseline](docs/architecture-reviews/R01-behavior-ownership-baseline.md)
for resource transfers and import boundaries.

The [dependency rules](.dependency-cruiser.cjs) check direct imports, including
type imports. Discovery, workflow, and document lifecycle modules depend on
injected collaborators and stay separate from UI and composition. Their direct
package imports are limited to YAML and Zod. The rules reject direct Node
built-in imports. Their platform imports are erased types from the generated
contracts or the named access module for discovery or document files. The
platform owns Tauri access.

The semantic domain uses its own modules and Zod. The YAML codec uses its own
helpers, the generated format contracts, the semantic domain, and YAML. The
concrete analyzer stays within its vendor folder and the named
[analyzer factory](src/architecture/create-architectural-layer.ts).

React components use the [workspace view](src/architecture/workspace-view.ts)
and generated workflow data. The view imports only named data bindings erased
during compilation. The diagram and details render prepared data. App binds the
workspace composition and the retained directory picker. ELK loads on demand
before a diagram commits.

`bun run check:dependencies` runs [import probes](scripts/check-dependency-boundaries.ts)
in temporary projects and checks the full frontend dependency graph. The probes
cover permitted and rejected edges and distinguish erased type imports from
inline type imports that retain a module side effect. When Choom analyzes its
own repository, dependency-cruiser reports explicit `preCompilationOnly` values
for these edges and Choom preserves them in import evidence. Cargo dependencies
and Tauri capabilities govern the Rust boundary.

ELK's bundled algorithms currently produce a large deferred chunk and a Vite size warning. The landing screen does not load that chunk; an example or document load requests it.

## Dependency policy

All requested direct npm and Cargo dependencies use exact versions; commit `bun.lock` and `src-tauri/Cargo.lock` after intentional updates. The JavaScript dialog companion `@tauri-apps/plugin-dialog@2.8.4` is included alongside the Rust plugin. Cucumber 13.3.0 supplies `@cucumber/gherkin@42.0.1` transitively; it is not separately installed.

The [TypeScript side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) is deliberate:

- `@typescript/native` aliases `typescript@7.0.2` and supplies the `tsc` command.
- `typescript` aliases `@typescript/typescript6@6.0.2` and supplies the API for tools such as ESLint, plus `tsc6`.

The compatibility wrapper depends on `@typescript/old` through a `^6` range. A direct `@typescript/old` alias pins that underlying API implementation to TypeScript 6.0.2 as well; Knip exempts this pin because it is consumed by the wrapper. The typecheck script invokes the native compiler by its package path to avoid competing `tsc` executable names.

Use `bun run typecheck` to check with the native compiler. Do not replace the compatibility alias with TypeScript 7: it does not provide the legacy compiler API.

`cn` supplies the `cn` utility; no separate `clsx` or `tailwind-merge` dependency is needed. The shadcn generator may add dependencies or rewrite the utility when generating components; review those changes before accepting them. Knip checks application, test, tooling, and CSS dependencies.

The Codex CLI is a development tool. Authenticate it separately when needed; no credentials, AI backend, or Codex subprocess are embedded in the app. Rust serialization, process, and OS-binding crates support the bounded native operations.

See [the cookbook](cookbook/README.md) for component artifacts, focused checks,
and validation limits. The [evidence table and remaining work](cookbook/TODO.md)
separate local checks from production prerequisites. All manifests share one
unmeasured OpenSLO Service; there is no active production SLI or SLO.
