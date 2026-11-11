# CR-001-T07 implementation and verification

Historical record for the repository-analysis app, replaced in the frontend
by BV-03. Source and constraint links use saved revisions; results and line
references describe the candidates stated below. See the
[baseline viewer plan](../design/cr-baseline-viewer-plan.md) for current work.

Date: 2026-11-07. Base: `3022acd`, the merged T06 change. Candidate branch:
`codex/cr-001-t07`. Verification ran before commit; the production source
manifest below identifies the exact source used for the platform builds.

## Result and constraints

Desktop **Load Repo** and desktop/browser **Open Diagram** now share one load
controller. It owns selection, discovery, analysis, candidate validation, layout,
commit, cancellation, and cleanup recovery. Failures before commit preserve the
current diagram. Late cancelled work cannot replace a newer document. A failed
superseded-snapshot cleanup preserves the successful new view and gates later
loads. Unconfirmed analyzer or discovery cleanup requires restart.

React Flow renders the declared component set and prepared positions. One
component can own several subdirectories. Counts, isolated declarations,
zero-file labels, complete file evidence and variants, findings, and recorded
provenance remain available as text as well as through the canvas.

Export captures its starting bytes independently of another load. Desktop first
tries without replacement, then obtains explicit consent if a destination
exists. Browser uses the same codec for its YAML download. Export cleanup
failure uses the controller's cleanup gate without replacing its load outcome.

The four cookbook constraints are covered:

- Behavior: retained starter scenarios, T01–T07 browser scenarios, new controller
  API and dialog Gherkin, and focused unit/DOM regressions.
- Observability: local stages, safe error codes/messages, durations, cancellation,
  and cleanup recovery. The shared OpenSLO remains unmeasured; no collector,
  production latency claim, or new SLO is introduced.
- Architecture: named controller and renderer rules preserve neutral injection
  and rendering of prepared data. Only native save and message dialog grants
  are added, restricted to the main window.
- Interface: workflow state/outcomes and dialog operations are authored in
  TypeSpec, with generated outputs and implementation conformance. Discovery
  now reports `cleanup-failed` explicitly instead of requiring callers to parse
  error prose. Live signals, callbacks, browser files, and layout remain in the
  TypeScript binding.

Errors now identify the failing declaration, document rule, or unsupported
report option through fixed safe messages. Validation rules remain strict;
raw parser errors, configuration values, and host paths are not exposed.

## Behavior-first evidence and review

The initial browser run had 4 retained scenarios passing and all 15 original
T07 scenarios failing on absent Load Repo/Open Diagram controls. Controller,
dialog, renderer, layout, and browser-file tests were recorded red before their
implementations. Export replacement tests failed before the consent callback
was added. New cleanup and cancellation cases were added before their fixes.

Installed Linux acceptance found that a denied repository read produced a
generic manifest error. Three red-then-green cases now cover permission refusal
while opening, reading, and resolving a repository. Discovery identifies denied
access, releases any opened session, and excludes raw paths from the message.
The same installed run exposed GTK picker details in the test driver: file
locations need inline completion accepted, and Save selects only the filename
stem. The driver now replaces the entire filename and waits for the declared
cards before exporting. Exact file paths and evidence assertions remain intact.

Independent review found and resolved three issues:

- Cancel disappeared during a pending precommit repository close. API, unit,
  and DOM regressions failed first and now confirm cancellation remains
  available and waits for release without committing the candidate.
- SIGINT during the browser runner's controlled build still started Cucumber.
  Manual startup and active-run interruption checks now exit 130, remove the
  temporary build, and leave no owned processes.
- The documented dialog tag selected no dialog scenarios. The feature now
  carries the intended ticket tag; the focused command runs 31 scenarios.

The independent reviewer found no remaining code issues and separately passed
61 controller, interface, document, and layout tests with 320 assertions.
The reviewer also passed the three permission cases and found no new issues in
the final permission mapping or GTK test-driver changes. Manager review included
the complete candidate and the React review checklist.
Human approval of changed constraint artifacts remains required before merge.

