import { describe, expect, test } from "bun:test";
import { validateContext, validateProfile } from "../../src/stage-4-graph.ts";

// The checks of the saved graph profile that the Stage 4 graph helper makes before
// it runs dependency-cruiser. An import pass reads ES module syntax with the import
// condition, and a require pass reads CommonJS syntax with the require condition.
// Every scan file needs both. A CommonJS pass reads both syntaxes with the require
// condition for the files whose compiled code is CommonJS; the import pass of the
// same files names them too.
const file = { path: "app.ts", sha256: "a".repeat(64) };
const files = new Set([file.path]);
const compiledToCommonJS = { files: [file.path], dynamicImportCondition: "require" };
const passes = {
  import: { conditionNames: ["import", "default"], moduleSystems: ["es6", "tsd"] },
  require: { conditionNames: ["require", "default"], moduleSystems: ["cjs"] },
  commonjs: { conditionNames: ["require", "default"], moduleSystems: ["es6", "tsd", "cjs"] },
};

function pass(kind: keyof typeof passes, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: `fallback-${kind}`, compilerSettingsRef: null, sourceFiles: [file.path], compilerOptions: {}, aliases: [],
    ...passes[kind], roots: [], ...fields };
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

  test("accept a CommonJS pass when it and the import pass name the files whose compiled code is CommonJS", () => {
    for (const dynamicImportCondition of ["import", "require"]) {
      const compiled = { compiledToCommonJS: { ...compiledToCommonJS, dynamicImportCondition } };
      expect(() => validateProfile(profile([pass("import", compiled), pass("require"), pass("commonjs", compiled)]))).not.toThrow();
    }
  });

  test("refuse a CommonJS pass without the files whose compiled code is CommonJS", () => {
    expect(() => validateContext(pass("commonjs"), files))
      .toThrow(new Error("A CommonJS pass needs the files whose compiled code is CommonJS: fallback-commonjs"));
  });

  test("refuse files whose compiled code is CommonJS on a require pass, outside the scan files, or without a condition", () => {
    const invalid = [
      pass("require", { compiledToCommonJS }),
      pass("import", { compiledToCommonJS: { ...compiledToCommonJS, files: ["other.ts"] } }),
      pass("import", { compiledToCommonJS: { ...compiledToCommonJS, files: [] } }),
      pass("commonjs", { compiledToCommonJS: { ...compiledToCommonJS, dynamicImportCondition: "default" } }),
      pass("commonjs", { compiledToCommonJS: { ...compiledToCommonJS, extra: true } }),
    ];
    for (const context of invalid)
      expect(() => validateContext(context, files))
        .toThrow(new Error("Invalid files whose compiled code is CommonJS: " + String(context.id)));
  });

  test("refuse an import pass and a CommonJS pass that do not name the same files whose compiled code is CommonJS", () => {
    const compiled = { compiledToCommonJS };
    const other = { compiledToCommonJS: { ...compiledToCommonJS, dynamicImportCondition: "import" } };
    const message = new Error("The import passes and the CommonJS passes must name the same files whose compiled code is CommonJS.");
    expect(() => validateProfile(profile([pass("import", compiled), pass("require")]))).toThrow(message);
    expect(() => validateProfile(profile([pass("import"), pass("require"), pass("commonjs", compiled)]))).toThrow(message);
    expect(() => validateProfile(profile([pass("import", compiled), pass("require"), pass("commonjs", other)]))).toThrow(message);
  });

  test("refuse a pass whose condition is not the condition of its module systems", () => {
    for (const [kind, conditionNames] of [["import", ["require", "default"]], ["require", ["import", "default"]],
      ["commonjs", ["import", "default"]]] as const) {
      const crossed = pass(kind, kind === "commonjs" ? { conditionNames, compiledToCommonJS } : { conditionNames });
      expect(() => validateContext(crossed, files)).toThrow(new Error(`Use separate import and require conditions: fallback-${kind}`));
    }
  });
});
