import { expect, test } from "bun:test";
import { layoutBaseline } from "../../../src/lib/architecture-layout.ts";
import { baselineExample } from "../../support/baseline-fixtures.ts";

test("layout places every modeled component without changing the baseline", async () => {
  const baseline = baselineExample();
  const original = structuredClone(baseline);
  const layout = await layoutBaseline(baseline);
  expect(layout.nodes.map(({ id }) => id)).toEqual(["checkout", "billing"]);
  expect(layout.nodes.every(({ position }) => Number.isFinite(position.x) && Number.isFinite(position.y))).toBe(true);
  expect(new Set(layout.nodes.map(({ position }) => `${position.x}:${position.y}`)).size).toBe(2);
  expect(baseline).toEqual(original);
});

test("layout leaves an empty component model empty", async () => {
  const baseline = baselineExample();
  baseline.components = [];
  expect(await layoutBaseline(baseline)).toEqual({ nodes: [] });
});
