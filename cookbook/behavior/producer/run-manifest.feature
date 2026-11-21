@producer
Feature: The run manifest describes the selected records
  Each publisher refreshes the summary of the run. The summary names the
  selected records and the stages that are still pending. It counts recorded
  questions and gaps, and does not call them unresolved.

  Scenario: Publishing a Stage 4 draft makes the run summaries current
    Given a reviewed Stage 4 draft with 1 gap, no question, no inspected path and no file with an unknown owner
    And the run summaries say that the baseline is not yet recovered
    When the operator publishes the Stage 4 draft
    Then the run summaries cite the reviewed files of the Stage 4 entry analysis
    And the run summaries count 1 recorded gap, no question, no inspected path and no file with an unknown owner
    And the run summaries no longer say that the baseline is not yet recovered
