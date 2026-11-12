@baseline-viewer @baseline-readability @br-07 @br-07d @browser
Feature: Fit and retain the complete interface drawing
  Fit includes visible arcs and labels in the available canvas.
  View controls preserve the saved baseline and current inspection.

  Scenario Outline: Fit the complete drawing with an open panel
    Given an interface drawing with a self-loop is open at <width> by <height>
    And its interface details are open
    When the user fits the complete interface drawing
    Then components, curves, arrowheads, and labels fit in the actual canvas
    And interface geometry, inspected details, and selected bytes are unchanged

    Examples:
      | width | height |
      | 1280  | 800    |
      | 320   | 640    |

  Scenario: Fit a spread that cannot fit at one percent
    Given an interface drawing with a self-loop is open at 1280 by 800
    And its interface details are open
    And its components have been spread beyond one-percent fitting in a narrow window
    When the user fits the complete interface drawing
    Then components, curves, arrowheads, and labels fit in the actual canvas
    And Fit uses a positive finite zoom below one percent
    And interface geometry, inspected details, and selected bytes are unchanged

  Scenario: Keep zoom controls usable after fitting below one percent
    Given an interface drawing with a self-loop is open at 1280 by 800
    And its interface details are open
    And its components have been spread beyond one-percent fitting in a narrow window
    When the user fits the complete interface drawing and uses its zoom controls
    Then enabled zoom controls change the scale and Zoom Out stops at its minimum
    And interface geometry, inspected details, and selected bytes are unchanged

  Scenario: Reset ends an arc press without losing the inspection path
    Given an interface drawing with a self-loop is open at 1280 by 800
    And its interface details are open
    When the user holds an arc label, resets the layout, and releases the label
    Then Reset retains the interface details and Back path without replacing the label

  Scenario: Fit uses the measured size of a long label with enlarged text
    Given an interface drawing with a long name is open with enlarged text
    And its interface details are open
    When the user fits the complete interface drawing
    Then components, curves, arrowheads, and labels fit in the actual canvas
    And interface geometry, inspected details, and selected bytes are unchanged

  Scenario: A replacement restores the normal zoom range after a small Fit
    Given an interface drawing with a self-loop is open at 1280 by 800
    And its interface details are open
    And its components have been spread beyond one-percent fitting in a narrow window
    When the user fits the complete interface drawing
    And the user reopens the original interface file and zooms out
    Then the new view starts at one hundred percent and stops at the normal minimum

  Scenario: Keep arcs attached when a parent is dragged
    Given a nested consumer and its interface arcs are open
    And its interface details are open
    When the user drags the consumer's parent inside the canvas
    Then the child and its arc endpoint follow the parent without changing inspection or camera

  Scenario: Restore arcs and ancestor bounds after Escape
    Given a nested consumer and its interface arcs are open
    And its interface details are open
    When the user grows the parent by dragging its child and cancels with Escape
    Then the pre-drag geometry, arcs, panel, and camera are restored

  Scenario: Reset moved arcs while keeping interface navigation
    Given an interface drawing with a self-loop is open at 1280 by 800
    And its interface details are open
    And its consumer has been moved with the keyboard
    When the user resets the interface drawing
    Then the initial component and arc geometry returns at one hundred percent
    And the interface details and Back path remain available

  Scenario: Replace arcs when record IDs repeat
    Given an interface drawing is open with controlled file completion
    And its interface details are open
    And its consumer has been moved with the keyboard
    When a replacement with reused IDs and different endpoint facts opens
    Then only the replacement's recorded arcs appear in a fresh view

  Scenario Outline: Ignore input started in a replaced interface view
    Given an interface drawing is open with controlled file completion
    And its interface details are open
    And a replacement is waiting while an old <input> is unfinished
    When the replacement opens and the old input moves and releases
    Then the replacement's arcs, positions, camera, and inspection stay unchanged

    Examples:
      | input          |
      | component drag |
      | arc press      |

  Scenario Outline: Preserve arcs after an unsuccessful file open
    Given an interface drawing is open with controlled file completion
    And its interface details are open
    And its consumer has been moved with the keyboard
    When another interface file open <outcome>
    Then the pre-drag geometry, arcs, panel, and camera are restored

    Examples:
      | outcome                 |
      | fails validation        |
      | is cancelled            |
      | returns after cancellation |
