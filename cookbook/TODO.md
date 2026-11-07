# Evidence and remaining work

Passing checks support only the outcomes they exercise. Source inspection,
configuration validation, and builds do not establish behavior or production
reliability. All components share the unmeasured
[OpenSLO Service](observability/service.yaml).

| Component | Local evidence | Production prerequisites |
| --- | --- | --- |
| Workspace UI and layout | Browser Cucumber checks the landing screen, diagram labels and two directed edges, close/reopen, and page errors against a production build. With a Tauri IPC double, it checks the App's displayed path, pending button, cancellation, failure alert, and retry. | Run the browser journey against released web builds; retain reports by version. Add scheduled probes and a result store before using them as production evidence. |
| Architecture model | TypeSpec compilation and output checks keep generated declarations/schemas current. Interface cases compare the strict document parser and builder with the generated contract and substitute an analyzer through the neutral layer. Native Cucumber and Bun tests cover declared ownership across subdirectories, aggregation, graph rules, diagnostics, and ordering; starter characterization is retained. See [T02 evidence](../docs/change-requests/CR-001-T02-evidence.md). | The UI still uses its starter graph. T03–T05 provide discovery and analysis APIs; T06–T07 must connect saved documents and rendering to the model. Domain tests do not prove analyzer execution, cancellation, filesystem safety, or installed application behavior. |
| Desktop adapter | TypeScript conformance checks cover generated operation names, parameters, and awaited results. Cucumber calls the real adapter and dialog package through Tauri's IPC mock for browser absence, options, selection, cancellation, and rejection. Browser checks exercise the App's caller through an IPC double. | Exercise the released packaged app with an operating system dialog driver on each supported platform. Mocked IPC does not establish native plugin execution or permissions. |
| Repository discovery | Native Cucumber exercises the workspace operation through a repository access double. Unit and interface cases cover manifest interpretation, YAML limits, and generated contracts. Rust tests use real files for bounded text/path operations, and the production Tauri handlers/capability context under MockRuntime verify native serialization and ACLs. See [T03 evidence](../docs/change-requests/CR-001-T03-evidence.md). | The UI does not invoke discovery yet. Verify the assembled import route after T07 on each supported platform. MockRuntime tests and successful packaging do not prove an installed webview can complete import. |
| Completed-report conversion | Public API scenarios, unit cases, TypeSpec conformance, and recorded dependency-cruiser 18.7.2 reports cover semantic conversion through a repository path double. See [T04 evidence](../docs/change-requests/CR-001-T04-evidence.md). | T05 adds the native runner and process lifecycle evidence. Recorded reports alone do not prove source-to-model behavior or installed import; retain the distinct evidence in the T05 record. |
| Analyzer execution | Public API scenarios cover the injected strategy, job release, cancellation races, progress, and converter gating. Rust tests exercise real processes, report ownership, cleanup, native ACLs, and dependency-cruiser 18.7.2. See [T05 evidence](../docs/change-requests/CR-001-T05-evidence.md). | Run the Linux installed native-operation scenarios and Windows lifecycle tests on their target systems. Cross-compilation does not prove Windows execution. T07 must supply the ordinary UI route and repository trust notice; T08 must verify assembled import on each release platform. |
| Native shell | Cargo and Tauri checks cover compilation and configuration. Manual macOS installed checks pass for startup, the example, and native directory selection/cancellation. The Linux automated driver remains unverified locally. | Complete installed import, runtime-discovery, permission, cancellation, and file-failure evidence on each supported platform. Retain results by platform and version. |

## Local characterization still to add

These checks can be developed locally; they are not blocked on production
infrastructure.

- [ ] Add controlled lazy-load and ELK fault drivers. Check both loading messages,
  layout rejection, closing while work is pending, and reopening after failure.
  A rejected dynamic import has no app error boundary today; specify recovery
  separately if it is required.
- [ ] Establish a workload before adding large-graph resource limits or layout
  timing targets. The UI has no graph import; existing interface cases cover
  missing/wrong-type fields and structural limits without establishing a
  production workload.

TypeSpec compilation and generated-output consistency do not prove runtime
behavior. Structural schema checks supplement the graph invariants, normalization,
and operation failure cases. Repository native serialization is checked against
shared wire cases and the generated schemas. T05 adds the analyzer wire and
lifecycle checks. Future storage commands need their own boundary evidence.

## Native and production work

- [ ] Verify the [Linux installed-app driver](../docs/change-requests/CR-001-native-acceptance.md)
  added by T01 and complete native fault bindings and platform evidence.
  Linux execution is unverified on the local Mac. Manual macOS startup, example,
  and native picker selection/cancellation pass; new import actions are absent.
  See the [T01 evidence record](../docs/change-requests/CR-001-T01-evidence.md).
  Check that cancellation retains the displayed selection and pending work
  disables another request through the assembled application.
- [ ] Establish a released build, collection route, and measurement baseline for
  each production claim. There is no configured probe scheduler, telemetry sink,
  or agreed objective. Define any SLI, SLO, window, or alert only after those
  prerequisites exist. Distinguish cancellation from picker failure and never
  use selected directory paths as telemetry labels.

Contract generation and validation add no production instrumentation. A
collector, new input boundary, or recovery behavior needs its own behavior-first
change.
