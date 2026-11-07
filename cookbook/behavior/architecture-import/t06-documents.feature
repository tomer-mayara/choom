@cr-001 @cr-001-t06 @browser
Feature: Save and reopen portable architecture documents
  Scenario: Export and reopen preserve architecture meaning
    Given I exported a document containing only components ".", "src", and "packages/core"
    And its import from "src" to "packages/core" has this evidence:
      | sourceFile              | targetFile                    |
      | src/components/panel.ts | packages/core/model/entity.ts |
      | src/lib/format.ts       | packages/core/model/entity.ts |
    And "src" has a reported-file count of 3
    And a folder finding identifies source "src/components" and target "packages/core/model"
    When I reopen that export
    Then only those three components and the import with both file pairs are present
    And "src" still has a reported-file count of 3
    And the finding keeps source folder "src/components" and target folder "packages/core/model"

  Scenario: Collection order does not invalidate a document
    Given a Choom YAML document lists only components "packages/core", ".", and "src" in that order
    And "packages/core" and "src" both name "." as their parent
    And it describes an import from "src" to "packages/core"
    When I open the document
    Then the diagram includes only ".", "src", and "packages/core"
    And the import from "src" to "packages/core" is present

  Scenario Outline: Reject unsupported document encodings without changing the file
    Given a Choom YAML file contains <content>
    When I open the file
    Then loading is refused because <reason>
    And the original file is unchanged

    Examples:
      | content                       | reason                                |
      | schemaVersion 2               | that schema version is unsupported    |
      | duplicate mapping keys        | mapping keys must be unique           |
      | a custom YAML tag             | custom tags are unsupported           |
      | two YAML documents            | a file must contain one document      |
      | an unknown semantic field     | that field is not part of the schema  |

  @desktop-ui
  Scenario: Exports do not disclose machine-specific paths
    Given the repository is located at "/home/alex/Atlas"
    And a reported finding refers outside it to "/home/alex/shared/model.ts"
    When I export its diagram
    Then neither exported references nor diagnostic messages contain "/home/alex"
    And the outside-root subject has an opaque identifier

  @desktop-ui
  Scenario: Declining replacement preserves an existing export
    Given the destination contains a diagram named "Previous"
    And I am exporting the diagram named "Current"
    When I decline to replace the existing file
    Then the destination still contains "Previous"

  @desktop-ui
  Scenario: A failed replacement preserves both prior file and current view
    Given the destination contains a diagram named "Previous"
    And I approve replacing it with the current diagram named "Current"
    When the export fails before replacement
    Then the destination still contains "Previous"
    And "Current" remains displayed with an export failure notice

  @desktop-ui
  Scenario: An export keeps the diagram selected when it began
    Given an export of "Atlas" is in progress
    And "Beacon" becomes the current diagram
    When the export finishes
    Then the exported document is named "Atlas"
