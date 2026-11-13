@baseline-viewer @baseline-readability @br-10 @br-10a
Feature: Read versioned interface documentation
  The saved baseline can explain an interface without changing its architecture.

  Scenario: Decode documented interfaces
    Given a valid documented version 2 baseline
    When the public decoder reads the documented baseline
    Then all saved architecture and documentation values are preserved

  Scenario: Keep version 1 strict
    Given a version 1 baseline with new documentation fields
    When the public decoder reads the documented baseline
    Then the documentation is rejected as an invalid document

  Scenario Outline: Reject invalid documentation
    Given documented baseline data with <defect>
    When the public decoder reads the documented baseline
    Then the documentation is rejected at an affected field

    Examples:
      | defect                          |
      | duplicate entry ID              |
      | unknown access point            |
      | interaction on a type           |
      | unknown example basis           |
      | unknown result scope            |
      | uncited source note             |
      | reversed source range           |
      | missing reviewed location       |
      | another statement's source note |

  @browser
  Scenario Outline: Reject excessive documentation before replacing the view
    Given a readable baseline is open and a documented candidate exceeds <limit>
    When the user opens the documented candidate
    Then the viewer names the exceeded documentation limit
    And the previous view and interface inspection remain open

    Examples:
      | limit                     |
      | entries per interface     |
      | examples per entry        |
      | descriptive text bytes    |
      | sample text bytes         |
      | total documentation bytes |

  @browser
  Scenario: Retain complete record access
    Given a supported documented baseline is open for inspection
    When the user opens its interface's Original record disclosure
    Then all saved interface values and statement statuses are readable

  @browser
  Scenario: Replace a documented baseline with the same IDs
    Given a supported documented baseline is open for inspection
    When the user opens a new documented baseline with the same IDs
    Then the new values replace the view and close the old inspection
