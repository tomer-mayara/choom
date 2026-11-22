@producer
Feature: The run manifest describes the selected records
  Each publisher refreshes the summary of the run. The summary names the
  selected records and the stages that are still pending. It counts recorded
  questions and gaps, and does not call them unresolved.

  Scenario: After Stage 4 the summary describes the Stage 4 records
    Given a Stage 4 draft
    When the operator publishes the Stage 4 draft
    Then the run summary names the Stage 4 entry analysis for the reviewed source ranges
    And it says that Stages 5 and 6 are pending
    And it does not say that the baseline is not yet recovered
