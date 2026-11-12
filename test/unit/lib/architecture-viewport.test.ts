import { expect, test } from "bun:test";
import { componentControlHeight } from "../../../src/lib/component-geometry.ts";
import { startingViewport } from "../../../src/lib/architecture-viewport.ts";
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
