@baseline-viewer @baseline-readability @br-01 @browser
Feature: Inspect records beside the component drawing
  A side panel shows recorded data while the drawing remains usable.

  Scenario: Inspect a component with one selection
    Given the reviewed baseline is open for side-panel inspection
    When the user selects Workspace once
    Then the side panel lists the five interfaces owned by Workspace
    And inspection preserves the diagram camera and positions

  Scenario: Select another component without closing inspection
    Given the reviewed baseline is open for side-panel inspection
    And Workspace is selected in the side panel
    When the user selects Native shell on the drawing
    Then the side panel shows Native shell and its owned interfaces
    And the canvas remains available for pan and zoom

  Scenario: Return to the originating interface entry
    Given the reviewed baseline is open for side-panel inspection
    And an interface from Workspace is being inspected
    When the user returns to Workspace in the panel
    Then the originating interface entry regains focus and its list position

  Scenario: Inspect an unowned resource without components
    Given a baseline without components is open for side-panel inspection
    When the user selects its resource from Baseline details
    Then the resource's recorded details and unknown owner are available

  Scenario: Activate inspection with the keyboard
    Given the reviewed baseline is open for side-panel inspection
    When the user activates Workspace with the keyboard
    Then keyboard focus enters the component side panel
    And the canvas remains reachable without closing the panel

  Scenario: Keep external focus when closing the panel
    Given the reviewed baseline is open for side-panel inspection
    And Workspace is selected while Native shell has keyboard focus
    When the user closes side-panel inspection with Escape
    Then the panel closes and Native shell keeps keyboard focus

  Scenario: Resize during inspection without changing the camera
    Given the reviewed baseline is open for side-panel inspection
    And Workspace is selected in the side panel
    When the inspection window is resized
    Then inspection preserves the diagram camera

  Scenario: Inspect in a narrow window
    Given the reviewed baseline is open for side-panel inspection
    When the user inspects Workspace in a narrow window
    Then the panel is below the usable canvas without horizontal page scrolling
