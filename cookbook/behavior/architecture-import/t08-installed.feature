@cr-001 @cr-001-t08 @packaged
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
