import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resourceAccessRuleList } from "../../../src/resource-access-rules.ts";
import { resourceAccessNotes } from "../../../src/stage-4-resource-access.ts";
import type { ExtraFile } from "../../fixtures/stage-4-publication/fixture.ts";
import { collectedAttempt } from "../../support/collected-attempt.ts";
import { toolsRoot } from "../../support/commands.ts";
import { rangeIn } from "../../support/source-ranges.ts";

// Stage 4 collect applies the pinned resource access rule list that start saved to the
// source files of the graph scope; the rule-lists suite checks the saved copy and its
// pin. The
// snapshot writes and reads Knex tables through a typed client and through a client
// of another snapshot file, and queries a pg pool, which no rule names.
type Json = Record<string, unknown>;

const id = "s4-check";
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const rulesFile = "resource-access-rules.yaml";
const graphContext = "choom-default-v1-import";
const database = "import knex from 'knex';\n\nexport const db = knex({ client: 'pg' });\n";
const invoices = "import type { Knex } from 'knex';\n\nexport class InvoiceService {\n  constructor(private readonly db: Knex) {}\n\n" +
  "  async create(invoice: { id: string; total: number }) {\n    await this.db('invoices').insert(invoice);\n  }\n}\n";
const orders = "import { db } from './db';\n\nexport function listOrders() {\n  return db('orders').select('id');\n}\n";
const reports = "import { Pool } from 'pg';\n\nconst pool = new Pool();\nexport const totals = () => pool.query('SELECT total FROM invoices');\n";
const files: ExtraFile[] = [{ path: "src/db.ts", text: database }, { path: "src/invoices.ts", text: invoices },
  { path: "src/orders.ts", text: orders }, { path: "src/reports.ts", text: reports }];

const collected = collectedAttempt(files);
const saved = (name: string): Json => collected.saved(name);

// The site fields of a candidate at a call of a file of the fixture.
function site(text: string, path: string, call: string): Json {
  return { path, sha256: sha256(text), range: rangeIn(text, call), expression: call, truncated: false };
}

// A candidate of a Knex rule of the pinned list.
function knexCandidate(ruleId: string, operation: string, confidence: string, values: Json): Json {
  return { ruleId, ruleVersion: 1, library: "knex", resourceKind: "database-table", operation, confidence, siteRef: null,
    ...values, nameReason: null, identity: "inferred-from-name" };
}

describe("Stage 4 start and collect", () => {
  test("collect saves each candidate with its rule, site, operation, name, identity and context, and no owner", () => {
    const { tool, outsideReads, notes, ...record } = saved("resource-access-candidates.json");
    const paths = ["cli.ts", "http.ts", "src/db.ts", "src/invoices.ts", "src/orders.ts", "src/reports.ts"];
    const sites = saved("source-sites.json").sites as Json[];
    const query = "pool.query('SELECT total FROM invoices')";
    expect(record).toEqual({ formatVersion: 1, attemptId: id, snapshotRef: "snapshot-check", status: "completed",
      rulesRef: `${id}-file@${rulesFile}`, rulesSha256: sha256(readFileSync(join(toolsRoot, resourceAccessRuleList.path))),
      settingsRef: "settings-001", sourceSitesRef: `${id}-file@source-sites.json`,
      scope: { files: paths, groups: [{ graphContext, graphContextRef: `${id}-file@graph-profile.json#/contexts/0`,
        compilerSettingsRef: "settings-001#/parsingProfile", files: paths }] },
      queryOptions: { allowJs: true }, virtualRoot: "/repo", omittedCandidates: 0, gaps: [],
      candidates: [
        knexCandidate("knex-insert", "write", "receiver-type", { ...site(invoices, "src/invoices.ts",
          "this.db('invoices').insert(invoice)"), name: "invoices", context: { kind: "method", name: "InvoiceService.create",
          range: rangeIn(invoices, "async create(invoice: { id: string; total: number }) {\n    await this.db('invoices')" +
            ".insert(invoice);\n  }"), graphContext } }),
        knexCandidate("knex-select", "read", "receiver-import", { ...site(orders, "src/orders.ts", "db('orders').select('id')"),
          name: "orders", context: { kind: "function", name: "listOrders",
            range: rangeIn(orders, "export function listOrders() {\n  return db('orders').select('id');\n}"), graphContext } }),
        { ruleId: null, ruleVersion: null, library: null, resourceKind: null, operation: null, confidence: "name-only",
          siteRef: `${id}-file@source-sites.json#/sites/${sites.findIndex((item) => item.expression === query)}`,
          ...site(reports, "src/reports.ts", query), name: null, identity: "unknown",
          nameReason: "No resource access rule found this call. Only its name is on the list of resource call names of the " +
            "source sites, so it can access a resource.",
          context: { kind: "function", name: "totals", range: rangeIn(reports, "() => " + query), graphContext } },
      ] });
    expect({ name: (tool as Json).name, notes }).toEqual({ name: "ts-morph snapshot project (TypeScript type checker)",
      notes: resourceAccessNotes });
    expect(outsideReads).toContainEqual({ operation: "directory-exists", path: "/repo/node_modules" });
  });

  test("collect keeps the source sites unchanged and records the digest of the candidates in its receipt", () => {
    const sites = saved("source-sites.json").sites as Json[];
    expect(sites.filter((item) => item.kind === "resource-call-candidate").map((item) => item.expression))
      .toEqual(["pool.query('SELECT total FROM invoices')"]);
    expect((saved("operator-collect.json").digests as Json)["resource-access-candidates.json"])
      .toBe(sha256(readFileSync(join(collected.attempt().attempt, "resource-access-candidates.json"))));
  });
});
