@producer
Feature: The run manifest describes the selected records
  Each publisher refreshes the summary of the run. The summary names the
  selected records and counts the recorded questions and gaps. It does not call
  them unresolved. It does not give the state of a stage, because `progress` has
  the state of each stage.

  Scenario: After Stage 4 the summary describes the Stage 4 records
    Given a Stage 4 draft
    When the operator publishes the Stage 4 draft
    Then the run summary names the Stage 4 entry analysis for the reviewed source ranges
    And it does not say that the baseline is not yet recovered

  Scenario: The completed run counts recorded questions and gaps
    Given a reviewed Stage 5 draft with one question, one gap and a later gap that names the first gap
    When the operator saves the result
    Then the run summary says that the discovery result records 1 question and 2 gaps, with history and linked notes
    And it does not call them unresolved
