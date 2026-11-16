import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ts } from "ts-morph";
import { type ExtraFile, publishStageFour, stageFourPublication, type StageFourPublication }
  from "../../fixtures/stage-4-publication/fixture.ts";
import { type CommandResult, makeScratch, removeScratch, runCli, toolsRoot } from "../../support/commands.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";

// The Stage 5 helper on a run after a published Stage 4 review: start, collect and
// excerpt, with the files that each action saves and the messages of its refusals.
type Json = Record<string, unknown>;
type Candidate = [path: string, lines: [number, number], kind: string, scope: string, expression: string, name?: string];

const id = "s5-check";
const snapshotRef = "snapshot-check";
const graphRef = "s4-check-file@graph-results.json";
const mappingRef = "s4-check-file@code-mapping.json";
const sourceSitesRef = "s4-check-file@source-sites.json";
const header = { formatVersion: 1, attemptId: id, runRef: "run-check", snapshotRef };
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const installed = (path: string): Buffer => readFileSync(join(toolsRoot, "node_modules", path));
const packageVersion = (name: string): unknown => (JSON.parse(installed(name + "/package.json").toString()) as Json).version;
const longCall = "register('" + "x".repeat(500) + "');\n";

// Module-level syntax: a side-effect import, initializers, expressions and registration
// calls, also in nested functions.
const moduleSyntax = [
  "import './polyfill.ts';",
  "import { setup } from './setup.ts';",
  "export const config = loadConfig();",
  "let counter = 0, other;",
  "setup();",
  "app.use(middleware);",
  "emitter['on']('ready', handler);",
  "function start() { register(); }",
  "export default function () { listen(); }",
  "const lazy = () => subscribe();",
  "",
].join("\n");
// Class syntax: an extends expression, static and instance fields, computed names and a static block.
const classSyntax = [
  "class Service extends mixin(Base) {",
  "  static instance = create();",
  "  field = register();",
  "  [computeKey()] = 1;",
  "  static { on('x', handler); }",
  "  method() { use(); }",
  "  [methodKey()]() { return 1; }",
  "}",
  "const Widget = class extends Base { static ready = once('ready'); };",
  "",
].join("\n");
const brokenLine = "export const = 1;\n";
const sources: ExtraFile[] = [
  { path: "forms/legacy.cts", text: "const fs = require('node:fs');\nmodule.exports = fs;\n" },
  { path: "forms/module.mts", text: "export const pages = import.meta.glob('./pages/*.ts');\n" },
  { path: "forms/page.tsx", text: "export const Page = () => <main />;\nrender(<Page />);\n" },
  { path: "forms/types.d.ts", text: "import './globals.d.ts';\ndeclare const value: number;\n" },
  { path: "forms/view.jsx", text: "addEventListener('load', () => {});\n" },
  // A byte order mark, a candidate at the start of line 1 and of line 2, and a parser diagnostic on line 3.
  { path: "init/bom.ts", text: "﻿import './first.ts';\nregister();\n" + brokenLine },
  { path: "init/broken.ts", text: brokenLine },
  { path: "init/classes.ts", text: classSyntax },
  { path: "init/large.js", text: "//" + "x".repeat(2 * 1024 * 1024) + "\n" },
  { path: "init/limits.ts", text: Array.from({ length: 121 }, (_, index) => `step${index + 1}();\n`).join("") },
  // CRLF, CR and LF end lines. U+2028 ends the comment for the parser, but it does not start a saved line.
  { path: "init/lines.ts", text: "setup();\r\nuse(a);\rlisten();\n// note register();\n" },
  { path: "init/long.ts", text: longCall },
  { path: "init/many-errors.ts", text: brokenLine.repeat(26) },
  { path: "init/module.ts", text: moduleSyntax },
  { path: "test/setup.ts", text: "beforeAll(() => {});\n" },
];
// The files that the first excerpts select by name: more than 20, and one for each skip reason.
const readmes = Array.from({ length: 15 }, (_, index) =>
  ({ path: `zz/${String(index + 1).padStart(2, "0")}/README.md`, text: `# Package ${index + 1}\n` }));
