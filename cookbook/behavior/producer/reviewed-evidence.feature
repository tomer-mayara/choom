@producer
Feature: Explanations cite the source that a review read
  A requested excerpt is not a reviewed range. A behavior entry, a resource
  access site and an inspected path cite reviewed ranges of the selected history.

  Scenario: A behavior entry that cites an excerpt that no review read is refused
    Given a Stage 4 draft whose behavior entry cites a requested excerpt of its lines that no reviewed range names
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which behavior entry does not cite a reviewed range

  Scenario: An inspected path step that rests on an unread excerpt is refused
    Given a Stage 4 draft whose order path cites, in step 2, a saved excerpt of cli.ts that the review did not read
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told that step 2 of the order path cites the unread excerpt of cli.ts
