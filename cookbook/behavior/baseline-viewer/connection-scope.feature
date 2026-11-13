@baseline-viewer @baseline-readability @br-08 @br-08a @browser
Feature: Inspect a small set of interface connections
  A selected component shows only its direct connections.
  Recorded details remain complete when connections are hidden.

  Scenario: Start with a quiet component overview
    Given the four-arc connection baseline is ready
    When the user opens the connection baseline
    Then the overview shows four components and zero interface arcs
    And the connection choice is Selected

  Scenario: Show the selected component's direct connections
    Given the connection baseline is open
    When the user selects Checkout for its connections
    Then only Checkout's two direct arcs are shown
    And component positions are unchanged

  Scenario: Replace one component's scope with another
    Given Checkout's connections are shown
    When the user selects Billing for its connections
    Then only Billing's three direct arcs are shown
    And shared arc controls keep their identity and order

  Scenario: Keep an interface visible after selecting its arc
    Given Checkout's connections are shown
    When the user activates its Invoice API arc with the keyboard
    Then Invoice API's two arcs and its focused details heading are shown
    And no Back entry is offered

  Scenario: Restore focus when closing removes the initiating arc
    Given Invoice API was opened directly from Checkout's arc
    When the user closes the connection details
    Then no connection arcs are shown and Billing's header has focus

  Scenario: Show all known connections without changing inspection
    Given Checkout's connections are shown
    When the user chooses All connections
    Then all four arcs are shown and Checkout's two arcs are emphasized
    And the component panel, camera, and positions stay unchanged

  Scenario: Preserve component scope through owned details and Back
    Given Billing's connections are shown through Baseline details
    When the user opens Billing's Invoice API record
    Then Billing's three arcs stay shown with the Invoice API arcs emphasized

  Scenario: Return from owned interface details
    Given Billing's owned Invoice API details are shown
    When the user goes Back from connection details
    Then the Billing list and its focused interface entry are restored

  Scenario: Inspect a standalone interface through the baseline list
    Given the connection baseline is open
    When the user opens Invoice API through Baseline details
    Then Invoice API's two arcs and its focused details heading are shown

  Scenario: Return from standalone interface details
    Given Invoice API was opened through Baseline details
    When the user goes Back from connection details
    Then Baseline details is shown with no arcs

  Scenario Outline: Clear component scope for a different inspection route
    Given Checkout's connections are shown
    When the user opens <route> instead
    Then no connection arcs or arc keyboard stops are shown

    Examples:
      | route            |
      | Rules            |
      | Baseline details |

  Scenario: Keep the canvas origin stable when connection scope changes
    Given Checkout's connections are shown
    When the user opens Baseline details instead
    Then no connection arcs or arc keyboard stops are shown
    And the connection controls and canvas keep their bounds

  Scenario: Restore focus when a canvas arc disappears on close
    Given Checkout's connections are shown
    And its Invoice API arc has keyboard focus outside the panel
    When the user presses Escape to close connection details
    Then no connection arcs are shown and Billing's header has focus

  Scenario: Ignore an old press after its arc is hidden and shown again
    Given Checkout's connections are shown
    When the user releases an arc press after hiding and restoring its scope
    Then Checkout's component details remain open with its two arcs

  Scenario: Accept a new press after ignoring the hidden arc's old press
    Given a hidden arc's old press has been ignored
    When the user presses its Invoice API curve again
    Then Invoice API's record is open with its two arcs

  Scenario: Keep unknown endpoint checks meaningful in All mode
    Given the connection baseline has one unknown interface and is open
    When the user chooses All connections
    Then only the three arcs with complete endpoints are shown
    And the unknown-interface note counts the unchanged missing fact
