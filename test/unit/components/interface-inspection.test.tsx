import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { interfaceInspectionBaseline } from "../../support/interface-inspection-fixtures.ts";
import { pointerClick } from "../../support/pointer.ts";
import { showAllConnections } from "../../support/connection-controls.tsx";

afterEach(cleanup);

async function view(baseline = interfaceInspectionBaseline()) {
  const layout = { nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 300, y: 160 }, width: 240, height: 88,
  })) };
  const canvas = await renderDiagramWithViewport(baseline, layout, { width: 1000, height: 600 });
  showAllConnections();
  return { baseline, layout, canvas };
}

function label(consumer = "checkout"): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="${consumer}"]`);
  if (!element) throw new Error("The rendered Invoice API arc must have a label.");
  return element;
}

function curve(interfaceId: string, consumer: string): SVGPathElement {
  const element = document.querySelector<SVGPathElement>(`path[data-interface-arc][data-interface-id="${interfaceId}"][data-consumer-id="${consumer}"]`);
  if (!element) throw new Error("The rendered interface arc must have a curve.");
  return element;
}

test("a first arc-label pointer click opens a fresh interface path and retains canvas focus", async () => {
  await view();
  const opener = label();
  pointerClick(opener);
  const panel = screen.queryByRole("dialog", { name: "Interface details" });
  expect(panel).not.toBeNull();
  expect(within(panel as HTMLElement).getByRole("heading", { name: "Invoice API" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(document.activeElement).toBe(opener);
});

test("a curve press opens its interface and focuses its label without changing the camera", async () => {
  const { canvas } = await view();
  const before = canvas.getViewport();
  const curve = document.querySelector('path[data-interface-arc][data-interface-id="invoice-api"][data-consumer-id="checkout"]');
  if (!curve) throw new Error("The rendered Invoice API arc must have a curve.");
  fireEvent.pointerDown(curve, { pointerId: 1, isPrimary: true, button: 0 });
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(curve, { detail: 1 });
  expect(screen.queryByRole("dialog", { name: "Interface details" })).not.toBeNull();
  expect(document.activeElement).toBe(label());
  expect(canvas.getViewport()).toEqual(before);
});

test("short labels use their content width with the header width as a cap", async () => {
  await view();
  expect(label().style.width).toBe("max-content");
  expect(label().style.maxWidth).toBe("240px");
});

test.each(["checkout", "reporting"])("keyboard activation and close preserve the exact %s arc opener", async (consumer) => {
  await view();
  const opener = label(consumer);
  expect(opener.tagName).toBe("BUTTON");
  fireEvent.click(opener, { detail: 0 });
  const heading = within(screen.getByRole("dialog")).getByRole("heading", { name: "Interface details" });
  expect(document.activeElement).toBe(heading);
  fireEvent.keyDown(heading, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});

test("a new pointer arc selection replaces a panel path and keeps focus on its own label", async () => {
  await view();
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }), { detail: 0 });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoice API, invoice-api" }));
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  pointerClick(label("reporting"));
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(document.activeElement).toBe(label("reporting"));
});

test("component inspection highlights incoming and outgoing arcs and dims unrelated arcs", async () => {
  await view();
  pointerClick(screen.getByRole("button", { name: "Checkout, checkout" }));
  expect(Number(curve("invoice-api", "checkout").style.strokeWidth)).toBeGreaterThan(1.5);
  expect(Number(curve("order-api", "billing").style.strokeWidth)).toBeGreaterThan(1.5);
  expect(Number(curve("invoice-api", "reporting").style.opacity)).toBeGreaterThan(0);
  expect(Number(curve("invoice-api", "reporting").style.opacity)).toBeLessThan(1);
});

test.each(["arc", "owner list"])("interface inspection from the %s highlights its two arcs and dims another interface", async (source) => {
  await view();
  const owner = screen.getByRole("button", { name: "Billing, billing" });
  if (source === "arc") pointerClick(label());
  else {
    pointerClick(owner);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoice API, invoice-api" }));
  }
  for (const consumer of ["checkout", "reporting"]) {
    expect(Number(curve("invoice-api", consumer).style.strokeWidth)).toBeGreaterThan(1.5);
    expect(Number(curve("invoice-api", consumer).style.opacity)).toBe(1);
  }
  expect(Number(curve("order-api", "billing").style.opacity)).toBeLessThan(1);
  expect(owner.getAttribute("aria-pressed")).toBe(String(source === "owner list"));
});

test.each(["close", "baseline", "rules", "resource"])("arcs have normal emphasis for %s inspection", async (kind) => {
  const baseline = interfaceInspectionBaseline();
  const resource = baseline.resources[0];
  if (!resource) throw new Error("The fixture must have a resource.");
  resource.owner.value = "billing";
  await view(baseline);
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  if (kind === "close") fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  else if (kind === "baseline") fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  else if (kind === "rules") fireEvent.click(screen.getByRole("button", { name: "Rules" }));
  else {
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Resources"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoices, invoice-store" }));
  }
  const paths = document.querySelectorAll<SVGPathElement>("path[data-interface-arc]");
  expect(paths).toHaveLength(3);
  for (const element of paths) {
    expect(Number(element.style.strokeWidth)).toBe(1.5);
    expect(Number(element.style.opacity)).toBe(1);
  }
});

test("keyboard focus reveals an off-screen label without changing zoom or inspection", async () => {
  const { canvas } = await view();
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  await act(async () => { await canvas.setViewport({ x: 2000, y: 1000, zoom: 2 }); });
  const before = canvas.getViewport();
  label().getBoundingClientRect = () => new DOMRect(0, 0, 160, 48);
  act(() => label().focus());
  await waitFor(() => expect(canvas.getViewport()).not.toEqual(before));
  expect(canvas.getViewport().zoom).toBe(2);
  expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Billing" })).toBeTruthy();
  expect(document.activeElement).toBe(label());
});

test("pointer focus on an off-screen label never pans when its visible curve is selected", async () => {
  const { canvas } = await view();
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  await act(async () => { await canvas.setViewport({ x: 2000, y: 1000, zoom: 2 }); });
  label().getBoundingClientRect = () => new DOMRect(0, 0, 160, 48);
  const before = canvas.getViewport();
  fireEvent.pointerDown(curve("invoice-api", "checkout"), { pointerId: 1, isPrimary: true, button: 0 });
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(curve("invoice-api", "checkout"), { detail: 1 });
  expect(canvas.getViewport()).toEqual(before);
  expect(document.activeElement).toBe(label());
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBeTruthy();
});

test.each(["finished", "cancelled"])("a %s component drag cannot select an arc, but a fresh arc click can", async (ending) => {
  await view();
  const header = screen.getByRole("button", { name: "Checkout, checkout" });
  fireEvent.pointerDown(header, { pointerId: 1, isPrimary: true, button: 0, clientX: 120, clientY: 180 });
  fireEvent.pointerMove(window, { pointerId: 1, isPrimary: true, clientX: 155, clientY: 205 });
  if (ending === "cancelled") fireEvent.keyDown(header, { key: "Escape" });
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(curve("invoice-api", "checkout"), { detail: 1 });
  expect(screen.queryByRole("dialog")).toBeNull();
  pointerClick(label());
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBeTruthy();
  fireEvent.keyDown(label(), { key: "Escape" });
  fireEvent.click(label(), { detail: 0 });
  expect(document.activeElement).toBe(within(screen.getByRole("dialog")).getByRole("heading", { name: "Interface details" }));
});

test("an arc press from an old view cannot open a replacement with the same IDs", async () => {
  const baseline = interfaceInspectionBaseline();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 300, y: 160 }, width: 240, height: 88,
  })) };
  const diagram = render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  showAllConnections();
  await waitFor(() => expect(label()).toBeTruthy());
  fireEvent.pointerDown(label(), { pointerId: 1, isPrimary: true, button: 0 });
  diagram.rerender(<ArchitectureDiagram baseline={structuredClone(baseline)} layout={structuredClone(layout)} />);
  showAllConnections();
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(label(), { detail: 1 });
  expect(screen.queryByRole("dialog")).toBeNull();
  pointerClick(label());
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBeTruthy();
});

test("arc keyboard controls follow interface and consumer order after replacement with reused IDs", async () => {
  const baseline = interfaceInspectionBaseline();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 300, y: 160 }, width: 240, height: 88,
  })) };
  const diagram = render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  showAllConnections();
  const order = () => [...document.querySelectorAll<HTMLElement>("button[data-interface-label]")]
    .map((element) => `${element.dataset.interfaceId}:${element.dataset.consumerId}`);
  await waitFor(() => expect(order()).toEqual(["invoice-api:checkout", "invoice-api:reporting", "order-api:billing"]));
  const replacement = structuredClone(baseline);
  replacement.interfaces.reverse();
  replacement.interfaces.find(({ id }) => id === "invoice-api")?.allowedConsumers.value?.reverse();
  diagram.rerender(<ArchitectureDiagram baseline={replacement} layout={structuredClone(layout)} />);
  showAllConnections();
  await waitFor(() => expect(order()).toEqual(["order-api:billing", "invoice-api:reporting", "invoice-api:checkout"]));
});

test("selection and movement keep the same arc label available for focus return", async () => {
  await view();
  const opener = label("reporting");
  fireEvent.click(opener, { detail: 0 });
  expect(label("reporting")).toBe(opener);
  const header = screen.getByRole("button", { name: "Checkout, checkout" });
  fireEvent.pointerDown(header, { pointerId: 1, isPrimary: true, button: 0, clientX: 120, clientY: 180 });
  fireEvent.pointerMove(window, { pointerId: 1, isPrimary: true, clientX: 155, clientY: 205 });
  fireEvent.pointerUp(window, { pointerId: 1 });
  expect(label("reporting")).toBe(opener);
  const heading = within(screen.getByRole("dialog")).getByRole("heading", { name: "Interface details" });
  act(() => heading.focus());
  fireEvent.keyDown(heading, { key: "Escape" });
  expect(document.activeElement).toBe(opener);
});
