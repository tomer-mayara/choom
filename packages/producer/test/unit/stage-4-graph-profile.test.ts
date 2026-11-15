import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { choomDefaultProfile } from "../../src/parsing-profile.ts";
import { type GraphProfile, graphProfile, type IndexedFile, type Picomatch, type ProfileInputs }
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
