import ELK from "elkjs/lib/elk.bundled.js";
import type { Architecture } from "@/domain/architecture";

export async function layoutArchitecture(model: Architecture) {
  const elk = new ELK();
  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "60",
    },
    children: model.nodes.map((node) => ({
      id: node.id,
      width: 190,
      height: 64,
    })),
    edges: model.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });
  const positions = new Map(
    result.children?.map((node) => [
      node.id,
      { x: node.x ?? 0, y: node.y ?? 0 },
    ]),
  );
  return model.nodes.map((node) => ({
    id: node.id,
    data: { label: node.label },
    position: positions.get(node.id) ?? { x: 0, y: 0 },
  }));
}
