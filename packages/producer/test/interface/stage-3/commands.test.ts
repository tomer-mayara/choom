import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ts } from "ts-morph";
import { parse, stringify } from "yaml";
import { type CommandResult, makeScratch, removeScratch, runCli, toolsRoot } from "../../support/commands.ts";
import { type SnapshotFile, stagedRun, stagedSnapshotRef as snapshotRef } from "../../support/staged-run.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";

// The Stage 3 helper on a run after Stage 2 whose two Knip modes completed with
// reports: start, collect, excerpt and save-review, with the files that each
// action saves and the messages of its refusals.
type Json = Record<string, unknown>;
interface Run { artifacts: Record<string, { path: string; sha256: string }> }

const id = "s3-check";
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const generated = Array.from({ length: 16 }, (_, index) => `gen/file-${String(index + 1).padStart(2, "0")}.js`);
const app = "import { helper } from './lib/helper.ts';\nexport const value = helper(1);\n" +
  "const plugin = await import('./plugins/' + process.env.NAME);\n";
const job = "new Worker(new URL('./job.mjs', import.meta.url));\nspawn('node', ['job.mjs']);\n";
const helper = "export function helper(n: number): number {\n  return n;\n}\nexport type Unused = string;\n";
const required = "module.exports = require('x');\n";
const snapshot: SnapshotFile[] = [
  { path: "app.ts", text: app },
  { path: "broken.ts", text: "export const = 1;\n" },
  { path: "data/large.txt", text: "x".repeat(2 * 1024 * 1024 + 1) },
  { path: "data/latin1.txt", text: Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]) },
  { path: "empty.ts", text: "" },
  ...generated.map((path) => ({ path, text: required })),
  { path: "jobs/start.mjs", text: job },
  { path: "lib/helper.ts", text: helper },
  { path: "link.ts", text: "", kind: "symlink" },
];
const candidates = ["app.ts", "data/large.txt", "data/latin1.txt", "empty.ts", "link.ts", null]
  .map((path, index) => ({ id: `s2-check-candidate-00${index + 1}`, path }));
const issues = {
  normal: [{ file: "lib/helper.ts", exports: [{ name: "helper" }], types: [{ name: "Unused" }] }],
  production: [{ file: "lib/helper.ts", exports: [{ name: "helper" }] }, { file: "gone.ts", exports: [{ name: "gone" }] }],
};
const reports = { normal: "s2-check-file@knip-normal.json", production: "s2-check-file@knip-production.json" };

// A run after Stage 2: by default the saved snapshot above, with Latin-1 bytes in
// data/latin1.txt, an entry analysis with candidates and two completed Knip runs
// with their reports.
function collectableRun(work: string, files: SnapshotFile[] = snapshot): void {
  stagedRun(work, 2, { snapshot: files });
  const run = parse(readFileSync(join(work, "run.yaml"), "utf8")) as Run;
  function save(path: string, bytes: string, ref: string): void {
    writeFileSync(join(work, path), bytes);
    run.artifacts[ref] = { path, sha256: sha256(bytes) };
  }
  const modes = ["normal", "production"] as const;
  for (const mode of modes)
    save(`evidence/s2-check/knip-${mode}.json`, JSON.stringify({ issues: issues[mode] }), reports[mode]);
  save("evidence/s2-check/knip-runs.json", JSON.stringify({ formatVersion: 1, snapshotRef, runs: modes.map((mode) =>
    ({ mode, status: "completed", exitCode: 1, stdout: `knip-${mode}.json`, report: { valid: true } })) }), "s2-check-knip-runs");
  save("evidence/s2-check/entry-analysis.yaml", stringify({ formatVersion: 1, kind: "entry-analysis", snapshotRef,
    planRef: "s2-check-entry-plan", knipRunsRef: "s2-check-knip-runs", candidates }), "s2-check-entry-analysis");
  writeFileSync(join(work, "run.yaml"), stringify(run));
}

