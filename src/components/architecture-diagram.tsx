import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type RefObject } from "react";
import {
  Background, ControlButton, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, useStore, useStoreApi, type Node, type NodeProps,
} from "@xyflow/react";
import { RotateCcw } from "lucide-react";
import type { BaselineComponent, Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import { maximumDiagramZoom, normalMinimumZoom, revealHeader, startingViewport } from "../lib/architecture-viewport.ts";
import { componentControlHeight, componentControlWidth, componentGroupBorderWidth } from "../lib/component-geometry.ts";
import { ComponentArrangement } from "../lib/component-arrangement.ts";
import { incompleteInterfaceCount, interfaceArcs } from "../lib/interface-arcs.ts";
import { shownInterfaceArcs, type ConnectionMode } from "../lib/interface-arc-visibility.ts";
import { interfaceArcMarkerSize, routeInterfaceArcs } from "../lib/interface-arc-geometry.ts";
import { InterfaceArc, type InterfaceEdge } from "./interface-arc.tsx";
import { FitDrawingControl } from "./fit-drawing-control.tsx";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import { ArchitectureDetailsPanel } from "./architecture-inspector.tsx";
import { useArchitectureInspection } from "./use-architecture-inspection.ts";
import { useComponentGestures, type ComponentGestures } from "./use-component-gestures.ts";
import { Button } from "./ui/button.tsx";
import { duplicationCounts, type DuplicationControls } from "./duplication-view.ts";
import "@xyflow/react/dist/style.css";

type ArchitectureNode = Node<{
  item: ReadonlyData<BaselineComponent>;
  panel: ArchitecturePanel;
  isGroup: boolean;
  interfaceCount: number;
  duplicateCount: number;
  selected: boolean;
  gestures: ComponentGestures;
  announce: (message: string) => void;
  inspect: (panel: ArchitecturePanel, opener: HTMLElement, keyboard: boolean) => void;
}, "item">;

const arrowSteps: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 },
};

function ItemCard({ data: { item, panel, isGroup, interfaceCount, duplicateCount, inspect, selected, gestures, announce } }: NodeProps<ArchitectureNode>) {
  const { getNodesBounds, getViewport, setViewport, screenToFlowPosition } = useReactFlow();
  const store = useStoreApi();
  const pointerSelection = useRef(false);

  function reveal(position: { x: number; y: number }) {
    const { width, height } = store.getState();
    if (width <= 0 || height <= 0) return;
    const viewport = getViewport();
    const next = revealHeader(viewport, position, width, height);
    if (next.x !== viewport.x || next.y !== viewport.y) void setViewport(next);
  }

  function revealFocusedItem(event: FocusEvent<HTMLButtonElement>) {
    if (pointerSelection.current || !event.currentTarget.matches(":focus-visible")) return;
    reveal(getNodesBounds([item.id]));
  }

  function focusPointerHeader(element: HTMLButtonElement) {
    pointerSelection.current = true;
    element.focus({ preventScroll: true });
    pointerSelection.current = false;
  }

  return (
    <div className={isGroup ? "h-full w-full rounded-xl border border-border bg-muted/20" : undefined}
      style={isGroup ? { borderWidth: componentGroupBorderWidth } : undefined}>
      <Handle type="source" position={Position.Bottom} style={{ visibility: "hidden" }} />
      <Handle type="target" position={Position.Bottom} style={{ visibility: "hidden" }} />
      <button
        type="button" aria-label={`${item.name}, ${item.id}`} aria-haspopup="dialog"
        data-component-id={item.id}
        aria-describedby="item-inspection-hint" aria-pressed={selected}
        className={`nodrag nopan pointer-events-auto flex cursor-grab flex-col justify-center gap-0.5 border-border px-3 py-1 text-left text-foreground hover:border-primary active:cursor-grabbing aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${isGroup ? "rounded-t-lg border-b bg-card/70" : "rounded-lg border bg-card shadow-sm"}`}
        style={{ width: componentControlWidth, height: componentControlHeight, touchAction: "none" }}
        onFocus={revealFocusedItem}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.isPrimary === false) return;
          focusPointerHeader(event.currentTarget);
          gestures.begin(event, item.id, screenToFlowPosition);
        }}
        onKeyDown={(event) => {
          const step = arrowSteps[event.key];
          if (!step) return;
          event.preventDefault();
          event.stopPropagation();
          const position = gestures.moveBy(item.id, step);
          reveal(position);
          announce(`${item.name}: position ${Math.round(position.x)}, ${Math.round(position.y)}.`);
        }}
        onClick={(event) => {
          event.stopPropagation();
          const keyboard = event.detail === 0;
          if (!keyboard) {
            if (!gestures.allowsClick()) { event.preventDefault(); return; }
            focusPointerHeader(event.currentTarget);
          }
          inspect(panel, event.currentTarget, keyboard);
        }}
      >
        <span className="line-clamp-2 max-w-full font-semibold leading-5 wrap-anywhere" title={item.name}>{item.name}</span>
        <span className="text-xs text-muted-foreground">{interfaceCount} {interfaceCount === 1 ? "interface" : "interfaces"}</span>
        {duplicateCount > 0 ? <span className="text-xs">{duplicateCount} possible {duplicateCount === 1 ? "duplicate" : "duplicates"}</span> : null}
      </button>
    </div>
  );
}

