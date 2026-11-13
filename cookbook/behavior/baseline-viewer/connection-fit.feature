@baseline-viewer @baseline-readability @br-08 @br-08d @browser
Feature: Fit the shown connections and currently revealed labels
  Fit uses the actual canvas space and the labels revealed when it is activated.
  Connection choices and inspection do not change the component arrangement.

  Scenario: Fit ignores hidden labels and includes revealed labels
    Given the fixed Fit baseline is open with Billing selected at 1280 by 800
    And its hidden label extends beyond the complete padded curve envelope
    When the user fits the fixed drawing with its label hidden
    And the user opens the fixed interface through its owner
    And the user fits the fixed drawing with its label revealed
    Then the hidden-label fit uses more scale than the revealed-label fit
    And both fits contain the content that was shown
    And the Fit comparison keeps the same arcs, positions, and canvas size

  Scenario Outline: Keyboard Fit includes a label still revealed by pointer hover
    Given the fixed Fit baseline is open with Billing selected at <width> by <height>
    When the user focuses Fit, hovers the fixed curve, and activates Fit with Enter
    Then Fit contains the label that was painted at activation
    And the hover did not fit or move the drawing before activation

    Examples:
      | width | height |
      | 1280  | 800    |
      | 320   | 640    |

  Scenario: Fit a quiet overview using components only
    Given the fixed Fit baseline is open without inspection
    When the user fits the quiet fixed drawing
    Then only its two components contribute painted content
    And the component drawing fits in the actual canvas

  Scenario: Keep the camera when inspection closes and the window shrinks
    Given the fixed Fit baseline is open with Billing selected at 1280 by 800
    When the user closes Fit inspection and narrows the window
    Then panel and window changes do not fit or rearrange the drawing