const documents: ExtraFile[] = [
  { path: "README.md", text: "# Fixture\n\nThe saved fixture.\n" },
  { path: "docs/README.md", text: "#".repeat(2 * 1024 * 1024 + 1) },
  { path: "empty/component.yaml", text: "" },
  { path: "package.json", text: Buffer.from([0x7b, 0xe9, 0x7d, 0x0a]) },
  { path: "tsconfig.json", text: "{" + " ".repeat(100 * 1024) + "}\n" },
  ...readmes,
];
const componentFiles = [{ path: "cli.ts", text: "export function start() {}\n" },
  { path: "http.ts", text: "export function orders() {}\n" }];
const extraFiles = [...sources, ...documents].sort((first, second) => first.path < second.path ? -1 : 1);
const allFiles = [...componentFiles, ...extraFiles];
const digestOf = (path: string): string => sha256(allFiles.find((file) => file.path === path)?.text ?? "");
const scanned = [...componentFiles, ...sources].map(({ path }) => path).sort();
// The import, require and CommonJS passes of the Choom parsing profile. forms/legacy.cts
// compiles to CommonJS, so the compiler context has a CommonJS pass.
const contextRefs = [0, 1, 2].map((index) => `${graphRef}#/contexts/${index}`);

const registration = (path: string, lines: [number, number], scope: string, expression: string, name: string): Candidate =>
  [path, lines, "setup-or-registration-call", scope, expression, name];
const moduleExpression = (path: string, line: number, expression: string): Candidate =>
  [path, [line, line], "module-expression", "module-level-syntax", expression];