let scratch = "";
let work = "";
const folder = (): string => join(work, "evidence", id);
const savedText = (name: string): string => readFileSync(join(folder(), name), "utf8");
const saved = (name: string): Json => JSON.parse(savedText(name)) as Json;
function stageThree(args: string[], runFolder = work, attemptId = id, settings: Record<string, string> = {}): CommandResult {
  return runCli(["stage-3", ...args], { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: runFolder, CHOOM_STAGE3_ID: attemptId, ...settings });
}
const results: Record<string, CommandResult> = {};

beforeAll(() => {
  scratch = makeScratch();
  work = join(scratch, "run");
  collectableRun(work);
  results.start = stageThree(["start"]);
  results.collect = stageThree(["collect"]);
});

afterAll(() => removeScratch(scratch));

function source(path: string, text: string): { path: string; sha256: string } {
  return { path, sha256: sha256(text) };
}

const scope = [source("app.ts", app), source("broken.ts", "export const = 1;\n"), source("empty.ts", ""),
  ...generated.map((path) => source(path, required)), source("jobs/start.mjs", job), source("lib/helper.ts", helper)];

const sharedLimits = ["Tool content reads and syntactic candidates only. They do not record LLM source review.",
  "Syntax only: the snapshot project parses each file without compiler settings. No binding, alias or type resolution, " +
    "config execution, or reachability analysis.",
  "Names can be shadowed. Computed expressions, templates and aliases are not resolved.",
  "Native code, excluded inputs and all files outside the recorded scope were outside the query.",
  "Parser recovery can affect matches in files with diagnostics. A completed no-match describes this query only."];

function mention(path: string, text: string, parentKind: string, line: number, columns: [number, number]): Json {
  return { ...source(path, text), nodeKind: "Identifier", parentKind,
    range: [{ line, column: columns[0] }, { line, column: columns[1] }] };
}

