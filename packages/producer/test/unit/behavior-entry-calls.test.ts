import { describe, expect, test } from "bun:test";
import { type EntryCandidate, callCandidates, entryQuery } from "../../src/behavior-entry-calls.ts";
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
// The action of a command: the name is the first argument of the command call, the call
// before action (nameCall 1), and the handler is the first argument of the action call.
// The builder methods description and option give the command that they are called on.
const commandAction: BehaviorEntryCallRule = { id: "command-action", version: 1, library: "commander", entryKind: "cli-command",
  kind: "call", importName: "commander", callPath: "program.command().action", nameArgument: 0, handlerArgument: 0, nameCall: 1,
  sameValueMethods: ["description", "option"] };
// A command call of a chain: each command call gives the instance that it is called on.
const chainedCommand: BehaviorEntryCallRule = { id: "chained-command", version: 1, library: "yargs", entryKind: "cli-command",
  kind: "call", importName: "yargs", callPath: "yargs().command", nameArgument: 0, handlerArgument: "last",
  sameValueMethods: ["command", "option"] };
const serverPath = "src/server.ts";
const handlerText = "const list = () => 'orders';\n";
const handlerAt = (text: string) => ({ path: serverPath, range: rangeIn(text, "const «list = () => 'orders'»;") });

function candidatesIn(files: Files, path = serverPath, rules: BehaviorEntryCallRule[] = [expressGet]): EntryCandidate[] {
  return withScratch((scratch) => callCandidates(entryQuery(projectOf(scratch, files)), path, rules));
}

