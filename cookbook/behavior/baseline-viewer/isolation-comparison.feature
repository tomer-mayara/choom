@baseline-viewer @cr005
Feature: Compare isolation between saved baselines

  @b1-1
  Scenario: A pre-existing component arrow now has a forbidden path
    Given History uses Configuration and the complete Before check found no path from History to Loader
    When After proves a direct import under the same rule and a call to the loader
    Then one New violation shows the new path, call site and Before scope

  @b1-2
  Scenario Outline: An outside caller uses a route or member
    Given a complete Before check found no such outside access
    When After records the new <access> under <policy>
    Then the finding identifies the actual target and says <result>

    Examples:
      | access                              | policy                       | result        |
      | deep import of a public operation   | an active public-path rule   | New violation |
      | call to an unlisted private helper  | an active owner-only rule    | New violation |
      | call to an unlisted helper          | unknown policy               | Needs review  |

  @b1-3
  Scenario: The caller now uses the permitted entry
    Given Before proves a forbidden access and After fully covers the same check
    When After proves the forbidden route is gone and records the permitted route
    Then the former access is a Resolved violation with evidence from both sides

  @b1-4
  Scenario: A second site reaches the same target
    Given Before and After identify the same forbidden crossing
    When the original site moves and a second site is added
    Then one Existing violation lists both After sites and the Before site

  @b1-5
  Scenario: An exception changes the status of an unchanged access
    Given an unchanged access and a new accepted exception naming its rule
    When I compare the two reviews
    Then I see Policy or ownership changed and the exception

  @b1-6
  Scenario: Both scans miss relevant inputs
    Given both scans have the same gap in Before and After coverage and After shows a forbidden call
    When I compare the snapshots
    Then the call is visible as first observed with Comparison limited
    And the result does not claim a new violation or an all-clear

  @b1-7
  Scenario: An existing caller moves out of production
    Given a production caller becomes test-only and the member access is unchanged
    When I compare the files in Production
    Then I see Left production scope on the Before side without a resolved-violation claim

  @b2-1
  Scenario: Both files use baseline-001
    Given a current baseline and an earlier file with the same project key and local baseline ID
    When I select the earlier file to compare
    Then I see the two file identities, the direction and the evidence for the selected finding

  @b2-2
  Scenario: The selected file has a different project key
    Given an open comparison with a selected finding
    When I choose a Before file for a different project
    Then I see a project mismatch and retain the valid pair and selection

  @b2-3
  Scenario: A cancelled read finishes late
    Given an open comparison and a pending replacement Before file
    When I cancel the read and it finishes late
    Then the original pair stays visible and Choom reports cancellation

  @browser @isolation-host
  Scenario: Inspect the published comparison files in the browser
    Given the browser opens the fixed After file for comparison
    When the reader compares the complete, indirect and unresolved Before files
    Then the results show the new, existing and first-observed dependency with evidence
    And cancelling a replacement preserves the last pair and closing keeps After

  @packaged @isolation-host
  Scenario: Inspect the published comparison files in the installed viewer
    Given the installed viewer opens the fixed After file for comparison
    When the reader compares the complete, indirect and unresolved Before files
    Then the results show the new, existing and first-observed dependency with evidence
    And cancelling a replacement preserves the last pair and closing keeps After
