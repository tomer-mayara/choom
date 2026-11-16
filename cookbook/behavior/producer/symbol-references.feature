@producer
Feature: Find where a symbol is used
  After the Stage 4 source collection, the operator can ask Stage 4 inspect for the
  references to a top-level symbol of a source file. The query reads the files of
  the graph profile group of that file with the snapshot project and the compiler
  settings of the group, and it follows imports, re-exports and aliases. A loading
  site with a computed module name can load the module of the symbol, so it is a
  possible use that the query does not resolve, and the list may be incomplete.

  Scenario: Find the users of an exported function
    Given a saved snapshot where "createInvoice" is exported from one file and used in two other files
    When the operator asks for references to "createInvoice"
    Then the result lists the two files with source ranges
    And it records the compiler settings that the query used

  Scenario: A computed import makes the result incomplete
    Given a saved snapshot where one file loads the module by a computed name
    When the operator asks for references to "createInvoice"
    Then that file is listed as a possible use that is not resolved
    And the result says that the list may be incomplete
