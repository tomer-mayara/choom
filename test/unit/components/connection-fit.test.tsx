import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { connectionFitBaseline, connectionFitLayout } from "../../support/connection-fit-fixture.ts";
import { interfaceViewBaseline } from "../../support/interface-view-fixtures.ts";
import { showAllConnections, showSelfConnections } from "../../support/connection-controls.tsx";

afterEach(cleanup);

async function view(baseline = connectionFitBaseline()) {
  const canvas = await renderDiagramWithViewport(baseline, connectionFitLayout, { width: 896, height: 500 });
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  const label = document.querySelector<HTMLElement>("[data-interface-label]");
  const flow = document.querySelector<HTMLElement>(".react-flow");
  const curve = document.querySelector<SVGPathElement>("path[data-interface-arc]");
  if (!label || !flow || !curve) throw new Error("The fixed fixture needs one visible curve and its keyboard control.");
  const measured = { width: 240, height: 40, canvasWidth: 896 };
  Object.defineProperties(label, { offsetWidth: { configurable: true, get: () => measured.width }, offsetHeight: { configurable: true, get: () => measured.height } });
  flow.getBoundingClientRect = () => new DOMRect(0, 0, measured.canvasWidth, 500);
  return { canvas, label, curve, measured };
}

async function fit() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Fit View" })); }); }

test("Fit ignores a hidden label outside the padded control envelope and includes it after owned inspection", async () => {
  const { canvas, label } = await view();
  const nodes = canvas.getNodes().map(({ id, position }) => ({ id, position }));
  const route = document.querySelector("path[data-interface-arc]")?.getAttribute("d");
  await fit();
  const hidden = canvas.getViewport();
  // The prepared geometry runs from x=15 to the control at x=435, plus marker padding.
  expect(hidden.zoom).toBeCloseTo(848 / (420 + 12.5 * 3 / Math.SQRT2), 8);
  expect(getComputedStyle(label).opacity).toBe("0");
  fireEvent.click(within(screen.getByRole("region", { name: "Owned interfaces" })).getByRole("button"));
  expect(canvas.getViewport()).toEqual(hidden);
  expect(getComputedStyle(label).opacity).toBe("1");
  await fit();
  // The label centered at x=390 extends the right edge to x=510.
  expect(canvas.getViewport().zoom).toBeCloseTo(848 / 495, 8);
  expect(canvas.getViewport().zoom).toBeLessThan(hidden.zoom);
  expect(canvas.getNodes().map(({ id, position }) => ({ id, position }))).toEqual(nodes);
  expect(document.querySelector("path[data-interface-arc]")?.getAttribute("d")).toBe(route);
});

test("Fit reads the current hover, label dimensions, and actual canvas space only when activated", async () => {
  const { canvas, curve, measured } = await view();
  const before = canvas.getViewport();
  fireEvent.pointerOver(curve, { pointerType: "mouse" });
  measured.width = 200;
  measured.canvasWidth = 600;
  expect(canvas.getViewport()).toEqual(before);
  await fit();
  expect(canvas.getViewport().zoom).toBeCloseTo(552 / 475, 8);
  const revealed = canvas.getViewport();
  fireEvent.pointerOut(curve, { pointerType: "mouse", relatedTarget: document.body });
  expect(canvas.getViewport()).toEqual(revealed);
  await fit();
  expect(canvas.getViewport().zoom).toBeCloseTo(552 / (420 + 12.5 * 3 / Math.SQRT2), 8);
});

test("All fits its non-self arc without inspection and includes the outside loop only while enabled", async () => {
  const { canvas } = await view(interfaceViewBaseline());
  showAllConnections();
  fireEvent.click(screen.getByRole("button", { name: "Close details" }));
  const positions = canvas.getNodes().map(({ id, position }) => ({ id, position }));
  expect(document.querySelectorAll("path[data-interface-arc]")).toHaveLength(1);
  await fit();
  const hidden = canvas.getViewport();
  expect(hidden.zoom).toBeCloseTo(848 / (420 + 12.5 * 3 / Math.SQRT2), 8);
  showSelfConnections();
  expect(canvas.getViewport()).toEqual(hidden);
  expect(document.querySelectorAll("path[data-interface-arc]")).toHaveLength(2);
  await fit();
  // The loop's control at x=495 extends the same arrangement beyond the other arc.
  expect(canvas.getViewport().zoom).toBeCloseTo(848 / (480 + 12.5 * 3 / Math.SQRT2), 8);
  expect(canvas.getViewport().zoom).toBeLessThan(hidden.zoom);
  fireEvent.click(screen.getByRole("checkbox", { name: "Show self-connections" }));
  await fit();
  expect(canvas.getViewport()).toEqual(hidden);
  expect(canvas.getNodes().map(({ id, position }) => ({ id, position }))).toEqual(positions);
  expect(screen.queryByRole("dialog")).toBeNull();
});
