@baseline-viewer @br-11 @br-11a
Feature: Read saved source uses without changing permission
  Scenario: Read source use independently from permission
    Given a version 3 baseline with source use and unknown permission
    When the public decoder reads the source-use baseline
    Then it retains all source uses and the unchanged permission

  Scenario Outline: Keep old formats strict
    Given a version <version> baseline with source-use fields
    When the public decoder reads the source-use baseline
    Then it rejects the source-use baseline as invalid

    Examples:
      | version |
      | 1       |
      | 2       |

  Scenario: Source-use records are optional
    Given a version 3 baseline without source-use fields
    When the public decoder reads the source-use baseline
    Then it retains all source uses and the unchanged permission

  Scenario Outline: Reject malformed source-use data
    Given source-use data with <defect>
    When the public decoder reads the source-use baseline
    Then it reports the affected source-use field

    Examples:
      | defect                                 |
      | duplicate interface assessments        |
      | duplicate use IDs                      |
      | a missing component                    |
      | a missing interface                    |
      | a blank mapping reference              |
      | an unlocated caller                    |
      | unlocated binding evidence             |
      | a fragmented use reference             |
      | a different source snapshot            |
      | conflicting entry and access bindings  |
      | an unsupported kind                    |
      | an unsupported context                 |
      | too many uses                          |
      | excessive text bytes                   |
      | invalid inherited documentation        |