describe("Stage 3 start", () => {
  test("checks the run after Stage 2 and saves the checkpoints, the cookbook and the handoff", () => {
    expect(results.start).toEqual({ status: 0, stderr: "",
      stdout: `Saved ${id} for ${snapshotRef}. Verified 10 registered artifacts and indexed 23 regular-file records.\n` });
    const handoff = saved("handoff.json");
    expect(handoff).toMatchObject({ formatVersion: 1, attemptId: id, work, tools: toolsRoot, runRef: "run-check", snapshotRef,
      inventoryRef: "inventory-001", entryAnalysisRef: "s2-check-entry-analysis", planRef: "s2-check-entry-plan",
      knipRunsRef: "s2-check-knip-runs", registeredArtifacts: 10, indexedRegularFiles: 23,
      checkpointDigests: { "run.before.yaml": sha256(readFileSync(join(folder(), "run.before.yaml"))),
        "discovery.before.yaml": sha256(readFileSync(join(folder(), "discovery.before.yaml"))),
        "baseline.before.yaml": sha256(readFileSync(join(folder(), "baseline.before.yaml"))) },
      toolInputDigests: { "step-3-cookbook.md": sha256(readFileSync(join(folder(), "step-3-cookbook.md"))) } });
    const versions = handoff.versions as Json;
    expect(Object.keys(versions)).toEqual(["node", "tsMorph", "typescript", "ripgrep", "modules"]);
    // ts-morph brings the TypeScript that Stage 3 uses. Both are trusted tool files.
    const tsMorphPackage = JSON.parse(readFileSync(join(toolsRoot, "node_modules/ts-morph/package.json"), "utf8")) as Json;
    expect({ tsMorph: versions.tsMorph, typescript: versions.typescript })
      .toEqual({ tsMorph: tsMorphPackage.version, typescript: ts.version });
    expect(Object.keys(versions.modules as Json)).toEqual(expect.arrayContaining(["ts-morph/package.json",
      "ts-morph/dist/ts-morph.js", "@ts-morph/common/dist/ts-morph-common.js", "@ts-morph/common/dist/typescript.js"]));
    expect(readFileSync(join(folder(), "run.before.yaml")).equals(readFileSync(join(work, "run.yaml")))).toBe(true);
    expect(saved("operator-start.json")).toMatchObject({ formatVersion: 1, attemptId: id, action: "start", phase: "start",
      status: "completed", exitCode: 0, digests: Object.fromEntries(["run.before.yaml", "discovery.before.yaml",
        "baseline.before.yaml", "step-3-cookbook.md", "handoff.json"].map((name) => [name, sha256(readFileSync(join(folder(), name)))])) });
  });

  test("refuses an attempt ID that is in use, and writes nothing", () => {
    const before = readdirSync(folder()).sort();
    expect(stageThree(["start"])).toEqual({ status: 1, stdout: "", stderr: "Start from CHOOM_TOOLS with a fresh attempt ID.\n" });
    expect(readdirSync(folder()).sort()).toEqual(before);
  });

  test("refuses a run that has not finished Stage 2", () => {
    const stageOne = join(scratch, "stage-1-run");
    stagedRun(stageOne, 1);
    expect(stageThree(["start"], stageOne)).toEqual({ status: 1, stdout: "", stderr: "Expected a completed Stage 2 handoff.\n" });
    expect(existsSync(join(stageOne, "evidence", id))).toBe(false);
  });

  test.each([
    ["an attempt ID without the s3- prefix", "check", {}, "Set CHOOM_STAGE3_ID to an s3-... ID."],
    ["an attempt folder that does not match the ID", id, { CHOOM_STAGE3: "/tmp/other" }, "CHOOM_STAGE3 does not match the attempt."],
  ])("refuses %s before it reads the run", (_name, attemptId, settings, message) => {
    const before = readdirSync(join(work, "evidence")).sort();
    const result = stageThree(["start"], work, attemptId, settings);
    expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: "" });
    expect(result.stderr).toContain(message);
    expect(readdirSync(join(work, "evidence")).sort()).toEqual(before);
  });
});

