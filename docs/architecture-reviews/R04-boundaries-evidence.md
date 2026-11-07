# R04: enforce import responsibilities

Date: 7 November 2026. Base: R03 commit
`6f3ecbccd118a64e29cf616f93ace690492e1bd7`. This implements R04 in the
[agreed plan](2026-11-07-agreed-refactoring-plan.md).

## Result

The [dependency rules](../../.dependency-cruiser.cjs) now cover application
responsibility directories, including helpers with names other than `load-*`.
The [probe command](../../scripts/check-dependency-boundaries.ts) exercises
allowed and forbidden imports in temporary projects, then the existing command
checks the real frontend graph. CI already runs `check:dependencies`, so the
probes are enforced there too. No production source file moved or changed.

| Owner | Direct import constraint |
| --- | --- |
| Application workflow, discovery, and document lifecycle | No UI, reverse composition, or Node built-in imports. External package imports are limited to YAML and Zod. Named composition modules and the vendor implementation have separate roles. |
| Platform access from application code | Only the exact generated platform contract module, plus the repository-access module for discovery and document-access module for document lifecycle. These imports must be erased. |
| Semantic domain | Own modules and Zod only. |
| YAML codec | Own helpers, the exact generated format contract, semantic domain, and YAML only. Other `lib/` and generated files are not blanket exceptions. |
| Workspace view | Exact workflow/domain data types, read-only projection, document export result, and layout types. Every import must be erased. |
| React components | Workspace view and generated workflow data; no direct workflow, document lifecycle, or platform access. Diagram/details retain the stricter prepared-data rule. |
| App composition | Workspace construction and the retained directory picker remain allowed. |
| Concrete analyzer | Construction stays at its named factory; vendor collaboration remains inside its folder. |

These are resolved-module, direct-edge checks. They do not distinguish individual
exported symbols or prove all transitive behavior. The real graph, cycle checks,
runtime contracts, and behavior tests remain separate evidence. Cargo and Tauri
continue to govern native code.

## Type-import precision and recorded metadata

`tsPreCompilationDeps: "specify"` asks dependency-cruiser to distinguish erased
imports from retained imports. Narrow type exceptions require the
`pre-compilation-only` classification; missing classification does not grant an
exception. In the pinned toolchain, `import type` and a type-query import erase,
while `import { type X }` retains an empty module import. Probes check that
distinction as well as the specific rejecting rule.

This configuration change intentionally makes Choom's self-analysis record
explicit `preCompilationOnly: true` or `false`, where previous reports could
omit that fact. The converter already supports both values and preserves them.
It does not turn an unreported flag into false for other repositories. The YAML
v1 shape and TypeSpec contracts are unchanged.

## Constraints

| Constraint | Treatment |
| --- | --- |
| Behavioral | Product behavior is unchanged. Existing portable-document and multi-directory ownership scenarios remain. Operational probes verify configuration; no product tests were added for tooling. |
| Observability | Production stages, outcomes, and unmeasured OpenSLO are unchanged. Static rule violations are not a production SLI. |
| Architecture | Changed rules and exact exceptions are listed above. Existing component declarations and artifact paths remain valid. |
| Interface / TypeSpec | No source or generated contract changes. Type imports still follow the intended direction; explicit report flags use the existing converter contract. |

## Verification method

Run the complete operation with the pinned Bun 1.4.4 and Node 26.13.0:

```sh
bun run check:dependencies
bun run check:contracts
bun run check:cookbook
bun run habit-hooks --all
```

The probe script uses the actual repository rules and TypeScript options with
small temporary source files and package stubs. It verifies each resolved edge,
its import metadata, and the expected rule's error. Allowed edges must have no
violation. It does not treat a zero JSON-reporter exit status as proof that rules
passed. Temporary files are removed even on failure.

The final probes cover 23 allowed and 33 forbidden edges. They include an
arbitrarily named workflow helper, exact generated-file exceptions, concrete
analyzer construction, renderer restrictions, and both erased and retained type
import forms. A real `node:fs` import verifies built-in resolution and metadata;
no fake built-in file is created. A temporary downgrade of an enforced rule from
error to warning made the runner fail at the expected edge.

The real report contains 71 modules and 205 edges, with 85 erased and 120 retained
imports and no omitted pre-compilation flags. A read-only repository-path adapter
fed this report to the real converter. Conversion succeeded with 55 evidence
pairs, 37 erased and 18 retained variants, no omitted flags, and no diagnostics.
The analysis scope records `tsPreCompilationDeps: "specify"`.

| Check | Result |
| --- | --- |
| `bun run check` | Passed: 344 native unit tests, 17 DOM tests, 158 scenarios / 730 steps, 85 interface tests, all 56 import probes, the real dependency graph, and static/cookbook/contract checks. |
| `bun run check-types` and `bun run build` | Passed. Existing deferred-chunk size warnings remain. |
| Existing portable-document coverage | T06 API: 19 scenarios / 100 steps passed. Focused source-free browser reopening: one scenario / nine steps passed. These are retained behavior checks, not tests of configuration code. |
| Independent review | Re-ran all probes and the real graph; direct built-in and inline-type gaps are closed, with no remaining actionable finding. |
| `bun run habit-hooks --all` | Passed; snooze file remains empty. |

The draft PR records current CI results. Installed UI and launcher-environment
limits remain as recorded in [T08](../change-requests/CR-001-T08-evidence.md).
