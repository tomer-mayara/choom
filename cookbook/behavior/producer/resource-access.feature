@producer
Feature: Find resource access sites
  The Stage 4 source collection applies the pinned list of Choom resource access
  rules to the source files of the graph scope. A rule finds a call whose receiver
  comes from the import that the rule names, or whose receiver has a declared type
  from that import, such as a parameter db: Knex. Each access site names the rule,
  the operation, the name of the resource and the source range. Two sites with the
  same table name need not use the same table, so the identity of the table is
  inferred from its name and is not proven. The source collection names no owner.

  Scenario: Find a database write through a typed client
    Given a saved snapshot in which a service writes to the invoices table through a database client
    When the operator collects resource access sites
    Then the access site names the write operation, the table name and the source range
    And the table identity is marked as inferred, not proven
