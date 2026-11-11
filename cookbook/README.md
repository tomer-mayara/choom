# Cookbook

Start at the [root component manifest](../component.yaml). Paths are relative to
each manifest. The four implementation components share the constraint artifacts
here. TypeSpec owns their data and operation contracts; behavior and native
configuration retain their own artifacts.

| Component | Owner | Behavior | Interface |
| --- | --- | --- | --- |
| Workspace UI and layout | [`src/component.yaml`](../src/component.yaml) | [Baseline opening](behavior/baseline-viewer/open.feature) and [file input](behavior/baseline-viewer/input.feature) | [Workflow](interfaces/workflow.tsp), [baseline codec](interfaces/baseline-codec.tsp), and [UI outcomes](interfaces/workspace.md) |
| Baseline model | [`src/domain/component.yaml`](../src/domain/component.yaml) | [Baseline validation](behavior/baseline-viewer/validation.feature) | [Baseline contract](interfaces/baseline.tsp), [validation notes](interfaces/baseline.md), and [validator](../src/domain/baseline.ts) |
| Desktop adapter | [`src/platform/component.yaml`](../src/platform/component.yaml) | Baseline file selection and reading through the workspace | [Native file operations](interfaces/desktop-documents.tsp); [desktop boundary](interfaces/desktop.md) |
| Native shell | [`src-tauri/component.yaml`](../src-tauri/component.yaml) | [Installed baseline acceptance](../docs/change-requests/BV-native-acceptance.md) | Native file operations, Tauri [capability](../src-tauri/capabilities/main.json), and [configuration](../src-tauri/tauri.conf.json) |

The workspace owns `architecture/`, `components/`, and `lib/`. It connects
baseline file input to validation, layout, and the view. The model and desktop
adapter have separate import boundaries. Cargo dependencies and Tauri
capabilities define the native boundary.

BV-03 supplies ordinary baseline opening and a basic component view. Nested
components, interfaces/resources, full details, and removal of unused native
commands belong to BV-04 through BV-07. See the
[viewer plan](../docs/design/cr-baseline-viewer-plan.md) and
[verification record](../docs/change-requests/BV-baseline-viewer-evidence.md)
for scope and completed checks. A browser simulation does not count as
installed-app acceptance.

The [CR-001 records](../docs/change-requests/CR-001-architecture-import.md)
describe the former repository-analysis app. The separate
[manual producer workflow](../docs/design/app-a/start-here.md) can create
baselines and evidence; the viewer does not run it.

The [TypeSpec entrypoint](interfaces/main.tsp) imports the owned contracts.
Generated TypeScript declarations live with the [domain](../src/domain/generated/contracts.ts)
and [platform](../src/platform/generated/contracts.ts) owners, and with the
[workflow](../src/architecture/generated/workflow.ts) and
[baseline codec](../src/lib/generated/contracts.ts). The generated
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

Closed empty TypeSpec models map to `Record<string, never>` so an empty request
does not become TypeScript's unrestricted non-nullish `{}` type.

## What the checks establish

| Check | Scope |
| --- | --- |
| `./scripts/run_all_constraints.sh` | Run the four automated groups below and report every result; no LLM calls |
| `bun run test:behavior` | Baseline model and boundary Cucumber scenarios without a browser |
| `bun run test:e2e` | Browser Cucumber scenarios against a fresh production build |
| `bun run check:dependencies` | TypeScript import boundaries in `.dependency-cruiser.cjs` |
| Cargo checks and Tauri build | Native compilation and configuration |
| `bun run check:cookbook` | Manifest path integrity, contract ownership, and small OpenSLO Service policy |
| `bun run check:contracts` | TypeSpec format/compilation, generated-output consistency, TypeScript conformance, and runtime interface cases |

`check:cookbook` checks artifact paths, child names, duplicate/cyclic links,
orphan manifests, Cucumber and local TypeSpec source ownership, and a small
`openslo/v1` Service shape. Linking a feature does not execute it.
Development manifests can include an architecture enforcer and literal input
paths for local checks. This metadata does not make the viewer import or analyze
a repository. CI retains its Choom-specific artifact rules.
`check:contracts` also requires every owned TypeSpec source to be imported by
`main.tsp`, then checks compilation and implementation conformance. The OpenSLO
check validates only the stated Service
shape, not the full specification or production reliability. Dependency, Cargo,
and Tauri commands check their respective boundaries.

`check:contracts` compiles TypeSpec into a temporary directory and compares the
results with committed outputs. Missing or stale generated files fail the check.
TypeScript checks connect generated model and operation declarations to their
implementations. Runtime interface cases compare generated structural schemas
with the real parser. Baseline validation also checks unique IDs, references,
parent cycles, and membership selectors. A structural schema does not establish
those rules. The validator preserves recorded values, order, statuses, and
references; it does not infer missing facts or resolve external evidence.
The app has no HTTP API or event transport. UI outcomes and native capabilities
remain covered by their behavior and configuration checks.

All five manifests share one unmeasured [OpenSLO Service](observability/service.yaml).
There is no production SLI, SLO, or alert policy. The
[evidence table and remaining work](TODO.md) separate local verification from
native acceptance and production measurement prerequisites.

## Run the checks

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
| Behavioral | `bun run test`, `bun run test:behavior`, `bun run test:e2e` | Current unit and Cucumber outcomes, including the built browser; installed-app checks run separately |
| Observability | `bun run check:cookbook` | Existing component links, contract ownership, and Service shape; no production measurement |
| Architectural | `bun run check:dependencies` | Enforced TypeScript import rules |
| Interface | `bun run check:contracts` | TypeSpec format/compilation, current generated outputs, TypeScript implementation conformance, and runtime interface cases; broader model/adapter behavior is in Behavioral |

Native Cargo/Tauri checks stay in the separate desktop CI job. No script can
claim the native acceptance or production evidence that is still missing in the
[evidence table](TODO.md). Lint, unused-code, and duplication checks remain
separate web CI steps; they are not additional constraint groups.

For focused runs:

```sh
bun run test:behavior --tags @baseline-viewer # Baseline validation and input
bunx --no-install playwright install chromium
bun run test:e2e --tags @bv-03                # Ordinary browser opening
bun run check:cookbook
bun run check:contracts                       # TypeSpec, output consistency, and conformance
bun test ./test/interface/domain              # Baseline contract and validator cases
bun test ./test/interface/platform            # Desktop result schemas
bun run check:dependencies
```

`cucumber.mjs` has a browser-free default profile and an explicit `browser`
profile. Browser scenarios launch a fresh browser for each scenario. The local
runner starts a production preview on a private port and closes it after success
or failure. Failed scenarios retain screenshots and traces in `test-results/`.
`test:e2e` delegates to `test:behavior:browser`; it builds once and runs one
browser suite. CI runs the constraint script for both profiles. Browser execution
uses Playwright. Follow the [installed acceptance guide](../docs/change-requests/BV-native-acceptance.md)
for the ordinary desktop route; browser execution does not prove native behavior.

To run the browser profile against an existing web deployment, create `reports/`,
set `CHOOM_BASE_URL` to that deployment URL, and run:

```sh
bunx --no-install cucumber-js --config cucumber.mjs --profile browser --format json:reports/workspace.json
```

This optional command produces local probe evidence. The repository does not
schedule it or collect results in production. It does not replace installed-app
acceptance.
