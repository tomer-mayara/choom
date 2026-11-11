import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Baseline } from "../domain/generated/contracts.ts";
import { checkBaselineDisplayLimits } from "./baseline-display-limits.ts";
import { componentControlHeight, componentControlWidth } from "./component-geometry.ts";

export interface ArchitectureLayout {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    height: number;
    parentId?: string;
  }>;
}

const arrangement = {
  "elk.algorithm": "layered", "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "40", "elk.spacing.componentComponent": "40",
};
const rootId = "__baseline_layout__";
const invalidLayoutMessage = "The diagram layout is incomplete or invalid.";

function componentGraph(baseline: Baseline): ElkNode {
  const components = new Map(baseline.components.map(({ id }): [string, ElkNode] => [id, { id, children: [] }]));
  const children: ElkNode[] = [];
  for (const component of baseline.components) {
    const node = components.get(component.id);
    if (!node) throw new Error("The layout component is missing.");
    const parentId = component.parent?.value;
    if (parentId) {
      const parent = components.get(parentId);
      if (!parent?.children) throw new Error("The layout parent is missing.");
      parent.children.push(node);
    } else children.push(node);
  }
  for (const node of components.values()) {
    if (node.children?.length) {
      node.layoutOptions = { ...arrangement, "elk.padding": `[top=${componentControlHeight + 24},left=24,bottom=24,right=24]` };
    } else {
      delete node.children;
      node.width = componentControlWidth;
      node.height = componentControlHeight;
    }
  }
  return { id: rootId, layoutOptions: arrangement, children };
}

function positionedNodes(graph: ElkNode, baseline: Baseline): ArchitectureLayout["nodes"] {
  if (graph.id !== rootId) throw new Error(invalidLayoutMessage);
  const expectedParents = new Map(baseline.components.map((component) => [component.id, component.parent?.value ?? undefined]));
  const seen = new Set<string>();
  const nodes: ArchitectureLayout["nodes"] = [];
  function visit(item: ElkNode, parent?: ArchitectureLayout["nodes"][number], origin = { x: 0, y: 0 }): void {
    const parentId = parent?.id;
    const { x, y, width, height } = item;
    if (!expectedParents.has(item.id) || seen.has(item.id) || expectedParents.get(item.id) !== parentId
      || typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number"
      || ![x, y, width, height].every(Number.isFinite) || width < componentControlWidth || height < componentControlHeight) {
      throw new Error(invalidLayoutMessage);
    }
    const absolute = { x: origin.x + x, y: origin.y + y };
    if (![absolute.x, absolute.y, absolute.x + width, absolute.y + height].every(Number.isFinite)
      || (parent && (x < 0 || y < componentControlHeight || x + width > parent.width || y + height > parent.height))) {
      throw new Error(invalidLayoutMessage);
    }
    seen.add(item.id);
    const node = { id: item.id, position: { x, y }, width, height, ...(parentId ? { parentId } : {}) };
    nodes.push(node);
    for (const child of item.children ?? []) visit(child, node, absolute);
  }
  for (const child of graph.children ?? []) visit(child);
  if (nodes.length !== expectedParents.size) throw new Error(invalidLayoutMessage);
  return nodes;
}

/** Prepare parent-relative geometry without changing the saved baseline. */
export async function layoutBaseline(
  baseline: Baseline,
  arrange: (graph: ElkNode) => Promise<ElkNode> = (graph) => new ELK().layout(graph),
): Promise<ArchitectureLayout> {
  checkBaselineDisplayLimits(baseline);
  if (baseline.components.length === 0) return { nodes: [] };
  return {
    nodes: positionedNodes(await arrange(componentGraph(baseline)), baseline),
  };
}
