import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collect, loadTools } from "../../../src/stage-4-graph.ts";
import { commonJsTypeScript, esModulePackage, type ModuleKindPackage, nodeNextPackage }
  from "../../fixtures/module-kinds/packages.ts";
import { makeScratch, removeScratch, runCli, toolsRoot } from "../../support/commands.ts";
import { stagedRun } from "../../support/staged-run.ts";

// Stage 4 start saves the graph profile of a small saved package. Then collect runs
// the graph helper with the checkout's dependency-cruiser on the saved snapshot, as
// the graph container runs it on its input copy. These tests record the passes and
// edges of today. Each compiler context has an import pass, which reads only ES
// module syntax with the import condition, and a require pass, which reads only
// CommonJS syntax with the require condition. Each pass scans every file.
//
// GA-10b changes some of these results on purpose. A TypeScript file whose compiled
// code is CommonJS gets the import target dep/index.mjs, and its static imports are
// marked pre-compilation-only, but its compiled require loads dep/index.cjs. Here
// these files are main.ts with module commonjs, and kind.cts and plain.ts with
// nodenext in a package with no type field.
interface PinnedContext {
  id: string; status: string; conditionNames: string[]; moduleSystems: string[]; scanFiles: string[]; edges: PinnedEdge[];
}
interface PinnedEdge {
  from: string; specifier: string; to: string | null; targetKind: string; dependencyTypes: string[];
  preCompilationOnly: boolean | null; dynamic: boolean | null;
}

const attemptId = "s4-check";
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const graphTimeout = 120_000;
const importPass = { conditionNames: ["import", "default"], moduleSystems: ["es6", "tsd"] };
const requirePass = { conditionNames: ["require", "default"], moduleSystems: ["cjs"] };

// An edge from a file to "#dep". dependency-cruiser adds the type pre-compilation-only
// to an import that it does not find in the compiled code of the pass.
function depEdge(from: string, to: string, kind: string, flags: { preCompilationOnly?: boolean; dynamic?: boolean } = {}):
  PinnedEdge {
  const preCompilationOnly = flags.preCompilationOnly ?? false;
  return { from, specifier: "#dep", to, targetKind: "internal",
    dependencyTypes: ["aliased", "aliased-subpath-import", "local", kind, ...(preCompilationOnly ? ["pre-compilation-only"] : [])],
    preCompilationOnly, dynamic: flags.dynamic ?? false };
}

// The settings record of a package with compiler options: one parsed configuration
// that selects every source file. Without options, the run keeps the settings record
// of a snapshot without compiler settings, which names the Choom parsing profile.
function settingsOf({ snapshot, compilerOptions }: ModuleKindPackage): Record<string, unknown> | undefined {
  if (compilerOptions === null) return undefined;
  const fileNames = snapshot.map(({ path }) => path).filter((path) => sourceExtension.test(path)).map((path) => "/repo/" + path);
  return { configs: [{ path: "/repo/tsconfig.json", status: "parsed", fileNames, compilerOptions }], parsingProfile: null, gaps: [] };
}

async function graphContexts(fixture: ModuleKindPackage): Promise<PinnedContext[]> {
  const scratch = makeScratch();
  try {
    const work = join(scratch, "run");
    stagedRun(work, 3, { snapshot: fixture.snapshot, settings: settingsOf(fixture) });
    const start = runCli(["stage-4", "start"], { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE4_ID: attemptId });
    expect({ status: start.status, stderr: start.stderr }).toEqual({ status: 0, stderr: "" });
    const profile: unknown = JSON.parse(readFileSync(join(work, "evidence", attemptId, "graph-profile.json"), "utf8"));
    const graph = await collect(profile, await loadTools(toolsRoot), join(work, "snapshot"));
    expect(graph.status).toBe("completed");
    return graph.contexts.map(({ id, status, conditionNames, moduleSystems, scanFiles, edges }) => ({
      id, status, conditionNames, moduleSystems, scanFiles,
      edges: edges.map(({ from, specifier, to, targetKind, dependencyTypes, preCompilationOnly, dynamic }) =>
        ({ from, specifier, to, targetKind, dependencyTypes, preCompilationOnly, dynamic })),
    }));
  } finally {
    removeScratch(scratch);
  }
}

describe("the Stage 4 graph passes of today", () => {
  test("in an ES module package, each JavaScript file gets the target of the condition of its syntax", async () => {
    const scanFiles = ["dep/index.cjs", "dep/index.mjs", "lazy.cjs", "legacy.cjs", "main.js", "typed.ts"];
    expect(await graphContexts(esModulePackage)).toEqual([
      { id: "choom-default-v1-import", status: "completed", ...importPass, scanFiles, edges: [
        depEdge("lazy.cjs", "dep/index.mjs", "dynamic-import", { dynamic: true }),
        depEdge("main.js", "dep/index.mjs", "import"),
        depEdge("typed.ts", "dep/index.mjs", "import"),
      ] },
      { id: "choom-default-v1-require", status: "completed", ...requirePass, scanFiles, edges: [
        depEdge("legacy.cjs", "dep/index.cjs", "require"),
      ] },
    ]);
  }, graphTimeout);

  // GA-10b changes these edges on purpose: the compiled main.ts requires ./helper
  // and "#dep", and "#dep" then loads dep/index.cjs.
  test("a TypeScript file compiled with module commonjs gets only import targets, marked pre-compilation-only", async () => {
    const scanFiles = ["dep/index.cjs", "dep/index.mjs", "helper.ts", "main.ts"];
    expect(await graphContexts(commonJsTypeScript)).toEqual([
      { id: "compiler-1-import", status: "completed", ...importPass, scanFiles, edges: [
        { from: "main.ts", specifier: "./helper", to: "helper.ts", targetKind: "internal",
          dependencyTypes: ["local", "import", "pre-compilation-only"], preCompilationOnly: true, dynamic: false },
        depEdge("main.ts", "dep/index.mjs", "import", { preCompilationOnly: true }),
      ] },
      { id: "compiler-1-require", status: "completed", ...requirePass, scanFiles, edges: [] },
    ]);
  }, graphTimeout);

  // GA-10b changes the edges of kind.cts and plain.ts on purpose: their compiled code requires "#dep".
  test("with nodenext in a package with no type field, the .cts and .ts files also get the import target", async () => {
    const scanFiles = ["dep/index.cjs", "dep/index.mjs", "esm.mts", "kind.cts", "plain.ts"];
    expect(await graphContexts(nodeNextPackage)).toEqual([
      { id: "compiler-1-import", status: "completed", ...importPass, scanFiles, edges: [
        depEdge("esm.mts", "dep/index.mjs", "import"),
        depEdge("kind.cts", "dep/index.mjs", "import", { preCompilationOnly: true }),
        depEdge("plain.ts", "dep/index.mjs", "import", { preCompilationOnly: true }),
      ] },
      { id: "compiler-1-require", status: "completed", ...requirePass, scanFiles, edges: [] },
    ]);
  }, graphTimeout);
});
