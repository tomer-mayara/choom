@cr-001 @cr-001-t01 @packaged @packaged-smoke
Feature: Retain the installed application's repository selection
  Scenario: Cancelling another repository selection preserves the selection
    Given Choom is installed independently of its development checkout
    And "Atlas" is my selected repository
    When I cancel choosing another repository
    Then "Atlas" remains selected