describe("Stage 3 collect", () => {
  test("reports what it saved", () => {
    expect(results.collect).toEqual({ status: 0, stderr: "", stdout: "Parsed 21 files. Saved 20 loading candidates, " +
      "2 parser diagnostics, 3 symbol targets and 16 excerpts. 8 excerpt paths skipped.\n" });
  });

  test("saves the loading syntax search of every JavaScript and TypeScript file", () => {
    const loading = saved("loading-search.json");
    expect(Object.keys((loading.query as Json).versions as Json)).toEqual(["node", "tsMorph", "typescript", "ripgrep", "modules"]);
    const checked: Json = { ...loading, query: { ...(loading.query as Json), versions: "checked above" } };
    expect(checked).toEqual({
      formatVersion: 1, snapshotRef, scope, status: "completed", outcome: "matches",
      matches: [
        { ...source("app.ts", app), kind: "import-computed", lines: [3, 3], expression: "import('./plugins/' + process.env.NAME)", truncated: false },
        ...generated.map((path) => ({ ...source(path, required), kind: "require", lines: [1, 1], expression: "require('x')", truncated: false })),
        { ...source("jobs/start.mjs", job), kind: "new Worker", lines: [1, 1],
          expression: "new Worker(new URL('./job.mjs', import.meta.url))", truncated: false },
        { ...source("jobs/start.mjs", job), kind: "new URL", lines: [1, 1], expression: "new URL('./job.mjs', import.meta.url)", truncated: false },
        { ...source("jobs/start.mjs", job), kind: "spawn", lines: [2, 2], expression: "spawn('node', ['job.mjs'])", truncated: false },
      ],
      diagnostics: [1, 2].map((index) => ({ path: "broken.ts", code: 1134, at: { line: 1, column: 12 + 2 * index },
        message: "Variable declaration expected." })),
      limits: sharedLimits,
      query: { profile: "stage-3-loading-syntax-v3", parser: "ts-morph snapshot project (TypeScript parser, Latest)",
        selection: "all indexed regular files with a JavaScript or TypeScript source extension",
        extensions: "\\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$", maxExpressionCodeUnits: 4096, versions: "checked above",
        candidateKinds: ["import-literal", "import-computed", "require", "require.resolve", "import.meta.glob", "new Worker",
          "new SharedWorker", "new URL", "new Glob", "new Function", "spawn", "spawnSync", "exec", "execSync", "execFile",
          "execFileSync", ".scan", ".register", "eval"] },
    });
  });

  test("saves the identifier mentions of the exports and types that Knip reported", () => {
    expect(saved("symbol-mentions.json")).toEqual({ formatVersion: 1, snapshotRef, scope, knipRunsRef: "s2-check-knip-runs",
      status: "completed",
      reports: [{ mode: "normal", status: "completed", exitCode: 1, reportRef: reports.normal },
        { mode: "production", status: "completed", exitCode: 1, reportRef: reports.production }],
      maxMentionsPerTarget: 250, parserDiagnosticsRef: `${id}-file@loading-search.json`,
      limits: [...sharedLimits, "Identifier name matches include declarations and unrelated names. They do not establish " +
        "resolved references, file reachability, or proof of use.",
      "Only reported exports and types from completed modes are queried. Other issue categories are outside this query."],
      targets: [
        { reportedFile: "lib/helper.ts", name: "helper", issueKinds: ["exports"], reportRefs: [reports.normal, reports.production],
          mentions: [mention("app.ts", app, "ImportSpecifier", 1, [10, 16]), mention("app.ts", app, "CallExpression", 2, [22, 28]),
            mention("lib/helper.ts", helper, "FunctionDeclaration", 1, [17, 23])], mentionCount: 3, truncated: false },
        { reportedFile: "lib/helper.ts", name: "Unused", issueKinds: ["types"], reportRefs: [reports.normal],
          mentions: [mention("lib/helper.ts", helper, "TypeAliasDeclaration", 4, [13, 19])], mentionCount: 1, truncated: false },
        { reportedFile: "gone.ts", name: "gone", issueKinds: ["exports"], reportRefs: [reports.production],
          mentions: [], mentionCount: 0, truncated: false },
      ] });
  });

  test("saves the first lines of at most 20 focused paths and the reason for each skipped path", () => {
    const excerpt = (path: string, text: string, lines: string[]): Json => ({ id: `${id}-source-${encodeURIComponent(path)}`,
      snapshotRef, ...source(path, text), lines: [1, lines.length], excerpt: lines.map((line, index) => `${index + 1}: ${line}`)
        .join("\n"), totalLineCount: lines.length, truncated: false });
    const skipped = (path: string, reason: string): Json => ({ path, status: "skipped", reason });
    expect(saved("source-excerpts.json")).toEqual({ formatVersion: 1, snapshotRef,
      excerpts: [excerpt("app.ts", app, app.trimEnd().split("\n")),
        ...generated.slice(0, 15).map((path) => excerpt(path, required, [required.trimEnd()]))],
      missingPaths: [skipped("data/large.txt", "Excerpt source exceeds 2 MiB: data/large.txt"),
        skipped("data/latin1.txt", "The saved file is not UTF-8 text."),
        skipped("empty.ts", "Empty file or no line fits the initial excerpt byte limit."),
        skipped("link.ts", "Not an indexed regular file."),
        ...["gen/file-16.js", "jobs/start.mjs", "lib/helper.ts", "gone.ts"].map((path) => skipped(path, "Initial excerpt limit of 20 paths."))],
      limits: ["First 200 lines per indexed path, up to 100 KiB of numbered text from a UTF-8 file of at most 2 MiB. " +
        "Saving an excerpt records a tool read only.", "At most 20 initial paths, in entry-candidate, loading-match, " +
        "then reported-symbol order. Other paths require an excerpt request."] });
  });

  test("fills the review prompt and proposes artifact IDs for the saved evidence", () => {
    const prompt = savedText("review-prompt.md");
    expect(prompt).toContain("GET /health registered in");
    expect(prompt).toContain("context and sourceRef");
    expect(prompt).toContain(id + "-file@loading-search.json#/matches/N");
    expect(prompt).toStartWith("Review Choom Appendix A, stage 3: check loading gaps and set inspection priorities.\n");
    for (const line of [`Work folder: ${work}`, `Attempt folder: ${folder()}`, `Attempt ID: ${id}`,
      "Previous entry-analysis artifact: s2-check-entry-analysis", `Give a materially\nrevised or new candidate a new ID beginning with ${id}-.`])
      expect(prompt).toContain(line);
    expect(prompt).not.toContain("{{");
    const names = ["run.before.yaml", "discovery.before.yaml", "baseline.before.yaml", "step-3-cookbook.md", "handoff.json",
      "operator-start.json", "operator-start.started.json", "operator-start.stdout.txt", "operator-start.stderr.txt",
      "operator-collect.started.json", "loading-search.json", "symbol-mentions.json", "source-excerpts.json", "review-prompt.md"];
    expect(saved("artifact-map.json")).toEqual({ formatVersion: 1, attemptId: id, snapshotRef, status: "proposed",
      limits: ["Proposed IDs for immutable evidence available to the review.", "The map omits the mutable command log, itself, and later files."],
      artifacts: Object.fromEntries(names.map((name) => [`${id}-file@${encodeURIComponent(name)}`,
        { path: `evidence/${id}/${name}`, sha256: sha256(readFileSync(join(folder(), name))) }])) });
    const outputs = ["loading-search.json", "symbol-mentions.json", "source-excerpts.json", "review-prompt.md", "artifact-map.json"];
    expect(saved("operator-collect.json")).toMatchObject({ formatVersion: 1, attemptId: id, action: "collect", phase: "collect",
      status: "completed", exitCode: 0, digests: Object.fromEntries(outputs.map((name) => [name, sha256(readFileSync(join(folder(), name)))])) });
  });
});

