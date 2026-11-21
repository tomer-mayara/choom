@producer
Feature: Check a recovered result before Step 2 reads it
  The producer checks the records of a run before it publishes them, so that Step 2
  reads only a result that passes the completion checks of the design. A check that
  fails stops the publication and tells the operator which record to correct. A
  stage publishes its drafts as one update, with the run manifest last, so that a
  publication that stops leaves the drafts as they were.

  Scenario: A question about a component that the draft renamed is refused before Stage 5 closes
    Given a Stage 4 draft with a question about a component that the draft renamed
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which question names a subject that names nothing

  Scenario: An inspected path that cites a source range that no review read is refused
    Given a Stage 4 draft whose inspected path cites an excerpt that the review did not read
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which step of the inspected path cites the excerpt

  Scenario: A published Stage 4 draft has current run summaries
    Given a reviewed Stage 4 draft of a run whose summaries describe Stage 3
    When the operator publishes the Stage 4 draft
    Then the run summaries name the published Stage 4 records with their current counts
    And the run summaries no longer say that the baseline is not yet recovered

  Scenario: A Stage 2 analysis that records no gap for a Knip analysis that did not run is refused
    Given a Stage 2 attempt in which Knip did not run
    When the operator publishes an entry analysis that records no gap about the Knip result
    Then the analysis is refused and the drafts stay unchanged
    And the operator is told which Knip record a gap must cite

  Scenario: A Stage 2 publication that stops before the run manifest changes leaves the drafts as they were
    Given a Stage 2 attempt that is ready to publish
    And the run manifest cannot be replaced
    When the operator publishes the Stage 2 attempt
    Then the publication is refused and the run folder outside the attempt is as it was
    And the operator is told to keep the attempt and use a new attempt ID
