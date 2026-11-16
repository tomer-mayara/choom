import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { validateBehaviorCandidates } from "../../src/record-behavior-candidates.ts";
import type { CandidateInputs } from "../../src/record-candidates.ts";
import type { Artifact, Fields } from "../../src/record-checks.ts";
import { rangeIn } from "../support/source-ranges.ts";

// The check of the behavior entry candidates that a selected entry analysis names:
// the record that Stage 4 collect saved, its rule list, and each candidate and gap
// located in the saved snapshot file that it names.
type Json = Record<string, unknown>;
type Change = (record: Json & { candidates: Json[]; gaps: Json[] }) => void;

const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
const snapshotRef = "snap";
const candidatesRef = "s4-x-file@behavior-entry-candidates.json";
const rulesRef = "s4-x-file@behavior-entry-rules.yaml";
const server = "import express from 'express';\nconst app = express();\napp.get('/orders', list);\n" +
  "function list() {\n  return 'orders';\n}\n";
// A byte order mark and CRLF line ends: ranges count neither the mark nor a CR as a column.
const config = "\uFEFFexport default {\r\n  build: { rollupOptions: { input: page } },\r\n};\r\n";
const files: Record<string, string> = { "src/server.ts": server, "vite.config.ts": config };
const rules = { formatVersion: 1, rules: [{ id: "express-route-get", version: 1, entryKind: "http-route" },
  { id: "vite-build-input", version: 1, entryKind: "frontend-entry" }] };
const site = (path: string, at: string): Json => {
  const text = files[path] ?? "";
  return { path, sha256: sha256(text), range: rangeIn(text.replace("\uFEFF", ""), at),
    expression: at.slice(at.indexOf("«") + 1, at.indexOf("»")), truncated: false };
};

function record(): Json & { candidates: Json[]; gaps: Json[] } {
  return { formatVersion: 1, attemptId: "s4-x", snapshotRef, status: "completed", rulesRef, rulesSha256: sha256(JSON.stringify(rules)),
    settingsRef: "settings-001", rolesRef: "review-001", omittedCandidates: 0, notes: ["A candidate is not a proven entry."],
    candidates: [{ ruleId: "express-route-get", ruleVersion: 1, entryKind: "http-route", found: "syntax-rule", role: "unknown",
      roleRef: null, ...site("src/server.ts", "«app.get('/orders', list)»"), name: "/orders", nameReason: null,
      handler: { path: "src/server.ts", range: rangeIn(server, "function list() {\n  return 'orders';\n}") }, handlerReason: null }],
    gaps: [{ kind: "unknown-settings-value", ruleId: "vite-build-input", ruleVersion: 1, entryKind: "frontend-entry",
      ...site("vite.config.ts", "input: «page»"), reason: "The value at the property path is not a string literal." },
    { kind: "missing-compiler-input", input: "types", missing: "node", subjectRefs: ["tsconfig.json"], reason: "Missing types." }] };
}

function inputs(change: Change = () => {}, ref: unknown = candidatesRef): CandidateInputs {
  const value = record();
  change(value);
  const artifacts = new Map<string, Artifact>();
  for (const [id, path, saved] of [[candidatesRef, "evidence/s4-x/behavior-entry-candidates.json", value],
    [rulesRef, "evidence/s4-x/behavior-entry-rules.yaml", rules], ["launch", "evidence/launch.json", { cli: "serve" }]] as const) {
    const bytes = Buffer.from(JSON.stringify(saved));
    artifacts.set(id, { path, bytes, sha256: sha256(bytes) });
  }
  const indexed = new Map<unknown, Fields>(Object.entries(files).map(([path, text]) =>
    [path, { path, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }]));
  return { ref, snapshotRef, artifacts, indexed, document: (id) => JSON.parse(String(artifacts.get(id as string)?.bytes)) as unknown,
    readSource: (path) => Buffer.from(files[path] ?? "") };
}

const candidate = (value: Parameters<Change>[0]): Json => value.candidates[0] as Json;

