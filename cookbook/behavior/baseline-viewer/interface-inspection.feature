@baseline-viewer @baseline-readability @br-07 @br-07c @browser
Feature: Inspect recorded interface arcs
  The interface panel explains an arc without changing the component arrangement.

  Scenario Outline: Inspect an arc with one pointer selection
    Given the interface inspection baseline is open
    When the user selects the Checkout Invoice API arc by its <target>
    Then Invoice API details are shown as a fresh inspection path
    And both Invoice API arcs are emphasized and Order API is dimmed
    And pointer focus stays on the exact initiating arc label
    And arc inspection preserves the camera and component positions
    And the short arc label has no long empty background beside its name

    Examples:
      | target |
      | label  |
      | curve  |

  Scenario Outline: Inspect an arc with the keyboard
    Given the interface inspection baseline is open
    And keyboard focus is on the Reporting Invoice API arc label
    When the user activates the arc with <key>
    Then focus moves to the Invoice API panel heading
    And both Invoice API arcs are emphasized and Order API is dimmed

    Examples:
      | key   |
      | Enter |
      | Space |

  Scenario: Return keyboard focus to the exact arc
    Given the interface inspection baseline is open
    And the Reporting Invoice API arc was opened with the keyboard
    When the user closes arc inspection with Escape
    Then keyboard focus returns to the Reporting Invoice API arc label
    And all interface arcs have normal emphasis

  Scenario: Keep source order when a replacement reuses arc IDs
    Given the interface inspection baseline is open
    When a replacement baseline puts the same interfaces and consumers in a different order
    Then the arc labels and keyboard navigation follow the replacement order

  Scenario: Show a component's relevant connections
    Given the interface inspection baseline is open
    When the user selects the Checkout component
    Then Checkout's incoming and outgoing arcs are emphasized and its unrelated arc is dimmed

  Scenario: Inspect an interface from its owner's list
    Given the interface inspection baseline is open
    And Billing's component panel is open
    When the user selects Invoice API from the owned interface list
    Then both Invoice API arcs are emphasized and Order API is dimmed
    And Billing remains highlighted in the drawing

  Scenario: Restore the component list and emphasis with Back
    Given a long owned interface list is open for arc inspection
    And Invoice API was opened from the scrolled owned interface list
    When the user returns to the component with Back
    Then the owned interface row and list position are restored
    And Billing's incoming and outgoing arcs are emphasized again

  Scenario: Inspect a visible curve whose label is off-screen
    Given the interface inspection baseline is open
    And the Checkout Invoice API curve is visible with its label off-screen
    When the user selects the Checkout Invoice API arc by its curve
    Then Invoice API details are shown as a fresh inspection path
    And pointer focus stays on the exact initiating arc label
    And arc inspection preserves the camera and component positions

  Scenario: Reach an off-screen arc label
    Given the interface inspection baseline is open
    And the Checkout Invoice API label is off-screen and fits the canvas
    When keyboard focus reaches the Checkout Invoice API label
    Then its label and focus outline are revealed with the smallest pan
    And keyboard focus leaves zoom and the inspected record unchanged

  Scenario: Reach a label larger than the available canvas
    Given a long interface label is enlarged beyond the available canvas
    When keyboard focus reaches the Checkout Invoice API label
    Then the label's start and nearby focus outline are visible
    And keyboard focus leaves zoom and the inspected record unchanged

  Scenario Outline: Accept a fresh arc click after component movement
    Given the interface inspection baseline is open
    And a Checkout component drag has <ending> without changing inspection
    When the user selects the Checkout Invoice API arc by its label
    Then Invoice API details are shown as a fresh inspection path
    And arc inspection preserves the camera and component positions

    Examples:
      | ending         |
      | finished       |
      | been cancelled |
