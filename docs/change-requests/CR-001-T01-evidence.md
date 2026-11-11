# CR-001-T01: Behavior specification and evidence map

Historical record for the repository-analysis app, replaced in the frontend
by BV-03. Source and constraint links use saved revisions; results and line
references describe the candidates stated below. See the
[baseline viewer plan](../design/cr-baseline-viewer-plan.md) for current work.

This record accompanies [CR-001](CR-001-architecture-import.md). T01 registers
its eight Features before production changes. The feature text preserves the
plan's scenarios; tags select the execution environment and implementation owner.
This record does not establish implementation completion, native acceptance, or
approval of future constraint changes.

The original eight plan Features remain unchanged: 51 scenario definitions and
103 expanded cases. One additional installed picker characterization brings the
registered total to nine Features, 52 definitions and 104 expanded cases.

## Behavior owners and routes

Every new feature has `@cr-001` and its `@cr-001-t0N` ticket tag. T01–T07 use
`@browser`; repository and native-save cases also use `@desktop-ui`. That route
runs the real browser UI with controlled desktop transport. It does not prove
native permissions, filesystem operations, process termination, or installed
runtime discovery. T08 uses `@packaged` and requires the assembled application.
Existing browser-free model and desktop-adapter characterizations remain on the
native Cucumber route.

The additional [installed picker smoke](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t01-installed-picker-smoke.feature)
uses `@packaged @packaged-smoke` and the existing selection/cancellation behavior.
It must pass on a platform before a missing Load Repo action can be accepted as
native feature-red evidence there. An unavailable application or driver, or an
unexecuted smoke scenario, does not satisfy this gate.

| Ticket and feature | Later implementation owners | Required behavior evidence |
| --- | --- | --- |
| [T01: Explore](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t01-explore.feature) | Workspace UI; T03 discovery, T05 execution, T06 documents, T07 workflow | Declared-component import; source-free viewing; retained starter and picker outcomes. |
| [T01: Installed picker smoke](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t01-installed-picker-smoke.feature) | Workspace selection UI, platform dialog adapter and native shell | Retained installed selection/cancellation behavior establishes the native driver baseline before feature-red evidence. |
| [T02: Model](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t02-model.feature) | `src/domain/`; T07 exposes results through the UI | Declared ownership across several subdirectories; deepest declared root; import variants; identity; directed findings; invalid-document rejection. |
| [T03: Discovery](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t03-discovery.feature) | Workspace discovery, `src/platform/`, `src-tauri/src/`; manifest tooling | Exact selected root and linked tree; manifest-relative paths; explicit analyzer selection; containment and invalid-reference failures. |
| [T04: Observations](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t04-observations.feature) | Workspace concrete converter; domain builder from T02; native canonical paths from T03 | Faithful file-pair aggregation, counts and findings; supported effective configuration; useful failures and warnings. Recorded reports alone do not establish real analysis. |
| [T05: Execution](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t05-execution.feature) | Workspace strategy/runner, platform transport, native process owner | Fresh analysis; findings on successful runs; prerequisite and incomplete-run failures; cancellation. T05 adds real source-to-model and native cleanup evidence. |
| [T06: Documents](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t06-documents.feature) | Workspace storage, `src/lib/` codec, platform/native storage | Portable round trips; strict encoding; sanitized paths; safe export replacement; export captures its starting document. |
| [T07: Workflows](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t07-workflows.feature) | Workspace controller, UI and layout | Serialized loads; late-result rejection; cancellation and failure retention; declared cards/counts; retry and keyboard access. |
| [T08: Installed](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t08-installed.feature) | All affected owners; packaged acceptance and release review | Real installed analysis and export; source-free browser/desktop reopening; denied access retains the current view. Earlier native cancellation/file/layout cases also need installed evidence. |

The root manifest links every feature. The workspace owns T01 and T03–T08;
the domain owns T02. Platform and native-shell manifests additionally link
T03/T05/T06/T08 for their discovery, execution, storage, and installed boundaries.
Root, workspace, platform and native shell also link the installed picker smoke.
No new production component is introduced by T01.

The browser driver handles actual vendor open/save dialog invocations. Saved
YAML in a browser goes through its real file chooser, and browser exports use
real downloads. Desktop fixture reads, recorded analyzer reports, execution
conditions, and analysis/layout/storage fault controls still need the later
generated TypeSpec transport bindings. A small observation ledger rejects any
otherwise-passing scenario whose required inputs or controls were not exercised.
Writing a fixture or setting a timing flag does not acknowledge it. Each run
attaches that ledger to its Cucumber report.

