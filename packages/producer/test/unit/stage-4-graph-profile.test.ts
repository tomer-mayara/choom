import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { choomDefaultProfile } from "../../src/parsing-profile.ts";
import { compilerContexts, type GraphProfile, graphProfile, type IndexedFile, type Picomatch, type ProfileInputs }
  from "../../src/stage-4-graph-profile.ts";

// The graph profile of Stage 4 start, from a Stage 3 source scope of two files
// and one entry pattern. Only the settings record changes between most cases. The
// module kind cases also give other source files and indexed package.json files.
const picomatch = createRequire(import.meta.url)("picomatch") as Picomatch;
const sourceFiles = [{ path: "src/app.ts", sha256: "a".repeat(64) }, { path: "src/view.jsx", sha256: "b".repeat(64) }];
const roots = [{ path: "src/app.ts", evidenceRefs: ["s2-check-entry-plan#/workspaces/0/entry/0"] }];

function profileFor(settings: Record<string, unknown>, scope = sourceFiles, packages: Record<string, string> = {}): GraphProfile {
  const indexed = new Map<string, IndexedFile>([...scope, ...Object.keys(packages).map((path) => ({ path, sha256: "c".repeat(64) }))]
    .map((file) => [file.path, { ...file, kind: "file", bytes: 10 }]));
  const readIndexed = (path: string): Buffer => {
    if (packages[path] === undefined) throw new Error("Not an indexed package.json: " + path);
    return Buffer.from(packages[path]);
  };
  const inputs: ProfileInputs = { attemptId: "s4-check", settings, indexed, loadPicomatch: () => picomatch, readIndexed,
    plan: { workspaces: [{ dir: ".", entry: ["src/app.ts"] }] }, loading: { scope },
    facts: { snapshotRef: "snapshot-check", settingsRef: "settings-001", planRef: "s2-check-entry-plan",
      loadingRef: "s3-check-file@loading-search.json" } };
  return graphProfile(inputs);
}

// The import and require contexts of one group, by their IDs, references, files and options.
function contextSummaries(profile: GraphProfile): unknown[] {
  return (profile.graph.contexts as Record<string, unknown>[]).map(({ id, compilerSettingsRef, sourceFiles: files, compilerOptions,
    roots: contextRoots }) => ({ id, compilerSettingsRef, files, compilerOptions, roots: contextRoots }));
}

describe("the Stage 4 graph profile", () => {
  test("uses the options of the Choom parsing profile when the settings record names it", () => {
    const profile = profileFor({ configs: [], parsingProfile: choomDefaultProfile });
    // Only target, module, moduleResolution, jsx and verbatimModuleSyntax go to the parser.
    const options = { target: 12, module: 200, moduleResolution: 100, jsx: 1 };
    const files = ["src/app.ts", "src/view.jsx"];
    expect(contextSummaries(profile)).toEqual(["import", "require"].map((mode) => ({ id: `choom-default-v1-${mode}`,
      compilerSettingsRef: "settings-001#/parsingProfile", files, compilerOptions: options, roots })));
    expect(profile.notes.groups).toEqual([{ name: "choom-default-v1", files: 2, compilerSettingsRef: "settings-001#/parsingProfile" }]);
    // module: preserve keeps each import as written, so no file has another module kind.
    expect(profile.notes.moduleKinds).toEqual([]);
    expect((profile.notes.limits as string[])[2]).toBe("The snapshot has no project settings, so its source uses the named " +
      "Choom parsing profile choom-default-v1. settings-001#/parsingProfile records its options and assumptions.");
  });

  test("keeps the configuration-free fallback for source outside the parsed selections when the record names no profile", () => {
    const config = { path: "/repo/tsconfig.json", status: "parsed", fileNames: ["src/app.ts"], compilerOptions: { target: 9 } };
    const profile = profileFor({ configs: [config], parsingProfile: null });
    expect(contextSummaries(profile)).toEqual([
      ...["import", "require"].map((mode) => ({ id: `compiler-1-${mode}`, compilerSettingsRef: "settings-001#/configs/0",
        files: ["src/app.ts"], compilerOptions: { target: 9 }, roots })),
      ...["import", "require"].map((mode) => ({ id: `fallback-${mode}`, compilerSettingsRef: null, files: ["src/view.jsx"],
        compilerOptions: {}, roots: [] })),
    ]);
    expect((profile.notes.limits as string[])[2]).toBe("Each parsed compiler file selection is a separate context. " +
      "Overlapping selections stay separate; remaining source uses a named configuration-free fallback.");
  });

  test("refuses a settings record that names an unknown parsing profile", () => {
    expect(() => profileFor({ configs: [], parsingProfile: { id: "choom-default-v9" } }))
      .toThrow(new Error("The settings record names an unknown parsing profile: choom-default-v9"));
  });
});

