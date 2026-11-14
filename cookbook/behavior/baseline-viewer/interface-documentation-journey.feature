@baseline-viewer @br-10 @br-10f
Feature: Read published interface documentation in the assembled viewer
  The file published by the external workflow stays the source of each displayed fact.
  Interface reading does not change the saved file or the drawing.

  @browser
  Scenario: Read an actual published version 2 file through the browser file control
    Given the published documentation file is open in the browser viewer
    When the reader follows its function, failure example, sources, access rule, type, and data sample
    Then each displayed fact and complete original record matches the published file
    And reading the published interfaces leaves the file and drawing unchanged

  @browser
  Scenario Outline: Keep unchanged version 1 files readable
    Given the unchanged "<file>" baseline is open through the browser file control
    When the reader opens each saved interface
    Then its saved prose and unknown facts remain available without invented examples or call activity
    And reading the published interfaces leaves the file and drawing unchanged

    Examples:
      | file                    |
      | legacy-baseline-003.yaml |
      | full.yaml               |

  @browser
  Scenario: Read the last example at the supported documentation and display limits
    Given the documentation and display limit file is open through the browser file control
    When the reader selects the final entry and its final example
    Then the complete saved sample remains readable and its controls work
    And the file and graph data remain unchanged

  @browser
  Scenario Outline: Keep a function signature's own saved state
    Given a documented function with a <state> signature is open through the browser file control
    When the reader inspects its Signature and recorded source metadata
    Then the signature keeps its exact saved state without an inferred declaration

    Examples:
      | state   |
      | known   |
      | unknown |
      | missing |

  @packaged
  Scenario: Read an actual published version 2 file in the installed application
    Given the published documentation file is open through the native file picker
    When the installed reader follows its function, failure example, sources, access rule, type, and data sample
    Then the installed details agree with the complete published record
    And installed copy reports its real host outcome and keeps the sample selectable
    And the installed reading journey leaves the saved bytes and drawing unchanged

  @packaged
  Scenario: Keep an installed example after invalid documentation and picker cancellation
    Given the published documentation file is open through the native file picker
    And an installed published example is selected
    When the native picker opens malformed and excessive documentation and is then cancelled
    Then the old example and interface remain usable with clear load outcomes
    And the installed reading journey leaves the saved bytes and drawing unchanged
