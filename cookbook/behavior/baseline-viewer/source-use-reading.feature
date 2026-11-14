@baseline-viewer @br-11 @br-11c @browser
Feature: Read source consumers and their review scope
  Scenario: Keep source use separate from permission
    Given the complete source-use reading fixture is open
    When the reader opens the interface Overview
    Then Used by names Checkout while Access rule names Admin
    And interface statement status does not certify source use or execution

  Scenario: Keep accepted interface statements separate from source observations
    Given the source-use reading fixture has accepted intent
    When the reader opens the interface Overview
    Then its accepted status labels only interface statements
    And interface statement status does not certify source use or execution

  Scenario Outline: Explain the recorded assessment state
    Given the source-use reading fixture has <state>
    When the reader opens the interface Overview
    Then Used by explains <explanation>

    Examples:
      | state                 | explanation                                  |
      | no source object      | Source use not recorded.                     |
      | no assessment         | Source use not assessed for this interface.   |
      | empty assessment      | No uses found in the reviewed scope.          |
      | unknown provider      | Checkout                                     |
      | other references only | Other source references (2)                  |
      | unmapped caller       | Other source references (1)                  |

  Scenario: Read an inline caller without changing the drawing
    Given the complete source-use reading fixture is open
    When the reader opens the interface Overview
    And the reader expands the first Caller source
    Then the saved caller note and location are readable in Overview
    And reading the source keeps the component positions and viewport unchanged

  Scenario: Keep uses interface-wide while changing methods and tabs
    Given the complete source-use reading fixture is open
    When the reader opens the interface Overview
    And the reader expands the first Caller source
    And the reader selects Refund invoice and visits Sources then returns
    Then Used by retains both entry bindings and the expanded caller source

  Scenario: Retain common provenance and all supporting source references
    Given the complete source-use reading fixture is open
    When the reader opens the source-use Sources tab
    Then the snapshot, mapping, scope, limits, and all use evidence remain readable
    And the original source assessment and original interface remain separate records

  Scenario: Read shared support citations only on demand
    Given the complete source-use reading fixture is open
    When the reader opens the source-use Sources tab
    Then shared source-use citations start collapsed in notes and references
    When the reader expands one note and reference citation list
    Then every use supported by each chosen source remains available

  @touch
  Scenario: Keep source disclosures usable in a narrow touch window
    Given the long source-use reading fixture is open in a narrow touch window
    When the reader opens the interface Overview
    And the reader expands the first Caller source
    Then the long source location fits inside the details panel

  Scenario: Explain partial review without counting policy gaps
    Given the source-use reading fixture has unknown policies
    When the reader opens the interface Overview
    Then the source notice describes partial review without an unknown-consumer count

  Scenario: Read caller sources with the keyboard in a short panel
    Given the complete source-use reading fixture is open
    When the reader opens the interface Overview
    And the reader opens Caller source with the keyboard in a short panel
    Then the saved caller note and location are readable in Overview
    And the focused caller control stays visible below the tabs

  Scenario: Return to the interface list after reading caller sources
    Given the complete source-use reading fixture is open
    When the reader opens the interface Overview
    And the reader expands the first Caller source
    And the reader selects Refund invoice and visits Sources then returns
    And the reader returns to Baseline details
    Then the source reading adds no Back history and restores its interface row

  Scenario Outline: Preserve caller reading after an unsuccessful open
    Given the complete source-use reading fixture is open
    When the reader opens the interface Overview
    And the reader expands the first Caller source
    And the reader selects Refund invoice and visits Sources then returns
    And the source-use replacement <outcome>
    Then Used by retains both entry bindings and the expanded caller source
    And reading the source keeps the component positions and viewport unchanged

    Examples:
      | outcome      |
      | fails        |
      | is cancelled |

  Scenario: Reset source reading when a baseline with the same IDs replaces it
    Given the complete source-use reading fixture is open
    When the reader opens the interface Overview
    And the reader expands the first Caller source
    And the reader selects Refund invoice and visits Sources then returns
    And the source-use replacement succeeds with the same IDs
    And the reader opens the interface Overview
    Then the new source view starts with closed caller details and the first entry
