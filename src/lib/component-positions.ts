import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "./architecture-layout.ts";

type PositionedComponent = ReadonlyData<ArchitectureLayout>["nodes"][number];

function positionInNodes(nodes: ReadonlyMap<string, PositionedComponent>, id: string): { x: number; y: number } {
  let node = nodes.get(id);
  if (!node) throw new Error(`Unknown component: ${id}`);
  const position = { ...node.position };
  while (node.parentId) {
    node = nodes.get(node.parentId);
    if (!node) throw new Error("The component has no parent geometry.");
    position.x += node.position.x;
    position.y += node.position.y;
  }
  return position;
}

export function componentPosition(geometry: ReadonlyData<ArchitectureLayout>, id: string): { x: number; y: number } {
  return positionInNodes(new Map(geometry.nodes.map((node) => [node.id, node])), id);
}

export function componentPositions(geometry: ReadonlyData<ArchitectureLayout>): Map<string, { x: number; y: number }> {
  const nodes = new Map(geometry.nodes.map((node) => [node.id, node]));
  return new Map(geometry.nodes.map(({ id }) => [id, positionInNodes(nodes, id)]));
}
