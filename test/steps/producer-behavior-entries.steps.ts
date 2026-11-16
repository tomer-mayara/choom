import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { type ExtraFile, inspectStageFour, type StageFourAttempt, stageFourAttempt }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";

// The scenarios prepare a run after Stage 3, run Stage 4 start through the command
// line and collect the Stage 4 source evidence, which applies the pinned rule list
// of the tool checkout. Its route rules find the route methods of HTTP servers. For
// example, express-route-get finds a call of get on the app that the call express()
// made. Its worker rules find the new Worker calls that start worker threads and
// queue workers. The toolchain and graph phases of the fixture need no Docker.
interface Position { line?: unknown; column?: unknown }
interface Candidate {
  ruleId?: unknown; ruleVersion?: unknown; entryKind?: unknown; found?: unknown; path?: unknown; range?: Position[];
  expression?: unknown; name?: unknown; nameReason?: unknown; handler?: { path?: unknown; range?: Position[] } | null;
  handlerReason?: unknown;
}
interface CandidatesRecord { status?: unknown; candidates?: Candidate[] }
interface SavedRule { id?: unknown; version?: unknown; library?: unknown; callPath?: unknown }

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
// The routes of three HTTP servers, as the guides of their libraries write them: an
// Express router, a Fastify server whose route has options before its handler, and
// a Hono app. No route is a get route.
const birds: ExtraFile = { path: "src/birds.ts", text: "import { Router } from 'express';\n\nconst router = Router();\n\n" +
  "router.post('/birds', (req, res) => {\n  res.send('Add a bird');\n});\n\nexport default router;\n" };
const books: ExtraFile = { path: "src/books.ts", text: "import { Hono } from 'hono';\n\nconst app = new Hono();\n\n" +
  "app.delete('/books/:id', (c) => c.text('Deleted'));\n\nexport default app;\n" };
const orderHandlers: ExtraFile = { path: "src/order-handlers.ts",
  text: "export async function updateOrder() {\n  return { updated: true };\n}\n" };
const orders: ExtraFile = { path: "src/orders.ts", text: "import Fastify from 'fastify';\n" +
  "import { updateOrder } from './order-handlers';\n\nconst fastify = Fastify({ logger: true });\n" +
  "const opts = { schema: { params: { type: 'object' } } };\n\nfastify.put('/orders/:id', opts, updateOrder);\n" };
// A worker thread that runs a file, and a BullMQ worker that runs a named processor for
// the jobs of a queue, as the guides of Node.js and BullMQ write them.
const resize: ExtraFile = { path: "src/resize.ts", text: "import { Worker } from 'node:worker_threads';\n\n" +
  "export function resize(width: number) {\n  return new Worker('./resize-worker.js', { workerData: { width } });\n}\n" };
const emailJobs: ExtraFile = { path: "src/email-jobs.ts",
  text: "export async function sendEmail(job: { data: unknown }) {\n  return job.data;\n}\n" };
const emailWorker: ExtraFile = { path: "src/email-worker.ts", text: "import { Worker } from 'bullmq';\n" +
  "import { sendEmail } from './email-jobs';\n\nconst connection = { host: 'localhost', port: 6379 };\n\n" +
  "export const worker = new Worker('emails', sendEmail, { connection });\n" };
const position = (line: number, column: number): Position => ({ line, column });

// The candidates of the record that collect saved.
function savedCandidates(world: BehaviorEntriesWorld): Candidate[] {
  const command = world.behaviorCommand;
  assert.ok(command && world.behaviorAttempt, "Collect the candidates first.");
  assert.equal(command.status, 0, command.stderr);
  const record = JSON.parse(readFileSync(join(world.behaviorAttempt.attempt, "behavior-entry-candidates.json"), "utf8")) as
    CandidatesRecord;
  assert.equal(record.status, "completed");
  return record.candidates ?? [];
}

// The only candidate of the record that collect saved.
function onlyCandidate(world: BehaviorEntriesWorld): Candidate {
  const candidates = savedCandidates(world);
  assert.equal(candidates.length, 1);
  return candidates[0] as Candidate;
}

// The rules of the copy of the rule list that Stage 4 start saved in the attempt.
function savedRules(world: BehaviorEntriesWorld): SavedRule[] {
  assert.ok(world.behaviorAttempt, "Prepare a saved snapshot first.");
  const list = parse(readFileSync(join(world.behaviorAttempt.attempt, "behavior-entry-rules.yaml"), "utf8")) as
    { rules?: SavedRule[] };
  return list.rules ?? [];
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

Given("a saved snapshot with the routes of an Express router, a Fastify server and a Hono app", { timeout: 120_000 },
  function (this: BehaviorEntriesWorld) {
    this.behaviorAttempt = stageFourAttempt([birds, books, orderHandlers, orders]);
  });

Given("a saved snapshot that starts a worker thread and a BullMQ queue worker", { timeout: 120_000 },
  function (this: BehaviorEntriesWorld) {
    this.behaviorAttempt = stageFourAttempt([emailJobs, emailWorker, resize]);
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

// Each route rule finds one method, so the saved rule of a candidate names the method:
// the last name of its callPath, such as post in Router().post.
Then("each route has a candidate that names its method, its path and its handler", function (this: BehaviorEntriesWorld) {
  const rules = savedRules(this);
  const routes = savedCandidates(this).map(({ ruleId, ruleVersion, entryKind, path, name, handler: found }) => {
    const rule = rules.find(({ id, version }) => id === ruleId && version === ruleVersion);
    const method = typeof rule?.callPath === "string" ? rule.callPath.split(".").at(-1) : undefined;
    return { ruleId, library: rule?.library, method, entryKind, path, name, handler: found };
  });
  assert.deepEqual(routes, [
    { ruleId: "express-router-post", library: "express", method: "post", entryKind: "http-route", path: birds.path,
      name: "/birds", handler: { path: birds.path, range: [position(5, 23), position(7, 2)] } },
    { ruleId: "hono-route-delete", library: "hono", method: "delete", entryKind: "http-route", path: books.path,
      name: "/books/:id", handler: { path: books.path, range: [position(5, 26), position(5, 50)] } },
    { ruleId: "fastify-route-put", library: "fastify", method: "put", entryKind: "http-route", path: orders.path,
      name: "/orders/:id", handler: { path: orderHandlers.path, range: [position(1, 1), position(3, 2)] } },
  ]);
});

// The start site of a worker is its new Worker call. The name is the worker file of a
// worker thread or the queue of a queue worker. A worker thread runs its file, so its
// rule names no handler.
Then("each worker has a candidate that names its file or its queue, its start site and its handler, if it has one",
  function (this: BehaviorEntriesWorld) {
    const workers = savedCandidates(this).map(({ ruleId, entryKind, path, range, expression, name, handler: found,
      handlerReason }) => ({ ruleId, entryKind, path, range, expression, name, handler: found, handlerReason }));
    assert.deepEqual(workers, [
      { ruleId: "bullmq-worker", entryKind: "queue-worker", path: emailWorker.path, range: [position(6, 23), position(6, 70)],
        expression: "new Worker('emails', sendEmail, { connection })", name: "emails",
        handler: { path: emailJobs.path, range: [position(1, 1), position(3, 2)] }, handlerReason: null },
      { ruleId: "node-worker-threads-worker", entryKind: "worker-thread", path: resize.path,
        range: [position(4, 10), position(4, 69)], expression: "new Worker('./resize-worker.js', { workerData: { width } })",
        name: "./resize-worker.js", handler: null, handlerReason: "The rule names no handler argument." },
    ]);
  });
