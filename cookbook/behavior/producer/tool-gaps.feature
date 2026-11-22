@producer
Feature: Unavailable analysis is a visible gap
  Each tool result that is unavailable, unsupported, skipped, failed or partial
  gives a gap that cites it. The review copies that gap exactly. A stage refuses
  a review that leaves it out.

  Scenario: A skipped Knip run gives a gap that the review must copy
    Given a Stage 2 attempt in which Knip is skipped because the snapshot has no package manifest
    When the operator runs Knip for the attempt
    Then the attempt lists one required gap for each skipped Knip run
    And each required gap cites its Knip run record and gives the reason of the skip

  Scenario: Stage 2 refuses a review that leaves out a required gap
    Given a Stage 2 attempt with a required gap for a skipped Knip run
    And a Stage 2 review that leaves out that gap
    When the operator finishes Stage 2
    Then the Stage 2 result is not published
    And the operator is told which required tool gap is missing

  Scenario Outline: Stage 3 refuses a review that leaves out the gap of a tool result
    Given a Stage 3 attempt whose <record> is <outcome>
    And a Stage 3 review that leaves out the required gap of the <record>
    When the operator finishes Stage 3
    Then the Stage 3 result is not published
    And the operator is told which required tool gap is missing

    Examples:
      | record          | outcome                                     |
      | symbol mentions | partial                                     |
      | symbol mentions | unavailable                                 |
      | exports record  | missing a declaration file that it names    |

  Scenario: Stage 4 refuses a review that leaves out the gap of a candidate record
    Given a Stage 4 collection whose behavior entry candidates record a settings value that is not a literal
    And a Stage 4 review that leaves out the required gap of that value
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which required tool gap is missing
