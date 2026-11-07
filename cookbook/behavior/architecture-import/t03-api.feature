@cr-001-t03-api
Feature: Discover a repository through its declared manifests
  Scenario: Only linked declarations become components
    Given a repository declares a workspace containing several source directories
    And an unlinked component manifest exists elsewhere in the repository
    When the repository is discovered
    Then only the root and declared workspace are discovered
    And the source directories remain analyzer inputs

  Scenario: Manifest parents can differ from directory nesting
    Given a declared API component links to a sibling core directory
    When the repository is discovered
    Then the core component belongs to the API in the declaration tree

  Scenario: The selected directory is the discovery root
    Given only the selected directory's parent contains a component manifest
    When the repository is discovered
    Then discovery fails with "manifest-unreadable"

  Scenario: Child analyzer metadata creates no additional analysis
    Given a repository has analyzer metadata in a child manifest
    When the repository is discovered
    Then discovery selects only the root analyzer

  Scenario: Ordinary paths may contain spaces
    Given a repository uses spaces in its component and analyzer paths
    When the repository is discovered
    Then discovery preserves those path names

  Scenario Outline: Analyzer selection must be explicit
    Given a repository has "<problem>" in its root analyzer declaration
    When the repository is discovered
    Then discovery fails with "<code>"

    Examples:
      | problem                  | code                 |
      | no analyzer metadata     | missing-analyzer     |
      | two annotated analyzers  | multiple-analyzers   |
      | an unsupported enforcer  | unsupported-enforcer |
      | missing inputs           | invalid-input        |
      | an empty input list      | invalid-input        |
      | a missing source path    | invalid-input        |
      | a glob input             | invalid-input        |
      | a shell fragment input   | invalid-input        |

  Scenario Outline: Linked components must form one contained tree
    Given a repository has "<problem>" in its component declarations
    When the repository is discovered
    Then discovery fails with "<code>"

    Examples:
      | problem                    | code                |
      | an outside directory       | invalid-reference   |
      | an escaping directory link | invalid-reference   |
      | a repeated directory       | duplicate-component |
      | an ancestor link           | duplicate-component |
      | duplicate component names  | duplicate-component |
      | a child name mismatch      | name-mismatch       |
      | a missing child manifest   | manifest-unreadable |

  Scenario: Failure releases the repository session
    Given a repository has "no analyzer metadata" in its root analyzer declaration
    When the repository is discovered
    Then discovery closes its repository session
    And discovery reports a nonnegative duration

  Scenario: Success transfers the repository session to its caller
    Given a repository declares a workspace containing several source directories
    When the repository is discovered
    Then its caller receives an open repository session
    And discovery reports a nonnegative duration
