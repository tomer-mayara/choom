import { useEffect, useMemo, useRef, type FocusEvent } from "react";
import {
  Background, Controls, ReactFlow, useReactFlow, useStore, useStoreApi, type Node, type NodeProps,
} from "@xyflow/react";
import type { BaselineComponent, Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import { startingViewport } from "../lib/architecture-viewport.ts";
import { componentControlHeight, componentControlWidth } from "../lib/component-geometry.ts";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import { ArchitectureDetailsPanel } from "./architecture-inspector.tsx";
import { useArchitectureInspection } from "./use-architecture-inspection.ts";
import { Button } from "./ui/button.tsx";
import "@xyflow/react/dist/style.css";

type ArchitectureNode = Node<{
  item: ReadonlyData<BaselineComponent>;
  panel: ArchitecturePanel;
  isGroup: boolean;
  interfaceCount: number;
  selected: boolean;
  inspect: (panel: ArchitecturePanel, opener: HTMLElement, keyboard: boolean) => void;
}, "item">;

const fitOptions = { minZoom: 0.01 };

function ItemCard({ data: { item, panel, isGroup, interfaceCount, inspect, selected } }: NodeProps<ArchitectureNode>) {
  const { getNodesBounds, getViewport, setCenter } = useReactFlow();
  const store = useStoreApi();
  const pointerSelection = useRef(false);

  function revealFocusedItem(event: FocusEvent<HTMLButtonElement>) {
    if (pointerSelection.current || !event.currentTarget.matches(":focus-visible")) return;
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
        aria-describedby="item-inspection-hint" aria-pressed={selected}
        className={`nodrag nopan pointer-events-auto flex flex-col justify-center gap-0.5 border-border px-3 py-1 text-left text-foreground hover:border-primary aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${isGroup ? "rounded-t-lg border-b bg-card/70" : "rounded-lg border bg-card shadow-sm"}`}
        style={{ width: componentControlWidth, height: componentControlHeight }}
        onFocus={revealFocusedItem}
        onClick={(event) => {
          event.stopPropagation();
          const keyboard = event.detail === 0;
          if (!keyboard) {
            pointerSelection.current = true;
            event.currentTarget.focus({ preventScroll: true });
            pointerSelection.current = false;
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

function StartPreparedDiagram({ layout, firstRootId }: { layout: ReadonlyData<ArchitectureLayout>; firstRootId: string }) {
  const { setViewport, viewportInitialized } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const started = useRef<ReadonlyData<ArchitectureLayout> | null>(null);
  useEffect(() => {
    if (!viewportInitialized || width <= 0 || height <= 0 || started.current === layout) return;
    started.current = layout;
    void setViewport(startingViewport(layout, firstRootId, width, height));
  }, [setViewport, viewportInitialized, layout, firstRootId, width, height]);
  return null;
}

/** Render only the committed baseline and its already prepared positions. */
export function ArchitectureDiagram({ baseline, layout }: {
  baseline: ReadonlyData<Baseline>; layout: ReadonlyData<ArchitectureLayout>;
}) {
  const inspection = useArchitectureInspection(baseline);
  const openPanel = inspection.open;
  const firstRootId = baseline.components.find(({ parent }) => !parent?.value)?.id;
  const nodes = useMemo<ArchitectureNode[]>(() => {
    const parents = new Set(baseline.components.flatMap((component) => component.parent?.value ? [component.parent.value] : []));
    const items = new Map<string, ArchitectureNode["data"]>();
    const interfaceCounts = new Map<string, number>();
    for (const { owner } of baseline.interfaces) {
      if (owner.value !== null) interfaceCounts.set(owner.value, (interfaceCounts.get(owner.value) ?? 0) + 1);
    }
    for (const item of baseline.components) items.set(item.id, {
      item, panel: { kind: "component", componentId: item.id }, isGroup: parents.has(item.id),
      interfaceCount: interfaceCounts.get(item.id) ?? 0, inspect: openPanel, selected: inspection.componentId === item.id,
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
  }, [baseline, layout, openPanel, inspection.componentId]);

  return (
    <section aria-labelledby="current-diagram-heading" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <h1 id="current-diagram-heading" className="min-w-0 flex-1 truncate text-base font-semibold" title={baseline.id}>{baseline.id}</h1>
        <p id="item-inspection-hint" className="sr-only lg:not-sr-only lg:text-xs lg:text-muted-foreground">Select a component, or focus it and press Enter, to inspect.</p>
        <Button id="baseline-details-control" variant="outline" onClick={(event) => openPanel({ kind: "baseline" }, event.currentTarget, event.detail === 0)}>Baseline details</Button>
        <Button variant="outline" aria-label="Rules" onClick={(event) => openPanel({ kind: "rules" }, event.currentTarget, event.detail === 0)}>Rules ({baseline.rules.length})</Button>
      </div>
      {baseline.components.length === 0 ? (
        <p role="status" className="p-6 text-muted-foreground">{baseline.interfaces.length + baseline.resources.length + baseline.rules.length === 0 ? "No architecture items modeled" : "No components modeled"}</p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {nodes.length > 0 ? <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-card" aria-label="Architecture diagram">
        <ReactFlow
          nodes={nodes} edges={[]} nodeTypes={nodeTypes} minZoom={fitOptions.minZoom}
          nodesDraggable={false} nodesConnectable={false} nodesFocusable={false}
          zIndexMode="manual"
          edgesFocusable={false} elementsSelectable={false} zoomOnDoubleClick={false}
        >
          <Background />
          <Controls showInteractive={false} fitViewOptions={fitOptions} />
          {firstRootId ? <StartPreparedDiagram layout={layout} firstRootId={firstRootId} /> : null}
        </ReactFlow>
      </div> : null}
      <ArchitectureDetailsPanel baseline={baseline} inspection={inspection} />
      </div>
    </section>
  );
}
