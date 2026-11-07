@cr-001 @cr-001-t02 @browser
Feature: Describe component ownership and imports faithfully
  @desktop-ui
  Scenario: One declared component owns several subdirectories
    Given only components "." and "src" are declared
    And the reported files are "src/components/panel.ts", "src/lib/format.ts", and "src/hooks/use-model.ts"
    And those files import one another
    When I load the repository
    Then the diagram contains only component cards "." and "src"
    And "src" has a reported-file count of 3
    And those imports create no inter-component relationships

  @desktop-ui
  Scenario: Attribute files to the deepest containing declared component
    Given components ".", "src", and "src/domain" are declared
    And "src/domain-extra" is not declared as a component
    And the reported files are "config.ts", "src/domain-extra/tool.ts", and "src/domain/model.ts"
    When I load the repository
    Then the reported-file counts are:
      | component  | count |
      | .          | 1     |
      | src        | 1     |
      | src/domain | 1     |

  @desktop-ui
  Scenario: Aggregate file pairs without merging their import variants
    Given "src/ui" and "src/core" are declared components
    And "src/ui/a.ts" has reported imports to "src/core/model.ts" with typeOnly true and false
    And "src/ui/b.ts" also imports "src/core/model.ts"
    When I load the repository
    Then there is one import from "src/ui" to "src/core" with two evidence file pairs
    And the pair from "src/ui/a.ts" retains both typeOnly variants

  @desktop-ui
  Scenario: An unreported import flag remains unknown
    Given "src/ui" and "src/core" are declared components
    And an import from "src/ui/app.ts" to "src/core/model.ts" has no reported typeOnly flag
    When I load the repository
    Then that evidence variant has no typeOnly value

  @desktop-ui
  Scenario: Dependency cycles remain describable
    Given declared components "src/a" and "src/b" import each other
    When I load the repository
    Then the document contains both directed imports

  @desktop-ui
  Scenario: Repeated observations keep their identity
    Given the component declarations and reported imports have not changed
    When I load the repository again
    Then its component and relationship identifiers are unchanged
    And its evidence contains the same file pairs and variants

  Scenario: Diagnostic direction does not depend on subject order
    Given a Choom YAML finding lists target "src/a.ts" before source "src/z.ts"
    When I open the document
    Then the finding still identifies "src/z.ts" as source and "src/a.ts" as target

  Scenario Outline: Reject inconsistent architecture documents
    Given a version-1 Choom YAML document has <defect>
    When I open the document
    Then loading is refused because <reason>

    Examples:
      | defect                                      | reason                                    |
      | two components with the same ID             | component IDs must be unique              |
      | two components with the same name           | component names must be unique            |
      | no root component                           | the root component is required            |
      | a parent that is not a component            | parents must reference components         |
      | a cycle of parent references                | parent references must form a tree        |
      | an import to an unknown component           | imports must reference components         |
      | an import from a component to itself        | component imports must have distinct ends |
      | two relationships for the same ordered pair | component imports must be aggregated      |
      | evidence owned by a different source        | evidence must match its component import  |
      | a negative reported-file count              | reported-file counts cannot be negative   |
      | a fractional reported-file count            | reported-file counts must be integers     |
