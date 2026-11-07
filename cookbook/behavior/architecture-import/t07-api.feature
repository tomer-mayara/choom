@cr-001 @cr-001-t07 @cr-001-t07-api
Feature: Keep one current document through a load
  Scenario: Selection reserves the load operation
    Given a repository selection has not finished
    When a saved document load is requested
    Then the second load is refused while selection is pending

  Scenario: Cancellation waits for resources acquired during discovery
    Given repository discovery has not finished
    When the repository load is cancelled
    Then cancellation waits for discovery and releases its repository session

  Scenario: A load stays cancellable while its repository is being released
    Given "Previous" is current and the new analysis is waiting to release its repository
    When cancellation is requested before that repository release completes
    Then "Previous" stays current and the load ends as cancelled after release

  Scenario: A candidate is not displayed before layout completes
    Given "Previous" is current and "Next" is awaiting layout
    When the current document is observed
    Then "Previous" is still current

  Scenario: Cancellation after analysis releases the candidate
    Given "Previous" is current and "Next" is awaiting layout
    When the load is cancelled
    Then "Previous" stays current and the rejected candidate is removed

  Scenario: A late result cannot replace a later document
    Given a load was cancelled while its layout was pending
    And "Current" has since loaded
    When the cancelled layout finishes
    Then "Current" stays current

  Scenario Outline: A failed load preserves the current document
    Given "Previous" is current
    And the next load will fail during <stage>
    When that load is requested
    Then "Previous" stays current and the failure identifies "<stage>"

    Examples:
      | stage      |
      | discovery  |
      | storage    |
      | reading    |
      | validation |
      | layout     |

  Scenario: Cancellation cannot reverse a committed document
    Given "Current" has finished loading
    When cancellation is requested
    Then "Current" stays current and the completed load remains successful

  Scenario: Failed cleanup after display keeps the new document
    Given "Previous" has a stored snapshot
    And that snapshot cannot be removed
    When "Current" finishes loading
    Then "Current" is displayed and another load is blocked until cleanup succeeds

  Scenario: Retrying cleanup preserves the current document
    Given a superseded snapshot could not be removed after "Current" loaded
    When workspace cleanup is retried after removal becomes available
    Then "Current" stays current and another load can start

  Scenario: Unknown analyzer cleanup cannot be cleared by document cleanup
    Given analyzer cleanup failed without returning an owned cleanup handle
    When cleanup retry is requested
    Then another load remains blocked and restarting the application is required

  Scenario: A saved document needs no repository or analyzer
    Given only a portable document for "Atlas" is available
    When that saved document is loaded
    Then "Atlas" is current without repository access or analyzer construction

  Scenario: Retry uses the previous selection after a fix
    Given a selected repository failed because its manifest was missing
    And the missing manifest has been restored
    When the load is retried
    Then the same repository loads without another selection

  Scenario: Export cleanup does not change a successful load
    Given "Previous" is current and "Next" is awaiting layout
    When export cleanup fails and "Next" finishes loading
    Then "Next" is current and its successful load waits for cleanup

  Scenario: Export cleanup does not change a cancelled load
    Given "Previous" is current and "Next" is awaiting layout
    When export cleanup fails and the load is cancelled
    Then "Previous" is current and its cancelled replacement waits for cleanup

  Scenario: Another export can need cleanup while cleanup is being retried
    Given document cleanup is being retried
    When another export needs cleanup before that retry finishes
    Then another load waits for a further successful cleanup retry
