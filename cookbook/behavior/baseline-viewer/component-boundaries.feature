@baseline-viewer @cr005
Feature: Read reviewed component interfaces

  @a1-1
  Scenario: One file describes an observed loader call
    Given v6 bytes with a project key, both owners, a bound loader call and its source note
    When the shared baseline codec opens the file
    Then the decoded crossing retains its access path, member, scope and location

  @a1-2
  Scenario: A caller cites a missing note
    Given an otherwise valid v6 file with a reference to a missing caller note
    When the codec validates it
    Then the error identifies the crossing and the invalid field

  @a1-3
  Scenario: A decision changes the permitted callers
    Given a reviewed baseline and a valid decision that changes a boundary policy
    When the producer makes the next baseline for that snapshot
    Then the new review says Needs refresh and its old verdict cannot support a diff
    And the original baseline still opens with its original evidence

  @browser @a3-1
  Scenario: An engineer opens the configuration interface
    Given a production collector calls GlobalConfigLoader.load and its allowlist is unknown
    When I open the baseline
    Then the Configuration card names GlobalConfigLoader.load
    And selecting it shows the collector as caller and the allowed-consumer policy as unknown
    And Show more opens the remaining Configuration operation with the keyboard

  @browser @published-boundaries
  Scenario: Open the published Stage 6 file in the browser
    Given the browser has the published Stage 6 boundary baseline
    When the reader selects that fixed file
    Then Configuration shows its loader operation and Local collector as a caller
    And the test adapter appears only after opt-in with its Test component label
    And the published boundary file keeps its original digest

  @packaged @published-boundaries
  Scenario: Open the same published Stage 6 file in the installed viewer
    Given the installed viewer has the published Stage 6 boundary baseline
    When the reader selects that fixed file
    Then Configuration shows its loader operation and Local collector as a caller
    And the test adapter appears only after opt-in with its Test component label
    And the published boundary file keeps its original digest
