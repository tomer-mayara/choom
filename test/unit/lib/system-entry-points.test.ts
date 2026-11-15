import { expect, test } from "bun:test";
import { systemEntryCounts, systemEntryReview } from "../../../src/lib/system-entry-points.ts";
import { baselineExample, fixtureItem } from "../../support/baseline-fixtures.ts";
import { markedSystemEntryPointsBaseline } from "../../support/system-entry-points-fixtures.ts";

test("count entries on direct owners without grouping shared handlers or counting them on the parent", () => {
  const baseline = markedSystemEntryPointsBaseline(20);
  const before = structuredClone(baseline);
  const counts = systemEntryCounts(baseline.systemEntryPoints.entries);
  expect([...counts]).toEqual([
    ["checkout", { startup: 1, external: 0 }],
    ["billing", { startup: 0, external: 20 }],
  ]);
  expect(counts.has("commerce")).toBe(false);
  expect(baseline).toEqual(before);
});

test("one component can own Startup and External entries", () => {
  const baseline = markedSystemEntryPointsBaseline();
  fixtureItem(baseline.systemEntryPoints.entries).componentId = "billing";
  expect([...systemEntryCounts(baseline.systemEntryPoints.entries)]).toEqual([
    ["billing", { startup: 1, external: 3 }],
  ]);
});

test.each([4, 5] as const)("version %i keeps its saved entry review", (formatVersion) => {
  const baseline = { ...markedSystemEntryPointsBaseline(), formatVersion };
  expect(systemEntryReview(baseline)).toEqual({ assessment: baseline.systemEntryPoints, notices: [] });
});

test.each([1, 2, 3] as const)("version %i has no entry review", (formatVersion) => {
  expect(systemEntryReview({ ...baselineExample(), formatVersion })).toEqual({
    assessment: undefined, notices: ["Entry points not recorded"],
  });
});
