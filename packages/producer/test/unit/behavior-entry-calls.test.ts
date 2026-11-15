import { describe, expect, test } from "bun:test";
import { type CallCandidate, callCandidates, entryQuery } from "../../src/behavior-entry-calls.ts";
import type { BehaviorEntryCallRule } from "../../src/generated/contracts.ts";
import { withScratch } from "../support/commands.ts";
import { type Files, projectOf } from "../support/snapshot-files.ts";
import { rangeIn } from "../support/source-ranges.ts";

// callCandidates on a saved snapshot: the calls of one file whose receiver comes
// from the import that a call rule names. The type checker of the snapshot project
// follows the local names and the imports of the snapshot files to that import.
const expressGet: BehaviorEntryCallRule = { id: "express-route-get", version: 1, library: "express", entryKind: "http-route",
  kind: "call", importName: "express", callPath: "express().get", nameArgument: 0, handlerArgument: "last" };
const routerGet: BehaviorEntryCallRule = { ...expressGet, id: "express-router-get", callPath: "Router().get" };
const workerStart: BehaviorEntryCallRule = { id: "worker-start", version: 2, library: "node:worker_threads", entryKind: "worker",
  kind: "call", importName: "node:worker_threads", callPath: "new Worker", nameArgument: 0, handlerArgument: null };
const honoGet: BehaviorEntryCallRule = { ...expressGet, id: "hono-route-get", library: "hono", importName: "hono",
  callPath: "new Hono().get" };
const serverPath = "src/server.ts";
const handlerText = "const list = () => 'orders';\n";
const handlerAt = (text: string) => ({ path: serverPath, range: rangeIn(text, "const «list = () => 'orders'»;") });

function candidatesIn(files: Files, path = serverPath, rules: BehaviorEntryCallRule[] = [expressGet]): CallCandidate[] {
  return withScratch((scratch) => callCandidates(entryQuery(projectOf(scratch, files)), path, rules));
}

// The call of the express-route-get rule, with the name /orders and the list handler.
function routeAt(text: string, call: string, handler = handlerAt(text)): CallCandidate {
  return { ruleId: "express-route-get", ruleVersion: 1, entryKind: "http-route", range: rangeIn(text, call),
    expression: call, truncated: false, name: "/orders", nameReason: null, handler, handlerReason: null };
}

