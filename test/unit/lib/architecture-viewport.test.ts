import { expect, test } from "bun:test";
import { componentControlHeight } from "../../../src/lib/component-geometry.ts";
import { fitDrawingBounds, revealHeader, startingViewport } from "../../../src/lib/architecture-viewport.ts";
import type { ArchitectureLayout } from "../../../src/lib/architecture-layout.ts";

const layout: ArchitectureLayout = { nodes: [
  { id: "second-root", position: { x: 500, y: 200 }, width: 240, height: componentControlHeight },
  { id: "first-root", position: { x: 100, y: 100 }, width: 300, height: 300 },
  { id: "child", parentId: "first-root", position: { x: 24, y: 104 }, width: 240, height: componentControlHeight },
] };

test("the starting view centers complete root bounds at 100 percent when they fit", () => {
  expect(startingViewport(layout, "first-root", 1280, 800)).toEqual({ x: 220, y: 150, zoom: 1 });
});

test.each([[390, 640], [1280, 300]])("a drawing that exceeds %s by %s reveals the first baseline root at 100 percent", (width, height) => {
  expect(startingViewport(layout, "first-root", width, height)).toEqual({ x: -76, y: -76, zoom: 1 });
});

test("the starting view uses the requested root rather than layout output order", () => {
  expect(startingViewport(layout, "second-root", 390, 640)).toEqual({ x: -476, y: -176, zoom: 1 });
});

test("the starting view uses the available canvas, including a narrower open-panel canvas", () => {
  expect(startingViewport(layout, "first-root", 896, 688)).toEqual({ x: 28, y: 94, zoom: 1 });
});

test("keyboard reveal shifts only the clipped edge and preserves zoom", () => {
  expect(revealHeader({ x: 0, y: 0, zoom: 1 }, { x: 300, y: 24 }, 500, 500))
    .toEqual({ x: -44, y: 0, zoom: 1 });
});

test("an oversized header reveals its name and leading focus edge", () => {
  expect(revealHeader({ x: 2000, y: 1000, zoom: 2 }, { x: 300, y: 24 }, 320, 150))
    .toEqual({ x: -596, y: -44, zoom: 2 });
});

test.each([[1280, 800], [320, 180]])("Fit contains a widely spread drawing in the available %s by %s canvas below one percent", (width, height) => {
  const bounds = { x: -100_000, y: -2000, width: 200_000, height: 4000 };
  const viewport = fitDrawingBounds(bounds, width, height);
  expect(viewport.zoom).toBeGreaterThan(0);
  expect(viewport.zoom).toBeLessThan(0.01);
  expect(Object.values(viewport).every(Number.isFinite)).toBe(true);
  expect(viewport.x + bounds.x * viewport.zoom).toBeGreaterThanOrEqual(0);
  expect(viewport.y + bounds.y * viewport.zoom).toBeGreaterThanOrEqual(0);
  expect(viewport.x + (bounds.x + bounds.width) * viewport.zoom).toBeLessThanOrEqual(width);
  expect(viewport.y + (bounds.y + bounds.height) * viewport.zoom).toBeLessThanOrEqual(height);
});

test("Fit preserves the existing maximum zoom and keeps padding in a very small canvas", () => {
  const bounds = { x: -20, y: -20, width: 40, height: 40 };
  expect(fitDrawingBounds(bounds, 1280, 800).zoom).toBe(2);
  const tiny = fitDrawingBounds(bounds, 4, 3);
  expect(tiny.zoom).toBeGreaterThan(0);
  expect(tiny.x + bounds.x * tiny.zoom).toBeGreaterThanOrEqual(0);
  expect(tiny.y + bounds.y * tiny.zoom).toBeGreaterThanOrEqual(0);
});
