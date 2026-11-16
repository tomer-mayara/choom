import { describe, expect, test } from "bun:test";
import { baselineSchema } from "../../src/baseline.ts";
import { supportsSourceUsage, supportsSymbolSelectors, supportsSystemEntryPoints } from "../../src/baseline-format.ts";
import { baselineExample, fixtureItem } from "../../../../test/support/baseline-fixtures.ts";
import { systemEntryPointsBaseline } from "../../../../test/support/system-entry-points-fixtures.ts";

function issuePaths(input: unknown): string[] {
  const result = baselineSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
}

function versionFive() {
  return { ...systemEntryPointsBaseline(), formatVersion: 5 as const };
}

describe("format features by version", () => {
  test.each([
    [1, false, false, false], [2, false, false, false], [3, true, false, false], [4, true, true, false], [5, true, true, true],
  ] as const)("version %i: source use %p, system entry points %p, symbol selectors %p", (formatVersion, source, entries, symbols) => {
    const baseline = { ...baselineExample(), formatVersion };
    expect(supportsSourceUsage(baseline)).toBe(source);
    expect(supportsSystemEntryPoints(baseline)).toBe(entries);
    expect(supportsSymbolSelectors(baseline)).toBe(symbols);
  });
});

describe("version 5 keeps the version 2 to 4 rules", () => {
  test("keeps documentation, source use, and system entry points", () => {
    const input = versionFive();
    expect(baselineSchema.parse(input)).toEqual(input);
  });

  test("validates documentation links", () => {
    const input = versionFive();
    fixtureItem(fixtureItem(input.interfaces).documentation.entries).accessPoint = "missing";
    expect(issuePaths(input)).toContain("interfaces.0.documentation.entries.0.accessPoint");
  });

  test("validates source uses", () => {
    const input = versionFive();
    fixtureItem(fixtureItem(input.sourceUsage.assessments).uses).consumerId = "missing";
    expect(issuePaths(input)).toContain("sourceUsage.assessments.0.uses.0.consumerId");
  });

  test("validates system entries and their shared mapping with source use", () => {
    const input = versionFive();
    fixtureItem(input.systemEntryPoints.entries).componentId = "missing";
    input.systemEntryPoints.mappingRef = "other-mapping";
    expect(issuePaths(input)).toEqual(expect.arrayContaining([
      "systemEntryPoints.entries.0.componentId", "systemEntryPoints.mappingRef",
    ]));
  });

  test("keeps the system entry limit", () => {
    const input = versionFive();
    const first = fixtureItem(input.systemEntryPoints.entries);
    input.systemEntryPoints.entries = Array.from({ length: 2001 }, (_, index) => ({ ...first, id: `start-${index}` }));
    expect(issuePaths(input)).toContain("systemEntryPoints.entries");
  });
});