Export cancellation returns null through an actual save invocation. The export
snapshot scenario holds that invocation across a new diagram load, then releases
it and requires newly written bytes. Installed checks use real permissions:
the denied-access fixture makes its root manifest unreadable, verifies the OS
denial for the current user, and restores permissions during cleanup. Source-free
reopening deletes the owned repository only after export and uses a fresh viewer.
These bindings prevent false passes; the current missing controls still prevent
the new workflows from reaching their later assertions.

## Planned TypeSpec contracts and conformance

TypeSpec is the source of truth for Choom-owned data and operation contracts.
The entries below describe planned work in later tickets; they are not new
contracts delivered by T01. Existing sources are imported through
[`main.tsp`](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/interfaces/main.tsp). New source filenames and output
owners must be registered when the corresponding contract is implemented.

| Ticket | Planned source owner and definitions | Generated outputs and implementation conformance |
| --- | --- | --- |
| T01 | Map scenarios to the following source owners; change no TypeSpec definition. | Existing outputs stay unchanged; new-red evidence must arise from missing behavior rather than undefined steps. |
| T02 | Domain: extend [`architecture.tsp`](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/interfaces/architecture.tsp) and add neutral analysis requests/outcomes/observations under the same owner as needed. | Domain generated declarations and structural JSON Schema; compare the shared runtime validator and public data types with generated structures. Test ownership/reference/aggregation invariants separately. Live control and promise/callback binding stay in TypeScript. |
| T03 | Workspace: manifest metadata definitions; platform: native text/path operations and DTOs in the [`desktop.tsp`](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/interfaces/desktop.tsp) owner. | Register workspace output ownership; update platform declarations and structural schemas. Check production/tooling manifest parsing and both transport boundaries, including native serialization. |
| T04 | Workspace: Choom-owned completed-report context and neutral conversion data. Dependency-cruiser reports retain their upstream contract. | Register concrete context output ownership; check adapter inputs/outputs and runtime validation of the accepted report subset. Reuse T02 outputs and builder invariants. |
| T05 | Workspace: runner data; platform: native requests/results/progress/cancellation data. | Generated workspace/platform declarations and structural schemas; check TypeScript implementations, native serialization and runtime transport validation. Real process tests establish termination and cleanup. |
| T06 | Domain: T02 saved-document structure; platform/workspace: storage and export operations and DTOs. | Reuse domain outputs; generate storage DTO outputs with their owner. Check codec, native serialization and file-operation boundaries. YAML restrictions, atomic replacement and cleanup remain runtime behavior. |
| T07 | Workspace: caller-visible load state and outcome data. | Register workspace declarations and schemas; check public workflow data and consumers. Gherkin and boundary notes retain UI outcomes; behavior tests establish asynchronous lifecycle and keyboard behavior. |
| T08 | Review all affected sources, entrypoint registration and component links. | Run generated-output consistency and implementation conformance checks for the complete candidate; add no parallel handwritten structural contract. |

