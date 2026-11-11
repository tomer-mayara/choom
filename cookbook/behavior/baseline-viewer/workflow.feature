@baseline-viewer @bv-03
Feature: Baseline publication
  A load publishes one owned baseline and layout, even when observers change subscriptions.

  Scenario: An observer can renew its subscription while a load is pending
    Given a baseline load with a pending file selection
    When a view observer renews its subscription during notification
    Then that observer is notified once for the selection state
