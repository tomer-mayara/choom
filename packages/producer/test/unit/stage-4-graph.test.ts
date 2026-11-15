import { describe, expect, test } from "bun:test";
import { validateContext, validateProfile } from "../../src/stage-4-graph.ts";

// The checks of the saved graph profile that the Stage 4 graph helper makes before
// it runs dependency-cruiser. Today a pass reads either CommonJS syntax with the
// require condition or ES module syntax with the import condition, and every scan
// file needs an import pass and a require pass. GA-10b changes both rules on purpose.
const file = { path: "app.ts", sha256: "a".repeat(64) };
const files = new Set([file.path]);

function pass(mode: "import" | "require"): Record<string, unknown> {
  return { id: `fallback-${mode}`, compilerSettingsRef: null, sourceFiles: [file.path], compilerOptions: {}, aliases: [],
    conditionNames: [mode, "default"], moduleSystems: mode === "import" ? ["es6", "tsd"] : ["cjs"], roots: [] };
}

function profile(contexts: unknown[]): Record<string, unknown> {
  return { formatVersion: 1, snapshotRef: "snapshot-check", attemptId: "s4-check", sourceFiles: [file], contexts };
}

describe("the graph profile checks of the Stage 4 graph helper", () => {
  test("accept an import pass and a require pass over every scan file", () => {
    expect(() => validateProfile(profile([pass("import"), pass("require")]))).not.toThrow();
  });

  test("refuse a profile in which a scan file has no require pass", () => {
    expect(() => validateProfile(profile([pass("import")])))
      .toThrow(new Error("Every saved scan file needs at least one require context."));
  });

  test("refuse a pass that reads CommonJS and ES module syntax together", () => {
    const mixed = { ...pass("require"), moduleSystems: ["cjs", "es6", "tsd"] };
    expect(() => validateContext(mixed, files)).toThrow(new Error("Use separate import and require conditions: fallback-require"));
  });

  test("refuse a pass whose condition is not the condition of its module systems", () => {
    const crossed = { ...pass("import"), conditionNames: ["require", "default"] };
    expect(() => validateContext(crossed, files)).toThrow(new Error("Use separate import and require conditions: fallback-import"));
  });
});
