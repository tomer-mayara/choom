import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "./architecture-layout.ts";

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
