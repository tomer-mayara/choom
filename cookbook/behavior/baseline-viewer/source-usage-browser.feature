@baseline-viewer @br-11 @br-11a @browser
Feature: Open source-use records as one complete baseline
  Scenario: Keep the complete source record available
    Given a source-use baseline is open in the viewer
    When the user opens Original source-use data in Baseline details
    Then every saved source-use value is readable
    And no permission-based unknown-consumer message is shown

  Scenario Outline: Draw only saved source use in version <version>
    Given a version <version> source-use baseline permits Admin but records Checkout as its consumer
    When the user selects all source-use connections
    Then the plot shows Checkout's source-use arrow
    And no Admin permission arrow or permission legend is shown

    Examples:
      | version |
      | 3       |
      | 4       |

  Scenario: Read version 4 source consumers
    Given a version 4 source-use baseline permits Admin but records Checkout as its consumer
    When the reader opens Invoice API from Billing
    Then Used by identifies Checkout as a source consumer

  Scenario Outline: Reject source-use replacement atomically
    Given an interface example is open with connection choices recorded
    When the user opens source-use replacement with <defect>
    Then the old drawing, legend, inspection, example, and connection choices remain
    And the source-use replacement failure names the affected field

    Examples:
      | defect            |
      | a missing component |
      | too many uses     |
