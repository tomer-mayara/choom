import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { choomDefaultProfile } from "../../src/parsing-profile.ts";
import { compilerContexts, type GraphProfile, graphProfile, type IndexedFile, type Picomatch, type ProfileInputs }
  from "../../src/stage-4-graph-profile.ts";

// The graph profile of Stage 4 start, from a Stage 3 source scope of two files
// and one entry pattern. Only the settings record changes between the cases.
const picomatch = createRequire(import.meta.url)("picomatch") as Picomatch;
const sourceFiles = [{ path: "src/app.ts", sha256: "a".repeat(64) }, { path: "src/view.jsx", sha256: "b".repeat(64) }];
const indexed = new Map<string, IndexedFile>(sourceFiles.map((file) => [file.path, { ...file, kind: "file", bytes: 10 }]));
const roots = [{ path: "src/app.ts", evidenceRefs: ["s2-check-entry-plan#/workspaces/0/entry/0"] }];

function profileFor(settings: Record<string, unknown>): GraphProfile {
  const inputs: ProfileInputs = { attemptId: "s4-check", settings, indexed, loadPicomatch: () => picomatch,
    plan: { workspaces: [{ dir: ".", entry: ["src/app.ts"] }] }, loading: { scope: sourceFiles },
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
