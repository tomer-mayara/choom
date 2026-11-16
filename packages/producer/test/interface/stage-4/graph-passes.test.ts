import { describe, expect, test } from "bun:test";
import { commonJsTypeScript, esModulePackage, type ModuleKindPackage, nodeNextPackage }
  from "../../fixtures/module-kinds/packages.ts";
import { packageGraph } from "../../support/module-kind-graph.ts";

// Stage 4 start saves the graph profile of a small saved package. Then collect runs
// the graph helper with the checkout's dependency-cruiser on the saved snapshot, as
// the graph container runs it on its input copy. These tests record the passes and
// their edges. Each compiler context has an import pass, which reads ES module
// syntax with the import condition, and a require pass, which reads CommonJS syntax
// with the require condition. Each pass scans every file.
//
// A TypeScript file whose compiled code is CommonJS loads its imports with require.
// Here these files are main.ts with module commonjs, and kind.cts and plain.ts with
// nodenext in a package with no type field. Their compiler context also has a
// CommonJS pass, which keeps their imports with the require condition, and the
// import pass keeps none of them. Before GA-10b, they got the import target
// dep/index.mjs, and their imports were marked pre-compilation-only.
interface PinnedContext {
  id: string; status: string; conditionNames: string[]; moduleSystems: string[]; scanFiles: string[]; edges: PinnedEdge[];
}
interface PinnedEdge {
  from: string; specifier: string; to: string | null; targetKind: string; dependencyTypes: string[];
  preCompilationOnly: boolean | null; dynamic: boolean | null;
}

const graphTimeout = 120_000;
const importPass = { conditionNames: ["import", "default"], moduleSystems: ["es6", "tsd"] };
const requirePass = { conditionNames: ["require", "default"], moduleSystems: ["cjs"] };
const commonJSPass = { conditionNames: ["require", "default"], moduleSystems: ["es6", "tsd", "cjs"] };

// An edge from a file to "#dep" that the compiled code keeps.
function depEdge(from: string, to: string, kind: string, dynamic = false): PinnedEdge {
  return { from, specifier: "#dep", to, targetKind: "internal", dependencyTypes: ["aliased", "aliased-subpath-import", "local", kind],
    preCompilationOnly: false, dynamic };
}

async function graphContexts(fixture: ModuleKindPackage): Promise<PinnedContext[]> {
  const { graph } = await packageGraph(fixture);
  expect(graph.status).toBe("completed");
  return graph.contexts.map(({ id, status, conditionNames, moduleSystems, scanFiles, edges }) => ({
    id, status, conditionNames, moduleSystems, scanFiles,
    edges: edges.map(({ from, specifier, to, targetKind, dependencyTypes, preCompilationOnly, dynamic }) =>
      ({ from, specifier, to, targetKind, dependencyTypes, preCompilationOnly, dynamic })),
  }));
}

describe("the Stage 4 graph passes", () => {
  // These edges did not change in GA-10b. An import() in a .cjs file keeps the import condition, as in Node.
  test("in an ES module package, each JavaScript file gets the target of the condition of its syntax", async () => {
    const scanFiles = ["dep/index.cjs", "dep/index.mjs", "lazy.cjs", "legacy.cjs", "main.js", "typed.ts"];
    expect(await graphContexts(esModulePackage)).toEqual([
      { id: "choom-default-v1-import", status: "completed", ...importPass, scanFiles, edges: [
        depEdge("lazy.cjs", "dep/index.mjs", "dynamic-import", true),
        depEdge("main.js", "dep/index.mjs", "import"),
        depEdge("typed.ts", "dep/index.mjs", "import"),
      ] },
      { id: "choom-default-v1-require", status: "completed", ...requirePass, scanFiles, edges: [
        depEdge("legacy.cjs", "dep/index.cjs", "require"),
      ] },
    ]);
  }, graphTimeout);

  // The compiled main.ts requires ./helper and "#dep", and "#dep" then loads dep/index.cjs.
  // Both imports are value imports, so neither is pre-compilation-only.
  test("a TypeScript file compiled with module commonjs gets the require targets in the CommonJS pass", async () => {
    const scanFiles = ["dep/index.cjs", "dep/index.mjs", "helper.ts", "main.ts"];
    expect(await graphContexts(commonJsTypeScript)).toEqual([
      { id: "compiler-1-import", status: "completed", ...importPass, scanFiles, edges: [] },
      { id: "compiler-1-require", status: "completed", ...requirePass, scanFiles, edges: [] },
      { id: "compiler-1-commonjs", status: "completed", ...commonJSPass, scanFiles, edges: [
        { from: "main.ts", specifier: "./helper", to: "helper.ts", targetKind: "internal",
          dependencyTypes: ["local", "import"], preCompilationOnly: false, dynamic: false },
        depEdge("main.ts", "dep/index.cjs", "import"),
      ] },
    ]);
  }, graphTimeout);

  // The compiled kind.cts and plain.ts require "#dep"; the compiled esm.mts imports it.
  test("with nodenext in a package with no type field, the .cts and .ts files get the require target", async () => {
    const scanFiles = ["dep/index.cjs", "dep/index.mjs", "esm.mts", "kind.cts", "plain.ts"];
    expect(await graphContexts(nodeNextPackage)).toEqual([
      { id: "compiler-1-import", status: "completed", ...importPass, scanFiles, edges: [
        depEdge("esm.mts", "dep/index.mjs", "import"),
      ] },
      { id: "compiler-1-require", status: "completed", ...requirePass, scanFiles, edges: [] },
      { id: "compiler-1-commonjs", status: "completed", ...commonJSPass, scanFiles, edges: [
        depEdge("kind.cts", "dep/index.cjs", "import"),
        depEdge("plain.ts", "dep/index.cjs", "import"),
      ] },
    ]);
  }, graphTimeout);
});
