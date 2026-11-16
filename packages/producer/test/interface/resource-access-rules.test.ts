import { expect, expectTypeOf, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as yaml from "yaml";
import contracts from "../../../../cookbook/interfaces/generated/contracts.schema.json";
import type { ResourceAccessRuleList } from "../../src/generated/contracts.ts";
import { checkResourceRuleList, resourceAccessRuleList } from "../../src/resource-access-rules.ts";
import { readRules } from "../../src/rule-lists.ts";
import { toolsRoot } from "../support/commands.ts";

// The contract of the pinned resource access rule list: the generated structural
// schema and the runtime check of the producer accept and refuse the same shapes.
// The runtime check also refuses a repeated rule ID, a name call that the call path
// or the type path does not have, and a type path that does not end with the last
// steps of the call path.
type Rule = Record<string, unknown>;
type Change = (input: { formatVersion: unknown; rules: Rule[] } & Record<string, unknown>) => void;

const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true }))
  .compile({ $ref: "ResourceAccessRuleList.json" });

function ruleList(): ResourceAccessRuleList {
  return { formatVersion: 1, rules: [
    { id: "knex-insert", version: 1, library: "knex", resourceKind: "database-table", operation: "write", importName: "knex",
      callPath: "knex()().insert", typePath: "Knex().insert", nameCall: 1, nameArgument: 0 },
    { id: "fs-write-file", version: 2, library: "node:fs", resourceKind: "file", operation: "write",
      importName: "node:fs/promises", callPath: "writeFile", typePath: null, nameCall: 0, nameArgument: 0 },
    { id: "pg-pool-query", version: 1, library: "pg", resourceKind: "database", operation: "query", importName: "pg",
      callPath: "new Pool().query", typePath: "Pool.query", nameCall: 0, nameArgument: 0 },
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
    checkResourceRuleList(input);
    return false;
  } catch {
    return true;
  }
};

test("the runtime check returns the generated rule list contract", () => {
  expectTypeOf<ReturnType<typeof checkResourceRuleList>>().toEqualTypeOf<ResourceAccessRuleList>();
});

test("rules with and without a type path conform at both boundaries without a change", () => {
  const input = ruleList();
  expect(structure(input)).toBe(true);
  expect(checkResourceRuleList(input)).toEqual(input);
});

test("the pinned rule list of the producer conforms at both boundaries and holds the starter rules", () => {
  const bytes = readFileSync(join(toolsRoot, resourceAccessRuleList.path));
  const list = readRules(resourceAccessRuleList, bytes, yaml);
  expect(structure(yaml.parse(bytes.toString("utf8")))).toBe(true);
  const knex = (id: string, operation: string, method: string) => ({ id, version: 1, library: "knex",
    resourceKind: "database-table", operation, importName: "knex", callPath: `knex()().${method}`, typePath: `Knex().${method}`,
    nameCall: 1, nameArgument: 0 });
  expect(list).toEqual({ formatVersion: 1, rules: [knex("knex-insert", "write", "insert"), knex("knex-update", "write", "update"),
    knex("knex-del", "write", "del"), knex("knex-select", "read", "select")] });
});

test.each<[string, Change]>([
  ["another format version", (input) => { input.formatVersion = 2; }],
  ["no rules", (input) => { input.rules = []; }],
  ["an unknown top-level field", (input) => { input.notes = "Reviewed"; }],
  ["a rule with an unknown field", (input) => { rule(input, 0).owner = "billing"; }],
  ["a rule without its type path", (input) => { delete rule(input, 1).typePath; }],
  ["an ID with capital letters", (input) => { rule(input, 0).id = "Knex-insert"; }],
  ["version 0", (input) => { rule(input, 0).version = 0; }],
  ["a blank library", (input) => { rule(input, 0).library = " \n"; }],
  ["a resource kind with a space", (input) => { rule(input, 0).resourceKind = "database table"; }],
  ["an operation with a capital letter", (input) => { rule(input, 0).operation = "Write"; }],
  ["a relative import name", (input) => { rule(input, 0).importName = "./db"; }],
  ["a call path that ends with a call", (input) => { rule(input, 0).callPath = "knex()()"; }],
  ["a type path with new", (input) => { rule(input, 2).typePath = "new Pool.query"; }],
  ["a type path that is not a name", (input) => { rule(input, 0).typePath = "Knex['insert']"; }],
  ["a negative name call", (input) => { rule(input, 0).nameCall = -1; }],
  ["a name call that is not an integer", (input) => { rule(input, 0).nameCall = 0.5; }],
  ["no name argument", (input) => { rule(input, 0).nameArgument = null; }],
  ["a name argument word", (input) => { rule(input, 0).nameArgument = "last"; }],
])("both boundaries refuse %s", (_name, change) => {
  const input = changed(change);
  expect(structure(input)).toBe(false);
  expect(refusedByRuntime(input)).toBe(true);
});

test.each<[string, Change, string]>([
  ["a repeated rule ID", (input) => { rule(input, 1).id = "knex-insert"; },
    "Invalid resource access rule 2 (knex-insert): the ID is already used."],
  ["a name call that the call path does not have", (input) => { rule(input, 1).nameCall = 1; },
    "Invalid resource access rule 2 (fs-write-file): the call path has no call at the name call 1."],
  ["a type path that does not end with the last steps of the call path", (input) => { rule(input, 0).typePath = "Knex().update"; },
    "Invalid resource access rule 1 (knex-insert): the type path does not end with the last steps of the call path."],
  ["a name call that the type path does not have", (input) => { rule(input, 2).nameCall = 1; },
    "Invalid resource access rule 3 (pg-pool-query): the type path has no call at the name call 1."],
])("the structural schema accepts and the runtime check refuses %s", (_name, change, message) => {
  const input = changed(change);
  expect(structure(input)).toBe(true);
  expect(() => checkResourceRuleList(input)).toThrow(message);
});
