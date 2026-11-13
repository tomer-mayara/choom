import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { connectionScopeBaseline } from "../../support/connection-scope-fixtures.ts";
import { fixtureItem, proposed } from "../../support/baseline-fixtures.ts";
import { pointerClick } from "../../support/pointer.ts";

afterEach(cleanup);

const checkout = ["invoice-api:checkout", "checkout-status:billing"];
const billing = ["invoice-api:checkout", "invoice-api:reporting", "checkout-status:billing"];
const all = [...billing, "identity-api:reporting"];

function arcs() {
  return [...document.querySelectorAll<SVGPathElement>("path[data-interface-arc]")].map((arc) => `${arc.dataset.interfaceId}:${arc.dataset.consumerId}`);
}

function label(consumer = "checkout") {
  const control = document.querySelector<HTMLButtonElement>(`button[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="${consumer}"]`);
  if (!control) throw new Error("The selected scope must include this Invoice API control.");
  return control;
}

function select(name: string) { fireEvent.click(within(document.querySelector(".react-flow") as HTMLElement).getByRole("button", { name: `${name}, ${name.toLowerCase()}` })); }
function chooseAll() { fireEvent.click(screen.getByRole("radio", { name: "All" })); }
function ownedInvoice() { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoice API, invoice-api" })); }

async function view(baseline = connectionScopeBaseline()) {
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 160 }, width: 240, height: 88 })) };
  const viewport = await renderDiagramWithViewport(baseline, layout, { width: 1200, height: 600 });
  return { baseline, layout, viewport };
}

test("a new view shows components and counts without interface arcs or their keyboard controls", async () => {
  await view();
  expect(arcs()).toEqual([]);
  expect(document.querySelectorAll("button[data-interface-label]")).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Billing, billing" }).textContent).toBe("Billing1 interface");
  expect(screen.getByRole("radio", { name: "Selected" }).getAttribute("checked")).not.toBeNull();
});

test("component scope includes incoming and outgoing arcs and preserves shared controls when selection changes", async () => {
  const { viewport } = await view();
  const before = viewport.getNodes().map(({ id, position }) => ({ id, position }));
  select("Checkout");
  expect(arcs()).toEqual(checkout);
  const shared = label();
  select("Billing");
  expect(arcs()).toEqual(billing);
  expect(label()).toBe(shared);
  expect([...document.querySelectorAll<HTMLElement>("[data-interface-label]")].map((control) => `${control.dataset.interfaceId}:${control.dataset.consumerId}`)).toEqual(billing);
  expect(viewport.getNodes().map(({ id, position }) => ({ id, position }))).toEqual(before);
});

test("a parallel arc keeps its lane when inspection hides its neighboring interface", async () => {
  const baseline = connectionScopeBaseline();
  baseline.interfaces.push({ ...structuredClone(fixtureItem(baseline.interfaces)), id: "invoice-events", name: "Invoice events" });
  await view(baseline); select("Billing");
  const path = () => document.querySelector('path[data-interface-arc][data-interface-id="invoice-api"][data-consumer-id="checkout"]')?.getAttribute("d");
  const before = path();
  fireEvent.click(label(), { detail: 0 });
  expect(arcs()).toEqual(billing.slice(0, 2));
  expect(path()).toBe(before);
});

test("All shows four arcs and keeps component inspection and its camera", async () => {
  const { viewport } = await view();
  select("Checkout");
  const before = viewport.getViewport();
  expect(screen.queryByRole("radio", { name: "All" })).not.toBeNull();
  chooseAll();
  expect(arcs()).toEqual(all);
  expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Checkout" })).toBeTruthy();
  expect(viewport.getViewport()).toEqual(before);
});

test("changing to Selected focuses its choice even when native click leaves focus on an excluded arc", async () => {
  await view(); select("Checkout"); chooseAll();
  act(() => label("reporting").focus());
  const choice = screen.getByRole("radio", { name: "Selected" });
  fireEvent.click(choice, { detail: 1 });
  expect(arcs()).toEqual(checkout);
  expect(document.activeElement === choice).toBe(true);
});

test("owned interface and resource navigation preserve a component reached through Baseline details", async () => {
  await view();
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Billing, billing" }));
  ownedInvoice();
  expect(arcs()).toEqual(billing);
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(document.activeElement).toBe(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoice API, invoice-api" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByText("Resources"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoices, invoice-store" }));
  expect(arcs()).toEqual(billing);
});

