import { describe, expect, test } from "bun:test";
import { entryQuery } from "../../src/behavior-entry-calls.ts";
import type { ResourceAccessRule } from "../../src/generated/contracts.ts";
import { accessMatches } from "../../src/resource-access-calls.ts";
import { withScratch } from "../support/commands.ts";
import { type Files, projectOf } from "../support/snapshot-files.ts";
import { rangeIn } from "../support/source-ranges.ts";

// accessMatches on a saved snapshot: the calls of one file whose callee is the call
// path of a resource access rule on the value of its import. The name of the
// resource is an argument of the call that the rule names, such as the table name of
// db('invoices').insert(row), which is the argument of the call before insert.
const knexInsert: ResourceAccessRule = { id: "knex-insert", version: 1, library: "knex", resourceKind: "database-table",
  operation: "write", importName: "knex", callPath: "knex()().insert", typePath: "Knex().insert", nameCall: 1, nameArgument: 0 };
const knexUpdate: ResourceAccessRule = { ...knexInsert, id: "knex-update", callPath: "knex()().update", typePath: "Knex().update" };
const fileWrite: ResourceAccessRule = { id: "fs-write-file", version: 2, library: "node:fs", resourceKind: "file",
  operation: "write", importName: "node:fs/promises", callPath: "writeFile", typePath: null, nameCall: 0, nameArgument: 0 };
const servicePath = "src/invoices.ts";
const client = "import knex from 'knex';\nconst db = knex({ client: 'pg' });\n";

function matchesIn(files: Files, rules: ResourceAccessRule[] = [knexInsert], path = servicePath): Record<string, unknown>[] {
  return withScratch((scratch) => accessMatches(entryQuery(projectOf(scratch, files)), path, rules)
    .map(({ rule, confidence, range, expression, truncated, name, nameReason }) =>
      ({ ruleId: rule.id, confidence, range, expression, truncated, name, nameReason })));
}

// The match of a rule at a call of the text, with a name.
function matchAt(text: string, call: string, name: string | null = "invoices", ruleId = "knex-insert"): Record<string, unknown> {
  return { ruleId, confidence: "receiver-import", range: rangeIn(text, call), expression: call, truncated: false, name,
    nameReason: null };
}

describe("accessMatches matches a call whose receiver comes from the import", () => {
  test.each([
    ["a client that the import makes", client + "db('invoices').insert(row);\n", "db('invoices').insert(row)"],
    ["a call of the import without a variable", "import knex from 'knex';\nknex({ client: 'pg' })('invoices').insert(row);\n",
      "knex({ client: 'pg' })('invoices').insert(row)"],
    ["a client of a require call", "const knex = require('knex');\nconst db = knex({ client: 'pg' });\n" +
      "db('invoices').insert(row);\n", "db('invoices').insert(row)"],
    ["a table query that a variable holds, with the name in the call of its initializer",
      client + "const invoices = db('invoices');\ninvoices.insert(row);\n", "invoices.insert(row)"],
  ])("%s", (_name, text, call) => {
    expect(matchesIn({ [servicePath]: text })).toEqual([matchAt(text, call)]);
  });

  test("a rule whose name is an argument of the call that it finds", () => {
    const text = "import { writeFile } from 'node:fs/promises';\nawait writeFile('out.txt', data);\n";
    expect(matchesIn({ [servicePath]: text }, [fileWrite]))
      .toEqual([matchAt(text, "writeFile('out.txt', data)", "out.txt", "fs-write-file")]);
  });

  test.each([
    ["the method of a client of another library", "import knex from 'other-db';\nconst db = knex();\n" +
      "db('invoices').insert(row);\n"],
    ["the method of a local function with the name of the import", "function knex() { return (table: string) => " +
      "({ insert: (row: unknown) => [table, row] }); }\nconst db = knex();\ndb('invoices').insert(row);\n"],
    ["a method of the client itself, with no table call", client + "db.insert(row);\n"],
    ["a method after another method of the table query", client + "db('invoices').where({ id: 1 }).update(row);\n"],
    ["a client that a function gets as a parameter with no type", "export function save(db: any) {\n" +
      "  return db('invoices').insert(row);\n}\n"],
  ])("not %s", (_name, text) => {
    expect(matchesIn({ [servicePath]: text }, [knexInsert, knexUpdate])).toEqual([]);
  });
});

// A function that writes a row with a client of the type in `type`, imported as `imports` gives it.
const typed = (imports: string, type = "Knex"): string => imports +
  `export async function save(db: ${type}) {\n  await db('invoices').insert(row);\n}\n`;
const typedCall = "db('invoices').insert(row)";

