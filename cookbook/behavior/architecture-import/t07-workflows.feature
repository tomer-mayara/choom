@cr-001 @cr-001-t07 @browser
Feature: Keep one current diagram throughout loading
  @desktop-ui
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

  @desktop-ui
  Scenario: Cancellation still applies after analysis completes
    Given "Previous" is displayed
    And analysis for "Next" has completed but its diagram is not yet ready
    When I cancel the load
    Then "Previous" remains displayed
    And the load ends as cancelled

  @desktop-ui
  Scenario: A cancelled result cannot replace a newer diagram
    Given the load of "Abandoned" was cancelled
    And "Current" has since finished loading
    When a result from "Abandoned" becomes available
    Then "Current" remains displayed

  @desktop-ui
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

  @desktop-ui
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
