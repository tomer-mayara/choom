import { expect, test } from "bun:test";
import { interfaceArcs } from "../../../src/lib/interface-arcs.ts";
import { shownInterfaceArcs } from "../../../src/lib/interface-arc-visibility.ts";
import { connectionScopeBaseline } from "../../support/connection-scope-fixtures.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";

test("scope projection preserves complete facts and recorded order", () => {
  const baseline = connectionScopeBaseline();
  const original = structuredClone(baseline);
  const arcs = interfaceArcs(baseline);
  expect(shownInterfaceArcs(arcs, { mode: "selected" })).toEqual([]);
  expect(shownInterfaceArcs(arcs, { mode: "selected", componentId: "checkout" })).toEqual([fixtureItem(arcs), fixtureItem(arcs, 2)]);
  expect(shownInterfaceArcs(arcs, { mode: "selected", componentId: "billing" })).toEqual(arcs.slice(0, 3));
  expect(shownInterfaceArcs(arcs, { mode: "all" })).toBe(arcs);
  expect(arcs).toHaveLength(4);
  expect(baseline).toEqual(original);
});

test("component context takes precedence over an owned interface, and a standalone interface has its own scope", () => {
  const arcs = interfaceArcs(connectionScopeBaseline());
  expect(shownInterfaceArcs(arcs, { mode: "selected", componentId: "billing", interfaceId: "invoice-api" })).toEqual(arcs.slice(0, 3));
  expect(shownInterfaceArcs(arcs, { mode: "selected", interfaceId: "invoice-api" })).toEqual(arcs.slice(0, 2));
  expect(shownInterfaceArcs(arcs, { mode: "selected", componentId: "unrelated-parent" })).toEqual([]);
});

test("visibility preserves routed values and stable object identity", () => {
  const routes = interfaceArcs(connectionScopeBaseline()).map((arc, index) => ({ ...arc, path: `route-${index}` }));
  const shown = shownInterfaceArcs(routes, { mode: "selected", componentId: "checkout" });
  expect(shown[0]).toBe(routes[0]);
  expect(shown[1]).toBe(routes[2]);
  expect(shown.map(({ path }) => path)).toEqual(["route-0", "route-2"]);
});
