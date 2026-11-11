# Evidence and remaining work

A passing check supports only the outcomes it exercises. Source inspection,
configuration validation, and a build do not establish behavior or production
reliability. Use the [baseline verification record](../docs/change-requests/BV-baseline-viewer-evidence.md)
for commands, results, tested revisions, and environment limits.

| Area | Local evidence source | Remaining work |
| --- | --- | --- |
| Baseline model | BV-01 validates the reviewed examples and checks statement shapes, references, parent cycles, and membership selectors. Generated contracts and runtime interface tests cover the public model. | BV-06 exposes every recorded field and reference; its browser and DOM checks pass. No remaining model work. |
| File input | BV-02 covers bounded YAML parsing, UTF-8 input, format versions, model errors, and explicit legacy-diagram rejection. Existing native file tests cover regular-file and identity checks. | Preserve those native checks during BV-07 removal. |
| Baseline opening | BV-03 passes browser and ordinary installed Linux opening, view preservation, cancellation, and retry checks. See the verification record for artifact identities and limits. | Repeat installed acceptance for the final BV-07 release. |
| Diagram | BV-04 through BV-06 pass hierarchy, item, relationship, details, and keyboard checks. Complete viewer measurements pass at 500 records, 2,000 links, and 16 levels. | Repeat final browser acceptance after BV-07; see the verification record for measurement scope. |
| Native shell | Rust and native contract tests check the current file boundary. The [installed acceptance guide](../docs/change-requests/BV-native-acceptance.md) defines the ordinary Linux/X11 route with an empty product `PATH`. | Retain results for each tested release and platform. BV-07 removes unused repository, analyzer, snapshot, and export operations. |
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
- [ ] BV-07: remove unused native commands and permissions, then recheck the
  assembled read-only route.
- [ ] Finish the [plan's final checks](../docs/design/cr-baseline-viewer-plan.md#final-verification),
  including representative workload limits and platform evidence. Record any
  deferred checks without treating them as passed.

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
