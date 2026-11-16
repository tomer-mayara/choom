import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as tsMorph from "ts-morph";
import { entryQuery } from "../../src/behavior-entry-calls.ts";
import type { ResourceAccessRule } from "../../src/generated/contracts.ts";
import type { Fields } from "../../src/record-checks.ts";
import { fileAccessCandidates, savedSites } from "../../src/stage-4-resource-access.ts";
import { sourceSites } from "../../src/stage-4-source-sites.ts";
import { withScratch } from "../support/commands.ts";
import { projectOf, snapshotOf } from "../support/snapshot-files.ts";
import { rangeIn } from "../support/source-ranges.ts";

// The resource access candidates of one file of the scope: the calls that a rule
// finds, and each resource call site that Stage 4 collect saved in source-sites.json
// and that no rule finds, with confidence name-only. The suite saves the sites of the
// file with the source collection of collect, as collect does before it applies the rules.
const knexInsert: ResourceAccessRule = { id: "knex-insert", version: 1, library: "knex", resourceKind: "database-table",
  operation: "write", importName: "knex", callPath: "knex()().insert", typePath: "Knex().insert", nameCall: 1, nameArgument: 0 };
const fileWrite: ResourceAccessRule = { id: "fs-write-file", version: 2, library: "node:fs", resourceKind: "file",
  operation: "write", importName: "node:fs/promises", callPath: "writeFile", typePath: null, nameCall: 0, nameArgument: 0 };
const path = "src/service.ts";
const sitesRef = "s4-x-file@source-sites.json";
const graphContext = "choom-default-v1-import";
const text = "import knex from 'knex';\nimport { writeFile } from 'node:fs/promises';\n\nconst db = knex({ client: 'pg' });\n" +
  "db('invoices').insert(row);\n\nexport async function save(data: string) {\n  await writeFile('out.txt', data);\n" +
  "  await cache.query('invoices');\n  return fetch(url).then(check);\n}\n";
const sha256 = createHash("sha256").update(text).digest("hex");
const nameOnlyReason = "No resource access rule found this call. Only its name is on the list of resource call names of " +
  "the source sites, so it can access a resource.";

// Saves the source sites of the file, lets `change` edit them, and returns the candidates of the rules.
function candidatesOf(change: (sites: Fields & { sites: Fields[] }) => void = () => {}): Fields[] {
  return withScratch((scratch) => {
    const sites = sourceSites({ attemptId: "s4-x", snapshotRef: "snap", sourceFiles: [{ path, sha256 }],
      snapshot: snapshotOf(scratch, { [path]: text }), check: () => {}, tsMorph, parser: {} }) as Fields & { sites: Fields[] };
    change(sites);
    return fileAccessCandidates(entryQuery(projectOf(scratch, { [path]: text })), { path, sha256 }, [knexInsert, fileWrite],
      savedSites(sites, sitesRef), graphContext);
  });
}

// The reference of the saved resource call site with the expression.
function siteRef(expression: string): string {
  const sites = withScratch((scratch) => (sourceSites({ attemptId: "s4-x", snapshotRef: "snap", sourceFiles: [{ path, sha256 }],
    snapshot: snapshotOf(scratch, { [path]: text }), check: () => {}, tsMorph, parser: {} }).sites as Fields[]));
  return `${sitesRef}#/sites/${sites.findIndex((site) => site.expression === expression)}`;
}

const saveContext = { kind: "function", name: "save", graphContext,
  range: rangeIn(text, "export async function save(data: string) {\n  await writeFile('out.txt', data);\n" +
    "  await cache.query('invoices');\n  return fetch(url).then(check);\n}") };
const site = (expression: string) => ({ path, sha256, range: rangeIn(text, expression), expression, truncated: false });
const ruleFields = (rule: ResourceAccessRule) => ({ ruleId: rule.id, ruleVersion: rule.version, library: rule.library,
  resourceKind: rule.resourceKind, operation: rule.operation });
const nameOnly = (expression: string) => ({ ruleId: null, ruleVersion: null, library: null, resourceKind: null, operation: null,
  confidence: "name-only", siteRef: siteRef(expression), ...site(expression), name: null, nameReason: nameOnlyReason,
  identity: "unknown", context: saveContext });

describe("fileAccessCandidates", () => {
  test("saves the calls of the rules and the resource call sites that no rule found, in source order", () => {
    expect(candidatesOf()).toEqual([
      { ...ruleFields(knexInsert), confidence: "receiver-import", siteRef: null, ...site("db('invoices').insert(row)"),
        name: "invoices", nameReason: null, identity: "inferred-from-name",
        context: { kind: "module", name: null, range: null, graphContext } },
      { ...ruleFields(fileWrite), confidence: "receiver-import", siteRef: siteRef("writeFile('out.txt', data)"),
        ...site("writeFile('out.txt', data)"), name: "out.txt", nameReason: null, identity: "inferred-from-name",
        context: saveContext },
      nameOnly("cache.query('invoices')"),
      nameOnly("fetch(url)"),
    ]);
  });

  test("stops when a saved resource call site does not match the syntax tree that the type checker reads", () => {
    const ref = siteRef("cache.query('invoices')");
    const index = Number(ref.slice(ref.lastIndexOf("/") + 1));
    expect(() => candidatesOf((sites) => { (sites.sites[index] as Fields).expression = "cache.query('orders')"; }))
      .toThrow(`The saved source site ${ref} does not match the syntax tree of ${path}.`);
  });
});
