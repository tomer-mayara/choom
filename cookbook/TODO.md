# Evidence and remaining work

A passing check supports only the outcomes it exercises. Source inspection,
configuration validation, and a build do not establish behavior or production
reliability. Use the [baseline verification record](../docs/change-requests/BV-baseline-viewer-evidence.md)
for commands, results, tested revisions, and environment limits.

| Area | Local evidence source | Remaining work |
| --- | --- | --- |
| Baseline model | BV-01 checks the model and reviewed examples. BV-06 exposes every recorded field and reference; its browser and DOM checks pass. | No remaining model implementation work. |
| File input | BV-02 covers bounded YAML parsing, UTF-8 input, format versions, model errors, and legacy rejection. BV-07 retains native file-type, byte, identity, and UTF-8 checks. | No remaining file-input implementation work. |
| Baseline opening | The final browser suite and ordinary installed Linux release pass opening, view preservation, cancellation, and retry checks. | Installed macOS, Windows, Wayland, and portal observations remain separate platform work. |
| Diagram | The final browser suite passes hierarchy, relationships, full details, and keyboard checks. Measurements retain 500 records, 2,000 links, and 16 levels. | See the verification record for workload and timing limits. |
| Native shell | Eight Rust tests and 18 ordinary installed Linux scenarios pass. All 13 retired commands are unavailable; the final release opens the full baseline with an empty product `PATH`. | Complete required PR checks and human constraint review before merge. Follow the [installed acceptance guide](../docs/change-requests/BV-native-acceptance.md) for other platforms. |
| Production observations | All components share one unmeasured [OpenSLO Service](observability/service.yaml). | Define a released workload and a collection route before proposing an SLI, SLO, window, or alert. |

Browser opening tests use the actual file reader, decoder, layout, and renderer.
Controlled workflow tests can inject failures and late results. Neither those
tests nor successful packaging proves that a released native app can select and
read a file. The automated installed route supports Linux/X11. macOS and Windows
need separate installed-app evidence; an unavailable route is a limit, not a pass.

## Viewer completion

- [x] BV-04: show parent groups and enforce display limits before layout.
- [x] BV-05: show interfaces, resources, ownership, and recorded consumer links.
- [x] BV-06: expose complete record details, rules, status, references, and
  keyboard behavior. Keep structured rules as recorded data.
- [x] BV-07: remove unused native commands and permissions, then recheck the
  assembled read-only route.
- [x] Run the [plan's final local checks](../docs/design/cr-baseline-viewer-plan.md#final-verification),
  including representative workloads and installed Linux acceptance. The
  verification record states the platform and remote CI limits.
- [ ] Complete required remote checks and human review before merging the drafts.

TypeSpec compilation and generated-output checks do not prove runtime behavior.
Structural schemas supplement semantic validation and operation tests. Layout
limits do not establish usability for every baseline; use the agreed fixtures
and a measured workload to state supported limits.

## Historical evidence

[CR-001](../docs/change-requests/CR-001-architecture-import.md) and its evidence
records cover the former repository-analysis, snapshot, and export workflows.
Those results do not prove the baseline viewer. The
[earlier architecture review](../docs/architecture-reviews/2026-11-07-agreed-refactoring-plan.md)
also describes that implementation. Historical records keep their original
results and link to saved source revisions.

The [manual producer](../docs/design/app-a/start-here.md) is a separate workflow.
Its tool runs and evidence do not run when the app opens a baseline.