## Local checks

| Check | Result |
| --- | --- |
| `bun run check` | Passed: lint, 327 native unit tests, 16 DOM tests, 156 Cucumber scenarios / 716 steps, cookbook links, contracts, dependency boundaries, unused code, and duplicate checks. |
| `bun run check:contracts` | Passed: TypeSpec formatting/compilation, generated-output consistency, TypeScript, and 84 interface tests. Included in the complete check. `bun run check-types` also passed after the permission fix. |
| `bun run test:e2e` | Passed: 104 scenarios / 856 steps against the corrected production candidate and the isolated layout-control entry. |
| Focused T07 API/dialog command in README | Passed: 31 scenarios / 229 steps. |
| `bun run test:rust` | Passed: 49 unit and 16 integration tests. |
| `bun run desktop:lint` | Cargo formatting and Clippy passed. |
| `bun run habit-hooks --all` | Passed; snooze file remains empty. |
| Frontend and macOS package build | Passed. The ordinary app and DMG embed the freshly verified production frontend. |
| Chromium visual checks | Three declared cards, one import, accessible details, no page errors; resize from 1280 to 390 pixels keeps the diagram fitted, and the component table supports keyboard scrolling. |

Host tools: Bun 1.4.3, Node 24.20.0, Rust 1.99.1, macOS 27.0.1 arm64.
The host Bun/Node versions differ from the repository's tool pins. Linux
verification uses the pinned Bun 1.4.4 and Node 26.13.0.

Browser desktop scenarios validate public native requests and outcomes and use
real fixture filesystem operations, recorded dependency-cruiser 18.7.2 reports,
and the production conversion/codec/controller. They do not synthesize the
resulting Choom document. Delay and failure controls require observations at
the actual boundary. Only layout-controlled cases use a separate test entry;
production `dist` contains no test hooks. These runs do not establish native
process, permission, or filesystem behavior.

Machine-local logs are `/tmp/choom-t07-check.log`,
`/tmp/choom-t07-browser-final.log`, `/tmp/choom-t07-rust.log`,
`/tmp/choom-t07-native-lint.log`, `/tmp/choom-t07-habit.log`, and
`/tmp/choom-t07-macos-build-final.log`. Browser failure artifacts and traces
remain under `test-results/`; the acceptance worker's full pass is also recorded
in `reports/t07-browser-acceptance.log`.

## Installed-platform evidence

Linux installed acceptance passed on the final ordinary arm64 `.deb`, installed
as `/usr/bin/choom-desktop` outside the checkout. The installed executable matches
the executable extracted from the package. The app ran as an unprivileged user
under Xvfb and a fresh D-Bus session with `GTK_USE_PORTAL=0`. Repository fixtures
used an independently prepared dependency-cruiser 18.7.2 and TypeScript 6.0.2
tree. No IPC replacement, report injection, or application WebDriver plugin was
used. The source-free browser consumer used the ordinary production frontend.

| Installed suite | Result | Evidence directory |
| --- | --- | --- |
| `@packaged-smoke` | 1 scenario / 6 steps passed | `runs/run-eYol8u` |
| `@packaged-native-analysis` | 3 scenarios / 24 steps passed | `runs/run-fvu9cX` |
| `@packaged-native-documents` | 4 scenarios / 23 steps passed | `runs/run-uGg7ai` |
| `@cr-001-t08` | 4 scenarios / 34 steps passed | `runs/run-rmMTeo` |

The T08 cases exercise Load Repo, native save selection, exact declared cards,
and two evidence pairs owned by the same component across subdirectories. The
export reopens in both the browser and a fresh installed desktop viewer after
the source repository is removed. A real permission refusal preserves the
previous diagram and identifies denied repository access. The earlier operation
suites also retain actual process cancellation, report cleanup, replacement
consent, and bounded candidate-storage checks.