describe("Stage 3 excerpt, collect again and save-review", () => {
  // The actions run in order: each excerpt request takes the next sequence number, also when it fails.
  test("saves a requested range, records each refused request, and refuses a second collect and save-review", () => {
    const first = stageThree(["excerpt", "lib/helper.ts", "2", "3"]);
    const path = join(folder(), "excerpt-001.json");
    expect(first).toEqual({ status: 0, stderr: "",
      stdout: `Saved ${id}-file@excerpt-001.json at ${path} (SHA-256 ${sha256(readFileSync(path))}).\n` });
    expect(saved("excerpt-001.json")).toEqual({ formatVersion: 1, id: `${id}-source-excerpt-001`, snapshotRef,
      ...source("lib/helper.ts", helper), lines: [2, 3], excerpt: "2:   return n;\n3: }", totalLineCount: 4, truncated: true,
      limit: "Saving an excerpt records a tool read only." });
    expect(saved("operator-excerpt-001.json")).toMatchObject({ action: "excerpt", phase: "excerpt-001", status: "completed",
      exitCode: 0, digests: { "excerpt-001.json": sha256(readFileSync(path)) } });
    const refusals: [string[], string][] = [
      [["lib/helper.ts", "1", "301"], "Use an inclusive range of at most 300 lines."],
      [["lib/helper.ts", "0", "1"], "Use an inclusive range of at most 300 lines."],
      [["missing.ts", "1", "1"], "Path is outside the indexed regular files: missing.ts"],
      [["link.ts", "1", "1"], "Path is outside the indexed regular files: link.ts"],
      [["lib/helper.ts", "1", "5"], "Requested lines exceed the indexed file: lib/helper.ts"],
      [["data/large.txt", "1", "1"], "Excerpt source exceeds 2 MiB: data/large.txt"],
      [["data/latin1.txt", "1", "1"], "The encoded data was not valid for encoding utf-8"],
    ];
    for (const [index, [args, message]] of refusals.entries()) {
      const phase = `excerpt-${String(index + 2).padStart(3, "0")}`;
      expect({ args, result: stageThree(["excerpt", ...args]) }).toEqual({ args, result: { status: 1, stdout: "", stderr: message + "\n" } });
      expect(saved(`operator-${phase}.json`)).toMatchObject({ phase, status: "failed", exitCode: 1, digests: {} });
      expect(existsSync(join(folder(), `${phase}.json`))).toBe(false);
    }
    expect(stageThree(["collect"])).toEqual({ status: 1, stdout: "",
      stderr: `EEXIST: file already exists, open '${join(folder(), "operator-collect.started.json")}'\n` });
    const inside = join(work, "review");
    mkdirSync(inside);
    expect(stageThree(["save-review", inside])).toEqual({ status: 1, stdout: "", stderr: "Keep the review packet outside the saved run.\n" });
    expect(saved("operator-save-review.json")).toMatchObject({ status: "failed", exitCode: 1, digests: {} });
    const log = savedText("commands.md").split("\n```json\n").slice(1).map((entry) => JSON.parse(entry.split("\n")[0] ?? "") as Json);
    expect(log.map(({ phase, status }) => `${String(phase)} ${String(status)}`)).toEqual(["start completed", "collect completed",
      "excerpt-001 completed", ...refusals.map((_, index) => `excerpt-${String(index + 2).padStart(3, "0")} failed`),
      "save-review failed"]);
  }, 60_000);

  test("refuses an action after a working draft changed, with a failed receipt", () => {
    const other = join(scratch, "changed-run");
    collectableRun(other);
    expect(stageThree(["start"], other, "s3-changed").status).toBe(0);
    appendFileSync(join(other, "run.yaml"), "# A later change.\n");
    expect(stageThree(["excerpt", "app.ts", "1", "1"], other, "s3-changed")).toEqual({ status: 1, stdout: "",
      stderr: "Work, snapshot, checkpoints or trusted tools changed since start.\n" });
    const receipt = JSON.parse(readFileSync(join(other, "evidence/s3-changed/operator-excerpt-001.json"), "utf8")) as Json;
    expect(receipt).toMatchObject({ status: "failed", exitCode: 1, digests: {} });
  }, 60_000);
});

