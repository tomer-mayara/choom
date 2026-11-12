import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent } from "react";
import {
  Background, Controls, ReactFlow, useReactFlow, useStore, useStoreApi, type Node, type NodeProps,
} from "@xyflow/react";
import type { BaselineComponent, Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import { revealHeader, startingViewport } from "../lib/architecture-viewport.ts";
import { componentControlHeight, componentControlWidth } from "../lib/component-geometry.ts";
import { ComponentArrangement } from "../lib/component-arrangement.ts";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import { ArchitectureDetailsPanel } from "./architecture-inspector.tsx";
import { useArchitectureInspection } from "./use-architecture-inspection.ts";
import { useComponentGestures, type ComponentGestures } from "./use-component-gestures.ts";
import { Button } from "./ui/button.tsx";
import "@xyflow/react/dist/style.css";

type ArchitectureNode = Node<{
  item: ReadonlyData<BaselineComponent>;
  panel: ArchitecturePanel;
  isGroup: boolean;
  interfaceCount: number;
  selected: boolean;
  gestures: ComponentGestures;
  announce: (message: string) => void;
  inspect: (panel: ArchitecturePanel, opener: HTMLElement, keyboard: boolean) => void;
}, "item">;

const fitOptions = { minZoom: 0.01 };
const arrowSteps: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 },
};

function ItemCard({ data: { item, panel, isGroup, interfaceCount, inspect, selected, gestures, announce } }: NodeProps<ArchitectureNode>) {
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
    <div className={isGroup ? "h-full w-full rounded-xl border border-border bg-muted/20" : undefined}>
      <button
        type="button" aria-label={`${item.name}, ${item.id}`} aria-haspopup="dialog"
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
      </button>
    </div>
  );
}

const nodeTypes = { item: ItemCard };

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

function ArchitectureCanvas({ baseline, layout, arrangement, inspection }: {
  baseline: ReadonlyData<Baseline>; layout: ReadonlyData<ArchitectureLayout>; arrangement: ComponentArrangement;
  inspection: ReturnType<typeof useArchitectureInspection>;
}) {
  const geometry = useSyncExternalStore(arrangement.subscribe, arrangement.getSnapshot);
  const gestures = useComponentGestures(arrangement);
  const [announcement, setAnnouncement] = useState<{ owner: ComponentArrangement; text: string } | null>(null);
  const announce = useCallback((text: string) => { setAnnouncement({ owner: arrangement, text }); }, [arrangement]);
  const firstRootId = baseline.components.find(({ parent }) => !parent?.value)?.id;
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
      gestures, announce,
    });
    return items;
  }, [baseline, inspection.open, inspection.componentId, gestures, announce]);
  const nodes = useMemo<ArchitectureNode[]>(() => {
    return geometry.nodes.map(({ id, position, width, height, parentId }) => {
      const data = items.get(id);
      if (!data) throw new Error("The prepared diagram has an unknown item.");
      return {
        id, type: "item", data, position: { ...position }, zIndex: 1,
        width, height, ...(parentId ? { parentId } : {}),
        ariaLabel: `${data.item.name}, ${id}`,
      };
    });
  }, [geometry, items]);

  return <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-card" aria-label="Architecture diagram">
    <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} minZoom={fitOptions.minZoom}
      nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} zIndexMode="manual"
      edgesFocusable={false} elementsSelectable={false} zoomOnDoubleClick={false}>
      <Background />
      <Controls showInteractive={false} fitViewOptions={fitOptions} />
      {firstRootId ? <StartPreparedDiagram layout={layout} firstRootId={firstRootId} arrangement={arrangement} /> : null}
    </ReactFlow>
    <p aria-label="Component position" aria-live="polite" aria-atomic="true" className="sr-only">{
      announcement?.owner === arrangement ? announcement.text : ""
    }</p>
  </div>;
}

/** The published pair defines one view; pointer frames only update its canvas. */
export function ArchitectureDiagram({ baseline, layout }: {
  baseline: ReadonlyData<Baseline>; layout: ReadonlyData<ArchitectureLayout>;
}) {
  const inspection = useArchitectureInspection(baseline, layout);
  const arrangement = useMemo(() => new ComponentArrangement(layout), [baseline, layout]);
  const openPanel = inspection.open;

  return (
    <section aria-labelledby="current-diagram-heading" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <h1 id="current-diagram-heading" tabIndex={-1} className="min-w-0 flex-1 truncate text-base font-semibold" title={baseline.id}>{baseline.id}</h1>
        <p id="item-inspection-hint" className="sr-only lg:not-sr-only lg:text-xs lg:text-muted-foreground">Select to inspect. Drag a header or use arrow keys to move it.</p>
        <Button id="baseline-details-control" variant="outline" onClick={(event) => openPanel({ kind: "baseline" }, event.currentTarget, event.detail === 0)}>Baseline details</Button>
        <Button variant="outline" aria-label="Rules" onClick={(event) => openPanel({ kind: "rules" }, event.currentTarget, event.detail === 0)}>Rules ({baseline.rules.length})</Button>
      </div>
      {baseline.components.length === 0 ? (
        <p role="status" className="p-6 text-muted-foreground">{baseline.interfaces.length + baseline.resources.length + baseline.rules.length === 0 ? "No architecture items modeled" : "No components modeled"}</p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {layout.nodes.length > 0 ? <ArchitectureCanvas baseline={baseline} layout={layout} arrangement={arrangement} inspection={inspection} /> : null}
      <ArchitectureDetailsPanel baseline={baseline} inspection={inspection} />
      </div>
    </section>
  );
}
