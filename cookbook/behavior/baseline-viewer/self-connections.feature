@baseline-viewer @baseline-readability @br-08 @br-08c @browser
Feature: Hide self-connections without losing recorded facts
  Self-connections are an optional part of the current connection scope.
  Component counts and recorded interface details keep their complete facts.

  Scenario: Hide self-use when selecting a component
    Given the extended self-connection baseline is open
    When the user selects Billing in the extended drawing
    Then Billing's three non-self arcs are the only shown arcs
    And Show self-connections is off
    And Billing still shows two owned interfaces

  Scenario: Read mixed self-use through the owned-interface list
    Given Billing is selected with self-connections hidden
    When the user opens Invoice API from Billing's owned-interface list
    Then Invoice API records Billing as owner and Checkout, Reporting, and Billing as consumers
    And Billing's three non-self arcs are the only shown arcs
    And the extended baseline has no unknown-interface note

  Scenario: Reveal self-use within the selected component scope
    Given Billing is selected with self-connections hidden
    When the user enables Show self-connections
    Then Billing's three non-self arcs and two self-loops are shown
    And the self-connection choice keeps focus
    And self-connection filtering preserves the camera, positions, and panel

  Scenario: Hide self-use again without changing the scope
    Given Billing is selected with self-connections shown
    When the user disables Show self-connections
    Then Billing's three non-self arcs are the only shown arcs
    And the self-connection choice keeps focus
    And self-connection filtering preserves the camera, positions, and panel

  Scenario: Inspect a self-only interface while its loop is hidden
    Given the extended self-connection baseline is open
    When the user opens Health through Baseline details
    Then Health records Billing as both owner and consumer
    And no arc or arc keyboard control is shown
    And the view says No connections shown
    And the extended baseline has no unknown-interface note

  Scenario: Apply the self rule in All mode
    Given the extended drawing is in All mode with self-connections hidden
    When the user enables Show self-connections
    Then exactly six recorded arcs are shown
    And self-connection filtering preserves the camera, positions, and panel

  Scenario: Keep the self choice when changing to All
    Given Billing is selected with self-connections shown
    When the user changes the extended drawing to All
    Then exactly six recorded arcs are shown
    And Show self-connections stays on

  Scenario: Keep the self choice when returning to Selected
    Given the extended drawing is in All mode with self-connections shown
    When the user changes the extended drawing to Selected
    Then Billing's three non-self arcs and two self-loops are shown
    And Show self-connections stays on

  Scenario: Closing Selected inspection keeps the choice without showing unrelated arcs
    Given Billing is selected with self-connections shown
    When the user closes the extended component panel
    Then no arc or arc keyboard control is shown
    And Show self-connections stays on

  Scenario: Reuse the self choice when selecting a component again
    Given Billing's Selected panel was closed with self-connections shown
    When the user selects Billing in the extended drawing
    Then Billing's three non-self arcs and two self-loops are shown
    And Show self-connections stays on

  Scenario Outline: Inspect a self-loop directly
    Given the extended drawing is in <mode> mode with self-connections shown
    And the extended drawing fits in its canvas
    When the user selects the Health self-loop
    Then Health records Billing as both owner and consumer

    Examples:
      | mode     |
      | Selected |
      | All      |

  Scenario Outline: Hide a directly inspected loop without losing its details
    Given Health is inspected from its self-loop in <mode> mode
    When the user disables Show self-connections
    Then the self-connection choice keeps focus
    And Health records Billing as both owner and consumer

    Examples:
      | mode     |
      | Selected |
      | All      |

  Scenario Outline: Return focus to the owner when an inspected loop is hidden
    Given Health is inspected from its self-loop in <mode> mode
    And the inspected Health self-loop is hidden
    When the user closes Health from inside its panel
    Then focus returns to Billing's header for the hidden loop

    Examples:
      | mode     |
      | Selected |
      | All      |

  Scenario: Return focus to a restored self-loop in All mode
    Given Health is open from its self-loop in All mode after hiding and showing it again
    When the user closes Health from inside its panel
    Then the panel closes and focus returns to the restored Health self-loop

  Scenario: Hide a loop during a held press
    Given Billing is selected with self-connections shown
    And the extended drawing fits in its canvas
    When the user holds the Health loop and disables self-connections with the keyboard
    Then Billing's three non-self arcs are the only shown arcs

  Scenario: A removed and restored loop rejects the old press
    Given a held Health loop press was removed by hiding self-connections
    When the user enables self-connections and releases the old loop press
    Then Billing's component details are still open
    And Billing's three non-self arcs and two self-loops are shown

  Scenario: A restored loop accepts a fresh press after rejecting an old one
    Given the restored Health loop has rejected its old press
    When the user selects the Health self-loop
    Then Health records Billing as both owner and consumer
