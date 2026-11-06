@desktop-adapter
Feature: Project directory selection
  The desktop adapter returns a directory path without importing a project.
  These scenarios call the real adapter with a simulated Tauri IPC boundary.
  They do not exercise an operating system dialog or the packaged Rust shell.

  Scenario: The browser has no directory picker
    Given the directory adapter runs outside Tauri
    When a caller requests a project directory
    Then the adapter reports a browser environment
    And no directory is selected
    And no native directory request is sent

  Scenario: A desktop caller receives the selected directory
    Given the native directory picker returns "/projects/choom"
    When a caller requests a project directory
    Then the adapter reports a desktop environment
    And one single-directory request is sent
    And the selected directory is "/projects/choom"

  Scenario: Cancelling the native picker returns no directory
    Given the native directory picker is cancelled
    When a caller requests a project directory
    Then one single-directory request is sent
    And no directory is selected

  Scenario: A native picker failure reaches the caller
    Given the native directory picker fails
    When a caller requests a project directory
    Then one single-directory request is sent
    And the caller receives the native picker failure
