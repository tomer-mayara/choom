@di-02-03
Feature: Preserve the identity of a selected baseline file
  Scenario: Read the original baseline bytes in the browser
    Given a saved baseline contains a UTF-8 byte order mark and CRLF line endings
    When the browser reader reads the selected baseline
    Then the read result includes the SHA-256 digest of the exact file bytes
