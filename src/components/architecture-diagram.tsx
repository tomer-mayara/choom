import { useEffect, useMemo } from "react";
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, useStore,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import type { ArchitectureComponent, ArchitectureDocument } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import { ArchitectureDetails } from "./architecture-details.tsx";
import "@xyflow/react/dist/style.css";

type ComponentNode = Node<{ component: ReadonlyData<ArchitectureComponent> }, "component">;

function ComponentCard({ data: { component } }: NodeProps<ComponentNode>) {
  return (
    <div className="flex h-30 w-60 flex-col justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-foreground shadow-sm">
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <p className="truncate font-semibold" title={component.name}>{component.name}</p>
      <code className="truncate text-xs text-muted-foreground" title={component.id}>{component.id}</code>
      <p className="text-xs text-muted-foreground">{component.reportedFiles === 0 ? "No files reported" : `${component.reportedFiles} ${component.reportedFiles === 1 ? "file" : "files"} reported`}</p>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { component: ComponentCard };

function FitPreparedDiagram({ layout }: { layout: ReadonlyData<ArchitectureLayout> }) {
  const { fitView } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  useEffect(() => {
    if (width > 0 && height > 0) void fitView();
  }, [fitView, layout, width, height]);
  return null;
}

/** Render only the committed document and its already prepared positions. */
export function ArchitectureDiagram({ document, layout }: {
  document: ReadonlyData<ArchitectureDocument>; layout: ReadonlyData<ArchitectureLayout>;
}) {
  const nodes = useMemo<ComponentNode[]>(() => {
    const positions = new Map(layout.nodes.map(({ id, position }) => [id, position]));
    return document.components.map((component) => {
      const position = positions.get(component.id);
      if (!position) throw new Error("The prepared diagram is missing a component.");
      return {
        id: component.id, type: "component", data: { component }, position: { ...position },
        width: 240, height: 120,
        ariaLabel: `${component.name}, ${component.id}`,
      };
    });
  }, [document, layout]);
  const edges = useMemo<Edge[]>(() => document.relationships.map(({ id, source, target }) => ({
    id, source, target,
    ariaLabel: `Edge from ${source} to ${target}`,
    markerEnd: { type: MarkerType.ArrowClosed },
  })), [document]);

  return (
    <section aria-labelledby="current-diagram-heading" className="mt-12 space-y-6">
      <div className="space-y-2">
        <h2 id="current-diagram-heading" className="break-words text-2xl font-semibold">{document.name}</h2>
        <p className="text-sm text-muted-foreground">Arrows show imports between declared components. File counts reflect the recorded analysis.</p>
      </div>
      <div className="h-96 overflow-hidden rounded-xl border border-border bg-card" aria-label="Architecture diagram">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView
          nodesDraggable={false} nodesConnectable={false} nodesFocusable={false}
          edgesFocusable={false} elementsSelectable={false}
        >
          <Background />
          <Controls showInteractive={false} />
          <FitPreparedDiagram layout={layout} />
        </ReactFlow>
      </div>
      <ArchitectureDetails document={document} />
    </section>
  );
}
