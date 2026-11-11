import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type RefObject } from "react";
import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import {
  Background, Controls, ReactFlow, useReactFlow, useStore, useStoreApi,
  type Node, type NodeProps,
} from "@xyflow/react";
import type { BaselineComponent, Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import { ArchitectureDetails, type ArchitecturePanel } from "./architecture-details.tsx";
import { Button } from "./ui/button.tsx";
import "@xyflow/react/dist/style.css";

type ComponentNode = Node<{
  component: ReadonlyData<BaselineComponent>;
  inspect: (componentId: string, opener: HTMLElement) => void;
}, "component">;

function ComponentCard({ data: { component, inspect } }: NodeProps<ComponentNode>) {
  const { getNodesBounds, getViewport, setCenter } = useReactFlow();
  const store = useStoreApi();

  function revealFocusedComponent(event: FocusEvent<HTMLButtonElement>) {
    if (!event.currentTarget.matches(":focus-visible")) return;
    const { width, height } = store.getState();
    if (width <= 0 || height <= 0) return;
    const bounds = getNodesBounds([component.id]);
    const viewport = getViewport();
    const left = bounds.x * viewport.zoom + viewport.x;
    const top = bounds.y * viewport.zoom + viewport.y;
    const fullyVisible = left >= 0 && top >= 0
      && left + bounds.width * viewport.zoom <= width
      && top + bounds.height * viewport.zoom <= height;
    if (!fullyVisible) {
      void setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { zoom: viewport.zoom });
    }
  }

  return (
    <div>
      <button
        type="button" aria-label={`${component.name}, ${component.id}`} aria-haspopup="dialog"
        aria-describedby="component-inspection-hint"
        className="nodrag nopan pointer-events-auto flex h-30 w-60 flex-col justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left text-foreground shadow-sm hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onFocus={revealFocusedComponent}
        onDoubleClick={(event) => { event.stopPropagation(); inspect(component.id, event.currentTarget); }}
        onClick={(event) => { if (event.detail === 0) inspect(component.id, event.currentTarget); }}
      >
        <span className="max-w-full truncate font-semibold" title={component.name}>{component.name}</span>
        <code className="max-w-full truncate text-xs text-muted-foreground" title={component.id}>{component.id}</code>
        <span className="max-w-full truncate text-xs text-muted-foreground">{component.purpose.value}</span>
      </button>
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

function DetailsPanel({ baseline, panel, opener, onClose }: {
  baseline: ReadonlyData<Baseline>; panel: ArchitecturePanel | null;
  opener: RefObject<HTMLElement | null>; onClose: () => void;
}) {
  const title = "Component details";
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
  const inspect = useCallback((componentId: string, trigger: HTMLElement) => {
    openPanel({ kind: "component", componentId }, trigger);
  }, [openPanel]);
  const nodes = useMemo<ComponentNode[]>(() => {
    const positions = new Map(layout.nodes.map(({ id, position }) => [id, position]));
    return baseline.components.map((component) => {
      const position = positions.get(component.id);
      if (!position) throw new Error("The prepared diagram is missing a component.");
      return {
        id: component.id, type: "component", data: { component, inspect }, position: { ...position },
        width: 240, height: 120,
        ariaLabel: `${component.name}, ${component.id}`,
      };
    });
  }, [baseline, layout, inspect]);

  return (
    <section aria-labelledby="current-diagram-heading" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <h1 id="current-diagram-heading" className="min-w-0 flex-1 truncate text-base font-semibold" title={baseline.id}>{baseline.id}</h1>
        <p id="component-inspection-hint" className="sr-only lg:not-sr-only lg:text-xs lg:text-muted-foreground">Double-click a component, or focus it and press Enter, to inspect.</p>
      </div>
      {baseline.components.length === 0 ? (
        <p role="status" className="p-6 text-muted-foreground">{baseline.interfaces.length + baseline.resources.length + baseline.rules.length === 0 ? "No architecture items modeled" : "No components modeled"}</p>
      ) : <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-card" aria-label="Architecture diagram">
        <ReactFlow
          nodes={nodes} edges={[]} nodeTypes={nodeTypes} fitView
          nodesDraggable={false} nodesConnectable={false} nodesFocusable={false}
          edgesFocusable={false} elementsSelectable={false} zoomOnDoubleClick={false}
        >
          <Background />
          <Controls showInteractive={false} />
          <FitPreparedDiagram layout={layout} />
        </ReactFlow>
      </div>}
      <DetailsPanel baseline={baseline} panel={panel} opener={opener} onClose={() => setSelection(null)} />
    </section>
  );
}
