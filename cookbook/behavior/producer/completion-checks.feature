@producer
Feature: Check a recovered result before Step 2 reads it
  The producer checks the records of a run before it publishes them, so that Step 2
  reads only a result that passes the completion checks of the design. A check that
  fails stops the publication and tells the operator which record to correct. A
  stage publishes its drafts as one update, with the run manifest last, so that a
  publication that stops leaves the drafts as they were.

  Scenario: A question about a renamed component is refused
    Given a Stage 4 draft that renames the component http to web and asks a question about http.purpose
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told that the question names http.purpose, which names nothing in the run

  Scenario: An inspected path step that rests on an unread excerpt is refused
    Given a Stage 4 draft whose order path cites, in step 2, a saved excerpt of cli.ts that the review did not read
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told that step 2 of the order path cites the unread excerpt of cli.ts

  Scenario: Publishing a Stage 4 draft makes the run summaries current
    Given a reviewed Stage 4 draft with 1 gap, no question, no inspected path and no file with an unknown owner
    And the run summaries say that the baseline is not yet recovered
    When the operator publishes the Stage 4 draft
    Then the run summaries cite the reviewed files of the Stage 4 entry analysis
    And the run summaries count 1 recorded gap, no question, no inspected path and no file with an unknown owner
    And the run summaries no longer say that the baseline is not yet recovered

  Scenario: A Stage 2 analysis with no gap for an unsupported Knip profile is refused
    Given a Stage 2 attempt s2-check whose Knip preflight marks the profile unsupported, because the snapshot has no package manifest
    And the saved entry analysis of the attempt records no gap
    When the operator publishes the Stage 2 attempt
    Then the publication is refused and the run folder outside the attempt is as it was
    And the operator is told to record a gap that cites s2-check-preflight

  Scenario: A Stage 2 publication that stops before the run manifest changes leaves the drafts as they were
    Given a Stage 2 attempt that is ready to publish
    And the replacement of the run manifest fails
    When the operator publishes the Stage 2 attempt
    Then the publication is refused and the run folder outside the attempt is as it was
    And the operator is told to keep the attempt and use a new attempt ID
