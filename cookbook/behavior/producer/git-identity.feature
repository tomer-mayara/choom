@producer
Feature: Save Git identity with a snapshot
  The producer records the Git commit, the branch and the local changes of the target with its snapshot.
  A target without Git evidence is still captured, with a gap.

  Scenario: A Git repository records its commit and local changes
    Given a target repository with one commit and one file changed after it
    When the operator captures a snapshot
    Then the snapshot record names the commit
    And it lists the changed file

  Scenario: A folder without Git is still captured
    Given a target folder that is not a Git repository
    When the operator captures a snapshot
    Then the snapshot is captured
    And a gap says that Git evidence is not available
