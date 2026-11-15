@producer
Feature: Parse a project without compiler settings
  Without project settings, the producer uses a named Choom parsing profile and states its assumptions.

  Scenario: A project without settings uses the named profile
    Given a saved snapshot with JavaScript and TypeScript files and no compiler settings
    When the operator records the project settings
    Then the settings record names the Choom parsing profile and its version
    And it lists the assumptions of that profile
    And a gap says that no project settings were found
