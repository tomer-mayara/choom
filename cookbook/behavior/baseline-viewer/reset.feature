@baseline-viewer @baseline-readability @br-04 @browser
Feature: Restore the initial layout or fit the current arrangement
  Reset restores prepared component geometry and normal text size.
  Fit changes the camera and keeps the user's arrangement.

  Scenario: Reset while preserving the inspected record and its return path
    Given the reviewed baseline is open for layout controls
    And its manual arrangement has grown bounds and an owned record open
    When the user resets the layout
    Then the prepared positions and bounds return at the normal starting view
    And the inspected record and its scroll position stay unchanged
    And Back still returns through Workspace to the baseline catalog
    And layout controls leave the selected file unchanged

  Scenario Outline: Fit manual geometry in the available canvas
    Given the reviewed baseline is open for layout controls
    And its manual arrangement has grown bounds and an owned record open
    And the layout-control window is <width> pixels wide and <height> pixels tall
    And part of the manual arrangement is outside the canvas
    When the user fits the current arrangement with the keyboard
    Then all components fit in the current canvas beside or above the panel
    And the manual component positions and bounds stay unchanged
    And the inspected record and its scroll position stay unchanged

    Examples:
      | width | height |
      | 1280  | 800    |
      | 320   | 640    |

  Scenario: Resize preserves the arrangement and camera
    Given the reviewed baseline is open for layout controls
    And its manual arrangement has grown bounds and an owned record open
    When the layout-control window is resized
    Then the manual component positions and bounds stay unchanged
    And the layout-control camera stays unchanged
    And Fit view remains available

  Scenario: Reset can be repeated
    Given the reviewed baseline is open for layout controls
    And its manual arrangement has grown bounds and an owned record open
    When the user resets the layout twice
    Then the prepared positions and bounds return at the normal starting view
    And both resets produce the same geometry and camera
    And the inspected record and its scroll position stay unchanged

  Scenario: Reset replaces a stale movement announcement
    Given the reviewed baseline is open for layout controls
    And a keyboard component move has announced its position
    When the user resets the layout
    Then Reset is announced without the old movement coordinates

  Scenario Outline: Reset ends a pointer cycle before later events arrive
    Given the reviewed baseline is open for layout controls
    And its manual arrangement has grown bounds and an owned record open
    And a component pointer cycle is held at <phase> before <ending>
    When the user activates Reset layout with the keyboard during that pointer cycle
    Then the prepared positions and bounds return at the normal starting view
    And later pointer movement and <ending> cannot change the reset view
    And the inspected record and its scroll position stay unchanged

    Examples:
      | phase          | ending       |
      | a short press  | release      |
      | an active drag | release      |
      | a short press  | cancellation |
      | an active drag | cancellation |

  Scenario Outline: No layout controls exist without component nodes
    Given a baseline with <records> is open for layout controls
    When the user opens its baseline catalog
    Then Fit view and Reset layout are unavailable
    And the saved record lists remain usable

    Examples:
      | records                           |
      | four empty collections            |
      | unowned records but no components |
