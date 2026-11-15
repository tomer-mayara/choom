@producer
Feature: Record human decisions about a baseline
  Only a decision by a named person can accept or correct a statement.

  Scenario: A person accepts selected statements
    Given a saved baseline with proposed statements
    And a decision file in which a named person accepts two of the statements
    When the decisions are recorded
    Then the record names the person, the time and the two statements

  Scenario: A person corrects a statement
    Given a saved baseline in which the Billing purpose is proposed
    And a decision file that corrects the Billing purpose
    When the decisions are recorded
    Then the record keeps the old value, the new value and the person

  Scenario: The model of the run cannot decide
    Given a decision file whose decider is a model named in the run's LLM records
    When the decisions are recorded
    Then the decisions are refused

  Scenario: A correction of an old value is refused
    Given a decision file whose correction names a value that the baseline does not have
    When the decisions are recorded
    Then the decisions are refused
    And the operator is told which statement is different
