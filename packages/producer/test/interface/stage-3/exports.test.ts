import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ts } from "ts-morph";
import { exportsNotes } from "../../../src/stage-3-exports.ts";
import { type CommandResult, makeScratch, removeScratch, runCli, toolsRoot } from "../../support/commands.ts";
import { type SnapshotFile, stagedRun, stagedSnapshotRef as snapshotRef } from "../../support/staged-run.ts";

// The Stage 3 exports action through the command line, with the ts-morph of this
// checkout, on runs after Stage 2. The settings record of each run comes from the
// Stage 1 collector. Each test starts its own attempt.
type Json = Record<string, unknown>;
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";
const invoice = "/// <reference path=\"./env.d.ts\" />\n/// <reference types=\"vite/client\" />\n" +
  "export type Invoice = { id: string };\nexport function createInvoice(id: string): Invoice {\n  return { id };\n}\n";
const tsconfig = json({ compilerOptions: { strict: true, target: "es2022", types: ["node"] },
  files: ["src/invoice.ts", "types/global.d.ts"] });
const snapshot: SnapshotFile[] = [
  { path: "README.md", text: "# Billing\n" },
  { path: "app.ts", text: "export const value = 1;\n" },
  { path: "link.ts", text: "", kind: "symlink" },
  { path: "src/invoice.ts", text: invoice },
  { path: "tsconfig.json", text: tsconfig },
];
const tsMorphVersion = (JSON.parse(readFileSync(join(toolsRoot, "node_modules/ts-morph/package.json"), "utf8")) as Json).version;
const position = (line: number, column: number): Json => ({ line, column });

let scratch = "";

function stageThree(work: string, id: string, args: string[]): CommandResult {
  return runCli(["stage-3", ...args], { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE3_ID: id });
}

// A new run after Stage 2 with the snapshot files, and a started attempt in it.
function startedRun(name: string, files: SnapshotFile[] = snapshot): (path: string) => CommandResult {
  const work = join(scratch, name);
  stagedRun(work, 2, { snapshot: files });
  const start = stageThree(work, "s3-exports", ["start"]);
  if (start.status !== 0) throw new Error(`Stage 3 start failed: ${start.stderr}`);
  return (path) => stageThree(work, "s3-exports", ["exports", path]);
}

const saved = (name: string, file: string): Json =>
  JSON.parse(readFileSync(join(scratch, name, "evidence/s3-exports", file), "utf8")) as Json;

beforeAll(() => {
  scratch = makeScratch();
});

afterAll(() => removeScratch(scratch));

