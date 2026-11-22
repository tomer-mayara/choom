@producer
Feature: Questions and gaps name things that the run saved
  A subject names a snapshot file or folder, the snapshot ID, a question or gap,
  an entry candidate, or a baseline item. An entry candidate is one of an entry
  analysis that the run registers, also of an earlier attempt, or of the record
  that the stage checks. The shared record checks refuse a question or gap whose
  subject names nothing, also when a later change orphans an earlier subject.
  Stages 1 to 3 refuse such a question or gap, and such an inspection priority,
  when they add it.

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

  Scenario: A question about an entry candidate of an earlier attempt stays valid
    Given a Stage 4 draft that keeps a question about an entry candidate of an earlier Stage 2 attempt
    When the operator publishes the Stage 4 draft
    Then the Stage 4 draft is published

  Scenario Outline: An early stage refuses a gap whose subject names nothing
    Given a <stage> review with a new gap whose subject is "src/no-such-file.ts"
    When the operator finishes <stage>
    Then the <stage> result is not published
    And the operator is told that the subject "src/no-such-file.ts" of the gap names nothing

    Examples:
      | stage   |
      | Stage 1 |
      | Stage 2 |
      | Stage 3 |

  Scenario: An inspection priority names something
    Given a Stage 3 review whose inspection priority names "nothing-here"
    When the operator finishes Stage 3
    Then the Stage 3 result is not published
    And the operator is told which inspection priority names nothing
