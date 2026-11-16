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
const packageText = "{\n  \"bin\": { \"run\": \"bin/cli.js\", \"tool\": \"dist/tool.js\" }\n}\n";
const cli = "#!/usr/bin/env node\nconsole.log('run');\n";
const page = "export default function Page() {\n  return null;\n}\n";
const files: Record<string, string> = { "src/server.ts": server, "vite.config.ts": config, "package.json": packageText,
  "bin/cli.js": cli, "app/page.tsx": page };
// The Stage 2 preflight record that the Knip receipts name, with one copied plugin pattern.
const preflightRef = "s2-x-preflight";
const copied = { workspace: ".", manifest: "package.json", plugin: "next", dependency: "next", field: "production",
  pattern: "app/**/page.tsx!" };
const rules = { formatVersion: 1, rules: [{ id: "express-route-get", version: 1, entryKind: "http-route" },
  { id: "vite-build-input", version: 1, entryKind: "frontend-entry" },
  { id: "package-bin", version: 1, library: "npm", entryKind: "cli-bin", kind: "package-bin" }] };
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
    [rulesRef, "evidence/s4-x/behavior-entry-rules.yaml", rules], ["launch", "evidence/launch.json", { cli: "serve" }],
    [preflightRef, "evidence/s2-x/preflight.json", { pluginEntryPatterns: [copied] }]] as const) {
    const bytes = Buffer.from(JSON.stringify(saved));
    artifacts.set(id, { path, bytes, sha256: sha256(bytes) });
  }
  const indexed = new Map<unknown, Fields>(Object.entries(files).map(([path, text]) =>
    [path, { path, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }]));
  return { ref, snapshotRef, artifacts, indexed, document: (id) => JSON.parse(String(artifacts.get(id as string)?.bytes)) as unknown,
    readSource: (path) => Buffer.from(files[path] ?? "") };
}

const candidate = (value: Parameters<Change>[0]): Json => value.candidates[0] as Json;
// A candidate of the package-bin rule, whose handler names the whole file that the command runs with its evidence.
const binCandidate = (at: string, name: string, handler: Json | null, handlerReason: string | null = null): Json =>
  ({ ruleId: "package-bin", ruleVersion: 1, entryKind: "cli-bin", found: "syntax-rule", role: "unknown", roleRef: null,
    ...site("package.json", at), name, nameReason: null, handler, handlerReason });
const runCommand = (): Json => binCandidate("\"run\": «\"bin/cli.js\"»", "run", { path: "bin/cli.js", range: rangeIn(cli, cli),
  evidence: { kind: "snapshot-file", binFile: "bin/cli.js" } });
const toolCommand = (): Json => binCandidate("\"tool\": «\"dist/tool.js\"»", "tool", { path: "src/server.ts",
  range: rangeIn(server, server), evidence: { kind: "compiler-output", binFile: "dist/tool.js",
    compilerSettingsRef: "settings-001#/configs/0", outDir: "dist", rootDir: "src" } });
// The evidence of the handler of a candidate: 1 for the run command, 2 for the tool command.
const evidence = (value: Parameters<Change>[0], index = 1): Json => ((value.candidates[index] as Json).handler as Json).evidence as Json;
const withBins = (change: Change = () => {}): CandidateInputs => inputs((value) => {
  value.candidates.push(runCommand(), toolCommand());
  change(value);
});

describe("validateBehaviorCandidates", () => {
  test("accepts candidates and gaps that lie in the saved files, and counts the candidates", () => {
    expect(validateBehaviorCandidates(inputs(), preflightRef)).toBe(1);
  });

  test("accepts a truncated expression that starts the saved text of its range", () => {
    expect(validateBehaviorCandidates(inputs((value) => Object.assign(candidate(value), { expression: "app.get(", truncated: true })),
      preflightRef)).toBe(1);
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
    expect(() => validateBehaviorCandidates(inputs(change), preflightRef)).toThrow(message);
  });

  test.each([
    ["an artifact that is not a candidates record", "launch"],
    ["an artifact that the run does not register", "s4-x-file@missing.json"],
  ])("refuses a reference to %s", (_name, ref) => {
    expect(() => validateBehaviorCandidates(inputs(undefined, ref), preflightRef))
      .toThrow(`The entry analysis names ${ref} as its behavior entry candidates, which is not a saved candidates record.`);
  });
});

