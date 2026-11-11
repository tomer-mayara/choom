import { expect, test } from "bun:test";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import { layoutBaseline } from "../../../src/lib/architecture-layout.ts";
import { componentControlHeight, componentControlWidth } from "../../../src/lib/component-geometry.ts";
import { baselineExample, proposed, reviewedBaseline } from "../../support/baseline-fixtures.ts";
import {
  baselineOverDisplayLimit, baselineWithComponents, baselineWithLinks,
  baselineWithParentLevels, baselineWithRecords, baselineWithRules,
} from "../../support/baseline-layout-fixtures.ts";
import { baselineWithoutComponents } from "../../support/baseline-relationship-fixtures.ts";

test("layout places only components without changing any baseline record", async () => {
  const baseline = baselineExample();
  const original = structuredClone(baseline);
  const layout = await layoutBaseline(baseline);
  expect(layout.nodes.map(({ id }) => id)).toEqual(["checkout", "billing"]);
  expect(layout.nodes.every(({ position }) => Number.isFinite(position.x) && Number.isFinite(position.y))).toBe(true);
  expect(new Set(layout.nodes.map(({ position }) => `${position.x}:${position.y}`)).size).toBe(2);
  expect(baseline).toEqual(original);
});

test("records without components need no layout and remain unchanged", async () => {
  const baseline = baselineWithoutComponents();
  const original = structuredClone(baseline);
  let arranged = false;
  const result = await layoutBaseline(baseline, async (graph) => { arranged = true; return graph; });
  expect(result).toEqual({ nodes: [] });
  expect(arranged).toBe(false);
  expect(baseline).toEqual(original);
});

test("the reviewed component overview fits a normal window at 100 percent", async () => {
  const { nodes } = await layoutBaseline(baselineSchema.parse(reviewedBaseline("full")));
  const roots = nodes.filter(({ parentId }) => !parentId);
  const width = Math.max(...roots.map(({ position, width }) => position.x + width)) - Math.min(...roots.map(({ position }) => position.x));
  const height = Math.max(...roots.map(({ position, height }) => position.y + height)) - Math.min(...roots.map(({ position }) => position.y));
  expect(width + 48).toBeLessThanOrEqual(1280);
  expect(height + 48).toBeLessThanOrEqual(688);
});

test("layout nests the reviewed components with complete geometry and parents before children", async () => {
  const baseline = baselineSchema.parse(reviewedBaseline("full"));
  baseline.components.reverse();
  const original = structuredClone(baseline);
  const { nodes } = await layoutBaseline(baseline);
  expect(new Set(nodes.map(({ id }) => id))).toEqual(new Set(baseline.components.map(({ id }) => id)));
  expect(nodes.every((node) => Number.isFinite(node.width) && node.width > 0
    && Number.isFinite(node.height) && node.height > 0)).toBe(true);
  const positions = new Map(nodes.map((node, index) => [node.id, { node, index }]));
  for (const component of baseline.components) {
    const prepared = positions.get(component.id);
    expect(prepared).toBeDefined();
    const parentId = component.parent?.value ?? undefined;
    expect(prepared?.node.parentId).toBe(parentId);
    if (!prepared || !parentId) continue;
    const parent = positions.get(parentId);
    expect(parent).toBeDefined();
    if (!parent) throw new Error("The parent must be prepared.");
    expect(parent.index).toBeLessThan(prepared.index);
    expect(prepared.node.position.x).toBeGreaterThanOrEqual(0);
    expect(prepared.node.position.y).toBeGreaterThanOrEqual(componentControlHeight);
    expect(prepared.node.position.x + prepared.node.width).toBeLessThanOrEqual(parent.node.width);
    expect(prepared.node.position.y + prepared.node.height).toBeLessThanOrEqual(parent.node.height);
  }
  expect(baseline).toEqual(original);
});

test("multiple component roots remain separate roots with finite positions", async () => {
  const baseline = baselineWithComponents(4);
  const { nodes } = await layoutBaseline(baseline);
  expect(nodes).toHaveLength(4);
  expect(nodes.every((node) => node.parentId === undefined && Number.isFinite(node.position.x)
    && Number.isFinite(node.position.y) && node.width >= componentControlWidth && node.height >= componentControlHeight)).toBe(true);
  expect(new Set(nodes.map(({ position }) => `${position.x}:${position.y}`)).size).toBe(4);
});

test("a sixteen-level chain keeps each child inside its recorded parent", async () => {
  const { nodes } = await layoutBaseline(baselineWithParentLevels(16));
  expect(nodes).toHaveLength(16);
  for (const [index, node] of nodes.entries()) {
    if (index === 0) { expect(node.parentId).toBeUndefined(); continue; }
    const parent = nodes[index - 1];
    expect(node.parentId).toBe(parent?.id);
    expect(node.position.y).toBeGreaterThanOrEqual(componentControlHeight);
    expect(node.position.x + node.width).toBeLessThanOrEqual(parent?.width ?? 0);
    expect(node.position.y + node.height).toBeLessThanOrEqual(parent?.height ?? 0);
  }
});

