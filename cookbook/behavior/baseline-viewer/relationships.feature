@baseline-viewer @bv-05 @browser
Feature: Display recorded interfaces, resources, and relationships
  Choom shows one item for each recorded interface and resource.
  Ownership and permission are separate statements, each with its recorded status.

  Scenario: Show all records from the reviewed baseline
    Given the reviewed baseline is ready for its relationships to be shown
    When the user opens the prepared relationship baseline
    Then its eight interfaces and five resources appear with their recorded owners
    And the resource with no owner remains visible
    And all consumer policies are unknown with no consumer arrows
    And the relationship labels can be read without covering an item

  Scenario: Keep known consumers when an interface owner is unknown
    Given an interface has no known owner and explicitly permits Checkout
    When the user opens the prepared relationship baseline
    Then the interface appears without an ownership line
    And Checkout has a may use arrow to that interface

  Scenario: Keep records when there are no components
    Given a baseline has no components but has an unowned interface and resource
    When the user opens the prepared relationship baseline
    Then both records remain available and no component is invented

  Scenario: Keep ownership and permission separate for distinct interfaces
    Given two same-named interfaces have different recorded statuses and both permit their owner
    When the user opens the prepared relationship baseline
    Then each interface keeps its own ownership line and consumer arrows
    And each line shows the status of its defining statement
    And ownership and permission remain separate when their source is the same
    And the relationship labels can be read without covering an item

  Scenario: Keep long record text complete without repeating it on every link
    Given recorded items have long names and a long interface ID
    When the user opens the prepared relationship baseline
    Then their relationship descriptions shorten names and IDs and keep statuses
    And the complete names and IDs remain available in item details
