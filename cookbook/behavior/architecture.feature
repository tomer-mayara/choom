Feature: Architecture integrity
  The architecture parser accepts named graphs with unique node and edge IDs.
  It checks references, but does not require a connected or acyclic graph.

  Scenario: A connected architecture is accepted
    Given the starter architecture
    When the architecture is validated
    Then the architecture is accepted

  Scenario: A dangling connection is rejected
    Given the starter architecture
    And a connection to an unknown node
    When the architecture is validated
    Then the architecture is rejected

  Scenario: A connection from an unknown node is rejected
    Given the starter architecture
    And a connection from an unknown node
    When the architecture is validated
    Then the architecture is rejected

  Scenario Outline: Reused identifiers are rejected
    Given the starter architecture
    And a duplicate <kind> identifier
    When the architecture is validated
    Then the architecture is rejected

    Examples:
      | kind |
      | node |
      | edge |

  Scenario Outline: Required text cannot be empty
    Given the starter architecture
    And an empty <field>
    When the architecture is validated
    Then the architecture is rejected

    Examples:
      | field       |
      | name        |
      | node ID     |
      | node label  |
      | edge ID     |
      | edge source |
      | edge target |

  Scenario: An architecture must contain at least one node
    Given the starter architecture
    And no nodes or connections
    When the architecture is validated
    Then the architecture is rejected

  Scenario: Disconnected nodes are accepted
    Given the starter architecture
    And no connections
    When the architecture is validated
    Then the architecture is accepted

  Scenario: A self connection is accepted
    Given the starter architecture
    And a connection from the interface node to itself
    When the architecture is validated
    Then the architecture is accepted

  Scenario: A cycle is accepted
    Given the starter architecture
    And a connection from the domain node back to the interface node
    When the architecture is validated
    Then the architecture is accepted

  Scenario: Whitespace text is preserved
    Given an architecture with whitespace as its name, node ID, and label
    When the architecture is validated
    Then the architecture is accepted
    And the parsed architecture preserves the whitespace

  Scenario: Unknown fields are removed from parsed objects
    Given the starter architecture
    And extra fields on the architecture, its first node, and its first connection
    When the architecture is validated
    Then the architecture is accepted
    And the parsed architecture contains only the starter fields
