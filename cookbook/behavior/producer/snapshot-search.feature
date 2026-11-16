@producer
Feature: Search the saved snapshot
  The producer searches the text of the saved snapshot with ripgrep. Each search
  saves a tool-call record with the matches, the searched scope, the limits and
  the ripgrep version. A search with no match still records what it searched.

  Scenario: Find a name in a configuration file
    Given a saved snapshot whose deployment file names a worker script
    When the operator searches the snapshot for that script name
    Then the result lists the file, line and text of each match
    And it records the searched scope and the ripgrep version

  Scenario: A search with no match records what was searched
    Given a saved snapshot
    When the operator searches for text that is not in it
    Then the result says that there is no match
    And it names the searched files and the capture exclusions
