# Cookbook

Start at the [root component manifest](../component.yaml). Paths are relative to
each manifest. The four implementation components share the constraint artifacts
here. TypeSpec owns their data and operation contracts; behavior and native
configuration retain their own artifacts.

| Component | Owner | Behavior | Interface |
| --- | --- | --- | --- |
| Workspace UI and layout | [`src/component.yaml`](../src/component.yaml) | [`workspace.feature`](behavior/workspace.feature) | Consumed [architecture](interfaces/architecture.tsp) and [desktop](interfaces/desktop.tsp) contracts; [UI outcomes](interfaces/workspace.md) |
| Architecture model | [`src/domain/component.yaml`](../src/domain/component.yaml) | [`architecture.feature`](behavior/architecture.feature); [semantic documents](behavior/architecture-import/t02-domain.feature) | [TypeSpec contracts](interfaces/architecture.tsp); [starter validator](../src/domain/architecture.ts), [document validator](../src/domain/architecture-document.ts), [builder](../src/domain/build-architecture-document.ts), and [layer binding](../src/domain/architectural-layer.ts) |
| Desktop adapter | [`src/platform/component.yaml`](../src/platform/component.yaml) | [`desktop.feature`](behavior/desktop.feature) | [TypeSpec operations](interfaces/desktop.tsp), implemented by [`desktop.ts`](../src/platform/desktop.ts); [boundary notes](interfaces/desktop.md) |
| Native shell | [`src-tauri/component.yaml`](../src-tauri/component.yaml) | Shared adapter feature; new [installed picker](behavior/architecture-import/t01-installed-picker-smoke.feature) and [import acceptance](behavior/architecture-import/t08-installed.feature) | Choom's [desktop boundary](interfaces/desktop.tsp); vendor Tauri [capability](../src-tauri/capabilities/main.json) and [configuration](../src-tauri/tauri.conf.json) |

The workspace owns `architecture/`, `components/`, and `lib/`, including discovery
and internal layout. The model
and desktop adapter have separate import boundaries. Cargo dependencies and
Tauri capabilities define the native boundary.

The linked [CR-001 features](behavior/architecture-import/) specify the next
architecture-import workflow. T01 registers them before production changes, so
their missing-capability failures are expected during the ordered draft. All
required scenarios must pass before merge. The
[T01 evidence map](../docs/change-requests/CR-001-T01-evidence.md) records owners,
future TypeSpec bindings, retained characterization, and actual verification
limits. Browser simulations do not count as installed-app acceptance.

T02 implements the neutral semantic model behind those workflows. Its
[native scenarios](behavior/architecture-import/t02-domain.feature) exercise the
real builder and document validator. They do not select directories, execute an
analyzer, parse YAML syntax, or render the imported document. The original browser
scenarios remain registered for the later workflow implementation. See the
[T02 evidence record](../docs/change-requests/CR-001-T02-evidence.md).

T03 adds [repository discovery](interfaces/discovery.md), with
[public API scenarios](behavior/architecture-import/t03-api.feature) and bounded
native text/path commands. The root manifest explicitly declares the analyzer
and its literal inputs. Child links alone declare components; one component can
own multiple source directories. See the [T03 evidence record](../docs/change-requests/CR-001-T03-evidence.md)
for runtime, native, and installed-acceptance limits.

T04 adds the [completed-report converter](interfaces/dependency-cruiser.md).
Its [public API scenarios](behavior/architecture-import/t04-converter.feature)
and recorded vendor reports cover canonical evidence, declared component
ownership across subdirectories, diagnostics, and supported scope. The converter
calls the common builder through an injected repository path boundary. It has
no process or UI caller yet. See the [T04 evidence record](../docs/change-requests/CR-001-T04-evidence.md).

The [TypeSpec entrypoint](interfaces/main.tsp) imports the owned contracts.
Generated TypeScript declarations live with the [domain](../src/domain/generated/contracts.ts)
[platform](../src/platform/generated/contracts.ts) owners, and with the workspace's
[discovery code](../src/architecture/generated/contracts.ts) and
[concrete converter](../src/architecture/dependency-cruiser/generated/contracts.ts). The generated
[structural schemas](interfaces/generated/contracts.schema.json) share one JSON
Schema document. [Configuration](interfaces/tspconfig.yaml) selects the emitter.
Edit the `.tsp` source, run
`bun run contracts:generate`, and commit the reviewed source and output changes.
Do not hand-edit generated files. TypeSpec operations describe logical parameters
and results; the implementation binding and behavior tests establish synchronous
or asynchronous execution, cancellation, and rejection behavior.

The local [TypeScript binding](../scripts/contracts/typescript.ts) maps the
non-HTTP model, scalar, union, and interface forms used by these contracts. It
fails on unsupported constructs or declarations without a configured output
owner. When adding types or components, extend that mapping and its conformance
checks deliberately. The official `@typespec/json-schema` emitter produces the
structural JSON schemas.

## What the checks establish

