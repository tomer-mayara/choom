@baseline-viewer @interface-duplication @di-02-04
Feature: Attach duplication reports to a baseline session
  Scenario: Attach a matching report without replacing the baseline view
    Given the duplication workspace has opened its saved baseline
    When the matching duplication report is opened through the workspace
    Then the workspace exposes the attached report and the same baseline view
