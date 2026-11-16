@producer
Feature: Read source structure from the snapshot
  The producer opens the saved snapshot as a ts-morph project on an in-memory file
  system that holds only indexed snapshot files with checked digests. The Stage 3
  exports action lists the exports of one source file with the compiler settings
  that apply to it. A compiler input that the settings name and the snapshot does
  not hold is a gap, and the project still opens.

  Scenario: List the exports of a source file
    Given a saved snapshot with a file that exports a function and a type
    When the operator asks for the exports of that file
    Then the result lists both exports with their kinds and source ranges

  Scenario: A missing declaration file is a gap
    Given a saved snapshot whose compiler settings name a declaration file that was not captured
    When the operator opens the source project
    Then the project opens
    And a gap names the missing declaration file
