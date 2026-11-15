import { describe, expect, test } from "bun:test";
import { ts } from "ts-morph";
import { choomDefaultProfile, namedParsingProfile } from "../../src/parsing-profile.ts";

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

describe("the parsing profile that a settings record names", () => {
  test("is none when the record names no profile", () => {
    expect(namedParsingProfile({ configs: [], parsingProfile: null })).toBeNull();
    expect(namedParsingProfile({ configs: [] })).toBeNull();
  });

  test("is the Choom parsing profile when the record names it", () => {
    expect(namedParsingProfile({ configs: [], parsingProfile: structuredClone(choomDefaultProfile) })).toBe(choomDefaultProfile);
  });

  test("is refused when the record names an unknown profile", () => {
    expect(() => namedParsingProfile({ parsingProfile: { ...choomDefaultProfile, id: "choom-default-v9" } }))
      .toThrow(new Error("The settings record names an unknown parsing profile: choom-default-v9"));
  });
});