describe("callCandidates matches a call whose receiver comes from the import", () => {
  test.each([
    ["a default import", "import express from 'express';\nconst app = express();\n"],
    ["a renamed default import", "import server from 'express';\nconst app = server();\n"],
    ["a namespace import", "import * as express from 'express';\nconst app = express();\n"],
    ["the default export of a namespace import", "import * as express from 'express';\nconst app = express.default();\n"],
    ["import = require", "import express = require('express');\nconst app = express();\n"],
    ["a require call in a TypeScript file", "const express = require('express');\nconst app = express();\n"],
    ["a variable that holds the app of another variable", "import express from 'express';\nconst made = express();\nconst app = made;\n"],
    ["parentheses and a type assertion", "import express from 'express';\nconst app = (express() as unknown as { get: Function });\n"],
  ])("the app of %s", (_name, start) => {
    const text = start + handlerText + "app.get('/orders', list);\n";
    expect(candidatesIn({ [serverPath]: text })).toEqual([routeAt(text, "app.get('/orders', list)")]);
  });

  test("a call of the import without a variable, and a require call in a JavaScript file", () => {
    const direct = "import express from 'express';\n" + handlerText + "express().get('/orders', list);\n";
    expect(candidatesIn({ [serverPath]: direct })).toEqual([routeAt(direct, "express().get('/orders', list)")]);
    const script = "const express = require('express');\nconst app = express();\n" + handlerText + "app.get('/orders', list);\n";
    const [found] = candidatesIn({ "src/server.js": script }, "src/server.js");
    expect(found).toEqual({ ...routeAt(script, "app.get('/orders', list)"),
      handler: { path: "src/server.js", range: rangeIn(script, "const «list = () => 'orders'»;") } });
  });

  test("an app that another snapshot file makes and exports, through a re-export of a package", () => {
    const routes = "import { app } from './app';\nimport { list } from './orders';\n\napp.get('/orders', list);\n";
    const orders = "export function list() {\n  return 'orders';\n}\n";
    const files = { "src/express.ts": "export { default } from 'express';\n",
      "src/app.ts": "import express from './express';\n\nexport const app = express();\n", "src/orders.ts": orders, "src/routes.ts": routes };
    expect(candidatesIn(files, "src/routes.ts")).toEqual([routeAt(routes, "app.get('/orders', list)",
      { path: "src/orders.ts", range: rangeIn(orders, orders.trimEnd()) })]);
  });

  test.each([
    ["the get of a Map", "const app = new Map<string, unknown>();\n"],
    ["the get of an app from another library", "import express from 'other';\nconst app = express();\n"],
    ["a local function with the name of the import", "function express() { return new Map(); }\nconst app = express();\n"],
    ["the get of the module value, not of its call", "import express from 'express';\nconst app = express;\n"],
  ])("not %s", (_name, start) => {
    expect(candidatesIn({ [serverPath]: start + handlerText + "app.get('/orders', list);\n" })).toEqual([]);
  });

  test("not a get that reads a setting, and not an app that a function gets as a parameter", () => {
    const text = "import express from 'express';\nconst app = express();\napp.get('title');\n" +
      "export function routes(router: { get: Function }) {\n  router.get('/orders', () => 'orders');\n}\n";
    expect(candidatesIn({ [serverPath]: text })).toEqual([]);
  });

  test("a named export of the module, a new call and a call on the object that a new call makes", () => {
    const text = "import express, { Router } from 'express';\nimport { Worker } from 'node:worker_threads';\n" +
      "import { Hono } from 'hono';\n" + handlerText + "const router = Router();\nrouter.get('/orders', list);\n" +
      "express.Router().get('/orders', list);\nnew Worker('./job.js');\nconst api = new Hono();\napi.get('/orders', list);\n";
    const found = candidatesIn({ [serverPath]: text }, serverPath, [routerGet, workerStart, honoGet]);
    const call = (marked: string, ruleId: string) => ({ ...routeAt(text, marked), ruleId });
    expect(found).toEqual([call("router.get('/orders', list)", "express-router-get"),
      call("express.Router().get('/orders', list)", "express-router-get"),
      { ruleId: "worker-start", ruleVersion: 2, entryKind: "worker", range: rangeIn(text, "new Worker('./job.js')"),
        expression: "new Worker('./job.js')", truncated: false, name: "./job.js", nameReason: null, handler: null,
        handlerReason: "The rule names no handler argument." },
      call("api.get('/orders', list)", "hono-route-get")]);
  });
});

// A file that starts with the express app and the list handler.
const appText = "import express from 'express';\nconst app = express();\n" + handlerText;

describe("callCandidates records a literal name, and an unknown name with a reason", () => {
  test.each([
    ["a string literal", "'/orders'", "/orders", null],
    ["a template literal without substitutions", "`/orders`", "/orders", null],
    ["a string literal in parentheses with a type assertion", "('/orders' as string)", "/orders", null],
    ["a template literal with substitutions", "`/orders/${app.name}`", null,
      "The name argument is a template literal with substitutions, so the name is known only at run time."],
    ["a name", "app.name", null, "The name argument is not a string literal, so the name is known only at run time."],
    ["a concatenation", "'/' + app.name", null, "The name argument is not a string literal, so the name is known only at run time."],
  ])("%s", (_name, argument, name, nameReason) => {
    const [found] = candidatesIn({ [serverPath]: appText + `app.get(${argument}, list);\n` });
    expect({ name: found?.name, nameReason: found?.nameReason }).toEqual({ name, nameReason });
  });

  test("a spread argument before the name and the handler hides both", () => {
    const [found] = candidatesIn({ [serverPath]: appText + "const route = ['/orders', list] as const;\napp.get(...route);\n" });
    expect(found).toMatchObject({ name: null, handler: null,
      nameReason: "A spread argument comes at or before the name argument, so the rule cannot tell which value is the name.",
      handlerReason: "A spread argument comes at or before the handler argument, so the rule cannot tell which value is the handler." });
  });
});