// The call of the express-route-get rule, with the name /orders and the list handler.
function routeAt(text: string, call: string, handler = handlerAt(text)): EntryCandidate {
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

  // A JavaScript file exports a value of the import with an assignment, and another file requires it.
  test.each([
    { form: "module.exports = an expression", file: "src/app.js", exported: "module.exports = express();\n",
      required: "const app = require('./app');\n", local: "app", rule: expressGet },
    { form: "exports.name = an expression", file: "src/router.js", exported: "exports.router = express.Router();\n",
      required: "const { router } = require('./router');\n", local: "router", rule: routerGet },
    { form: "module.exports.name = an expression", file: "src/app.js", exported: "module.exports.app = express();\n",
      required: "const { app } = require('./app');\n", local: "app", rule: expressGet },
  ])("a value that $form of another snapshot file exports", ({ file, exported, required, local, rule }) => {
    const routes = required + handlerText + `${local}.get('/orders', list);\n`;
    const files = { [file]: "const express = require('express');\n" + exported, "src/routes.js": routes };
    expect(candidatesIn(files, "src/routes.js", [rule])).toEqual([{ ...routeAt(routes, `${local}.get('/orders', list)`),
      ruleId: rule.id, handler: { path: "src/routes.js", range: rangeIn(routes, "const «list = () => 'orders'»;") } }]);
  });

  // A type shim gives the types of a package that the snapshot does not hold. The value still comes from the package.
  test.each([
    ["a shorthand type shim", "declare module 'express';\n"],
    ["a type shim with a default export", "declare module 'express' {\n  function express(): any;\n  export default express;\n}\n"],
  ])("an app of a package that %s of the snapshot declares", (_name, shim) => {
    const text = "import express from 'express';\nconst app = express();\n" + handlerText + "app.get('/orders', list);\n";
    expect(candidatesIn({ "src/types.d.ts": shim, [serverPath]: text })).toEqual([routeAt(text, "app.get('/orders', list)")]);
  });

  test("a class and a require call of packages that type shims of the snapshot declare, and a re-export of a snapshot file", () => {
    const shims = "declare module 'hono' {\n  export class Hono {\n    get(path: string, handler: unknown): Hono;\n  }\n}\n" +
      "declare module 'express';\n";
    const api = "import { Hono } from './hono';\n" + handlerText + "const api = new Hono();\napi.get('/orders', list);\n";
    const script = "const express = require('express');\nconst app = express();\n" + handlerText + "app.get('/orders', list);\n";
    const files = { "types/shims.d.ts": shims, "src/hono.ts": "export { Hono } from 'hono';\n", "src/api.ts": api,
      "src/server.js": script };
    expect(candidatesIn(files, "src/api.ts", [honoGet])).toEqual([{ ...routeAt(api, "api.get('/orders', list)"),
      ruleId: "hono-route-get", handler: { path: "src/api.ts", range: rangeIn(api, "const «list = () => 'orders'»;") } }]);
    expect(candidatesIn(files, "src/server.js")).toEqual([{ ...routeAt(script, "app.get('/orders', list)"),
      handler: { path: "src/server.js", range: rangeIn(script, "const «list = () => 'orders'»;") } }]);
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

  test("a route in the handler of another route comes after that route, in source order", () => {
    const text = appText + "app.get('/a', () => {\n  app.get('/b', list);\n});\n";
    expect(candidatesIn({ [serverPath]: text }).map(({ name, range }) => ({ name, range }))).toEqual([
      { name: "/a", range: rangeIn(text, "app.get('/a', () => {\n  app.get('/b', list);\n})") },
      { name: "/b", range: rangeIn(text, "app.get('/b', list)") }]);
  });

  test("not an app that a parameter with a type of the import holds: a call rule has no type path", () => {
    const text = "import express, { type Express } from 'express';\n" + handlerText +
      "export function routes(app: Express) {\n  app.get('/orders', list);\n}\n";
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

// A file that starts with the program export and the list handler.
const programText = "import { program } from 'commander';\n" + handlerText;
// The candidate of a rule at a call of the text, with a name and the list handler.
const commandAt = (text: string, call: string, name: string | null, ruleId = "command-action"): EntryCandidate =>
  ({ ...routeAt(text, call), ruleId, entryKind: "cli-command", name });

describe("callCandidates reads the name from the call at the name call of the rule", () => {
  test.each([
    ["the command call before the action call", "program.command('serve').action(list);\n",
      "program.command('serve').action(list)"],
    ["the command call in the initializer of a variable that holds the command",
      "const serve = program.command('serve');\nserve.action(list);\n", "serve.action(list)"],
  ])("%s", (_name, use, call) => {
    const text = programText + use;
    expect(candidatesIn({ [serverPath]: text }, serverPath, [commandAction])).toEqual([commandAt(text, call, "serve")]);
  });

  test("a computed name in the command call is null with a reason, and a command call without a name is not a candidate", () => {
    const text = programText + "program.command(`${list()}`).action(list);\nprogram.command().action(list);\n";
    expect(candidatesIn({ [serverPath]: text }, serverPath, [commandAction])).toEqual([{
      ...commandAt(text, "program.command(`${list()}`).action(list)", null),
      nameReason: "The name argument is a template literal with substitutions, so the name is known only at run time." }]);
  });
});

describe("callCandidates passes the calls of the same value methods of a rule", () => {
  test.each([
    ["between the command call and the action call", "program.command('serve').description('Serve').option('-p').action(list)"],
    ["before the command call", "program.description('Tools').command('serve').action(list)"],
    ["on a variable that holds the command", "const serve = program.command('serve').description('Serve');\nserve.option('-p')" +
      ".action(list)"],
  ])("%s", (_name, use) => {
    const text = programText + use + ";\n";
    const call = use.slice(use.lastIndexOf("\n") + 1);
    expect(candidatesIn({ [serverPath]: text }, serverPath, [commandAction])).toEqual([commandAt(text, call, "serve")]);
  });

  // The call of the second command holds the call of the first, and both start at yargs.
  test("each call of a chain whose method gives the same value, in the order of the chain", () => {
    const text = "import yargs from 'yargs';\n" + handlerText +
      "yargs(process.argv).command('serve', 'Serve', {}, list).option('verbose').command('build', 'Build', {}, list).parse();\n";
    const first = "yargs(process.argv).command('serve', 'Serve', {}, list)";
    expect(candidatesIn({ [serverPath]: text }, serverPath, [chainedCommand])).toEqual([
      commandAt(text, first, "serve", "chained-command"),
      commandAt(text, first + ".option('verbose').command('build', 'Build', {}, list)", "build", "chained-command")]);
  });

  test.each([
    ["a method that the rule does not name", "program.command('serve').alias('s').action(list);\n", [commandAction]],
    ["a property between the calls", "program.command('serve').parent.action(list);\n", [commandAction]],
    ["a second command call, which makes another command", "program.command('tools').command('serve').action(list);\n",
      [commandAction]],
    ["a call that a rule without same value methods does not pass",
      "import express from 'express';\nexpress().use(list).get('/orders', list);\n", [expressGet]],
  ])("not %s", (_name, use, rules) => {
    expect(candidatesIn({ [serverPath]: programText + use }, serverPath, rules)).toEqual([]);
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
  const handlerIn = (files: Files): Pick<EntryCandidate, "handler" | "handlerReason"> => {
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
