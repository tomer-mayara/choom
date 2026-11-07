# CR-001: Import repository architecture through an Architectural Layer

**Status:** In progress — T01–T07 merged; T08 verification and constraint review in progress

**Date:** 2026-11-06

**Scope:** Desktop repository analysis; desktop and browser saved-document viewing

## Problem and result

Choom displays a starter diagram and can select a desktop directory. It cannot
read repository architecture or open a saved diagram. **Load Repo** will accept
a repository root, follow its component manifests, run dependency-cruiser, write
a portable `.choom.yaml` document, and display its internal component graph.
**Open Diagram** will display that document in desktop or browser without the
source repository, Node, or dependency-cruiser.

The accepted requirements include an explicit, neutral **ArchitecturalLayer**
Strategy with an injected runner and parser/converter, and manifest metadata for
the enforcer and source inputs. Replacing the enforcer must not expose its report
or process details to the UI, document decoder, domain rules, or renderer. No LLM
is needed for discovery, analysis, graph conversion, or layout.

This release uses one repository-local dependency-cruiser installation and a
supported local Node runtime. It does not install dependencies, bundle a runtime
or JavaScript API bridge, run package scripts, analyze Rust or IPC, watch files,
combine analyzers, discover plugins, or analyze repositories in the browser.
Constraints for the remaining tickets are proposals; they do not approve future constraint
artifacts or authorize a merge.

## Foundation and responsibilities

Reuse the existing [domain validation approach](../../src/domain/architecture.ts),
[ELK layout](../../src/lib/layout.ts), [preview](../../src/components/architecture-preview.tsx),
and [desktop adapter](../../src/platform/desktop.ts). Preserve their retained
behavior through characterization. The [Rust host](../../src-tauri/src/lib.rs)
registers the dialog plugin and bounded repository, analyzer, and document
operations delivered by T03–T06. The current analyzer
[configuration](../../.dependency-cruiser.cjs) includes TypeScript pre-compilation
dependencies and does not follow `node_modules`.

