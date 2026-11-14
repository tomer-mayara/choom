@baseline-viewer @br-11 @br-11f
Feature: Read saved source consumers in the assembled viewer
  Saved callers and method declarations remain separate from permission and execution.
  Reading a source review does not change the file or move components.

  @browser
  Scenario: Follow reviewed component connections
    Given the source-consumer review file is open through the browser file control
    When the reader chooses All connections with self-connections off
    Then the five reviewed cross-component connections are shown
    When the reader selects Workspace in Selected mode
    Then only its four reviewed cross-component connections are shown
    When the reader chooses All connections and includes self-connections
    Then the five cross-component and six internal connections are shown
    And the source-consumer file and component positions are unchanged

  @browser
  Scenario: Read callers and signatures from one saved source review
    Given the source-consumer review file is open through the browser file control
    When the reader opens the reviewed baseline model interface
    Then its Used by section identifies the saved Workspace consumer
    When the reader follows every source assessment and documented entry
    Then the callers, evidence, scope, signatures, examples, and access agree with the file
    And the source-consumer file and component positions are unchanged

  @browser @br-11f-limits
  Scenario Outline: Reach the final source-use records at the supported limits
    Given a source-use file at the supported limits is open in a <width> by <height> browser window
    When the reader opens its interface and reaches the final caller and source note
    Then all 2000 uses and 4000 source notes are reachable without clipping the page
    And the source-use reading times and host are recorded

    Examples:
      | width | height |
      | 390   | 640    |
      | 1280  | 400    |

  @packaged
  Scenario: Read the same source-consumer file in the installed app
    Given the source-consumer review file is open through the native file picker
    When the installed reader follows its reviewed connections and every documented interface
    Then the installed callers, evidence, scope, signatures, examples, and access agree with the file
    And the installed source-consumer file and component positions are unchanged

  @packaged
  Scenario: Retain source-consumer inspection after failed or cancelled native opens
    Given the source-consumer review file is open through the native file picker
    And an installed source-consumer example is selected
    When the native picker opens malformed and excessive source-use files and is then cancelled
    Then the installed source-consumer example and drawing remain usable
    And the installed source-consumer file and component positions are unchanged

  @browser @br-11f-limits
  Scenario: Read a shared note without opening every citation list
    Given a source-use file with 2000 callers sharing 100 notes is open
    When the reader opens Sources and one shared note's caller list
    Then its last citing use is reachable while the other note lists stay closed
    And the source-use reading times and host are recorded
