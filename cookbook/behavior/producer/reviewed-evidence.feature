@producer
Feature: Explanations cite the source that a review read
  A requested excerpt is not a reviewed range. A behavior entry, a resource
  access site and an inspected path cite reviewed ranges of the selected history.

  Scenario: A behavior entry that cites an excerpt that no review read is refused
    Given a Stage 4 draft whose behavior entry cites a requested excerpt of its lines that no reviewed range names
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which behavior entry does not cite a reviewed range

  Scenario: An inspected path step that cites only unread evidence is refused
    Given a Stage 4 draft with an inspected path whose second step cites only an excerpt that no reviewed range names
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which step of the inspected path has no reviewed source

  Scenario: An inspected path names only components that its review covers
    Given a Stage 4 draft with an inspected path that names a component whose files no cited reviewed range covers
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which component of the inspected path has no reviewed source

  Scenario: An inspected path with reviewed steps is published
    Given a Stage 4 draft with an inspected path whose steps each cite a reviewed range
    When the operator publishes the Stage 4 draft
    Then the Stage 4 draft is published with the inspected path
