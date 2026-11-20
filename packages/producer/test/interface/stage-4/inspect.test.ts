import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ts } from "ts-morph";
import { type ExtraFile, inspectStageFour, type StageFourAttempt, stageFourAttempt }
  from "../../fixtures/stage-4-publication/fixture.ts";
import { type CommandResult, makeScratch, removeScratch, toolsRoot } from "../../support/commands.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";

// The Stage 4 source collection helper on a run after Stage 4 start and the graph
// phases: the source sites and the first excerpts that collect saves, the excerpt
// action, and the refusals of both actions.
type Json = Record<string, unknown>;
type Site = [path: string, lines: [number, number], kind: string, specifier: string | null, typeOnly: boolean | null,
  dynamic: boolean | null, expression: string];

const id = "s4-check";
const snapshotRef = "snapshot-check";
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const nodeVersion = execFileSync("node", ["--version"], { encoding: "utf8" }).trim();
const installed = (path: string): Buffer => readFileSync(join(toolsRoot, "node_modules", path));
const tsMorphVersion = (JSON.parse(installed("ts-morph/package.json").toString()) as Json).version;
const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
const longCall = "fetch('" + "x".repeat(5000) + "');\n";

// Each kind of site, with literal and computed specifiers and type-only forms.
const imports = [
  "import def from './default.ts';",
  "import type { Shape } from './shape.ts';",
  "import { type Mixed, value } from './mixed.ts';",
  "import './side-effect.ts';",
  "import * as all from './all.ts';",
  "export * from './all.ts';",
  "export type { Shape } from './shape.ts';",
  "export { value as other } from './mixed.ts';",
  "export { def, all };",
  "import fs = require('node:fs');",
  "import type Types = require('./types.ts');",
  "type Lazy = import('./lazy.ts').Lazy;",
  "const lazy = import('./lazy.ts');",
  "const computed = import(`./${def}.ts`);",
  "const template = import(`./template.ts`);",
  "const config = require('./config.json');",
  "const dynamic = require(def);",
  "const resolved = require.resolve('./worker.js');",
  "const data = fs.readFileSync('data.txt');",
  "await fetch('https://example.com');",
  "db.query('select 1');",
  "api['send']('not a named call');",
  "",
].join("\n");
// CRLF, CR and LF end lines. U+2028 ends the comment for the parser, but it does not start a saved line.
const lineEndings = "import {\r\n  first,\r\n  second,\r\n} from './pair.ts';\rimport './after-cr.ts';\n" +
  "// note import './after-separator.ts';\nexport { first, second };\n";
// A byte order mark, a site at the start of line 1 and of line 2, and a parser diagnostic on line 3.
const bom = "﻿import './first.ts';\nexport * from './second.ts';\nexport const = 1;\n";
const sources: ExtraFile[] = [
  { path: "bom.ts", text: bom },
  { path: "broken.ts", text: "export const = 1;\n" },
  { path: "forms/job.mjs", text: "import { readFile } from 'node:fs/promises';\nawait readFile('job.json');\n" },
  { path: "forms/legacy.cts", text: "const path = require('node:path');\nmodule.exports = require.resolve('./legacy-worker.cjs');\n" },
  { path: "forms/module.mts", text: "export { run } from './run.mts';\nconst pages = await import('./pages.mts');\n" },
  { path: "forms/page.tsx", text: "import React from 'react';\nexport const Page = () => <main>{fetch('/api')}</main>;\n" },
  { path: "forms/script.cjs", text: "const lib = require('./lib.cjs');\n" },
  { path: "forms/types.d.ts", text: "declare const loader: typeof import('./loader.js');\nexport type Loaded = import('./loaded.js').Loaded;\n" },
  { path: "forms/view.jsx", text: "export const View = () => <div>{require('./style.css')}</div>;\n" },
  { path: "long.ts", text: longCall },
  { path: "sites/imports.ts", text: imports },
  { path: "sites/lines.ts", text: lineEndings },
];
// The root README and the component declarations that the first excerpts select:
// more than 40 paths, and one file for each skip reason.
const declarations = Array.from({ length: 34 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return { path: `zz/${number}/component.yaml`, text: `name: zz-${index + 1}\n` };
});
const documents: ExtraFile[] = [
  { path: "README.md", text: "# Fixture\n\nThe saved fixture.\n" },
  { path: "component.yaml", text: "name: fixture\n" },
  { path: "empty/component.yaml", text: "" },
  { path: "large/component.yaml", text: "x".repeat(2 * 1024 * 1024 + 1) },
  { path: "latin1/component.yaml", text: latin1 },
  { path: "wide/component.yaml", text: "w".repeat(100 * 1024) + "\n" },
  ...declarations,
];
const componentFiles: ExtraFile[] = [
  { path: "cli.ts", text: "export function start() {}\n" },
  { path: "http.ts", text: "export function orders() {}\n" },
];
const allFiles = [...componentFiles, ...sources, ...documents];
const digestOf = (path: string): string => sha256(allFiles.find((file) => file.path === path)?.text ?? "");

