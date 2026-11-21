@producer
Feature: Publish the drafts of a run as one update
  A stage replaces the working drafts as one update. It replaces the run
  manifest last. If a step fails, the stage restores the drafts that it had
  replaced, so the last published drafts stay.

  Scenario: A Stage 2 publication that stops before the run manifest changes leaves the drafts as they were
    Given a Stage 2 attempt that is ready to publish
    And the replacement of the run manifest fails
    When the operator publishes the Stage 2 attempt
    Then the publication is refused and the run folder outside the attempt is as it was
    And the operator is told to keep the attempt and use a new attempt ID
