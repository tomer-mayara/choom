@baseline-viewer @ep-01
Feature: Read saved system entry points
  Scenario: Read saved Startup and External entry points
    Given a valid version 4 baseline with a Startup and an External entry
    And no source repository or evidence bundle is available for the entry points
    When the public baseline decoder reads the entry-point file
    Then it returns both entry points with their paths and interface links

  Scenario Outline: Reject invalid system entry data
    Given a version 4 baseline with <problem>
    When the public baseline decoder reads the entry-point file
    Then it reports the invalid entry-point field

    Examples:
      | problem                                     |
      | an unknown component                        |
      | a source path different from its entry path |
      | a mapping ref different from source use     |
      | more than 2,000 entries                     |
