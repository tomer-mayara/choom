@baseline-viewer @baseline-readability @br-07 @br-07a @browser
Feature: Draw recorded interface permissions
  These scenarios use All connections when a drawing is available.
  Each named arc points from an allowed consumer to the interface owner.
  The arrow describes a recorded permission, not an observed call.

  Scenario: Draw one interface for two allowed consumers
    Given the "two consumers" interface baseline is ready to open
    When the user opens the prepared interface baseline
    Then 2 interface arcs show the recorded consumers and owners
    And each short interface label is unobscured and all component headers remain usable
    And the legend explains that the arrows mean may use
    And Billing shows one interface and the canvas contains only components

  Scenario: Preserve two interfaces between the same components
    Given the "parallel" interface baseline is ready to open
    When the user opens the prepared interface baseline
    Then 2 interface arcs show the recorded consumers and owners
    And their paths and accessible names keep both interfaces distinct

  Scenario: Preserve opposite permissions
    Given the "opposite" interface baseline is ready to open
    When the user opens the prepared interface baseline
    Then 2 interface arcs show the recorded consumers and owners
    And their paths and accessible names keep both interfaces distinct

  Scenario: Show an owner using its own interface
    Given the "self" interface baseline is ready to open
    When the user opens the prepared interface baseline
    Then 1 interface arcs show the recorded consumers and owners
    And a labelled loop extends outside Billing's header
    And Billing shows one interface and the canvas contains only components

  Scenario: Connect the actual headers in a nested group
    Given the "nested" interface baseline is ready to open
    When the user opens the prepared interface baseline
    Then 1 interface arcs show the recorded consumers and owners
    And the arc is visible inside the group while both headers remain usable

  Scenario: Attach both directions and a group self-loop at two hundred percent
    Given the "nested group arcs" interface baseline is ready to open
    When the user opens the prepared interface baseline
    And the user zooms the interface drawing to two hundred percent
    Then 3 interface arcs show the recorded consumers and owners
    And the group and child keep their original node positions

  Scenario: Keep a self-loop clear of the neighboring component
    Given the "self beside neighbor" interface baseline is ready to open
    When the user opens the prepared interface baseline
    Then 1 interface arcs show the recorded consumers and owners
    And each short interface label is unobscured and all component headers remain usable

  Scenario: Bound a long label without losing its name
    Given the "long name" interface baseline is ready to open
    When the user opens the prepared interface baseline
    Then 1 interface arcs show the recorded consumers and owners
    And the arc label uses at most two lines and no more width than a header
    And the full interface name and endpoint names remain accessible
