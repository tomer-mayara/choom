import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type ExtraFile, inspectStageFour, type StageFourAttempt, stageFourAttempt }
  from "../../fixtures/stage-4-publication/fixture.ts";
import { referencesNotes } from "../../../src/stage-4-references.ts";
import { type CommandResult, makeScratch, removeScratch, toolsRoot } from "../../support/commands.ts";
import { rangeIn } from "../../support/source-ranges.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";

// The Stage 4 references action through the command line, on a run after Stage 4
// start and the graph phases, with the settings record that the Stage 1 collector
// makes for the snapshot. The configuration selects the TypeScript files of src;
// the root files and the JavaScript files form the configuration-free fallback group.
type Json = Record<string, unknown>;
interface Expected { path: string; kind: string; localName: string; at: string }

const id = "s4-check";
const snapshotRef = "snapshot-check";
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";
const files: ExtraFile[] = [
  { path: "tsconfig.json", text: json({ compilerOptions: { strict: true, module: "esnext", moduleResolution: "bundler",
    types: ["node"], paths: { "@billing/*": ["./src/billing/*"] } }, include: ["src"] }) },
  { path: "README.md", text: "# Billing\n" },
  { path: "src/billing/invoice.ts", text: "export function createInvoice(id: string) {\n  return { id };\n}\n" },
  { path: "src/billing/index.ts", text: "export { createInvoice as make } from './invoice';\nexport * from './invoice';\n" },
  { path: "src/orders.ts", text: "import { createInvoice } from '@billing/invoice';\n\n" +
    "export const order = (id: string) => createInvoice(id);\n" },
  { path: "src/refunds.ts", text: "import { make } from './billing';\n\nexport const refund = (id: string) => make(id);\n" },
  { path: "src/legacy.js", text: "const { createInvoice } = require('./billing/invoice');\nconst { start } = require('../cli');\n\n" +
    "createInvoice('legacy');\nstart();\n" },
  { path: "plugins.js", text: "export async function load(name) {\n  const plugin = await import(name);\n" +
    "  const legacy = require(name);\n  const path = require.resolve(name);\n  return [plugin, legacy, path];\n}\n" },
];
const textOf = (path: string): string => {
  const file = files.find((item) => item.path === path);
  return path === "cli.ts" ? "export function start() {}\n" : String(file?.text ?? "");
};
const references = (expected: Expected[]): Json[] => expected.map(({ path, kind, localName, at }) =>
  ({ path, range: rangeIn(textOf(path), at), kind, localName }));
const folder = (path: string): Json => ({ operation: "directory-exists", path });
// The reasons of the unresolved entries.
const computedName = "The module name is computed. The query cannot tell which module the site names, so it can name " +
  "the module of the symbol.";
const typeScriptRequire = "TypeScript does not follow a require call in a TypeScript file. The call can load the module " +
  "of the symbol.";
const relativeName = "The compiler settings do not resolve this relative module name, so the query cannot tell whether " +
  "it names the module of the symbol.";
const aliasName = "The compiler settings do not resolve this paths alias, so the query cannot tell whether it names the " +
  "module of the symbol.";

// The requests after collect, in order. Each request takes the next number, also a refused one.
const requests: [string, string][] = [["src/billing/invoice.ts", "createInvoice"], ["cli.ts", "start"],
  ["src/billing/index.ts", "make"], ["README.md", "start"], ["missing.ts", "start"], ["../outside.ts", "start"],
  ["src/orders.ts", "placeOrder"], ["src/orders.ts", "createInvoice"]];

let fixture: StageFourAttempt;
const results: CommandResult[] = [];
let excerpt: CommandResult;
const saved = (name: string): Json => JSON.parse(readFileSync(join(fixture.attempt, name), "utf8")) as Json;

beforeAll(() => {
  fixture = stageFourAttempt(files, toolsRoot, "collected");
  const collect = inspectStageFour(fixture, ["collect"]);
  if (collect.status !== 0) throw new Error("Stage 4 collect failed: " + collect.stderr);
  for (const request of requests) results.push(inspectStageFour(fixture, ["references", ...request]));
  excerpt = inspectStageFour(fixture, ["excerpt", "cli.ts", "1", "1"]);
}, 120_000);

