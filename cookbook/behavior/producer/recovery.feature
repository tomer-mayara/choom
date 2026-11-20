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

  Scenario: The producer and the viewer agree on a baseline
    Given a reviewed Stage 5 draft
    When the operator saves the result
    Then the viewer accepts the saved baseline without errors

  Scenario: A reserved ID is refused before Stage 5 closes
    Given a Stage 4 draft with a component whose ID is the baseline ID
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which ID is reserved

  @review-evidence
  Scenario: Review the traversal evidence for each dependency graph pass
    Given a saved analysis with overlapping graph roots and a dependency outside the snapshot
    When the operator collects the Stage 4 review evidence
    Then the saved review prompt shows the scanned files, roots, reached files and stopped edges for each pass by count
    And only the import pass traverses the import to the second file
    And the reviewer can identify passes with the same root paths and find the evidence for each pass

  @review-evidence
  Scenario: Choose files to inspect for the remaining ownership decisions
    Given a saved mapping with files that have owners and files with unknown owners
    And an earlier stage reviewed a file outside the selected Stage 4 ranges
    When the operator collects the Stage 5 review evidence
    Then the saved prompt counts files in each ownership group by where a reviewed source range was recorded
    And the reviewer can find files with only earlier ranges or no range in the entry-analysis history
    And the historical-only file points to its reviewed range in the earlier entry analysis
