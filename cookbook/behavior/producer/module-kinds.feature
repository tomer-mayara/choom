@producer
Feature: Resolve imports by module kind
  The Stage 4 graph resolves each import with the condition of the code that
  runs. A JavaScript file loads its import syntax with the import condition and
  its require calls with the require condition. TypeScript that compiles to
  CommonJS turns its import statements into require calls, so the graph resolves
  them with the require condition. The package imports field of each package
  gives "#dep" one target for the import condition and another for the require
  condition.

  Scenario: An ES module file uses the import condition only
    Given a package with type "module" that imports a dependency with separate import and require targets
    When the dependency graph is built
    Then the edge points to the import target only

  Scenario: A CommonJS file uses the require condition only
    Given a ".cjs" file in the same package that requires the same dependency
    When the dependency graph is built
    Then the edge points to the require target only

  Scenario Outline: TypeScript that compiles to CommonJS uses the require condition
    Given a package without a type field
    And a TypeScript file <file> with compiler module <module> that imports the same dependency
    When the dependency graph is built
    Then the edge points to the require target only
    And the edge is not marked as pre-compilation only

    Examples:
      | file     | module   |
      | main.ts  | commonjs |
      | plain.ts | nodenext |
      | kind.cts | nodenext |

  Scenario: TypeScript that compiles to an ES module keeps the import condition
    Given a package without a type field
    And a TypeScript file "esm.mts" with compiler module nodenext that imports the same dependency
    When the dependency graph is built
    Then the edge points to the import target only
