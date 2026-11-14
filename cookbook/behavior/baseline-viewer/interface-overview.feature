@browser @baseline-viewer @baseline-readability @br-10 @br-10b
Feature: Read an interface contract
  Readers need the saved contract before the record's audit fields.

  Scenario: Read an unchanged version 1 interface
    Given the unchanged baseline-003 file is open
    When the user inspects Baseline data and validation from the baseline catalog
    Then the interface Overview names Baseline model as its provider
    And the saved legacy contract is readable without evidence arrays
    And Sources retains the complete unchanged interface record

  Scenario: Explain the selected documented entry
    Given the complete documented interface is open in Overview
    Then the first entry and its saved interaction facts are identified
    And all three entries and the unmatched access reference remain available
    And the general promises remain in Interface-wide contract

  Scenario: Keep a type distinct from an operation
    Given the complete documented interface is open in Overview
    When the user selects the Invoice type entry
    Then its type description replaces the function interaction

  Scenario: Keep partly unknown interaction facts explicit
    Given the partial documented interface is open in Overview
    Then input and failures are unknown while success and effects keep their saved text

  Scenario: Summarize a wholly unknown interaction
    Given the unknown interaction documented interface is open in Overview
    Then one unknown interaction summary replaces the four interaction facts
    And Sources retains the complete documented interface record

  Scenario: Inspect an interface with no known provider
    Given the unknown provider documented interface is open in Overview
    Then Provider unknown appears without an invented component

  Scenario: Explain permission separately from activity
    Given the complete documented interface is open in Overview
    When the user expands the interface Access rule
    Then it names Checkout as permitted and says call activity is not recorded

  Scenario: Keep unknown permission unknown
    Given the unknown permission documented interface is open in Overview
    When the user expands the interface Access rule
    Then the permitted components are not recorded

  Scenario: Preserve mixed recorded statuses
    Given the mixed status documented interface is open in Overview
    Then mixed statuses retain accepted ownership and proposed interaction without verification

  Scenario Outline: Read the same panel with keyboard tabs at different sizes
    Given the complete documented interface is open in Overview
    When the user reads the interface at <width> by <height> with <percent> percent text
    And the user selects Invoice type and changes tabs with the keyboard
    Then Overview restores that entry without moving the diagram
    And the interface content fits the existing inspector width

    Examples:
      | width | height | percent |
      | 1280  | 800    | 100     |
      | 320   | 640    | 100     |
      | 1280  | 360    | 100     |
      | 1280  | 800    | 200     |