const sites: Site[] = [
  ["bom.ts", [1, 1], "import", "./first.ts", false, false, "import './first.ts';"],
  ["bom.ts", [2, 2], "re-export", "./second.ts", false, false, "export * from './second.ts';"],
  ["forms/job.mjs", [1, 1], "import", "node:fs/promises", false, false, "import { readFile } from 'node:fs/promises';"],
  ["forms/job.mjs", [2, 2], "resource-call-candidate", null, null, null, "readFile('job.json')"],
  ["forms/legacy.cts", [1, 1], "require-candidate", "node:path", false, false, "require('node:path')"],
  ["forms/legacy.cts", [2, 2], "require-resolve-candidate", "./legacy-worker.cjs", null, false, "require.resolve('./legacy-worker.cjs')"],
  ["forms/module.mts", [1, 1], "re-export", "./run.mts", false, false, "export { run } from './run.mts';"],
  ["forms/module.mts", [2, 2], "dynamic-import", "./pages.mts", false, true, "import('./pages.mts')"],
  ["forms/page.tsx", [1, 1], "import", "react", false, false, "import React from 'react';"],
  ["forms/page.tsx", [2, 2], "resource-call-candidate", null, null, null, "fetch('/api')"],
  ["forms/script.cjs", [1, 1], "require-candidate", "./lib.cjs", false, false, "require('./lib.cjs')"],
  ["forms/types.d.ts", [1, 1], "import-type", "./loader.js", true, false, "typeof import('./loader.js')"],
  ["forms/types.d.ts", [2, 2], "import-type", "./loaded.js", true, false, "import('./loaded.js').Loaded"],
  ["forms/view.jsx", [1, 1], "require-candidate", "./style.css", false, false, "require('./style.css')"],
  ["long.ts", [1, 1], "resource-call-candidate", null, null, null, longCall.slice(0, 4096)],
  ["sites/imports.ts", [1, 1], "import", "./default.ts", false, false, "import def from './default.ts';"],
  ["sites/imports.ts", [2, 2], "import", "./shape.ts", true, false, "import type { Shape } from './shape.ts';"],
  ["sites/imports.ts", [3, 3], "import", "./mixed.ts", false, false, "import { type Mixed, value } from './mixed.ts';"],
  ["sites/imports.ts", [4, 4], "import", "./side-effect.ts", false, false, "import './side-effect.ts';"],
  ["sites/imports.ts", [5, 5], "import", "./all.ts", false, false, "import * as all from './all.ts';"],
  ["sites/imports.ts", [6, 6], "re-export", "./all.ts", false, false, "export * from './all.ts';"],
  ["sites/imports.ts", [7, 7], "re-export", "./shape.ts", true, false, "export type { Shape } from './shape.ts';"],
  ["sites/imports.ts", [8, 8], "re-export", "./mixed.ts", false, false, "export { value as other } from './mixed.ts';"],
  ["sites/imports.ts", [10, 10], "import-equals", "node:fs", false, false, "import fs = require('node:fs');"],
  ["sites/imports.ts", [11, 11], "import-equals", "./types.ts", true, false, "import type Types = require('./types.ts');"],
  ["sites/imports.ts", [12, 12], "import-type", "./lazy.ts", true, false, "import('./lazy.ts').Lazy"],
  ["sites/imports.ts", [13, 13], "dynamic-import", "./lazy.ts", false, true, "import('./lazy.ts')"],
  ["sites/imports.ts", [14, 14], "dynamic-import", null, false, true, "import(`./${def}.ts`)"],
  ["sites/imports.ts", [15, 15], "dynamic-import", "./template.ts", false, true, "import(`./template.ts`)"],
  ["sites/imports.ts", [16, 16], "require-candidate", "./config.json", false, false, "require('./config.json')"],
  ["sites/imports.ts", [17, 17], "require-candidate", null, false, false, "require(def)"],
  ["sites/imports.ts", [18, 18], "require-resolve-candidate", "./worker.js", null, false, "require.resolve('./worker.js')"],
  ["sites/imports.ts", [19, 19], "resource-call-candidate", null, null, null, "fs.readFileSync('data.txt')"],
  ["sites/imports.ts", [20, 20], "resource-call-candidate", null, null, null, "fetch('https://example.com')"],
  ["sites/imports.ts", [21, 21], "resource-call-candidate", null, null, null, "db.query('select 1')"],
  ["sites/lines.ts", [1, 4], "import", "./pair.ts", false, false, "import {\r\n  first,\r\n  second,\r\n} from './pair.ts';"],
  ["sites/lines.ts", [5, 5], "import", "./after-cr.ts", false, false, "import './after-cr.ts';"],
  ["sites/lines.ts", [6, 6], "import", "./after-separator.ts", false, false, "import './after-separator.ts';"],
];

