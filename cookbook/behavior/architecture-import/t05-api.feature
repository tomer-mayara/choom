@cr-001-t05-api
Feature: Run a cancellable architecture analysis through the desktop boundary
  Scenario: Fresh analysis keeps declared ownership across source directories
    Given a repository declares one workspace component for two source directories
    And its next completed analysis reports an import to a declared package
    When I analyze the repository through the architectural layer
    Then the document contains the new component relationship
    And it contains only the declared components

  Scenario: Rule errors remain findings in a completed analysis
    Given the next completed analysis reports an error rule finding
    When I analyze the repository through the architectural layer
    Then the architecture document retains the finding and its import

  Scenario Outline: Unmet local prerequisites explain why analysis cannot run
    Given native analysis reports "<problem>"
    When I analyze the repository through the architectural layer
    Then analysis fails with an explanation of "<problem>"
    And no completed report is converted

    Examples:
      | problem                 |
      | node-not-found          |
      | unsupported-node        |
      | analyzer-not-found      |
      | unsupported-analyzer    |
      | unsupported-config-path |

  Scenario Outline: Incomplete execution never becomes a document
    Given native analysis reports "<problem>"
    When I analyze the repository through the architectural layer
    Then analysis fails with an explanation of "<problem>"
    And no completed report is converted

    Examples:
      | problem          |
      | execution-failed |
      | timed-out        |
      | output-limit     |
      | report-missing   |
      | report-invalid   |

  Scenario: Malformed completed JSON fails at conversion
    Given native execution completes with malformed report JSON
    When I analyze the repository through the architectural layer
    Then analysis fails at conversion without a document

  Scenario Outline: Cancellation waits for native cleanup
    Given repository analysis is "<phase>"
    When I cancel that analysis
    Then it ends as cancelled after its native job is cleaned up
    And no architecture document is returned

    Examples:
      | phase                    |
      | awaiting job preparation |
      | running the analyzer     |

  Scenario: Already cancelled work starts no native job
    Given the analysis request has already been cancelled
    When I analyze the repository through the architectural layer
    Then it ends as cancelled without preparing a native job

  Scenario: Cancellation during conversion suppresses its document
    Given completed analysis is being converted
    When I cancel that analysis
    Then no architecture document is returned
    And its outcome is cancelled

  Scenario: Cleanup failure is not reported as successful cancellation
    Given cancellation cannot clean up the native analysis job
    When I cancel that analysis
    Then analysis fails at cleanup with a useful explanation

  Scenario: Analysis borrows the repository session
    Given the next native analysis completes successfully
    When I analyze the repository through the architectural layer
    Then its native job is released
    And its repository session remains open

  Scenario: Progress identifies the work and its elapsed time
    Given the next native analysis completes successfully
    When I analyze the repository through the architectural layer
    Then progress includes setup, analysis, conversion, and validation
    And elapsed times are nonnegative and do not decrease

  Scenario: A progress observer cannot abandon a native job
    Given the progress observer throws while analysis is running
    When I analyze the repository through the architectural layer
    Then its native job is released
    And the operation returns a terminal outcome

  Scenario: Browser use explains that execution requires the desktop app
    Given the architectural layer is used without the desktop host
    When I analyze the repository through the architectural layer
    Then analysis fails with a desktop availability explanation

  Scenario: Explicit runtime configuration reaches the desktop boundary
    Given an absolute Node executable is configured for analysis
    When I analyze the repository through the architectural layer
    Then native preparation receives that executable selection
    And it receives the declared configuration and literal inputs
