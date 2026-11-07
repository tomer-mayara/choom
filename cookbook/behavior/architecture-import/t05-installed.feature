@cr-001 @cr-001-t05 @packaged @packaged-native-analysis
Feature: Run repository analysis from the installed application
  Background:
    Given Choom is installed independently of its development checkout
    And an installed analysis repository has a local dependency-cruiser 18.7.2 installation

  Scenario: Analyze current source using the installed application's Node discovery
    When the installed application analyzes the repository before and after a source import changes
    Then the second completed report includes the new import and its error finding
    And the first completed report has neither the import nor the finding
    And both analyses remove their private report files without using a persistent cache

  Scenario: Refuse a report from a failed analyzer process
    Given the real analyzer exits unsuccessfully after writing report bytes
    When the installed application analyzes the repository through native operations
    Then the native analysis fails without returning a report
    And the failed analysis removes its private report file

  Scenario: Stop a running analyzer and retry from the installed application
    Given the real analyzer starts a child process and waits
    When the installed application cancels the analysis after the child process starts
    Then the native analysis ends as cancelled after removing its child process and private report file
    And the installed application can run another analysis in the same repository session