describe("Stage 3 collect of other source forms", () => {
  // A file that starts with a byte order mark, JSX in .jsx and .tsx files, the
  // CommonJS and ES module extensions and a declaration file.
  const bom = "﻿import { helper } from './lib/helper.ts';\nexport const value = helper(1);\n";
  const forms: SnapshotFile[] = [
    { path: "bom.ts", text: bom },
    { path: "legacy.cts", text: "const fs = require('node:fs');\n" },
    { path: "lib/helper.ts", text: helper },
    { path: "module.mts", text: "export const pages = import.meta.glob('./pages/*.ts');\n" },
    { path: "page.tsx", text: "export const Page = () => <main>{import('./chart.tsx')}</main>;\n" },
    { path: "types.d.ts", text: "declare function helper(n: number): number;\n" },
    { path: "view.jsx", text: "export const View = () => <div>{require('./style.css')}</div>;\n" },
  ];
  const text = (path: string): string => String(forms.find((file) => file.path === path)?.text);
  const found = (path: string, kind: string, expression: string): Json =>
    ({ ...source(path, text(path)), kind, lines: [1, 1], expression, truncated: false });

  // Starts an attempt on a new run of the files and runs collect.
  function collected(name: string, files: SnapshotFile[], change: (root: string) => void = () => {}): CommandResult {
    const run = join(scratch, name);
    collectableRun(run, files);
    expect(stageThree(["start"], run, "s3-forms").status).toBe(0);
    change(join(run, "snapshot"));
    return stageThree(["collect"], run, "s3-forms");
  }

  test("saves the loading matches and identifier mentions of each source form", () => {
    expect(collected("forms-run", forms)).toMatchObject({ status: 0, stderr: "" });
    const attempt = (name: string): Json =>
      JSON.parse(readFileSync(join(scratch, "forms-run/evidence/s3-forms", name), "utf8")) as Json;
    const loading = attempt("loading-search.json");
    expect({ matches: loading.matches, diagnostics: loading.diagnostics }).toEqual({ diagnostics: [], matches: [
      found("legacy.cts", "require", "require('node:fs')"), found("module.mts", "import.meta.glob", "import.meta.glob('./pages/*.ts')"),
      found("page.tsx", "import-literal", "import('./chart.tsx')"), found("view.jsx", "require", "require('./style.css')")] });
    // The snapshot project leaves the byte order mark out of the text, so the columns of line 1 do not count it.
    const targets = (attempt("symbol-mentions.json").targets as Json[]).map(({ name, mentions }) => ({ name, mentions }));
    expect(targets).toEqual([
      { name: "helper", mentions: [mention("bom.ts", bom, "ImportSpecifier", 1, [10, 16]), mention("bom.ts", bom, "CallExpression", 2, [22, 28]),
        mention("lib/helper.ts", helper, "FunctionDeclaration", 1, [17, 23]),
        mention("types.d.ts", text("types.d.ts"), "FunctionDeclaration", 1, [18, 24])] },
      { name: "Unused", mentions: [mention("lib/helper.ts", helper, "TypeAliasDeclaration", 4, [13, 19])] },
      { name: "gone", mentions: [] },
    ]);
  }, 60_000);

  test.each([
    ["a source file that is not UTF-8 text", [...forms, { path: "latin1.js", text: Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]) }],
      () => {}, "The encoded data was not valid for encoding utf-8"],
    ["an indexed source file that changed after start", forms,
      (root: string) => writeFileSync(join(root, "lib/helper.ts"), helper.replace("number", "bigint")),
      "Snapshot integrity check failed: lib/helper.ts"],
  ])("stops at %s, with a failed receipt and no saved search", (name, files, change, message) => {
    const run = name.replaceAll(" ", "-");
    expect(collected(run, files, change)).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
    const attempt = join(scratch, run, "evidence/s3-forms");
    expect(JSON.parse(readFileSync(join(attempt, "operator-collect.json"), "utf8")) as Json)
      .toMatchObject({ status: "failed", exitCode: 1, digests: {} });
    expect(existsSync(join(attempt, "loading-search.json"))).toBe(false);
  }, 60_000);
});

describe("Stage 3 trusted tools", () => {
  test.each([
    ["ts-morph", "node_modules/ts-morph/dist/ts-morph.js"],
    ["the TypeScript of ts-morph", "node_modules/@ts-morph/common/dist/typescript.js"],
  ])("refuse a later action after %s changed in the tool checkout", (name, file) => {
    const base = join(scratch, name.replaceAll(" ", "-"));
    mkdirSync(base);
    const tools = copyToolCheckout(base);
    const run = join(base, "run");
    stagedRun(run, 2, { tools });
    const settings = { CHOOM_TOOLS: tools, CHOOM_WORK: run, CHOOM_STAGE3_ID: "s3-tools" };
    expect(runCli(["stage-3", "start"], settings, tools)).toMatchObject({ status: 0, stderr: "" });
    appendFileSync(join(tools, file), "\n// A later change.\n");
    expect(runCli(["stage-3", "excerpt", "app.ts", "1", "1"], settings, tools)).toEqual({ status: 1, stdout: "",
      stderr: "Work, snapshot, checkpoints or trusted tools changed since start.\n" });
  }, 60_000);
});
