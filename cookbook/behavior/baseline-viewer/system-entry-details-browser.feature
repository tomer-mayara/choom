@baseline-viewer @ep-06 @browser
Feature: Read saved system entries from a component
  Scenario Outline: Keep every saved entry available at <width> pixels
    Given the system-entry details baseline is open at <width> pixels
    When the reader opens Checkout component details
    Then the Startup and External groups contain all 21 entries in saved order
    And each entry shows its saved path and evidence
    And the first external entry shows its saved source range

    Examples:
      | width |
      | 1280  |
      | 320   |

  Scenario Outline: Follow an entry to its exact documented operation and return at <width> pixels
    Given the system-entry details baseline is open at <width> pixels
    When the reader opens Checkout component details
    And the reader follows the first external entry by keyboard
    Then Refund invoice is selected under Interface entries for Billing
    When the reader goes Back
    Then Checkout component details and the selected entry regain focus

    Examples:
      | width |
      | 1280  |
      | 320   |

  Scenario: Open a whole interface and leave unlinked entries as facts
    Given the system-entry details baseline is open at 1280 pixels
    When the reader opens Checkout component details
    Then the unlinked third external entry has no navigation control
    When the reader follows the second external entry
    Then the Invoice API overview opens
