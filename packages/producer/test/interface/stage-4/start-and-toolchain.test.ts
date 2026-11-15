import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type CommandResult, runCli, toolsRoot, withScratch } from "../../support/commands.ts";
import { stagedRun, stagedSnapshotRef as snapshotRef, type StagedRunOptions } from "../../support/staged-run.ts";
import { pathWithoutDocker } from "../../support/tool-doubles.ts";

// Stage 4 runs through the command line on a run after Stage 3. Start prepares the
// graph profile. The toolchain and graph phases need Docker; without Docker they
// fail and save their receipts.
interface Receipt { phase: string; status: string; exitCode: number; digests: Record<string, string> }

const attemptId = "s4-check";
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const settingsRef = "settings-001";
const planRoot = "s2-check-entry-plan#/workspaces/0/entry/0";
const snapshot = [
  { path: "app.ts", text: "import { helper } from '@/lib/helper';\nexport const value = helper();\n" },
  { path: "lib/helper.ts", text: "export const helper = () => 1;\n" },
  { path: "scripts/build.mjs", text: "export const build = true;\n" },
  { path: "README.md", text: "# Fixture\n" },
];
// Settings records in the form of the Stage 1 collector: a parsed context with
// path aliases and a baseUrl, a configuration that did not parse, and a parsed
// context that selects no source file.
const configs = [
  { path: "/repo/tsconfig.json", status: "parsed", diagnostics: [], fileNames: ["app.ts", "lib/helper.ts"], references: [],
    compilerOptions: { target: 9, module: 199, moduleResolution: 99, jsx: 4, verbatimModuleSyntax: true, strict: true,
      baseUrl: "/repo", paths: { "@/*": ["./*"], "#internal/*": ["./a/*", "./b/*"] }, pathsBasePath: "/repo" } },
  { path: "/repo/tsconfig.broken.json", status: "unavailable", diagnostics: [{ message: "Expression expected." }] },
  { path: "/repo/tsconfig.docs.json", status: "parsed", diagnostics: [], compilerOptions: {}, fileNames: ["README.md"],
    references: [] },
];
const graphLimits = [
  "Scan files come from all indexed regular JavaScript and TypeScript files in the Stage 3 source query.",
  "Explicit traversal roots use the retained entry patterns in each saved workspace; they are not Knip's complete effective roots.",
  "Each parsed compiler file selection is a separate context. Overlapping selections stay separate; remaining source uses a named configuration-free fallback.",
  "Import and require are separate, platform-neutral passes. Browser, Node, Bun, custom, and type-specific package conditions remain outside this profile.",
  "Compiler inclusion does not claim production use, execution, or ownership. Referenced project contexts are not merged.",
  "Only target, module, moduleResolution, jsx, and verbatimModuleSyntax are passed to the parser.",
  "Recorded single-target path aliases approximate source resolution; omitted alias forms remain gaps and TypeScript paths do not establish runtime rewriting.",
  "Ambient declarations, package dependencies, non-JS/TS source and cross-context traversal remain limited.",
];

function stageFour(work: string, action: string, settings: Record<string, string> = {}): CommandResult {
  return runCli(["stage-4", action], { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE4_ID: attemptId, ...settings });
}

function startedRun(scratch: string, options: StagedRunOptions = {}): string {
  const work = join(scratch, "run");
  stagedRun(work, 3, options);
  const start = stageFour(work, "start");
  expect({ status: start.status, stderr: start.stderr }).toEqual({ status: 0, stderr: "" });
  return work;
}

function saved<T>(work: string, name: string): T {
  return JSON.parse(readFileSync(join(work, "evidence", attemptId, name), "utf8")) as T;
}

interface Group { name: string; ref: string | null; files: string[]; options: object; aliases: object[]; roots: object[] }

// Both passes of one group: import and require.
function contextPair({ name, ref, files, options, aliases, roots }: Group) {
  return ["import", "require"].map((mode) => ({ id: `${name}-${mode}`, compilerSettingsRef: ref, sourceFiles: files,
    compilerOptions: options, aliases, conditionNames: [mode, "default"],
    moduleSystems: mode === "import" ? ["es6", "tsd"] : ["cjs"], roots }));
}