const siteLimits = ["Source syntax only; no bindings, type checking, alias resolution, or runtime execution.",
  "Named import and export specifiers can each be type-only even when the whole statement is not; inspect the saved expression.",
  "Call names can be shadowed. Resource calls are candidates, not proven resource access or ownership.",
  "Site and excerpt line numbers use CRLF, CR, and LF. U+2028 and U+2029 do not increment saved line numbers.",
  "Diagnostic start and length are UTF-16 offsets in the text that the parser read, which leaves out a byte order mark at the start of a file.",
  "The query covers only the recorded JavaScript and TypeScript scope. Rust, excluded inputs, and other loading mechanisms remain outside it.",
  "At most 10000 sites and 4096 expression code units per site are saved. Truncation is explicit.",
  "Tool reads are not LLM source inspections."];

// The excerpt requests after collect, in order. Each request takes the next number, also a refused one.
const excerptRequests: [string, string, string][] = [["sites/lines.ts", "2", "5"], ["cli.ts", "1", "9"],
  ["cli.ts", "2", "2"], ["cli.ts", "1", "301"], ["cli.ts", "3", "1"], ["cli.ts", "0", "1"], ["cli.ts", "x", "1"],
  ["missing.ts", "1", "1"], ["../outside", "1", "1"], ["large/component.yaml", "1", "1"],
  ["latin1/component.yaml", "1", "1"], ["wide/component.yaml", "1", "1"]];

let fixture: StageFourAttempt;
let collected: CommandResult;
const excerpts: CommandResult[] = [];
const saved = (name: string): Json => JSON.parse(readFileSync(join(fixture.attempt, name), "utf8")) as Json;

beforeAll(() => {
  fixture = stageFourAttempt([...sources, ...documents]);
  collected = inspectStageFour(fixture, ["collect"]);
  for (const request of excerptRequests) excerpts.push(inspectStageFour(fixture, ["excerpt", ...request]));
}, 120_000);

afterAll(() => rmSync(fixture.root, { recursive: true, force: true }));

