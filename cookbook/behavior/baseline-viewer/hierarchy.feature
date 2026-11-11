@baseline-viewer @bv-04 @browser
Feature: Display recorded component groups within safe limits
  Choom shows the component hierarchy in a saved baseline.
  A baseline that exceeds a display limit does not replace the current view.

  Scenario: Show recorded component groups
    Given the reviewed five-component baseline is ready to open
    When the user opens the prepared hierarchy baseline
    Then Workspace and Native shell appear inside Choom
    And Architecture model and Platform adapter appear inside Workspace
    And each component name and inspection control is reachable

  Scenario Outline: Refuse excessive diagram work
    Given the Previous baseline is displayed
    And the next baseline exceeds the <limit> display limit
    When the user opens the prepared hierarchy baseline
    Then Previous remains displayed with a size-limit message

    Examples:
      | limit                   |
      | total record count      |
      | rules-only record count |
      | explicit link count     |
      | parent depth            |

  Scenario Outline: Fit a component hierarchy at the display limits
    Given a baseline with 500 components and 16 levels is ready in a <width> by <height> window
    When the user opens the prepared hierarchy baseline
    Then all 500 components fit inside the diagram

    Examples:
      | width | height |
      | 390   | 640    |
      | 1600  | 1000   |

  Scenario: Fit controls show the complete component hierarchy
    Given a baseline at the component limits is open
    When the user fits the hierarchy after zooming in
    Then all 500 components fit inside the diagram

  Scenario: Keyboard focus reveals a large parent header after panning
    Given a baseline at the component limits is open
    And its large parent header is outside the diagram after panning
    When the user tabs to component "component-0"
    Then focused component "component-0" is fully visible in the diagram
    And keyboard navigation preserves the diagram zoom
    And the focused component opens details for "Component 0"