const nodeTypes = { item: ItemCard };
const edgeTypes = { interface: InterfaceArc };

function StartPreparedDiagram({ layout, firstRootId, arrangement }: {
  layout: ReadonlyData<ArchitectureLayout>; firstRootId: string; arrangement: ComponentArrangement;
}) {
  const { setViewport, viewportInitialized } = useReactFlow();
  const store = useStoreApi();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const started = useRef<ComponentArrangement | null>(null);
  useEffect(() => {
    if (!viewportInitialized || width <= 0 || height <= 0 || started.current === arrangement) return;
    started.current = arrangement;
    // A closed panel can change usable size before React Flow's resize observer runs.
    const bounds = store.getState().domNode?.getBoundingClientRect();
    void setViewport(startingViewport(layout, firstRootId, bounds?.width || width, bounds?.height || height));
  }, [setViewport, viewportInitialized, store, layout, arrangement, firstRootId, width, height]);
  return null;
}

function ResetLayoutControl({ layout, firstRootId, arrangement, gestures, announce, setMinimumZoom, pressGeneration }: {
  layout: ReadonlyData<ArchitectureLayout>; firstRootId: string;
  arrangement: ComponentArrangement; gestures: ComponentGestures; announce: (message: string) => void;
  setMinimumZoom: (zoom: number) => void;
  pressGeneration: RefObject<number>;
}) {
  const { setViewport } = useReactFlow();
  const store = useStoreApi();
  return <ControlButton type="button" title="Reset layout" aria-label="Reset layout" onClick={() => {
    gestures.cancel();
    pressGeneration.current += 1;
    arrangement.reset();
    setMinimumZoom(normalMinimumZoom);
    const { domNode, width, height } = store.getState();
    const bounds = domNode?.getBoundingClientRect();
    void setViewport(startingViewport(layout, firstRootId, bounds?.width || width, bounds?.height || height));
    announce("Layout reset.");
  }}><RotateCcw aria-hidden="true" style={{ fill: "none" }} /></ControlButton>;
}