// The parser record names ts-morph, its TypeScript and Node, and the digest of each tool file that ts-morph loaded.
// The tool files that loading ts-morph from this checkout adds to the module cache, as the parser record lists them.
const parserModules = ["@ts-morph/common/dist/ts-morph-common.js", "@ts-morph/common/dist/typescript.js",
  "balanced-match/dist/commonjs/index.js", "brace-expansion/dist/commonjs/index.js", "code-block-writer/script/mod.js",
  "code-block-writer/script/utils/string_utils.js", "fdir/dist/index.cjs", "minimatch/dist/commonjs/assert-valid-pattern.js",
  "minimatch/dist/commonjs/ast.js", "minimatch/dist/commonjs/brace-expressions.js", "minimatch/dist/commonjs/escape.js",
  "minimatch/dist/commonjs/index.js", "minimatch/dist/commonjs/unescape.js", "path-browserify/index.js", "picomatch/index.js",
  "picomatch/lib/constants.js", "picomatch/lib/parse.js", "picomatch/lib/picomatch.js", "picomatch/lib/scan.js",
  "picomatch/lib/utils.js", "tinyglobby/dist/index.cjs", "ts-morph/dist/ts-morph.js", "ts-morph/package.json"];

function expectParser(parser: unknown, name: string): void {
  const { modules, ...versions } = parser as Json & { modules: Record<string, string> };
  expect(versions).toEqual({ name, node: nodeVersion, tsMorph: tsMorphVersion, typescript: ts.version });
  expect(Object.keys(modules)).toEqual(parserModules);
  for (const [path, digest] of Object.entries(modules)) expect({ path, digest }).toEqual({ path, digest: sha256(installed(path)) });
}

function initialExcerpt(path: string, totalLines: number, excerpt: string): Json {
  return { id: `${id}-source-${encodeURIComponent(path)}`, snapshotRef, path, sha256: digestOf(path),
    lines: [1, totalLines], totalLines, truncated: false, excerpt };
}

