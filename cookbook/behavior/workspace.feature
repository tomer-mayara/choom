@browser
Feature: Baseline workspace starter
  The starter baseline uses the same viewer as an opened file.

  Scenario: The workspace starts with the example closed
    Given the browser workspace is open
    Then the browser workspace identifies itself
    And the example is closed
    And no browser page errors have occurred

  Scenario: The starter baseline can be opened, closed, and opened again
    Given the browser workspace is open
    When I explore the example
    Then the starter baseline is visible
    When I close the example
    Then the example is closed
    When I explore the example
    Then the starter baseline is visible
    And no browser page errors have occurred