function ArchitectureCanvas({ baseline, layout, arrangement, inspection, connectionMode, setConnectionMode, showSelfConnections, setShowSelfConnections, duplicateCounts }: {
  baseline: ReadonlyData<Baseline>; layout: ReadonlyData<ArchitectureLayout>; arrangement: ComponentArrangement;
  inspection: ReturnType<typeof useArchitectureInspection>;
  connectionMode: ConnectionMode; setConnectionMode: (mode: ConnectionMode) => void;
  showSelfConnections: boolean; setShowSelfConnections: (show: boolean) => void;
  duplicateCounts: ReadonlyMap<string, number>;
}) {
  const geometry = useSyncExternalStore(arrangement.subscribe, arrangement.getSnapshot);
  const gestures = useComponentGestures(arrangement);
  const pressGeneration = useRef(0);
  const [zoomRange, setZoomRange] = useState<{ owner: ComponentArrangement; minimum: number } | null>(null);
  const minimumZoom = zoomRange?.owner === arrangement ? zoomRange.minimum : normalMinimumZoom;
  const setMinimumZoom = useCallback((zoom: number) => {
    setZoomRange({ owner: arrangement, minimum: Math.min(normalMinimumZoom, zoom) });
  }, [arrangement]);
  const [announcement, setAnnouncement] = useState<{ owner: ComponentArrangement; text: string } | null>(null);
  const announce = useCallback((text: string) => { setAnnouncement({ owner: arrangement, text }); }, [arrangement]);
  const firstRootId = baseline.components.find(({ parent }) => !parent?.value)?.id;
  const connections = useMemo(() => {
    const arcs = interfaceArcs(baseline);
    return { arcs, order: new Map(arcs.map(({ id }, index) => [id, index])) };
  }, [baseline]);
  const routes = useMemo(() => routeInterfaceArcs(connections.arcs, geometry), [connections, geometry]);
  const items = useMemo(() => {
    const parents = new Set(baseline.components.flatMap((component) => component.parent?.value ? [component.parent.value] : []));
    const items = new Map<string, ArchitectureNode["data"]>();
    const interfaceCounts = new Map<string, number>();
    for (const { owner } of baseline.interfaces) {
      if (owner.value !== null) interfaceCounts.set(owner.value, (interfaceCounts.get(owner.value) ?? 0) + 1);
    }
    for (const item of baseline.components) items.set(item.id, {
      item, panel: { kind: "component", componentId: item.id }, isGroup: parents.has(item.id),
      interfaceCount: interfaceCounts.get(item.id) ?? 0, inspect: inspection.open, selected: inspection.componentId === item.id,
      duplicateCount: duplicateCounts.get(item.id) ?? 0,
      gestures, announce,
    });
    return items;
  }, [baseline, inspection.open, inspection.componentId, gestures, announce, duplicateCounts]);
  const nodes = useMemo<ArchitectureNode[]>(() => {
    return geometry.nodes.map(({ id, position, width, height, parentId }) => {
      const data = items.get(id);
      if (!data) throw new Error("The prepared diagram has an unknown item.");
      return {
        id, type: "item", data, position: { ...position }, zIndex: 1,
        width, height, ...(parentId ? { parentId } : {}),
        handles: [
          { type: "source", position: Position.Bottom, x: componentControlWidth / 2, y: componentControlHeight },
          { type: "target", position: Position.Bottom, x: componentControlWidth / 2, y: componentControlHeight },
        ],
        ariaLabel: `${data.item.name}, ${id}`,
      };
    });
  }, [geometry, items]);
  const edges = useMemo<InterfaceEdge[]>(() => {
    const names = new Map(baseline.interfaces.map(({ id, name }) => [id, name]));
    const components = new Map(baseline.components.map(({ id, name }) => [id, name]));
    const visible = shownInterfaceArcs(routes, { mode: connectionMode, showSelfConnections,
      componentId: inspection.componentId, interfaceId: inspection.connectionPanel?.kind === "interface" ? inspection.connectionPanel.interfaceId : undefined });
    return visible.map((route) => {
      const name = names.get(route.interfaceId) ?? route.interfaceId;
      const consumer = `${components.get(route.consumerId)}, ${route.consumerId}`;
      const owner = `${components.get(route.ownerId)}, ${route.ownerId}`;
      const panel = inspection.connectionPanel;
      const relevant = panel?.kind === "interface" ? route.interfaceId === panel.interfaceId
        : panel?.kind === "component" ? route.consumerId === panel.componentId || route.ownerId === panel.componentId : null;
      const emphasis = relevant === null ? "normal" : relevant ? "highlighted" : "dimmed";
      return { id: route.id, source: route.consumerId, target: route.ownerId, type: "interface",
        domAttributes: { "aria-hidden": true },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--foreground)", width: interfaceArcMarkerSize, height: interfaceArcMarkerSize },
        data: { route, name, accessibleName: `${name}, ${route.interfaceId}; consumer ${consumer}; owner ${owner}`,
          inspected: panel?.kind === "interface" && panel.interfaceId === route.interfaceId,
          inspect: inspection.open, view: arrangement, pressGeneration, emphasis, labelOrder: connections.order.get(route.id) ?? 0 },
      };
    });
  }, [baseline, connections, routes, inspection.open, inspection.connectionPanel, inspection.componentId, arrangement, connectionMode, showSelfConnections]);

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card" aria-label="Architecture diagram">
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 border-b border-border px-3 py-1 text-xs text-muted-foreground">
      <fieldset className="flex min-w-0 flex-wrap items-center gap-x-3">
        <legend className="float-left mr-3 font-medium">Connections</legend>
        {(["selected", "all"] as const).map((mode) => <label key={mode} className="flex cursor-pointer items-center gap-1">
          <input type="radio" name="connection-mode" value={mode} checked={connectionMode === mode} onChange={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            setConnectionMode(mode);
          }} />
          {mode === "selected" ? "Selected" : "All"}
        </label>)}
        <label className="flex cursor-pointer items-center gap-1">
          <input type="checkbox" checked={showSelfConnections} onChange={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            setShowSelfConnections(event.currentTarget.checked);
          }} />
          Show self-connections
        </label>
      </fieldset>
      {baseline.formatVersion !== 3 ? <p>Arrow: consumer may use the owner's interface.</p> : null}
      <p style={{ visibility: edges.length ? "hidden" : "visible" }}>No connections shown.</p>
    </div>
    <div className="min-h-0 flex-1">
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} minZoom={minimumZoom} maxZoom={maximumDiagramZoom}
      nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} zIndexMode="manual"
      edgesFocusable={false} elementsSelectable={false} zoomOnDoubleClick={false}>
      <Background />
      <Controls showInteractive={false} showFitView={false}>
        <FitDrawingControl geometry={geometry} arcs={edges.flatMap(({ data }) => data ? [data.route] : [])} setMinimumZoom={setMinimumZoom} />
        {firstRootId ? <ResetLayoutControl layout={layout} firstRootId={firstRootId}
          arrangement={arrangement} gestures={gestures} announce={announce} setMinimumZoom={setMinimumZoom} pressGeneration={pressGeneration} /> : null}
      </Controls>
      {firstRootId ? <StartPreparedDiagram layout={layout} firstRootId={firstRootId} arrangement={arrangement} /> : null}
    </ReactFlow>
    </div>
    <p aria-label="Component position" aria-live="polite" aria-atomic="true" className="sr-only">{
      announcement?.owner === arrangement ? announcement.text : ""
    }</p>
  </div>;
}

