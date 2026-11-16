@producer
Feature: Find behavior entry candidates
  The Stage 4 source collection applies the pinned list of Choom behavior entry
  rules to the source files of the graph scope. A call rule finds a call whose
  receiver comes from the import that the rule names, such as the route methods of
  an Express app. Each candidate names the rule, the entry kind, the call site, the
  name and the handler. A syntax rule found the candidate, so it is a place to
  inspect and not a proven entry. A name that the code makes at run time stays
  unknown, with a reason.
  The route rules find the route methods of Express apps and routers, Fastify
  servers and Hono apps. Each route rule finds one method, so the rule of a route
  candidate names its method, and the path of the route is the name.

  Scenario: A rule finds a candidate
    Given a saved snapshot that calls a registration function from the rule list
    When the operator collects behavior entry candidates
    Then a candidate names the rule, the entry kind, the call site and the handler range
    And it is marked as found by a syntax rule, not as a proven entry

  Scenario: A computed name stays unknown
    Given a saved snapshot in which the registered name is made at run time
    When the operator collects behavior entry candidates
    Then the candidate has an unknown name and a reason

  Scenario: Find the routes of HTTP servers
    Given a saved snapshot with the routes of an Express router, a Fastify server and a Hono app
    When the operator collects behavior entry candidates
    Then each route has a candidate that names its method, its path and its handler
