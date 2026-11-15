@baseline-viewer @ep-06 @packaged
Feature: Read system entries in installed Choom
  Scenario: Open an exact operation from a saved component entry
    Given the system-entry details baseline is available to installed Choom
    When the reader opens its baseline and Checkout component
    Then all 21 saved entries and paths are in the installed component details
    When the reader follows the first external entry
    Then the installed interface selects Refund invoice
    And Back restores Checkout and the entry link focus
