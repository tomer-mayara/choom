@browser @diagram-workspace
Feature: Diagram workspace
  The diagram uses the available window while supporting details on request.

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

  Scenario: Analysis is available when requested
    When the user requests the recorded analysis
    Then the recorded analyzer, inputs, and scope are visible

  Scenario: Returning to the canvas dismisses analysis and restores focus
    Given the recorded analysis is open
    When the user returns to the canvas outside the analysis
    Then analysis is closed and its control has focus

  Scenario: A component exposes its declaration and outgoing imports
    When the user inspects component "src"
    Then the component details identify "Workspace" with parent "." and 3 reported files
    And its imports show the recorded workspace file pairs and flags
    And unrelated import evidence is absent
    And inspecting the component preserves the diagram zoom

  Scenario: Extensive import evidence remains readable in a small window
    Given the diagram includes many import file pairs
    And the diagram workspace uses a small window
    When the user inspects component "src"
    Then every import file pair can be reached without scrolling the page

  Scenario: A component exposes its incoming imports
    When the user inspects component "packages/core"
    Then its imports show the recorded workspace file pairs and flags

  Scenario Outline: Component details work with a keyboard
    When the user activates component "src" with "<key>"
    Then the component details identify "Workspace" with parent "." and 3 reported files

    Examples:
      | key   |
      | Enter |
      | Space |

  Scenario: Keyboard navigation reveals components after panning
    Given component "packages/core" is outside the visible diagram after panning
    When the user tabs to component "packages/core"
    Then focused component "packages/core" is fully visible in the diagram
    And keyboard navigation preserves the diagram zoom
    And the focused component opens details for "Core"

  Scenario: Keyboard focus preserves an already visible diagram
    When the user tabs to component "packages/core"
    Then keyboard navigation preserves the current diagram view

  Scenario: Dismissing details returns focus to the component
    Given component "src" is being inspected with a keyboard
    When the user dismisses component details
    Then component details are closed and component "src" has focus

  Scenario: Findings remain available without occupying the canvas
    When the user requests findings
    Then the reported finding exposes its subject roles, paths, and metrics

  Scenario: Loading another diagram closes old component details
    When a replacement diagram finishes while component details are open
    Then the replacement diagram is shown with all details closed