// The rule of the graph profile for the compiler settings of saved source files,
// which the Stage 3 exports action applies to one file.
describe("the compiler contexts of saved source files", () => {
  const app = { path: "src/app.ts", sha256: "a".repeat(64) };
  const config = (path: string, fileNames: string[], status = "parsed") =>
    ({ path, status, fileNames, compilerOptions: { target: 9, strict: true }, declared: { files: fileNames } });

  test("are the parsed configurations that select the file, in record order", () => {
    const main = config("/repo/tsconfig.json", ["src/app.ts"]);
    const all = config("/repo/tsconfig.all.json", ["src/app.ts", "src/view.jsx"]);
    const configs = [main, config("/repo/tsconfig.view.json", ["src/view.jsx"]),
      config("/repo/tsconfig.broken.json", ["src/app.ts"], "partial"), all];
    const { groups } = compilerContexts({ configs, parsingProfile: null }, [app], "settings-001");
    expect(groups.map(({ name, ref, files, options, config: entry }) => ({ name, ref, files, options, config: entry }))).toEqual([
      { name: "compiler-1", ref: "settings-001#/configs/0", files: [app], options: { target: 9 }, config: main },
      { name: "compiler-4", ref: "settings-001#/configs/3", files: [app], options: { target: 9 }, config: all },
    ]);
  });

  test("are the named parsing profile, or else the configuration-free fallback, for a file that no configuration selects", () => {
    const configs = [config("/repo/tsconfig.json", ["src/view.jsx"])];
    const profile = compilerContexts({ configs: [], parsingProfile: choomDefaultProfile }, [app], "settings-001");
    const fallback = compilerContexts({ configs, parsingProfile: null }, [app], "settings-001");
    expect([...profile.groups, ...fallback.groups].map(({ name, ref, files, config: entry }) => ({ name, ref, files, config: entry })))
      .toEqual([{ name: "choom-default-v1", ref: "settings-001#/parsingProfile", files: [app], config: null },
        { name: "fallback", ref: null, files: [app], config: null }]);
    expect(profile.parsingProfile).toBe(choomDefaultProfile);
  });
});

