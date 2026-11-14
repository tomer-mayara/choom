@baseline-viewer @duplication-report-codec
Feature: Read a saved duplication assessment
  The reader checks the saved report against the exact baseline without reading source files.

  @br-11 @br-11a @br-11-duplication
  Scenario: Read documented findings bound to a version 3 baseline with source uses
    Given a duplication report bound to documented entries in a version 3 baseline with source uses
    When the report reader decodes the duplication assessment
    Then the saved findings and coverage are available
    And the comparison retains the version 3 entry references and recorded facts

  @di-02-01
  Scenario: Read the saved findings and assessment coverage
    Given a duplication report and its matching saved baseline
    When the report reader decodes the duplication assessment
    Then the saved findings and coverage are available

  @di-02-01
  Scenario: Read a wide report within its saved-data limits
    Given a duplication report and its matching saved baseline
    And the report contains many short diagnostic values within its limits
    When the report reader decodes the duplication assessment
    Then the saved findings and coverage are available

  @di-02-02
  Scenario: Refuse a report for different baseline bytes
    Given a duplication report and its matching saved baseline
    And the baseline bytes have a different digest
    When the report reader decodes the duplication assessment
    Then the duplication report is refused with "baseline-mismatch"

  @di-02-02
  Scenario: Refuse a foreign interface reference
    Given a duplication report and its matching saved baseline
    And the report names an interface outside that baseline
    When the report reader decodes the duplication assessment
    Then the duplication report is refused with "invalid-document"
