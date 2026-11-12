@baseline-viewer @bv-03 @packaged
Feature: Open a baseline in installed Choom
  The installed viewer reads a standalone baseline through the native file picker.

  Background:
    Given installed Choom has only a standalone reviewed baseline and no analyzer runtime

  Scenario: Open a baseline without its repository or an analyzer runtime
    When the user selects that baseline through the native Open Baseline picker
    Then the installed viewer shows its baseline ID and five component names
    And the installed viewer has no repository selection or diagram export actions
    And the native read leaves the selected baseline bytes unchanged

  @bv-07 @baseline-readability @br-02
  Scenario: Read the complete reviewed baseline in the final installed viewer
    When the user selects that baseline through the native Open Baseline picker
    Then the installed viewer shows five components and keeps every interface and resource inspectable
    And all twenty-one installed Rules entries can be expanded
    And the installed viewer has no repository selection or diagram export actions
    And the native read leaves the selected baseline bytes unchanged

  @baseline-readability @br-03 @br-04
  Scenario: Arrange and reset components while inspecting an installed baseline
    Given the reviewed baseline is open in installed Choom
    When the user inspects and moves installed components with the pointer and keyboard
    Then parents carry their children and keyboard movement keeps the installed inspection usable
    When the user fits and resets the installed drawing while inspecting an owned interface
    Then fitting keeps the arrangement while resetting restores its starting view and inspection path
    And the native read leaves the selected baseline bytes unchanged

  Scenario: Cancelling the native picker preserves the loaded baseline
    When the user selects that baseline through the native Open Baseline picker
    Then the installed viewer shows its baseline ID and five component names
    When the user cancels the native Open Baseline picker
    Then the installed viewer reports cancellation and allows another baseline
    And the previous installed baseline remains displayed
    And the native read leaves the selected baseline bytes unchanged

  Scenario Outline: An invalid native file preserves the loaded baseline
    When the user selects that baseline through the native Open Baseline picker
    Then the installed viewer shows its baseline ID and five component names
    When the user selects a file containing <content> through the native picker
    Then the installed viewer identifies <content> as the input problem
    And the previous installed baseline remains displayed
    And the native read leaves the selected baseline bytes unchanged

    Examples:
      | content                |
      | malformed YAML         |
      | legacy diagram content |
