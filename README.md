# Choom

A Bun / TypeScript / React workspace with a Tauri desktop shell. The starter includes a small architecture canvas to exercise React Flow, ELK layout, Zod validation, Markdown rendering, and the UI primitives.

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

The directory picker returns a path; it does not read files or import a project. Its capability is restricted to the main window. The browser hides desktop-only actions.

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

`bun run test:native` scans `test/unit` for native TypeScript suites;
`bun run test:dom` runs the React suite with `test/preload.ts` in a separate
process. Add new DOM suites to that command. `bun test` defaults to
`test/unit/domain`. Cucumber loads `test/steps`; its default/native profile excludes
`@browser` and `@packaged`. `test:e2e` runs the browser profile using Playwright through
`test:behavior:browser`, with one build and preview. Failed browser scenarios
retain screenshots and traces under `test-results/`. `bun run check` stays
browser-free. GitHub Actions runs the constraint script and separate code-hygiene
checks on Linux, plus desktop executable builds on Linux, macOS, and Windows.
Linux also installs the release package and runs the native picker
characterization before the architecture-import scenarios. CI retains browser,
constraint, and installed-app reports.

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
These public APIs are covered without a browser; the import UI still needs the
remaining tickets. Run the focused checks with:

```sh
bun run test:behavior:native --tags @cr-001-t02-domain
bun test ./test/unit/domain
bun test ./test/interface/domain/architecture-document.test.ts ./test/interface/domain/architectural-layer.test.ts
```

[CR-001-T03](docs/change-requests/CR-001-T03-evidence.md) adds manifest discovery
and bounded native repository access. The workspace follows linked declarations
and explicit root analyzer metadata; one component can own multiple source
directories. Discovery does not run an analyzer and is not wired to the UI yet.
See the [discovery contract](cookbook/interfaces/discovery.md) for path rules,
session ownership, and resource limits. Focused checks:

```sh
bun run test:behavior:native --tags @cr-001-t03-api
bun test ./test/unit/architecture ./test/unit/platform
bun test ./test/interface/architecture ./test/interface/platform
bun run test:rust
```

The browser runner forwards Cucumber arguments such as `--tags` and `--format`.
Desktop simulations double the vendor open/save dialog boundary. Analyzer,
delay, and storage-fault inputs are staged for the TypeSpec bindings delivered
by later tickets. Scenarios cannot pass until their required inputs and controls
have runtime observations; staging facts alone supplies no evidence. These
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
  architecture/        Repository discovery and its generated contracts
  components/          React components and shadcn-compatible UI
  domain/              Platform-independent architecture model
  lib/                 Class merging and ELK layout
  platform/            Tauri dialog and repository access adapters
src-tauri/             Rust desktop shell and window capabilities
cookbook/              Behavior, TypeSpec contracts, generated schemas, observability
scripts/               Contract generation/checks and ts-morph analysis
test/                  Unit/interface suites and shared Cucumber steps
```

The root [component manifest](component.yaml) links the four constraints and the
workspace and native-shell children. The workspace owns `architecture/`, `components/`, and `lib/`,
with child boundaries for the architecture model and desktop adapter. These four
implementation components keep UI primitives and layout internal to the workspace.

`.dependency-cruiser.cjs` enforces import boundaries, rejects cycles and unresolved imports, and keeps Tauri access in `src/platform`. Domain imports stay independent of the UI and platform, libraries do not import UI or platform modules, and the platform adapter does not import the workspace. These rules include type imports. Cargo dependencies and Tauri capabilities define the native boundary; dependency-cruiser does not analyze Rust. The example loads React Flow and ELK on demand.

ELK's bundled algorithms currently produce a large deferred chunk and a Vite size warning. The landing screen does not load that chunk; the example loads it on request.

## Dependency policy

All requested direct npm and Cargo dependencies use exact versions; commit `bun.lock` and `src-tauri/Cargo.lock` after intentional updates. The JavaScript dialog companion `@tauri-apps/plugin-dialog@2.8.4` is included alongside the Rust plugin. Cucumber 13.3.0 supplies `@cucumber/gherkin@42.0.1` transitively; it is not separately installed.

The [TypeScript side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) is deliberate:

- `@typescript/native` aliases `typescript@7.0.2` and supplies the `tsc` command.
- `typescript` aliases `@typescript/typescript6@6.0.2` and supplies the API for tools such as ESLint, plus `tsc6`.

The compatibility wrapper depends on `@typescript/old` through a `^6` range. A direct `@typescript/old` alias pins that underlying API implementation to TypeScript 6.0.2 as well; Knip exempts this pin because it is consumed by the wrapper. The typecheck script invokes the native compiler by its package path to avoid competing `tsc` executable names.

Use `bun run typecheck` to check with the native compiler. Do not replace the compatibility alias with TypeScript 7: it does not provide the legacy compiler API.

`cn` supplies the `cn` utility; no separate `clsx` or `tailwind-merge` dependency is needed. The shadcn generator may add dependencies or rewrite the utility when generating components; review those changes before accepting them. Knip checks application, test, tooling, and CSS dependencies.

The Codex CLI is a development tool. Authenticate it separately when needed; no credentials, AI backend, or Codex subprocess are embedded in the app. Rust serialization and Unix OS-binding crates are pinned for future native implementation.

See [the cookbook](cookbook/README.md) for component artifacts, focused checks,
and validation limits. The [evidence table and remaining work](cookbook/TODO.md)
separate local checks from production prerequisites. All manifests share one
unmeasured OpenSLO Service; there is no active production SLI or SLO.
