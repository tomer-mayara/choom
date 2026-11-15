import { describe, expect, test } from "bun:test";
import { ts } from "ts-morph";
import { choomDefaultProfile } from "../../src/parsing-profile.ts";

describe("the Choom parsing profile choom-default-v1", () => {
  test("has fixed compiler options in the tsconfig.json form", () => {
    expect(choomDefaultProfile.id).toBe("choom-default-v1");
    expect(choomDefaultProfile.declared).toEqual({ compilerOptions: { allowJs: true, jsx: "preserve", module: "preserve",
      moduleResolution: "bundler", target: "es2025" } });
  });

  // Stage 4 and ts-morph take the parsed form. The pinned TypeScript of ts-morph,
  // which the settings collector also uses, gives the same values.
  test("gives the same options in the form that the TypeScript API parses", () => {
    const parsed = ts.convertCompilerOptionsFromJson(choomDefaultProfile.declared.compilerOptions, "/repo");
    expect(parsed.errors).toEqual([]);
    expect(choomDefaultProfile.compilerOptions).toEqual(parsed.options as Record<string, number | boolean>);
    expect(choomDefaultProfile.compilerOptions).toEqual({ allowJs: true, jsx: ts.JsxEmit.Preserve, module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2025 });
  });

  test("lists its assumptions in plain text, and names each option in them", () => {
    const { assumptions } = choomDefaultProfile;
    expect(assumptions.length).toBeGreaterThan(0);
    for (const assumption of assumptions) expect(assumption).toMatch(/^[A-Z][^\n<>`*]*\.$/);
    for (const [name, value] of Object.entries(choomDefaultProfile.declared.compilerOptions))
      expect(assumptions.some((assumption) => assumption.includes(`(${name}: ${String(value)})`))).toBe(true);
  });
});