describe("Stage 4 collect", () => {
  test("saves the source sites, the behavior entry and resource access candidates, the first excerpts, the review prompt and the " +
    "artifact map", () => {
    expect(collected).toEqual({ status: 0, stderr: "", stdout: "Saved source sites, behavior entry candidates, resource access " +
      "candidates, bounded excerpts, and the Stage 4 review prompt.\n" });
    const outputs = ["source-sites.json", "behavior-entry-candidates.json", "resource-access-candidates.json", "source-excerpts.json",
      "review-prompt.md", "artifact-map.json"];
    expect(saved("operator-collect.json")).toMatchObject({ formatVersion: 1, attemptId: id, action: "collect",
      phase: "collect", status: "completed", exitCode: 0,
      digests: Object.fromEntries(outputs.map((name) => [name, sha256(readFileSync(join(fixture.attempt, name)))])) });
  });

  test("saves each kind of source site with its lines, specifier and flags, and the parser diagnostics", () => {
    const { parser, ...record } = saved("source-sites.json");
    expectParser(parser, "ts-morph snapshot project (TypeScript parser, Latest)");
    expect(record).toEqual({ formatVersion: 1, snapshotRef, status: "partial",
      scope: [...componentFiles, ...sources].map(({ path }) => path).sort().map((path) => ({ path, sha256: digestOf(path) })),
      sites: sites.map(([path, lines, kind, specifier, typeOnly, dynamic, expression], index) => ({ id: `${id}-site-${index + 1}`,
        path, sha256: digestOf(path), lines, kind, specifier, typeOnly, dynamic, expression, truncated: path === "long.ts" })),
      // The snapshot project leaves the byte order mark of bom.ts out of the text, so its positions do not count it.
      diagnostics: [["bom.ts", 63], ["bom.ts", 65], ["broken.ts", 13], ["broken.ts", 15]].map(([path, start]) =>
        ({ path, code: 1134, start, length: 1, message: "Variable declaration expected." })),
      omittedSites: 0, limits: siteLimits });
  });

  test("saves the first 200 lines of the priority, README, candidate and declaration paths, and skips the others with a reason", () => {
    expect(saved("source-excerpts.json")).toEqual({ formatVersion: 1, snapshotRef,
      excerpts: [initialExcerpt("http.ts", 1, "1: export function orders() {}"),
        initialExcerpt("README.md", 3, "1: # Fixture\n2: \n3: The saved fixture."),
        initialExcerpt("cli.ts", 1, "1: export function start() {}"), initialExcerpt("component.yaml", 1, "1: name: fixture"),
        ...declarations.slice(0, 32).map(({ path }, index) => initialExcerpt(path, 1, `1: name: zz-${index + 1}`))],
      skipped: [{ path: "empty/component.yaml", reason: "Empty file." },
        { path: "large/component.yaml", reason: "Excerpt source exceeds 2 MiB: large/component.yaml" },
        { path: "latin1/component.yaml", reason: "Invalid UTF-8: latin1/component.yaml" },
        { path: "wide/component.yaml", reason: "Excerpt exceeds 100 KiB; request a smaller range." },
        ...declarations.slice(32).map(({ path }) => ({ path, reason: "Initial excerpt limit of 40 paths." }))],
      limits: ["Initial excerpts end at line 200 and 100 KiB from UTF-8 files of at most 2 MiB; truncation and skipped paths are explicit.",
        "Only source spans actually read by the LLM can become reviewedFiles."] });
  });

  test("saves the review prompt with the run, snapshot and attempt, and maps the saved attempt files", () => {
    const work = fixture.work;
    const prompt = readFileSync(join(fixture.attempt, "review-prompt.md"), "utf8");
    expect(prompt).toStartWith(`# Stage 4 component recovery review\n\nRun: run-check\nSnapshot: ${snapshotRef}\nAttempt: ${id}\n` +
      `Working folder: ${work}\nSaved attempt: ${fixture.attempt}\n\n`);
    // The LLM can ask for the references to a symbol.
    expect(prompt).toContain("To find where a top-level symbol is used, request its references with a snapshot-relative path " +
      "and the symbol name.");
    // The LLM reads the behavior entry candidates as places to read, and names them in the entry analysis.
    expect(prompt).toContain("behavior-entry-candidates.json lists the calls, the settings entries and the bin commands that " +
      "the pinned Choom behavior entry rules found, and the files that the default patterns of the Knip plugins in the Stage 2 " +
      "profile select (found: knip-plugin-pattern).");
    expect(prompt).toContain("A candidate is a place to read, not a proven behavior entry");
    expect(prompt).toContain("Name the file in the entry analysis as behaviorEntryCandidatesRef.");
    // The LLM keeps observed resource access separate from inferred ownership, and names the candidates.
    expect(prompt).toContain("Keep observed access separate from inferred ownership");
    expect(prompt).toContain("Name the file in resource-access.json as resourceAccessCandidatesRef.");
    expect(prompt).toContain("Compare the exact resource named in the ownership declaration with the accessed target.");
    expect(prompt).toContain("target.resourceRef null");
    expect(prompt).toContain("set the modeled resource's owner.value to null");
    expect(prompt).toContain("Compare each displayed field, value and row with the cited assertion, return value or contract for that input.");
    expect(prompt).toContain("Set result.scope to complete only when the evidence establishes the whole result and the example shows it all.");
    expect(prompt).toContain("Use excerpt for a supported subset.");
    // The LLM keeps each question and gap within the contract of the viewer, which every stage checks.
    expect(prompt).toContain("Each question or gap has exactly its fields, 1 to 100 subjectRefs and at least one evidenceRef");
    expect(prompt).toContain("use its registered name as the operation member");
    expect(prompt).toContain("Follow the default, named and re-exported members on the reviewed public paths.");
    expect(prompt).toContain("If a role has no evidenced example, record the scope checked and the gap.");
    // The prompt for this graph fixture is deterministic once the temporary folder is removed.
    expect(sha256(prompt.replaceAll(work, "$CHOOM_WORK"))).toBe("1352d3a41e5beb5e61b6e623429c984603090daef546fdc6710242c8fcb2411b");
    // The map names each attempt file that collect found, except the command log and the map itself.
    const later = (name: string): boolean => ["commands.md", "artifact-map.json", "operator-collect.json"].includes(name) ||
      /^(?:operator-)?excerpt-/.test(name);
    const names = readdirSync(fixture.attempt).filter((name) => !later(name)).sort();
    expect(saved("artifact-map.json")).toEqual({ formatVersion: 1, attemptId: id, snapshotRef, status: "proposed",
      artifacts: Object.fromEntries(names.map((name) => [`${id}-file@${encodeURIComponent(name)}`,
        { path: `evidence/${id}/${name}`, sha256: sha256(readFileSync(join(fixture.attempt, name))) }])),
      limits: ["This map is not registered yet. It omits itself, the mutable command log, and later files."] });
  });
});