describe("validateBehaviorCandidates", () => {
  test("accepts candidates and gaps that lie in the saved files, and counts the candidates", () => {
    expect(validateBehaviorCandidates(inputs())).toBe(1);
  });

  test("accepts a truncated expression that starts the saved text of its range", () => {
    expect(validateBehaviorCandidates(inputs((value) => Object.assign(candidate(value), { expression: "app.get(", truncated: true }))))
      .toBe(1);
  });

  test.each<[string, Change, string]>([
    ["a record of another snapshot", (value) => { value.snapshotRef = "other"; },
      "The behavior entry candidates s4-x-file@behavior-entry-candidates.json are not a record of this snapshot."],
    ["a rule list digest that differs from the saved list", (value) => { value.rulesSha256 = sha256("other"); },
      "The behavior entry candidates s4-x-file@behavior-entry-candidates.json do not name their saved rule list."],
    ["a completed status with omitted candidates", (value) => { value.omittedCandidates = 1; },
      "The behavior entry candidates s4-x-file@behavior-entry-candidates.json are not a record of this snapshot."],
    ["a candidate of a rule version that the list does not hold", (value) => { candidate(value).ruleVersion = 2; },
      "Invalid behavior entry candidate 0."],
    ["a candidate that a review found", (value) => { candidate(value).found = "review"; }, "Invalid behavior entry candidate 0."],
    ["a test role without its role record", (value) => { candidate(value).role = "test"; }, "Invalid behavior entry candidate 0."],
    ["a candidate with another field", (value) => { candidate(value).componentRef = "http"; }, "Invalid behavior entry candidate 0."],
    ["a null name without a reason", (value) => { candidate(value).name = null; }, "Invalid behavior entry candidate 0."],
    ["a name with a reason", (value) => { candidate(value).nameReason = "Computed."; }, "Invalid behavior entry candidate 0."],
    ["a null handler without a reason", (value) => { candidate(value).handler = null; }, "Invalid behavior entry candidate 0."],
    ["a path outside the inventory", (value) => { candidate(value).path = "src/missing.ts"; },
      "Behavior entry candidate 0 names a file that is not in the saved inventory: src/missing.ts."],
    ["a digest other than the inventory digest", (value) => { candidate(value).sha256 = sha256("other"); },
      "Behavior entry candidate 0 names a file that is not in the saved inventory: src/server.ts."],
    ["a range that ends after its line", (value) => { candidate(value).range = [{ line: 3, column: 1 }, { line: 3, column: 40 }]; },
      "Behavior entry candidate 0 has a range outside the saved file src/server.ts."],
    ["a range on a line that the file does not have", (value) => {
      candidate(value).range = [{ line: 9, column: 1 }, { line: 9, column: 2 }]; },
    "Behavior entry candidate 0 has a range outside the saved file src/server.ts."],
    ["a range whose end comes before its start", (value) => { candidate(value).range = [{ line: 3, column: 5 }, { line: 3, column: 1 }]; },
      "Behavior entry candidate 0 has a range outside the saved file src/server.ts."],
    ["an expression that differs from the saved text", (value) => { candidate(value).expression = "app.post('/orders', list)"; },
      "Behavior entry candidate 0 differs from the saved text at its range."],
    ["a handler range outside the saved file", (value) => {
      candidate(value).handler = { path: "src/server.ts", range: [{ line: 4, column: 1 }, { line: 8, column: 1 }] }; },
    "Behavior entry candidate 0 has a handler range outside the saved file src/server.ts."],
    ["a settings gap that differs from the saved text", (value) => { (value.gaps[0] as Json).expression = "pages"; },
      "Behavior entry gap 0 differs from the saved text at its range."],
    ["a gap of an unknown kind", (value) => { (value.gaps[1] as Json).kind = "other"; }, "Invalid behavior entry gap 1."],
  ])("refuses %s", (_name, change, message) => {
    expect(() => validateBehaviorCandidates(inputs(change))).toThrow(message);
  });

  test.each([
    ["an artifact that is not a candidates record", "launch"],
    ["an artifact that the run does not register", "s4-x-file@missing.json"],
  ])("refuses a reference to %s", (_name, ref) => {
    expect(() => validateBehaviorCandidates(inputs(undefined, ref)))
      .toThrow(`The entry analysis names ${ref} as its behavior entry candidates, which is not a saved candidates record.`);
  });
});