/** The published pair defines one view; pointer frames only update its canvas. */
export function ArchitectureDiagram({ baseline, layout, duplication, onOpenDuplicationReport, onRemoveDuplicationReport, reportBusy = false }: {
  baseline: ReadonlyData<Baseline>; layout: ReadonlyData<ArchitectureLayout>;
} & DuplicationControls) {
  const [connectionChoice, setConnectionChoice] = useState<{
    baseline: ReadonlyData<Baseline>; layout: ReadonlyData<ArchitectureLayout>; mode: ConnectionMode; showSelfConnections: boolean;
  } | null>(null);
  if (connectionChoice && (connectionChoice.baseline !== baseline || connectionChoice.layout !== layout)) setConnectionChoice(null);
  const connectionMode = connectionChoice?.baseline === baseline && connectionChoice.layout === layout ? connectionChoice.mode : "selected";
  const showSelfConnections = connectionChoice?.baseline === baseline && connectionChoice.layout === layout ? connectionChoice.showSelfConnections : false;
  const setConnectionMode = useCallback((mode: ConnectionMode) => setConnectionChoice((current) => ({ baseline, layout, mode,
    showSelfConnections: current?.baseline === baseline && current.layout === layout ? current.showSelfConnections : false,
  })), [baseline, layout]);
  const setShowSelfConnections = useCallback((showSelfConnections: boolean) => setConnectionChoice((current) => ({ baseline, layout, showSelfConnections,
    mode: current?.baseline === baseline && current.layout === layout ? current.mode : "selected",
  })), [baseline, layout]);
  const inspection = useArchitectureInspection(baseline, layout, connectionMode, duplication?.session ?? null);
  const arrangement = useMemo(() => new ComponentArrangement(layout), [baseline, layout]);
  const openPanel = inspection.open;
  const incompleteInterfaces = incompleteInterfaceCount(baseline);
  const counts = useMemo(() => duplicationCounts(baseline, duplication?.report), [baseline, duplication?.report]);

  return (
    <section aria-labelledby="current-diagram-heading" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2 sm:flex-nowrap">
        <h1 id="current-diagram-heading" tabIndex={-1} className="w-full min-w-0 truncate text-base font-semibold sm:w-auto sm:flex-1" title={baseline.id}>{baseline.id}</h1>
        <p id="item-inspection-hint" className="sr-only lg:not-sr-only lg:text-xs lg:text-muted-foreground">Select to inspect. Drag a header or use arrow keys to move it.</p>
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto [&>button]:px-2 [&>button]:text-xs sm:[&>button]:px-4 sm:[&>button]:text-sm">
          <Button id="baseline-details-control" variant="outline" onClick={(event) => openPanel({ kind: "baseline" }, event.currentTarget, event.detail === 0)}>Baseline details</Button>
          <Button variant="outline" aria-label="Rules" onClick={(event) => openPanel({ kind: "rules" }, event.currentTarget, event.detail === 0)}>Rules ({baseline.rules.length})</Button>
          <Button variant="outline" onClick={(event) => openPanel({ kind: "duplicates" }, event.currentTarget, event.detail === 0)}>Duplicates</Button>
        </div>
      </div>
      {incompleteInterfaces > 0 ? <p className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        {incompleteInterfaces} {incompleteInterfaces === 1 ? "interface has" : "interfaces have"} unknown owners or allowed consumers. Open Baseline details to inspect them.
      </p> : null}
      {baseline.components.length === 0 ? (
        <p role="status" className="p-6 text-muted-foreground">{baseline.interfaces.length + baseline.resources.length + baseline.rules.length === 0 ? "No architecture items modeled" : "No components modeled"}</p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {layout.nodes.length > 0 ? <ArchitectureCanvas baseline={baseline} layout={layout} arrangement={arrangement} inspection={inspection}
        connectionMode={connectionMode} setConnectionMode={setConnectionMode}
        showSelfConnections={showSelfConnections} setShowSelfConnections={setShowSelfConnections} duplicateCounts={counts.components} /> : null}
      <ArchitectureDetailsPanel baseline={baseline} inspection={inspection} duplication={duplication} counts={counts}
        onOpenDuplicationReport={onOpenDuplicationReport} onRemoveDuplicationReport={onRemoveDuplicationReport} reportBusy={reportBusy} />
      </div>
    </section>
  );
}