describe("Stage 4 excerpt", () => {
  test("saves a numbered range with its line count, and clips the end line to the file", () => {
    expect(excerpts.slice(0, 2)).toEqual([1, 2].map((number) =>
      ({ status: 0, stderr: "", stdout: `Saved excerpt-00${number}.json.\n` })));
    expect(saved("excerpt-001.json")).toEqual({ id: `${id}-source-excerpt-001`, snapshotRef, path: "sites/lines.ts",
      sha256: digestOf("sites/lines.ts"), lines: [2, 5], totalLines: 7, truncated: true,
      excerpt: "2:   first,\n3:   second,\n4: } from './pair.ts';\n5: import './after-cr.ts';" });
    expect(saved("excerpt-002.json")).toEqual({ id: `${id}-source-excerpt-002`, snapshotRef, path: "cli.ts",
      sha256: digestOf("cli.ts"), lines: [1, 1], totalLines: 1, truncated: false, excerpt: "1: export function start() {}" });
    expect(saved("operator-excerpt-002.json")).toMatchObject({ action: "excerpt", phase: "excerpt-002", status: "completed",
      exitCode: 0, digests: { "excerpt-002.json": sha256(readFileSync(join(fixture.attempt, "excerpt-002.json"))) } });
  });

  test.each([
    [3, "First line is outside the file: cli.ts"],
    [4, "Use a range of 1 to 300 lines."],
    [5, "Use a range of 1 to 300 lines."],
    [6, "Use a range of 1 to 300 lines."],
    [7, "Line numbers must be positive integers."],
    [8, "Path is not an indexed regular file: missing.ts"],
    [9, "Path is not an indexed regular file: ../outside"],
    [10, "Excerpt source exceeds 2 MiB: large/component.yaml"],
    [11, "Invalid UTF-8: latin1/component.yaml"],
    [12, "Excerpt exceeds 100 KiB; request a smaller range."],
  ])("refuses request %d with a failed receipt and no saved excerpt: %s", (number, message) => {
    const phase = `excerpt-${String(number).padStart(3, "0")}`;
    expect(excerpts[number - 1]).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
    expect(saved(`operator-${phase}.json`)).toMatchObject({ phase, status: "failed", exitCode: 1, reason: message });
    expect(existsSync(join(fixture.attempt, `${phase}.json`))).toBe(false);
    expect(readFileSync(join(fixture.attempt, "commands.md"), "utf8")).toContain(`\n## ${phase}\n\n\`\`\`json\n`);
  });
});

