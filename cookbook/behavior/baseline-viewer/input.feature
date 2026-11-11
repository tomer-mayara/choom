@baseline-viewer @bv-02
Feature: Read a saved architecture baseline
  Choom reads the selected file by its content without opening source or evidence files.

  Scenario: Read a renamed baseline
    Given a supported baseline saved as "example.choom.yaml"
    When its input is decoded
    Then the baseline model is returned

  Scenario Outline: Reject unsupported file content
    Given a selected file contains <problem>
    When its input is decoded
    Then the result identifies the input error

    Examples:
      | problem                       |
      | invalid UTF-8                 |
      | malformed YAML                |
      | duplicate mapping keys        |
      | an unsupported format version |
      | legacy diagram content        |
      | content above the byte limit  |
