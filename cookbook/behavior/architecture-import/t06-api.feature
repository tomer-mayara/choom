@cr-001 @cr-001-t06 @cr-001-t06-api
Feature: Preserve architecture meaning through document operations
  Scenario: Portable YAML preserves a component that owns several directories
    Given an architecture document declares only ".", "src", and "packages/core"
    And its workspace imports a package from both "src/components" and "src/lib"
    When the document is saved as YAML and decoded again
    Then its declared components, deep file evidence, counts, and folder findings are preserved

  Scenario: Collection order does not change a saved document's meaning
    Given an architecture document has its component and evidence collections in a different order
    When the document is decoded and saved again
    Then its YAML has the same canonical collections as the original document

  Scenario Outline: Unsupported YAML is refused
    Given a saved architecture document contains <content>
    When the document text is decoded
    Then decoding fails with "<code>" without changing the supplied text

    Examples:
      | content                   | code                |
      | schemaVersion 2           | unsupported-version |
      | duplicate mapping keys    | invalid-encoding    |
      | a custom YAML tag         | invalid-encoding    |
      | two YAML documents        | invalid-encoding    |
      | an unknown semantic field | invalid-document    |
      | an alias                  | invalid-encoding    |

  Scenario: A candidate must be reopened before it is ready
    Given the architecture document "Atlas" is ready to save
    When a stored candidate is prepared
    Then the candidate contains the architecture read from storage

  Scenario: An unreadable candidate cannot become ready
    Given a newly stored candidate cannot be decoded
    When a stored candidate is prepared
    Then preparation fails and removes its owned candidate

  Scenario: Cancelling preparation removes its eventual candidate
    Given candidate storage for "Atlas" has not completed
    When preparation is cancelled
    Then preparation ends as cancelled after removing the candidate

  Scenario: Failed cleanup cannot be reported as cancellation
    Given candidate storage for "Atlas" has not completed
    And the candidate cannot be removed
    When preparation is cancelled
    Then preparation reports a cleanup failure

  Scenario: Opening saved architecture needs no repository
    Given only a saved architecture file for "Atlas" is available
    When the saved architecture is opened through document operations
    Then the document is restored without accessing a repository or analyzer

  Scenario: Failed cleanup retains ownership for a later retry
    Given a current document is stored and removal of a rejected candidate failed
    When cleanup is retried after removal becomes available
    Then the rejected candidate is removed and the current document remains available

  Scenario: Unresolved cleanup prevents further writes
    Given a current document is stored and removal of a rejected candidate failed
    When another candidate and an export are requested
    Then both requests report cleanup failure without writing new files

  Scenario: Export captures the architecture selected when it starts
    Given an export of architecture "Atlas" is awaiting a destination
    And the caller's architecture changes to "Beacon"
    When the export destination is chosen
    Then the exported YAML still describes "Atlas"

  Scenario: Export remains available while the previous document is being removed
    Given "Beacon" is current while the previous document is being removed
    When the current architecture is exported as removal finishes
    Then the exported YAML still describes "Beacon"
    And the previous document is removed and the current document remains available

  Scenario: Declining an export destination writes nothing
    Given the architecture document "Atlas" is ready to save
    When its export destination is declined
    Then the export ends as cancelled without writing a file

  Scenario: An export failure leaves the caller's architecture available
    Given the architecture document "Atlas" is ready to save
    And its export destination cannot be replaced
    When the document is exported
    Then export fails while the caller still has "Atlas"