describe("Stage 4 collect of other inputs", () => {
  // Prepares a new attempt with the files, makes the change, and runs collect.
  function collect(files: ExtraFile[], change: (attempt: StageFourAttempt) => void = () => {}): [StageFourAttempt, CommandResult] {
    const attempt = stageFourAttempt(files);
    change(attempt);
    return [attempt, inspectStageFour(attempt, ["collect"])];
  }

  test("saves at most 10000 sites and counts the omitted sites", () => {
    const [attempt, result] = collect([{ path: "many.ts", text: "fetch();\n".repeat(10001) }]);
    try {
      expect(result.status).toBe(0);
      const record = JSON.parse(readFileSync(join(attempt.attempt, "source-sites.json"), "utf8")) as Json & { sites: Json[] };
      expect({ status: record.status, sites: record.sites.length, omittedSites: record.omittedSites, last: record.sites.at(-1) })
        .toEqual({ status: "partial", sites: 10000, omittedSites: 1, last: { id: `${id}-site-10000`, path: "many.ts",
          sha256: sha256("fetch();\n".repeat(10001)), lines: [10000, 10000], kind: "resource-call-candidate", specifier: null,
          typeOnly: null, dynamic: null, expression: "fetch()", truncated: false } });
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
    }
  }, 60_000);

  test.each([
    ["a source file that is not UTF-8 text", [{ path: "latin1.js", text: latin1 }], () => {}, "Invalid UTF-8: latin1.js"],
    ["a source file that changed after start", [], (attempt: StageFourAttempt) =>
      writeFileSync(join(attempt.work, "snapshot/cli.ts"), "export function stopp() {}\n"), "Snapshot source changed: cli.ts"],
  ])("stops at %s, with a failed receipt and no saved sites", (_name, files, change, message) => {
    const [attempt, result] = collect(files, change);
    try {
      expect(result).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
      expect(JSON.parse(readFileSync(join(attempt.attempt, "operator-collect.json"), "utf8")) as Json)
        .toMatchObject({ status: "failed", exitCode: 1, reason: message });
      expect(existsSync(join(attempt.attempt, "source-sites.json"))).toBe(false);
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
    }
  }, 60_000);

  test("refuses an attempt whose working draft changed before it saves a receipt", () => {
    const [attempt, result] = collect([], ({ work }) => writeFileSync(join(work, "run.yaml"), "# A later change.\n", { flag: "a" }));
    try {
      expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: "" });
      expect(result.stderr).toContain("Error: Draft changed after preparation: run");
      expect(existsSync(join(attempt.attempt, "operator-collect.started.json"))).toBe(false);
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("Stage 4 trusted parser", () => {
  test.each([
    ["ts-morph", "node_modules/ts-morph/dist/ts-morph.js"],
    ["the TypeScript of ts-morph", "node_modules/@ts-morph/common/dist/typescript.js"],
  ])("refuses a later action after %s changed in the tool checkout, before it saves a receipt", (_name, file) => {
    const scratch = makeScratch();
    const attempt = stageFourAttempt([], copyToolCheckout(scratch));
    try {
      expect(inspectStageFour(attempt, ["collect"])).toMatchObject({ status: 0, stderr: "" });
      appendFileSync(join(attempt.tools, file), "\n// A later change.\n");
      const result = inspectStageFour(attempt, ["excerpt", "cli.ts", "1", "1"]);
      expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: "" });
      expect(result.stderr).toContain("Error: Trusted parser changed since collect.");
      expect(existsSync(join(attempt.attempt, "operator-excerpt-001.started.json"))).toBe(false);
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
      removeScratch(scratch);
    }
  }, 60_000);
});

// A copied tool checkout in which a trusted package is a link to the package of this
// checkout, so that the package resolves outside the copied checkout.
function linkedPackageAttempt(scratch: string, name: string): StageFourAttempt {
  const attempt = stageFourAttempt([], copyToolCheckout(scratch));
  rmSync(join(attempt.tools, "node_modules", name), { recursive: true, force: true });
  symlinkSync(join(toolsRoot, "node_modules", name), join(attempt.tools, "node_modules", name));
  return attempt;
}

describe("Stage 4 trusted packages", () => {
  test.each([
    ["YAML", "yaml"],
    ["ts-morph", "ts-morph"],
  ])("refuses %s that resolves outside the tool checkout, before it saves a receipt", (label, name) => {
    const scratch = makeScratch();
    const attempt = linkedPackageAttempt(scratch, name);
    try {
      const result = inspectStageFour(attempt, ["collect"]);
      expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: "" });
      expect(result.stderr).toContain(`Error: Use ${label} from the trusted checkout.`);
      expect(existsSync(join(attempt.attempt, "operator-collect.started.json"))).toBe(false);
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
      removeScratch(scratch);
    }
  }, 60_000);

  test("collect refuses picomatch that resolves outside the tool checkout, with a failed receipt and no candidates", () => {
    const scratch = makeScratch();
    const attempt = linkedPackageAttempt(scratch, "picomatch");
    try {
      const message = "Use picomatch from the trusted checkout.";
      expect(inspectStageFour(attempt, ["collect"])).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
      expect(JSON.parse(readFileSync(join(attempt.attempt, "operator-collect.json"), "utf8")) as Json)
        .toMatchObject({ status: "failed", exitCode: 1, reason: message });
      expect(existsSync(join(attempt.attempt, "behavior-entry-candidates.json"))).toBe(false);
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
      removeScratch(scratch);
    }
  }, 60_000);
});
