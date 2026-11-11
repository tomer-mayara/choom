@baseline-viewer @bv-01
Feature: Validate a saved architecture baseline
  Choom reads recorded intent without running an analysis or accepting a proposal.

  Scenario: Read recorded intent without changing it
    Given a supported baseline with proposed and accepted statements
    And its evidence and acceptance records are not available
    When a caller validates it for viewing
    Then its values, statuses, and references are preserved
    And no statement changes status

  Scenario Outline: Reject invalid baseline data
    Given an otherwise valid baseline with <problem>
    When a caller validates it for viewing
    Then validation identifies the invalid item or field

    Examples:
      | problem                                     |
      | a duplicate item ID                         |
      | a parent ID that does not exist              |
      | an owner ID that does not exist               |
      | a consumer ID that does not exist            |
      | a cycle of component parents                |
      | an accepted statement without its reference |
      | an unsupported membership selector          |

  Scenario Outline: Read the reviewed baseline files
    Given the reviewed <example> baseline
    When a caller validates it for viewing
    Then all recorded architecture items are preserved

    Examples:
      | example |
      | empty   |
      | full    |
