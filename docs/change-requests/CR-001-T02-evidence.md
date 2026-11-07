# CR-001-T02: Neutral architecture model

**Date:** 2026-11-06

**Scope:** The semantic model and analyzer-neutral interface from
[CR-001-T02](CR-001-architecture-import.md#cr-001-t02--define-the-neutral-layer-and-semantic-model).

## Result

The [builder](../../src/domain/build-architecture-document.ts) turns validated
declarations and neutral observations into a version-1 architecture document.
Only declarations create components. A component owns files throughout its
subdirectories except where a more-specific declared component owns them.
Manifest parents describe the declaration tree and do not determine ownership.

The builder counts unique local file records, excludes `node_modules`, and
aggregates imports between distinct components. Evidence preserves each file
pair and each combination of unknown, false, or true import flags. The inventory
must contain both endpoints of every internal import, including reference-only
records; missing endpoints fail instead of silently changing counts.

The shared [document validator](../../src/domain/architecture-document.ts)
checks strict version-1 structure and graph consistency, then orders collections
deterministically. It preserves reported counts in saved documents and accepts
dependency cycles. Diagnostic roles, ordered cycle/via paths, and finite metrics
remain available even without visible edges. The starter validator is unchanged.

The [ArchitecturalLayer binding](../../src/domain/architectural-layer.ts) adds a
promise result, `AbortSignal`, and progress callback to the generated data
operation. It defines an interface only. A substitute analyzer demonstrates that
the contract needs no dependency-cruiser, process, platform, or UI types.

## Four constraints

| Constraint | Assessment |
| --- | --- |
| Behavioral | Added [native Cucumber scenarios](../../cookbook/behavior/architecture-import/t02-domain.feature) before the domain implementation. They call the actual public builder and validator. The original [T02 browser scenarios](../../cookbook/behavior/architecture-import/t02-model.feature) stay registered and unchanged. |
| Observability | Added neutral progress stages and failure codes in TypeSpec. No OpenSLO change: model correctness has no measured reliability objective. No telemetry or production reliability claim is added. |
| Architecture | Retained domain isolation in the existing dependency-cruiser configuration. No new workspace, platform dependency, concrete report type, or dependency-rule exception is needed. |
| Interface / contract | Extended [architecture.tsp](../../cookbook/interfaces/architecture.tsp) with declarations, provenance, neutral observations, semantic documents, and analysis requests/outcomes. Regenerated TypeScript and JSON Schema. New object models reject unknown fields; existing starter schemas retain their behavior. Runtime and substitute-layer conformance cases use the generated contracts. |

Root and domain manifests link the new feature. The TypeScript emitter adds only
the numeric literals, integer/float64 scalars, and standard records used by this
contract. `ajv-formats`, pinned to the already installed version, is now a direct
development dependency so interface checks validate the emitted date-time format.
There is no production dependency change.
The contract explicitly uses uppercase timestamp separators, seconds 00–59,
optional fractional seconds, and `Z` or a colon-separated numeric offset. Its
pattern and date-time format agree with the runtime timestamp validator.

## Verification

The first focused Cucumber run failed because the public domain modules did not
exist. The initial unit and interface runs failed for the same missing modules.
After implementation, the focused native scenarios and model tests passed.
The native run also exposed extensionless runtime imports; explicit `.ts`
imports corrected Node ESM loading before the complete native run passed.
Independent review found a dropped reserved metric key and timestamp acceptance
that differed between TypeSpec and the runtime. Focused tests reproduced both
issues. The fixes preserve all finite metric keys safely and declare the exact
timestamp form in TypeSpec. Review confirmed both fixes with no remaining findings.

Focused commands:

```sh
bun run test:behavior:native --tags @cr-001-t02-domain
bun test ./test/unit/domain/architecture-document.test.ts ./test/unit/domain/build-architecture-document.test.ts
bun test ./test/interface/domain/architecture-document.test.ts ./test/interface/domain/architectural-layer.test.ts
```

| Check | Result |
| --- | --- |
| T02 native Cucumber | 13 scenarios and 43 steps passed. |
| Complete native Cucumber | 34 scenarios and 137 steps passed, including retained characterization. |
| Focused domain unit tests | 71 tests passed. |
| New interface tests | 22 tests passed; generated structure, real runtime acceptance, and substitute-layer data conform. |
| `bun run check` | Passed: lint, 75 native unit tests, 1 DOM unit test, 34 native Cucumber scenarios, cookbook validation, TypeSpec compilation/output checks, type checks, 45 interface cases, dependency boundaries, unused-code checks, and duplication checks. |
| `bun run check-types` | Passed. Also runs inside the complete check and build. |
| `bun run test:e2e --tags 'not @cr-001'` | Passed: a fresh production build and all 4 retained browser scenarios, with 51 steps. Vite still reports the existing large preview chunk warning. |
| Original T02 browser cases | Ran `bun scripts/run-browser-behavior.ts --tags @cr-001-t02` against that build. All 18 fail at missing import actions: 6 require Load Repo and 12 require Open Diagram. No undefined or ambiguous steps. These workflows need later tickets. |
| `bun run habit-hooks --all` | Passed on the complete candidate; snooze file remains empty. |
| Review and document inspection | Complete candidate reviewed; local Markdown links and `git diff --check` pass. |

The local Mac used Bun 1.4.3 and Node 24.20.0, below the repository's pinned Bun
1.4.4 and Node 26.13.0. The passing local results do not establish results on the
pinned CI runtimes. No dependency versions were changed to work around this limit.

## Limits and remaining tickets

T03–T07 still own manifest discovery, dependency-cruiser execution/conversion,
native cancellation and progress lifecycles, YAML syntax and storage, and the UI.
Original browser scenarios that require Load Repo or Open Diagram therefore
remain expected failures. They were not removed, skipped, or replaced by the
native scenarios. A direct document fixture in an interface test is not a YAML
codec or an end-to-end workflow test.

The domain checks normalized repository-relative paths. Native canonicalization
and symlink containment belong to discovery/conversion. Conversion must sanitize
diagnostic messages and external references before they reach the builder; the
model does not know the source repository's absolute location. The substitute
test proves the contract can be implemented independently, not that native
process execution, cancellation, or progress ordering already works.

This ticket changes no Rust or assembled desktop route. Native packaging and
installed-app acceptance remain separate requirements for the later tickets.
Human review of the changed constraint artifacts is still required before merge.