test.each(["Baseline details", "Rules"])("%s removes the selected connection scope", async (route) => {
  await view(); select("Checkout");
  fireEvent.click(screen.getByRole("button", { name: route }));
  expect(arcs()).toEqual([]);
  expect(document.querySelectorAll("button[data-interface-label]")).toHaveLength(0);
  expect(screen.getByText("No connections shown.")).toBeTruthy();
});

test.each(["Baseline details", "Rules"])("a pointer open of %s retains focus when the browser leaves focus on a filtered arc", async (route) => {
  await view(); select("Checkout");
  act(() => label().focus());
  fireEvent.click(screen.getByRole("button", { name: route }), { detail: 1 });
  expect(arcs()).toEqual([]);
  expect(document.activeElement === within(screen.getByRole("dialog")).getByRole("heading", { name: route })).toBe(true);
});

test("a standalone interface has its own scope, while a standalone resource has none", async () => {
  await view();
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoice API, invoice-api" }));
  expect(arcs()).toEqual(billing.slice(0, 2));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(arcs()).toEqual([]);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoices, invoice-store" }));
  expect(arcs()).toEqual([]);
});

test("a parent's scope does not inherit connections between its descendants", async () => {
  const baseline = connectionScopeBaseline();
  baseline.components.push({ ...structuredClone(fixtureItem(baseline.components)), id: "group", name: "Group" });
  fixtureItem(baseline.components).parent = proposed("group");
  fixtureItem(baseline.components, 1).parent = proposed("group");
  const layout = { nodes: [
    { id: "group", position: { x: 0, y: 0 }, width: 600, height: 500 },
    ...baseline.components.filter(({ id }) => id !== "group").map(({ id, parent }, index) => ({
      id, position: { x: 24, y: 110 + index * 110 }, width: 240, height: 88, ...(parent?.value ? { parentId: parent.value } : {}),
    })),
  ] };
  await renderDiagramWithViewport(baseline, layout);
  select("Group");
  expect(arcs()).toEqual([]);
});

test.each(["panel", "arc"])("closing Selected from the %s restores the hidden arc's owner header", async (source) => {
  await view(); select("Checkout");
  const opener = label();
  if (source === "panel") fireEvent.click(opener, { detail: 0 });
  else act(() => opener.focus());
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
  expect(arcs()).toEqual([]);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Billing, billing" }));
});

test("closing All returns to the exact surviving opener and leaves outside focus alone", async () => {
  await view(); chooseAll();
  const opener = label("reporting");
  fireEvent.click(opener, { detail: 0 });
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
  expect(arcs()).toEqual(all);
  expect(document.activeElement).toBe(opener);
  select("Checkout");
  act(() => opener.focus());
  fireEvent.keyDown(opener, { key: "Escape" });
  expect(document.activeElement).toBe(opener);
});

test("hiding and showing the same arc cancels its old press and accepts a fresh press", async () => {
  await view(); select("Checkout");
  fireEvent.pointerDown(label(), { pointerId: 1, isPrimary: true, button: 0 });
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  expect(arcs()).toEqual([]);
  expect(document.querySelectorAll("button[data-interface-label]")).toHaveLength(0);
  select("Checkout");
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(label(), { detail: 1 });
  expect(screen.queryByRole("dialog", { name: "Interface details" })).toBeNull();
  pointerClick(label());
  expect(arcs()).toEqual(billing.slice(0, 2));
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
});

test("All belongs to the published baseline/layout pair and Reset keeps the choice", async () => {
  const baseline = connectionScopeBaseline();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: 300 * index, y: 0 }, width: 240, height: 88 })) };
  const diagram = render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  chooseAll();
  await waitFor(() => expect(arcs()).toEqual(all));
  fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
  expect(arcs()).toEqual(all);
  diagram.rerender(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  expect(arcs()).toEqual(all);
  diagram.rerender(<ArchitectureDiagram baseline={structuredClone(baseline)} layout={structuredClone(layout)} />);
  expect(arcs()).toEqual([]);
  expect((screen.getByRole("radio", { name: "Selected" }) as HTMLInputElement).checked).toBe(true);
});
