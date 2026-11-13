import { ControlButton, useReactFlow, useStoreApi } from "@xyflow/react";
import { Maximize } from "lucide-react";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import type { InterfaceArcRoute } from "../lib/interface-arc-geometry.ts";
import { drawingBounds } from "../lib/architecture-bounds.ts";
import { fitDrawingBounds } from "../lib/architecture-viewport.ts";

export function FitDrawingControl({ geometry, arcs, setMinimumZoom }: {
  geometry: ReadonlyData<ArchitectureLayout>; arcs: readonly InterfaceArcRoute[];
  setMinimumZoom: (zoom: number) => void;
}) {
  const { setViewport } = useReactFlow();
  const store = useStoreApi();
  return <ControlButton type="button" title="Fit View" aria-label="Fit View" onClick={() => {
    const { domNode, width, height } = store.getState();
    const canvas = domNode?.getBoundingClientRect();
    const availableWidth = canvas?.width || width;
    const availableHeight = canvas?.height || height;
    if (availableWidth <= 0 || availableHeight <= 0) return;
    const labels = new Map<string, { width: number; height: number }>();
    for (const label of domNode?.querySelectorAll<HTMLElement>('[data-interface-label][data-label-visible="true"]') ?? []) {
      const id = JSON.stringify([label.dataset.interfaceId, label.dataset.consumerId, label.dataset.ownerId]);
      labels.set(id, { width: label.offsetWidth, height: label.offsetHeight });
    }
    const bounds = drawingBounds(geometry, arcs, labels);
    if (!bounds) return;
    const viewport = fitDrawingBounds(bounds, availableWidth, availableHeight);
    setMinimumZoom(viewport.zoom);
    void setViewport(viewport);
  }}><Maximize aria-hidden="true" style={{ fill: "none" }} /></ControlButton>;
}
