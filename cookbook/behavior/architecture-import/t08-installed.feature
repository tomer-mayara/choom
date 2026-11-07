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
    And the viewing machine has neither the repository nor analyzer tools
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
