import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { CandidateInputs } from "../../src/record-candidates.ts";
import type { Artifact, Fields } from "../../src/record-checks.ts";
import { validateResourceCandidates } from "../../src/record-resource-candidates.ts";
import { rangeIn } from "../support/source-ranges.ts";

// The check of the resource access candidates that the selected resource observations
// name: the record that Stage 4 collect saved, its rule list and its source sites, and
// each candidate located in the saved snapshot file that it names.
type Json = Record<string, unknown>;
type Change = (record: Json & { candidates: Json[]; gaps: Json[] }, sites: Json & { sites: Json[] }) => void;

const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
const snapshotRef = "snap";
const candidatesRef = "s4-x-file@resource-access-candidates.json";
const rulesRef = "s4-x-file@resource-access-rules.yaml";
const sitesRef = "s4-x-file@source-sites.json";
const path = "src/server.ts";
const server = "import knex from 'knex';\nconst db = knex();\ndb('invoices').insert(row);\nfunction save() {\n" +
  "  return pool.query('SELECT 1');\n}\n";
const rules = { formatVersion: 1, rules: [{ id: "knex-insert", version: 1, library: "knex", resourceKind: "database-table",
  operation: "write" }] };
const site = (expression: string): Json => ({ path, sha256: sha256(server), range: rangeIn(server, expression), expression,
  truncated: false });
const query = "pool.query('SELECT 1')";
const saveRange = rangeIn(server, "function save() {\n  return " + query + ";\n}");

function records(): [Json & { candidates: Json[]; gaps: Json[] }, Json & { sites: Json[] }] {
  const sites = { formatVersion: 1, snapshotRef, sites: [
    { id: "s4-x-site-1", path, sha256: sha256(server), lines: [1, 1], kind: "import", specifier: "knex", typeOnly: false,
      dynamic: false, expression: "import knex from 'knex';", truncated: false },
    { id: "s4-x-site-2", path, sha256: sha256(server), lines: [5, 5], kind: "resource-call-candidate", specifier: null,
      typeOnly: null, dynamic: null, expression: query, truncated: false }] };
  const record = { formatVersion: 1, attemptId: "s4-x", snapshotRef, status: "completed", rulesRef,
    rulesSha256: sha256(JSON.stringify(rules)), settingsRef: "settings-001", sourceSitesRef: sitesRef, omittedCandidates: 0,
    notes: ["A candidate is not proven resource access."],
    candidates: [
      { ruleId: "knex-insert", ruleVersion: 1, library: "knex", resourceKind: "database-table", operation: "write",
        confidence: "receiver-import", siteRef: null, ...site("db('invoices').insert(row)"), name: "invoices", nameReason: null,
        identity: "inferred-from-name", context: { kind: "module", name: null, range: null, graphContext: "g-import" } },
      { ruleId: null, ruleVersion: null, library: null, resourceKind: null, operation: null, confidence: "name-only",
        siteRef: `${sitesRef}#/sites/1`, ...site(query), name: null, nameReason: "No rule found this call.", identity: "unknown",
        context: { kind: "function", name: "save", range: saveRange, graphContext: "g-import" } }],
    gaps: [{ kind: "missing-compiler-input", input: "types", missing: "node", subjectRefs: ["tsconfig.json"], reason: "Missing types." }] };
  return [record, sites];
}

function inputs(change: Change = () => {}, ref: unknown = candidatesRef): CandidateInputs {
  const [record, sites] = records();
  change(record, sites);
  const artifacts = new Map<string, Artifact>();
  for (const [id, file, saved] of [[candidatesRef, "evidence/s4-x/resource-access-candidates.json", record],
    [rulesRef, "evidence/s4-x/resource-access-rules.yaml", rules], [sitesRef, "evidence/s4-x/source-sites.json", sites],
    ["launch", "evidence/launch.json", { cli: "serve" }]] as const) {
    const bytes = Buffer.from(JSON.stringify(saved));
    artifacts.set(id, { path: file, bytes, sha256: sha256(bytes) });
  }
  const indexed = new Map<unknown, Fields>([[path, { path, kind: "file", bytes: Buffer.byteLength(server), sha256: sha256(server) }]]);
  return { ref, snapshotRef, artifacts, indexed, document: (id) => JSON.parse(String(artifacts.get(id as string)?.bytes)) as unknown,
    readSource: () => Buffer.from(server) };
}

