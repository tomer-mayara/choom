import { expect, test } from "bun:test";
import { revealBounds } from "../../../src/lib/architecture-viewport.ts";

test("a compact label that already fits does not move the viewport", () => {
  expect(revealBounds({ x: 0, y: 0, zoom: 1 }, { x: 300, y: 24, width: 80, height: 24 }, 500, 500))
    .toEqual({ x: 0, y: 0, zoom: 1 });
});

test("label reveal moves only its clipped edges and reserves the focus outline", () => {
  expect(revealBounds({ x: 0, y: 0, zoom: 1 }, { x: 450, y: 490, width: 80, height: 24 }, 500, 500))
    .toEqual({ x: -34, y: -18, zoom: 1 });
});

test("label reveal uses scaled dimensions at a reduced zoom", () => {
  expect(revealBounds({ x: 0, y: 0, zoom: 0.5 }, { x: 900, y: 1000, width: 80, height: 40 }, 500, 500))
    .toEqual({ x: 0, y: -24, zoom: 0.5 });
});

test("an oversized label reveals its start and leading focus edge at the same zoom", () => {
  expect(revealBounds({ x: 2000, y: 1000, zoom: 2 }, { x: 300, y: 24, width: 240, height: 40 }, 320, 70))
    .toEqual({ x: -596, y: -44, zoom: 2 });
});

test("a scaled outline keeps its complete leading edge inside the canvas", () => {
  expect(revealBounds({ x: 2000, y: 1000, zoom: 2 }, { x: 300, y: 24, width: 240, height: 40 }, 320, 70, 8))
    .toEqual({ x: -592, y: -40, zoom: 2 });
});
