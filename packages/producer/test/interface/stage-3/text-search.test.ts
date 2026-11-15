import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { rgPath } from "@vscode/ripgrep";
import { parse, stringify } from "yaml";
import { captureExclusionRules, defaultCaptureExclusions } from "../../../src/stage-1-exclusions.ts";
import { textSearchNotes } from "../../../src/stage-3-text-search.ts";
import { type CommandResult, makeScratch, removeScratch, runCli, toolsRoot } from "../../support/commands.ts";
import { type SnapshotFile, stagedRun, stagedSnapshotRef as snapshotRef } from "../../support/staged-run.ts";

// The Stage 3 text search through the command line, with the real ripgrep of
// this checkout, on a run after Stage 2. Each test starts its own attempt.
type Json = Record<string, unknown>;
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const script = "scripts/worker.mjs";
const snapshot: SnapshotFile[] = [
  { path: ".config/deploy.yml", text: `worker: ${script}\n` },
  { path: ".gitignore", text: "ignored.txt\n.config/\n" },
  { path: "README.md", text: `Run \`node ${script}\` to start the worker.\n` },
  { path: "app.ts", text: "export const value = 1;\n" },
  { path: "archive.txt.gz", text: gzipSync(`${script} in a compressed file\n`) },
  { path: "binary.bin", text: `${script}\0binary\n` },
  { path: "deploy/worker.yaml", text: `services:\n  worker:\n    command: node ${script}\n` },
  { path: "ignored.txt", text: `${script} in a file that .gitignore names\n` },
  { path: "link.txt", text: "", kind: "symlink" },
  { path: "many.txt", text: Array.from({ length: 25 }, (_, index) => `worker ${index + 1}\n`).join("") },
  { path: script, text: "console.log('Working');\n" },
];
const regularFiles = snapshot.filter(({ kind }) => kind !== "symlink").length;
const file = (path: string): SnapshotFile => snapshot.find((item) => item.path === path) as SnapshotFile;
const found = (path: string, line: number, text: string): Json =>
  ({ path, sha256: sha256(file(path).text), line, text, truncated: false, validUtf8: true });

let scratch = "";

// A run after Stage 2 with the snapshot above and a real link from link.txt to a file outside the snapshot.
function searchableRun(name: string, change: (work: string) => void = () => {}): string {
  const work = join(scratch, name);
  stagedRun(work, 2, { snapshot });
  writeFileSync(join(scratch, `${name}-outside.txt`), `${script} outside the snapshot\n`);
  symlinkSync(join(scratch, `${name}-outside.txt`), join(work, "snapshot/link.txt"));
  change(work);
  return work;
}

function stageThree(work: string, id: string, args: string[]): CommandResult {
  return runCli(["stage-3", ...args], { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE3_ID: id });
}

// Starts a new attempt and returns a function that runs a text search in it.
function started(work: string, id: string): (...args: string[]) => CommandResult {
  const start = stageThree(work, id, ["start"]);
  if (start.status !== 0) throw new Error(`Stage 3 start failed: ${start.stderr}`);
  return (...args) => stageThree(work, id, ["text-search", ...args]);
}

const saved = (work: string, id: string, name: string): Json =>
  JSON.parse(readFileSync(join(work, "evidence", id, name), "utf8")) as Json;

let work = "";

beforeAll(() => {
  scratch = makeScratch();
  work = searchableRun("run");
});

afterAll(() => removeScratch(scratch));

