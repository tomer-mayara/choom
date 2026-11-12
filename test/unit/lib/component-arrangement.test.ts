import { expect, test } from "bun:test";
import { ComponentArrangement } from "../../../src/lib/component-arrangement.ts";
import { layoutBaseline } from "../../../src/lib/architecture-layout.ts";
import { baselineAtComponentLimits } from "../../support/baseline-layout-fixtures.ts";

function prepared() {
  return Object.freeze({ nodes: Object.freeze([
    { id: "root", position: { x: 100, y: 100 }, width: 700, height: 500 },
    { id: "workspace", parentId: "root", position: { x: 24, y: 112 }, width: 300, height: 330 },
    { id: "model", parentId: "workspace", position: { x: 24, y: 112 }, width: 240, height: 88 },
    { id: "adapter", parentId: "workspace", position: { x: 24, y: 224 }, width: 240, height: 88 },
    { id: "native", parentId: "root", position: { x: 360, y: 112 }, width: 240, height: 88 },
  ].map((node) => Object.freeze({ ...node, position: Object.freeze(node.position) }))) });
}

test("a component arrangement owns its geometry without changing the prepared layout", () => {
  const layout = prepared();
  const arrangement = new ComponentArrangement(layout);
  expect(arrangement.getSnapshot()).toEqual(layout);
  expect(arrangement.getSnapshot()).not.toBe(layout);
  arrangement.moveBy("workspace", { x: 35, y: 25 });
  expect(layout.nodes[1]?.position).toEqual({ x: 24, y: 112 });
});

test("moving a parent carries children through their unchanged relative positions", () => {
  const arrangement = new ComponentArrangement(prepared());
  const modelBefore = arrangement.positionOf("model");
  const nativeBefore = arrangement.positionOf("native");
  arrangement.moveBy("workspace", { x: 35, y: 25 });
  expect(arrangement.positionOf("model")).toEqual({ x: modelBefore.x + 35, y: modelBefore.y + 25 });
  expect(arrangement.getSnapshot().nodes.find(({ id }) => id === "model")?.position).toEqual({ x: 24, y: 112 });
  expect(arrangement.positionOf("native")).toEqual(nativeBefore);
});

test("subscribers observe each changed geometry and can detach", () => {
  const arrangement = new ComponentArrangement(prepared());
  let notifications = 0;
  const unsubscribe = arrangement.subscribe(() => { notifications += 1; });
  arrangement.moveBy("workspace", { x: 10, y: 0 });
  expect(notifications).toBe(1);
  unsubscribe();
  arrangement.moveBy("workspace", { x: 10, y: 0 });
  expect(notifications).toBe(1);
});

test("children stop at the left edge and below the parent header", () => {
  const arrangement = new ComponentArrangement(prepared());
  arrangement.moveBy("model", { x: -1000, y: -1000 });
  expect(arrangement.getSnapshot().nodes.find(({ id }) => id === "model")?.position).toEqual({ x: 0, y: 88 });
  expect(arrangement.positionOf("workspace")).toEqual({ x: 124, y: 212 });
});

test("moving a child grows every enclosing bound without shifting siblings or origins", () => {
  const arrangement = new ComponentArrangement(prepared());
  const before = arrangement.getSnapshot();
  arrangement.moveBy("model", { x: 800, y: 900 });
  const after = arrangement.getSnapshot();
  expect(after.nodes.find(({ id }) => id === "workspace")).toMatchObject({
    position: { x: 24, y: 112 }, width: 1064, height: 1100,
  });
  expect(after.nodes.find(({ id }) => id === "root")).toMatchObject({
    position: { x: 100, y: 100 }, width: 1088, height: 1212,
  });
  expect(after.nodes.find(({ id }) => id === "adapter")).toEqual(before.nodes.find(({ id }) => id === "adapter"));
  expect(before.nodes.find(({ id }) => id === "model")?.position).toEqual({ x: 24, y: 112 });
});

test("invalid coordinates and unknown components cannot change view geometry", () => {
  const arrangement = new ComponentArrangement(prepared());
  const before = arrangement.getSnapshot();
  expect(() => arrangement.moveBy("model", { x: Number.NaN, y: 0 })).toThrow();
  expect(() => arrangement.moveBy("model", { x: 0, y: Infinity })).toThrow();
  expect(() => arrangement.moveBy("missing", { x: 10, y: 0 })).toThrow();
  expect(arrangement.getSnapshot()).toEqual(before);
});

