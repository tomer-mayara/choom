# New feature planning

Start the feature plan or ticket with the outcome a user should observe and the
components it affects. For each component, record a decision for all four constraints.

| Constraint | What to write |
| --- | --- |
| Behavior | Start with a Cucumber `.feature` scenario showing the expected outcome. Include failure or limit cases that change what the user sees. [Gherkin guide](gherkin-guide.md) |
| Observability | Identify the production signal that shows whether the feature works. For a changed service objective, write the indicator, target, and time window in OpenSLO YAML. |
| Architecture | State which components may depend on which others. Express changed dependency rules in the dependency-cruiser config. |
| Interface | Define the inputs, outputs, events, and errors of a changed TraceRelic-owned boundary in TypeSpec. Specify how to check compilation, generated types and schemas, and implementation conformance. |

**Before coding**, write each changed artifact, link it from the plan, and name
the CI check to run or add. If an existing constraint covers the feature, link
it. If a category is out of scope, record why. When artifact or child component
paths change, create or update the owning `component.yaml` with relative paths.

Once all four decisions and the changed artifacts are written, the manager hands
off implementation. Follow [Coding principles](coding-principles.md). Before
merge, CI must enforce the changed constraints and a human must approve them.
