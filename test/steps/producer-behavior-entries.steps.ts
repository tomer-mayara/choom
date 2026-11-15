import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { type ExtraFile, inspectStageFour, type StageFourAttempt, stageFourAttempt }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";

// The scenarios prepare a run after Stage 3, run Stage 4 start through the command
// line and collect the Stage 4 source evidence, which applies the pinned rule list
// of the tool checkout. Its starter rule finds the get routes of an Express app:
// a call of get on the app that the call express() made. The toolchain and graph
// phases of the fixture need no Docker.
interface Position { line?: unknown; column?: unknown }
interface Candidate {
  ruleId?: unknown; ruleVersion?: unknown; entryKind?: unknown; found?: unknown; path?: unknown; range?: Position[];
  expression?: unknown; name?: unknown; nameReason?: unknown; handler?: { path?: unknown; range?: Position[] } | null;
  handlerReason?: unknown;
}
interface CandidatesRecord { status?: unknown; candidates?: Candidate[] }

interface BehaviorEntriesWorld extends World {
  behaviorAttempt?: StageFourAttempt;
  behaviorCommand?: CommandResult;
}

const handlerPath = "src/orders.ts";
const handler: ExtraFile = { path: handlerPath, text: "export function listOrders(request: unknown, " +
  "response: { send(body: string): void }) {\n  response.send('orders');\n}\n" };
// The server registers the handler for a route path. `route` is the second argument of get.
const server = (route: string): ExtraFile => ({ path: "src/server.ts", text: "import express from 'express';\n" +
  "import { listOrders } from './orders';\n\nconst resource = process.env.RESOURCE ?? 'orders';\nconst app = express();\n" +
  `app.get(${route}, listOrders);\n` });
const position = (line: number, column: number): Position => ({ line, column });

// The only candidate of the record that collect saved.
function onlyCandidate(world: BehaviorEntriesWorld): Candidate {
  const command = world.behaviorCommand;
  assert.ok(command && world.behaviorAttempt, "Collect the candidates first.");
  assert.equal(command.status, 0, command.stderr);
  const record = JSON.parse(readFileSync(join(world.behaviorAttempt.attempt, "behavior-entry-candidates.json"), "utf8")) as
    CandidatesRecord;
  assert.equal(record.status, "completed");
  assert.equal(record.candidates?.length, 1);
  return record.candidates[0] as Candidate;
}

After({ tags: "@producer" }, function (this: BehaviorEntriesWorld) {
  if (this.behaviorAttempt) rmSync(this.behaviorAttempt.root, { recursive: true, force: true });
});

Given("a saved snapshot that calls a registration function from the rule list", { timeout: 120_000 },
  function (this: BehaviorEntriesWorld) {
    this.behaviorAttempt = stageFourAttempt([server("'/orders'"), handler]);
  });

Given("a saved snapshot in which the registered name is made at run time", { timeout: 120_000 },
  function (this: BehaviorEntriesWorld) {
    this.behaviorAttempt = stageFourAttempt([server("'/' + resource"), handler]);
  });

When("the operator collects behavior entry candidates", { timeout: 120_000 }, function (this: BehaviorEntriesWorld) {
  assert.ok(this.behaviorAttempt, "Prepare a saved snapshot first.");
  this.behaviorCommand = inspectStageFour(this.behaviorAttempt, ["collect"]);
});

Then("a candidate names the rule, the entry kind, the call site and the handler range", function (this: BehaviorEntriesWorld) {
  const { ruleId, ruleVersion, entryKind, path, range, expression, name, handler: found } = onlyCandidate(this);
  // A range starts at the first character and ends after the last character, in 1-based lines and columns.
  assert.deepEqual({ ruleId, ruleVersion, entryKind, path, range, expression, name, handler: found }, {
    ruleId: "express-route-get", ruleVersion: 1, entryKind: "http-route", path: "src/server.ts",
    range: [position(6, 1), position(6, 31)], expression: "app.get('/orders', listOrders)", name: "/orders",
    handler: { path: handlerPath, range: [position(1, 1), position(3, 2)] },
  });
});

Then("it is marked as found by a syntax rule, not as a proven entry", function (this: BehaviorEntriesWorld) {
  assert.equal(onlyCandidate(this).found, "syntax-rule");
});

Then("the candidate has an unknown name and a reason", function (this: BehaviorEntriesWorld) {
  const { name, nameReason, expression } = onlyCandidate(this);
  assert.deepEqual({ name, nameReason, expression }, { name: null, expression: "app.get('/' + resource, listOrders)",
    nameReason: "The name argument is not a string literal, so the name is known only at run time." });
});
