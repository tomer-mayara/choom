@baseline-viewer @browser @ep-05
Feature: Show reviewed system entry points on the plot
  Scenario Outline: Mark direct owners in <mode> mode at <width> pixels
    Given the version 4 file recording one Startup and three External entries is open at <width> pixels
    When the reader views <mode> connections
    Then the direct owners show Startup 1 and External 3
    And the parent group shows no inherited marker
    And the marked component can be inspected by keyboard after Fit view

    Examples:
      | mode     | width |
      | Selected | 1280  |
      | All      | 1280  |
      | Selected | 320   |
      | All      | 320   |

  Scenario: Keep counts readable alongside a duplication marker on a narrow plot
    Given a narrow plot shows a component with one Startup, twenty External entries, and a duplicate finding
    Then the full two-line name, both entry counts, and duplication marker fit in the component header

  Scenario: Explain the entry markers
    Given the version 4 file recording one Startup and three External entries is open at 1280 pixels
    Then the plot legend explains the two markers, their saved scope, and connection arrows

  Scenario Outline: Explain entry review coverage
    Given a baseline whose system-entry assessment is <state>
    Then the plot says <message>

    Examples:
      | state                      | message                             |
      | not recorded               | Entry points not recorded           |
      | empty in its stated scope  | No entry points found in this scope |
      | recorded with limits       | Review has limits                   |

  Scenario: Read the review scope and limits
    Given a baseline whose system-entry assessment is recorded with limits
    When the reader opens Baseline details for the entry assessment
    Then the saved scope, limits, and scope evidence are readable

  Scenario: Keep a full-length scope evidence reference within a narrow panel
    Given the narrow plot opens an assessment citing a full-length evidence reference
    When the reader opens Baseline details for the entry assessment
    Then the full reference stays within the Baseline details panel