| Check | Scope |
| --- | --- |
| `./scripts/run_all_constraints.sh` | Run the four automated groups below and report every result; no LLM calls |
| `bun run test:behavior` | Model schema and adapter Cucumber scenarios without a browser |
| `bun run test:e2e` | Browser Cucumber scenarios against a fresh production build |
| `bun run check:dependencies` | TypeScript import boundaries in `.dependency-cruiser.cjs` |
| Cargo checks and Tauri build | Native compilation and configuration |
| `bun run check:cookbook` | Manifest path integrity, contract ownership, and small OpenSLO Service policy |
| `bun run check:contracts` | TypeSpec format/compilation, generated-output consistency, TypeScript conformance, and runtime interface cases |

`check:cookbook` checks artifact paths, child names, duplicate/cyclic links,
orphan manifests, Cucumber and local TypeSpec source ownership, and a small
`openslo/v1` Service shape. Linking a feature does not execute it.
It also checks annotated root analyzer metadata and contained literal inputs.
Path-only root manifests remain valid for cookbook CI; repository discovery
requires one explicit analyzer. CI retains its Choom-specific artifact rules.
`check:contracts` also requires every owned TypeSpec source to be imported by
`main.tsp`, then checks compilation and implementation conformance. The OpenSLO
check validates only the stated Service
shape, not the full specification or production reliability. Dependency, Cargo,
and Tauri commands check their respective boundaries.

`check:contracts` compiles TypeSpec into a temporary directory and compares the
results with committed outputs. Missing or stale generated files fail the check.
TypeScript checks connect generated model and operation declarations to their
implementations. Runtime interface cases compare generated structural schemas
with the real parser. The Zod parser still owns unique IDs, valid references, and
input normalization; a structural schema does not establish those graph rules.
The version-1 validator rejects unknown fields, validates declared ownership,
and normalizes collection order. The starter parser retains its previous behavior.
Document interface cases use AJV's date-time format validator as well as the
generated schema; compilation alone does not validate timestamp values.
The app has no HTTP API or event transport. UI outcomes and native capabilities
remain covered by their behavior and configuration checks.

All five manifests share one unmeasured [OpenSLO Service](observability/service.yaml).
There is no production SLI, SLO, or alert policy. The
[evidence table and remaining work](TODO.md) separate local verification from
native acceptance and production measurement prerequisites.

## Run the characterizations

After installing dependencies and Chromium, run all four constraint validations:

```sh
./scripts/run_all_constraints.sh
```

The Bash runner continues after ordinary check failures and preserves each
command's full output under `reports/constraints/`. It prints failure diagnostics
and a summary for all four groups. It never installs dependencies or invokes
Codex, another agent, or an LLM. Non-interactive output is plain text; terminals
can use color unless `NO_COLOR` is set. `--help` lists setup and exit codes.
Cancellation stops the active command group, with a force-stop after 12 seconds
if needed, and preserves partial logs instead of reporting a passing summary.

| Group | Commands | Scope of a pass |
| --- | --- | --- |
| Behavioral | `bun run test`, `bun run test:behavior`, `bun run test:e2e` | Current unit and Cucumber outcomes, including the built browser and mocked desktop caller |
| Observability | `bun run check:cookbook` | Existing component links, contract ownership, and Service shape; no production measurement |
| Architectural | `bun run check:dependencies` | Enforced TypeScript import rules |
| Interface | `bun run check:contracts` | TypeSpec format/compilation, current generated outputs, TypeScript implementation conformance, and runtime interface cases; broader model/adapter behavior is in Behavioral |

Native Cargo/Tauri checks stay in the separate desktop CI job. No script can
claim the native acceptance or production evidence that is still missing in the
[evidence table](TODO.md). Lint, unused-code, and duplication checks remain
separate web CI steps; they are not additional constraint groups.

For focused runs:

```sh
bun run test:behavior                         # Model and mocked adapter boundary
bun run test:behavior --tags @desktop-adapter # Only the directory adapter
bunx --no-install playwright install chromium
bun run test:e2e                              # Build, private preview, browser Cucumber
bun run check:cookbook
bun run check:contracts                       # TypeSpec, output consistency, and conformance
bun test ./test/interface/domain              # Architecture schema/parser cases
bun test ./test/interface/platform            # Desktop result schemas
bun run check:dependencies
```

`cucumber.mjs` has a browser-free default profile and an explicit `browser`
profile. Browser scenarios launch a fresh browser for each scenario. The local
runner starts a production preview on a private port and closes it after success
or failure. Failed scenarios retain screenshots and traces in `test-results/`.
`test:e2e` delegates to `test:behavior:browser`; it builds once and runs one
browser suite. CI runs the constraint script for both profiles. Browser execution
uses Playwright; mocked desktop scenarios exercise the real App and adapter but
not the packaged native shell.

To run the browser profile against an existing web deployment, create `reports/`,
set `CHOOM_BASE_URL` to that deployment URL, and run:

```sh
bunx --no-install cucumber-js --config cucumber.mjs --profile browser --format json:reports/workspace.json
```

This optional command produces local probe evidence. The repository does not
schedule it or collect results in production. Desktop UI scenarios still use
an IPC double.
