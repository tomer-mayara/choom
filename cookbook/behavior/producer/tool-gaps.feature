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

  Scenario: A Stage 2 analysis with no gap for an unsupported Knip profile is refused
    Given a Stage 2 attempt s2-check whose Knip preflight marks the profile unsupported, because the snapshot has no package manifest
    And the saved entry analysis of the attempt records no gap
    When the operator publishes the Stage 2 attempt
    Then the publication is refused and the run folder outside the attempt is as it was
    And the operator is told to record a gap that cites s2-check-preflight