const candidates: Candidate[] = [
  ["forms/legacy.cts", [1, 1], "module-variable-initializer", "module-level-syntax", "require('node:fs')"],
  moduleExpression("forms/legacy.cts", 2, "module.exports = fs"),
  ["forms/module.mts", [1, 1], "module-variable-initializer", "module-level-syntax", "import.meta.glob('./pages/*.ts')"],
  ["forms/page.tsx", [1, 1], "module-variable-initializer", "module-level-syntax", "() => <main />"],
  moduleExpression("forms/page.tsx", 2, "render(<Page />)"),
  ["forms/types.d.ts", [1, 1], "side-effect-import", "module-level-syntax", "import './globals.d.ts';"],
  moduleExpression("forms/view.jsx", 1, "addEventListener('load', () => {})"),
  registration("forms/view.jsx", [1, 1], "module-level-syntax", "addEventListener('load', () => {})", "addEventListener"),
  ["init/bom.ts", [1, 1], "side-effect-import", "module-level-syntax", "import './first.ts';"],
  moduleExpression("init/bom.ts", 2, "register()"),
  registration("init/bom.ts", [2, 2], "module-level-syntax", "register()", "register"),
  moduleExpression("init/bom.ts", 3, "1"),
  moduleExpression("init/broken.ts", 1, "1"),
  ["init/classes.ts", [1, 1], "class-extends-expression", "class-definition-syntax", "mixin(Base)"],
  ["init/classes.ts", [2, 2], "class-static-field-initializer", "class-static-syntax", "create()"],
  ["init/classes.ts", [3, 3], "instance-field-initializer", "instance-field-syntax", "register()"],
  registration("init/classes.ts", [3, 3], "instance-field-syntax", "register()", "register"),
  ["init/classes.ts", [4, 4], "class-computed-name", "class-definition-syntax", "computeKey()"],
  ["init/classes.ts", [4, 4], "instance-field-initializer", "instance-field-syntax", "1"],
  ["init/classes.ts", [5, 5], "class-static-block", "class-static-syntax", "static { on('x', handler); }"],
  registration("init/classes.ts", [5, 5], "class-static-syntax", "on('x', handler)", "on"),
  registration("init/classes.ts", [6, 6], "nested-function-syntax", "use()", "use"),
  ["init/classes.ts", [7, 7], "class-computed-name", "class-definition-syntax", "methodKey()"],
  ["init/classes.ts", [9, 9], "module-variable-initializer", "module-level-syntax", "class extends Base { static ready = once('ready'); }"],
  ["init/classes.ts", [9, 9], "class-extends-expression", "class-definition-syntax", "Base"],
  ["init/classes.ts", [9, 9], "class-static-field-initializer", "class-static-syntax", "once('ready')"],
  registration("init/classes.ts", [9, 9], "class-static-syntax", "once('ready')", "once"),
  ...Array.from({ length: 120 }, (_, index) => moduleExpression("init/limits.ts", index + 1, `step${index + 1}()`)),
  moduleExpression("init/lines.ts", 1, "setup()"),
  registration("init/lines.ts", [1, 1], "module-level-syntax", "setup()", "setup"),
  moduleExpression("init/lines.ts", 2, "use(a)"),
  registration("init/lines.ts", [2, 2], "module-level-syntax", "use(a)", "use"),
  moduleExpression("init/lines.ts", 3, "listen()"),
  registration("init/lines.ts", [3, 3], "module-level-syntax", "listen()", "listen"),
  moduleExpression("init/lines.ts", 4, "register()"),
  registration("init/lines.ts", [4, 4], "module-level-syntax", "register()", "register"),
  moduleExpression("init/long.ts", 1, longCall.slice(0, 400)),
  registration("init/long.ts", [1, 1], "module-level-syntax", longCall.slice(0, 400), "register"),
  ...Array.from({ length: 26 }, (_, index) => moduleExpression("init/many-errors.ts", index + 1, "1")),
  ["init/module.ts", [1, 1], "side-effect-import", "module-level-syntax", "import './polyfill.ts';"],
  ["init/module.ts", [3, 3], "module-variable-initializer", "module-level-syntax", "loadConfig()"],
  ["init/module.ts", [4, 4], "module-variable-initializer", "module-level-syntax", "0"],
  moduleExpression("init/module.ts", 5, "setup()"),
  registration("init/module.ts", [5, 5], "module-level-syntax", "setup()", "setup"),
  moduleExpression("init/module.ts", 6, "app.use(middleware)"),
  registration("init/module.ts", [6, 6], "module-level-syntax", "app.use(middleware)", "use"),
  moduleExpression("init/module.ts", 7, "emitter['on']('ready', handler)"),
  registration("init/module.ts", [7, 7], "module-level-syntax", "emitter['on']('ready', handler)", "on"),
  registration("init/module.ts", [8, 8], "nested-function-syntax", "register()", "register"),
  registration("init/module.ts", [9, 9], "nested-function-syntax", "listen()", "listen"),
  ["init/module.ts", [10, 10], "module-variable-initializer", "module-level-syntax", "() => subscribe()"],
  registration("init/module.ts", [10, 10], "nested-function-syntax", "subscribe()", "subscribe"),
  moduleExpression("test/setup.ts", 1, "beforeAll(() => {})"),
  registration("test/setup.ts", [1, 1], "module-level-syntax", "beforeAll(() => {})", "beforeAll"),
];
// Two parser diagnostics for each broken line; init/many-errors.ts keeps its first 50 of 52.
const diagnosticLines: [string, number][] = [["init/bom.ts", 3], ["init/bom.ts", 3], ["init/broken.ts", 1], ["init/broken.ts", 1],
  ...Array.from({ length: 50 }, (_, index): [string, number] => ["init/many-errors.ts", Math.floor(index / 2) + 1])];
const parserDiagnostics: Record<string, [number, number]> = { "init/bom.ts": [2, 0], "init/broken.ts": [2, 0],
  "init/many-errors.ts": [52, 2] };