describe("Stage 3 text-search", () => {
  test("saves the tool-call record of a search, its raw output and its receipt", () => {
    const search = started(work, "s3-match");
    const result = search(script);
    const folder = join(work, "evidence/s3-match");
    const name = join(folder, "text-search-001.json");
    expect(result).toEqual({ status: 0, stderr: "", stdout: `Saved s3-match-file@text-search-001.json at ${name} ` +
      `(SHA-256 ${sha256(readFileSync(name))}). Outcome: match. ripgrep searched ${regularFiles} files.\n` });
    const root = join(work, "snapshot");
    const stdout = readFileSync(join(folder, "text-search-001.stdout.jsonl"));
    const tool = { version: "ripgrep 15.0.0 (rev 3a612f88b8)", program: relative(join(toolsRoot, "node_modules"), rgPath),
      sha256: sha256(readFileSync(rgPath)) };
    expect(saved(work, "s3-match", "text-search-001.json")).toEqual({
      formatVersion: 1, attemptId: "s3-match", snapshotRef, status: "completed", outcome: "match",
      query: { text: script, kind: "fixed-string" },
      tool: { name: "ripgrep", ...tool, arguments: ["--no-config", "--json", "--hidden", "--no-ignore", "--no-follow",
        "--no-search-zip", "--case-sensitive", "--line-number", "--sort=path", "--max-count=20", "--fixed-strings",
        `--regexp=${script}`, "--", root], removedEnvironment: ["RIPGREP_CONFIG_PATH"], exitCode: 0 },
      scope: { root: "snapshot", inventoryRef: "inventory-001", indexedRegularFiles: regularFiles, searchedFiles: regularFiles,
        symbolicLinks: 1, captureExclusions: { ref: "exclusions-001", path: "exclusions.txt",
          sha256: sha256(defaultCaptureExclusions), rules: captureExclusionRules(defaultCaptureExclusions) } },
      limits: { maxMatchesPerFile: 20, maxMatches: 200, maxLineCodeUnits: 4096, maxOutputBytes: 16 * 1024 * 1024,
        timeoutMs: 120_000 },
      matchedLines: 4,
      matches: [found(".config/deploy.yml", 1, `worker: ${script}`),
        found("README.md", 1, `Run \`node ${script}\` to start the worker.`),
        found("deploy/worker.yaml", 3, `    command: node ${script}`),
        found("ignored.txt", 1, `${script} in a file that .gitignore names`)],
      filesAtMatchLimit: [],
      output: { stdout: "text-search-001.stdout.jsonl", stdoutSha256: sha256(stdout), stderr: "text-search-001.stderr.txt",
        stderrSha256: sha256("") },
      notes: textSearchNotes,
    });
    expect(stdout.toString().trimEnd().split("\n").map((line) => (JSON.parse(line) as Json).type).at(-1)).toBe("summary");
    const outputs = ["text-search-001.stdout.jsonl", "text-search-001.stderr.txt", "text-search-001.json"];
    expect(saved(work, "s3-match", "operator-text-search-001.json")).toMatchObject({ action: "text-search",
      phase: "text-search-001", status: "completed", exitCode: 0,
      digests: Object.fromEntries(outputs.map((output) => [output, sha256(readFileSync(join(folder, output)))])) });
    expect((saved(work, "s3-match", "handoff.json").versions as Json).ripgrep).toEqual(tool);
  });

  test("saves a no-match result with the searched scope, and numbers each search", () => {
    const search = started(work, "s3-none");
    expect(search(script).status).toBe(0);
    expect(search("createInvoice")).toMatchObject({ status: 0, stderr: "" });
    const [first, second] = [1, 2].map((index) => saved(work, "s3-none", `text-search-00${index}.json`));
    expect(second).toMatchObject({ outcome: "no-match", query: { text: "createInvoice", kind: "fixed-string" },
      matchedLines: 0, matches: [], filesAtMatchLimit: [], tool: { exitCode: 1 } });
    expect(second?.scope).toEqual(first?.scope);
  });

  test("reads the query as a ripgrep pattern only after --pattern", () => {
    const search = started(work, "s3-pattern");
    expect(search("^services:$", "--pattern").status).toBe(0);
    expect(search("^services:$").status).toBe(0);
    expect(saved(work, "s3-pattern", "text-search-001.json")).toMatchObject({ outcome: "match",
      query: { text: "^services:$", kind: "pattern" }, matches: [found("deploy/worker.yaml", 1, "services:")] });
    expect(saved(work, "s3-pattern", "text-search-002.json")).toMatchObject({ outcome: "no-match",
      query: { text: "^services:$", kind: "fixed-string" } });
  });

  test("keeps at most 20 matching lines of a file and marks the result truncated", () => {
    const search = started(work, "s3-limit");
    expect(search("worker").status).toBe(0);
    const record = saved(work, "s3-limit", "text-search-001.json");
    const many = (record.matches as Json[]).filter(({ path }) => path === "many.txt").map(({ line }) => line);
    expect({ outcome: record.outcome, filesAtMatchLimit: record.filesAtMatchLimit, many })
      .toEqual({ outcome: "truncated", filesAtMatchLimit: ["many.txt"], many: Array.from({ length: 20 }, (_, index) => index + 1) });
  });

  test("reports the matches of a file before the block with its first NUL byte, and none after it", () => {
    const late = join(scratch, "late-nul");
    const text = Buffer.concat([Buffer.from(`${script}\n`), Buffer.alloc(300_000, "x\n"), Buffer.from(`\0\n${script}\n`)]);
    stagedRun(late, 2, { snapshot: [{ path: "late.bin", text }, file("binary.bin")] });
    expect(started(late, "s3-nul")(script).status).toBe(0);
    expect(saved(late, "s3-nul", "text-search-001.json")).toMatchObject({ outcome: "match", matchedLines: 1,
      matches: [{ path: "late.bin", sha256: sha256(text), line: 1, text: script }], scope: { searchedFiles: 2 } });
  });

  test("refuses a query that it cannot search, with a failed receipt and no record", () => {
    const search = started(work, "s3-refused");
    const refusals: [string[], string][] = [
      [["two\nlines"], "Use a search text of 1 to 1000 characters without line breaks or other control characters.\n"],
      [["a(b", "--pattern"], "Ripgrep failed with exit code 2: rg: regex parse error:\n    (?:a(b)\n    ^\nerror: unclosed group\n"],
    ];
    for (const [index, [args, message]] of refusals.entries()) {
      expect({ args, result: search(...args) }).toEqual({ args, result: { status: 1, stdout: "", stderr: message } });
      const phase = `text-search-00${index + 1}`;
      expect(saved(work, "s3-refused", `operator-${phase}.json`)).toMatchObject({ phase, status: "failed", digests: {} });
      expect(existsSync(join(work, "evidence/s3-refused", `${phase}.json`))).toBe(false);
    }
    const usage = search(script, "--other");
    expect({ status: usage.status, stdout: usage.stdout }).toEqual({ status: 1, stdout: "" });
    expect(usage.stderr).toContain("Use start, collect, excerpt PATH FIRST LAST, text-search TEXT [--pattern], or save-review REVIEW_DIR.");
  });
});

