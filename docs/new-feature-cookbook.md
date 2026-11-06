# New Feature Cookbook

Every new feature (spec → ticket → PR) must introduce or update the constraints it affects.  
The LLM proposes the artifacts. A human reviews and approves them before the PR is merged.

## The Four Constraints

| Constraint | Artifact | Human reviews |
|------------|----------|---------------|
| **Behavioral** — what the system must do | Cucumber feature file(s) | the feature file(s) |
| **Observability** — how we prove it in production | OpenSLO YAML file(s) | the OpenSLO file(s) |
| **Architectural** — who may depend on whom | dep-cruiser config | the config (or its diff) |
| **Interface** — public contract of a boundary | OpenAPI (or AsyncAPI / JSON Schema / types) | the contract definition(s) |

Only the constraints that actually change are required. Unchanged ones are left alone.

## Linking File

Each relevant directory contains a `component.yaml` that points to the artifacts:

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
    - path: openapi/auth.yaml

children:                # optional
  - name: token-service
    path: ./token
```

## PR Checklist

- [ ] Changed Cucumber feature file(s) present and reviewed
- [ ] Changed OpenSLO file(s) present and reviewed
- [ ] dep-cruiser config updated (new file or diff) and reviewed
- [ ] Changed contract definition(s) present and reviewed
- [ ] `component.yaml` updated to reference everything above
- [ ] Human has approved the constraint artifacts

## Rules

- Start with the Gherkin. The other constraints exist to protect and prove it.
- Prefer diffs over rewrites.
- The same four artifacts apply recursively to any new sub-component.
- Once approved, CI enforces the constraints. Implementation code may change freely as long as the constraints stay green.
