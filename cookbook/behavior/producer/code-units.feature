@producer
Feature: Divide a file by named symbols
  A code unit is a file or a recorded part of a file. In a version 5 baseline, a
  component can name a top-level symbol of a file in its membership. The symbol
  selectors divide that file: each named symbol is one code unit, and the rest of
  the file is one more unit. The producer finds the parts in the syntax tree of the
  saved snapshot. The Stage 5 publisher checks the code mapping of a review and
  refuses units that differ from these parts.

  Scenario: A named symbol becomes its own code unit
    Given a file that Billing owns and that also declares "computePrice"
    And Pricing names the symbol "computePrice" in its membership
    When the code mapping is checked
    Then "computePrice" is a code unit that Pricing owns
    And the rest of the file is one code unit that Billing owns

  Scenario: The rest of a file without a path owner has an unknown owner
    Given a file that no path selector matches
    And Pricing names the symbol "computePrice" in that file
    When the code mapping is checked
    Then the rest of the file has an unknown owner and a reason

  Scenario: A symbol that the file does not declare is refused
    Given a component that names a symbol that the file does not declare
    When the code mapping is checked
    Then the mapping is refused
    And the operator is told which selector matched nothing

  Scenario: Two components cannot own one symbol
    Given two components that name the same symbol
    When the code mapping is checked
    Then the mapping is refused
