# Cookbook

Start at the [root component manifest](../component.yaml). Paths are relative to
each manifest. The four implementation components share the constraint artifacts
here. This bootstrap changes no production code.

| Component | Owner | Behavior | Interface |
| --- | --- | --- | --- |
| Workspace UI and layout | [`src/component.yaml`](../src/component.yaml) | [`workspace.feature`](behavior/workspace.feature) | Exported [App signature](../src/App.tsx), [UI outcomes](interfaces/workspace.md) |
| Architecture model | [`src/domain/component.yaml`](../src/domain/component.yaml) | [`architecture.feature`](behavior/architecture.feature) | Exported Zod schema and `Architecture` in [`architecture.ts`](../src/domain/architecture.ts) |
| Desktop adapter | [`src/platform/component.yaml`](../src/platform/component.yaml) | [`desktop.feature`](behavior/desktop.feature) | Exported types in [`desktop.ts`](../src/platform/desktop.ts), [boundary notes](interfaces/desktop.md) |
| Native shell | [`src-tauri/component.yaml`](../src-tauri/component.yaml) | Shared adapter feature; no packaged acceptance | Tauri [capability](../src-tauri/capabilities/main.json) and [configuration](../src-tauri/tauri.conf.json) |

The workspace owns `components/` and `lib/`, including internal layout. The model
and desktop adapter have separate import boundaries. Cargo dependencies and
Tauri capabilities define the native boundary.

## What the checks establish

| Check | Scope |
| --- | --- |
| `./scripts/run_all_constraints.sh` | Run the four automated groups below and report every result; no LLM calls |
| `bun run test:behavior` | Model schema and adapter Cucumber scenarios without a browser |
| `bun run test:e2e` | Browser Cucumber scenarios against a fresh production build |
| `bun run check:dependencies` | TypeScript import boundaries in `.dependency-cruiser.cjs` |
| Cargo checks and Tauri build | Native compilation and configuration |
| `bun run check:cookbook` | Manifest path integrity and small artifact policies |

`check:cookbook` checks artifact paths, child names, duplicate/cyclic links,
orphan manifests, Cucumber ownership, and a small `openslo/v1` Service shape.
Linking a feature does not execute it. Spectral checks required fields and pinned
versions in the empty [OpenAPI](interfaces/openapi.json) and
[AsyncAPI](interfaces/asyncapi.json) templates; its resolver permits no external
requests. These policies do not validate the full OpenAPI, AsyncAPI, or OpenSLO
specifications, TypeScript contracts, or source architecture. Existing type,
behavior, dependency, Cargo, and Tauri commands check their respective contracts.

The app has no HTTP API or event transport. Its actual contracts are the exported
Zod schema and TypeScript definitions, UI outcomes, and native declarations. The
Zod schema includes unique IDs and valid references that an approximate JSON
Schema would omit.

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
| Observability | `bun run check:cookbook` | Existing component links, Service shape, and HTTP/event template policies; no production measurement |
| Architectural | `bun run check:dependencies` | Enforced TypeScript import rules |
| Interface | `bun run check-types` | Source signatures and consumers compile; runtime schema/adapter checks are in Behavioral and template policies are in Observability |

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
