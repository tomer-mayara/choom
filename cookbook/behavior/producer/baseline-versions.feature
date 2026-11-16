@producer
Feature: Make a new baseline version
  Recorded human decisions make the next version of a saved baseline. The earlier
  version and its discovery result do not change.

  Scenario: Recorded decisions make a new version
    Given a saved baseline and a recorded decision that accepts two statements and corrects one
    When the operator makes the next baseline version
    Then the new version names the earlier version as its parent
    And the decided statements are accepted and refer to the decision record
    And the corrected statement has the new value
    And the earlier version and its discovery result do not change

  Scenario: The viewer accepts the new version
    Given a baseline version made from recorded decisions
    When a caller validates it for viewing
    Then the decided statements are accepted with their reference
