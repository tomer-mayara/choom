@baseline-viewer @baseline-readability @br-07 @br-07b @browser
Feature: Explain unknown interface endpoints
  These scenarios use All connections when a drawing is available.
  Missing endpoint facts do not create guessed arcs.
  The viewer explains missing facts and keeps the recorded details available.

  Scenario: Explain the reviewed baseline's missing arcs
    Given the "reviewed" endpoint baseline is ready to open
    When the user opens the endpoint baseline
    Then the unknown-endpoint note counts 8 interfaces
    And no endpoint interface arcs are shown
    And directly owned interface counts and selected file bytes are unchanged

  Scenario: Explain unknown consumers from the owner's list
    Given the "reviewed" endpoint baseline is open
    When the user inspects its first interface from the owner's list
    Then interface details explain "Allowed consumers are unknown."
    And both endpoint statements retain their values, status, and references

  Scenario Outline: Preserve partial endpoint knowledge
    Given the "<facts>" endpoint baseline is open
    When the user inspects its first interface from Baseline details
    Then interface details explain "<reason>"
    And both endpoint statements retain their values, status, and references
    And the unknown-endpoint note counts 1 interface
    And no endpoint interface arcs are shown

    Examples:
      | facts             | reason                                   |
      | unknown consumers | Allowed consumers are unknown.           |
      | unknown owner     | Owner is unknown.                        |
      | both unknown      | Owner and allowed consumers are unknown. |

  Scenario: Keep known arcs beside unknown facts
    Given the "mixed" endpoint baseline is ready to open
    When the user opens the endpoint baseline
    Then only the complete interface has an arc
    And the unknown-endpoint note counts 1 interface
    And directly owned interface counts and selected file bytes are unchanged

  Scenario: Explain missing endpoints without a drawing
    Given the "no components" endpoint baseline is ready to open
    When the user opens the endpoint baseline
    Then the unknown-endpoint note counts 1 interface
    And No components modeled remains visible without page overflow

  Scenario: Inspect unknown endpoints without components
    Given the "no components" endpoint baseline is open
    When the user inspects its first interface from Baseline details
    Then interface details explain "Owner and allowed consumers are unknown."
    And both endpoint statements retain their values, status, and references

  Scenario Outline: Omit an unnecessary unknown-endpoint note
    Given the "<facts>" endpoint baseline is ready to open
    When the user opens the endpoint baseline
    Then no unknown-endpoint note is shown

    Examples:
      | facts         |
      | complete      |
      | no interfaces |
