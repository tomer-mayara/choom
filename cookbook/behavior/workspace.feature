@browser
Feature: Browser architecture workspace
  The browser workspace can show the starter diagram without desktop actions.
  Desktop UI scenarios use a simulated IPC boundary, not an operating system dialog.

  Scenario: The workspace starts with the example closed
    Given the browser workspace is open
    Then the browser workspace identifies itself
    And the directory picker action is absent
    And the example is closed
    And no browser page errors have occurred

  Scenario: The starter diagram can be opened, closed, and opened again
    Given the browser workspace is open
    When I explore the example
    Then the starter diagram is visible
    And the interface connects to the model and desktop
    When I close the example
    Then the example is closed
    When I explore the example
    Then the starter diagram is visible
    And the interface connects to the model and desktop
    And no browser page errors have occurred

  @desktop-ui
  Scenario: A selected directory remains visible after cancelling another request
    Given the desktop workspace uses a simulated native picker
    Then the desktop directory action is available
    When I request a directory
    Then the directory action is disabled while the picker is pending
    When the simulated picker selects "/projects/choom"
    Then the workspace shows directory "/projects/choom"
    And the desktop directory action is available
    When I request a directory
    Then the directory action is disabled while the picker is pending
    When the simulated picker is cancelled
    Then the workspace shows directory "/projects/choom"
    And the desktop directory action is available
    And no directory picker error is shown
    And no browser page errors have occurred

  @desktop-ui
  Scenario: A picker failure can be retried
    Given the desktop workspace uses a simulated native picker
    When I request a directory
    Then the directory action is disabled while the picker is pending
    When the simulated picker fails
    Then the workspace reports the directory picker failure
    And the desktop directory action is available
    When I request a directory
    Then no directory picker error is shown
    And the directory action is disabled while the picker is pending
    When the simulated picker selects "/projects/recovered"
    Then the workspace shows directory "/projects/recovered"
    And the desktop directory action is available
    And no directory picker error is shown
    And no browser page errors have occurred
