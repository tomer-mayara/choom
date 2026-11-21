@producer
Feature: Unavailable analysis is a visible gap
  Each tool result that is unavailable, unsupported, skipped, failed or partial
  gives a gap that cites it. The review copies that gap exactly. A stage refuses
  a review that leaves it out.

  Scenario: A Stage 2 analysis with no gap for an unsupported Knip profile is refused
    Given a Stage 2 attempt s2-check whose Knip preflight marks the profile unsupported, because the snapshot has no package manifest
    And the saved entry analysis of the attempt records no gap
    When the operator publishes the Stage 2 attempt
    Then the publication is refused and the run folder outside the attempt is as it was
    And the operator is told to record a gap that cites s2-check-preflight
