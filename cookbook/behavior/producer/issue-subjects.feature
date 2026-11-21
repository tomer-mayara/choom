@producer
Feature: Questions and gaps name things that the run saved
  A subject names a snapshot file or folder, the snapshot ID, a question or gap,
  an entry candidate, or a baseline item. The shared record checks refuse a
  question or gap whose subject names nothing, also when a later change orphans
  an earlier subject.

  Scenario: A question about a renamed component is refused
    Given a Stage 4 draft that renames the component http to web and asks a question about http.purpose
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told that the question names http.purpose, which names nothing in the run
