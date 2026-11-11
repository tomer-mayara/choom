@baseline-viewer @bv-03
Feature: Open a saved architecture baseline
  Choom displays the saved model without its source repository or an analysis run.

  @browser
  Scenario: Open a baseline without its repository in the browser
    Given only the reviewed baseline file is available to the viewer
    When the user opens the saved baseline in Choom
    Then its baseline ID and five component names are shown
    And repository selection and diagram export are unavailable
    And opening the baseline has not changed the selected file

  @browser
  Scenario: An empty baseline remains an empty model
    Given only the reviewed baseline file is available to the viewer
    When the user opens an empty baseline
    Then the empty baseline is shown without example components

  @browser
  Scenario: A legacy diagram cannot replace the current baseline
    Given only the reviewed baseline file is available to the viewer
    When the user opens the saved baseline in Choom
    And the user opens a legacy diagram
    Then the previous baseline remains visible with a legacy format error

  @browser
  Scenario: Retry reads the selected baseline again after a read failure
    Given only the reviewed baseline file is available to the viewer
    When the next selected file read fails
    And the user opens the saved baseline in Choom
    Then the baseline read failure permits retry
    And the read failure explains how to select the file again
    When the user retries the selected baseline
    Then its baseline ID and five component names are shown

  @browser
  Scenario: Cancelling a delayed layout preserves the previous baseline
    Given the baseline viewer has a controllable layout
    When the user opens the saved baseline in Choom
    And the user cancels another baseline during layout
    Then its baseline ID and five component names are shown
    And a late layout cannot replace a newer baseline

  @browser
  Scenario: A layout failure preserves the current baseline
    Given the baseline viewer has a controllable layout
    When the user opens the saved baseline in Choom
    And the user opens a baseline whose layout fails
    Then the previous baseline remains visible with a layout error
