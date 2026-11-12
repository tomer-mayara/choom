import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { baselineExample, proposed } from "../../support/baseline-fixtures.ts";
import { baselineWithoutComponents } from "../../support/baseline-relationship-fixtures.ts";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";

afterEach(cleanup);

function fixture() {
  const baseline = baselineExample();
  const billing = baseline.components.find(({ id }) => id === "billing");
  if (!billing) throw new Error("The fixture must contain Billing.");
  billing.parent = proposed("checkout");
  const layout = { nodes: [
    { id: "checkout", position: { x: 12, y: 12 }, width: 500, height: 400 },
    { id: "billing", parentId: "checkout", position: { x: 24, y: 112 }, width: 240, height: 88 },
  ] };
  return { baseline, layout };
}

test("Reset restores geometry and the current canvas starting view while retaining record and Back state", async () => {
  const { baseline, layout } = fixture();
  const canvas = await renderDiagramWithViewport(baseline, layout);
  const initialNodes = canvas.getNodes().map(({ id, position, width, height }) => ({ id, position, width, height }));
  const header = screen.getByRole("button", { name: "Billing, billing" });
  fireEvent.pointerDown(header, { pointerId: 1, isPrimary: true, button: 0, clientX: 120, clientY: 150 });
  fireEvent.pointerMove(window, { pointerId: 1, isPrimary: true, clientX: 920, clientY: 950 });
  fireEvent.pointerUp(window, { pointerId: 1 });
  expect(canvas.getNode("checkout")?.width).toBeGreaterThan(500);
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }), { detail: 0 });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Billing, billing" }), { detail: 0 });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoice API, invoice-api" }), { detail: 0 });
  const panel = screen.getByRole("dialog", { name: "Interface details" });
  const content = within(panel).getByLabelText("Record content");
  content.scrollTop = 80;
  await act(async () => { await canvas.setViewport({ x: -2000, y: -1000, zoom: 0.5 }); });
  const flow = document.querySelector<HTMLElement>(".react-flow");
  if (!flow) throw new Error("The rendered canvas must exist.");
  flow.getBoundingClientRect = () => new DOMRect(0, 0, 900, 600);
  const reset = screen.getByRole("button", { name: "Reset layout" });
  act(() => reset.focus());
  fireEvent.click(reset, { detail: 0 });
  await waitFor(() => expect(canvas.getViewport()).toEqual({ x: 188, y: 88, zoom: 1 }));
  expect(canvas.getNodes().map(({ id, position, width, height }) => ({ id, position, width, height }))).toEqual(initialNodes);
  expect(screen.getByRole("button", { name: "Billing, billing" })).toBe(header);
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBe(panel);
  expect(content.scrollTop).toBe(80);
  expect(document.activeElement).toBe(reset);
  fireEvent.click(within(panel).getByRole("button", { name: "Back" }));
  await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole("dialog"))
    .getByRole("button", { name: "Invoice API, invoice-api" })));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole("dialog", { name: "Baseline details" }))
    .getByRole("button", { name: "Billing, billing" })));
});

test.each([false, true])("Reset removes pointer listeners and blocks the old release click: dragging=%s", async (dragging) => {
  const { baseline, layout } = fixture();
  const canvas = await renderDiagramWithViewport(baseline, layout);
  fireEvent.click(screen.getByRole("button", { name: "Checkout, checkout" }), { detail: 0 });
  const panel = screen.getByRole("dialog");
  const header = screen.getByRole("button", { name: "Billing, billing" });
  fireEvent.pointerDown(header, { pointerId: 1, isPrimary: true, button: 0, clientX: 120, clientY: 150 });
  if (dragging) fireEvent.pointerMove(window, { pointerId: 1, isPrimary: true, clientX: 920, clientY: 950 });
  fireEvent.click(screen.getByRole("button", { name: "Reset layout" }), { detail: 0 });
  const camera = canvas.getViewport();
  fireEvent.pointerMove(window, { pointerId: 1, isPrimary: true, clientX: 1000, clientY: 1000 });
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.pointerCancel(window, { pointerId: 1 });
  fireEvent.click(header, { detail: 1 });
  expect(canvas.getNode("billing")?.position).toEqual({ x: 24, y: 112 });
  expect(canvas.getNode("checkout")?.width).toBe(500);
  expect(canvas.getViewport()).toEqual(camera);
  expect(screen.getByRole("dialog")).toBe(panel);
  expect(within(panel).getByRole("heading", { name: "Checkout" })).toBeTruthy();
  fireEvent.pointerDown(header, { pointerId: 2, isPrimary: true, button: 0, clientX: 120, clientY: 150 });
  fireEvent.pointerUp(window, { pointerId: 2 });
  fireEvent.click(header, { detail: 1 });
  expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Billing" })).toBeTruthy();
});

test("Reset replaces the old keyboard movement coordinates with a reset announcement", async () => {
  const { baseline, layout } = fixture();
  await renderDiagramWithViewport(baseline, layout);
  const header = screen.getByRole("button", { name: "Billing, billing" });
  act(() => header.focus());
  fireEvent.keyDown(header, { key: "ArrowRight" });
  expect(screen.getByLabelText("Component position").textContent).toBe("Billing: position 46, 124.");
  fireEvent.click(screen.getByRole("button", { name: "Reset layout" }), { detail: 0 });
  expect(screen.getByLabelText("Component position").textContent).toBe("Layout reset.");
});

test("a model without components has no Fit or Reset control and keeps the catalog usable", () => {
  render(<ArchitectureDiagram baseline={baselineWithoutComponents()} layout={{ nodes: [] }} />);
  expect(screen.queryByRole("button", { name: "Fit View" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reset layout" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }), { detail: 0 });
  expect(screen.getByRole("dialog", { name: "Baseline details" })).toBeTruthy();
});
