@baseline-viewer @baseline-readability @br-11 @br-11b @browser
Feature: Show interface use from saved source
  Source connections are independent from permission.
  Each arrow connects the direct consumer to the interface provider.

  Scenario: Combine repeated sites without changing permission
    Given the "repeated sites" source connection baseline is open
    Then the source drawing has 0 arrows
    When the user selects source consumer Checkout
    Then the source drawing has 1 arrows
    And its invoice arrow points from Checkout to Billing with a complete accessible name
    And the source legend explains saved use and excluded references

  Scenario: Keep different relationship meanings separate
    Given the "different permission" source connection baseline is open
    When the user shows all source connections
    Then the source drawing has 1 arrows
    And its invoice arrow points from Checkout to Billing with a complete accessible name
    When the user inspects the source Invoice API
    Then Access rule still names Admin as permitted

  Scenario: Keep type and test references out of the drawing
    Given the "type and test" source connection baseline is open
    When the user selects source provider Billing
    Then the source drawing has 0 arrows
    And the source legend explains saved use and excluded references

  Scenario Outline: Preserve old permission arrows
    Given the "legacy <version>" source connection baseline is open
    When the user selects source consumer Checkout
    Then the source drawing has 1 arrows
    And the legacy connection legend still describes permission

    Examples:
      | version |
      | 1       |
      | 2       |

  Scenario Outline: Draw supported uses despite other missing facts
    Given the "<example>" source connection baseline is open
    When the user selects source consumer Checkout
    Then the source drawing has 1 arrows
    And its invoice arrow points from Checkout to Billing with a complete accessible name

    Examples:
      | example         |
      | tooling         |
      | unmapped caller |

  Scenario: Do not infer use from permission
    Given the "no source data" source connection baseline is open
    When the user shows all source connections
    Then the source drawing has 0 arrows
    And the source legend explains saved use and excluded references

  Scenario: Keep internal use optional and layout stable
    Given the "self use" source connection baseline is open
    When the user shows all source connections
    Then the source drawing has 1 arrows
    When the user enables source self connections
    Then the source drawing has 2 arrows
    And source connection choices have not moved components
    When the user moves Billing and fits the source drawing
    Then the source arrows remain attached to their moved provider

  Scenario: Preserve the meaning through failed and successful replacement
    Given the "repeated sites" source connection baseline is open
    When the user selects source consumer Checkout
    And the user inspects the source Invoice API
    And an invalid source baseline replacement is opened
    Then the source drawing has 1 arrows
    And the source legend explains saved use and excluded references
    And the source Invoice API details stay open
    When the user replaces it with the "legacy 2" source connection baseline
    Then the source drawing has 0 arrows
    And the legacy connection legend still describes permission
    When the user selects source consumer Checkout
    Then the source drawing has 1 arrows
    When the user replaces it with the "repeated sites" source connection baseline
    Then the source drawing has 0 arrows
    And the source legend explains saved use and excluded references
