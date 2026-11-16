@producer
Feature: Save only the visible LLM response

  Scenario: A response with a reasoning block is refused
    Given an LLM call record whose saved response contains a reasoning block
    When the operator finishes the stage
    Then the stage is not published
    And the operator is told to save only the visible response

  Scenario: A visible response is accepted
    Given an LLM call record whose saved response has only the visible answer
    When the operator finishes the stage
    Then the stage is published
    And the call record says that hidden reasoning was not saved