describe("Stage 4 start", () => {
  test("saves one context pair for each parsed compiler selection and a configuration-free fallback for the other source", () => {
    withScratch((scratch) => {
      const work = startedRun(scratch, { snapshot, settings: { configs } });
      const sourceFiles = snapshot.filter(({ path }) => path !== "README.md")
        .map(({ path, text }) => ({ path, sha256: sha256(text) }));
      expect(saved(work, "graph-profile.json")).toEqual({ formatVersion: 1, snapshotRef, attemptId, sourceFiles, contexts: [
        ...contextPair({ name: "compiler-1", ref: `${settingsRef}#/configs/0`, files: ["app.ts", "lib/helper.ts"],
          options: { target: 9, module: 199, moduleResolution: 99, jsx: 4, verbatimModuleSyntax: true },
          aliases: [{ name: "@/*", alias: "/repo/*" }], roots: [{ path: "app.ts", evidenceRefs: [planRoot] }] }),
        ...contextPair({ name: "fallback", ref: null, files: ["scripts/build.mjs"], options: {}, aliases: [], roots: [] }),
      ] });
      expect(saved(work, "graph-profile-notes.json")).toEqual({ formatVersion: 1, snapshotRef,
        scopeRef: "s3-check-file@loading-search.json#/scope", settingsRef, planRef: "s2-check-entry-plan",
        groups: [{ name: "compiler-1", files: 2, compilerSettingsRef: `${settingsRef}#/configs/0` },
          { name: "fallback", files: 1, compilerSettingsRef: null }],
        configurationLimits: [
          { configRef: `${settingsRef}#/configs/0`,
            reason: "Alias is outside the supported single-target form and was omitted: #internal/*" },
          { configRef: `${settingsRef}#/configs/0`,
            reason: "baseUrl-only bare imports are not resolved; only the recorded explicit path aliases are approximated." },
          { configRef: `${settingsRef}#/configs/1`,
            reason: "No fully parsed saved file selection; affected files use another supported context or the fallback." },
          { configRef: `${settingsRef}#/configs/2`, reason: "This compiler context selects no indexed JS/TS scan files." },
        ],
        outsideScope: [], limits: graphLimits });
    });
  });

  test("refuses a snapshot with a missing file and creates no attempt", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stagedRun(work, 3);
      rmSync(join(work, "snapshot/app.ts"));
      const start = stageFour(work, "start");
      expect({ status: start.status, stdout: start.stdout, stderr: start.stderr }).toEqual({ status: 1, stdout: "", stderr:
        "Snapshot metadata preflight failed for 1 of 1 indexed files: 1 missing.\n- app.ts: missing\n" +
        "No attempt was created. Restore the exact saved files from a backup, or capture a new snapshot and start a new run. " +
        "Keep the existing inventory and evidence unchanged. This preflight checks paths, file types, and byte sizes; " +
        "content hashing remains a run check.\n" });
      expect(existsSync(join(work, "evidence", attemptId))).toBe(false);
    });
  });
});

describe("Stage 4 toolchain and graph run without Docker", () => {
  test("toolchain fails at the Docker context and saves a failed receipt; run then refuses the attempt", () => {
    withScratch((scratch) => {
      const work = startedRun(scratch);
      const noDocker = { PATH: pathWithoutDocker(scratch), DOCKER_HOST: "", DOCKER_CONTEXT: "" };
      const toolchain = stageFour(work, "toolchain", noDocker);
      expect({ status: toolchain.status, stdout: toolchain.stdout, stderr: toolchain.stderr }).toEqual({ status: 1, stdout: "",
        stderr: "Docker context inspection failed; see toolchain/context.stderr.txt\n" });
      const receipt = saved<Receipt>(work, "operator-toolchain.json");
      expect({ phase: receipt.phase, status: receipt.status, exitCode: receipt.exitCode,
        outputs: Object.keys(receipt.digests).sort() }).toEqual({ phase: "toolchain", status: "failed", exitCode: 1,
        outputs: ["toolchain/context.json", "toolchain/context.stderr.txt", "toolchain/context.stdout.txt"] });
      expect(saved<{ exitCode: unknown; error: { code: string } }>(work, "toolchain/context.json"))
        .toMatchObject({ exitCode: null, error: { code: "ENOENT" } });
      const run = stageFour(work, "run", noDocker);
      expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 1, stdout: "",
        stderr: "The toolchain action failed or its evidence changed. Use a new attempt.\n" });
      expect(readFileSync(join(work, "evidence", attemptId, "commands.md"), "utf8"))
        .toMatch(/\n## start\n[\s\S]*\nOutcome: completed\n[\s\S]*\n## toolchain\n[\s\S]*\nOutcome: failed\n[\s\S]*\n## run\n[\s\S]*\nOutcome: failed\n/);
    });
  });
});
