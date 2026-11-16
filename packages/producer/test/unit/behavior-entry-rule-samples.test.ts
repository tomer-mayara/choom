import { beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as tsMorph from "ts-morph";
import * as yaml from "yaml";
import { callCandidates, type EntryCandidate, entryQuery } from "../../src/behavior-entry-calls.ts";
import { behaviorEntryRulesPath, readRuleList } from "../../src/behavior-entry-rules.ts";
import type { BehaviorEntryCallRule } from "../../src/generated/contracts.ts";
import { toolsRoot, withScratch } from "../support/commands.ts";
import { type Files, projectOf } from "../support/snapshot-files.ts";
import { rangeIn } from "../support/source-ranges.ts";

// The call rules of the pinned rule list of the producer, each on a sample call
// that the documentation of its library shows. Each rule finds its sample with the
// name and the handler of the sample, and no rule finds the same call on another
// receiver with the same name. The test reads the real list, so a new call rule
// needs a sample here.
//
// A receiver is the documented code that makes the value whose method a group of
// rules calls, or that imports the class whose new call a rule finds, and other code
// that gives a value of the same name that is not it.
interface Receiver { extension: "js" | "ts"; entryKind: string; start: string; others: Record<string, string> }
// A sample call on its receiver, with its name. « and » mark the handler in the call. A
// sample without them has no handler, and handlerReason gives the reason of its candidate.
interface Sample { receiver: Receiver; call: string; name: string; handlerReason?: string }

// The Express hello world example.
const expressApp: Receiver = { extension: "js", entryKind: "http-route",
  start: "const express = require('express')\nconst app = express()\n", others: {
    "a Map": "const app = new Map()\n",
    "the app of another package": "const express = require('other')\nconst app = express()\n",
    "a local function with the name of the import": "function express() {\n  return new Map()\n}\nconst app = express()\n",
  } };
// The router of the Express routing guide (birds.js), and a router of the Router
// export of the express module.
const expressRouter: Receiver = { extension: "js", entryKind: "http-route",
  start: "const express = require('express')\nconst router = express.Router()\n", others: {
    "a Map": "const router = new Map()\n",
    "the router of another package": "const express = require('other')\nconst router = express.Router()\n",
    "a local object with the name of the import": "const express = { Router: () => new Map() }\nconst router = express.Router()\n",
  } };
const expressRouterImported: Receiver = { extension: "ts", entryKind: "http-route",
  start: "import { Router } from 'express';\n\nconst router = Router();\n", others: {
    "a Map": "const router = new Map<string, unknown>();\n",
    "the router of another package": "import { Router } from 'other';\n\nconst router = Router();\n",
    "a local function with the name of the import": "function Router() {\n  return new Map<string, unknown>();\n}\n\n" +
      "const router = Router();\n",
  } };
// The server of the Fastify getting started guide, as an ES module and as CommonJS.
const fastifyServer: Receiver = { extension: "js", entryKind: "http-route",
  start: "import Fastify from 'fastify'\n\nconst fastify = Fastify({\n  logger: true\n})\n", others: {
    "a Map": "const fastify = new Map()\n",
    "the server of another package": "import Fastify from 'other'\n\nconst fastify = Fastify({\n  logger: true\n})\n",
    "a local function with the name of the import": "function Fastify(options) {\n  return new Map()\n}\n\n" +
      "const fastify = Fastify({\n  logger: true\n})\n",
  } };
const fastifyRequired: Receiver = { extension: "js", entryKind: "http-route",
  start: "const fastify = require('fastify')({\n  logger: true\n})\n", others: {
    "a Map": "const fastify = new Map()\n",
    "the server of another package": "const fastify = require('other')({\n  logger: true\n})\n",
    "a local function with the name require": "function require(name) {\n  return () => new Map()\n}\n" +
      "const fastify = require('fastify')({\n  logger: true\n})\n",
  } };
// The app of the Hono getting started guide, and an app with the types of its
// bindings, as the Hono guide for Cloudflare Workers writes it.
const honoApp: Receiver = { extension: "ts", entryKind: "http-route",
  start: "import { Hono } from 'hono'\n\nconst app = new Hono()\n", others: {
    "a Map": "const app = new Map<string, unknown>()\n",
    "the app of another package": "import { Hono } from 'other'\n\nconst app = new Hono()\n",
    "a local class with the name of the import": "class Hono extends Map<string, unknown> {}\n\nconst app = new Hono()\n",
  } };
const honoTypedApp: Receiver = { extension: "ts", entryKind: "http-route",
  start: "import { Hono } from 'hono'\n\ntype Bindings = {\n  USERNAME: string\n}\n\nconst app = new Hono<{ Bindings: Bindings }>()\n",
  others: {
    "a Map": "const app = new Map<string, { Bindings: unknown }>()\n",
    "the app of another package": "import { Hono } from 'other'\n\nconst app = new Hono<{ Bindings: unknown }>()\n",
    "a local class with the name of the import": "class Hono<Env> extends Map<string, Env> {}\n\n" +
      "const app = new Hono<{ Bindings: unknown }>()\n",
  } };
// The Worker class of the Node.js worker_threads documentation, as an ES module with
// the module name node:worker_threads, and as CommonJS with the module name
// worker_threads of earlier Node.js versions. Its examples give the worker file as
// __filename or new URL(import.meta.url), which are not string literals. So the samples
// give a relative path that starts with ./, as the filename argument of new Worker allows.
const workerThreads: Receiver = { extension: "js", entryKind: "worker-thread",
  start: "import {\n  Worker,\n  isMainThread,\n  parentPort,\n  workerData,\n} from 'node:worker_threads';\n", others: {
    "a local class with the name of the import": "class Worker {\n  constructor(filename, options) {}\n}\n",
    "the Worker of another package": "import { Worker } from 'other';\n",
    "the Worker global of a browser, without an import": "",
  } };
const workerThreadsRequired: Receiver = { extension: "js", entryKind: "worker-thread",
  start: "const {\n  Worker, isMainThread, parentPort, workerData,\n} = require('worker_threads');\n", others: {
    "a local class with the name of the import": "class Worker {\n  constructor(filename, options) {}\n}\n",
    "the Worker of another package": "const { Worker } = require('other');\n",
    "the Worker global of a browser, without an import": "",
    "a local function with the name require": "function require(name) {\n  return { Worker: class {} };\n}\n" +
      "const { Worker } = require('worker_threads');\n",
  } };
// A worker thread runs its file, so the rules of worker threads name no handler.
const noHandler = "The rule names no handler argument.";
// The worker of the BullMQ quick start guide. Options can follow the processor, so the
// processor is the second argument, not the last.
const bullmqWorker: Receiver = { extension: "ts", entryKind: "queue-worker",
  start: "import { Worker } from 'bullmq';\nimport IORedis from 'ioredis';\n\n" +
    "const connection = new IORedis({ maxRetriesPerRequest: null });\n", others: {
    "a local class with the name of the import": "class Worker {\n  constructor(name: string, processor: unknown, " +
      "options: unknown) {}\n}\n",
    "the Worker of another package": "import { Worker } from 'other';\n",
    "the Worker global of a browser, without an import": "",
  } };

// The sample of each call rule of the list, by rule ID.
const samples: Record<string, Sample> = {
  // The routes of the Express routing guide and the basic routing example. A method that
  // they do not show has the form of the methods that they show, as app.METHOD and
  // router.METHOD allow.
  "express-route-get": { receiver: expressApp, name: "/example/b", call: "app.get('/example/b', (req, res, next) => {\n" +
    "  console.log('the response will be sent by the next function ...')\n  next()\n}, «(req, res) => {\n" +
    "  res.send('Hello from B!')\n}»)" },
  "express-route-post": { receiver: expressApp, name: "/",
    call: "app.post('/', «(req, res) => {\n  res.send('Got a POST request')\n}»)" },
  "express-route-put": { receiver: expressApp, name: "/user",
    call: "app.put('/user', «(req, res) => {\n  res.send('Got a PUT request at /user')\n}»)" },
  "express-route-patch": { receiver: expressApp, name: "/user",
    call: "app.patch('/user', «(req, res) => {\n  res.send('Got a PATCH request at /user')\n}»)" },
  "express-route-delete": { receiver: expressApp, name: "/user",
    call: "app.delete('/user', «(req, res) => {\n  res.send('Got a DELETE request at /user')\n}»)" },
  "express-route-options": { receiver: expressApp, name: "/user",
    call: "app.options('/user', «(req, res) => {\n  res.send('Got an OPTIONS request at /user')\n}»)" },
  "express-route-head": { receiver: expressApp, name: "/user",
    call: "app.head('/user', «(req, res) => {\n  res.send('Got a HEAD request at /user')\n}»)" },
  "express-route-all": { receiver: expressApp, name: "/secret", call: "app.all('/secret', «(req, res, next) => {\n" +
    "  console.log('Accessing the secret section ...')\n  next() // pass control to the next handler\n}»)" },
  "express-router-get": { receiver: expressRouter, name: "/",
    call: "router.get('/', «(req, res) => {\n  res.send('Birds home page')\n}»)" },
  "express-router-post": { receiver: expressRouter, name: "/",
    call: "router.post('/', «(req, res) => {\n  res.send('Add a bird')\n}»)" },
  "express-router-put": { receiver: expressRouter, name: "/about",
    call: "router.put('/about', «(req, res) => {\n  res.send('Replace about birds')\n}»)" },
  "express-router-patch": { receiver: expressRouter, name: "/about",
    call: "router.patch('/about', «(req, res) => {\n  res.send('Change about birds')\n}»)" },
  "express-router-delete": { receiver: expressRouterImported, name: "/about",
    call: "router.delete('/about', «(req, res) => {\n  res.send('Delete about birds');\n}»)" },
  "express-router-options": { receiver: expressRouterImported, name: "/about",
    call: "router.options('/about', «(req, res) => {\n  res.send('Options of about birds');\n}»)" },
  "express-router-head": { receiver: expressRouterImported, name: "/about",
    call: "router.head('/about', «(req, res) => {\n  res.send('About birds');\n}»)" },
  "express-router-all": { receiver: expressRouterImported, name: "/about",
    call: "router.all('/about', «(req, res, next) => {\n  console.log('Time: ', Date.now());\n  next();\n}»)" },
  // The routes of the Fastify getting started guide and of the shorthand methods of the
  // Fastify routes reference, fastify.METHOD(path, [options], handler). Route options
  // before the handler, as in the validation guide, keep the handler as the last argument.
  "fastify-route-get": { receiver: fastifyServer, name: "/",
    call: "fastify.get('/', «function (request, reply) {\n  reply.send({ hello: 'world' })\n}»)" },
  "fastify-route-post": { receiver: fastifyServer, name: "/the/url", call: "fastify.post('/the/url', " +
    "{ schema: { body: { type: 'object' } } }, «async (request, reply) => {\n  return { hello: 'world' }\n}»)" },
  "fastify-route-put": { receiver: fastifyServer, name: "/the/url", call: "fastify.put('/the/url', " +
    "{ schema: { body: { type: 'object' } } }, «async (request, reply) => {\n  return { hello: 'world' }\n}»)" },
  "fastify-route-patch": { receiver: fastifyServer, name: "/the/url", call: "fastify.patch('/the/url', " +
    "{ schema: { body: { type: 'object' } } }, «(request, reply) => {\n  reply.send({ hello: 'world' })\n}»)" },
  "fastify-route-delete": { receiver: fastifyRequired, name: "/",
    call: "fastify.delete('/', «async (request, reply) => {\n  return { hello: 'world' }\n}»)" },
  "fastify-route-options": { receiver: fastifyRequired, name: "/",
    call: "fastify.options('/', «async (request, reply) => {\n  return { hello: 'world' }\n}»)" },
  "fastify-route-head": { receiver: fastifyRequired, name: "/",
    call: "fastify.head('/', «(request, reply) => {\n  reply.send()\n}»)" },
  "fastify-route-all": { receiver: fastifyRequired, name: "/",
    call: "fastify.all('/', «async (request, reply) => {\n  return { hello: 'world' }\n}»)" },
  // The routes of the Hono routing guide: its HTTP methods, a path parameter and any
  // method. Hono has no head method: a get route also answers HEAD.
  "hono-route-get": { receiver: honoApp, name: "/user/:name",
    call: "app.get('/user/:name', «async (c) => {\n  const name = c.req.param('name')\n  return c.text(name)\n}»)" },
  "hono-route-post": { receiver: honoApp, name: "/", call: "app.post('/', «(c) => c.text('POST /')»)" },
  "hono-route-put": { receiver: honoApp, name: "/", call: "app.put('/', «(c) => c.text('PUT /')»)" },
  "hono-route-delete": { receiver: honoApp, name: "/", call: "app.delete('/', «(c) => c.text('DELETE /')»)" },
  "hono-route-patch": { receiver: honoTypedApp, name: "/", call: "app.patch('/', «(c) => c.text('PATCH /')»)" },
  "hono-route-options": { receiver: honoTypedApp, name: "/", call: "app.options('/', «(c) => c.text('OPTIONS /')»)" },
  "hono-route-all": { receiver: honoTypedApp, name: "/hello", call: "app.all('/hello', «(c) => c.text('Any Method /hello')»)" },
  // The worker of the parseJSAsync example of the worker_threads documentation, with a
  // worker file in place of __filename.
  "node-worker-threads-worker": { receiver: workerThreads, name: "./worker.js", handlerReason: noHandler,
    call: "new Worker('./worker.js', {\n  workerData: script,\n})" },
  "worker-threads-worker": { receiver: workerThreadsRequired, name: "./worker.js", handlerReason: noHandler,
    call: "new Worker('./worker.js', {\n  workerData: script,\n})" },
  "bullmq-worker": { receiver: bullmqWorker, name: "foo", call: "new Worker(\n  'foo',\n  «async job => {\n" +
    "    // Will print { foo: 'bar'} for the first job\n    // and { qux: 'baz' } for the second.\n" +
    "    console.log(job.data);\n  }»,\n  { connection },\n)" },
};

// A sandboxed processor of BullMQ is the path of a file that BullMQ runs in another
// process, not a function. The BullMQ guide of sandboxed processors gives the path in a
// variable, so the handler is the declaration of that variable. A path as a string
// literal gives no handler.
const sandboxedInVariable = "import { Worker } from 'bullmq';\nimport path from 'path';\n\n" +
  "const processorFile = path.join(__dirname, 'my_processor.js');\nconst worker = new Worker('foo', processorFile);\n";
const sandboxedAsLiteral = "import { Worker } from 'bullmq';\n\nconst worker = new Worker('foo', './my_processor.js');\n";
const sandboxedFiles: Files = { "bullmq-sandboxed/variable.ts": sandboxedInVariable,
  "bullmq-sandboxed/literal.ts": sandboxedAsLiteral };

const callRules = readRuleList(readFileSync(join(toolsRoot, behaviorEntryRulesPath)), yaml).rules
  .filter((rule): rule is BehaviorEntryCallRule => rule.kind === "call");
const plain = (call: string): string => call.replace("«", "").replace("»", "");
// The text of a file: a receiver, then the call.
const fileText = (start: string, call: string): string => start + "\n" + plain(call) + "\n";
const samplePath = (rule: BehaviorEntryCallRule, sample: Sample): string => `${rule.id}/sample.${sample.receiver.extension}`;
const otherPath = (rule: BehaviorEntryCallRule, sample: Sample, index: number): string =>
  `${rule.id}/other-${index}.${sample.receiver.extension}`;

// The sample file and the files of the other receivers of each rule that has a sample.
function sampleFiles(): Files {
  return Object.fromEntries(callRules.flatMap((rule) => {
    const sample = samples[rule.id];
    if (sample === undefined) return [];
    return [[samplePath(rule, sample), fileText(sample.receiver.start, sample.call)],
      ...Object.values(sample.receiver.others).map((start, index) => [otherPath(rule, sample, index), fileText(start, sample.call)])];
  }));
}

// The candidates of all the call rules in each file. One snapshot project holds the
// files. Each file is a module, so the files do not share their top-level names.
let found = new Map<string, EntryCandidate[]>();
beforeAll(() => {
  const files = { ...sampleFiles(), ...sandboxedFiles };
  found = withScratch((scratch) => {
    const query = entryQuery(projectOf(scratch, files, { allowJs: true, moduleDetection: tsMorph.ts.ModuleDetectionKind.Force }));
    return new Map(Object.keys(files).map((path) => [path, callCandidates(query, path, callRules)]));
  });
}, 60_000);

function sampleOf(rule: BehaviorEntryCallRule): Sample {
  const sample = samples[rule.id];
  if (sample === undefined) throw new Error(`The call rule ${rule.id} has no sample. Add a documented call of its library.`);
  return sample;
}

test("each call rule of the pinned list has a sample, and each sample has its rule in the list", () => {
  expect(Object.keys(samples).sort()).toEqual(callRules.map(({ id }) => id).sort());
});

test.each(callRules.map((rule) => [rule.id, rule] as const))("%s finds its sample call with the name and the handler",
  (_id, rule) => {
    const sample = sampleOf(rule);
    const path = samplePath(rule, sample);
    const text = fileText(sample.receiver.start, sample.call);
    const call = plain(sample.call);
    expect(found.get(path)).toEqual([{ ruleId: rule.id, ruleVersion: rule.version, entryKind: sample.receiver.entryKind,
      range: rangeIn(text, call), expression: call, truncated: false, name: sample.name, nameReason: null,
      handler: sample.handlerReason === undefined ? { path, range: rangeIn(text, sample.call) } : null,
      handlerReason: sample.handlerReason ?? null }]);
  });

test.each(callRules.flatMap((rule) => Object.keys(samples[rule.id]?.receiver.others ?? {})
  .map((other, index) => [rule.id, other, rule, index] as const)))("no rule finds the sample call of %s on %s",
  (_id, _other, rule, index) => {
    expect(found.get(otherPath(rule, sampleOf(rule), index))).toEqual([]);
  });

test("bullmq-worker gives the variable of a sandboxed processor path as the handler, and no handler for a path literal", () => {
  const handlers = Object.keys(sandboxedFiles).map((path) =>
    found.get(path)?.map(({ ruleId, name, handler, handlerReason }) => ({ ruleId, name, handler, handlerReason })));
  expect(handlers).toEqual([
    [{ ruleId: "bullmq-worker", name: "foo", handlerReason: null, handler: { path: "bullmq-sandboxed/variable.ts",
      range: rangeIn(sandboxedInVariable, "const «processorFile = path.join(__dirname, 'my_processor.js')»;") } }],
    [{ ruleId: "bullmq-worker", name: "foo", handler: null,
      handlerReason: "The handler argument is not a function or a name, so the rule does not follow the value that it gives." }],
  ]);
});