afterAll(() => rmSync(fixture.root, { recursive: true, force: true }));

describe("Stage 4 references", () => {
  test("saves the references of a symbol with the settings, the scope, the tool versions, the gaps and a receipt", () => {
    expect(results[0]).toEqual({ status: 0, stderr: "", stdout: "Saved references-001.json.\n" });
    const settings = JSON.parse(readFileSync(join(fixture.work, "evidence/settings.json"), "utf8")) as { configs: Json[] };
    const { parser } = saved("source-sites.json");
    expect(saved("references-001.json")).toEqual({
      formatVersion: 1, attemptId: id, snapshotRef, status: "completed", path: "src/billing/invoice.ts",
      sha256: sha256(textOf("src/billing/invoice.ts")), symbol: "createInvoice",
      settingsRef: "settings-001", compilerSettingsRef: "settings-001#/configs/0",
      compilerSettings: { source: "configuration", configPath: "tsconfig.json",
        reason: "The first fully parsed configuration of settings-001 that selects the file.",
        compilerOptions: settings.configs[0]?.compilerOptions, otherContextRefs: [] },
      queryOptions: { allowJs: true },
      scope: { graphContext: "compiler-1-import", graphContextRef: `${id}-file@graph-profile.json#/contexts/0`,
        files: ["src/billing/index.ts", "src/billing/invoice.ts", "src/orders.ts", "src/refunds.ts"] },
      tool: { ...(parser as Json), name: "ts-morph snapshot project (TypeScript type checker)" },
      virtualRoot: "/repo",
      completeness: "complete-within-scope",
      declarations: [{ path: "src/billing/invoice.ts",
        range: rangeIn(textOf("src/billing/invoice.ts"), "export function createInvoice(id: string) {\n  return { id };\n}") }],
      references: references([
        { path: "src/billing/index.ts", kind: "re-export", localName: "make", at: "export { «createInvoice as make» }" },
        { path: "src/billing/index.ts", kind: "re-export", localName: "createInvoice", at: "export * from './invoice';" },
        { path: "src/orders.ts", kind: "import", localName: "createInvoice", at: "import { «createInvoice» }" },
        { path: "src/orders.ts", kind: "call", localName: "createInvoice", at: "=> «createInvoice»(id)" },
        { path: "src/refunds.ts", kind: "import", localName: "make", at: "import { «make» }" },
        { path: "src/refunds.ts", kind: "call", localName: "make", at: "=> «make»(id)" },
      ]),
      unresolved: [],
      gaps: [{ kind: "missing-compiler-input", input: "types", missing: "node", subjectRefs: ["tsconfig.json"],
        reason: "tsconfig.json (settings-001#/configs/0) names the type package node in its types list, but the snapshot " +
          "holds no declaration file for it. The project opened without it." }],
      outsideReads: [
        ...["/repo/node_modules/@types", "/node_modules/@types", "/repo/node_modules", "/node_modules"].map(folder),
        // The directory import ./billing, before src/billing/index.ts.
        ...["billing.ts", "billing.tsx", "billing.d.ts", "billing.js", "billing.jsx", "billing/package.json"]
          .map((name) => ({ operation: "file-exists", path: "/repo/src/" + name })),
        // TypeScript asks for these paths in each program of these suites.
        ...["/node_modules/typescript/lib", "/node_modules/typescript"].map(folder), { operation: "file-exists", path: "/package.json" },
      ],
      notes: referencesNotes,
    });
    expect(saved("operator-references-001.json")).toMatchObject({ formatVersion: 1, attemptId: id, action: "references",
      phase: "references-001", status: "completed", exitCode: 0,
      digests: { "references-001.json": sha256(readFileSync(join(fixture.attempt, "references-001.json"))) } });
  });

  test("searches the files and uses the settings of the group of the file, and lists its computed loading sites as unresolved", () => {
    expect(results[1]).toEqual({ status: 0, stderr: "", stdout: "Saved references-002.json.\n" });
    const record = saved("references-002.json");
    const sitesRef = `${id}-file@source-sites.json`;
    const sites = (saved("source-sites.json").sites as Json[]).map((site, index) => ({ site, index }))
      .filter(({ site }) => site.path === "plugins.js" && site.specifier === null);
    expect({ ...record, outsideReads: [], notes: [] }).toMatchObject({ path: "cli.ts", symbol: "start",
      compilerSettingsRef: null, compilerSettings: { source: "fallback", compilerOptions: {}, otherContextRefs: [] },
      queryOptions: { allowJs: true },
      scope: { graphContext: "fallback-import", graphContextRef: `${id}-file@graph-profile.json#/contexts/2`,
        files: ["cli.ts", "http.ts", "plugins.js", "src/legacy.js"] },
      completeness: "partial",
      references: references([
        { path: "src/legacy.js", kind: "import", localName: "start", at: "const { «start» }" },
        { path: "src/legacy.js", kind: "call", localName: "start", at: "«start»();" },
      ]),
      unresolved: sites.map(({ site: { path, lines, kind, expression }, index }) =>
        ({ siteRef: `${sitesRef}#/sites/${index}`, path, lines, kind, expression, reason: computedName })),
      gaps: [] });
    expect((record.unresolved as Json[]).map(({ kind, lines }) => ({ kind, lines }))).toEqual([
      { kind: "dynamic-import", lines: [2, 2] }, { kind: "require-candidate", lines: [3, 3] },
      { kind: "require-resolve-candidate", lines: [4, 4] }]);
  });

  test("follows a re-exported name to the declaration that it names", () => {
    expect(results[2]).toEqual({ status: 0, stderr: "", stdout: "Saved references-003.json.\n" });
    const record = saved("references-003.json");
    expect({ symbol: record.symbol, declarations: (record.declarations as Json[]).map(({ path }) => path),
      references: record.references }).toEqual({ symbol: "make", declarations: ["src/billing/invoice.ts"],
      references: (saved("references-001.json").references as Json[]) });
  });

  test.each([
    [4, "Path is not a JavaScript or TypeScript file of the graph scope: README.md"],
    [5, "Path is not a JavaScript or TypeScript file of the graph scope: missing.ts"],
    [6, "Path is not a JavaScript or TypeScript file of the graph scope: ../outside.ts"],
    [7, "No top-level declaration or export named placeOrder in src/orders.ts."],
    [8, "No top-level declaration or export named createInvoice in src/orders.ts."],
  ])("refuses request %d with a failed receipt and no saved record: %s", (number, message) => {
    const phase = `references-${String(number).padStart(3, "0")}`;
    expect(results[number - 1]).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
    expect(saved(`operator-${phase}.json`)).toMatchObject({ action: "references", phase, status: "failed", exitCode: 1, reason: message });
    expect(existsSync(join(fixture.attempt, `${phase}.json`))).toBe(false);
    expect(readFileSync(join(fixture.attempt, "commands.md"), "utf8")).toContain(`\n## ${phase}\n\n\`\`\`json\n`);
  });

  test("numbers the excerpt requests separately", () => {
    expect(excerpt).toEqual({ status: 0, stderr: "", stdout: "Saved excerpt-001.json.\n" });
  });

  test("refuses a request without a path and a symbol before it saves a receipt", () => {
    const result = inspectStageFour(fixture, ["references", "cli.ts"]);
    expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: "" });
    expect(result.stderr).toContain("Error: Use collect, excerpt PATH FIRST LAST, or references PATH SYMBOL.");
    expect(existsSync(join(fixture.attempt, "operator-references-009.started.json"))).toBe(false);
  });
});

