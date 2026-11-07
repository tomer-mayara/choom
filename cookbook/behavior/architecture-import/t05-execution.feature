@cr-001 @cr-001-t05 @browser @desktop-ui
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
