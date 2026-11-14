@baseline-viewer @interface-duplication @browser
Feature: Read a saved duplication assessment
  The reader can inspect recorded interface findings without a source checkout
  or an analyzer in the viewer.

  @di-04
  Scenario: Open a published assessment through ordinary file controls
    Given a baseline and its published duplication assessment are available offline
    When the reader opens the saved duplication assessment
    Then the saved duplication finding is available for inspection
    And the report shows its incomplete scan coverage
    And reading the assessment has not changed either selected file

  @di-03-01
  Scenario: Keep a report with a maximum-length ID readable
    Given a duplication assessment has a report ID at its supported length limit
    When the reader opens the saved duplication assessment
    Then the saved duplication finding is available for inspection
    And the baseline heading and report controls remain within the viewport

  @di-03-01
  Scenario: Count one same-owner finding with whole-interface and entry observations
    Given the saved assessment has one finding between Billing interfaces with whole-interface and entry observations
    When the reader opens the saved duplication assessment
    Then the list shows one finding and Billing shows one possible duplicate

  @di-03-02
  Scenario: Read the saved judgment without treating a score as behavior
    Given the reader has opened the published duplication assessment
    When the reader compares the first supported duplication finding
    Then the comparison shows the recorded judgment, differences and evidence

  @di-03-02
  Scenario: Inspect the exact public entry in a recorded observation
    Given the reader is comparing the first supported duplication finding
    When the reader inspects its recorded public entry
    Then the interface opens at that entry instead of its initial entry

  @di-03-03
  Scenario: Return to a filtered interface list
    Given the reader reached a comparison from a filtered interface list
    When the reader returns from an endpoint through the comparison to that list
    Then the original filter, row focus and connection choices are restored

  @di-03-03
  Scenario: Reject a replacement without losing the current inspection
    Given the reader is inspecting an endpoint reached through the published finding
    When a replacement report belongs to different baseline bytes
    Then the error preserves the current endpoint and comparison return path

  @di-03-03
  Scenario: Remove an assessment from an endpoint inspection
    Given the reader is inspecting an endpoint reached through the published finding
    When the reader removes the attached duplication report
    Then the empty Duplicates panel focuses report opening and has no old return path

  @di-03-03
  Scenario Outline: Open a comparison with a keyboard in a narrow window
    Given the reader has opened the published duplication assessment
    When the reader opens a comparison with a keyboard in a <width> by <height> window
    Then the comparison heading has focus and its controls fit the panel
    And the baseline heading and all diagram actions remain visible

    Examples:
      | width | height |
      | 320   | 640    |
      | 390   | 720    |
