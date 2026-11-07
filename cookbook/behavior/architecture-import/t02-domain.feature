@cr-001-t02-domain
Feature: Preserve the meaning of repository architecture
  Scenario: A component owns files in ordinary subdirectories
    Given the declared workspace reports files and imports across three subdirectories
    When the architecture document is built
    Then only the declared components appear, with three files in the workspace
    And the workspace's internal imports create no relationships

  Scenario: The deepest containing declaration owns each file
    Given declarations for the workspace and domain are siblings in the manifest tree
    And reported files are in the root, domain, and a similarly named directory
    When the architecture document is built
    Then the root, workspace, and domain each own one reported file
    And the domain declaration still has the root as its parent

  Scenario: One relationship preserves each file pair and import variant
    Given the interface imports core through two file pairs with mixed and unreported flags
    When the architecture document is built
    Then one interface-to-core relationship records both file pairs and their distinct variants

  Scenario: Observation order leaves the resulting document unchanged
    Given the interface imports core through two file pairs with mixed and unreported flags
    When architecture documents are built from the same observations in different orders
    Then both documents are identical

  Scenario: Findings retain direction and ordered paths without a visible import
    Given a folder finding reports source and target roles, a cycle, a via path, and metrics
    When the architecture document is built
    Then the finding keeps its roles, ordered paths, and metric values
    And the finding creates no relationships

  Scenario: A saved document can describe a dependency cycle in any collection order
    Given a saved architecture document with imports in both directions and shuffled components
    When the architecture document is validated
    Then both directed imports and the declared components appear in canonical order

  Scenario Outline: A saved architecture document must be internally consistent
    Given a saved architecture document with "<defect>"
    When the architecture document is validated
    Then the architecture document is rejected

    Examples:
      | defect                                      |
      | a missing root declaration                  |
      | a cycle of parent declarations              |
      | two imports for the same ordered pair       |
      | an evidence file owned by another component |
      | a repeated evidence variant                 |
      | a noncanonical relationship identifier      |
      | an unknown semantic field                   |