const excerptLimits = { lines: 300, outputBytes: 100 * 1024, inputBytes: 2 * 1024 * 1024 };
const excerptLimit = "Saving an excerpt records a tool read only.";
// The excerpt requests after collect, in order. Each request takes the next number, also a refused one.
const excerptRequests: [string, string, string][] = [["README.md", "1", "2"], ["README.md", "0", "1"], ["README.md", "2", "1"],
  ["README.md", "1", "301"], ["missing.md", "1", "1"], ["README.md", "4", "4"], ["README.md", "1", "4"],
  ["package.json", "1", "1"], ["docs/README.md", "1", "1"], ["tsconfig.json", "1", "1"], ["../outside", "1", "1"]];

let fixture: StageFourPublication;
let attempt = "";
const results: Record<string, CommandResult> = {};
const excerpts: CommandResult[] = [];
const saved = (name: string): Json => JSON.parse(readFileSync(join(attempt, name), "utf8")) as Json;

function stageFive(args: string[], work = fixture.work, tools = toolsRoot): CommandResult {
  return runCli(["stage-5", ...args], { CHOOM_TOOLS: tools, CHOOM_WORK: work, CHOOM_STAGE5_ID: id,
    CHOOM_STAGE5: join(work, "evidence", id) }, tools);
}

beforeAll(() => {
  fixture = stageFourPublication(undefined, extraFiles);
  expect(publishStageFour(fixture, "finish").status).toBe(0);
  attempt = join(fixture.work, "evidence", id);
  results.excerptBeforeStart = stageFive(["excerpt", "README.md", "1", "1"]);
  results.start = stageFive(["start"]);
  results.excerptBeforeCollect = stageFive(["excerpt", "README.md", "1", "1"]);
  results.collect = stageFive(["collect"]);
  for (const request of excerptRequests) excerpts.push(stageFive(["excerpt", ...request]));
  results.repeatedCollect = stageFive(["collect"]);
  results.repeatedStart = stageFive(["start"]);
}, 120_000);

afterAll(() => rmSync(fixture.root, { recursive: true, force: true }));