Configuration defines analysis rules, not an observed graph; a fresh load must
run the analyzer with source inputs. React Flow's
[saved object](https://reactflow.dev/api-reference/types/react-flow-json-object)
does not define Choom's YAML contract. Keep semantic data separate from
[layout and rendering](https://reactflow.dev/learn/layouting/layouting).

```text
Load Repo -> root component.yaml -> declared component tree + analysis descriptor
         -> ArchitecturalLayer -> injected runner -> completed JSON report
                               -> injected converter -> domain builder
         -> encode YAML -> write private candidate -> read and decode -> ELK
Open Diagram ----------------------------------------> common decoder -> ELK
         -> one in-memory view commit -> React Flow
```

| Owner | Responsibility |
| --- | --- |
| `src/domain/` | Neutral layer contracts, document schema, ownership, aggregation, and graph invariants. |
| `src/architecture/load-workflow.ts` | One controller for both load actions, from selection through layout and view commit. |
| `src/architecture/workspace.ts` | Compose the controller, platform selectors, document files, neutral layer factory, and deferred ELK layout. |
| `src/architecture/create-architectural-layer.ts` | Explicit composition entrypoint; constructs the matching strategy, runner, and converter. |
| `src/architecture/dependency-cruiser/` | Concrete strategy and its execution/report collaborators. |
| `src/platform/` | Narrow Tauri operations and validated transport DTOs; no workspace or domain imports. |
| `src-tauri/src/` | Selected-root access, canonical paths, command construction, process cleanup, and controlled file writes. |
| `src/lib/` | Platform-independent YAML codec, ELK layout, and rendering projection. |
| Workspace UI | Selection, progress, diagnostics, and model-driven rendering. |

Author Choom-owned component models and operations in TypeSpec, extending the
[contract entrypoint](../../cookbook/interfaces/main.tsp). Each owner links its
sources from `component.yaml`. Generated TypeScript declarations and JSON Schema
must stay consistent with those sources; runtime validators and public
implementations need conformance checks. Keep third-party report formats and
Tauri configuration under their vendor contracts. T02 defines the neutral domain
contracts; later tickets add their concrete execution, storage, and UI bindings.

`ArchitecturalLayer.analyze(request, control)` returns a promise of a neutral
success, failure, or cancelled outcome. Success contains a validated document;
failure contains a stage, code, and useful message. The request contains an
opaque repository session, validated components, and analysis descriptor.
Control supplies cancellation and coarse progress; it is never serialized.
These contracts contain no tool, process, transport, or UI types.
TypeSpec describes the operation's data and outcome variants. TypeScript owns
the nonserialized control object and promise/callback binding; behavior tests
establish cancellation, progress, and lifecycle guarantees.

`DepCruiserArchitecturalLayer` implements the neutral contract with its injected
runner and `ReportConversion` collaborator. `DepCruiserReportConverter` implements
this asynchronous interface using the generated TypeSpec operation's request
and result types. The runner receives repository session, config, and inputs,
and returns bounded execution facts and report bytes. Native code alone builds
CLI arguments. The
strategy handles process failure and cancellation before calling the converter.
The converter accepts a **completed report plus context**, validates its shape
and supported semantics, translates neutral facts, and calls the domain builder.
It does not manage process lifetime. The domain's `ComponentCatalog` owns
declaration validation and file ownership. The builder uses the catalog for
attribution and owns aggregation and IDs. The shared document validator uses
the same catalog to check evidence ownership.

Construct the matching layer only for live analysis, outside React rendering;
saved viewing does not construct it. Use ordinary functions or callable
dependencies where sufficient; no DI container, runner
base classes, or new Bun workspace is needed. Enforce
the composition exception explicitly: UI/common code cannot import concrete
report collaborators, and platform code cannot import workspace/domain types.
Add a child manifest only where an actual component boundary warrants one.

## Manifest and discovery

Extend architecture artifact entries with `enforcer` and `inputs`. The proposed
root declaration is:

```yaml
artifacts:
  architecture:
    - path: .dependency-cruiser.cjs
      enforcer: dependency-cruiser
      inputs: [src]
    - path: src-tauri/Cargo.toml
    - path: src-tauri/capabilities/main.json
```

Version 1 requires exactly one annotated root analyzer entry, a supported
enforcer, and nonempty inputs of existing files/directories. Other artifact
entries remain valid as path-only references. Reject missing, multiple, or
unsupported analyzer declarations and shell fragments/globs; do not infer inputs
from rule patterns or package scripts. Child architecture references do not
create additional analyzer jobs. Inputs select analysis entry files/directories;
they do not declare components or change file ownership.

Read exactly `<selected-root>/component.yaml`, then follow declared children to
their manifests. Resolve references relative to their declaring manifest.
Retain contained `../` references; reject canonical/symlink escapes, duplicate
component directories or names, repeated/cyclic links, and child-name mismatches.
Do not search parents, scan for unlinked manifests, or run Choom-specific CI
artifact checks on the imported repository.

Native operations supply bounded text and path access. Workspace code parses
manifests with one browser-compatible YAML library, introduced in T03; the
existing tooling's `Bun.YAML` is unavailable in the WebView. Update the
[strict manifest validator](../../scripts/validate-components.ts),
[linking guidance](../new-feature-cookbook.md#linking-file), and root metadata
together without importing tooling into production.

Use the same native canonical-path policy for component directories and local
report files, with bounded batch normalization where needed. Classify built-ins
and unresolved references before filesystem ownership. For resolved targets,
use canonical location, not specifier spelling, to distinguish internal files
from packages. An alias or symlink to a declared in-root component stays internal;
canonical `node_modules` content stays external. Escaping
manifest references fail discovery; outside-root dependencies become tagged
diagnostic subjects, never root-owned files. If a required local path disappears
during conversion, report a source-change failure rather than inventing ownership.
The saved-document decoder performs no filesystem access.

## Portable document and graph rules

Version 1 is semantic, JSON-compatible data encoded as single-document YAML.
Reject duplicate mapping keys, custom tags, unsupported versions, unknown
semantic fields, and invalid graph data; bound parser resource use. Use one
TypeSpec data contract with a shared runtime validator at the builder and common
decoder. Generated structural schemas do not replace ownership, reference, and
aggregation invariants. The document contains:

```yaml
schemaVersion: 1
name: Example repository
analysis:
  enforcer: dependency-cruiser
  version: "18.7.2"
  config: .dependency-cruiser.cjs
  inputs: [src]
  generatedAt: "2026-11-06T12:00:00Z"
  scopeNotes: ["Entry roots select starting files; followed imports may extend beyond them."]
components:
  - {id: ., name: example-repository, reportedFiles: 0}
  - {id: packages/core, name: core, parent: ., reportedFiles: 1}
  - {id: src, name: workspace, parent: ., reportedFiles: 3}
relationships:
  - id: imports:src:packages%2Fcore
    source: src
    target: packages/core
    kind: imports
    evidence:
      - sourceFile: src/components/panel.ts
        targetFile: packages/core/model/entity.ts
        variants: [{typeOnly: false}]
      - sourceFile: src/hooks/use-model.ts
        targetFile: packages/core/model/entity.ts
        variants: [{typeOnly: false}]
      - sourceFile: src/lib/format.ts
        targetFile: packages/core/model/entity.ts
        variants: [{typeOnly: true}]
diagnostics: []
```

This example is illustrative, not a measured report. Its three declared
components cover four reported files. The workspace owns files in
`src/components`, `src/hooks`, and `src/lib`; core owns the file in
`packages/core/model`. Those ordinary directories need no component entries,
nor does the intermediate `packages` directory. The three file pairs form one
component relationship. Imports between workspace files do not add relationships.

`inputs` comes from the validated manifest, not `optionsUsed.args`.
`scopeNotes` conservatively summarize verified filters, traversal, parser/type
settings, and observable suppression or
baseline use. They do not reproduce the entire configuration.
`generatedAt` uses uppercase `T` and `Z`, seconds 00–59, optional fractional
seconds, and either `Z` or a colon-separated numeric offset. The TypeSpec pattern
and date-time format define this timestamp form; leap seconds are not stored.

Only linked component declarations establish component boundaries. Directories
do not map one-to-one to components: a declared component owns its directory and
descendant directories/files, except those owned by a more-specific explicitly
declared component. Directory existence or depth alone creates no component.
Component IDs are canonical repository-relative directory paths using `/` that
locate declaration roots; there is no redundant `path` field. Require one root
`.`, unique IDs and names, and an acyclic parent tree. Assign each internal file
to the deepest containing declared component using path segments. Root owns
remaining internal files; `node_modules` is never attributed to root.

`parent` records the linked manifest tree, which can differ from filesystem
nesting when a child reference uses `../`. It does not determine file ownership
or require intermediate directories to be components. For saved YAML, the
`components` entries are the declaration set: validate ownership against their
normalized IDs using the same deepest-containing-root rule, without filesystem
access. Evidence paths can include any number of ordinary subdirectories;
their immediate directories need no component entries. Analysis inputs and
diagnostic folders likewise need no matching component entry.

`reportedFiles` counts unique canonical local file records after assignment to
their owning component, across all of that component's subdirectories. Do not
copy analyzer folder totals or include files assigned to a deeper declared
component in its containing component's count. Saved documents retain these
counts; relationship evidence is not a complete file inventory. Those records
may include reference-only files; this is not an analyzed-file
count. Neutral observations must include both endpoints of each internal import
in that inventory. The builder rejects missing endpoints instead of inventing
records or changing counts from evidence. The converter must supply any
reference-only records needed to satisfy this precondition.
Zero means **No files reported**, not no dependencies or unsupported
analysis. Keep every declared component, including the native shell.

Aggregate imports between distinct components into one directed relationship
per source/target pair. Canonical edge IDs encode kind and escaped endpoints.
Evidence contains unique sorted file pairs whose ownership matches the edge.
Each pair retains unique sorted variants with optional boolean `typeOnly`,
`dynamic`, and `preCompilationOnly` fields. An absent flag means unknown.
Preserve mixed variants; do not OR flags or discard runtime/type-only records.
Evidence counts mean file pairs, not statements, symbols, or variants.

This is an internal component diagram. Do not persist ordinary same-component
imports or external non-violation file graphs. Preserve all reported findings
and unresolved imports, including findings without visible edges. A diagnostic
has `code`, `severity` (`ignored`, `info`, `warning`, or `error`), `message`,
optional `rule`, and tagged `subjects` of shape `{role, kind, value}`, where
`role` is `source`, `target`, or `subject`. Preserve these roles during sorting,
including findings without visible edges. Optional ordered `cycle`/`via`
references of shape `{kind, value}` and a numeric `metrics` map preserve
reported detail. Normalize analyzer severities to this enum and flatten named
metrics, for example `source.instability` and `target.instability`. File/folder
references use normalized repository paths;
package/builtin/unresolved references use bounded labels or specifiers;
outside-root references use opaque identifiers, never absolute local paths.
The reference kinds are `file`, `folder`, `package`, `builtin`, `unresolved`,
and `outside-root`. Analyzer folder records and diagnostic subjects do not
declare components; a finding for an undeclared folder remains valid.
Sanitize diagnostic messages as well as structured references so neither exports
machine-specific absolute paths or source contents.
Support node, folder, cycle, via, and metrics findings rather than assuming every
finding is a file-pair edge.

Validate finite numbers, nonnegative integer counts, references, distinct
non-self aggregate pairs, canonical IDs, evidence ownership, and variant
uniqueness. Dependency cycles remain valid data. Accept saved collections in any
order, then normalize their ordering; reject duplicates and inconsistent claims,
not ordering differences. Serialize collections canonically while preserving
ordered cycle/via paths. Identical validated manifests and observations yield
stable IDs and ordering; exclude `generatedAt`
from semantic equivalence. Live configuration/files may change during a run:
this is not a transactional source snapshot or a reproducibility guarantee.

Exclude session roots, process details, raw reports/configuration/stderr, source
contents, and executable instructions. Analyzer metadata is provenance only
when opening saved YAML. Version 1 has no positions, viewport, or layout settings;
always use default ELK layout. Render flat cards for all components, including
root, with import edges only. Build cards from `components`, without expanding
directory paths from IDs, evidence, inputs, or findings into additional cards.
Exact coordinates are not a stability promise.

## Analyzer execution and supported configuration

Use product-specific native commands, never arbitrary executable/argument IPC.
API callers may supply an absolute Node executable path; otherwise resolve it
through the packaged process's `PATH`. The Load Repo UI uses PATH discovery and
has no Node-path setting. Missing GUI runtime discovery produces
an actionable setup error. Resolve the selected repository's analyzer entrypoint,
initially require
dependency-cruiser 18.7.2, and check Node against that package's engine range.
That pinned range is `^22||^24||>=26`, excluding prereleases. The canonical
package must be inside the selected root; direct npm/Bun installs and in-root
Bun/pnpm stores are supported. Do not fall back to global or ancestor installs.
Verify supported package layouts with fixtures. Use argument arrays, repository
working directory, no shell, no package scripts, and no installation.

Request JSON into a private named report file, with persistent cache disabled.
Bound duration, stdout/stderr, report bytes, manifest count, path batches, and
graph size; calibrate concrete limits with fixtures. Do not let configuration
stdout become the report. JavaScript configuration executes trusted repository
code; a child process and path checks are not a sandbox. Explain this at Load
Repo. See the upstream [CLI](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/doc/cli.md)
and [configuration loader](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/config-utl/extract-depcruise-config/read-config.mjs).

The converter requires effective JSON output and caching disabled (false or
absent). Resolve `summary.optionsUsed.baseDir` against the process working
directory and require its canonical path to equal the selected root. Reject
`collapse`, `focus`, or `reaches` in effective options and any module with
`consolidated: true`: these alter the
file graph required for attribution. Report unsupported configuration rather
than silently changing it. A non-root base can fail before a report exists;
explain the documented restriction through that execution/configuration error,
without claiming to preflight arbitrary `.cjs` code.

Respect top-level `includeOnly`, `exclude`, `doNotFollow`, `maxDepth`, module
systems, and parser/type settings as analysis scope. Permit unrelated dot,
archi, or ddot reporter options and highlight settings that do not alter JSON.
Validate actual runtime report data, including folder findings not fully
represented by upstream TypeScript unions. Inspect `environment.issues`: fail
known missing-required-transpiler issues that prevent the configured scan, even
after exit zero; retain other warnings as diagnostics/scope notes. These choices
follow the upstream [report wrapper](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/main/report-wrap.mjs),
[CLI implementation](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/cli/index.mjs),
[folder summarizer](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/analyze/summarize/summarize-folders.mjs),
and [environment checks](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/analyze/summarize/verify-environment.mjs).

Exit status is an execution fact, not an architecture verdict. The 18.7.2
[JSON reporter](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/report/json.mjs)
can return zero with violations: a valid completed run loads with diagnostics.
Nonzero exit, timeout, missing/truncated/invalid output, or an unsupported version
fails; never salvage partial output as a successful graph.

## Load state and file lifecycle

One controller serializes Load Repo and Open Diagram. Disable new load actions
during a load; cancellation must complete cleanup before retry. An operation
token covers every asynchronous completion, including discovery, decoding, and
layout. The native process is a child resource, not the lifetime of the import.
Cancellation stops native work and removes owned temporary files; rejecting a
frontend promise is insufficient. Before the final synchronous view replacement,
cancellation wins. After that commit, the load is complete. Stale completions
cannot replace the view. Pre-commit failure preserves the previous diagram.

For repository loads, encode the validated model and atomically write a private,
unique `.choom.yaml` candidate in app cache. Re-read it through the common decoder
and prepare layout before committing the view. There is no durable successful
pointer or restart-recovery feature. Retain only the current cache snapshot and
active candidate; remove failed/superseded owned files. At startup, clean stale
owned temporary and snapshot files from inactive sessions, without touching
another active session. Report cleanup failures and stop further cache growth until
resolved. Never delete user files. This promises neither cross-process atomicity
nor power-loss durability.

Open Diagram reads a selected file through the same decoder and default layout;
it does no source lookup, configuration execution, or strategy construction.
Unsupported versions fail without modifying the input file. Browser selection
uses the same codec.

Export captures the current document bytes at its start, independently of later
loads. Desktop export writes a temporary file in the chosen destination directory
and then renames it, with explicit overwrite consent from the save UI. Failure
before replacement preserves an existing file. Browser export uses download.
Export failure does not turn a successful import into failure.

## Validation and release policy

Follow the [cookbook](../new-feature-cookbook.md),
[coding principles](../coding-principles.md), and
[coding standards](../coding-standards.md). Tickets below are the implementation
sequence. T01 starts executable Gherkin; production changes then use focused
TDD red, green, and refactor steps. Keep characterization green. The ordered
draft is not mergeable until required scenarios pass; no undefined, skipped,
pending, or deliberately broken baseline tests substitute for failing behavior.

Register new suites, feature paths, validators, and component links in local
runners and CI. Register each TypeSpec source with the contract entrypoint,
generation, and implementation conformance checks. Regenerate and review
outputs, then run `bun run check:contracts`; compilation alone does not verify
runtime behavior or native serialization. Native Bun and DOM tests remain
separate processes. Use
`test/unit/`, `test/interface/`, and `test/acceptance/` by the repository's test
definitions and source owner; integration requires multiple Choom workspaces.
Keep fixtures outside those category folders and document focused commands.
Do not add behavior tests solely for scripts, configuration, or document edits.

| Evidence | Required operation |
| --- | --- |
| Changed behavior/contracts | Run each changed suite locally and affected Cucumber cases. |
| Complete frontend candidate | `bun run check` includes unit tests, `test:behavior`, TypeSpec compilation/output consistency and interface conformance through `check:contracts`, type checks, cookbook, dependency, lint, unused-code, and duplication checks. |
| Browser acceptance/build | Install Chromium once with `bunx --no-install playwright install chromium`; `bun run test:e2e` includes `bun run build`. |
| Native behavior/packaging | `bun run test:rust`, `bun run desktop:lint`, and `bun run desktop:build`; packaged acceptance is separate. |
| Complete candidate hygiene | `bun run habit-hooks --all`; correct enforced findings or record remaining findings, keeping snoozes empty. |
| Documentation/tooling | Inspect text/links and verify changed operations; no behavior-test requirement for tooling itself. |

Introduce an explicit `@packaged` Cucumber profile/command. Set the default
profile to `not @browser and not @packaged`, the browser profile to
`@browser and not @packaged`, and the packaged profile to `@packaged`.
Build its driver early in T01/T05,
not at final release review. The [current Tauri WebDriver guidance](https://v2.tauri.app/develop/tests/webdriver/)
supports embedded `@wdio/tauri-service` across macOS/Windows/Linux; direct
`tauri-driver` covers Windows/Linux. Choose a platform-aware harness that drives
real IPC and analyzer execution without command mocks. Distinguish test-only
instrumentation from the actual release bundle and cover the installed app too.
Manual native evidence is acceptable where driver limits are recorded explicitly.

Target current CI platforms: Linux, macOS, and Windows. Each claimed platform
needs packaged evidence for runtime discovery, permissions, cancellation, file
lifecycle, and visible results. Missing checks do not count as passing; record
limits in [cookbook/TODO.md](../../cookbook/TODO.md). Builds and mocked IPC do not
establish native acceptance. Retain evidence by platform/build version and rerun
affected checks after fixes, without repeating unchanged complete suites.

Use coarse local stage/outcome/duration signals, distinguishing cancellation
from failure and avoiding repository paths/content as labels. OpenSLO remains
unmeasured; do not invent an SLI or objective. Human approval of changed
constraint artifacts is required before merge, not before implementation.
Complete-candidate manager review precedes readiness; do not mark ready or merge
beyond authorization.

## Appendix: Tickets

Each ticket assesses all four constraints, updates affected component links and
documentation, and registers its checks. Unchanged artifacts need no artificial
diff. The complete-candidate policy above applies once to the assembled change.

Follow Cucumber's [Writing better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/):
describe public behavior with essential context and observable results. Keep UI
interactions, collaborator calls, failure injection, and driver mechanics in the
step implementations and contract checks. T01 registers **all scenarios below**
in linked feature files before production changes; later tickets fulfill their
assigned scenarios. These planning examples do not add executable feature files
in this documentation change.

### CR-001-T01 — Specify behavior and establish acceptance drivers

**Dependencies:** None. **Owners:** workspace, domain, platform, native shell.

#### Behavioral (Gherkin)

```gherkin
Feature: Explore repository architecture and saved diagrams
  Scenario: Load the repository's declared architecture
    Given a repository declares only components ".", "src", and "packages/core"
    And "src/components/panel.ts" imports "packages/core/model/entity.ts"
    When I load the repository
    Then the diagram contains only those three component cards
    And it shows an import from "src" to "packages/core"

  Scenario: View a saved diagram without its source repository
    Given a Choom YAML document contains only components ".", "src", and "packages/core"
    And its import from "src" to "packages/core" has evidence from "src/components/panel.ts" to "packages/core/model/entity.ts"
    And neither its source repository nor analyzer tools are available
    When I open the document in the browser
    Then the diagram contains only those three cards and the import from "src" to "packages/core"

  Scenario: Retain the starter example
    Given I have not loaded a repository
    When I explore the example
    Then I see "React interface", "Architecture model", and "Tauri desktop"
    And the interface connects to the model and desktop

  Scenario: Cancelling repository selection preserves the selection
    Given "Atlas" is my selected repository
    When I cancel choosing another repository
    Then "Atlas" remains selected
```

#### Observability (OpenSLO)

Specify coarse stages and success/failure/cancellation outcomes. Leave the
unmeasured Service unchanged; specifications provide no production baseline.

#### Architecture (dependency-cruiser configuration)

No source-boundary change yet. Preserve current import rules and native grants;
register test drivers without importing them into application code.

#### Interface / contract (TypeSpec)

Map scenarios to the planned TypeSpec neutral, manifest, saved-document, and IPC
contracts. Identify their source owners, generated outputs, and implementation
conformance checks. Register all ticket scenarios and their implementation
owners before production changes. Add minimal executable drivers/fixtures and
separate browser, native, and `@packaged` routes. Retain passing starter/picker
characterization; record new failures caused by absent behavior, not undefined
steps. Establish the packaged driver here and exercise real execution in T05.

### CR-001-T02 — Define the neutral layer and semantic model

**Dependencies:** T01. **Owner:** `src/domain/`.

**Implementation:** [T02 evidence and limits](CR-001-T02-evidence.md). The
[native domain scenarios](../../cookbook/behavior/architecture-import/t02-domain.feature)
exercise this ticket's public APIs. The workflow scenarios below remain the
acceptance requirements for their later UI consumers.

#### Behavioral (Gherkin)

```gherkin
Feature: Describe component ownership and imports faithfully
  Scenario: One declared component owns several subdirectories
    Given only components "." and "src" are declared
    And the reported files are "src/components/panel.ts", "src/lib/format.ts", and "src/hooks/use-model.ts"
    And those files import one another
    When I load the repository
    Then the diagram contains only component cards "." and "src"
    And "src" has a reported-file count of 3
    And those imports create no inter-component relationships

  Scenario: Attribute files to the deepest containing declared component
    Given components ".", "src", and "src/domain" are declared
    And "src/domain-extra" is not declared as a component
    And the reported files are "config.ts", "src/domain-extra/tool.ts", and "src/domain/model.ts"
    When I load the repository
    Then the reported-file counts are:
      | component  | count |
      | .          | 1     |
      | src        | 1     |
      | src/domain | 1     |

  Scenario: Aggregate file pairs without merging their import variants
    Given "src/ui" and "src/core" are declared components
    And "src/ui/a.ts" has reported imports to "src/core/model.ts" with typeOnly true and false
    And "src/ui/b.ts" also imports "src/core/model.ts"
    When I load the repository
    Then there is one import from "src/ui" to "src/core" with two evidence file pairs
    And the pair from "src/ui/a.ts" retains both typeOnly variants

  Scenario: An unreported import flag remains unknown
    Given "src/ui" and "src/core" are declared components
    And an import from "src/ui/app.ts" to "src/core/model.ts" has no reported typeOnly flag
    When I load the repository
    Then that evidence variant has no typeOnly value

  Scenario: Dependency cycles remain describable
    Given declared components "src/a" and "src/b" import each other
    When I load the repository
    Then the document contains both directed imports

  Scenario: Repeated observations keep their identity
    Given the component declarations and reported imports have not changed
    When I load the repository again
    Then its component and relationship identifiers are unchanged
    And its evidence contains the same file pairs and variants

  Scenario: Diagnostic direction does not depend on subject order
    Given a Choom YAML finding lists target "src/a.ts" before source "src/z.ts"
    When I open the document
    Then the finding still identifies "src/z.ts" as source and "src/a.ts" as target

  Scenario Outline: Reject inconsistent architecture documents
    Given a version-1 Choom YAML document has <defect>
    When I open the document
    Then loading is refused because <reason>

    Examples:
      | defect                                      | reason                                    |
      | two components with the same ID             | component IDs must be unique              |
      | two components with the same name           | component names must be unique            |
      | no root component                           | the root component is required            |
      | a parent that is not a component            | parents must reference components         |
      | a cycle of parent references                | parent references must form a tree        |
      | an import to an unknown component           | imports must reference components         |
      | an import from a component to itself        | component imports must have distinct ends |
      | two relationships for the same ordered pair | component imports must be aggregated      |
      | evidence owned by a different source        | evidence must match its component import  |
      | a negative reported-file count              | reported-file counts cannot be negative   |
      | a fractional reported-file count            | reported-file counts must be integers     |
```

#### Observability (OpenSLO)

Define neutral stage/failure codes. No OpenSLO change: model correctness is not a
measured reliability objective.

#### Architecture (dependency-cruiser configuration)

Retain domain isolation; amend its existing rule only if necessary. No platform,
workspace, or concrete report types may enter the domain. Add no Bun workspace.

#### Interface / contract (TypeSpec)

Publish TypeSpec analysis requests/outcomes, neutral observations, and the
semantic document structure. Generate their types and structural schemas, and
keep one runtime validator for semantic rules. Define the nonserialized control
and promise/callback binding in TypeScript. Interface cases must prove a
substitute layer works without dependency-cruiser objects; focused
unit cases own model rules. Only linked declarations establish boundaries; a
declared component owns its directory and descendant directories/files except
those owned by a more-specific explicitly declared component. Directory existence
or depth alone creates no component. Canonical directory-path IDs locate
declaration roots, not every folder. Implement canonical IDs/ordering, deepest
declared ownership, aggregation, all optional import flags, finite counts, and
diagnostic roles.
Check duplicate evidence/variants and canonical edge IDs as well as the examples
above. Keep starter characterization separate from strict version-1 validation.

### CR-001-T03 — Add manifest metadata and repository discovery

**Dependencies:** T01, T02. **Owners:** workspace discovery, platform, native shell,
manifest tooling.

**Implementation:** [T03 evidence and limits](CR-001-T03-evidence.md). The
workspace discovery operation, manifest contract, and native text/path commands
are implemented. The original UI scenarios stay registered for T07; the
[public API scenarios](../../cookbook/behavior/architecture-import/t03-api.feature)
exercise discovery independently of that future UI workflow.

#### Behavioral (Gherkin)

```gherkin
Feature: Discover the explicitly declared repository
  Scenario: Discover declarations rather than source directories
    Given the root manifest declares only child "src" and that child's manifest declares no children
    And the analyzer inputs are ordinary directories "src/components" and "src/lib"
    And an unlinked component manifest exists in "experiments"
    When I load the repository
    Then the document contains only components "." and "src"

  Scenario: Resolve a contained parent reference from its manifest
    Given the root manifest declares a child at "src/api"
    And that child's manifest declares a child at "../core"
    When I load the repository
    Then the document includes components "src/api" and "src/core"
    And "src/core" has "src/api" as its parent component

  Scenario: The selected directory must contain the root manifest
    Given the selected directory has no "component.yaml"
    And its parent directory has a component manifest
    When I load the selected directory
    Then loading is refused for the missing selected-root manifest

  Scenario Outline: Require one explicit supported analyzer declaration
    Given the root manifest has <declaration>
    When I load the repository
    Then loading is refused because <reason>

    Examples:
      | declaration                                 | reason                                  |
      | no annotated analyzer                       | an enforcer declaration is required     |
      | two annotated analyzers                     | exactly one root analyzer is supported  |
      | an unsupported enforcer                     | the declared enforcer is unsupported    |
      | dependency-cruiser without inputs           | explicit source inputs are required     |
      | dependency-cruiser with an empty input list | at least one source input is required   |
      | an input path that does not exist           | source inputs must exist                |
      | a glob as a source input                    | source inputs must be files or folders  |
      | a shell fragment as a source input          | source inputs must be files or folders  |

  Scenario Outline: Reject component references that cannot form the declared tree
    Given a component reference <defect>
    When I load the repository
    Then loading is refused because <reason>

    Examples:
      | defect                                      | reason                                  |
      | resolves outside the selected repository    | manifest references must stay inside it |
      | uses a symlink that resolves outside it     | manifest references must stay inside it |
      | links an already declared directory         | component directories must be unique    |
      | links back to an ancestor                   | child links must not form cycles        |
      | names a child differently from its manifest | child names must match their manifests  |
      | points to a missing child manifest          | each declared child needs a manifest    |
```

#### Observability (OpenSLO)

Provide discovery outcomes and duration through the workflow's local signals.
Keep OpenSLO unchanged; record missing collection/baseline evidence.

#### Architecture (dependency-cruiser configuration)

Keep interpretation in workspace code and transport in platform. Review existing
rules before changing them; add only required native permissions/dependencies.

#### Interface / contract (TypeSpec)

Define manifest metadata and native text/path DTOs in TypeSpec. Update generated
schemas, runtime/tooling conformance checks, linking guidance, root declaration,
and [desktop contract](../../cookbook/interfaces/desktop.md).
Introduce the browser-compatible YAML dependency and bounded native text/path
operations, including the canonical-path contract used by conversion. Validate
DTOs at both boundaries. Cover spaces, limits, relative inputs, duplicate names,
and child analyzer references that must not create jobs. Only linked declarations
create components; ordinary folders and analyzer inputs do not. Preserve declared
parent links even when the child's directory is not nested inside its parent's
directory. Run discovery/interface and Rust path cases; verify tooling with
`bun run check:cookbook`, not new tooling behavior tests.

### CR-001-T04 — Convert completed dependency-cruiser reports

**Dependencies:** T02 and T03's path-normalization contract. **Owner:** concrete
converter in `src/architecture/dependency-cruiser/`.

**Implementation:** [T04 evidence and limits](CR-001-T04-evidence.md) and
[converter contract](../../cookbook/interfaces/dependency-cruiser.md). The
browser-free API scenarios exercise completed-report conversion separately from
the Load Repo workflow below. T05 supplies execution; T07 supplies its UI.

#### Behavioral (Gherkin)

```gherkin
Feature: Preserve the meaning and limits of analyzer observations
  Scenario: Followed imports can extend beyond the entry inputs
    Given only components ".", "src", and "packages/core" are declared
    And the manifest's source input is "src/components"
    And analysis reports "src/components/panel.ts" importing "packages/core/model/entity.ts"
    When I load the repository
    Then the document includes the import from "src" to "packages/core"
    And its recorded source input remains "src/components"

  Scenario: Imports from multiple subdirectories share their declared component
    Given only components ".", "src", and "packages/core" are declared
    And analysis reports these file pairs:
      | sourceFile              | targetFile                     |
      | src/components/panel.ts | packages/core/model/entity.ts  |
      | src/lib/format.ts       | packages/core/types/item.ts    |
    When I load the repository
    Then there is one import from "src" to "packages/core" with both file pairs as evidence
    And the document contains only the three declared components

  Scenario: Reference-only files count as reported files
    Given "src/core" is a declared component
    And analysis contains one local file record for "src/core/model/entity.ts"
    And that file is reported only as an import target
    When I load the repository
    Then "src/core" has a reported-file count of 1
    And the count is not described as an analyzed-file count

  Scenario Outline: Internal package references keep component ownership
    Given only components ".", "src", and "packages/core" are declared
    And "src/components/panel.ts" imports "packages/core/model/entity.ts" through <reference>
    And the canonical target belongs to declared component "packages/core"
    When I load the repository
    Then the document contains an import from "src" to "packages/core"
    And its target evidence is "packages/core/model/entity.ts"

    Examples:
      | reference               |
      | a package alias         |
      | an in-repository symlink |

  Scenario Outline: Findings survive without a visible component import
    Given only components "." and "src" are declared
    And analysis reports <finding> without a cross-component import
    When I load the repository
    Then diagnostics retain <detail>
    And the document still contains only "." and "src", with no component import

    Examples:
      | finding                                    | detail                                      |
      | an orphan finding for "src/core/model.ts"   | the file subject "src/core/model.ts"         |
      | a folder finding for "src/lib"             | the folder subject "src/lib"                |
      | an unresolved import of "missing-package"  | the unresolved specifier "missing-package"  |

  Scenario Outline: Ordered finding paths keep their order
    Given only components "." and "src" are declared
    And a reported <path> contains "src/core/z.ts", "src/core/a.ts", and "src/core/z.ts" in that order
    When I load the repository
    Then the diagnostic retains that <path> in the reported order

    Examples:
      | path  |
      | cycle |
      | via   |

  Scenario: Folder metrics retain their source and target
    Given only components "." and "src" are declared
    And a folder finding reports source "src/ui" with instability 0.8
    And its target is "src/core" with instability 0.2
    When I load the repository
    Then the finding identifies "src/ui" as source and "src/core" as target
    And its metrics are source.instability 0.8 and target.instability 0.2

  Scenario Outline: Reject unsupported analysis semantics
    Given completed analysis has <condition>
    When I load the repository
    Then loading is refused with an unsupported-configuration explanation for <condition>

    Examples:
      | condition                                        |
      | collapse enabled                                 |
      | focus enabled                                    |
      | reaches enabled                                  |
      | consolidated module records                      |
      | a base directory other than the selected root     |
      | effective output other than JSON                  |
      | persistent caching enabled                       |

  Scenario: Explain an analysis exclusion without claiming no dependencies
    Given the configuration excludes "src/legacy"
    And analysis reports no files for declared component "src/legacy"
    When I load the repository
    Then "src/legacy" remains in the document with a reported-file count of 0
    And the analysis scope notes describe the exclusion

  Scenario: Missing required language support prevents a successful load
    Given the configured analysis requires a transpiler that is unavailable
    When I load the repository
    Then loading fails and identifies the missing required transpiler

  Scenario: Non-blocking analyzer warnings remain visible
    Given "src/ui" and "src/core" are declared components
    And completed supported analysis reports an import from "src/ui" to "src/core"
    And it includes a non-blocking warning
    When I load the repository
    Then the document contains that import and retains the warning's message

  Scenario: Disappearing source files do not receive invented ownership
    Given only components "." and "src" are declared
    And analysis reports the local file "src/core/model.ts"
    And that file disappears before the import finishes
    When the repository load finishes
    Then it fails with a source-change error for "src/core/model.ts"
```

#### Observability (OpenSLO)

Expose conversion/validation outcomes and bounded summaries. OpenSLO stays
unchanged: recorded reports establish conversion behavior only.

#### Architecture (dependency-cruiser configuration)

Add narrow concrete-strategy isolation and the named composition exception.
Prevent UI, common libraries, and domain from importing concrete reports; retain
platform isolation, cycle, and unresolved-import rules.

#### Interface / contract (TypeSpec)

Define Choom's completed-report context and neutral-output contracts in TypeSpec.
Keep the dependency-cruiser report under its upstream contract and validate the
adapter's accepted report subset at runtime, including gaps in upstream type
unions.
Validate recorded 18.7.2 reports and translate facts through the common builder.
Attribute deep file paths to the deepest containing declared root, not their
immediate directory, and aggregate file pairs from all its owned subdirectories.
Count unique canonical local file records assigned to that root, excluding a
declared child's records; analyzer folder totals are not component file counts.
Folder diagnostic subjects need no component entry and create none.
Cover invalid report shapes, all mixed import flags, effective base/output/cache
checks, and supported filters/traversal/parser settings. Dot/archi/ddot reporter
options and highlight must not cause rejection of otherwise supported JSON.
Check missing-required-transpiler issues even after exit zero. Run focused
adapter unit/interface cases; do not duplicate builder rules or claim canned
reports establish source-to-model behavior.

### CR-001-T05 — Run and cancel the concrete strategy

**Dependencies:** T03, T04. **Owners:** strategy/runner, platform, native shell.

**Implementation:** [T05 evidence and limits](CR-001-T05-evidence.md) and
[native execution contract](../../cookbook/interfaces/desktop-analyzer.md).
Native jobs use prepare/run/cancel/release operations. Public API and installed
native-operation scenarios exercise execution before the later Load Repo UI.

#### Behavioral (Gherkin)

```gherkin
Feature: Obtain a fresh analysis with supported local tools
  Scenario: Load current imports instead of an older diagram
    Given only components ".", "src", and "packages/core" are declared
    And the analyzer inputs are "src/components" and "src/lib"
    And a previous diagram has no import from "src" to "packages/core"
    And "src/lib/format.ts" now imports "packages/core/model/entity.ts"
    When I load the repository again
    Then the new diagram contains only those three component cards
    And it shows the import from "src" to "packages/core"

  Scenario: Reported rule violations do not hide the architecture
    Given "src/ui" and "src/core" are declared components
    And analysis completes with an import from "src/ui" to "src/core"
    And rule "no-ui-core" reports that import as an error
    When I load the repository
    Then the diagram shows the import
    And diagnostics identify rule "no-ui-core" with error severity

  Scenario Outline: Explain unmet local prerequisites
    Given <prerequisite> is unavailable
    When I load the repository
    Then loading is refused and identifies <prerequisite> as required

    Examples:
      | prerequisite                                      |
      | a discoverable Node executable                    |
      | a Node version supported by the analyzer           |
      | a repository-local dependency-cruiser installation |
      | the supported dependency-cruiser version 18.7.2    |

  Scenario Outline: Incomplete analysis does not become a diagram
    Given the repository analysis <failure>
    When I load the repository
    Then no new architecture document is produced
    And the load reports <reason>

    Examples:
      | failure                            | reason                         |
      | stops before completing            | analysis did not complete      |
      | exceeds the supported time limit   | analysis timed out             |
      | produces no report                 | the analysis report is missing |
      | produces an incomplete report      | the analysis report is incomplete |
      | produces a malformed report        | the analysis report is invalid |

  Scenario: Cancel running analysis
    Given a repository analysis is in progress
    When I cancel the load
    Then the load ends as cancelled
    And it produces no new architecture document
```

#### Observability (OpenSLO)

Emit prerequisite/execution/conversion stages, duration, and outcomes without
raw paths/stderr labels. Cancellation is separate from failure; OpenSLO remains
unmeasured.

#### Architecture (dependency-cruiser configuration)

Use T04's boundaries. The workspace runner calls platform; Rust owns arguments
and process lifetime. Add product-specific native commands, never arbitrary exec.

#### Interface / contract (TypeSpec)

Define runner/native request, result, progress, and cancellation DTOs in TypeSpec.
Check TypeScript and Rust serialization against their generated schemas and
verify runtime boundary validation. Inject the runner and a `ReportConversion` into the
concrete layer; handle terminal process failures before conversion. Implement controlled
arguments, bounded private output, timeout, and process cleanup. Test injected
collaborators separately from real IPC and Rust cleanup; cancellation must stop
native work. Analyzer inputs select analysis scope without creating or redefining
components. Run real small repositories through 18.7.2, proving exit-zero
findings load and nonzero/partial runs fail. Exercise the packaged driver and
installed-runtime discovery outside Choom's development environment now.
Calibrate limits and document runtime/package layouts and the Load Repo notice
that trusted repository configuration executes local code.

### CR-001-T06 — Persist candidates and export portable YAML

**Dependencies:** T02, T03. **Owners:** codec, workspace storage, platform, native
shell; T05 supplies real-import integration evidence.

**Implementation:** [T06 evidence and limits](CR-001-T06-evidence.md) and
[portable document contract](../../cookbook/interfaces/documents.md).
The API and installed-operation scenarios cover document behavior independently
of the UI. T07 supplies the controls, layout, and final view replacement.

#### Behavioral (Gherkin)

```gherkin
Feature: Save and reopen portable architecture documents
  Scenario: Export and reopen preserve architecture meaning
    Given I exported a document containing only components ".", "src", and "packages/core"
    And its import from "src" to "packages/core" has this evidence:
      | sourceFile              | targetFile                    |
      | src/components/panel.ts | packages/core/model/entity.ts |
      | src/lib/format.ts       | packages/core/model/entity.ts |
    And "src" has a reported-file count of 3
    And a folder finding identifies source "src/components" and target "packages/core/model"
    When I reopen that export
    Then only those three components and the import with both file pairs are present
    And "src" still has a reported-file count of 3
    And the finding keeps source folder "src/components" and target folder "packages/core/model"

  Scenario: Collection order does not invalidate a document
    Given a Choom YAML document lists only components "packages/core", ".", and "src" in that order
    And "packages/core" and "src" both name "." as their parent
    And it describes an import from "src" to "packages/core"
    When I open the document
    Then the diagram includes only ".", "src", and "packages/core"
    And the import from "src" to "packages/core" is present

  Scenario Outline: Reject unsupported document encodings without changing the file
    Given a Choom YAML file contains <content>
    When I open the file
    Then loading is refused because <reason>
    And the original file is unchanged

    Examples:
      | content                       | reason                                |
      | schemaVersion 2               | that schema version is unsupported    |
      | duplicate mapping keys        | mapping keys must be unique           |
      | a custom YAML tag             | custom tags are unsupported           |
      | two YAML documents            | a file must contain one document      |
      | an unknown semantic field     | that field is not part of the schema  |

  Scenario: Exports do not disclose machine-specific paths
    Given the repository is located at "/home/alex/Atlas"
    And a reported finding refers outside it to "/home/alex/shared/model.ts"
    When I export its diagram
    Then neither exported references nor diagnostic messages contain "/home/alex"
    And the outside-root subject has an opaque identifier

  Scenario: Declining replacement preserves an existing export
    Given the destination contains a diagram named "Previous"
    And I am exporting the diagram named "Current"
    When I decline to replace the existing file
    Then the destination still contains "Previous"

  Scenario: A failed replacement preserves both prior file and current view
    Given the destination contains a diagram named "Previous"
    And I approve replacing it with the current diagram named "Current"
    When the export fails before replacement
    Then the destination still contains "Previous"
    And "Current" remains displayed with an export failure notice

  Scenario: An export keeps the diagram selected when it began
    Given an export of "Atlas" is in progress
    And "Beacon" becomes the current diagram
    When the export finishes
    Then the exported document is named "Atlas"
```

#### Observability (OpenSLO)

Add storage/decoding/cleanup/export outcomes and duration. Keep OpenSLO unchanged;
record filesystem evidence and remaining platform limits.

#### Architecture (dependency-cruiser configuration)

Keep the codec independent of platform/UI/concrete strategies. Storage
orchestration belongs to the workspace; add only narrow native file operations
and required capability changes.

#### Interface / contract (TypeSpec)

Define storage/export DTOs in TypeSpec and use T02's semantic document contract.
Publish YAML encoding/limits alongside it; parser restrictions and file lifecycle
remain runtime requirements. Preserve the saved component set and full deep
file evidence; evidence and diagnostic paths need not have component entries.
Retain reported-file counts even when files have no cross-component imports.
Implement bounded encode/decode, atomic unique candidate writes, re-read, and
destination-safe export. Run codec/interface and Rust write/read/failure cases,
including failed cleanup. Retain only current and
candidate snapshots; clean stale files from inactive sessions without touching
active sessions or user files, and block further cache growth after cleanup
failure. Verify that export captures its starting bytes. No durable pointer or
presentation schema is introduced.

### CR-001-T07 — Complete the serialized load and viewing workflows

**Dependencies:** T05, T06. **Owners:** workspace controller, UI, layout.

**Implementation status:** Merged in [PR #10](https://github.com/tomer-mayara/choom/pull/10). Browser, contract,
unit, and Linux installed acceptance checks pass. The final macOS package also
passes native repository loading, export, cancellation, and reopening after
restart without its source repository. Windows execution and the remaining
release review stay in T08. See the
[T07 evidence record](CR-001-T07-evidence.md) for exact results and limits.

#### Behavioral (Gherkin)

```gherkin
Feature: Keep one current diagram throughout loading
  Scenario Outline: A second load cannot start while an operation is unfinished
    Given <operation> is in progress
    When I request <another load>
    Then that load cannot start while the first operation is unfinished

    Examples:
      | operation              | another load               |
      | a repository load      | another repository load    |
      | a repository load      | a saved diagram load       |
      | a saved diagram load   | a repository load          |
      | a saved diagram load   | another saved diagram load |
      | cancellation of a load | a repository load          |
      | cancellation of a load | a saved diagram load       |

  Scenario: Cancellation still applies after analysis completes
    Given "Previous" is displayed
    And analysis for "Next" has completed but its diagram is not yet ready
    When I cancel the load
    Then "Previous" remains displayed
    And the load ends as cancelled

  Scenario: A cancelled result cannot replace a newer diagram
    Given the load of "Abandoned" was cancelled
    And "Current" has since finished loading
    When a result from "Abandoned" becomes available
    Then "Current" remains displayed

  Scenario Outline: Failure before display preserves the current diagram
    Given "Previous" is displayed
    And the new load cannot <operation>
    When I load the new diagram
    Then "Previous" remains displayed
    And the failure identifies <stage>

    Examples:
      | operation                      | stage               |
      | save its repository analysis   | document storage    |
      | read its saved document        | document reading    |
      | decode its saved document      | document validation |
      | arrange its component cards    | diagram layout      |

  Scenario: Every declared component has a card even without reported files
    Given a document contains only components ".", "src", "packages/core", and "native"
    And its import evidence includes "src/components/panel.ts" to "packages/core/model/entity.ts"
    And "native" has a reported-file count of 0
    When I open the document
    Then the diagram has only the four cards ".", "src", "packages/core", and "native"
    And "native" is labelled "No files reported"
    And parent relationships are not shown as import arrows

  Scenario: Retry after correcting a missing manifest
    Given my repository load failed because its root manifest was missing
    And the root manifest now declares only components ".", "src", and "packages/core"
    And "src/lib/format.ts" imports "packages/core/model/entity.ts"
    When I retry the repository load
    Then the diagram shows the import from "src" to "packages/core"

  Scenario: Open a saved diagram using only a keyboard
    Given I use Choom with only a keyboard
    And a saved document contains components ".", "src/ui", and "src/core"
    And it describes an import from "src/ui" to "src/core"
    When I open that document
    Then the diagram shows the import from "src/ui" to "src/core"

  Scenario: Retry failed export cleanup before starting another load
    Given "Current" is displayed
    And an export cleanup failure has blocked new loads
    When I retry document cleanup
    Then "Current" remains displayed
    And repository and saved diagram loads are available
```

#### Observability (OpenSLO)

Complete local workflow/layout outcomes and actionable UI errors. OpenSLO stays
unchanged; distinguish browser/simulated-desktop evidence from packaged results.

#### Architecture (dependency-cruiser configuration)

Verify the named workflow/composition boundaries and concrete import bans. Use
the existing repository, analyzer, and document transport operations. Add the
narrow `dialog:allow-save` and `dialog:allow-message` grants for export selection
and explicit replacement consent. Keep them restricted to the main window.

#### Interface / contract (TypeSpec)

Define caller-visible load state and outcome data in TypeSpec. Update the
[workspace contract](../../cookbook/interfaces/workspace.md), implementation
conformance checks, and component links. Complete selection, coarse progress,
cancel/retry, and the final view commit. Contract tests must cover late decoding/layout,
cancellation after process exit, retry only after cleanup, and cancellation that
cannot reverse an already completed commit. Verify findings, counts, provenance,
keyboard access, and export independence. Render the saved component set without
deriving cards from evidence paths, diagnostic folders, or directory ancestors.
Exercise the workflow with a substitute neutral layer, separate DOM suites, and
real browser rendering/common decoding;
browser saved viewing must work without source files or analyzer tools.

The [workflow operations](../../cookbook/interfaces/workflow.tsp) own serialized
state and outcomes. Subscription callbacks, abort signals, and prepared layout
stay in the TypeScript binding. The [diagram dialog operations](../../cookbook/interfaces/document-dialogs.tsp)
describe file selection and replacement consent. A save-picker path alone is
not overwrite consent: try without replacement, then request explicit consent
if the destination exists, retaining the originally encoded bytes.

A committed diagram remains current if later cleanup fails. Keep a failed known
snapshot or repository owner for cleanup retry. If analyzer or discovery cleanup
fails without returning a usable owner, require an application restart; document
cleanup must not clear that gate. This ticket does not extend the neutral
analyzer interface with a second lifecycle protocol.

### CR-001-T08 — Verify the complete release and review constraints

**Dependencies:** T07. **Owners:** all affected components, CI, documentation.

**Implementation status:** In progress on `codex/cr-001-t08`. See the
[T08 evidence record](CR-001-T08-evidence.md) for checks, artifact identities,
constraint review, and platform limits. This record does not imply release or
merge approval.

#### Behavioral (Gherkin)

```gherkin
Feature: Use installed Choom to inspect and share architecture
  Scenario: Analyze a repository from the installed desktop application
    Given Choom is installed independently of its development checkout
    And a repository has supported local tools and only declared components ".", "src", and "packages/core"
    And "src/components/panel.ts" and "src/lib/format.ts" import "packages/core/model/entity.ts"
    When I load that repository in installed Choom
    Then the diagram contains only those three cards and one import from "src" to "packages/core"
    And that import has two evidence file pairs
    And the diagram is available to export as Choom YAML

  Scenario Outline: Open an installed application's export elsewhere
    Given installed Choom exported only components ".", "src", and "packages/core"
    And their import evidence is "src/components/panel.ts" and "src/lib/format.ts" to "packages/core/model/entity.ts"
    And the source repository and analyzer tools are unavailable to the viewer
    When I open that export in <viewer>
    Then the diagram contains only those three cards and one import from "src" to "packages/core"
    And the import retains both deep file pairs as evidence
    And it identifies dependency-cruiser 18.7.2 as the recorded analyzer

    Examples:
      | viewer                  |
      | the browser             |
      | installed desktop Choom |

  Scenario: Denied repository access preserves the installed application's view
    Given installed Choom displays "Previous"
    And access to the selected repository is denied
    When I load that repository
    Then "Previous" remains displayed
    And the failure identifies denied repository access

  Scenario: Missing Node preserves the installed application's view
    Given installed Choom has no Node runtime available
    And installed Choom displays "Previous"
    And a repository has supported local tools and only declared components ".", "src", and "packages/core"
    When I load that repository in installed Choom
    Then "Previous" remains displayed
    And the failure identifies analyzer setup
    And the failure explains how to make Node available to Choom

  Scenario: Cancelling installed analysis stops its work and preserves the diagram
    Given installed Choom displays "Previous"
    And an installed repository analysis is running with a child process
    When I cancel the installed repository load
    Then "Previous" remains displayed
    And the load ends as cancelled
    And the analyzer and its child have stopped and their private report is removed
    And repository and saved diagram loads are available

  Scenario: Load a repository after cancelling its installed analysis
    Given an installed repository load was cancelled after its analyzer started
    And the repository analyzer configuration has been corrected
    When I load the repository again
    Then the diagram contains only component cards ".", "src", and "packages/core"
    And the diagram shows the import from "src" to "packages/core"
    And that import has two evidence file pairs

  Scenario: A failed installed analyzer preserves the diagram
    Given installed Choom displays "Previous"
    And the repository analyzer stops after writing an incomplete report
    When I load that repository in installed Choom
    Then "Previous" remains displayed
    And the failure identifies repository analysis
    And the failed analyzer has stopped and its incomplete report is removed

  Scenario: Retry the same repository after correcting its analyzer
    Given an installed repository load failed because its analyzer stopped
    And the repository analyzer configuration has been corrected
    When I retry the repository load
    Then the diagram contains only component cards ".", "src", and "packages/core"
    And the diagram shows the import from "src" to "packages/core"
    And that import has two evidence file pairs

  Scenario Outline: An invalid saved file preserves the installed application's view
    Given installed Choom displays "Previous"
    And a saved diagram has <problem>
    When I open the invalid saved diagram
    Then "Previous" remains displayed
    And the failure identifies <stage>

    Examples:
      | problem                       | stage               |
      | invalid UTF-8 bytes           | document reading    |
      | an unsupported schema version | document validation |
```

The document boundary also covers the export timing regression found during
release verification. This scenario runs through the public document operations
in [the document API feature](../../cookbook/behavior/architecture-import/t06-api.feature).
The installed and browser suites retain their separate evidence scopes.

```gherkin
Feature: Keep export available during document replacement
  Scenario: Export remains available while the previous document is being removed
    Given "Beacon" is current while the previous document is being removed
    When the current architecture is exported as removal finishes
    Then the exported YAML still describes "Beacon"
    And the previous document is removed and the current document remains available
```

#### Observability (OpenSLO)

Review local signals and update [evidence gaps](../../cookbook/TODO.md). Keep the
Service unmeasured unless actual collection, baseline, and an agreed objective
justify a separately reviewed change.

#### Architecture (dependency-cruiser configuration)

Review the complete dependency-rule, Cargo, capability, and packaging candidate.
Confirm actual enforcement and component ownership; add no artificial artifact
diff merely to satisfy a heading.

#### Interface / contract (TypeSpec)

Review TypeSpec source contracts, generated outputs, and implementation
conformance for TypeScript, manifest, saved-document, and IPC boundaries. Review
registered checks, links, and user instructions. Run all new and retained
scenarios green and close the evidence map. Exercise real installed
IPC/analyzer execution and the earlier cancellation, file, and layout failure
scenarios on each claimed platform. Verify that multiple owned subdirectories
remain one component through real analysis, export, and source-free viewing.
Retain evidence by OS/build and record unavailable checks; instrumented or mocked
runs do not substitute for installed
release evidence. Apply the single validation/release policy above, complete
manager review, and obtain human constraint approval before any authorized merge.
