@baseline-viewer @bv-06 @browser
Feature: Inspect recorded baseline details
  Choom shows what the baseline records.
  A recorded status or check is not a verified result.

  Scenario: Read baseline metadata
    Given a rich baseline is open for record inspection
    When the user opens the baseline details with a keyboard
    Then the format, baseline ID, and parent baseline ID are readable

  Scenario: Identify the first baseline
    Given the first baseline is open for record inspection
    When the user opens the baseline details with a keyboard
    Then its parent baseline field identifies that it has no parent

  Scenario Outline: Read every item kind with a keyboard
    Given a rich baseline is open for record inspection
    When the user opens the <kind> record with "<key>"
    Then all recorded <kind> fields are readable
    And opening the record keeps the diagram zoom

    Examples:
      | kind             | key   |
      | parent component | Enter |
      | leaf component   | Space |
      | interface        | Enter |
      | resource         | Space |
      | rule             | Enter |

  Scenario: Read accepted statements without loading references or running checks
    Given a rich baseline is open for record inspection
    When the user opens the rule record with "Enter"
    Then its proposed and accepted statements keep their recorded references
    And evidence is marked not loaded without a pass or fail result
    And recorded references and checks have not opened or run anything

  Scenario: Read markup as text
    Given a rich baseline is open for record inspection
    When the user opens the resource record with "Enter"
    Then the recorded markup is shown as text
    And recorded references and checks have not opened or run anything

  Scenario Outline: Keep unknown values distinct from missing fields
    Given an unknown-value baseline is open for record inspection
    When the user opens the <kind> record with "Enter"
    Then the <kind> record identifies its unknown and missing fields

    Examples:
      | kind             |
      | parent component |
      | interface        |
      | resource         |
      | rule             |

  Scenario: Keep empty exclusions visible
    Given a rich baseline is open for record inspection
    When the user opens the leaf component record with "Enter"
    Then empty exclusions are shown as an empty list

  Scenario: Keep all reviewed rules available
    Given the reviewed baseline is open for rule inspection
    When the user opens the Rules list with a keyboard
    Then all 21 reviewed rules are available for inspection

  Scenario: Keep rules when no diagram items are modeled
    Given a rules-only baseline is open for record inspection
    When the user opens the Rules list with a keyboard
    Then every rule in the baseline is available for inspection

  Scenario Outline: Return focus after an item inspection
    Given a rich baseline is open for record inspection
    And the <kind> record is open with a keyboard
    When the user closes the current record with Escape
    Then focus returns to the <kind> inspection control

    Examples:
      | kind             |
      | parent component |
      | leaf component   |
      | interface        |
      | resource         |
      | rule             |

  Scenario: Return from a rule to the diagram
    Given a rich baseline is open for record inspection
    And the rule record is open with a keyboard
    When the user closes the rule and then the Rules list with Escape
    Then the Rules list is closed and its opener has focus

  Scenario: Read long details without moving the diagram
    Given a rich baseline is open for record inspection
    When the user reads to the end of the resource access rules
    Then the full record can be read inside the details panel
    And opening the record keeps the diagram zoom

  Scenario: Close a previous rule when another baseline finishes opening
    Given a rich baseline is open for record inspection
    When a replacement baseline finishes while a rule is being inspected
    Then the replacement baseline is visible with all details closed
