@browser @baseline-viewer @baseline-readability @br-10 @br-10d
Feature: Read interface sources and retain inspection context
  Sources explains the saved provenance without loading or verifying source files.

  Scenario: Read useful saved source notes
    Given the interface source baseline is open
    When the user opens its Sources tab
    Then its saved note descriptions and two available source locations are readable
    And the note without a location has no invented path
    And reading Sources makes no source request or navigation

  Scenario: Retain every original interface value
    Given the interface source baseline is open
    When the user expands its Original record in Sources
    Then its complete original interface values are available


  Scenario: Keep provenance complete without repeating it
    Given the interface source baseline is open
    When the user expands its recorded statements and evidence references
    Then each evidence ID appears once with every citing field path
    And the saved acceptance reference and unresolved evidence remain available as plain text

  Scenario: Return to the opening list
    Given the interface source baseline is open from a scrolled owned list
    When the user reads its selected example through Sources and goes Back
    Then its owned list row and scroll position return without moving the drawing

  Scenario: Preserve all tab reading choices
    Given the interface source baseline has an example being read
    When the user returns through Sources and Overview to Example
    Then its selected entry, case, result, and reading position remain
    And all Overview and Sources disclosures remain expanded without extra Back history

  Scenario Outline: Preserve inspection after an unsuccessful replacement
    Given the interface source baseline has an example being read
    When opening a replacement source baseline <outcome>
    Then its selected entry, case, result, and reading position remain
    And all Overview and Sources disclosures remain expanded without extra Back history

    Examples:
      | outcome      |
      | fails        |
      | is cancelled |

  Scenario: Start fresh on a successful same-ID replacement
    Given the interface source baseline has an example being read
    When the user opens Sources and successfully replaces the baseline with the same saved IDs
    Then the old frame is removed and a new selection starts with the first entry on Overview
    And its source disclosures start closed

  Scenario Outline: Reach tabs and disclosures with visible keyboard focus
    Given the source reader window is <width> by <height> with <percent> percent text
    And the interface source baseline is open
    When the user reads all Sources disclosures with the keyboard
    Then source controls stay visible and the page has no horizontal overflow

    Examples:
      | width | height | percent |
      | 320   | 640    | 100     |
      | 1280  | 360    | 100     |
      | 1280  | 800    | 200     |

  @interface-reverse-focus
  Scenario Outline: Read earlier example choices with reverse keyboard navigation
    Given the source reader window is <width> by <height> with <percent> percent text
    And the interface source baseline is open
    When the user returns from Detailed result to the first example with Shift Tab
    Then the focused first example is fully below the sticky tabs

    Examples:
      | width | height | percent |
      | 1280  | 360    | 100     |
      | 320   | 640    | 100     |
      | 1280  | 800    | 200     |

  @interface-reverse-focus
  Scenario: Select a partly visible example with the pointer
    Given the source reader window is 1280 by 360 with 100 percent text
    And the interface source baseline is open
    When the user presses and releases the visible part of an example choice
    Then the press keeps the choice in place and selects that example

  @touch
  Scenario: Read Sources with touch
    Given the interface source baseline is open
    When the user opens Sources and its evidence list with touch
    Then its saved note descriptions and two available source locations are readable
    And each evidence ID appears once with every citing field path
