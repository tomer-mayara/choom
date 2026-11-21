@producer
Feature: Unavailable analysis is a visible gap
  Each tool result that is unavailable, unsupported, skipped, failed or partial
  gives a gap that cites it. The review copies that gap exactly. A stage refuses
  a review that leaves it out.

  Scenario: A skipped Knip run gives a gap that the review must copy
    Given a Stage 2 attempt in which Knip is skipped because the snapshot has no package manifest
    When the operator runs Knip for the attempt
    Then the attempt lists one required gap for each skipped Knip run
    And each required gap cites its Knip run record and gives the reason of the skip

  Scenario: Stage 2 refuses a review that leaves out a required gap
    Given a Stage 2 attempt with a required gap for a skipped Knip run
    And a Stage 2 review that leaves out that gap
    When the operator finishes Stage 2
    Then the Stage 2 result is not published
    And the operator is told which required tool gap is missing
