# New Feature Cookbook

Every new feature (spec → ticket → PR) must introduce or update the constraints it affects.
The LLM proposes the artifacts. A human reviews and approves them before the PR is merged.

This cookbook is the source of truth among the three guides in `docs/`. If they
conflict, follow this document. [Coding principles](coding-principles.md) covers
design and testing; [coding standards](coding-standards.md) covers implementation
practices. Apply both within the constraints defined here.

## The Four Constraints

| Constraint | Artifact | Human reviews |
|------------|----------|---------------|
| **Behavioral** — what the system must do | Cucumber feature file(s) | the feature file(s) |
| **Observability** — how we prove it in production | OpenSLO YAML file(s) | the OpenSLO file(s) |
| **Architectural** — who may depend on whom | dependency-cruiser config | the config (or its diff) |
| **Interface** — public contract of a boundary | TypeSpec source files and implementation conformance checks | the contract definition(s) and generated changes |

Assess all four constraints for each affected component. Introduce or update only
the constraints that actually change. Leave unchanged artifacts alone.

Follow [Writing Good Gherkin](gherkin-guide.md) when writing or reviewing
behavioral scenarios.

TypeSpec is the source of truth for Choom-owned data and operation contracts
between components, whether the caller is internal or external. Define the
contract without adding an HTTP transport to an in-process or native boundary.
Generated TypeScript declarations and JSON Schema are outputs, not separately
authored definitions. Keep runtime validation, graph invariants, asynchronous
execution, and failure behavior in the implementation and its tests. UI outcomes
remain in Gherkin and boundary notes; third-party configuration and protocols
retain their vendor formats.

Follow the [TypeSpec style guide](https://typespec.io/docs/handbook/style-guide/)
when writing or reviewing TypeSpec contracts. TypeSpec sources must compile
successfully. After changing a contract, run `bun run contracts:generate`, then
`bun run check:contracts`. The check compiles the TypeSpec sources, checks the
generated outputs, and verifies implementation conformance. It must pass locally
and in CI.

## Linking File

Each relevant component directory contains a `component.yaml` that points to its
constraint artifacts and, when present, its child components. Paths are relative
to the directory containing that manifest:

```yaml
name: auth-service
description: User authentication

artifacts:
  behavior:
    - path: features/login.feature
  observability:
    - path: slos/login-latency.yaml
  architecture:
    - path: dep-cruiser.config.js
  contracts:
    - path: typespec/auth.tsp

children:                # optional
  - name: token-service
    path: ./token
```

Apply the same pattern to new sub-components. Reference the artifacts that apply
to that component; recursion does not require creating unaffected artifacts.
Update the manifest when artifact or child references change, and preserve
references to unchanged artifacts.

Link the relevant `.tsp` sources in `contracts`, alongside any behavioral or
native boundary notes. Register those sources with the TypeSpec entrypoint and
the contract checks. A file-existence check does not compile a contract or prove
that an implementation follows it.

## PR Checklist

Mark a constraint item not applicable when that constraint is unchanged.
Existing `component.yaml` references need no edit if they are still correct.
Human approval applies to all proposed constraint artifacts.

- [ ] Changed Cucumber feature file(s) present and reviewed
- [ ] Changed OpenSLO file(s) present and reviewed
- [ ] Changed dependency-cruiser config (new file or diff) present and reviewed
- [ ] Changed TypeSpec contracts and generated outputs present and reviewed
- [ ] TypeSpec sources compile successfully through `bun run check:contracts`
- [ ] Generated-output consistency and affected implementation conformance checks pass
- [ ] `component.yaml` references the affected artifacts and children
- [ ] Human has approved the constraint artifacts
- [ ] CI includes and passes checks for the changed constraints

## Rules

- Start with the Gherkin. The other constraints exist to protect and prove it.
- Prefer diffs over rewrites.
- The same four constraint categories apply recursively to any new sub-component.
- CI must enforce the approved constraints. Include added or moved artifacts in
  the appropriate runners and validators; linking a file in `component.yaml`
  does not automatically register a CI check.
- Implementation code may change freely within the approved constraints while
  affected tests and checks stay green. A change to a constraint requires an
  artifact update and human approval before merge. Passing CI does not replace
  that approval.

See the [development commands](../README.md#development-commands) for current
checks and the [starter cookbook](../cookbook/README.md) for their validation
limits. Extend the checks when a changed constraint needs additional coverage.
