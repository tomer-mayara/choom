@browser @baseline-viewer @baseline-readability @br-10 @br-10d @interface-signatures
Feature: Read saved function and method signatures
  A function declaration states its parameters and return type as recorded.

  Scenario: Read the selected function declaration
    Given an interface with a saved function signature is open
    Then its selected entry shows the exact signature and its own recorded status

  Scenario: Read the declaration's own source record
    Given an interface with a saved function signature is open
    When the user reads the signature's Sources
    Then its signature-only note, evidence, status, acceptance reference, and original values are retained

  Scenario Outline: Distinguish absent and unknown signatures
    Given an interface with a <state> function signature is open
    Then the Signature says "<message>" without a declaration

    Examples:
      | state   | message                 |
      | missing | Signature not recorded. |
      | unknown | Signature is unknown.   |

  Scenario Outline: Select a non-function entry
    Given an interface with a saved function signature is open
    When the user selects its "<entry>" entry
    Then the selected entry has no Signature block
    And selecting the function restores its saved declaration

    Examples:
      | entry                      |
      | Invoice type, invoice-type |
      | Invoice data, invoice-data |

  Scenario Outline: Read long and multiline declarations in a small panel
    Given the signature reader window is <width> by <height> with <percent> percent text
    And an interface with a long function signature is open
    Then its whole declaration stays literal and wraps inside the panel
    And reading the signature makes no request or navigation

    Examples:
      | width | height | percent |
      | 320   | 640    | 100     |
      | 1280  | 360    | 100     |
      | 1280  | 800    | 200     |
