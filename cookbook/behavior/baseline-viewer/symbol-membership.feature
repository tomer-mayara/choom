@baseline-viewer @ga-03b
Feature: Read symbol membership
  Version 5 of the baseline format lets a component own named symbols in a file.
  The viewer checks the selector syntax only. It does not open source files or
  decide which component owns a file.

  @browser
  Scenario: The viewer shows a component that owns named symbols
    Given a version 5 baseline in which Pricing owns the symbol "computePrice" in a shared file
    When the user opens the Pricing details
    Then the membership shows the file path and the symbol name

  Scenario: Read a component that owns only named symbols
    Given a version 5 baseline in which Pricing owns the symbol "computePrice" in a shared file
    When a caller validates it for viewing
    Then the symbol selectors are preserved

  Scenario: Symbol selectors need version 5
    Given a version 4 baseline in which Pricing owns the symbol "computePrice"
    When a caller validates it for viewing
    Then validation names the membership selector that is not supported

  Scenario Outline: Reject an invalid symbol selector
    Given an otherwise valid version 5 baseline with <problem>
    When a caller validates it for viewing
    Then validation identifies the invalid item or field

    Examples:
      | problem                                 |
      | a symbol path that names a subtree      |
      | a symbol path that contains "#"         |
      | a symbol name that is not an identifier |
      | the same symbol selector twice          |
      | a membership with no paths or symbols   |
