import ELK from "elkjs/lib/elk.bundled.js";
import type { ArchitectureDocument } from "../domain/generated/contracts.ts";

export interface ArchitectureLayout {
  nodes: Array<{ id: string; position: { x: number; y: number } }>;
}

/** Prepare positions without adding components or changing the semantic document. */
export async function layoutArchitectureDocument(document: ArchitectureDocument): Promise<ArchitectureLayout> {
  const graph = await new ELK().layout({
    id: "architecture",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "60",
    },
    children: document.components.map(({ id }) => ({ id, width: 240, height: 120 })),
    edges: document.relationships.map(({ id, source, target }) => ({ id, sources: [source], targets: [target] })),
  });
  const positions = new Map(graph.children?.map(({ id, x, y }) => [id, { x, y }]));
  return {
    nodes: document.components.map(({ id }) => {
      const position = positions.get(id);
      if (!position || typeof position.x !== "number" || typeof position.y !== "number"
        || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        throw new Error("The diagram layout did not place every component.");
      }
      return { id, position: { x: position.x, y: position.y } };
    }),
  };
}
