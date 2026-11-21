@producer
Feature: Publish the drafts of a run as one update
  A stage replaces the working drafts as one update. It replaces the run
  manifest last. If a step fails, the stage restores the drafts that it had
  replaced, so the last published drafts stay.

  Scenario: A failed Stage 3 publication keeps the last published drafts
    Given a run that is ready for Stage 3 to publish
    And a fault that stops the publication after its first rename
    When the operator finishes Stage 3
    Then the Stage 3 result is not published
    And the run manifest and the discovery draft are the same as before

  Scenario: A failed Stage 2 publication keeps the last published drafts
    Given a run that is ready for Stage 2 to publish
    And a fault that stops the publication after its first rename
    When the operator finishes Stage 2
    Then the Stage 2 result is not published
    And the run manifest and the discovery draft are the same as before
