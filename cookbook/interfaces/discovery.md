# Repository discovery

[discovery.tsp](discovery.tsp) owns manifest metadata and discovery results.
[`RepositoryDiscovery`](../../src/architecture/repository-discovery.ts) binds
`discover` asynchronously and uses the injected
[repository access boundary](desktop.md#repository-access). Discovery selects
the analyzer configuration; it does not execute the configuration or analyzer.

The selected directory must contain `component.yaml`. Discovery follows only
that manifest's linked children, recursively. It does not search ancestors or
scan directories for more manifests. Each declaration identifies one component
by its canonical repository-relative directory; the root ID is `.`. Names and
directories must be unique, child names must match their manifests, and links
must form one tree. The declared parent can differ from directory nesting.

A component can own several source subdirectories. Source inputs and ordinary
directories do not create components. Later file ownership uses the most
specific declared directory through `ComponentCatalog`.

Exactly one root architecture artifact must have `enforcer` or `inputs`
metadata. It must name `dependency-cruiser`, a configuration file, and at least
one existing file or directory as input. Path-only entries remain legal.
Child artifact paths are checked, but child enforcer/input metadata selects no
job and its inputs are not resolved. Minimal imported manifests need only a
name; they do not need Choom's four-category CI inventory.

Every artifact path and child link resolves relative to the canonical file
directory of its declaring manifest. A contained symlink to a manifest can
change this reference base; the canonical linked component directory still
determines component ownership. References must remain inside the selected
root after native canonicalization. Contained `../`, `./`, spaces, and Unicode
are supported. Paths are not trimmed. Absolute paths, backslashes, control
characters, colons, glob characters, shell fragments, and leading `-` are
rejected. Declared artifacts must be files. Artifact contents are not parsed.
The selected analyzer's canonical configuration and input paths must also meet
the literal-path rules; symlinks cannot introduce a glob or option-like path.

The parser accepts one document using the YAML core schema. It rejects duplicate keys, custom
tags, unknown fields, and invalid manifest structure. Initial resource bounds:

| Resource | Limit |
| --- | --- |
| Native path | 4096 UTF-8 bytes |
| One manifest | 262144 UTF-8 bytes |
| All manifests in one discovery | 8 MiB of UTF-8 text |
| Declared components, including root | 256 |
| Children, inputs, or entries in one artifact category | 128 |
| YAML collection depth | 32 |
| YAML syntax nodes | 10000 |
| YAML alias expansion | `yaml` library `maxAliasCount: 50` |

Boundary fixtures exercise these limits. They are initial resource caps, not a
measured large-repository performance target. Native operations share the
[desktop limits](desktop.md#repository-access).

A success returns canonical sorted declarations, canonical unique sorted
inputs, and the selected analyzer descriptor. It transfers an open repository
session to the caller. The caller must close it after the later import work.
A failure closes the session; cleanup failure is itself reported. Discovery
state belongs to one call, so retries and concurrent calls do not share a graph.
The filesystem is not a transactional snapshot; changed files can fail a read.

Both outcomes contain a nonnegative `durationMs`. Failures identify the
`discovery` stage, a stable code, and a useful message without absolute host
paths. These are local workflow results. There is no telemetry collector or
production timing baseline, so OpenSLO remains unchanged.

Run the [public API scenarios](../behavior/architecture-import/t03-api.feature)
with `bun run test:behavior:native --tags @cr-001-t03-api`, focused workspace
tests with `bun test ./test/unit/architecture`, and conformance checks with
`bun test ./test/interface/architecture`. The original import UI scenarios
remain separate and need the later workflow tickets.
