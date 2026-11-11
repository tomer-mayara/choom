# R02: published workspace ownership

Historical record for the repository-analysis app, replaced in the frontend
by BV-03. Source and constraint links use saved revisions; results and line
references describe the candidates stated below. See the
[baseline viewer plan](../design/cr-baseline-viewer-plan.md) for current work.

Date: 7 November 2026. Base: R01 commit
`5059e48c3a36464072ca150b0a05aee5a1d14796`. This implements R02 in the
[agreed plan](2026-11-07-agreed-refactoring-plan.md).

## Result

The workflow owns a copied, frozen document and layout before committing a new
view. It freezes each state envelope and owns its scalar outcomes. Unchanged
outcomes and the current graph retain their identity through later publications.
Repeated snapshot reads return the same object until a notification. References
retained by collaborators remain mutable and cannot change the committed copy.
If copying fails, the candidate is released and the previous diagram remains.

React consumes the structural `WorkflowView` role. Composition retains disposal
and exporter cleanup notifications. React Flow receives separate position records;
the saved document and generated data shapes are unchanged. No lifecycle owner,
component declaration, document limit, or cancellation rule moved.

## Constraints

| Constraint | Treatment |
| --- | --- |
| Behavioral | Added the `@r02` observer scenario in [T07 API](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t07-api.feature), then failing alias tests before implementation. Existing cleanup, cancellation, export, and multiple-directory ownership checks remain. |
| Observability | Stage, outcome, duration units, and safe messages are unchanged. OpenSLO remains unmeasured. |
| Architecture | Publication mechanics stay beside the workflow. The view role has no runtime dependency on the workflow or platform. R04 will enforce its exact imports. |
| Interface / TypeSpec | Generated commands supply the view operations. Added structural role and nested read-only conformance checks and updated the [live binding contract](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/interfaces/workspace.md). YAML and IPC contracts are unchanged. |

## Behavior and local checks

The new Gherkin failed against the base: an observer changed cleanup recovery
from `retry` to `none`. Five focused mutation/alias tests failed; the existing
stable-snapshot test passed. The new scenario and tests passed after the fix.
An independent review also caught two existing outcome-identity regressions;
both passed after preserving already-owned outcomes, without changing their
assertions. A later test covers publication-copy failure before resource transfer.

Checks use the repository's pinned Bun 1.4.4 and Node 26.13.0 on macOS arm64.

| Check | Result |
| --- | --- |
| `bun run check` | Passed: 342 native unit tests, 17 DOM tests, 158 Cucumber scenarios / 730 steps, 85 interface tests, lint, TypeSpec consistency, cookbook, dependency, unused-code, and duplication checks. |
| `bun run check-types` | Passed. |
| `bun run test:e2e` | Passed: frontend build, 104 browser scenarios / 856 steps, including React Flow rendering and portable-document journeys. Existing chunk-size and browser-fixture static/dynamic import warnings remain. |
| `bun run habit-hooks --all` | Passed; snooze file remains empty. |
| Independent focused review | Passed: 22 native/interface tests and seven DOM tests; no remaining actionable finding. |

Focused commands:

```sh
bun run test:behavior:native --tags @r02
bun test ./test/unit/architecture/load-workflow-publication.test.ts ./test/unit/architecture/load-workflow-cleanup.test.ts ./test/unit/documents ./test/interface/architecture/load-workflow.test.ts
bun run test:dom
bun run test:e2e
```

## Publication cost

Three fresh Bun processes per workload ran before and after the change, serially
with no other validation running. Each workload uses the valid document fixture,
one relationship with unique source files, and the real YAML encoder/decoder.
The source component's reported file count matches the evidence count. The
near-limit case adds a scope note to approach the 16 MiB byte limit while staying
within the existing structural limit. Both documents loaded successfully.

Layout is held at a promise gate, then returns three prepared positions. Commit
time runs from releasing that gate to the first publication containing the new
view. It includes publication work, but excludes YAML decoding and ELK. Each
process then checks 100,000 snapshot reads for unchanged identity. RSS is sampled
around the commit; macOS `/usr/bin/time -l` records whole-process peak RSS,
including fixture generation and decoding. Memory values are MiB.

| Workload | YAML bytes | Median commit before → after | Commit range after | Median peak RSS before → after | Peak RSS range after |
| --- | ---: | ---: | ---: | ---: | ---: |
| 6,000 evidence pairs | 894,055 | 0.048 → 10.924 ms | 10.211–12.730 ms | 178.6 → 184.9 | 184.5–187.6 |
| 24,000 evidence pairs, near byte limit | 16,699,988 | 0.041 → 46.427 ms | 46.285–48.361 ms | 488.1 → 516.3 | 501.0–541.4 |

RSS growth around commit was 4.8–6.5 MiB for the large case and 5.6–40.6 MiB for
the near-limit case, compared with approximately zero before. RSS depends on GC
and allocator reuse; these samples are not retained-heap measurements. The
100,000 reads took a median 0.739 ms and 0.749 ms after the change, respectively.
Unit coverage also confirms that later state updates reuse the same graph.

The copy adds a bounded synchronous cost once per successful commit. These Bun
measurements do not establish a WebKit frame-time budget, a worst-case heap
bound, or a production SLO. They support retaining the existing input limits;
they do not justify a claim that freezing is free. Review peak memory again if
document limits increase.

## Platform scope

The draft PR records current CI results. Installed
Linux acceptance must pass on this candidate to verify the assembled desktop
route. macOS and Windows CI compilation and Rust checks do not establish installed
UI acceptance. The launcher/runtime-discovery and native UI limits in the
[T08 evidence](../change-requests/CR-001-T08-evidence.md) remain separate.
