@producer
Feature: Bind the discovery result to the saved baseline
  Stage 6 saves the discovery result with the SHA-256 of the baseline file that it
  saves. A baseline ID alone can name the wrong file, because IDs repeat across
  runs. The digest names the exact baseline file, and Stage 6 verify refuses a
  discovery result whose digest does not match the saved baseline.

  Scenario: A completed Stage 6 run saves the digest of the saved baseline in the discovery result
    Given a reviewed Stage 5 run that is ready for Stage 6
    When the operator saves the fixed records through the command line
    Then the saved discovery result has format version 2 and names the saved baseline
    And its baseline digest is the SHA-256 of the saved baseline file

  Scenario Outline: Verify refuses a discovery result that does not match the saved baseline
    Given a run that Stage 6 completed through the command line
    And <change>
    When the operator verifies the Stage 6 result
    Then the verification is refused and no file of the run changes
    And the operator is told that the baseline digest of the discovery result does not match the saved baseline

    Examples:
      | change                                                        |
      | the discovery result of the run names another baseline digest |
      | the saved baseline file of the run changed after Stage 6      |
