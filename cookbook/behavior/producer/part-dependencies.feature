@producer
Feature: Keep the dependencies of divided files
  In Stage 5, the symbol selectors of a version 5 baseline can divide a file into
  code units: one unit for each named symbol and one rest unit for all other text.
  After Stage 5 collect, the operator can ask for the parts of a file that named
  symbols divide, with the dependencies of each part. The query finds the uses of
  the names that each import binds with the syntax tree and the type checker of the
  saved file. An import belongs to a part when all its uses are in that part. A
  dependency that cannot be placed in one part stays at file level with a reason. A
  dependency is never dropped and never copied to every part.

  Scenario: An import used by one part belongs to that part
    Given a divided file in which only the "computePrice" part uses an imported module
    When the dependencies of the divided file are recorded
    Then the import belongs to the "computePrice" part

  Scenario: A dependency that cannot be placed stays at file level
    Given a divided file with a computed import in its setup code
    When the dependencies of the divided file are recorded
    Then the dependency is recorded at file level as not resolved
    And it is not dropped and not copied to every part
