@cr-001 @cr-001-t03 @browser @desktop-ui
Feature: Discover the explicitly declared repository
  Scenario: Discover declarations rather than source directories
    Given the root manifest declares only child "src" and that child's manifest declares no children
    And the analyzer inputs are ordinary directories "src/components" and "src/lib"
    And an unlinked component manifest exists in "experiments"
    When I load the repository
    Then the document contains only components "." and "src"

  Scenario: Resolve a contained parent reference from its manifest
    Given the root manifest declares a child at "src/api"
    And that child's manifest declares a child at "../core"
    When I load the repository
    Then the document includes components "src/api" and "src/core"
    And "src/core" has "src/api" as its parent component

  Scenario: The selected directory must contain the root manifest
    Given the selected directory has no "component.yaml"
    And its parent directory has a component manifest
    When I load the selected directory
    Then loading is refused for the missing selected-root manifest

  Scenario Outline: Require one explicit supported analyzer declaration
    Given the root manifest has <declaration>
    When I load the repository
    Then loading is refused because <reason>

    Examples:
      | declaration                                 | reason                                  |
      | no annotated analyzer                       | an enforcer declaration is required     |
      | two annotated analyzers                     | exactly one root analyzer is supported  |
      | an unsupported enforcer                     | the declared enforcer is unsupported    |
      | dependency-cruiser without inputs           | explicit source inputs are required     |
      | dependency-cruiser with an empty input list | at least one source input is required   |
      | an input path that does not exist           | source inputs must exist                |
      | a glob as a source input                    | source inputs must be files or folders  |
      | a shell fragment as a source input          | source inputs must be files or folders  |

  Scenario Outline: Reject component references that cannot form the declared tree
    Given a component reference <defect>
    When I load the repository
    Then loading is refused because <reason>

    Examples:
      | defect                                      | reason                                  |
      | resolves outside the selected repository    | manifest references must stay inside it |
      | uses a symlink that resolves outside it     | manifest references must stay inside it |
      | links an already declared directory         | component directories must be unique    |
      | links back to an ancestor                   | child links must not form cycles        |
      | names a child differently from its manifest | child names must match their manifests  |
      | points to a missing child manifest          | each declared child needs a manifest    |