describe("Stage 5 start", () => {
  test("checks the published Stage 4 run and saves the checkpoints, the documents, the scope and the handoff", () => {
    // The registered artifacts include the Stage 1 review, and the rule lists and the candidates of the Stage 4 attempt.
    expect(results.start).toEqual({ status: 0, stderr: "",
      stdout: `Saved ${id} for ${snapshotRef}. Verified 55 registered artifacts and 37 indexed file digests.\n` });
    const handoff = saved("handoff.json");
    expect(handoff).toMatchObject({ ...header, work: fixture.work, tools: toolsRoot, inventoryRef: "inventory-001",
      mappingRef, graphRef, resourceAccessRef: "s4-check-file@resource-access.json", sourceSitesRef,
      entryAnalysisRef: "s4-check-entry-analysis", entryAnalysisHistory: ["s4-check-entry-analysis", "s3-check-entry-analysis"],
      planRef: "s2-check-entry-plan", knipRunsRef: "s2-check-knip-runs", indexedRegularFiles: 37, registeredArtifacts: 55,
      toolInputDigests: Object.fromEntries(["step-5-cookbook.md", "record-format.md"].map((name) =>
        [name, sha256(readFileSync(join(attempt, name)))])),
      scopeSha256: sha256(readFileSync(join(attempt, "scope.json"))) });
    const versions = handoff.versions as Json & { modules: Record<string, string> };
    expect(Object.keys(versions)).toEqual(["node", "yaml", "tsMorph", "typescript", "modules"]);
    // ts-morph brings the TypeScript that Stage 5 uses. Both are trusted tool files; the separate typescript package is not loaded.
    expect({ yaml: versions.yaml, tsMorph: versions.tsMorph, typescript: versions.typescript })
      .toEqual({ yaml: packageVersion("yaml"), tsMorph: packageVersion("ts-morph"), typescript: ts.version });
    expect(Object.keys(versions.modules)).toEqual(expect.arrayContaining(["yaml/package.json", "ts-morph/package.json",
      "ts-morph/dist/ts-morph.js", "@ts-morph/common/dist/ts-morph-common.js", "@ts-morph/common/dist/typescript.js"]));
    expect(Object.keys(versions.modules)).not.toContain("typescript/lib/typescript.js");
    for (const [path, digest] of Object.entries(versions.modules)) expect({ path, digest }).toEqual({ path, digest: sha256(installed(path)) });
    for (const name of ["run", "discovery", "baseline"])
      expect(readFileSync(join(attempt, `${name}.before.yaml`)).equals(readFileSync(join(fixture.work, `${name}.yaml`)))).toBe(true);
  });

  test("saves the query scope: the graph scan files, the first excerpt requests and the limits", () => {
    const focus = ["README.md", "docs/README.md", "empty/component.yaml", "package.json", "test/setup.ts", "tsconfig.json",
      ...readmes.map(({ path }) => path)];
    expect(saved("scope.json")).toEqual({ ...header, mappingRef, graphRef, sourceSitesRef,
      selectedEntryAnalysisRef: "s4-check-entry-analysis", historicalEntryAnalysisRefs: ["s3-check-entry-analysis"],
      syntaxScope: scanned.map((path) => ({ path, sha256: digestOf(path), contextRefs })),
      initialExcerpts: focus.slice(0, 20).map((path) => ({ path, first: 1, last: 200, indexed: true })),
      initialExcerptSelection: { method: "bounded filename conventions, sorted by snapshot-relative path", limit: 20,
        matched: 21, omittedPaths: focus.slice(20) },
      limits: { excerpt: excerptLimits, syntaxQuery: { inputBytes: 2 * 1024 * 1024, perFile: 120, total: 2400,
        expressionChars: 400, diagnosticsPerFile: 50 } } });
  });

  test("refuses a second start of the attempt", () => {
    expect(results.repeatedStart).toEqual({ status: 1, stdout: "", stderr: "Start with a new attempt ID.\n" });
  });
});

