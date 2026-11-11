@browser @diagram-workspace
Feature: Baseline component workspace
  The read-only component view uses the available window and supports basic details.

  Background:
    Given a saved architecture is open in the diagram workspace

  Scenario: The diagram has the available workspace
    Then the diagram fills the workspace below compact actions
    And analysis and component details are closed

  Scenario: A larger window gives the diagram more room
    When the diagram workspace window becomes larger
    Then the diagram grows in width and height without page scrolling

  Scenario Outline: A small window keeps the diagram and actions usable
    When the diagram workspace is <width> pixels wide and <height> pixels tall
    Then the diagram and document actions fit without page scrolling
    Examples:
      | width | height |
      | 640   | 480    |
      | 390   | 640    |

  Scenario: Inspecting a component preserves zoom
    When the user inspects component "checkout"
    Then the component details identify "Checkout" and purpose "Create orders"
    And inspecting the component preserves the diagram zoom

  Scenario Outline: Component details work with a keyboard
    When the user activates component "checkout" with "<key>"
    Then the component details identify "Checkout" and purpose "Create orders"
    Examples:
      | key   |
      | Enter |
      | Space |

  Scenario: Keyboard navigation reveals components after panning
    Given component "billing" is outside the visible diagram after panning
    When the user tabs to component "billing"
    Then focused component "billing" is fully visible in the diagram
    And keyboard navigation preserves the diagram zoom
    And the focused component opens details for "Billing"

  Scenario: Keyboard focus preserves an already visible diagram
    When the user tabs to component "billing"
    Then keyboard navigation preserves the current diagram view

  Scenario: Dismissing details returns focus to the component
    Given component "checkout" is being inspected with a keyboard
    When the user dismisses component details
    Then component details are closed and component "checkout" has focus

  Scenario: Loading another baseline closes old component details
    When a replacement diagram finishes while component details are open
    Then the replacement diagram is shown with all details closed
