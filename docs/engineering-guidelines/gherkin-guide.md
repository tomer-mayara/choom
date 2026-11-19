# Writing Gherkin scenarios

Describe one behavior per scenario. Use the words a user would recognize and a
concrete example that makes the expected result clear.

- **Given** states the starting conditions that affect the result.
- **When** names the action or event that triggers the behavior.
- **Then** states an outcome the user or caller can observe.

Keep clicks, method calls, and storage details in the test code. Give a different
outcome, such as a rejected request, its own scenario.

```gherkin
Feature: Session token totals

  Scenario: Collecting the same session twice preserves its total
    Given a Codex session with 120 input tokens has already been collected
    When the collector reads that session again
    Then the reported input total for that session is still 120 tokens
```