| Final Linux artifact | SHA-256 |
| --- | --- |
| `Choom_0.1.0_arm64.deb` | `a623510d62cae8dceb56e8096b7ff6effe5ccfdf6bc04613185870a9ceece40b` |
| `/usr/bin/choom-desktop` | `457d8a5e3bbdcb8463b3d4464f421abc535e897c582186eed35390da059edb38` |
| Production source manifest | `2492845fdf9a56b133d30c8c7cf946547330c10ba3a4cceac6771b68e32fe01b` |

The declared build ID is `cr-001-t07-3022acd-working-tree-2492845fdf9a`.
The package, source manifest, final logs, `run.json` records, and screenshots are
retained under `/tmp/choom-t07-linux-evidence`; earlier candidate evidence is
retained separately. The test package is not a signed distribution release.
This controlled X11 launch does not establish desktop-entry runtime discovery,
Wayland, or portal behavior. The remaining T08 release review is still required.

The final macOS app was built with the ordinary `bun run desktop:build` command
and installed outside the checkout at `/tmp/choom-t07-macos-final/Choom.app`.
Its production source manifest matches the final Linux candidate. The earlier
UI-tool failure (`noWindowsAvailable` and an unavailable confirmation action)
cleared after the user brought Choom forward; no picker code or dependency
change was needed. The final binary then passed these real native UI checks:

| Action | Observed result |
| --- | --- |
| Launch the installed app | Desktop badge, Load Repo/Open Diagram, disabled export, and repository trust notice. |
| Load the independent Atlas fixture through the native directory picker | Three declared cards (`.`, `src`, `packages/core`), one `src → packages/core` arrow, file counts 0/2/1, and dependency-cruiser 18.7.2 provenance. |
| Export through the native save picker | “Exported ‘Atlas’” and the exact selected YAML file on disk. |
| Open Diagram, then cancel the native picker | “Load cancelled”, enabled load controls, and the same Atlas diagram. |
| Quit, move the fixture and its local analyzer away, launch a fresh app, and open the export | Same components, arrow, counts, recorded timestamp, and both evidence pairs; no repository selection or analysis. |
| Expand the import details | `src/components/panel.ts` and `src/lib/format.ts` both point to `packages/core/model/entity.ts`; the UI retains unknown type-only/pre-compilation flags and `dynamic: false`. |

The exported file is `/tmp/choom-t07-macos-export.choom.yaml` (1,188 bytes), with
SHA-256 `27bfa71751717de2fc4dd3e5f4ea32c99ee67ae738a33fd8d344a0f52feaee24`.
The production codec also accepts these exact bytes and verifies the three
component IDs, one relationship, and two evidence pairs. The original fixture
path is absent; its files are retained at
`/tmp/choom-t07-macos-fixture-archived`. UI observations and screenshots are in
the computer-use trace; codec results are in
`/tmp/choom-t07-macos-export-validation.log`. The final installed process path
was checked before quitting and after restarting to distinguish it from the
earlier test installation.

| Final macOS artifact | SHA-256 |
| --- | --- |
| `Choom_0.1.0_aarch64.dmg` | `20174de35e551ef1a4fe2921f2b047c991c485b4bf6afec04f05163951ecad6c` |
| `Choom.app/Contents/MacOS/choom` | `121a3b9f23fdb6f3091aa87439990b4fa67e7ecabecb39f97319d8091fae09ee` |

The binary is linker ad-hoc signed with no TeamIdentifier or notarization.
Build, source, signing, and artifact records are retained in
`/tmp/choom-t07-macos-build-final.log`,
`/tmp/choom-t07-macos-final-source.sha256`,
`/tmp/choom-t07-macos-final-codesign.log`, and
`/tmp/choom-t07-macos-artifacts.sha256`.

Windows execution is not available on this host. T08 retains the release review
and the remaining platform-specific native journeys, including launcher runtime
discovery and fault paths. Compilation and mocked IPC do not replace those checks.
