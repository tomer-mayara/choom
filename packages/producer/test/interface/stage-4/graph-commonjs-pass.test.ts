import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collect, loadTools } from "../../../src/stage-4-graph.ts";
import { contextKinds, packageLookup } from "../../../src/stage-4-module-kinds.ts";
import { importFormsPackage } from "../../fixtures/module-kinds/packages.ts";
import { makeScratch, removeScratch, toolsRoot } from "../../support/commands.ts";

// The graph helper runs a profile in the form that Stage 4 start saves for a
// compiler context in which the main file compiles to CommonJS: an import pass and a
// CommonJS pass that both name the files whose compiled code is CommonJS, with the
// condition of their import() calls, as the module kinds of Stage 4 start decide them,
// and a require pass. collect runs with the checkout's dependency-cruiser on the import
// forms package. Each form of the main file loads its own name, whose import target is
// <name>/index.mjs and whose require target is <name>/index.cjs.
type Kept = [specifier: string, target: string | null, preCompilationOnly: boolean | null];
interface PassResult { kept: Kept[]; limits: string[] }

const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
const graphTimeout = 120_000;
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const settingsRef = "settings-001#/configs/0";

async function passes(compilerOptions: Record<string, number>, mainFile = "main.ts"): Promise<Record<string, PassResult>> {
  const scratch = makeScratch();
  try {
    const texts = new Map(importFormsPackage(compilerOptions, mainFile).snapshot.map(({ path, text }) => [path, String(text)]));
    for (const [path, text] of texts) {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), text);
    }
    const sourceFiles = [...texts].filter(([path]) => sourceExtension.test(path)).map(([path, text]) => ({ path, sha256: sha256(text) }))
      .sort((first, second) => (first.path < second.path ? -1 : 1));
    const paths = sourceFiles.map(({ path }) => path);
    const { compiled } = contextKinds(paths, compilerOptions, settingsRef, packageLookup(texts, (path) => Buffer.from(texts.get(path) ?? "")));
    expect(compiled?.files).toContain(mainFile);
    const pass = (kind: string, conditionNames: string[], moduleSystems: string[], named: boolean) => ({
      id: `compiler-1-${kind}`, compilerSettingsRef: settingsRef, sourceFiles: paths, compilerOptions,
      aliases: [], conditionNames, moduleSystems, ...(named ? { compiledToCommonJS: compiled } : {}), roots: [] });
    const profile = { formatVersion: 1, snapshotRef: "snapshot-check", attemptId: "s4-check", sourceFiles, contexts: [
      pass("import", ["import", "default"], ["es6", "tsd"], true), pass("require", ["require", "default"], ["cjs"], false),
      pass("commonjs", ["require", "default"], ["es6", "tsd", "cjs"], true)] };
    const graph = await collect(profile, await loadTools(toolsRoot), scratch);
    expect(graph.status).toBe("completed");
    return Object.fromEntries(graph.contexts.map(({ id, edges, limits }) => [id, { limits,
      kept: edges.filter(({ from }) => from === mainFile).map(({ specifier, to, preCompilationOnly }): Kept => [specifier, to, preCompilationOnly]) }]));
  } finally {
    removeScratch(scratch);
  }
}

const traversalLimit = "Traversal stops at resolved targets outside this context, built-ins, external packages, and unresolved targets.";
const noRoots = "This pass has no recorded traversal roots.";
const requireCalls = "It reads their require calls only to find the imports that the compiled code keeps; the require pass keeps the require calls.";

// The passes when TypeScript compiles the import() call of the main file into a require
// call: every import of the main file, dynamic import() too, gets the require target.
// A value import is not pre-compilation-only: the compiled code requires it. Type-only forms are.
const requiredImports: Record<string, PassResult> = {
  "compiler-1-import": { kept: [], limits: [traversalLimit, noRoots,
    "This pass keeps no import of the files whose compiled code is CommonJS. The CommonJS pass keeps them."] },
  "compiler-1-require": { kept: [["#legacy", "legacy/index.cjs", false]], limits: [traversalLimit, noRoots] },
  "compiler-1-commonjs": { kept: [
    ["./globals.d.ts", "globals.d.ts", true], ["#dep", "dep/index.cjs", false], ["#kinds", "kinds/index.cjs", true],
    ["#lazy", "lazy/index.cjs", false], ["#other", "other/index.cjs", false], ["#query", "query/index.cjs", true],
    ["#side", "side/index.cjs", false], ["#types", "types/index.cjs", true],
  ], limits: [traversalLimit, noRoots, "This pass keeps only the imports of the files whose compiled code is CommonJS, " +
    "with the require condition. TypeScript compiles their import() calls into require calls, so these imports are " +
    "not pre-compilation-only. " + requireCalls] },
};

describe("the CommonJS pass of the Stage 4 graph helper", () => {
  test("with module commonjs, every import of main.ts, dynamic import() too, gets the require target", async () => {
    expect(await passes({ module: 1 })).toEqual(requiredImports);
  }, graphTimeout);

  // TypeScript 6.0.2 keeps the import() call of a .cts file only with module Node16 to NodeNext or Preserve.
  test("with module esnext, every import of main.cts, dynamic import() too, gets the require target", async () => {
    expect(await passes({ module: 99 }, "main.cts")).toEqual(requiredImports);
  }, graphTimeout);

  test("with no module setting, every import of main.cts, dynamic import() too, gets the require target", async () => {
    expect(await passes({}, "main.cts")).toEqual(requiredImports);
  }, graphTimeout);

  test("with module nodenext, a dynamic import() of main.ts keeps the import target", async () => {
    expect(await passes({ module: 199, moduleResolution: 99 })).toEqual({
      "compiler-1-import": { kept: [["#lazy", "lazy/index.mjs", false]], limits: [traversalLimit, noRoots,
        "This pass keeps only the import() calls of the files whose compiled code is CommonJS, which TypeScript keeps with " +
        "module Node16 to NodeNext or Preserve. The CommonJS pass keeps their other imports."] },
      "compiler-1-require": { kept: [["#legacy", "legacy/index.cjs", false]], limits: [traversalLimit, noRoots] },
      "compiler-1-commonjs": { kept: [
        ["./globals.d.ts", "globals.d.ts", true], ["#dep", "dep/index.cjs", false], ["#kinds", "kinds/index.cjs", true],
        ["#other", "other/index.cjs", false], ["#query", "query/index.cjs", true], ["#side", "side/index.cjs", false],
        ["#types", "types/index.cjs", true],
      ], limits: [traversalLimit, noRoots, "This pass keeps only the imports of the files whose compiled code is CommonJS, " +
        "with the require condition. TypeScript keeps their import() calls with module Node16 to NodeNext or Preserve, so the " +
        "import pass keeps them with the import condition. " + requireCalls] },
    });
  }, graphTimeout);
});
