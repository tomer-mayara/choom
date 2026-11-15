@producer
Feature: Recover an architecture baseline with the producer
  The producer saves a checked baseline and discovery result from one snapshot.

  Scenario: Save a recovered baseline from reviewed Stage 5 records
    Given a reviewed Stage 5 draft for a small fixture repository
    When the operator saves the result
    Then a fixed baseline and discovery result are saved by digest
    And every statement in the baseline stays proposed
    And the run records that recovery is complete

  Scenario: Refuse records that fail the completion checks
    Given a reviewed Stage 5 draft in which a file has two owners
    When the operator saves the result
    Then nothing is saved
    And the operator is told which file has two owners

  Scenario: The run records which producer code ran
    Given a new run
    When the operator starts Stage 1
    Then the run records the producer version and a digest of its code

  Scenario: A changed producer cannot continue a run
    Given a run that started with one version of the producer code
    And the producer code has changed since then
    When the operator starts the next stage action
    Then the action is refused
    And the operator is told that the producer code changed
