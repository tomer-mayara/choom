@baseline-viewer @baseline-readability @br-02 @browser
Feature: Read the component overview
  The drawing shows component names and direct interface counts.
  The side panel keeps the complete baseline available for inspection.

  Scenario: Start with a readable overview
    Given the reviewed five-component baseline is ready to open
    When the user opens the prepared hierarchy baseline
    Then the overview shows only the five recorded components and no relationship lines
    And all five component names are readable at 100 percent in a 1280 by 800 window
    And Workspace shows five owned interfaces and Architecture model shows one

  Scenario: Keep records outside the drawing available
    Given the reviewed five-component baseline is ready to open
    When the user opens the prepared hierarchy baseline
    Then Baseline details lists all eight interfaces and five resources
