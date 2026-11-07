@cr-001 @cr-001-t06 @packaged @packaged-native-documents
Feature: Store portable documents in the installed application
  Scenario: A saved candidate can be exported and reopened without its repository
    Given an installed repository declares one workspace component for two source directories
    When the installed application analyzes it and exports its architecture
    Then the reopened architecture preserves its declared components and both file pairs
    And the source repository is no longer available
    And its released candidate is no longer available

  Scenario: Replacing an export requires consent
    Given an existing export contains architecture "Previous"
    When the installed application exports "Current" without replacement consent
    Then the destination still contains "Previous"
    And the export reports that the destination already exists

  Scenario: Current and candidate snapshots bound cache growth
    Given the installed application retains a current snapshot and a candidate
    When another candidate is requested
    Then it is refused without creating another snapshot

  Scenario: Discarding a candidate leaves room for its replacement
    Given the installed application retains a current snapshot and a candidate
    When the candidate is replaced with a new document
    Then the new candidate is stored and the current snapshot remains available
