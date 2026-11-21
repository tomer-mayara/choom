@baseline-viewer @browser @discovery-result
Feature: Show what the discovery left uncertain
  A reader can attach the discovery result of the run that saved the open
  baseline. The viewer shows its recorded questions and gaps beside the items
  that they name. It reads only the selected file and changes no file.

  Scenario: Open a discovery result for the open baseline
    Given an open baseline and a discovery result for it with two questions about Billing and one deferred file
    When the user opens the discovery result
    Then Billing shows two recorded questions
    And the deferred file is listed with its reason
    And the list says that these are recorded questions and gaps, not defects

  Scenario: A discovery result for another baseline is refused
    Given an open baseline and a discovery result with a different baseline digest
    When the user opens the discovery result
    Then the viewer refuses it and keeps the open baseline

  @worked-example
  Scenario: Open the TraceRelic worked example from the manager guide
    Given the user opens the TraceRelic example baseline and shows non-production components
    When the user opens the discovery result
    Then the viewer shows the digest of the example baseline in the discovery summary

  Scenario: Copy a decision for one statement
    Given an open baseline
    When the user copies a decision for the Billing purpose
    Then the copied text is a decision-file entry for that statement
    And the open baseline does not change
