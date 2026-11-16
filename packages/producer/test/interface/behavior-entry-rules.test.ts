import { expect, expectTypeOf, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as yaml from "yaml";
import contracts from "../../../../cookbook/interfaces/generated/contracts.schema.json";
import { behaviorEntryRulesPath, checkRuleList, readRuleList } from "../../src/behavior-entry-rules.ts";
import type { BehaviorEntryRuleList } from "../../src/generated/contracts.ts";
import { toolsRoot } from "../support/commands.ts";

// The contract of the pinned behavior entry rule list: the generated structural
// schema and the runtime check of the producer accept and refuse the same shapes.
// The runtime check also refuses a repeated rule ID and a call rule that names one
// argument as both the name and the handler.
type Rule = Record<string, unknown>;
type Change = (input: { formatVersion: unknown; rules: Rule[] } & Record<string, unknown>) => void;

const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true }))
  .compile({ $ref: "BehaviorEntryRuleList.json" });

function ruleList(): BehaviorEntryRuleList {
  return { formatVersion: 1, rules: [
    { id: "express-route-get", version: 1, library: "express", entryKind: "http-route", kind: "call", importName: "express",
      callPath: "express().get", nameArgument: 0, handlerArgument: "last" },
    { id: "worker-start", version: 2, library: "node:worker_threads", entryKind: "worker", kind: "call",
      importName: "node:worker_threads", callPath: "new Worker", nameArgument: 0, handlerArgument: null },
    { id: "hono-route-get", version: 1, library: "hono", entryKind: "http-route", kind: "call", importName: "@hono/hono",
      callPath: "new Hono().get", nameArgument: null, handlerArgument: 1 },
    { id: "vite-build-input", version: 1, library: "vite", entryKind: "frontend-entry", kind: "settings-literal",
      fileGlob: "**/vite.config.{js,ts}", propertyPath: "build.rollupOptions.input" },
  ] };
}

function changed(change: Change): unknown {
  const input = ruleList() as unknown as Parameters<Change>[0];
  change(input);
  return input;
}

const rule = (input: Parameters<Change>[0], index: number): Rule => {
  const item = input.rules[index];
  if (item === undefined) throw new Error(`The rule list fixture needs rule ${index}.`);
  return item;
};

const refusedByRuntime = (input: unknown): boolean => {
  try {
    checkRuleList(input);
    return false;
  } catch {
    return true;
  }
};

test("the runtime check returns the generated rule list contract", () => {
  expectTypeOf<ReturnType<typeof checkRuleList>>().toEqualTypeOf<BehaviorEntryRuleList>();
});

test("call and settings-literal rules conform at both boundaries without a change", () => {
  const input = ruleList();
  expect(structure(input)).toBe(true);
  expect(checkRuleList(input)).toEqual(input);
});

// The unit test of the rule samples checks what each rule of the list finds.
test("the pinned rule list of the producer conforms at both boundaries and keeps the starter rule unchanged", () => {
  const bytes = readFileSync(join(toolsRoot, behaviorEntryRulesPath));
  const list = readRuleList(bytes, yaml);
  expect(structure(yaml.parse(bytes.toString("utf8")))).toBe(true);
  expect(list.rules).toContainEqual({ id: "express-route-get", version: 1, library: "express", entryKind: "http-route",
    kind: "call", importName: "express", callPath: "express().get", nameArgument: 0, handlerArgument: "last" });
});

test.each<[string, Change]>([
  ["another format version", (input) => { input.formatVersion = 2; }],
  ["no rules", (input) => { input.rules = []; }],
  ["an unknown top-level field", (input) => { input.notes = "Reviewed"; }],
  ["a rule of another kind", (input) => { rule(input, 0).kind = "decorator"; }],
  ["a rule without its kind", (input) => { delete rule(input, 0).kind; }],
  ["a call rule with a settings field", (input) => { rule(input, 0).fileGlob = "**/*.ts"; }],
  ["a settings-literal rule with a call field", (input) => { rule(input, 3).callPath = "express().get"; }],
  ["a rule with an unknown field", (input) => { rule(input, 0).comment = "Express routes"; }],
  ["an ID with capital letters", (input) => { rule(input, 0).id = "Express-route-get"; }],
  ["an ID longer than 128 characters", (input) => { rule(input, 0).id = "r".repeat(129); }],
  ["version 0", (input) => { rule(input, 0).version = 0; }],
  ["a version that is not an integer", (input) => { rule(input, 0).version = 1.5; }],
  ["a blank library", (input) => { rule(input, 0).library = " \n"; }],
  ["an entry kind with a space", (input) => { rule(input, 0).entryKind = "http route"; }],
  ["a relative import name", (input) => { rule(input, 0).importName = "./server"; }],
  ["an import name with a capital letter", (input) => { rule(input, 0).importName = "Express"; }],
  ["a call path that ends with a call", (input) => { rule(input, 0).callPath = "express().get()"; }],
  ["a call path with an argument", (input) => { rule(input, 0).callPath = "express(app).get"; }],
  ["a call path with new in the middle", (input) => { rule(input, 0).callPath = "express().new get"; }],
  ["a call path that is not a name", (input) => { rule(input, 0).callPath = "app['get']"; }],
  ["a negative argument", (input) => { rule(input, 0).nameArgument = -1; }],
  ["an argument that is not an integer", (input) => { rule(input, 0).nameArgument = 0.5; }],
  ["a handler argument word other than last", (input) => { rule(input, 0).handlerArgument = "first"; }],
  ["a call rule without its name argument", (input) => { delete rule(input, 0).nameArgument; }],
  ["a file glob that starts at the file system root", (input) => { rule(input, 3).fileGlob = "/repo/vite.config.ts"; }],
  ["a file glob with a space", (input) => { rule(input, 3).fileGlob = "vite config.ts"; }],
  ["a property path with an empty name", (input) => { rule(input, 3).propertyPath = "build..input"; }],
  ["a property path with an index", (input) => { rule(input, 3).propertyPath = "build.input[0]"; }],
])("both boundaries refuse %s", (_name, change) => {
  const input = changed(change);
  expect(structure(input)).toBe(false);
  expect(refusedByRuntime(input)).toBe(true);
});

test.each<[string, Change, string]>([
  ["a repeated rule ID", (input) => { rule(input, 1).id = "express-route-get"; },
    "Invalid behavior entry rule 2 (express-route-get): the ID is already used."],
  ["one argument as both the name and the handler", (input) => { rule(input, 0).handlerArgument = 0; },
    "Invalid behavior entry rule 1 (express-route-get): the name argument and the handler argument are the same."],
])("the structural schema accepts and the runtime check refuses %s", (_name, change, message) => {
  const input = changed(change);
  expect(structure(input)).toBe(true);
  expect(() => checkRuleList(input)).toThrow(message);
});