// The passes of a compiler context by the module kind of its files, and the record
// of each file whose module kind is not decided by its syntax.
describe("the module kinds of the Stage 4 graph profile", () => {
  const moduleRef = "settings-001#/configs/0/compilerOptions/module";
  const config = (compilerOptions: Record<string, number>, scope = sourceFiles) => ({ configs: [{ path: "/repo/tsconfig.json",
    status: "parsed", fileNames: scope.map(({ path }) => "/repo/" + path), compilerOptions }], parsingProfile: null });
  const passes = (profile: GraphProfile): unknown[] => (profile.graph.contexts as Record<string, unknown>[])
    .map(({ id, conditionNames, moduleSystems, compiledToCommonJS }) => ({ id, conditionNames, moduleSystems, compiledToCommonJS }));
  const importPass = { conditionNames: ["import", "default"], moduleSystems: ["es6", "tsd"] };
  const requirePass = { conditionNames: ["require", "default"], moduleSystems: ["cjs"] };
  const commonJSPass = { conditionNames: ["require", "default"], moduleSystems: ["es6", "tsd", "cjs"] };
  const record = (path: string, kind: string, decidedBy: string, more: Record<string, unknown> = {}) =>
    ({ group: "compiler-1", path, kind, decidedBy, setting: null, packageJson: null, reason: null, ...more });

  test("give a compiler context a CommonJS pass for the files whose compiled code is CommonJS", () => {
    const profile = profileFor(config({ module: 1 }));
    const compiledToCommonJS = { files: ["src/app.ts"], dynamicImportCondition: "require" };
    expect(passes(profile)).toEqual([{ id: "compiler-1-import", ...importPass, compiledToCommonJS },
      { id: "compiler-1-require", ...requirePass }, { id: "compiler-1-commonjs", ...commonJSPass, compiledToCommonJS }]);
    expect(profile.notes.moduleKinds).toEqual([record("src/app.ts", "commonjs", "compiler-module", { setting: moduleRef })]);
  });

  test("with module nodenext use the nearest indexed package.json, and the import() calls keep the import condition", () => {
    const scope = ["lib/esm.ts", "src/app.ts", "src/legacy.cts", "src/view.jsx"].map((path) => ({ path, sha256: "d".repeat(64) }));
    const profile = profileFor(config({ module: 199, moduleResolution: 99 }, scope), scope,
      { "package.json": JSON.stringify({ name: "root" }), "lib/package.json": JSON.stringify({ type: "module" }) });
    const compiledToCommonJS = { files: ["src/app.ts", "src/legacy.cts"], dynamicImportCondition: "import" };
    expect(passes(profile)).toEqual([{ id: "compiler-1-import", ...importPass, compiledToCommonJS },
      { id: "compiler-1-require", ...requirePass }, { id: "compiler-1-commonjs", ...commonJSPass, compiledToCommonJS }]);
    expect(profile.notes.moduleKinds).toEqual([
      record("lib/esm.ts", "module", "package-type", { setting: moduleRef, packageJson: "lib/package.json" }),
      record("src/app.ts", "commonjs", "package-type", { setting: moduleRef, packageJson: "package.json" }),
      record("src/legacy.cts", "commonjs", "extension"),
    ]);
  });

  // TypeScript 6.0.2 keeps an import() call of a .cts file only with module Node16 to
  // NodeNext or Preserve. With any other setting, or none, the compiled code requires the module.
  test("give the import() calls of a .cts file the require condition with module ESNext or no module setting", () => {
    const scope = [{ path: "src/legacy.cts", sha256: "d".repeat(64) }];
    const compiledToCommonJS = { files: ["src/legacy.cts"], dynamicImportCondition: "require" };
    for (const settings of [config({ module: 99 }, scope), config({}, scope)])
      expect(passes(profileFor(settings, scope))).toEqual([{ id: "compiler-1-import", ...importPass, compiledToCommonJS },
        { id: "compiler-1-require", ...requirePass }, { id: "compiler-1-commonjs", ...commonJSPass, compiledToCommonJS }]);
    // The configuration-free fallback has no module setting.
    expect(passes(profileFor({ configs: [], parsingProfile: null }, scope))).toEqual([
      { id: "fallback-import", ...importPass, compiledToCommonJS }, { id: "fallback-require", ...requirePass },
      { id: "fallback-commonjs", ...commonJSPass, compiledToCommonJS }]);
  });

  test("give the import() calls of a .cts file the import condition only with module Node16 to NodeNext or Preserve", () => {
    const scope = [{ path: "src/legacy.cts", sha256: "d".repeat(64) }];
    const condition = (module: number): unknown => ((profileFor(config({ module }, scope), scope).graph
      .contexts as Record<string, unknown>[])[0]?.compiledToCommonJS as Record<string, unknown>).dynamicImportCondition;
    expect([1, 5, 6, 7, 99, 100, 101, 102, 199, 200].map((module) => [module, condition(module)])).toEqual([[1, "require"],
      [5, "require"], [6, "require"], [7, "require"], [99, "require"], [100, "import"], [101, "import"], [102, "import"],
      [199, "import"], [200, "import"]]);
  });

  test("keep the passes of the syntax for a file of unknown kind, and record why its kind is unknown", () => {
    const profile = profileFor(config({ module: 2 }));
    expect(passes(profile)).toEqual([{ id: "compiler-1-import", ...importPass }, { id: "compiler-1-require", ...requirePass }]);
    expect(profile.notes.moduleKinds).toEqual([record("src/app.ts", "unknown", "unknown", { setting: moduleRef,
      reason: "The compiler module setting AMD gives code that the graph does not resolve by module kind." })]);
  });
});