describe("accessMatches matches a call whose receiver has a declared type of the import", () => {
  const typedMatch = (text: string, call = typedCall): Record<string, unknown> =>
    ({ ...matchAt(text, call), confidence: "receiver-type" });

  test.each([
    ["a parameter with a type of the import", typed("import type { Knex } from 'knex';\n")],
    ["a parameter with the type or undefined", typed("import type { Knex } from 'knex';\n", "(Knex | undefined)")],
    ["a type in a namespace of a default import", typed("import knex from 'knex';\n", "knex.Knex")],
    ["a type alias of the snapshot", typed("import type { Knex } from 'knex';\ntype Database = Knex;\n", "Database")],
    ["a type that another snapshot file exports", typed("import type { Database } from './db';\n", "Database")],
  ])("%s", (_name, text) => {
    const files = { [servicePath]: text, "src/db.ts": "import type { Knex } from 'knex';\nexport type Database = Knex;\n" };
    expect(matchesIn(files)).toEqual([typedMatch(text)]);
  });

  test.each([
    ["a parameter property of a class", "import { Knex } from 'knex';\nexport class InvoiceService {\n" +
      "  constructor(private readonly db: Knex) {}\n\n  create() {\n    return this.db('invoices').insert(row);\n  }\n}\n",
    "this.db('invoices').insert(row)"],
    ["a property of a class", "import type { Knex } from 'knex';\nclass Store {\n  db?: Knex;\n\n" +
      "  save() {\n    return this.db('invoices').insert(row);\n  }\n}\n", "this.db('invoices').insert(row)"],
    ["a property of an interface", "import type { Knex } from 'knex';\ninterface Deps { db: Knex }\n" +
      "export function save(deps: Deps) {\n  return deps.db('invoices').insert(row);\n}\n", "deps.db('invoices').insert(row)"],
    ["a variable with the type and a value of another function", "import type { Knex } from 'knex';\n" +
      "declare function connect(): Knex;\nconst db: Knex = connect();\ndb('invoices').insert(row);\n", typedCall],
    ["a variable that holds a typed parameter", "import type { Knex } from 'knex';\nexport function save(client: Knex) {\n" +
      "  const db = client;\n  return db('invoices').insert(row);\n}\n", typedCall],
  ])("%s", (_name, text, call) => {
    expect(matchesIn({ [servicePath]: text })).toEqual([typedMatch(text, call)]);
  });

  test("a variable with the type keeps the value of the import when it has one", () => {
    const text = "import knex, { type Knex } from 'knex';\nconst db: Knex = knex({ client: 'pg' });\ndb('invoices').insert(row);\n";
    expect(matchesIn({ [servicePath]: text })).toEqual([matchAt(text, typedCall)]);
  });

  test.each([
    ["a type of another library", typed("import type { Knex } from 'other-db';\n")],
    ["a type of the snapshot with the name of the type", typed("interface Knex { (table: string): " +
      "{ insert(row: unknown): unknown } }\n")],
    ["another type of the import", typed("import type { Knex } from 'knex';\n", "Knex.QueryBuilder")],
    ["a union of two types", typed("import type { Knex } from 'knex';\n", "Knex | string")],
    ["a method whose return type is the type", "import type { Knex } from 'knex';\nclass Store {\n  client(): Knex {\n" +
      "    return connect();\n  }\n\n  save() {\n    return this.client('invoices').insert(row);\n  }\n}\n"],
  ])("not %s", (_name, text) => {
    expect(matchesIn({ [servicePath]: text })).toEqual([]);
  });
});

describe("accessMatches records a literal name, and an unknown name with a reason", () => {
  test.each([
    ["a string literal", "'invoices'", "invoices", null],
    ["a template literal without substitutions", "`invoices`", "invoices", null],
    ["a string literal with a type assertion", "('invoices' as string)", "invoices", null],
    ["a template literal with substitutions", "`invoices_${year}`", null,
      "The name argument is a template literal with substitutions, so the name is known only at run time."],
    ["a name", "table", null, "The name argument is not a string literal, so the name is known only at run time."],
    ["a spread argument", "...tables", null,
      "A spread argument comes at or before the name argument, so the rule cannot tell which value is the name."],
    ["no argument", "", null, "The call has no argument at the name position."],
  ])("%s", (_name, argument, name, nameReason) => {
    const [found] = matchesIn({ [servicePath]: client + `db(${argument}).insert(row);\n` });
    expect({ name: found?.name, nameReason: found?.nameReason }).toEqual({ name, nameReason });
  });
});

// The source context of a match: the function or the method that holds the call, or the module.
describe("accessMatches records the function or the method that holds the call, or the module", () => {
  const contextIn = (text: string): unknown => withScratch((scratch) =>
    accessMatches(entryQuery(projectOf(scratch, { [servicePath]: text })), servicePath, [knexInsert])
      .map(({ context }) => context));
  const insert = "db('invoices').insert(row)";
  const holder = (kind: string, name: string | null, text: string, marked: string) => ({ kind, name, range: rangeIn(text, marked) });

  test.each([
    ["a method of a class, with the name of the class", "class InvoiceService {\n  create() {\n    return " + insert +
      ";\n  }\n}\n", "method", "InvoiceService.create", "create() {\n    return " + insert + ";\n  }"],
    ["a constructor", "class InvoiceService {\n  constructor() {\n    " + insert + ";\n  }\n}\n", "method",
      "InvoiceService.constructor", "constructor() {\n    " + insert + ";\n  }"],
    ["a method of an object", "const repository = {\n  save() {\n    return " + insert + ";\n  },\n};\n", "method", "save",
      "save() {\n    return " + insert + ";\n  }"],
    ["a function declaration", "export function save() {\n  return " + insert + ";\n}\n", "function", "save",
      "export function save() {\n  return " + insert + ";\n}"],
    ["an arrow function in a variable", "export const save = () => " + insert + ";\n", "function", "save",
      "() => " + insert],
    ["an arrow function in a property of a class", "class Store {\n  save = () => " + insert + ";\n}\n", "function",
      "Store.save", "() => " + insert],
    ["an anonymous function", "export const routes = [() => " + insert + "];\n", "function", null, "() => " + insert],
  ])("%s", (_name, body, kind, name, marked) => {
    const text = client + body;
    expect(contextIn(text)).toEqual([holder(kind, name, text, marked)]);
  });

  test("the module, when no function holds the call", () => {
    expect(contextIn(client + insert + ";\n")).toEqual([{ kind: "module", name: null, range: null }]);
  });
});
