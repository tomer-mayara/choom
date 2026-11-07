@cr-001 @cr-001-t07 @cr-001-t07-dialogs @desktop-dialogs
Feature: Choose saved diagrams and export destinations
  Desktop users can choose a saved YAML diagram and an export destination.
  Replacement requires a separate, explicit decision.
  These scenarios exercise the file-selection boundary with simulated native dialogs.
  They do not verify operating-system dialogs or the packaged application.

  Scenario: Browser viewing does not request native file dialogs
    Given the diagram file chooser is running in a browser
    When native diagram file actions are requested
    Then no native diagram file action is available
    And no native dialog is requested

  Scenario: A desktop user selects one saved YAML diagram
    Given the desktop diagram chooser selects "/diagrams/Atlas.choom.yaml"
    When a saved diagram is requested
    Then the selected diagram is "/diagrams/Atlas.choom.yaml"
    And the chooser accepts one YAML file

  Scenario: Cancelling saved diagram selection returns no file
    Given the desktop diagram chooser is cancelled
    When a saved diagram is requested
    Then no diagram file is selected

  Scenario: A desktop user chooses an export destination
    Given the desktop export chooser selects "/diagrams/Atlas.choom.yaml"
    When an export destination is requested for "Atlas.choom.yaml"
    Then the selected diagram is "/diagrams/Atlas.choom.yaml"
    And the export chooser suggests "Atlas.choom.yaml" as a YAML file

  Scenario: Cancelling export destination selection returns no file
    Given the desktop export chooser is cancelled
    When an export destination is requested for "Atlas.choom.yaml"
    Then no diagram file is selected

  Scenario Outline: Replacement follows the user's explicit decision
    Given the desktop user chooses "<decision>" when replacement is requested
    When consent to replace a diagram is requested
    Then replacement is <outcome>

    Examples:
      | decision | outcome     |
      | Replace  | permitted   |
      | Cancel   | not allowed |

  Scenario: An export filename cannot redirect the chooser to another directory
    Given the desktop export chooser is available
    When an export destination is requested for "../Atlas.choom.yaml"
    Then the export filename is refused
    And no native dialog is requested

  Scenario Outline: Dialog failures do not become cancellations
    Given the desktop diagram dialog fails
    When the "<action>" diagram file action is requested
    Then the caller receives a safe diagram dialog failure

    Examples:
      | action  |
      | open    |
      | save    |
      | replace |
