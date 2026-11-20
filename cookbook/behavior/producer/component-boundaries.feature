@producer @cr005
Feature: Publish reviewed component boundaries

  @s1-1
  Scenario: A shared helper has one known test use
    Given a test runner uses a helper and its production use has not been checked
    When stage-1 finish accepts the role review
    Then the saved review cites the test use and leaves the helper's overall role unknown

  @s1-2
  Scenario: A follow-up run selects its previous baseline
    Given a saved v6 reference for project TraceRelic
    When I start a new run with that reference
    Then the run keeps the same project key and records the reference file's exact digest

  @s2-1
  Scenario: A production scan was skipped
    Given a declared product command, a compiler root and a skipped production Knip run
    When Stage 2 selects the reviewed entry analysis
    Then the command retains its launch evidence
    And the compiler root's production use is unknown with the skipped-mode receipt

  @s3-1
  Scenario: An HTTP route appears in a test
    Given a saved excerpt that registers GET /health inside a Fastify injection test
    When Stage 3 publishes its inspection priorities
    Then the route candidate cites that test range for Stage 4 to check

  @s3-2
  Scenario: A computed import has no known target
    Given a saved computed import whose target the available evidence cannot identify
    When Stage 3 publishes the review
    Then the priority names the loader, the unknown context and the missing binding

  @s4-1
  Scenario: The caller reaches the loader through an implementation file
    Given a CLI imports the loader's implementation file and calls its exported load method
    When Stage 4 publishes the reviewed proposal
    Then it records the actual import path, the named operation, both owners and their evidence

  @s4-2
  Scenario: An outside caller reaches an undocumented helper
    Given a bound call to another component's helper with no public entry or known policy
    When Stage 4 publishes the review
    Then the result names the helper and both owners and marks permission undetermined

  @s4-3
  Scenario: A rule is broken through an intermediate module
    Given an active rule forbids History from reaching Loader
    And the saved graph contains History to Helper to Loader in one resolution context
    When the producer checks the rule
    Then one forbidden result cites both edges in order and the effective rule

  @s5-1
  Scenario: A target symbol changes owner during review
    Given the final symbol map assigns the target to Storage
    When Stage 5 publishes the reconciled crossing
    Then both owners refer to the selected mapping and the target owner is Storage

  @s5-2
  Scenario: An emitted test call has a verified source origin
    Given a test call to commit and an emitted call proven to be its copy
    When Stage 5 publishes the review
    Then one test site retains the two locations

  @s5-3
  Scenario: Two ports have empty caller lists with different coverage
    Given a complete production caller search for one port and a partial search for another
    When Stage 5 publishes their review
    Then the first port has a verified zero
    And the second port has incomplete coverage

  @s6-1
  Scenario: A valid packet omits its boundary-review check
    Given the Stage 5 digests and selected references match but readiness omits the required v6 check
    When stage-6 start checks the readiness packet
    Then preparation stops and names the missing boundary-review check

  @s6-2
  Scenario: The fixed result opens with its reviewed boundary data
    Given approved Stage 5 v6 bytes with a loader, a test fixture and a coverage limit
    When the manager runs stage-6 finish and verify and opens the fixed file
    Then its bytes equal the proposal and the reader returns the recorded roles, access and limit

  @review-evidence
  Scenario: The handoff finds a production call after an operation with an unknown role
    Given a reviewed loader with an unknown operation role and a production call to a second component
    When the manager prepares the Stage 6 handoff
    Then the handoff names the second operation and cites its caller and target

  @review-evidence
  Scenario: A production declaration has no reviewed production call
    Given a reviewed production import with no recorded production call
    When the manager prepares the Stage 6 handoff
    Then the handoff names a declared production operation with its own evidence and an empty caller
