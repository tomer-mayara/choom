import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type RefObject } from "react";
import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import {
  Background, BaseEdge, Controls, getBezierPath, Handle, MarkerType, Position, ReactFlow, useReactFlow, useStore, useStoreApi,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import type { BaselineComponent, BaselineInterface, BaselineResource, Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import { baselineLinks } from "../lib/baseline-links.ts";
import { componentControlHeight, componentControlWidth } from "../lib/component-geometry.ts";
import { ArchitectureDetails, type ArchitecturePanel } from "./architecture-details.tsx";
import { Button } from "./ui/button.tsx";
import "@xyflow/react/dist/style.css";

type ArchitectureNode = Node<{
  item: ReadonlyData<BaselineComponent | BaselineInterface | BaselineResource>;
  panel: ArchitecturePanel;
  isGroup: boolean;
  inspect: (panel: ArchitecturePanel, opener: HTMLElement) => void;
}, "item">;

const fitOptions = { minZoom: 0.01 };

function ItemCard({ data: { item, panel, isGroup, inspect } }: NodeProps<ArchitectureNode>) {
  const { getNodesBounds, getViewport, setCenter } = useReactFlow();
  const store = useStoreApi();

  function revealFocusedItem(event: FocusEvent<HTMLButtonElement>) {
    if (!event.currentTarget.matches(":focus-visible")) return;
    const { width, height } = store.getState();
    if (width <= 0 || height <= 0) return;
    const bounds = getNodesBounds([item.id]);
    const viewport = getViewport();
    const left = bounds.x * viewport.zoom + viewport.x;
    const top = bounds.y * viewport.zoom + viewport.y;
    const fullyVisible = left >= 0 && top >= 0
      && left + componentControlWidth * viewport.zoom <= width
      && top + componentControlHeight * viewport.zoom <= height;
    if (!fullyVisible) {
      void setCenter(bounds.x + componentControlWidth / 2, bounds.y + componentControlHeight / 2, { zoom: viewport.zoom });
    }
  }

  return (
    <div className={isGroup ? "h-full w-full rounded-xl border border-border bg-muted/20" : undefined}>
      <button
        type="button" aria-label={`${item.name}, ${item.id}`} aria-haspopup="dialog"
        aria-describedby="item-inspection-hint"
        className="nodrag nopan pointer-events-auto flex flex-col justify-center gap-1 rounded-lg border border-border bg-card px-4 py-3 text-left text-foreground shadow-sm hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{ width: componentControlWidth, height: componentControlHeight }}
        onFocus={revealFocusedItem}
        onDoubleClick={(event) => { event.stopPropagation(); inspect(panel, event.currentTarget); }}
        onClick={(event) => { if (event.detail === 0) inspect(panel, event.currentTarget); }}
      >
        <span className="max-w-full truncate font-semibold" title={item.name}>{item.name}</span>
        <span className="text-xs capitalize text-muted-foreground">{panel.kind}</span>
        <code className="max-w-full truncate text-xs text-muted-foreground" title={item.id}>{item.id}</code>
        {"purpose" in item ? <span className="max-w-full truncate text-xs text-muted-foreground">{item.purpose.value}</span> : (
          <span className="max-w-full truncate text-xs text-muted-foreground">{item.owner.value === null ? "Owner unknown" : `Owner: ${item.owner.value}`}</span>
        )}
        {"allowedConsumers" in item ? <span className="max-w-full truncate text-xs text-muted-foreground">{
          item.allowedConsumers.value === null ? "Consumer policy unknown" : `Permitted consumers: ${item.allowedConsumers.value.length}`
        }</span> : null}
      </button>
      {panel.kind === "component" ? <Handle type="source" position={Position.Right} id="relationships" style={{ top: componentControlHeight / 2, opacity: 0 }} /> : (
        <>
          <Handle type="target" position={Position.Top} id="ownership" style={{ left: componentControlWidth / 2, opacity: 0 }} />
          {panel.kind === "interface" ? <Handle type="target" position={Position.Left} id="permission" style={{ top: 90, opacity: 0 }} /> : null}
        </>
      )}
    </div>
  );
}

const nodeTypes = { item: ItemCard };

function RecordedEdge(props: EdgeProps) {
  const [path, middleX, middleY] = getBezierPath(props);
  return <BaseEdge
    id={props.id} path={path} markerEnd={props.markerEnd} style={props.style}
    label={props.label} labelStyle={props.labelStyle} labelBgStyle={props.labelBgStyle}
    labelX={props.markerEnd ? middleX : props.targetX}
    labelY={props.markerEnd ? middleY : props.targetY - 16}
  />;
}

const edgeTypes = { recorded: RecordedEdge };

function relationshipText(value: string): string {
  const limit = 80;
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function FitPreparedDiagram({ layout }: { layout: ReadonlyData<ArchitectureLayout> }) {
  const { fitView } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  useEffect(() => {
    if (width > 0 && height > 0) void fitView(fitOptions);
  }, [fitView, layout, width, height]);
  return null;
}

function DetailsPanel({ baseline, panel, opener, onClose }: {
  baseline: ReadonlyData<Baseline>; panel: ArchitecturePanel | null;
  opener: RefObject<HTMLElement | null>; onClose: () => void;
}) {
  const title = panel?.kind === "interface" ? "Interface details" : panel?.kind === "resource" ? "Resource details" : "Component details";
  return (
    <Dialog.Root open={panel !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/10" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-md flex-col border-l border-border bg-card shadow-xl focus:outline-none"
          onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
            <Dialog.Title className="min-w-0 flex-1 text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild><Button variant="outline" aria-label="Close details" className="size-8 shrink-0 p-0"><X aria-hidden="true" className="size-4" /></Button></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Details from the current diagram. Press Escape to return to the canvas.</Dialog.Description>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {panel ? <ArchitectureDetails baseline={baseline} panel={panel} /> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Render only the committed baseline and its already prepared positions. */
export function ArchitectureDiagram({ baseline, layout }: {
  baseline: ReadonlyData<Baseline>; layout: ReadonlyData<ArchitectureLayout>;
}) {
  const [selection, setSelection] = useState<{ baseline: ReadonlyData<Baseline>; panel: ArchitecturePanel } | null>(null);
  if (selection && selection.baseline !== baseline) setSelection(null);
  const opener = useRef<HTMLElement | null>(null);
  const panel = selection?.baseline === baseline ? selection.panel : null;
  const openPanel = useCallback((panel: ArchitecturePanel, trigger: HTMLElement) => {
    opener.current = trigger;
    setSelection({ baseline, panel });
  }, [baseline]);
  const nodes = useMemo<ArchitectureNode[]>(() => {
    const parents = new Set(baseline.components.flatMap((component) => component.parent?.value ? [component.parent.value] : []));
    const items = new Map<string, ArchitectureNode["data"]>();
    for (const item of baseline.components) items.set(item.id, {
      item, panel: { kind: "component", componentId: item.id }, isGroup: parents.has(item.id), inspect: openPanel,
    });
    for (const item of baseline.interfaces) items.set(item.id, {
      item, panel: { kind: "interface", interfaceId: item.id }, isGroup: false, inspect: openPanel,
    });
    for (const item of baseline.resources) items.set(item.id, {
      item, panel: { kind: "resource", resourceId: item.id }, isGroup: false, inspect: openPanel,
    });
    return layout.nodes.map(({ id, position, width, height, parentId }) => {
      const data = items.get(id);
      if (!data) throw new Error("The prepared diagram has an unknown item.");
      return {
        id, type: "item", data, position: { ...position }, zIndex: 1,
        width, height, ...(parentId ? { parentId, extent: "parent" as const } : {}),
        ariaLabel: `${data.item.name}, ${id}`,
      };
    });
  }, [baseline, layout, openPanel]);
  const edges = useMemo<Edge[]>(() => {
    const items = new Map([...baseline.components, ...baseline.interfaces, ...baseline.resources].map((item) => [item.id, item]));
    return baselineLinks(baseline).map(({ id, source, target, kind, status }) => {
      const label = status === "accepted" ? "Accepted (recorded)" : "Proposed";
      const from = items.get(source);
      const to = items.get(target);
      if (!from || !to) throw new Error("A recorded relationship has an unknown item.");
      return {
        id, type: "recorded", source, target, zIndex: 0,
        sourceHandle: "relationships", targetHandle: kind === "may use" ? "permission" : "ownership",
        label: `${kind} · ${label}`,
        ariaLabel: `${relationshipText(from.name)}, ${relationshipText(source)} ${kind} ${relationshipText(to.name)}, ${relationshipText(target)}. ${label}.`,
        style: { stroke: "var(--foreground)", strokeWidth: 1.5 },
        labelStyle: { fill: "var(--foreground)", fontSize: 12 }, labelBgStyle: { fill: "var(--card)" },
        ...(kind === "may use" ? { markerEnd: { type: MarkerType.ArrowClosed, color: "var(--foreground)" } } : {}),
      };
    });
  }, [baseline]);

  return (
    <section aria-labelledby="current-diagram-heading" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <h1 id="current-diagram-heading" className="min-w-0 flex-1 truncate text-base font-semibold" title={baseline.id}>{baseline.id}</h1>
        <p id="item-inspection-hint" className="sr-only lg:not-sr-only lg:text-xs lg:text-muted-foreground">Double-click an item, or focus it and press Enter, to inspect.</p>
      </div>
      {baseline.components.length === 0 ? (
        <p role="status" className="p-6 text-muted-foreground">{baseline.interfaces.length + baseline.resources.length + baseline.rules.length === 0 ? "No architecture items modeled" : "No components modeled"}</p>
      ) : null}
      {nodes.length > 0 ? <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-card" aria-label="Architecture diagram">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView minZoom={fitOptions.minZoom} fitViewOptions={fitOptions}
          nodesDraggable={false} nodesConnectable={false} nodesFocusable={false}
          zIndexMode="manual"
          edgesFocusable={false} elementsSelectable={false} zoomOnDoubleClick={false}
        >
          <Background />
          <Controls showInteractive={false} fitViewOptions={fitOptions} />
          <FitPreparedDiagram layout={layout} />
        </ReactFlow>
      </div> : null}
      <DetailsPanel baseline={baseline} panel={panel} opener={opener} onClose={() => setSelection(null)} />
    </section>
  );
}
