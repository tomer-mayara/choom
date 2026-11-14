@packaged @baseline-viewer @interface-duplication @di-02-05 @di-04
Feature: Read a duplication assessment in installed Choom
  Scenario: Open and inspect a saved report through the native file picker
    Given a standalone baseline and its saved duplication report are available to installed Choom
    When the reader opens the baseline and report with the native file pickers
    Then the installed viewer shows the saved finding and its comparison
    And the reader opens the recorded entry and Back restores the comparison and finding focus
    When the reader selects an invalid replacement and removes the report
    Then the installed viewer still shows the saved baseline and leaves the selected files unchanged
