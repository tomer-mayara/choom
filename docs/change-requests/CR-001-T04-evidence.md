# CR-001-T04: Completed dependency-cruiser reports

Historical record for the repository-analysis app, replaced in the frontend
by BV-03. Source and constraint links use saved revisions; results and line
references describe the candidates stated below. See the
[baseline viewer plan](../design/cr-baseline-viewer-plan.md) for current work.

Implementation and review evidence for
[CR-001-T04](CR-001-architecture-import.md#cr-001-t04--convert-completed-dependency-cruiser-reports).
Work started from merged T03 commit `8737715` on `codex/cr-001-t04`.

## Result and ownership

[`DepCruiserReportConverter`](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/src/architecture/dependency-cruiser/converter.ts)
converts completed dependency-cruiser 18.7.2 JSON reports into neutral
observations and calls the domain builder. It uses the injected repository path
operation from T03. It borrows the caller's session; each conversion owns its
path cache and classification state.

The class implements [`ReportConversion`](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/src/architecture/dependency-cruiser/report-conversion.ts),
an asynchronous TypeScript binding derived from the existing TypeSpec operation.
This gives T05 an explicit converter interface to inject. The neutral
`ArchitecturalLayer` remains the boundary for replacing the analyzer.

Only declared components become diagram components. Imports from several
subdirectories share their declared owner. Canonical module inventory records
provide unique reported-file counts, including reference-only targets. Internal
package aliases and symlinks keep component ownership. Builtins, packages,
unresolved imports, and outside-root references remain diagnostic subjects.
Findings do not require a cross-component edge.

The converter preserves import flag variants, ordered cycle/via references,
rule severity, subject roles, and numeric metrics. It checks effective graph
semantics, missing-transpiler issues, source changes, and resource caps. See the
[converter contract](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/interfaces/dependency-cruiser.md) for the
supported subset and failure meanings.

## Four constraints

| Constraint | Change and evidence |
| --- | --- |
| Behavioral | Added [28 public API scenarios](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/behavior/architecture-import/t04-converter.feature) before implementation. They exercise the real converter and builder through a repository path double. The original Load Repo scenarios remain registered for the later workflow. |
| Observability | Conversion returns a neutral document or a stable failure code, stage, and safe message. Scope notes and diagnostics preserve accepted analyzer limitations. OpenSLO is unchanged: there is no collector, workload baseline, or timing objective. |
| Architecture | A new dependency-cruiser rule limits concrete analyzer imports to their collaborators and the exact named composition entrypoint planned for T05. Other workspace code, domain, platform, and UI cannot import them. No runtime dependency-cruiser package import is added. |
| Interface / contract | Added [dependency-cruiser.tsp](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/cookbook/interfaces/dependency-cruiser.tsp), generated concrete-owner declarations and structural schemas, and conformance cases for the async binding. Domain failures gain `source-changed` and `limit-exceeded`. Vendor report data retains its upstream format and a runtime subset validator. |

Component manifests link the new behavior, TypeSpec source, and contract notes.
The generator registers the concrete contract owner. No package version,
native command, capability, or UI behavior changes.

## Behavior-first development and review

The initial Cucumber run had 28 undefined scenarios before implementation.
Binding the steps then failed at the missing converter module. Focused unit
tests established the same missing-implementation failure before the converter
was added.

The real reports exposed details that synthetic graphs alone would miss:
runtime `folder` findings, synthetic folder sinks, type-only dependency tags,
and missing-transpiler warnings despite exit zero. The orphan scenario was
corrected to the pinned module-finding shape: both endpoints name its subject.

Independent review found that a synthetic folder sink can identify a local
file, and that warning text with backtick-quoted host paths escaped sanitization.
Focused regression tests reproduced these failures before the fixes. Review also
required scope notes to retain only recognized filter fields instead of copying
arbitrary configuration fields. Further regressions cover reserved metric keys
and the relative file in source-change errors. Folder and rule caps, indexed
classification, and bounded path diagnosis keep report processing bounded.
The final independent review found no remaining actionable findings.

The later interface refactor preserves conversion behavior. Existing converter
tests and API scenarios were run before the refactor to establish passing
characterization. Interface conformance now checks `ReportConversion` against
the generated operation and exercises the real converter through that type.
TypeSpec data, generated outputs, Gherkin, observability, and dependency rules
are unchanged by this refactor.
Focused converter tests, API scenarios, full checks, type checks, frontend
build, and Habit Hooks pass after the refactor. Independent review found no
actionable findings in the interface change.

## Recorded upstream evidence

The [18.7.2 fixtures](https://github.com/tomer-mayara/choom/blob/58c7fe4778df6aa04eb50a0ad548c5097547b8de/test/fixtures/dependency-cruiser/18.7.2/README.md)
include recorded JSON output, source/configuration text, symlink targets, and
recording metadata. Only the report's absolute base directory was normalized
to the portable root marker. Both the complete report and missing-SWC report were
produced by the actual pinned CLI and exited zero. Converter tests replay those
reports through the public API with a repository path double.

This establishes compatibility with the recorded vendor output. It does not
establish the production native runner, process discovery, cancellation,
configuration execution, or installed source-to-model behavior. Those are T05
and later acceptance work.

## Verification

Run on macOS arm64 with Bun 1.4.3 and Node 24.20.0. These are below the
repository pins of Bun 1.4.4 and Node 26.13.0. The pinned CI environment still
needs to confirm the results.

| Check | Result |
| --- | --- |
| T04 public API Cucumber | 28 scenarios and 98 steps pass. |
| Focused converter unit/interface cases | 40 tests pass, including real and substitute `ReportConversion` implementations, recorded reports, concurrent/reordered calls, native failures, and exact 10000-module / 50000-dependency boundaries. |
| Complete frontend candidate | `bun run check` passes: lint, 186 native unit tests, 1 DOM test, 84 native Cucumber scenarios, cookbook checks, generated-output consistency, type checks, 65 interface tests, dependency rules, unused-code checks, and duplication checks. |
| Frontend build | `bun run build` passes, including type checks. Vite retains the existing large example-chunk warning. |
| Habit Hooks | `bun run habit-hooks --all` passes. The snooze file is empty; the required independent review is complete. |
| Retained browser acceptance | 4 scenarios and 51 steps pass against the production build. |
| Original T04 browser acceptance | All 22 scenarios fail at the missing Load Repo action; no undefined or ambiguous steps. They need the later runner and UI workflow. |
| Architecture rule operation | Manual temporary repositories verify seven forbidden caller paths are rejected and the exact composition entrypoint and concrete collaborator are allowed. |
| Actual repository smoke | The pinned CLI analyzed Choom's source, and the real converter accepted its report through a temporary read-only filesystem adapter: 5 declarations, 28 reported local files, 2 relationships, and no diagnostics. This was a manual adapter, not the production runner. |
| Document hygiene | Local links, generated source/output consistency, and `git diff --check` pass. |

The browser and manual CLI evidence above comes from the initial T04 candidate.
Those checks were not repeated for the interface-only refactor; the conversion
body and UI behavior are unchanged.

Native tests and desktop packaging were not rerun in T04: native source,
commands, capabilities, and the assembled UI route are unchanged.

## Remaining limits

T05 must produce completed reports, enforce the repository working directory,
and handle process execution and cancellation. The literal working-directory
field is a producer guarantee, not proof of a process's history. T06 and T07
still own saved YAML and the Load Repo UI. The original browser import scenarios
therefore remain pending on those capabilities.

Native code and the assembled desktop route are unchanged in T04. Converter
tests use a path double; T03 provides separate real-filesystem evidence for that
boundary. No new installed import acceptance is claimed. Resource limits have
boundary fixtures but no measured large-repository baseline. Human review of
the changed constraint artifacts is required before merge.
