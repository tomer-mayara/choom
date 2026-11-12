import { expect, test } from "bun:test";
import { routeInterfaceArcs } from "../../../src/lib/interface-arc-geometry.ts";
import { interfaceArcs } from "../../../src/lib/interface-arcs.ts";
import { interfaceArcBaseline } from "../../support/interface-arc-fixtures.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { interfaceInspectionBaseline } from "../../support/interface-inspection-fixtures.ts";

test("a nested permission joins the actual parent and child header borders", () => {
  const routes = routeInterfaceArcs(interfaceArcs(interfaceArcBaseline("nested")), { nodes: [
    { id: "checkout", position: { x: 100, y: 200 }, width: 400, height: 400 },
    { id: "billing", parentId: "checkout", position: { x: 24, y: 112 }, width: 240, height: 88 },
  ] });
  const route = fixtureItem(routes);
  expect(route.start.y).toBeGreaterThanOrEqual(201);
  expect(route.start.y).toBeLessThanOrEqual(289);
  expect(route.start.x).toBeGreaterThanOrEqual(101);
  expect(route.start.x).toBeLessThanOrEqual(341);
  expect(route.end.x).toBeGreaterThanOrEqual(124);
  expect(route.end.x).toBeLessThanOrEqual(364);
  expect(route.end.y).toBeGreaterThanOrEqual(312);
  expect(route.end.y).toBeLessThanOrEqual(400);
  expect([route.start, route.end, ...route.controls, route.label].flatMap(({ x, y }) => [x, y]).every(Number.isFinite)).toBe(true);
});

test("group border insets apply to both arc directions and self-loops without moving descendant geometry", () => {
  const geometry = { nodes: [
    { id: "checkout", position: { x: 100, y: 200 }, width: 400, height: 400 },
    { id: "billing", parentId: "checkout", position: { x: 24, y: 112 }, width: 240, height: 88 },
  ] };
  const before = structuredClone(geometry);
  const routes = routeInterfaceArcs(interfaceArcs(interfaceArcBaseline("nested group arcs")), geometry);
  const headers = new Map([["checkout", { x: 101, y: 201 }], ["billing", { x: 124, y: 312 }]]);
  expect(routes).toHaveLength(3);
  for (const route of routes) {
    for (const [id, point] of [[route.consumerId, route.start], [route.ownerId, route.end]] as const) {
      const header = headers.get(id);
      if (!header) throw new Error("The route needs an actual header.");
      const vertical = (point.x === header.x || point.x === header.x + 240) && point.y >= header.y && point.y <= header.y + 88;
      const horizontal = (point.y === header.y || point.y === header.y + 88) && point.x >= header.x && point.x <= header.x + 240;
      expect(vertical || horizontal).toBe(true);
    }
  }
  expect(geometry).toEqual(before);
});

test.each(["parallel", "opposite"])("%s permissions use distinct stable curves and separate labels", (example) => {
  const arcs = interfaceArcs(interfaceArcBaseline(example));
  const geometry = { nodes: [
    { id: "checkout", position: { x: 0, y: 0 }, width: 240, height: 88 },
    { id: "billing", position: { x: 300, y: 0 }, width: 240, height: 88 },
  ] };
  const routes = routeInterfaceArcs(arcs, geometry);
  const shapes = routes.map(({ start, controls, end }) => JSON.stringify([start, ...controls, end].sort((a, b) => a.x - b.x || a.y - b.y)));
  expect(new Set(shapes).size).toBe(2);
  const first = fixtureItem(routes);
  const second = fixtureItem(routes, 1);
  expect(Math.abs(first.label.x - second.label.x) >= 240 || Math.abs(first.label.y - second.label.y) >= 48).toBe(true);
  expect(routeInterfaceArcs(arcs, geometry)).toEqual(routes);
});

test("an owner consuming its own interface has a finite loop outside its header", () => {
  const route = fixtureItem(routeInterfaceArcs(interfaceArcs(interfaceArcBaseline("self")), { nodes: [
    { id: "billing", position: { x: 100, y: 200 }, width: 240, height: 88 },
  ] }));
  expect(route.start).not.toEqual(route.end);
  expect(route.start.x).toBe(340);
  expect(route.end.x).toBe(340);
  expect(route.start.y).toBeGreaterThan(200);
  expect(route.end.y).toBeLessThan(288);
  expect(route.label.x).toBeGreaterThan(340 + 120);
  expect([route.start, route.end, ...route.controls, route.label].flatMap(({ x, y }) => [x, y]).every(Number.isFinite)).toBe(true);
});

test.each([false, true])("two consumers in a small grid keep labels and curves outside headers: reverse=%s", (reverse) => {
  const geometry = { nodes: [
    { id: "checkout", position: { x: 0, y: 0 }, width: 240, height: 88 },
    { id: "billing", position: { x: 280, y: 0 }, width: 240, height: 88 },
    { id: "reporting", position: { x: 0, y: 128 }, width: 240, height: 88 },
  ] };
  const baseline = reverse ? interfaceInspectionBaseline() : interfaceArcBaseline("two consumers");
  const routes = routeInterfaceArcs(interfaceArcs(baseline), geometry);
  for (const route of routes) {
    for (const { position } of geometry.nodes) {
      const labelOverlaps = route.label.x - 120 < position.x + 240 && route.label.x + 120 > position.x
        && route.label.y - 24 < position.y + 88 && route.label.y + 24 > position.y;
      expect(labelOverlaps).toBe(false);
      for (let index = 1; index < 20; index += 1) {
        const t = index / 20;
        const point = { x: (1 - t) ** 3 * route.start.x + 3 * (1 - t) ** 2 * t * route.controls[0].x
          + 3 * (1 - t) * t ** 2 * route.controls[1].x + t ** 3 * route.end.x,
        y: (1 - t) ** 3 * route.start.y + 3 * (1 - t) ** 2 * t * route.controls[0].y
          + 3 * (1 - t) * t ** 2 * route.controls[1].y + t ** 3 * route.end.y };
        expect(point.x > position.x && point.x < position.x + 240 && point.y > position.y && point.y < position.y + 88).toBe(false);
      }
    }
  }
});

test("self-loops on a left component remain outside its neighboring header", () => {
  const baseline = interfaceArcBaseline("self beside neighbor");
  baseline.interfaces.push({ ...structuredClone(fixtureItem(baseline.interfaces)), id: "checkout-events" });
  const routes = routeInterfaceArcs(interfaceArcs(baseline), { nodes: [
    { id: "checkout", position: { x: 0, y: 0 }, width: 240, height: 88 },
    { id: "billing", position: { x: 280, y: 0 }, width: 240, height: 88 },
    { id: "reporting", position: { x: 0, y: 128 }, width: 240, height: 88 },
  ] });
  for (const route of routes) {
    const overlapsNeighbor = route.label.x - 120 < 520 && route.label.x + 120 > 280
      && route.label.y - 24 < 88 && route.label.y + 24 > 0;
    expect(overlapsNeighbor).toBe(false);
    expect(route.start.x).toBe(0);
    expect(route.end.x).toBe(0);
  }
  expect(Math.abs(fixtureItem(routes).label.x - fixtureItem(routes, 1).label.x)).toBeGreaterThanOrEqual(240);
});