describe("Stage 5 collect", () => {
  test("saves the evidence, the review prompt and the artifact map", () => {
    expect(results.collect).toEqual({ status: 0, stderr: "",
      stdout: `Saved 35 owner-null units, 37 coverage records, ${candidates.length} syntax candidates and 16 excerpts.\n` });
    const outputs = ["remaining-units.json", "inspection-coverage.json", "source-candidates.json", "source-excerpts.json",
      "review-prompt.md", "artifact-map.json"];
    expect(saved("operator-collect.json")).toMatchObject({ formatVersion: 1, attemptId: id, action: "collect", phase: "collect",
      status: "completed", exitCode: 0,
      digests: Object.fromEntries(outputs.map((name) => [name, sha256(readFileSync(join(attempt, name)))])) });
    const known = ["run.before.yaml", "discovery.before.yaml", "baseline.before.yaml", "step-5-cookbook.md", "record-format.md",
      "handoff.json", "scope.json", "operator-start.json", "operator-start.started.json", "operator-start.stdout.txt",
      "operator-start.stderr.txt", "operator-collect.started.json", ...outputs.slice(0, 5)];
    expect(saved("artifact-map.json")).toEqual({ ...header, status: "proposed",
      limits: ["IDs proposed for later registration. The map excludes itself, the append-only log, and later files."],
      artifacts: Object.fromEntries(known.map((name) => [`${id}-file@${encodeURIComponent(name)}`,
        { path: `evidence/${id}/${name}`, sha256: sha256(readFileSync(join(attempt, name))) }])) });
  });

  test("saves each kind of syntax candidate with its lines, the parser diagnostics, the skipped files and the omissions", () => {
    expect(saved("source-candidates.json")).toEqual({ ...header, graphRef,
      parser: { name: "ts-morph snapshot project (TypeScript parser, Latest)", tsMorph: packageVersion("ts-morph"),
        typescript: ts.version },
      scope: scanned.filter((path) => path !== "init/large.js").map((path) => ({ path, sha256: digestOf(path), contextRefs,
        parserDiagnostics: parserDiagnostics[path]?.[0] ?? 0, omittedDiagnostics: parserDiagnostics[path]?.[1] ?? 0 })),
      skipped: [{ path: "init/large.js", reason: "input-byte-limit" }],
      candidates: candidates.map(([path, lines, kind, scope, expression, name], index) => ({ id: `${id}-syntax-${index + 1}`,
        path, sha256: digestOf(path), kind, scope, lines, expression, truncated: path === "init/long.ts",
        ...(name === undefined ? {} : { name, binding: "unknown" }) })),
      diagnostics: diagnosticLines.map(([path, line]) => ({ path, code: 1134, line, message: "Variable declaration expected.",
        messageTruncated: false })),
      omissions: [{ path: "init/limits.ts", candidatesByKind: { "module-expression": 1 } }],
      limits: ["Scope is the union of saved graph scan files. Context references show where each file was listed; no edges or traversals were merged.",
        "These are syntax candidates. No project, type, symbol, binding, module, or runtime effect analysis ran.",
        "Module-level candidates exclude nested function bodies. An initializer excerpt can still contain a function literal. Class static and instance-field syntax is labeled separately.",
        "Setup or registration candidates include nested calls with a matching spelling. Binding and execution remain unknown.",
        "Line ranges use CRLF, CR, and LF, like numbered excerpts. U+2028 and U+2029 do not increment the saved line numbers.",
        "Parser recovery can affect results. Omitted candidates, skipped files, and clipped expressions limit coverage."] });
  });

  test("saves every owner-null unit with its references, and the reviewed ranges of every mapped file", () => {
    // The Stage 4 import sites of the owner-null files, by their index in the saved source sites.
    const siteRefs: Record<string, number[]> = { "forms/legacy.cts": [0], "forms/types.d.ts": [1], "init/bom.ts": [2],
      "init/module.ts": [3, 4] };
    const mapped = (path: string): string => `${mappingRef}#/units/${allFiles.findIndex((file) => file.path === path)}`;
    expect(saved("remaining-units.json")).toEqual({ ...header, codeMappingRef: mappingRef, graphRef, sourceSitesRef,
      entryAnalysisRef: "s4-check-entry-analysis",
      units: extraFiles.map(({ path }) => ({ path, sha256: digestOf(path), roles: ["source"], mappingRef: mapped(path),
        entryCandidateRefs: [], sourceSiteRefs: (siteRefs[path] ?? []).map((index) => `${sourceSitesRef}#/sites/${index}`),
        incomingEdges: [], outgoingEdges: [] })),
      limits: ["Includes every owner-null mapped file, including documents, test inputs, and assets.",
        "Incoming references include indexed internal and context-boundary targets. The traversal flag shows whether the saved context recorded that edge as stopped. Outgoing references retain unresolved and external edges.",
        "Syntax pointers match the saved source path, literal specifier, and dynamic flag. They do not resolve a binding.",
        "Contexts remain separate. No new resolution, traversal, ownership, or unused-code decision was made.",
        "An empty edge list describes the saved graph evidence. It does not prove no references exist."] });
    const owners: Record<string, string> = { "cli.ts": "cli", "http.ts": "http" };
    const reviewed = { status: "complete", ranges: [{ sourceRef: "s4-check-source-http.ts",
      recordRef: "s4-check-entry-analysis#/reviewedFiles/0", lines: [1, 1] }] };
    expect(saved("inspection-coverage.json")).toEqual({ ...header, codeMappingRef: mappingRef,
      selectedEntryAnalysisRef: "s4-check-entry-analysis", historicalEntryAnalysisRefs: ["s3-check-entry-analysis"],
      units: allFiles.map(({ path }) => ({ path, sha256: digestOf(path), owner: owners[path] ?? null, mappingRef: mapped(path),
        current: path === "http.ts" ? reviewed : { status: "unreviewed", ranges: [] }, historicalRanges: [] })),
      limits: ["Current ranges come only from the selected Stage 4 entry analysis. Historical ranges follow its saved predecessor chain.",
        "Complete means the union of listed ranges covers the saved file text. It does not establish comprehension, runtime execution, or compliance.",
        "File hashing and graph or syntax parsing are tool reads. They do not count as saved LLM source inspection."] });
  });

  test("saves the first excerpts of the selected files, and skips each other request with a reason", () => {
    const excerpt = (path: string, lines: [number, number], text: string): Json => ({ id: `${id}-source-${encodeURIComponent(path)}`,
      snapshotRef, path, sha256: digestOf(path), lines, totalLines: lines[1], excerpt: text, truncated: false, omittedRanges: [],
      limit: excerptLimit });
    expect(saved("source-excerpts.json")).toEqual({ ...header,
      excerpts: [excerpt("README.md", [1, 3], "1: # Fixture\n2: \n3: The saved fixture."),
        excerpt("test/setup.ts", [1, 1], "1: beforeAll(() => {});"),
        ...readmes.slice(0, 14).map(({ path }, index) => excerpt(path, [1, 1], `1: # Package ${index + 1}`))],
      skipped: [{ path: "docs/README.md", lines: [1, 200], reason: "input-byte-limit" },
        { path: "empty/component.yaml", lines: [1, 200], reason: "Range exceeds saved file: empty/component.yaml" },
        { path: "package.json", lines: [1, 200], reason: "Not UTF-8 text: package.json" },
        { path: "tsconfig.json", lines: [1, 200], reason: "No complete line fits the excerpt budget: tsconfig.json" }],
      limits: excerptLimits });
  });

  test("saves the review prompt of the saved cookbook with the references of this attempt", () => {
    const cookbook = readFileSync(join(attempt, "step-5-cookbook.md"), "utf8");
    const block = /<!-- stage5-review-prompt:start -->\n```text\n([\s\S]*?)^```\n<!-- stage5-review-prompt:end -->/m.exec(cookbook);
    const tokens: Record<string, string> = { WORK: fixture.work, ATTEMPT: attempt, ID: id, ENTRY_ANALYSIS_REF: "s4-check-entry-analysis",
      MAPPING_REF: mappingRef, DEPENDENCIES_REF: graphRef, RESOURCE_ACCESS_REF: "s4-check-file@resource-access.json" };
    expect(readFileSync(join(attempt, "review-prompt.md"), "utf8"))
      .toBe((block?.[1] ?? "").replace(/\{\{([^{}\n]+)\}\}/g, (_, token: string) => tokens[token] ?? ""));
  });

  test("refuses a second collect of the attempt", () => {
    expect(results.repeatedCollect).toEqual({ status: 1, stdout: "",
      stderr: "This action was already started. Keep the attempt unchanged and use a new ID.\n" });
  });
});

