import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "./architecture-layout.ts";
import { componentControlHeight, componentControlWidth } from "./component-geometry.ts";
import type { DrawingBounds } from "./architecture-bounds.ts";

export const normalMinimumZoom = 0.01;
export const maximumDiagramZoom = 2;

export function fitDrawingBounds(bounds: DrawingBounds, width: number, height: number): { x: number; y: number; zoom: number } {
  const padding = Math.min(24, width / 4, height / 4);
  const zoom = Math.min(maximumDiagramZoom,
    (width - padding * 2) / bounds.width, (height - padding * 2) / bounds.height);
  return { x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: height / 2 - (bounds.y + bounds.height / 2) * zoom, zoom };
}

/** Reveal focused content at the current zoom, or its start when it is larger than the canvas. */
export function revealBounds(
  viewport: { x: number; y: number; zoom: number },
  bounds: { x: number; y: number; width: number; height: number }, width: number, height: number, padding = 4,
): { x: number; y: number; zoom: number } {
  const revealAxis = (offset: number, origin: number, extent: number, available: number) => {
    const start = origin * viewport.zoom + offset;
    const size = extent * viewport.zoom;
    if (size > available - padding * 2 || start < padding) return offset + padding - start;
    if (start + size > available - padding) return offset + available - padding - start - size;
    return offset;
  };
  return { x: revealAxis(viewport.x, bounds.x, bounds.width, width),
    y: revealAxis(viewport.y, bounds.y, bounds.height, height), zoom: viewport.zoom };
}

export function revealHeader(
  viewport: { x: number; y: number; zoom: number }, position: { x: number; y: number }, width: number, height: number,
): { x: number; y: number; zoom: number } {
  return revealBounds(viewport, { ...position, width: componentControlWidth, height: componentControlHeight }, width, height);
}

/** Start at normal text size in the available canvas. */
export function startingViewport(
  layout: ReadonlyData<ArchitectureLayout>, firstRootId: string, width: number, height: number,
): { x: number; y: number; zoom: number } {
  const roots = layout.nodes.filter(({ parentId }) => !parentId);
  const firstRoot = roots.find(({ id }) => id === firstRootId);
  if (!firstRoot) throw new Error("The prepared diagram has no starting component.");
  const left = Math.min(...roots.map(({ position }) => position.x));
  const top = Math.min(...roots.map(({ position }) => position.y));
  const right = Math.max(...roots.map(({ position, width }) => position.x + width));
  const bottom = Math.max(...roots.map(({ position, height }) => position.y + height));
  const padding = 24;
  if (right - left + padding * 2 <= width && bottom - top + padding * 2 <= height) {
    return { x: (width - right - left) / 2, y: (height - bottom - top) / 2, zoom: 1 };
  }
  return { x: padding - firstRoot.position.x, y: padding - firstRoot.position.y, zoom: 1 };
}