describe("Stage 3 text-search on a snapshot that does not match its records", () => {
  test.each([
    ["holds a file that the inventory does not list, with a match", (root: string) => writeFileSync(join(root, "extra.txt"), script),
      script, "Ripgrep matched a path that is not an indexed regular file: extra.txt"],
    ["holds a file that the inventory does not list, without a match", (root: string) => writeFileSync(join(root, "extra.txt"), "x"),
      "createInvoice", `Ripgrep searched ${regularFiles + 1} files, but the inventory lists ${regularFiles} regular files. ` +
      "The snapshot does not match its inventory."],
    ["has an indexed file that changed", (root: string) => writeFileSync(join(root, "app.ts"), "export const value = 2;\n"),
      "createInvoice", "Changed indexed source: app.ts"],
  ])("refuses a search when the snapshot %s", (name, change, query, message) => {
    const run = searchableRun(name.replaceAll(" ", "-"));
    const search = started(run, "s3-changed");
    change(join(run, "snapshot"));
    expect(search(query)).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
    expect(existsSync(join(run, "evidence/s3-changed/text-search-001.json"))).toBe(false);
  });

  test("refuses a search in a run that names no capture exclusion rules", () => {
    const run = searchableRun("no-exclusions", (folder) => {
      const manifest = parse(readFileSync(join(folder, "run.yaml"), "utf8")) as { snapshot: Json };
      delete manifest.snapshot.exclusions;
      writeFileSync(join(folder, "run.yaml"), stringify(manifest));
    });
    expect(started(run, "s3-changed")(script)).toEqual({ status: 1, stdout: "",
      stderr: "The run names no registered capture exclusion rules (snapshot.exclusions in run.yaml).\n" });
  });
});
