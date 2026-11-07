@cr-001 @cr-001-t04 @browser @desktop-ui
Feature: Preserve the meaning and limits of analyzer observations
  Scenario: Followed imports can extend beyond the entry inputs
    Given only components ".", "src", and "packages/core" are declared
    And the manifest's source input is "src/components"
    And analysis reports "src/components/panel.ts" importing "packages/core/model/entity.ts"
    When I load the repository
    Then the document includes the import from "src" to "packages/core"
    And its recorded source input remains "src/components"

  Scenario: Imports from multiple subdirectories share their declared component
    Given only components ".", "src", and "packages/core" are declared
    And analysis reports these file pairs:
      | sourceFile              | targetFile                     |
      | src/components/panel.ts | packages/core/model/entity.ts  |
      | src/lib/format.ts       | packages/core/types/item.ts    |
    When I load the repository
    Then there is one import from "src" to "packages/core" with both file pairs as evidence
    And the document contains only the three declared components

  Scenario: Reference-only files count as reported files
    Given "src/core" is a declared component
    And analysis contains one local file record for "src/core/model/entity.ts"
    And that file is reported only as an import target
    When I load the repository
    Then "src/core" has a reported-file count of 1
    And the count is not described as an analyzed-file count

  Scenario Outline: Internal package references keep component ownership
    Given only components ".", "src", and "packages/core" are declared
    And "src/components/panel.ts" imports "packages/core/model/entity.ts" through <reference>
    And the canonical target belongs to declared component "packages/core"
    When I load the repository
    Then the document contains an import from "src" to "packages/core"
    And its target evidence is "packages/core/model/entity.ts"

    Examples:
      | reference               |
      | a package alias         |
      | an in-repository symlink |

  Scenario Outline: Findings survive without a visible component import
    Given only components "." and "src" are declared
    And analysis reports <finding> without a cross-component import
    When I load the repository
    Then diagnostics retain <detail>
    And the document still contains only "." and "src", with no component import

    Examples:
      | finding                                    | detail                                      |
      | an orphan finding for "src/core/model.ts"   | the file subject "src/core/model.ts"         |
      | a folder finding for "src/lib"             | the folder subject "src/lib"                |
      | an unresolved import of "missing-package"  | the unresolved specifier "missing-package"  |

  Scenario Outline: Ordered finding paths keep their order
    Given only components "." and "src" are declared
    And a reported <path> contains "src/core/z.ts", "src/core/a.ts", and "src/core/z.ts" in that order
    When I load the repository
    Then the diagnostic retains that <path> in the reported order

    Examples:
      | path  |
      | cycle |
      | via   |

  Scenario: Folder metrics retain their source and target
    Given only components "." and "src" are declared
    And a folder finding reports source "src/ui" with instability 0.8
    And its target is "src/core" with instability 0.2
    When I load the repository
    Then the finding identifies "src/ui" as source and "src/core" as target
    And its metrics are source.instability 0.8 and target.instability 0.2

  Scenario Outline: Reject unsupported analysis semantics
    Given completed analysis has <condition>
    When I load the repository
    Then loading is refused with an unsupported-configuration explanation for <condition>

    Examples:
      | condition                                        |
      | collapse enabled                                 |
      | focus enabled                                    |
      | reaches enabled                                  |
      | consolidated module records                      |
      | a base directory other than the selected root     |
      | effective output other than JSON                  |
      | persistent caching enabled                       |

  Scenario: Explain an analysis exclusion without claiming no dependencies
    Given the configuration excludes "src/legacy"
    And analysis reports no files for declared component "src/legacy"
    When I load the repository
    Then "src/legacy" remains in the document with a reported-file count of 0
    And the analysis scope notes describe the exclusion

  Scenario: Missing required language support prevents a successful load
    Given the configured analysis requires a transpiler that is unavailable
    When I load the repository
    Then loading fails and identifies the missing required transpiler

  Scenario: Non-blocking analyzer warnings remain visible
    Given "src/ui" and "src/core" are declared components
    And completed supported analysis reports an import from "src/ui" to "src/core"
    And it includes a non-blocking warning
    When I load the repository
    Then the document contains that import and retains the warning's message

  Scenario: Disappearing source files do not receive invented ownership
    Given only components "." and "src" are declared
    And analysis reports the local file "src/core/model.ts"
    And that file disappears before the import finishes
    When the repository load finishes
    Then it fails with a source-change error for "src/core/model.ts"
