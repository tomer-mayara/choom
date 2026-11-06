import { useEffect, useState } from "react";
import {
  Background,
  Controls,
  Position,
  ReactFlow,
  type Node,
} from "@xyflow/react";
import { starterArchitecture } from "@/domain/architecture";
import { layoutArchitecture } from "@/lib/layout";
import "@xyflow/react/dist/style.css";

export default function ArchitecturePreview() {
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void layoutArchitecture(starterArchitecture).then(
      (layout) => {
        if (active) {
          setNodes(
            layout.map((node) => ({
              ...node,
              sourcePosition: Position.Right,
              targetPosition: Position.Left,
            })),
          );
        }
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (error)
    return <p role="alert">The example diagram could not be laid out.</p>;
  if (!nodes) return <p role="status">Laying out the example…</p>;

  return (
    <div
      className="h-80 overflow-hidden rounded-xl border border-border bg-card"
      aria-label="Example architecture diagram"
    >
      <ReactFlow
        nodes={nodes}
        edges={starterArchitecture.edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
