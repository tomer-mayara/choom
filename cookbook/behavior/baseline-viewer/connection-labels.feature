@baseline-viewer @baseline-readability @br-08 @br-08b @browser
Feature: Reveal interface labels on demand
  Shown arrows keep their accessible identity while their text is hidden.
  Hover, keyboard focus, and interface inspection reveal their names.

  Scenario: Select a component without showing every name
    Given the connection label baseline is open
    When the user selects Checkout to inspect its labels
    Then its two arc names are not painted and remain accessible

  Scenario: Reveal one name by hovering its curve
    Given Checkout's two label controls are available
    When the pointer enters Checkout's Invoice API curve
    Then only that Invoice API name is painted with a transparent background
    And label demand has not changed the camera or component positions

  Scenario: Keep a label visible while moving from its curve onto its text
    Given the pointer is on Checkout's Invoice API curve
    When the pointer moves onto the Invoice API label
    Then only that Invoice API name remains painted

  Scenario: Hide a name after leaving its curve and label
    Given the pointer is on Checkout's Invoice API curve
    When the pointer leaves the curve and label
    Then its two arc names are not painted and remain accessible

  Scenario: Reveal a name through keyboard navigation
    Given Checkout's two label controls are available
    When keyboard navigation reaches its first interface arc
    Then that arc's name and keyboard focus indicator are painted
    And Checkout's component details remain open

  Scenario: Preserve interface labels after direct pointer inspection
    Given Checkout's two label controls are available
    When the user selects its Invoice API curve and moves away
    Then both shown Invoice API names remain painted with its details open
    And label demand has not changed the camera or component positions

  @touch
  Scenario: Open interface details on the first touch without hover
    Given Checkout's two label controls are available
    When the user taps its Invoice API curve without hovering
    Then both shown Invoice API names remain painted with its details open
    And label demand has not changed the camera or component positions

  Scenario: A hidden label does not block the canvas
    Given Checkout's two label controls are available
    When the pointer crosses a hidden label rectangle away from its curve
    Then the hidden label is not a pointer target and stays unpainted

  Scenario: Clear keyboard reveal when a pointer reuses the focused arc
    Given Checkout's Invoice API arc has keyboard focus in All mode
    When the pointer inspects that focused arc and closes the panel before leaving
    Then no arc label remains painted from the earlier keyboard focus

  Scenario: Use the keyboard after pointer focus
    Given an Invoice API arc has pointer focus with its details open in All mode
    When Escape closes its panel from that arc
    Then that arc's name and keyboard focus indicator are painted

  Scenario: Reveal an owned interface without changing its component scope
    Given Billing's three label controls are available
    When the user opens its owned Invoice API details
    Then Billing's scope remains and only Invoice API names are painted
