import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { interfaceViewBaseline } from "../../support/interface-view-fixtures.ts";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { pointerClick } from "../../support/pointer.ts";
import { showAllConnections, showSelfConnections } from "../../support/connection-controls.tsx";

afterEach(cleanup);

const layout = { nodes: [
  { id: "checkout", position: { x: 0, y: 0 }, width: 240, height: 88 },
  { id: "billing", position: { x: 0, y: 128 }, width: 240, height: 88 },
] };

test("Fit includes measured arc labels in the actual canvas while keeping geometry and interface details", async () => {
  const baseline = interfaceViewBaseline();
  const original = structuredClone(baseline);
  const canvas = await renderDiagramWithViewport(baseline, layout);
  showAllConnections();
  showSelfConnections();
  const label = document.querySelector<HTMLElement>('[data-interface-label][data-consumer-id="billing"]');
  if (!label) throw new Error("The self-loop must have its HTML label.");
  fireEvent.click(label, { detail: 0 });
  const panel = screen.getByRole("dialog", { name: "Interface details" });
  const text = panel.textContent;
  const nodes = canvas.getNodes().map(({ id, position }) => ({ id, position }));
  const paths = [...document.querySelectorAll("path[data-interface-arc]")].map((path) => path.getAttribute("d"));
  const flow = document.querySelector<HTMLElement>(".react-flow");
  if (!flow) throw new Error("The diagram must have a canvas.");
  flow.getBoundingClientRect = () => new DOMRect(0, 0, 900, 500);
  for (const element of document.querySelectorAll("[data-interface-label]")) {
    Object.defineProperties(element, { offsetWidth: { configurable: true, value: 240 }, offsetHeight: { configurable: true, value: 60 } });
  }
  await act(async () => { await canvas.setViewport({ x: 1000, y: 1000, zoom: 2 }); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Fit View" })); });
  await waitFor(() => expect(canvas.getViewport().x + 540 * canvas.getViewport().zoom).toBeLessThanOrEqual(900));
  const viewport = canvas.getViewport();
  expect(viewport.x + 540 * viewport.zoom).toBeLessThanOrEqual(900);
  expect(viewport.x).toBeGreaterThanOrEqual(0);
  expect(viewport.y + 252.52 * viewport.zoom).toBeLessThanOrEqual(500);
  expect(canvas.getNodes().map(({ id, position }) => ({ id, position }))).toEqual(nodes);
  expect([...document.querySelectorAll("path[data-interface-arc]")].map((path) => path.getAttribute("d"))).toEqual(paths);
  expect(screen.getByRole("dialog")).toBe(panel);
  expect(panel.textContent).toBe(text);
  expect(within(panel).getByRole("group", { name: "Interface ID" }).textContent).toContain("invoice-api");
  expect(baseline).toEqual(original);
});

test("Fit below one percent shares its minimum with zoom controls, and Reset restores the normal range", async () => {
  const spread = { nodes: layout.nodes.map((node) => ({ ...node, position: { ...node.position, x: node.id === "billing" ? 100_000 : 0 } })) };
  const canvas = await renderDiagramWithViewport(interfaceViewBaseline(), spread, { width: 320, height: 180 });
  showAllConnections();
  showSelfConnections();
  const nodes = canvas.getNodes().map(({ id, position }) => ({ id, position }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Fit View" })); });
  const fitted = canvas.getViewport().zoom;
  expect(fitted).toBeGreaterThan(0);
  expect(fitted).toBeLessThan(0.01);
  expect(screen.getByRole("button", { name: "Zoom Out" }).hasAttribute("disabled")).toBe(true);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Zoom In" })); });
  expect(canvas.getViewport().zoom).toBeCloseTo(fitted * 1.2, 10);
  expect(screen.getByRole("button", { name: "Zoom Out" }).hasAttribute("disabled")).toBe(false);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Zoom Out" })); });
  expect(canvas.getViewport().zoom).toBeCloseTo(fitted, 10);
  expect(canvas.getNodes().map(({ id, position }) => ({ id, position }))).toEqual(nodes);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reset layout" })); });
  expect(canvas.getViewport().zoom).toBe(1);
  for (let step = 0; step < 40 && !screen.getByRole("button", { name: "Zoom Out" }).hasAttribute("disabled"); step += 1) {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Zoom Out" })); });
  }
  expect(canvas.getViewport().zoom).toBe(0.01);
});

test.each([false, true])("Reset ends an arc press and preserves its exact label and inspection path: moved=%s", async (moved) => {
  const canvas = await renderDiagramWithViewport(interfaceViewBaseline(), layout);
  showAllConnections();
  showSelfConnections();
  if (moved) fireEvent.keyDown(screen.getByRole("button", { name: "Billing, billing" }), { key: "ArrowRight" });
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }), { detail: 0 });
  fireEvent.click(within(screen.getByRole("region", { name: "Interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  const panel = screen.getByRole("dialog", { name: "Interface details" });
  const label = document.querySelector<HTMLElement>('[data-interface-label][data-consumer-id="billing"]');
  if (!label) throw new Error("The self-loop must have its label.");
  fireEvent.pointerDown(label, { pointerId: 1, isPrimary: true, button: 0 });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reset layout" }), { detail: 0 }); });
  fireEvent.pointerUp(label, { pointerId: 1 });
  fireEvent.click(label, { detail: 1 });
  expect(screen.getByRole("dialog")).toBe(panel);
  expect(screen.queryByRole("button", { name: "Back" })).not.toBeNull();
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "All" }).checked).toBe(true);
  expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Show self-connections" }).checked).toBe(true);
  expect(document.querySelector('[data-interface-label][data-consumer-id="billing"]')).toBe(label);
  expect(canvas.getViewport().zoom).toBe(1);
  pointerClick(label);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(document.activeElement).toBe(label);
});
