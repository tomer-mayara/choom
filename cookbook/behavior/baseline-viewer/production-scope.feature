@baseline-viewer @cr005
Feature: Inspect the selected production scope

  @browser @a3-2
  Scenario: A fixture is hidden until the reader opts in
    Given the new baseline contains a production port and an in-memory test adapter
    When I open the file and turn on Show non-production
    Then the adapter first appears after opt-in with the visible and accessible label Test component
    And its uses appear as test uses

  @browser @a3-3
  Scenario: A reader turns the switch off while inspecting a fixture
    Given a selected test fixture with all connections and an evidence panel open
    When I return to Production
    Then its node, edge, text, counts and history entry disappear and focus returns to a visible control

  @browser @a3-4
  Scenario: Production code imports a forbidden test fixture
    Given a production caller with a proven forbidden dependency on a test helper
    When I open its finding in Production
    Then I see the caller and a safe rule description
    And opt-in reveals the helper, the raw import and its test label

  @browser @a4-1
  Scenario: An older nonempty model has no role classification
    Given a valid v4 baseline with unclassified components
    When I open the file
    Then I see Production scope unavailable and can opt in to its original inventory under Scope unknown