describe("Stage 4 references with require calls", () => {
  test("lists a literal require call of a TypeScript file as unresolved, follows the one of a JavaScript file, and does not " +
    "list require.resolve", () => {
    const invoice = "src/billing/invoice.ts";
    const old = "const { createInvoice } = require('./billing/invoice');\n\ncreateInvoice('old');\n";
    const attempt = stageFourAttempt([{ path: invoice, text: "export function createInvoice(id: string) {\n  return { id };\n}\n" },
      { path: "src/legacy.cts", text: "const { createInvoice } = require('./billing/invoice');\n\ncreateInvoice('legacy');\n" },
      { path: "src/old.js", text: old },
      { path: "src/worker.ts", text: "export const worker = require.resolve('./billing/invoice');\n" }]);
    try {
      expect(inspectStageFour(attempt, ["collect"])).toMatchObject({ status: 0, stderr: "" });
      expect(inspectStageFour(attempt, ["references", invoice, "createInvoice"]))
        .toEqual({ status: 0, stderr: "", stdout: "Saved references-001.json.\n" });
      const record = JSON.parse(readFileSync(join(attempt.attempt, "references-001.json"), "utf8")) as Json;
      const { sites } = JSON.parse(readFileSync(join(attempt.attempt, "source-sites.json"), "utf8")) as { sites: Json[] };
      const index = sites.findIndex((site) => site.path === "src/legacy.cts");
      expect({ completeness: record.completeness, references: record.references, unresolved: record.unresolved }).toEqual({
        completeness: "partial",
        references: [{ path: "src/old.js", range: rangeIn(old, "const { «createInvoice» }"), kind: "import", localName: "createInvoice" },
          { path: "src/old.js", range: rangeIn(old, "«createInvoice»('old')"), kind: "call", localName: "createInvoice" }],
        unresolved: [{ siteRef: `${id}-file@source-sites.json#/sites/${index}`, path: "src/legacy.cts", lines: [1, 1],
          kind: "require-candidate", expression: "require('./billing/invoice')", reason: typeScriptRequire }],
      });
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("Stage 4 references with relative module names that do not resolve", () => {
  // Under NodeNext, the .ts files of a package of type module are ES modules: a relative import needs its extension.
  test("lists a relative module name that the compiler settings do not resolve, and no bare package name", () => {
    const invoice = "src/billing/invoice.ts";
    const good = "import { createInvoice } from './billing/invoice.js';\nimport { z } from 'zod';\nimport './theme.css';\n\n" +
      "export const good = createInvoice(String(z));\n";
    const attempt = stageFourAttempt([
      { path: "package.json", text: json({ name: "billing", type: "module" }) },
      { path: "tsconfig.json", text: json({ compilerOptions: { strict: true, module: "nodenext", moduleResolution: "nodenext" },
        include: ["src"] }) },
      { path: invoice, text: "export function createInvoice(id: string) {\n  return { id };\n}\n" },
      { path: "src/esm.ts", text: "import { createInvoice } from './billing/invoice';\n\nexport const esm = createInvoice('esm');\n" },
      { path: "src/generated.ts", text: "export * from './missing/index.js';\n" },
      { path: "src/good.ts", text: good },
      { path: "src/theme.css", text: "body { color: black; }\n" },
    ], toolsRoot, "collected");
    try {
      expect(inspectStageFour(attempt, ["collect"])).toMatchObject({ status: 0, stderr: "" });
      expect(inspectStageFour(attempt, ["references", invoice, "createInvoice"]))
        .toEqual({ status: 0, stderr: "", stdout: "Saved references-001.json.\n" });
      const record = JSON.parse(readFileSync(join(attempt.attempt, "references-001.json"), "utf8")) as Json;
      const { sites } = JSON.parse(readFileSync(join(attempt.attempt, "source-sites.json"), "utf8")) as { sites: Json[] };
      const listed = (path: string, kind: string, lines: number[], expression: string): Json => {
        const index = sites.findIndex((site) => site.path === path && site.expression === expression);
        return { siteRef: `${id}-file@source-sites.json#/sites/${index}`, path, lines, kind, expression, reason: relativeName };
      };
      expect({ completeness: record.completeness, references: record.references, unresolved: record.unresolved }).toEqual({
        completeness: "partial",
        references: [{ path: "src/good.ts", range: rangeIn(good, "import { «createInvoice» }"), kind: "import", localName: "createInvoice" },
          { path: "src/good.ts", range: rangeIn(good, "good = «createInvoice»("), kind: "call", localName: "createInvoice" }],
        unresolved: [listed("src/esm.ts", "import", [1, 1], "import { createInvoice } from './billing/invoice';"),
          listed("src/generated.ts", "re-export", [1, 1], "export * from './missing/index.js';")],
      });
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("Stage 4 references with paths aliases that do not resolve", () => {
  // Under NodeNext, an alias of an ES module file needs the extension too, and @gen/* names a folder that the capture did not save.
  test("lists a paths alias that the compiler settings do not resolve, and no bare package name that matches no key", () => {
    const invoice = "src/billing/invoice.ts";
    const good = "import { createInvoice } from '@billing/invoice.js';\nimport { z } from 'zod';\n\n" +
      "export const good = createInvoice(String(z));\n";
    const attempt = stageFourAttempt([
      { path: "package.json", text: json({ name: "billing", type: "module" }) },
      { path: "tsconfig.json", text: json({ compilerOptions: { strict: true, module: "nodenext", moduleResolution: "nodenext",
        paths: { "@billing/*": ["./src/billing/*"], "@gen/*": ["./generated/*"] } }, include: ["src"] }) },
      { path: invoice, text: "export function createInvoice(id: string) {\n  return { id };\n}\n" },
      { path: "src/orders.ts", text: "import { createInvoice } from '@billing/invoice';\n\nexport const order = createInvoice('order');\n" },
      { path: "src/report.ts", text: "export * from '@gen/billing.js';\n" },
      { path: "src/good.ts", text: good },
    ], toolsRoot, "collected");
    try {
      expect(inspectStageFour(attempt, ["collect"])).toMatchObject({ status: 0, stderr: "" });
      expect(inspectStageFour(attempt, ["references", invoice, "createInvoice"]))
        .toEqual({ status: 0, stderr: "", stdout: "Saved references-001.json.\n" });
      const record = JSON.parse(readFileSync(join(attempt.attempt, "references-001.json"), "utf8")) as Json;
      const { sites } = JSON.parse(readFileSync(join(attempt.attempt, "source-sites.json"), "utf8")) as { sites: Json[] };
      const listed = (path: string, kind: string, expression: string): Json => {
        const index = sites.findIndex((site) => site.path === path && site.expression === expression);
        return { siteRef: `${id}-file@source-sites.json#/sites/${index}`, path, lines: [1, 1], kind, expression, reason: aliasName };
      };
      expect({ completeness: record.completeness, references: record.references, unresolved: record.unresolved }).toEqual({
        completeness: "partial",
        references: [{ path: "src/good.ts", range: rangeIn(good, "import { «createInvoice» }"), kind: "import", localName: "createInvoice" },
          { path: "src/good.ts", range: rangeIn(good, "good = «createInvoice»("), kind: "call", localName: "createInvoice" }],
        unresolved: [listed("src/orders.ts", "import", "import { createInvoice } from '@billing/invoice';"),
          listed("src/report.ts", "re-export", "export * from '@gen/billing.js';")],
      });
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("Stage 4 references before or after a changed collect", () => {
  test("refuses a request before collect, and a request after the saved source sites changed", () => {
    const attempt = stageFourAttempt();
    try {
      const before = inspectStageFour(attempt, ["references", "cli.ts", "start"]);
      expect(before).toEqual({ status: 1, stdout: "", stderr: "Run collect before references.\n" });
      expect(existsSync(join(attempt.attempt, "references-001.json"))).toBe(false);
      expect(inspectStageFour(attempt, ["collect"])).toMatchObject({ status: 0, stderr: "" });
      appendFileSync(join(attempt.attempt, "source-sites.json"), "\n");
      const changed = inspectStageFour(attempt, ["references", "cli.ts", "start"]);
      expect(changed).toEqual({ status: 1, stdout: "", stderr: "Changed collect output: source-sites.json\n" });
      expect(existsSync(join(attempt.attempt, "references-002.json"))).toBe(false);
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
    }
  }, 60_000);

  test("refuses a request after ts-morph changed in the tool checkout, before it saves a receipt", () => {
    const scratch = makeScratch();
    const attempt = stageFourAttempt([], copyToolCheckout(scratch));
    try {
      expect(inspectStageFour(attempt, ["collect"])).toMatchObject({ status: 0, stderr: "" });
      appendFileSync(join(attempt.tools, "node_modules/ts-morph/dist/ts-morph.js"), "\n// A later change.\n");
      const result = inspectStageFour(attempt, ["references", "cli.ts", "start"]);
      expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: "" });
      expect(result.stderr).toContain("Error: Trusted parser changed since collect.");
      expect(existsSync(join(attempt.attempt, "operator-references-001.started.json"))).toBe(false);
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
      removeScratch(scratch);
    }
  }, 60_000);
});
