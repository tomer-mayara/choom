@producer
Feature: Questions and gaps name things that the run saved
  A subject names a snapshot file or folder, the snapshot ID, a question or gap,
  an entry candidate, or a baseline item. The shared record checks refuse a
  question or gap whose subject names nothing, also when a later change orphans
  an earlier subject.

  Scenario Outline: A Stage 4 or 5 draft with a gap whose subject names nothing is refused
    Given a <stage> draft with a new gap whose subject is "src/no-such-file.ts"
    When the operator publishes the <stage> draft
    Then the draft is refused
    And the operator is told that the subject "src/no-such-file.ts" of the gap names nothing

    Examples:
      | stage   |
      | Stage 4 |
      | Stage 5 |

  Scenario: A change that orphans an earlier subject is refused at the stage that makes it
    Given a Stage 4 run with a question about the interface "billing-api"
    And a Stage 5 draft that removes the interface "billing-api"
    When the operator publishes the Stage 5 draft
    Then the draft is refused
    And the operator is told which question names the removed interface

  Scenario Outline: Each form of subject is accepted
    Given a Stage 4 draft with a new question whose subject is <subject>
    When the operator publishes the Stage 4 draft
    Then the Stage 4 draft is published

    Examples:
      | subject                              |
      | the ID of a component                |
      | the purpose statement of a component |
      | a snapshot file                      |
      | the snapshot folder "src/**"         |
      | the snapshot ID                      |
      | the ID of an earlier gap             |
      | the ID of an entry candidate         |

  Scenario Outline: An early stage refuses a gap whose subject names nothing
    Given a <stage> review with a new gap whose subject is "src/no-such-file.ts"
    When the operator finishes <stage>
    Then the <stage> result is not published
    And the operator is told that the subject "src/no-such-file.ts" of the gap names nothing

    Examples:
      | stage   |
      | Stage 1 |
      | Stage 2 |
