import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "./architecture-layout.ts";
import { interfaceArcHighlightedStroke, interfaceArcMarkerSize, type InterfaceArcRoute } from "./interface-arc-geometry.ts";

export interface DrawingBounds { x: number; y: number; width: number; height: number }

function include(bounds: DrawingBounds | null, item: DrawingBounds): DrawingBounds {
  if (!bounds) return { ...item };
  const x = Math.min(bounds.x, item.x);
  const y = Math.min(bounds.y, item.y);
  return { x, y, width: Math.max(bounds.x + bounds.width, item.x + item.width) - x,
    height: Math.max(bounds.y + bounds.height, item.y + item.height) - y };
}

export function drawingBounds(geometry: ReadonlyData<ArchitectureLayout>, arcs: readonly InterfaceArcRoute[],
  labels: ReadonlyMap<string, { width: number; height: number }> = new Map()): DrawingBounds | null {
  let bounds: DrawingBounds | null = null;
  for (const node of geometry.nodes) {
    if (!node.parentId) bounds = include(bounds, { ...node.position, width: node.width, height: node.height });
  }
  for (const arc of arcs) {
    // A cubic stays inside the envelope of its endpoints and control points.
    // The marker viewport's diagonal also contains rotated, highlighted arrowheads.
    const padding = interfaceArcMarkerSize * interfaceArcHighlightedStroke / Math.SQRT2;
    for (const { x, y } of [arc.start, ...arc.controls, arc.end]) {
      bounds = include(bounds, { x: x - padding, y: y - padding, width: padding * 2, height: padding * 2 });
    }
    const label = labels.get(arc.id);
    if (label) bounds = include(bounds, { x: arc.label.x - label.width / 2, y: arc.label.y - label.height / 2, ...label });
  }
  return bounds;
}
