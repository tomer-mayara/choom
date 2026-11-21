@producer
Feature: Check a recovered result before Step 2 reads it
  The producer checks the records of a run before it publishes them, so that Step 2
  reads only a result that passes the completion checks of the design. A check that
  fails stops the publication and tells the operator which record to correct.

  Scenario: A question about a component that the draft renamed is refused before Stage 5 closes
    Given a Stage 4 draft with a question about a component that the draft renamed
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which question names a subject that names nothing