const candidate = (record: Parameters<Change>[0], index = 0): Json => record.candidates[index] as Json;
const context = (record: Parameters<Change>[0], index = 0): Json => candidate(record, index).context as Json;
const named = `The resource access candidates ${candidatesRef}`;

describe("validateResourceCandidates", () => {
  test("accepts candidates that lie in the saved files and name their saved sites, and counts the candidates", () => {
    expect(validateResourceCandidates(inputs())).toBe(2);
  });

  test("accepts a partial record that leaves out a resource call site after the candidate limit", () => {
    expect(validateResourceCandidates(inputs((record) => {
      Object.assign(record, { status: "partial", omittedCandidates: 1, candidates: record.candidates.slice(0, 1) });
    }))).toBe(1);
  });

  test.each<[string, Change, string]>([
    ["a record of another snapshot", (record) => { record.snapshotRef = "other"; }, `${named} are not a record of this snapshot.`],
    ["a rule list digest that differs from the saved list", (record) => { record.rulesSha256 = sha256("other"); },
      `${named} do not name their saved rule list.`],
    ["a source sites reference to another record", (record) => { record.sourceSitesRef = "launch"; },
      `${named} do not name their saved source sites.`],
    ["a candidate of a rule version that the list does not hold", (record) => { candidate(record).ruleVersion = 2; },
      "Invalid resource access candidate 0."],
    ["a candidate whose operation differs from its rule", (record) => { candidate(record).operation = "read"; },
      "Invalid resource access candidate 0."],
    ["a candidate of an unknown confidence", (record) => { candidate(record).confidence = "receiver-name"; },
      "Invalid resource access candidate 0."],
    ["a name-only candidate with a rule", (record) => { candidate(record, 1).ruleId = "knex-insert"; },
      "Invalid resource access candidate 1."],
    ["a name-only candidate without its site", (record) => { candidate(record, 1).siteRef = null; },
      "Invalid resource access candidate 1."],
    ["a candidate that names an owner", (record) => { candidate(record).owner = "billing"; }, "Invalid resource access candidate 0."],
    ["a name with an unknown identity", (record) => { candidate(record).identity = "unknown"; }, "Invalid resource access candidate 0."],
    ["a null name with an inferred identity", (record) => { candidate(record, 1).identity = "inferred-from-name"; },
      "Invalid resource access candidate 1."],
    ["a module context with a range", (record) => { context(record).range = saveRange; }, "Invalid resource access candidate 0."],
    ["a context with another field", (record) => { context(record).runtime = "request"; }, "Invalid resource access candidate 0."],
    ["a range outside the saved file", (record) => { candidate(record).range = [{ line: 3, column: 1 }, { line: 3, column: 40 }]; },
      "Resource access candidate 0 has a range outside the saved file src/server.ts."],
    ["an expression that differs from the saved text", (record) => { candidate(record).expression = "db('orders').insert(row)"; },
      "Resource access candidate 0 differs from the saved text at its range."],
    ["a context range outside the saved file", (record) => { context(record, 1).range = [{ line: 9, column: 1 }, { line: 9, column: 2 }]; },
      "Resource access candidate 1 has a context range outside the saved file src/server.ts."],
    ["a site reference to a site that is not a resource call site", (record) => { candidate(record, 1).siteRef = `${sitesRef}#/sites/0`; },
      `Resource access candidate 1 names a source site that is not its saved site: ${sitesRef}#/sites/0.`],
    ["a gap of another kind", (record) => { (record.gaps[0] as Json).kind = "unknown-settings-value"; }, "Invalid resource access gap 0."],
    ["a completed record that leaves out a resource call site", (record) => { record.candidates = record.candidates.slice(0, 1); },
      `${named} leave out the resource call site ${sitesRef}#/sites/1 of their source sites.`],
  ])("refuses %s", (_name, change, message) => {
    expect(() => validateResourceCandidates(inputs(change))).toThrow(message);
  });

  test("refuses a reference to an artifact that is not a resource access candidates record", () => {
    expect(() => validateResourceCandidates(inputs(undefined, "launch")))
      .toThrow("The resource observations name launch as their resource access candidates, which is not a saved candidates record.");
  });
});