describe("Stage 3 exports", () => {
  test("saves the exports of a file with the compiler settings that apply, the gaps, the reads outside the snapshot and a receipt", () => {
    const exportsOf = startedRun("configured");
    const result = exportsOf("src/invoice.ts");
    const folder = join(scratch, "configured/evidence/s3-exports");
    const name = join(folder, "exports-001.json");
    const gapsName = join(folder, "exports-001.required-gaps.json");
    expect(result).toEqual({ status: 0, stderr: "", stdout: `Saved s3-exports-file@exports-001.json at ${name} ` +
      `(SHA-256 ${sha256(readFileSync(name))}). Listed 2 exports of src/invoice.ts and 4 gaps. Saved the required gaps as ` +
      `s3-exports-file@exports-001.required-gaps.json at ${gapsName}; the entry analysis copies each one exactly.\n` });
    const gap = (input: string, missing: string, subjectRefs: string[], reason: string): Json =>
      ({ kind: "missing-compiler-input", input, missing, subjectRefs, reason });
    expect(saved("configured", "exports-001.json")).toEqual({
      formatVersion: 1, attemptId: "s3-exports", snapshotRef, status: "completed",
      path: "src/invoice.ts", sha256: sha256(invoice), settingsRef: "settings-001", compilerSettingsRef: "settings-001#/configs/0",
      compilerSettings: { source: "configuration", configPath: "tsconfig.json",
        reason: "The first fully parsed configuration of settings-001 that selects the file.",
        compilerOptions: { strict: true, target: 9, types: ["node"], configFilePath: "/repo/tsconfig.json" }, otherContextRefs: [] },
      tool: { name: "ts-morph", version: tsMorphVersion, typescript: ts.version },
      virtualRoot: "/repo",
      exports: [
        { name: "Invoice", kind: "type", typeOnly: true, range: [position(3, 1), position(3, 38)] },
        { name: "createInvoice", kind: "function", typeOnly: false, range: [position(4, 1), position(6, 2)] },
      ],
      gaps: [
        gap("files", "types/global.d.ts", ["tsconfig.json"], "tsconfig.json (settings-001#/configs/0) " +
          "names types/global.d.ts in its files list, but the snapshot does not hold that file. The project opened without it."),
        gap("types", "node", ["tsconfig.json"], "tsconfig.json (settings-001#/configs/0) names the type package node in its " +
          "types list, but the snapshot holds no declaration file for it. The project opened without it."),
        gap("reference-path", "src/env.d.ts", ["src/invoice.ts"], "src/invoice.ts names src/env.d.ts in a " +
          "reference path directive, but the snapshot does not hold that file."),
        gap("reference-types", "vite/client", ["src/invoice.ts"], "src/invoice.ts names the type package vite/client in a " +
          "reference types directive, but the snapshot holds no declaration file for it."),
      ],
      outsideReads: ["/repo/node_modules/@types", "/node_modules/@types", "/repo/node_modules", "/node_modules",
        "/repo/src/node_modules"].map((path) => ({ operation: "directory-exists", path })),
      notes: exportsNotes,
    });
    // Each gap of the record is a required gap with its kind, subjects and reason (DB5). Its
    // subject is the snapshot file that names the missing input (DB1).
    const record = saved("configured", "exports-001.json");
    expect(saved("configured", "exports-001.required-gaps.json")).toEqual({ formatVersion: 1,
      gaps: (record.gaps as Json[]).map(({ kind, subjectRefs, reason }, index) => ({ id: `s3-exports-exports-001-gap-00${index + 1}`,
        kind, subjectRefs, reason, evidenceRefs: [`s3-exports-file@exports-001.json#/gaps/${index}`] })) });
    expect(saved("configured", "operator-exports-001.json")).toMatchObject({ action: "exports", phase: "exports-001",
      status: "completed", exitCode: 0, digests: { "exports-001.json": sha256(readFileSync(name)),
        "exports-001.required-gaps.json": sha256(readFileSync(gapsName)) } });
  });

  test.each([
    ["the named Choom parsing profile when the snapshot has no project settings", [snapshot[1] as SnapshotFile],
      { compilerSettingsRef: "settings-001#/parsingProfile", compilerSettings: { source: "parsing-profile", profileId: "choom-default-v1",
        reason: "No parsed configuration of settings-001 selects the file, and the record names the Choom parsing profile.",
        compilerOptions: { allowJs: true, jsx: 1, module: 200, moduleResolution: 100, target: 12 }, otherContextRefs: [] } }],
    ["no compiler settings when no parsed configuration selects the file and the record names no profile",
      [snapshot[1] as SnapshotFile, { path: "tsconfig.json", text: json({ include: ["src"] }) }],
      { compilerSettingsRef: null, compilerSettings: { source: "fallback",
        reason: "No parsed configuration of settings-001 selects the file, and the record names no parsing profile. " +
          "The project uses no compiler settings, as the configuration-free fallback of the Stage 4 graph profile does.",
        compilerOptions: {}, otherContextRefs: [] } }],
  ])("uses %s", (name, files, expected) => {
    const run = name.split(" ").slice(0, 3).join("-");
    expect(startedRun(run, files)("app.ts")).toMatchObject({ status: 0, stderr: "" });
    expect(saved(run, "exports-001.json")).toMatchObject({ ...expected, gaps: [], outsideReads: [],
      exports: [{ name: "value", kind: "variable", typeOnly: false, range: [position(1, 1), position(1, 24)] }] });
  });

  test("refuses a path that is not an indexed regular source file, with a failed receipt and no record", () => {
    const exportsOf = startedRun("refused");
    const refusals: [string, string][] = [
      ["missing.ts", "Path is outside the indexed regular files: missing.ts"],
      ["link.ts", "Path is outside the indexed regular files: link.ts"],
      ["src/../app.ts", "Path is outside the indexed regular files: src/../app.ts"],
      ["README.md", "Path is not a JavaScript or TypeScript source file: README.md"],
    ];
    for (const [index, [path, message]] of refusals.entries()) {
      const phase = `exports-00${index + 1}`;
      expect({ path, result: exportsOf(path) }).toEqual({ path, result: { status: 1, stdout: "", stderr: message + "\n" } });
      expect(saved("refused", `operator-${phase}.json`)).toMatchObject({ phase, status: "failed", exitCode: 1, digests: {} });
      expect(existsSync(join(scratch, "refused/evidence/s3-exports", `${phase}.json`))).toBe(false);
    }
  });

  test("refuses a source file that changed after the capture", () => {
    const exportsOf = startedRun("changed");
    writeFileSync(join(scratch, "changed/snapshot/src/invoice.ts"), invoice.replace("id: string", "id: number"));
    expect(exportsOf("src/invoice.ts")).toEqual({ status: 1, stdout: "", stderr: "Snapshot integrity check failed: src/invoice.ts\n" });
    expect(existsSync(join(scratch, "changed/evidence/s3-exports/exports-001.json"))).toBe(false);
  });
});
