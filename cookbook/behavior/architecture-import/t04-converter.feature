@cr-001-t04-api
Feature: Convert completed reports into portable component observations
  Scenario: Source inputs do not limit followed component imports
    Given a completed report follows an import from a workspace input to a declared package
    When the completed report is converted
    Then the converted document connects the workspace to the declared package
    And its provenance keeps the declared source inputs

  Scenario: Several source directories share one declared component
    Given a completed report has imports from two workspace subdirectories to a declared package
    When the completed report is converted
    Then one component relationship retains both reported file pairs
    And no extra components are created from source directories

  Scenario: Reference-only module records count as reported files
    Given a completed report includes a local target that was not followed
    When the completed report is converted
    Then the declared package counts that target as one reported file

  Scenario Outline: Canonical location determines internal ownership
    Given a completed report reaches the declared package through "<reference>"
    When the completed report is converted
    Then the converted document connects the workspace to the declared package
    And the target evidence uses the canonical package file

    Examples:
      | reference            |
      | a package alias      |
      | an internal symlink  |

  Scenario: Mixed import forms retain distinct evidence
    Given a completed report contains different import forms for the same local file pair
    When the completed report is converted
    Then the relationship retains the distinct import flags and their unknown values

  Scenario Outline: Findings need no visible component relationship
    Given a completed report contains "<finding>" without a cross-component import
    When the completed report is converted
    Then the converted diagnostics retain the "<subject>" subject
    And the finding creates no component relationship

    Examples:
      | finding                   | subject      |
      | an orphan violation       | file         |
      | a folder violation        | folder       |
      | an unresolved import      | unresolved   |
      | a builtin violation       | builtin      |
      | an external package rule  | package      |
      | an outside-root violation | outside-root |

  Scenario Outline: Finding paths retain order and repeated references
    Given a completed report contains an ordered "<path>" with a repeated file
    When the completed report is converted
    Then its diagnostic keeps the reported "<path>" order

    Examples:
      | path  |
      | cycle |
      | via   |

  Scenario: Folder metrics keep their source and target roles
    Given a completed report contains a folder instability finding
    When the completed report is converted
    Then its diagnostic keeps the source and target folder metrics
    And the finding creates no extra components

  Scenario Outline: Changed graph semantics cannot be attributed as a file graph
    Given a completed report has "<condition>"
    When the completed report is converted
    Then conversion fails with "unsupported"

    Examples:
      | condition                    |
      | collapse enabled             |
      | focus enabled                |
      | reaches enabled              |
      | a consolidated module        |
      | a different base directory   |
      | non-JSON output              |
      | persistent caching           |

  Scenario: Scope notes explain excluded components
    Given a completed report excludes a declared legacy component
    When the completed report is converted
    Then the legacy component remains with zero reported files
    And its scope notes describe the exclusion

  Scenario: Presentation options do not change JSON conversion
    Given a completed report has diagram reporter options and highlighting
    When the completed report is converted
    Then the converted document connects the workspace to the declared package

  Scenario: Missing language support invalidates completed analysis
    Given a completed report says a required transpiler is unavailable
    When the completed report is converted
    Then conversion fails with "unavailable"
    And its failure identifies the required transpiler

  Scenario: A non-blocking analyzer warning remains visible
    Given a completed supported report contains a non-blocking warning
    When the completed report is converted
    Then the converted document retains the warning message

  Scenario: Missing source files do not receive invented ownership
    Given a reported local source file disappears before conversion
    When the completed report is converted
    Then conversion fails with "source-changed"
    And its failure identifies the missing relative source file

  Scenario: Malformed reports fail at the report boundary
    Given a completed report is malformed
    When the completed report is converted
    Then conversion fails with "invalid-observations"
