import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { connectionScopeBaseline } from "../../support/connection-scope-fixtures.ts";
import { showAllConnections } from "../../support/connection-controls.tsx";
import { pointerClick } from "../../support/pointer.ts";

afterEach(cleanup);

async function view(component = "Checkout") {
  const baseline = connectionScopeBaseline();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 160 }, width: 240, height: 88 })) };
  const canvas = await renderDiagramWithViewport(baseline, layout, { width: 1200, height: 600 });
  fireEvent.click(screen.getByRole("button", { name: `${component}, ${component.toLowerCase()}` }));
  return canvas;
}

function label(consumer = "checkout", id = "invoice-api") {
  const control = document.querySelector<HTMLButtonElement>(`[data-interface-label][data-interface-id="${id}"][data-consumer-id="${consumer}"]`);
  if (!control) throw new Error("The scope must include this arc control.");
  return control;
}

function curve() {
  const path = document.querySelector<SVGPathElement>('path[data-interface-arc][data-interface-id="invoice-api"][data-consumer-id="checkout"]');
  if (!path) throw new Error("The scope must include this arc curve.");
  return path;
}

function painted(control: HTMLElement) { return getComputedStyle(control).opacity !== "0" && getComputedStyle(control).visibility !== "hidden"; }

test("component selection keeps arc text hidden with accessible keyboard controls and no label pointer targets", async () => {
  await view();
  expect(painted(label())).toBe(false);
  expect(painted(label("billing", "checkout-status"))).toBe(false);
  expect(label().getAttribute("aria-label")).toBe("Invoice API, invoice-api; consumer Checkout, checkout; owner Billing, billing");
  expect(label().tabIndex).toBe(0);
  expect(getComputedStyle(label()).pointerEvents).toBe("none");
});

test("curve hover reveals only its transparent label and preserves its control and camera", async () => {
  const canvas = await view();
  const control = label();
  const before = canvas.getViewport();
  fireEvent.pointerOver(curve(), { pointerType: "mouse" });
  expect(painted(label())).toBe(true);
  expect(painted(label("billing", "checkout-status"))).toBe(false);
  expect(getComputedStyle(label()).pointerEvents).toBe("auto");
  expect(getComputedStyle(label()).backgroundColor).toBe("transparent");
  expect(label()).toBe(control);
  expect(canvas.getViewport()).toEqual(before);
});

test("pointer handoff from curve to label retains visibility until leaving both", async () => {
  await view();
  const path = curve();
  const control = label();
  fireEvent.pointerOver(path, { pointerType: "mouse" });
  fireEvent.pointerOut(path, { pointerType: "mouse", relatedTarget: control });
  fireEvent.pointerOver(control, { pointerType: "mouse", relatedTarget: path });
  expect(painted(control)).toBe(true);
  fireEvent.pointerOut(control, { pointerType: "mouse", relatedTarget: document.body });
  expect(painted(control)).toBe(false);
});

test("keyboard focus reveals a label without selecting a record and blur hides it", async () => {
  await view();
  const panel = screen.getByRole("dialog");
  act(() => label().focus());
  expect(painted(label())).toBe(true);
  expect(screen.getByRole("dialog")).toBe(panel);
  act(() => label().blur());
  expect(painted(label())).toBe(false);
});

test("interface inspection keeps its shown labels revealed while other arcs still respond to hover", async () => {
  await view("Billing");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoice API, invoice-api" }));
  expect(painted(label())).toBe(true);
  expect(painted(label("reporting"))).toBe(true);
  const other = label("billing", "checkout-status");
  expect(painted(other)).toBe(false);
  const otherCurve = document.querySelector('path[data-interface-arc][data-interface-id="checkout-status"]');
  if (!otherCurve) throw new Error("Billing must keep its reverse interface.");
  fireEvent.pointerOver(otherCurve, { pointerType: "mouse" });
  expect(painted(other)).toBe(true);
  fireEvent.pointerOut(otherCurve, { pointerType: "mouse", relatedTarget: document.body });
  expect(painted(other)).toBe(false);
  expect(painted(label())).toBe(true);
});

test("pointer reuse of an already keyboard-focused arc clears keyboard-only reveal", async () => {
  await view(); showAllConnections();
  const control = label();
  act(() => control.focus());
  expect(painted(control)).toBe(true);
  pointerClick(control);
  fireEvent.click(screen.getByRole("button", { name: "Close details" }), { detail: 1 });
  expect(document.activeElement === control).toBe(true);
  expect(painted(control)).toBe(false);
});

test("key input on a pointer-focused arc reveals its label after inspection ends", async () => {
  await view(); showAllConnections();
  pointerClick(label());
  fireEvent.keyDown(label(), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(painted(label())).toBe(true);
});

test("keyboard input reveals an off-screen label that already has pointer focus", async () => {
  const canvas = await view(); showAllConnections();
  await act(async () => { await canvas.setViewport({ x: 2000, y: 1000, zoom: 2 }); });
  label().getBoundingClientRect = () => new DOMRect(0, 0, 160, 48);
  const before = canvas.getViewport();
  fireEvent.pointerDown(curve(), { pointerId: 1, isPrimary: true, button: 0 });
  fireEvent.click(curve(), { detail: 1 });
  expect(canvas.getViewport()).toEqual(before);
  expect(document.activeElement === label()).toBe(true);
  fireEvent.keyDown(label(), { key: "Escape" });
  await waitFor(() => expect(canvas.getViewport()).not.toEqual(before));
  expect(canvas.getViewport().zoom).toBe(2);
  expect(document.activeElement === label()).toBe(true);
});

test.each(["Shift", "Control", "Meta", "Alt"])("the %s modifier alone does not leave a pointer-focused label revealed", async (key) => {
  await view(); showAllConnections();
  pointerClick(label());
  fireEvent.click(screen.getByRole("button", { name: "Close details" }), { detail: 1 });
  expect(document.activeElement === label()).toBe(true);
  fireEvent.keyDown(label(), { key });
  expect(painted(label())).toBe(false);
});

test("a touch press opens a curve without hover or camera changes", async () => {
  const canvas = await view();
  const before = canvas.getViewport();
  fireEvent.pointerOver(curve(), { pointerType: "touch" });
  expect(painted(label())).toBe(false);
  fireEvent.pointerDown(curve(), { pointerType: "touch", pointerId: 3, isPrimary: true, button: 0 });
  fireEvent.pointerUp(curve(), { pointerType: "touch", pointerId: 3 });
  fireEvent.click(curve(), { detail: 1 });
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBeTruthy();
  expect(painted(label())).toBe(true);
  expect(canvas.getViewport()).toEqual(before);
});
