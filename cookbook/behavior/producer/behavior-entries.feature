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
  The worker rules find the start sites of worker threads and of BullMQ queue
  workers. The worker file or the queue name is the name. The processor of a queue
  worker is its handler. A worker thread has no handler: it runs its file.
  The settings rules read the entries that a Vite settings file names, such as the
  input of the build, without running the file. A string literal is a candidate with
  the settings file, the range of the value and the entry. An entry that the code
  computes is a gap with a reason.
  The command rules find the commands of commander and yargs programs. The command
  is the name, and its action is the handler. The bin rule reads the bin field of
  each package file. Each command that the field names is a candidate. It names the
  source file that the command runs only with evidence: the file is in the snapshot,
  or a saved compiler setting compiles a source file of the snapshot to it.

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

  Scenario: Find the start sites of workers and queues
    Given a saved snapshot that starts a worker thread and a BullMQ queue worker
    When the operator collects behavior entry candidates
    Then each worker has a candidate that names its file or its queue, its start site and its handler, if it has one

  Scenario: Find the entries of frontend build settings
    Given a saved snapshot whose Vite settings name one entry as a string literal and one entry that the code computes
    When the operator collects behavior entry candidates
    Then the literal entry has a candidate that names the settings file, the range of the value and the entry
    And it is marked as found by a syntax rule, not as a proven entry
    And the computed entry is a gap with a reason

  Scenario: Find the commands of command line tools
    Given a saved snapshot with a commander program, a yargs program and a package whose bin field names three commands
    When the operator collects behavior entry candidates
    Then each command of the programs has a candidate that names the command and its action range
    And each bin command has a candidate that names the command and the range of its value in the package file
    And a bin command names its source file only with evidence, and otherwise gives the reason