describe("Stage 5 excerpt", () => {
  test("refuses an excerpt before start and before collect", () => {
    expect(results.excerptBeforeStart).toEqual({ status: 1, stdout: "",
      stderr: `ENOENT: no such file or directory, lstat '${attempt}'\n` });
    expect(results.excerptBeforeCollect).toEqual({ status: 1, stdout: "",
      stderr: `ENOENT: no such file or directory, lstat '${join(attempt, "operator-collect.json")}'\n` });
    expect(saved("operator-excerpt-001.json")).toMatchObject({ phase: "excerpt-001", status: "failed", exitCode: 1, digests: {} });
  });

  test("saves a numbered range with the omitted ranges", () => {
    const name = "excerpt-002.json";
    expect(excerpts[0]).toEqual({ status: 0, stderr: "", stdout: `Saved ${id}-file@${name} at ${join(attempt, name)} ` +
      `(SHA-256 ${sha256(readFileSync(join(attempt, name)))}).\n` });
    expect(saved(name)).toEqual({ ...header, id: `${id}-source-excerpt-002`, path: "README.md", sha256: digestOf("README.md"),
      lines: [1, 2], totalLines: 3, excerpt: "1: # Fixture\n2: ", truncated: true, omittedRanges: [[3, 3]], limit: excerptLimit });
  });

  test.each([
    [3, "Use excerpt PATH FIRST LAST with positive line numbers."],
    [4, "Use an inclusive range of at most 300 lines."],
    [5, "Use an inclusive range of at most 300 lines."],
    [6, "File is outside the inventory: missing.md"],
    [7, "Range exceeds saved file: README.md"],
    [8, "Range exceeds saved file: README.md"],
    [9, "Not UTF-8 text: package.json"],
    [10, "Indexed input exceeds byte limit: docs/README.md"],
    [11, "Excerpt exceeds 100 KiB: tsconfig.json"],
    [12, "Use excerpt PATH FIRST LAST with positive line numbers."],
  ])("refuses request %d with a failed receipt and no saved excerpt: %s", (number, message) => {
    const phase = `excerpt-${String(number).padStart(3, "0")}`;
    expect(excerpts[number - 2]).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
    expect(saved(`operator-${phase}.json`)).toMatchObject({ phase, status: "failed", exitCode: 1, digests: {} });
    expect(readFileSync(join(attempt, `operator-${phase}.stderr.txt`), "utf8")).toBe(message + "\n");
    expect(existsSync(join(attempt, `${phase}.json`))).toBe(false);
  });
});

