# Completed dependency-cruiser reports

[dependency-cruiser.tsp](dependency-cruiser.tsp) owns the completed-report
context and conversion operation. [`DepCruiserReportConverter`](../../src/architecture/dependency-cruiser/converter.ts)
binds `convert` asynchronously. Its injected dependency is the native
[repository path operation](desktop.md#repository-access). The caller retains
the open repository session and must close it after the import workflow.

The converter accepts a completed dependency-cruiser **18.7.2 JSON report**,
the analyzer descriptor, and the component declarations from discovery. It
does not execute a configuration or analyzer. The version in the context must
match the report's environment version. `workingDirectory: "."` is the
producer's guarantee that analysis ran at the selected session root; the
converter cannot establish process history. T05's runner must enforce it.
The producer also supplies `generatedAt`; conversion does not invent a new
analysis time.

The report remains a vendor protocol. A bounded runtime schema checks the
fields used by conversion. Unused vendor fields are ignored. The report schema
is not a second Choom data contract. Conversion produces neutral observations
and calls the common domain builder; the success result contains the same
version-1 architecture document defined by [architecture.tsp](architecture.tsp).

## Ownership and paths

Only the supplied declarations create components. One component can own many
source subdirectories. `ComponentCatalog` assigns a file to its most specific
declared directory. Analyzer inputs describe entry points, so a followed import
can reach another declared component outside those inputs.

Module inventory records provide the reported-file counts, including local
targets that the analyzer did not follow. Counts use unique canonical paths;
folder totals and import evidence create no extra file records. An import target
must have a module inventory record. Internal package aliases and symlinks keep
their canonical component ownership. Canonical paths under `node_modules` are
external packages; builtins and unresolved imports are classified before native
path resolution. Outside paths use opaque session-local references.

Path resolution uses the selected repository root and batches of at most 128
paths. Missing sources fail with `source-changed`; conversion does not return a
partial document. The filesystem is not a transactional snapshot. Deterministic
conversion requires the same report, context, and canonical path results.
Source-change messages identify the relative file when it can be confirmed.
A failed batch can trigger at most eight smaller path checks to identify it. If a
path changes again or only an unsafe host reference is available, the message
asks for another analysis without exposing that reference.

## Meaning of reports

Effective `baseDir` must resolve to the selected root. Output must be `json`
and persistent caching must be absent or `false`. Collapse, focus, reaches, and
consolidated modules are unsupported because they change the file graph.
Supported source filters, traversal limits, module systems, and parser/type
settings are recorded in scope notes. These settings can leave a declared
component with zero reported files. Presentation options for dot, archi, ddot,
and highlighting do not change conversion of JSON observations.

Import evidence preserves distinct flag variants. An omitted flag stays
unknown; a reported `false` stays false. In 18.7.2, `type-only` and
`pre-compilation-only` dependency tags also supply positive flag facts.
Conflicting facts fail conversion.

Diagnostics survive without a cross-component relationship. They retain rule
identity, severity, subject roles, ordered cycle and via references, and numeric
metrics under `source.*` and `target.*`. Supported metric names start with an
ASCII letter or underscore and contain at most 128 letters, digits, underscores,
periods, or hyphens. Other names are rejected instead of silently changed.
Folder findings use the runtime folder
inventory, including classified synthetic sinks. Cycles and instability
findings need an unambiguous matching rule scope to distinguish modules from
folders. Diagnostic subjects do not declare components. Unresolved imports also
produce a diagnostic when no rule finding mentions them.

The missing-transpiler environment issues for tsc, TypeScript, swc, and Babel
fail with `unavailable`, even when analysis exited successfully. Other accepted
environment issues become diagnostics. Free text is bounded and sanitized;
raw stderr, configuration comments, source contents, and absolute host paths
are not document fields. Failures return a stable code, safe message, and
`conversion` or `validation` stage. No production telemetry or timing objective
is introduced.

## Initial bounds

| Resource | Limit |
| --- | --- |
| Completed JSON | 16 MiB of UTF-8 text |
| Declared components | 256 |
| Analyzer inputs | 128 |
| Path | 4096 UTF-8 bytes |
| Module inventory records | 10000 |
| Folder inventory records | 10000 |
| Rules across all rule categories | 5000 |
| Distinct native paths per conversion, including the base | 20001 |
| Dependency observations | 50000 |
| Result diagnostics | 5000 |
| Ordered cycle/via references across findings | 50000 |

These are resource caps, not measured large-repository performance guarantees.
The native path service retains its own limits. Malformed vendor data returns
`invalid-observations`; unsupported analyzer versions or graph semantics return
`unsupported`. Exceeding an observation or text cap returns `limit-exceeded`.
Invalid Choom context returns `invalid-request`. Domain validation failure
returns `invalid-document` at the `validation` stage.

The implementation follows the pinned upstream
[report types](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/types/cruise-result.d.mts),
[folder summarizer](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/analyze/summarize/summarize-folders.mjs),
and [environment checks](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/analyze/summarize/verify-environment.mjs).
Runtime reports include folder findings that are absent from the published
violation-type union.

Run `bun run test:behavior:native --tags @cr-001-t04-api`,
`bun test ./test/unit/architecture/dependency-cruiser`, and
`bun test ./test/interface/architecture/dependency-cruiser` for focused evidence.
Recorded reports test conversion; they do not establish the future runner's
execution, cancellation, or installed application behavior.