Current generated declarations live under
[`src/domain/generated/`](https://github.com/tomer-mayara/choom/tree/58c7fe4778df6aa04eb50a0ad548c5097547b8de/src/domain/generated) and
[`src/platform/generated/`](https://github.com/tomer-mayara/choom/tree/58c7fe4778df6aa04eb50a0ad548c5097547b8de/src/platform/generated); the structural schema
is [`contracts.schema.json`](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/interfaces/generated/contracts.schema.json).
Extend the binding's configured output owners when new workspace types need an
output location. Later contract tickets must run `bun run contracts:generate`,
review source/output changes, then run `bun run check:contracts`. Native Rust
serialization needs explicit contract cases; TypeScript compilation cannot
establish it.

## Constraint assessment

| Constraint | T01 assessment |
| --- | --- |
| Behavioral | New linked Cucumber features and executable drivers; retain existing characterization. |
| Observability (OpenSLO) | No artifact change. Stages and success/failure/cancellation are specified; the shared Service remains unmeasured. |
| Architecture (dependency-cruiser configuration) | No artifact change. T01 adds no production boundary, import dependency or native grant. Test drivers stay outside application code. |
| Interface (TypeSpec) | No source/generated-output change. This map identifies later contracts and conformance work. Vendor report/configuration contracts remain vendor-owned. |

## Verification record

Local verification on 2026-11-06 used macOS 27.0.1 arm64. The host provides Bun
1.4.3, Node 24.20.0, and Rust 1.99.1. The repository pins Bun 1.4.4, Node 26.13.0,
and Rust 1.99.1. The results below do not establish a run with the pinned Bun and
Node versions. In particular, the Linux packaged runner requires pinned Node;
the host Node also falls outside WebdriverIO 10.2.0's supported engine range.

| Check | Expected interpretation | Recorded result |
| --- | --- | --- |
| Feature parsing, plan-text comparison and component links | Original eight Features remain 51 definitions / 103 cases; the installed picker smoke adds one definition/case for nine Features / 52 definitions / 104 cases. All are owned and registered. | The original eight Feature bodies match the plan exactly. Both plan YAML examples and the saved-document fixture parse. Local documentation links resolve. Cucumber dry-runs and `check:cookbook` pass. |
| New browser scenarios | New behavior is expected to fail before implementation; steps must be defined and executable. Passing starter/picker cases are retained characterization. | Final full browser run: 103 scenarios, 6 passed and 97 failed. The CR-001 subset is 99 cases: 2 retained cases passed and 97 failed on absent public actions (64 Load Repo, 33 Open Diagram). No undefined, ambiguous, or unexpected failures. |
| Existing native and browser characterization | Retained behavior is expected to stay green. A red baseline requires investigation, not a rewritten expectation. | Before changes and on the final candidate: all 5 Bun unit tests, 21 browser-free Cucumber scenarios, and 4 existing browser scenarios passed. |
| Packaged route | Exercise real installed application boundaries where available; record build, OS, driver and limitations. | `bun run desktop:build` produced the macOS release app and DMG. Linux runner help succeeds; invocation on this Mac reports setup failure with exit 2. Linux and Windows execution remain unverified. |
| Installed picker smoke | Must pass per platform before missing Load Repo counts as native feature-red; unavailable or unexecuted is not a pass. | Manual macOS baseline passed after the user unlocked the desktop: installed startup, all three example cards and both arrows, example close, real directory selection, and cancellation after navigating elsewhere preserving Atlas. Load Repo and Open Diagram are visibly absent in that same build. The Linux automated smoke remains unexecuted locally. |
| Complete candidate checks | Record relevant repository checks and the full habit scan; report remaining findings and keep snoozes empty. | `bun run check` passes, including lint, unit/native behavior, manifest links, TypeSpec compilation/output/conformance (23 interface tests), type checks, dependency rules, unused-code and duplication checks. `bun run habit-hooks --all` passes with no findings; snoozes remain `[]`. Frozen dependency installation, workflow YAML, all 16 shell blocks, constraint-runner syntax/help, and whitespace checks pass. |

Browser JSON, failure screenshots, and traces are retained locally under
`test-results/`; CI archives them on failure. The final browser command was
`bun run test:e2e --parallel 4 --format json:test-results/cr-001/browser-final.json`.
Its exit code is 1 because the new features are absent. That report and
`browser-summary.json` classify the failures; `check-final.log` and
`habit-hooks-final.log` retain the passing complete-candidate checks. The required
CI route includes the new scenarios and therefore remains red during this draft.
Native artifact identity is retained
in `test-results/cr-001/native-manual/artifact.json`: Choom 0.1.0, bundle
`com.tomermayara.choom`, executable SHA-256
`17ada340a484fcfb6cf347111adbaccf74de96a42d289ef815eb55fe474ed135`.
The test copy is outside the checkout; the existing application was not changed.
The frontend build reports its existing bundle-size warning. Build success does
not verify native UI behavior or runtime discovery. The subsequent manual check
used the native operating-system picker and real IPC, without transport doubles.
Its observations are retained in `test-results/cr-001/native-manual/observations.md`;
the interactive tool transcript contains the screenshots and accessibility
observations. Runtime discovery, analysis, export, file faults, and process
cancellation remain unverified native behavior. This record covers local checks;
remote CI results must be assessed separately.

Use the browser-free, browser and packaged profiles separately. A packaged driver
must report setup limits explicitly; an absent application, unsupported driver,
or unavailable platform is not passing native acceptance. Instrumented tests and
transport doubles do not replace installed-release evidence. Retain results for
every claimed Linux/macOS/Windows build. T01 remains part of the ordered draft;
new required scenarios must be green before merge, with human approval of changed
constraint artifacts and complete-candidate review.
