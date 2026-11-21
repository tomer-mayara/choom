import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as tsMorph from "ts-morph";
import { collectEvidence, inspectionSummary, type IndexedFile, type QueryState, scopeFor } from "../../src/stage-5-query.ts";
import { makeScratch, removeScratch } from "../support/commands.ts";

// The Stage 5 syntax query on a checked run state. A published Stage 4 run has only
// JavaScript and TypeScript scan files that Stage 4 could read as UTF-8 text, so
// these skip reasons need a state that the command tests cannot make.
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const files: Record<string, string | Buffer> = {
  "app.ts": "register();\n",
  "latin1.js": Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]),
  "notes.md": "# Notes\n",
};

let scratch = "";

beforeEach(() => {
  scratch = makeScratch();
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(scratch, "snapshot", path)), { recursive: true });
    writeFileSync(join(scratch, "snapshot", path), text);
  }
});

afterEach(() => removeScratch(scratch));

// The checked state of a Stage 5 action whose one graph context scans every file,
// and whose code mapping leaves every file without an owner.
function stageState(): QueryState {
  const snapshot = join(scratch, "snapshot");
  const indexed = new Map<string, IndexedFile>(Object.entries(files).map(([path, text]) =>
    [path, { path, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }]));
  return {
    header: { formatVersion: 1, attemptId: "s5-check", runRef: "run-check", snapshotRef: "snapshot-check" }, indexed,
    snapshotRoot: snapshot,
    mapping: { units: [...indexed.values()].map(({ path, sha256: digest }) => ({ path, sha256: digest, roles: ["source"], owner: null })) },
    mappingRef: "s4-check-file@code-mapping.json",
    graph: { contexts: [{ id: "context", scanFiles: [...indexed.keys()], edges: [] }] },
    graphRef: "s4-check-file@graph-results.json",
    sourceSites: { sites: [] }, sourceSitesRef: "s4-check-file@source-sites.json",
    entryChain: [{ ref: "s4-check-entry-analysis", analysis: { candidates: [], reviewedFiles: [] } }],
    readIndexed: (path: string) => readFileSync(join(snapshot, path)),
  };
}

describe("the Stage 5 syntax query", () => {
  test("skips a scan file that is not JavaScript or TypeScript and a file that is not UTF-8 text, and parses the others", () => {
    const state = stageState();
    const versions = { tsMorph: "28.0.0", typescript: tsMorph.ts.version };
    const candidates = collectEvidence(state, scopeFor(state), { tsMorph, versions })["source-candidates.json"];
    const contextRefs = ["s4-check-file@graph-results.json#/contexts/0"];
    expect(candidates).toMatchObject({
      scope: [{ path: "app.ts", sha256: sha256(files["app.ts"] as string), contextRefs, parserDiagnostics: 0, omittedDiagnostics: 0 }],
      skipped: [{ path: "latin1.js", reason: "invalid-utf8" }, { path: "notes.md", reason: "not-js-ts" }],
      candidates: ["module-expression", "setup-or-registration-call"].map((kind) => expect.objectContaining({ path: "app.ts", kind })),
      diagnostics: [], omissions: [],
    });
  });
});

describe("the Stage 5 inspection summary", () => {
  test("counts each file once, using the selected range before historical ranges", () => {
    const ranges = [{ lines: [1, 2] }, { lines: [4, 5] }];
    const summary = inspectionSummary([
      { owner: "cli", current: { ranges }, historicalRanges: ranges },
      { owner: null, current: { ranges: [] }, historicalRanges: ranges },
    ], "coverage", "remaining");
    expect(summary).toContain("| Proposed owner | 1 | 0 | 0 |");
    expect(summary).toContain("| Unknown owner | 0 | 1 | 0 |");
    expect(summary).toContain("Earlier entry analyses only | No range in entry-analysis history");
    expect(summary).toContain("Stage 1 role reviews are recorded separately.");
  });

  test("includes both ownership groups for an empty mapping", () => {
    const summary = inspectionSummary([], "coverage", "remaining");
    expect(summary).toContain("| Proposed owner | 0 | 0 | 0 |");
    expect(summary).toContain("| Unknown owner | 0 | 0 | 0 |");
  });
});
