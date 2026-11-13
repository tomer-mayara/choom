@browser @baseline-viewer @baseline-readability @br-10 @br-10c
Feature: Read saved interface examples
  Examples describe saved cases. Choom displays them without running them.

  Scenario: Discover the saved example choices
    Given the interface example baseline is open
    When the user opens the interface Example tab
    Then the saved example choices are available

  Scenario: Read a saved failure example and its result excerpt
    Given the interface example baseline is open
    When the user selects the An empty order example
    Then its saved sample, input, result explanation, and recorded basis are shown
    And its detailed result is a saved excerpt

  Scenario: Keep absent examples explicit for the selected entry
    Given the interface example baseline is open
    When the user selects the Invoice type entry for examples
    Then Example names Invoice type and says no example is recorded for this entry

  Scenario: Read a data example without implying a call
    Given the interface example baseline is open
    When the user selects the Invoice data entry for examples
    Then its saved data sample is shown without an invented call or result

  Scenario: Copy the displayed example with the keyboard
    Given the interface example baseline is open
    And the browser permits clipboard access
    When the user opens Example and copies the An empty order example with the keyboard
    Then exactly the saved example text is copied and success is announced

  @touch
  Scenario: Select and copy a saved example with touch
    Given the interface example baseline is open
    And the browser permits clipboard access
    When the user selects and copies the An empty order example with touch
    Then exactly the saved example text is copied and success is announced

  Scenario: Keep failed clipboard access honest
    Given the interface example baseline is open
    And the browser denies clipboard writing
    When the user opens Example and copies the An empty order example with the keyboard
    Then the example remains selectable with manual copy guidance and no success

  Scenario: Keep saved markup and commands inert
    Given the interface example baseline is open
    When the user selects the Literal sample example
    Then its markup and command are literal text with no request or execution

  Scenario Outline: Restore the same example's reading position
    Given the interface example baseline with a long sample is open
    And the browser viewport is <width> by <height> for example reading
    When the user scrolls its Example and returns through Sources with real tab clicks
    Then the same example, result disclosure, and reading position are restored

    Examples:
      | width | height |
      | 1280  | 800    |
      | 320   | 640    |
      | 1280  | 360    |

  Scenario Outline: Ignore feedback from an obsolete selection
    Given the interface example baseline is open
    And an example copy request is pending
    When the user changes <selection> and the old copy completes with <outcome>
    Then the current example stays selected without old copy feedback

    Examples:
      | selection              | outcome |
      | example                | success |
      | entry                  | failure |
      | entry A to B to A       | failure |
      | same-ID baseline       | success |
      | closed frame           | failure |
      | direct same-ID frame   | success |

  Scenario Outline: Report only the latest copy request
    Given the interface example baseline is open
    And an example copy request is pending
    When a newer copy completes with <latest> before the older copy completes with <older>
    Then only the <latest> copy outcome is announced

    Examples:
      | latest  | older   |
      | success | failure |
      | failure | success |

  Scenario Outline: Keep a switched tab visible in a small panel
    Given the interface example baseline with a long sample is open
    And the browser viewport is <width> by <height> for example reading
    When the user switches to Example with <input>
    Then the focused Example tab is inside the visible record area

    Examples:
      | width | height | input    |
      | 320   | 640    | pointer  |
      | 320   | 640    | keyboard |
      | 1280  | 360    | pointer  |
      | 1280  | 360    | keyboard |

  Scenario Outline: Keep the selected example visible after resetting a small panel
    Given the interface example baseline with a long sample is open
    And the browser viewport is <width> by <height> for example reading
    When the user selects another example with <input>
    Then its focused choice is visible and its new result is closed

    Examples:
      | width | height | input    |
      | 320   | 640    | pointer  |
      | 320   | 640    | keyboard |
      | 1280  | 360    | pointer  |
      | 1280  | 360    | keyboard |
