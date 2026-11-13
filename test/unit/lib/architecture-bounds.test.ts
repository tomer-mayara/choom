import { expect, test } from "bun:test";
import { drawingBounds } from "../../../src/lib/architecture-bounds.ts";
import { routeInterfaceArcs } from "../../../src/lib/interface-arc-geometry.ts";
import { interfaceArcs } from "../../../src/lib/interface-arcs.ts";
import { interfaceViewBaseline } from "../../support/interface-view-fixtures.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { shownInterfaceArcs } from "../../../src/lib/interface-arc-visibility.ts";

const geometry = { nodes: [
  { id: "checkout", position: { x: -280, y: -128 }, width: 240, height: 88 },
  { id: "billing", position: { x: 0, y: 0 }, width: 240, height: 88 },
] };

test("drawing bounds contain curved paths and an outside self-loop, including negative coordinates", () => {
  const arcs = routeInterfaceArcs(interfaceArcs(interfaceViewBaseline()), geometry);
  const bounds = drawingBounds(geometry, arcs);
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("The drawing must have bounds.");
  for (const route of arcs) {
    for (const point of [route.start, ...route.controls, route.end]) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.x);
      expect(point.y).toBeGreaterThanOrEqual(bounds.y);
      expect(point.x).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(point.y).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  }
  expect(bounds.x).toBeLessThan(0);
  expect(bounds.y).toBeLessThan(0);
});

test("empty and component-only drawing bounds preserve the prepared component bounds", () => {
  expect(drawingBounds({ nodes: [] }, [])).toBeNull();
  expect(drawingBounds(geometry, [])).toEqual({ x: -280, y: -128, width: 520, height: 216 });
});

test("measured label size extends Fit beyond the curve, including enlarged text", () => {
  const arcs = routeInterfaceArcs(interfaceArcs(interfaceViewBaseline()), geometry);
  const loop = fixtureItem(arcs, 1);
  const bounds = drawingBounds(geometry, arcs, new Map([[loop.id, { width: 240, height: 60 }]]));
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("The label needs drawing bounds.");
  expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(loop.label.x + 120);
  expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(loop.label.y + 30);
});

test("a highlighted arrowhead and stroke fit outside a flat path's bounds", () => {
  const route = { id: "arc", interfaceId: "api", consumerId: "consumer", ownerId: "owner", path: "M 0 0 C 3 0 7 0 10 0",
    start: { x: 0, y: 0 }, controls: [{ x: 3, y: 0 }, { x: 7, y: 0 }] as [{ x: number; y: number }, { x: number; y: number }],
    end: { x: 10, y: 0 }, label: { x: 5, y: 0 } };
  const bounds = drawingBounds({ nodes: [] }, [route]);
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("The arrow needs drawing bounds.");
  // React Flow's 12.5-unit marker viewport scales with the 3-unit highlighted stroke.
  expect(bounds.y).toBeLessThanOrEqual(-9);
  expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(9);
  expect(bounds.x).toBeLessThanOrEqual(-1.5);
  expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(11.5);
});

test("excluded routes and their label measurements cannot enlarge the shown drawing bounds", () => {
  const routes = routeInterfaceArcs(interfaceArcs(interfaceViewBaseline()), geometry);
  const loop = fixtureItem(routes, 1);
  const shown = shownInterfaceArcs(routes, { mode: "all", showSelfConnections: false });
  const measurements = new Map([[loop.id, { width: 1_000_000, height: 1_000_000 }]]);
  expect(shown).toHaveLength(1);
  expect(drawingBounds(geometry, shown, measurements)).toEqual(drawingBounds(geometry, shown));
  expect(drawingBounds(geometry, [], measurements)).toEqual(drawingBounds(geometry, []));
});
