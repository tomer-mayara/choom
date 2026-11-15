import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collect, loadTools } from "../../../src/stage-4-graph.ts";
import { importFormsPackage } from "../../fixtures/module-kinds/packages.ts";
import { makeScratch, removeScratch, toolsRoot } from "../../support/commands.ts";

// The graph helper runs a profile in the form that Stage 4 start saves for a
// compiler context in which main.ts compiles to CommonJS: an import pass and a
// CommonJS pass that both name main.ts, and a require pass. collect runs with the
// checkout's dependency-cruiser on the import forms package. Each form of main.ts
// loads its own name, whose import target is <name>/index.mjs and whose require
// target is <name>/index.cjs.
type Kept = [specifier: string, target: string | null, preCompilationOnly: boolean | null];
interface PassResult { kept: Kept[]; limits: string[] }

const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
const graphTimeout = 120_000;
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;

async function passes(compilerOptions: Record<string, number>, dynamicImportCondition: string): Promise<Record<string, PassResult>> {
  const scratch = makeScratch();
  try {
    const { snapshot } = importFormsPackage(compilerOptions);
    for (const { path, text } of snapshot) {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), text);
    }
    const sourceFiles = snapshot.filter(({ path }) => sourceExtension.test(path)).map(({ path, text }) => ({ path, sha256: sha256(text) }))
      .sort((first, second) => (first.path < second.path ? -1 : 1));
    const compiledToCommonJS = { files: ["main.ts"], dynamicImportCondition };
    const pass = (kind: string, conditionNames: string[], moduleSystems: string[], compiled: boolean) => ({
      id: `compiler-1-${kind}`, compilerSettingsRef: null, sourceFiles: sourceFiles.map(({ path }) => path), compilerOptions,
      aliases: [], conditionNames, moduleSystems, ...(compiled ? { compiledToCommonJS } : {}), roots: [] });
    const profile = { formatVersion: 1, snapshotRef: "snapshot-check", attemptId: "s4-check", sourceFiles, contexts: [
      pass("import", ["import", "default"], ["es6", "tsd"], true), pass("require", ["require", "default"], ["cjs"], false),
      pass("commonjs", ["require", "default"], ["es6", "tsd", "cjs"], true)] };
    const graph = await collect(profile, await loadTools(toolsRoot), scratch);
    expect(graph.status).toBe("completed");
    return Object.fromEntries(graph.contexts.map(({ id, edges, limits }) => [id, { limits,
      kept: edges.filter(({ from }) => from === "main.ts").map(({ specifier, to, preCompilationOnly }): Kept => [specifier, to, preCompilationOnly]) }]));
  } finally {
    removeScratch(scratch);
  }
}

const traversalLimit = "Traversal stops at resolved targets outside this context, built-ins, external packages, and unresolved targets.";
const noRoots = "This pass has no recorded traversal roots.";
const requireCalls = "It reads their require calls only to find the imports that the compiled code keeps; the require pass keeps the require calls.";

describe("the CommonJS pass of the Stage 4 graph helper", () => {
  test("with module commonjs, every import of main.ts, dynamic import() too, gets the require target", async () => {
    expect(await passes({ module: 1 }, "require")).toEqual({
      "compiler-1-import": { kept: [], limits: [traversalLimit, noRoots,
        "This pass keeps no import of the files whose compiled code is CommonJS. The CommonJS pass keeps them."] },
      "compiler-1-require": { kept: [["#legacy", "legacy/index.cjs", false]], limits: [traversalLimit, noRoots] },
      // A value import is not pre-compilation-only: the compiled code requires it. Type-only forms are.
      "compiler-1-commonjs": { kept: [
        ["./globals.d.ts", "globals.d.ts", true], ["#dep", "dep/index.cjs", false], ["#kinds", "kinds/index.cjs", true],
        ["#lazy", "lazy/index.cjs", false], ["#other", "other/index.cjs", false], ["#query", "query/index.cjs", true],
        ["#side", "side/index.cjs", false], ["#types", "types/index.cjs", true],
      ], limits: [traversalLimit, noRoots, "This pass keeps only the imports of the files whose compiled code is CommonJS, " +
        "with the require condition. TypeScript compiles their import() calls into require calls, so these imports are " +
        "not pre-compilation-only. " + requireCalls] },
    });
  }, graphTimeout);

  test("with module nodenext, a dynamic import() of main.ts keeps the import target", async () => {
    expect(await passes({ module: 199, moduleResolution: 99 }, "import")).toEqual({
      "compiler-1-import": { kept: [["#lazy", "lazy/index.mjs", false]], limits: [traversalLimit, noRoots,
        "This pass keeps only the import() calls of the files whose compiled code is CommonJS. The CommonJS pass keeps their other imports."] },
      "compiler-1-require": { kept: [["#legacy", "legacy/index.cjs", false]], limits: [traversalLimit, noRoots] },
      "compiler-1-commonjs": { kept: [
        ["./globals.d.ts", "globals.d.ts", true], ["#dep", "dep/index.cjs", false], ["#kinds", "kinds/index.cjs", true],
        ["#other", "other/index.cjs", false], ["#query", "query/index.cjs", true], ["#side", "side/index.cjs", false],
        ["#types", "types/index.cjs", true],
      ], limits: [traversalLimit, noRoots, "This pass keeps only the imports of the files whose compiled code is CommonJS, " +
        "with the require condition. Their import() calls keep the import condition in the import pass. " + requireCalls] },
    });
  }, graphTimeout);
});