describe("callCandidates resolves the handler to its declaration or its own range", () => {
  const orders = "export function listOrders() {\n  return 'orders';\n}\nexport default listOrders;\n";
  const declaration = { path: "src/orders.ts", range: rangeIn(orders, "export function listOrders() {\n  return 'orders';\n}") };
  const handlerIn = (files: Files): Pick<CallCandidate, "handler" | "handlerReason"> => {
    const [found] = candidatesIn({ "src/orders.ts": orders, ...files });
    return { handler: found?.handler ?? null, handlerReason: found?.handlerReason ?? null };
  };

  test.each([
    ["an inline arrow function", "(request: unknown) => request", "«(request: unknown) => request»"],
    ["an inline function expression", "function show() { return 'orders'; }", "«function show() { return 'orders'; }»"],
  ])("%s uses its own range", (_name, handler, marked) => {
    const text = appText + `app.get('/orders', ${handler});\n`;
    expect(handlerIn({ [serverPath]: text })).toEqual({ handler: { path: serverPath, range: rangeIn(text, marked) },
      handlerReason: null });
  });

  test.each([
    ["a renamed import", "import { listOrders as shown } from './orders';\n", "shown"],
    ["a member of a namespace import", "import * as orders from './orders';\n", "orders.listOrders"],
    ["a default import of an export of a name", "import shown from './orders';\n", "shown"],
    ["an export * from of another file", "import { listOrders } from './index';\n", "listOrders"],
    ["a destructuring of a module object", "import * as orders from './orders';\nconst { listOrders } = orders;\n", "listOrders"],
    ["the last of several handlers", "import { listOrders } from './orders';\nconst check = () => true;\n", "check, listOrders"],
  ])("%s resolves to the declaration of the function", (_name, imports, handler) => {
    const text = imports + appText + `app.get('/orders', ${handler});\n`;
    expect(handlerIn({ [serverPath]: text, "src/index.ts": "export * from './orders';\n" }))
      .toEqual({ handler: declaration, handlerReason: null });
  });

  test.each([
    ["a parameter", "export function routes(handler: () => string) {\n  app.get('/orders', handler);\n}\n",
      "The handler is a parameter, so its value comes from a caller."],
    ["the result of a call", "const wrap = (handler: () => string) => handler;\napp.get('/orders', wrap(list));\n",
      "The handler argument is not a function or a name, so the rule does not follow the value that it gives."],
    ["a name with no declaration", "app.get('/orders', undeclared);\n", "The type checker does not resolve the handler to a declaration."],
    ["an import of a package that the snapshot does not hold", "import { show } from 'handlers';\napp.get('/orders', show);\n",
      "The handler is an import that the type checker does not resolve to a snapshot file."],
  ])("%s is null with a reason", (_name, use, handlerReason) => {
    expect(handlerIn({ [serverPath]: appText + use })).toEqual({ handler: null, handlerReason });
  });

  test("a handler declared in a package folder of the snapshot is null with a reason", () => {
    const files = { "node_modules/handlers/index.d.ts": "export declare function show(): string;\n",
      [serverPath]: "import { show } from 'handlers';\n" + appText + "app.get('/orders', show);\n" };
    expect(handlerIn(files)).toEqual({ handler: null, handlerReason: "The handler is declared outside the snapshot source." });
  });
});