// The handler of a package-bin candidate also names its evidence: the snapshot holds the
// bin file, or a configuration of the settings record compiles the source file to it.
describe("validateBehaviorCandidates with the candidates of a package-bin rule", () => {
  test("accepts a handler with the evidence of the bin file or of the compiler output, and a null handler with a reason", () => {
    expect(validateBehaviorCandidates(withBins(), preflightRef)).toBe(3);
    expect(validateBehaviorCandidates(withBins((value) => {
      Object.assign(value.candidates[2] as Json, { handler: null, handlerReason: "No evidence names the file." });
    }), preflightRef)).toBe(3);
  });

  test.each<[string, Change]>([
    ["a handler without its evidence", (value) => { delete ((value.candidates[1] as Json).handler as Json).evidence; }],
    ["evidence of an unknown kind", (value) => { evidence(value).kind = "guess"; }],
    ["evidence of the bin file that names another file", (value) => { evidence(value).binFile = "bin/other.js"; }],
    ["compiler output evidence without its configuration", (value) => { delete evidence(value, 2).compilerSettingsRef; }],
    ["evidence with another field", (value) => { evidence(value).reason = "Seen."; }],
    ["evidence in the handler of a call candidate", (value) => {
      Object.assign(candidate(value).handler as Json, { evidence: { kind: "snapshot-file", binFile: "src/server.ts" } }); }],
  ])("refuses %s", (_name, change) => {
    expect(() => validateBehaviorCandidates(withBins(change), preflightRef)).toThrow(/^Invalid behavior entry candidate [0-2]\.$/);
  });
});

// A file that a copied Knip plugin pattern of the Stage 2 profile selected, after the syntax-rule candidate.
describe("validateBehaviorCandidates with a Knip plugin pattern candidate", () => {
  const withPattern = (change: (item: Json) => void = () => {}): Change => (value) => {
    const item: Json = { found: "knip-plugin-pattern", role: "unknown", roleRef: null, path: "app/page.tsx", sha256: sha256(page),
      ...copied, patternRef: preflightRef + "#/pluginEntryPatterns/0" };
    change(item);
    value.candidates.push(item);
  };

  test("accepts a candidate whose source is the copied pattern that patternRef names", () => {
    expect(validateBehaviorCandidates(inputs(withPattern()), preflightRef)).toBe(2);
    expect(validateBehaviorCandidates(inputs(withPattern((item) => Object.assign(item,
      { role: "test", roleRef: "review-001#/roles/0" }))), preflightRef)).toBe(2);
  });

  test.each<[string, (item: Json) => void, string]>([
    ["a pattern of another record", (item) => { item.patternRef = "s2-y-preflight#/pluginEntryPatterns/0"; },
      "Invalid behavior entry candidate 1."],
    ["a pattern that the record does not hold", (item) => { item.patternRef = preflightRef + "#/pluginEntryPatterns/1"; },
      "Invalid behavior entry candidate 1."],
    ["a plugin other than the plugin of the pattern", (item) => { item.plugin = "vitest"; }, "Invalid behavior entry candidate 1."],
    ["a pattern other than the copied pattern", (item) => { item.pattern = "app/**/*.tsx!"; }, "Invalid behavior entry candidate 1."],
    ["a candidate with another field", (item) => { item.range = []; }, "Invalid behavior entry candidate 1."],
    ["a test role without its role record", (item) => { item.role = "test"; }, "Invalid behavior entry candidate 1."],
    ["a path outside the inventory", (item) => { item.path = "app/missing.tsx"; },
      "Behavior entry candidate 1 names a file that is not in the saved inventory: app/missing.tsx."],
    ["a digest other than the inventory digest", (item) => { item.sha256 = sha256("other"); },
      "Behavior entry candidate 1 names a file that is not in the saved inventory: app/page.tsx."],
  ])("refuses %s", (_name, change, message) => {
    expect(() => validateBehaviorCandidates(inputs(withPattern(change)), preflightRef)).toThrow(message);
  });

  test("refuses the candidate when the Knip receipts name no registered preflight record", () => {
    expect(() => validateBehaviorCandidates(inputs(withPattern()), "s2-x-missing")).toThrow("Invalid behavior entry candidate 1.");
  });
});
