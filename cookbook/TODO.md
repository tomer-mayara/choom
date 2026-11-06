# Evidence and remaining work

Passing checks support only the outcomes they exercise. Source inspection,
configuration validation, and builds do not establish behavior or production
reliability. All components share the unmeasured
[OpenSLO Service](observability/service.yaml).

| Component | Local evidence | Production prerequisites |
| --- | --- | --- |
| Workspace UI and layout | Browser Cucumber checks the landing screen, diagram labels and two directed edges, close/reopen, and page errors against a production build. With a Tauri IPC double, it checks the App's displayed path, pending button, cancellation, failure alert, and retry. | Run the browser journey against released web builds; retain reports by version. Add scheduled probes and a result store before using them as production evidence. |
| Architecture model | Cucumber calls the exported Zod schema with accepted and rejected graphs. Bun tests cover model rules and starter layout positions. | The app parses only its built-in starter graph. Invalid-input tests remain release constraints until a real input boundary exists; measure outcomes there if one is added. |
| Desktop adapter | Cucumber calls the real adapter and dialog package through Tauri's IPC mock for browser absence, options, selection, cancellation, and rejection. Browser checks exercise the App's caller through an IPC double. | Exercise the released packaged app with an operating system dialog driver on each supported platform. Mocked IPC does not establish native plugin execution or permissions. |
| Native shell | Cargo and Tauri checks cover compilation and configuration. No packaged behavior is exercised. | Add packaged acceptance for startup, directory selection/cancellation, capability denial, and dialog failure on each supported platform. Retain results by platform and version. |

## Local characterization still to add

These checks can be developed locally; they are not blocked on production
infrastructure.

- [ ] Add controlled lazy-load and ELK fault drivers. Check both loading messages,
  layout rejection, closing while work is pending, and reopening after failure.
  A rejected dynamic import has no app error boundary today; specify recovery
  separately if it is required.
- [ ] Expand graph contract cases where useful, including missing and wrong-type
  fields. The UI has no graph import. Establish a workload before adding
  large-graph resource limits or layout timing targets.

## Native and production work

- [ ] Add the packaged desktop driver and native fault harness described above.
  Check that cancellation retains the displayed selection and pending work
  disables another request through the assembled application.
- [ ] Establish a released build, collection route, and measurement baseline for
  each production claim. There is no configured probe scheduler, telemetry sink,
  or agreed objective. Define any SLI, SLO, window, or alert only after those
  prerequisites exist. Distinguish cancellation from picker failure and never
  use selected directory paths as telemetry labels.

No production instrumentation is added by this bootstrap. A collector, new
input boundary, or recovery behavior needs its own behavior-first change.