test.each(["total record count", "rules-only record count", "explicit link count", "parent depth"])(
  "layout refuses excessive %s before it calls the layout engine",
  async (limit) => {
    let arranged = false;
    await expect(layoutBaseline(baselineOverDisplayLimit(limit), async () => {
      arranged = true;
      throw new Error("The layout engine started.");
    })).rejects.toThrow("Too large to display");
    expect(arranged).toBe(false);
  },
);

test("the record limit accepts exactly 500 records across all four collections", async () => {
  const baseline = baselineWithRecords(500);
  const result = await layoutBaseline(baseline);
  expect(result.nodes).toHaveLength(125);
});

test("exactly 500 rules need no component layout", async () => {
  let arranged = false;
  const result = await layoutBaseline(baselineWithRules(500), async (graph) => {
    arranged = true;
    return graph;
  });
  expect(result).toEqual({ nodes: [] });
  expect(arranged).toBe(false);
});

test("exactly 2000 owner and consumer links remain allowed with parent links", async () => {
  const baseline = baselineWithLinks(2_000);
  for (const item of baseline.components.slice(1)) item.parent = proposed("component-0");
  const result = await layoutBaseline(baseline);
  expect(result.nodes).toHaveLength(baseline.components.length);
});

test("resource owners count toward the explicit link limit", async () => {
  const baseline = baselineWithLinks(2_000);
  const resource = baselineWithRecords(4).resources[0];
  if (!resource) throw new Error("The fixture needs a resource.");
  baseline.resources.push(resource);
  expect((await layoutBaseline(baseline)).nodes).toHaveLength(baseline.components.length);
  resource.owner = proposed("component-0");
  let arranged = false;
  await expect(layoutBaseline(baseline, async () => {
    arranged = true;
    throw new Error("The layout engine started.");
  })).rejects.toThrow("Too large to display");
  expect(arranged).toBe(false);
});

test.each<[string, (graph: ElkNode, parent: ElkNode, child: ElkNode) => void]>([
  ["a missing component", (_graph, parent) => { parent.children = []; }],
  ["an extra component", (_graph, parent, child) => { parent.children?.push({ ...child, id: "extra" }); }],
  ["a duplicate component", (_graph, parent, child) => { parent.children?.push({ ...child }); }],
  ["a changed component ID", (_graph, _parent, child) => { child.id = "different"; }],
  ["a changed parent", (graph, parent, child) => { parent.children = []; graph.children?.push(child); }],
  ["a missing layout root", (graph) => { graph.id = "component-0"; }],
  ["a child left of its parent", (_graph, _parent, child) => { child.x = -1; }],
  ["a child in the inspection header", (_graph, _parent, child) => { child.y = componentControlHeight - 1; }],
  ["a child beyond the right edge", (_graph, parent, child) => { child.x = parent.width ?? 0; }],
  ["a child beyond the bottom edge", (_graph, parent, child) => { child.y = parent.height ?? 0; }],
  ["a missing coordinate", (_graph, _parent, child) => { delete child.x; }],
  ["a non-finite coordinate", (_graph, _parent, child) => { child.y = Number.POSITIVE_INFINITY; }],
  ["a NaN coordinate", (_graph, _parent, child) => { child.x = Number.NaN; }],
  ["a zero width", (_graph, _parent, child) => { child.width = 0; }],
  ["a negative height", (_graph, _parent, child) => { child.height = -1; }],
  ["a width smaller than its control", (_graph, _parent, child) => { child.width = componentControlWidth - 1; }],
  ["a height smaller than its control", (_graph, _parent, child) => { child.height = componentControlHeight - 1; }],
  ["non-finite bounds", (_graph, parent) => { parent.x = Number.MAX_VALUE; parent.width = Number.MAX_VALUE; }],
])("layout rejects %s instead of returning a partial diagram", async (_description, damage) => {
  const arrange = async (graph: ElkNode): Promise<ElkNode> => {
    const child: ElkNode = { id: "component-1", x: 24, y: componentControlHeight + 24, width: componentControlWidth, height: componentControlHeight };
    const parent: ElkNode = { id: "component-0", x: 12, y: 12, width: componentControlWidth + 48, height: componentControlHeight * 2 + 48, children: [child] };
    graph.children = [parent];
    damage(graph, parent, child);
    return graph;
  };
  await expect(layoutBaseline(baselineWithParentLevels(2), arrange)).rejects.toThrow("diagram layout");
});

test("layout failures reach the caller", async () => {
  const failure = new Error("The layout engine failed.");
  await expect(layoutBaseline(baselineWithComponents(1), async () => { throw failure; })).rejects.toBe(failure);
});
