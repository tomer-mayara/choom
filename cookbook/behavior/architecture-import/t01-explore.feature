@cr-001 @cr-001-t01 @browser
Feature: Explore repository architecture and saved diagrams
  @desktop-ui
  Scenario: Load the repository's declared architecture
    Given a repository declares only components ".", "src", and "packages/core"
    And "src/components/panel.ts" imports "packages/core/model/entity.ts"
    When I load the repository
    Then the diagram contains only those three component cards
    And it shows an import from "src" to "packages/core"

  Scenario: View a saved diagram without its source repository
    Given a Choom YAML document contains only components ".", "src", and "packages/core"
    And its import from "src" to "packages/core" has evidence from "src/components/panel.ts" to "packages/core/model/entity.ts"
    And neither its source repository nor analyzer tools are available
    When I open the document in the browser
    Then the diagram contains only those three cards and the import from "src" to "packages/core"

  Scenario: Retain the starter example
    Given I have not loaded a repository
    When I explore the example
    Then I see "React interface", "Architecture model", and "Tauri desktop"
    And the interface connects to the model and desktop

  @desktop-ui
  Scenario: Cancelling repository selection preserves the selection
    Given "Atlas" is my selected repository
    When I cancel choosing another repository
    Then "Atlas" remains selected