test("cancelling a drag restores bounds and rejects its later updates and finish", () => {
  const arrangement = new ComponentArrangement(prepared());
  const before = arrangement.getSnapshot();
  const drag = arrangement.beginDrag("model");
  drag.moveTo({ x: 824, y: 1012 });
  expect(arrangement.getSnapshot()).not.toEqual(before);
  arrangement.cancelDrag();
  drag.moveTo({ x: 500, y: 500 });
  drag.finish();
  expect(arrangement.getSnapshot()).toEqual(before);
});

test("a finished drag keeps its changes and cannot affect a fresh arrangement with reused IDs", () => {
  const initial = prepared();
  const previous = new ComponentArrangement(initial);
  const drag = previous.beginDrag("model");
  drag.moveTo({ x: 50, y: 120 });
  drag.finish();
  previous.cancelDrag();
  expect(previous.getSnapshot().nodes.find(({ id }) => id === "model")?.position).toEqual({ x: 50, y: 120 });
  const current = new ComponentArrangement(initial);
  drag.moveTo({ x: 900, y: 900 });
  expect(current.getSnapshot()).toEqual(initial);
});

test("reset restores prepared positions and grown bounds without changing the prepared layout", () => {
  const initial = prepared();
  const arrangement = new ComponentArrangement(initial);
  arrangement.moveBy("workspace", { x: 35, y: 25 });
  arrangement.moveBy("model", { x: 800, y: 900 });
  expect(arrangement.getSnapshot()).not.toEqual(initial);
  arrangement.reset();
  expect(arrangement.getSnapshot()).toEqual(initial);
  expect(arrangement.positionOf("model")).toEqual({ x: 148, y: 324 });
  arrangement.moveBy("model", { x: 50, y: 50 });
  arrangement.reset();
  expect(arrangement.getSnapshot()).toEqual(initial);
  expect(initial.nodes[1]?.width).toBe(300);
});

test.each([false, true])("reset ends a pending or active drag and ignores stale updates: moved=%s", (moved) => {
  const initial = prepared();
  const arrangement = new ComponentArrangement(initial);
  arrangement.moveBy("workspace", { x: 35, y: 25 });
  const drag = arrangement.beginDrag("model");
  if (moved) drag.moveTo({ x: 824, y: 1012 });
  arrangement.reset();
  drag.moveTo({ x: 900, y: 900 });
  drag.finish();
  arrangement.cancelDrag();
  expect(arrangement.getSnapshot()).toEqual(initial);
});

test("repeated reset is stable and empty geometry remains empty", () => {
  for (const initial of [prepared(), { nodes: [] }]) {
    const arrangement = new ComponentArrangement(initial);
    let notifications = 0;
    arrangement.subscribe(() => { notifications += 1; });
    arrangement.reset();
    arrangement.reset();
    expect(arrangement.getSnapshot()).toEqual(initial);
    expect(notifications).toBe(0);
  }
});

test("movement and rollback preserve finite containment at the supported component and depth limits", async () => {
  const initial = await layoutBaseline(baselineAtComponentLimits());
  const arrangement = new ComponentArrangement(initial);
  const leaf = initial.nodes.at(-1);
  if (!leaf) throw new Error("The limit fixture must have components.");
  const drag = arrangement.beginDrag(leaf.id);
  drag.moveTo({ x: leaf.position.x + 500, y: leaf.position.y + 500 });
  const nodes = new Map(arrangement.getSnapshot().nodes.map((node) => [node.id, node]));
  expect(nodes.size).toBe(500);
  for (const node of nodes.values()) {
    expect([node.position.x, node.position.y, node.width, node.height].every(Number.isFinite)).toBe(true);
    if (!node.parentId) continue;
    const parent = nodes.get(node.parentId);
    if (!parent) throw new Error("Every nested component must keep its parent.");
    expect(node.position.x + node.width <= parent.width).toBe(true);
    expect(node.position.y + node.height <= parent.height).toBe(true);
    expect(node.position.y >= 88).toBe(true);
  }
  arrangement.cancelDrag();
  expect(arrangement.getSnapshot()).toEqual(initial);
});
