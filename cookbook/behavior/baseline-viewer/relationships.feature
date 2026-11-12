@baseline-viewer @baseline-readability @bv-05 @br-02 @browser
Feature: Inspect recorded interfaces, resources, and relationships
  Baseline details keeps all interfaces and resources available.
  Ownership and permission stay separate, with their recorded status and references.

  Scenario: Inspect all records from the reviewed baseline
    Given the reviewed baseline is ready for relationship inspection
    When the user opens the prepared relationship baseline
    Then its eight interfaces and five resources can be inspected with their recorded owners
    And the resource with no owner remains available
    And all consumer policies remain unknown

  Scenario: Keep known consumers when an interface owner is unknown
    Given an interface has no known owner and explicitly permits Checkout
    When the user opens the prepared relationship baseline
    Then the interface owner remains unknown and Checkout remains an allowed consumer
    And each ownership and permission statement keeps its own status and references

  Scenario: Keep records when there are no components
    Given a baseline has no components but has an unowned interface and resource
    When the user opens the prepared relationship baseline
    Then both records remain available and no component is invented

  Scenario: Keep ownership and permission separate for distinct interfaces
    Given two same-named interfaces have different recorded statuses and both permit their owner
    When the user opens the prepared relationship baseline
    Then both same-named interfaces remain distinct in Baseline details
    And each ownership and permission statement keeps its own status and references
    And the owner is also listed as an allowed consumer for each interface

  Scenario: Keep long record text complete with bounded component names
    Given recorded items have long names and a long interface ID
    When the user opens the prepared relationship baseline
    Then the long component name stays inside its compact header
    And the complete names and IDs remain available in item details

  Scenario: Keep long component names bounded with larger text
    Given recorded items have long names and a long interface ID
    And the user has increased text size by 25 percent
    When the user opens the prepared relationship baseline
    Then the long component name stays inside its compact header
    And the complete names and IDs remain available in item details