describe("Stage 5 after a change of the saved snapshot", () => {
  test("refuses collect with a failed receipt when an indexed file changed after start", () => {
    const changed = stageFourPublication();
    try {
      expect(publishStageFour(changed, "finish").status).toBe(0);
      expect(stageFive(["start"], changed.work).status).toBe(0);
      writeFileSync(join(changed.work, "snapshot/cli.ts"), "export function stopp() {}\n");
      expect(stageFive(["collect"], changed.work)).toEqual({ status: 1, stdout: "", stderr: "Indexed file changed: cli.ts\n" });
      const receipt = JSON.parse(readFileSync(join(changed.work, "evidence", id, "operator-collect.json"), "utf8")) as Json;
      expect(receipt).toMatchObject({ status: "failed", exitCode: 1, digests: {} });
      expect(existsSync(join(changed.work, "evidence", id, "source-candidates.json"))).toBe(false);
    } finally {
      rmSync(changed.root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("Stage 5 trusted tools", () => {
  test.each([
    ["ts-morph", "ts-morph/dist/ts-morph.js"],
    ["the TypeScript of ts-morph", "@ts-morph/common/dist/typescript.js"],
  ])("refuses a later action after %s changed in the tool checkout", (_name, file) => {
    const scratch = makeScratch();
    const changed = stageFourPublication(undefined, [], copyToolCheckout(scratch));
    try {
      expect(publishStageFour(changed, "finish").status).toBe(0);
      expect(stageFive(["start"], changed.work, changed.tools)).toMatchObject({ status: 0, stderr: "" });
      appendFileSync(join(changed.tools, "node_modules", file), "\n// A later change.\n");
      const message = `Trusted parser module changed since start: ${file}`;
      expect(stageFive(["collect"], changed.work, changed.tools)).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
      const receipt = JSON.parse(readFileSync(join(changed.work, "evidence", id, "operator-collect.json"), "utf8")) as Json;
      expect(receipt).toMatchObject({ status: "failed", exitCode: 1, digests: {} });
    } finally {
      rmSync(changed.root, { recursive: true, force: true });
      removeScratch(scratch);
    }
  }, 60_000);
});
