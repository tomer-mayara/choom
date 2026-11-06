Feature: Architecture integrity
  Architecture diagrams must refer to real nodes.

  Scenario: A connected architecture is accepted
    Given the starter architecture
    When the architecture is validated
    Then the architecture is accepted

  Scenario: A dangling connection is rejected
    Given the starter architecture
    And a connection to an unknown node
    When the architecture is validated
    Then the architecture is rejected
