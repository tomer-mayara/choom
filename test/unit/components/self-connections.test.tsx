import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { selfConnectionBaseline } from "../../support/connection-scope-fixtures.ts";
import { showAllConnections } from "../../support/connection-controls.tsx";
import { pointerClick } from "../../support/pointer.ts";

afterEach(cleanup);

const billing: [string, string, string] = ["invoice-api:checkout", "invoice-api:reporting", "checkout-status:billing"];
const withSelf = [billing[0], billing[1], "invoice-api:billing", billing[2], "health:billing"];
function arcs() { return [...document.querySelectorAll<SVGPathElement>("path[data-interface-arc]")].map((arc) => `${arc.dataset.interfaceId}:${arc.dataset.consumerId}`); }
function choice() { return screen.getByRole<HTMLInputElement>("checkbox", { name: "Show self-connections" }); }
function selectBilling() { fireEvent.click(screen.getByRole("button", { name: "Billing, billing" })); }
function chooseSelf() { fireEvent.click(choice(), { detail: 1 }); }
function health() {
  const control = document.querySelector<HTMLButtonElement>('button[data-interface-label][data-interface-id="health"]');
  if (!control) throw new Error("The scope must contain Health's self-loop control.");
  return control;
}
function layoutFor(baseline: ReturnType<typeof selfConnectionBaseline>) {
  return { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 160 }, width: 240, height: 88 })) };
}
async function view() {
  const baseline = selfConnectionBaseline();
  return renderDiagramWithViewport(baseline, layoutFor(baseline), { width: 1200, height: 600 });
}

test("Billing hides both self-loops by default while counting both owned interfaces", async () => {
  await view(); selectBilling();
  expect(arcs()).toEqual(billing);
  expect(choice().checked).toBe(false);
  expect(screen.getByRole("button", { name: "Billing, billing" }).textContent).toBe("Billing2 interfaces");
});

test("the checkbox toggles only self-loops without changing the camera, panel, surviving routes, or controls", async () => {
  const canvas = await view(); selectBilling();
  const before = canvas.getViewport();
  const panel = screen.getByRole("dialog");
  const control = document.querySelector('[data-interface-label][data-consumer-id="checkout"]');
  const path = () => document.querySelector('path[data-interface-arc][data-consumer-id="checkout"]')?.getAttribute("d");
  const route = path();
  chooseSelf();
  expect(arcs()).toEqual(withSelf);
  expect(document.activeElement === choice()).toBe(true);
  expect(getComputedStyle(health()).opacity).toBe("0");
  chooseSelf();
  expect(arcs()).toEqual(billing);
  expect(screen.getByRole("dialog")).toBe(panel);
  expect(canvas.getViewport()).toEqual(before);
  expect(document.querySelector('[data-interface-label][data-consumer-id="checkout"]')).toBe(control);
  expect(path()).toBe(route);
});

test("the self choice is independent of Selected and All and never supplies a missing inspection scope", async () => {
  await view();
  chooseSelf();
  expect(arcs()).toEqual([]);
  showAllConnections();
  expect(arcs()).toHaveLength(6);
  expect(choice().checked).toBe(true);
  chooseSelf();
  expect(arcs()).toHaveLength(4);
  fireEvent.click(screen.getByRole("radio", { name: "Selected" }));
  expect(arcs()).toEqual([]);
  selectBilling(); chooseSelf();
  fireEvent.click(screen.getByRole("button", { name: "Close details" }));
  expect(arcs()).toEqual([]);
  expect(choice().checked).toBe(true);
});

test("a surviving self-loop keeps its route and control when direct inspection removes the parallel loop", async () => {
  await view(); selectBilling(); chooseSelf();
  const path = () => document.querySelector('path[data-interface-arc][data-interface-id="health"]')?.getAttribute("d");
  const before = path();
  const control = health();
  fireEvent.click(control, { detail: 0 });
  expect(arcs()).toEqual(["health:billing"]);
  expect(path()).toBe(before);
  expect(health()).toBe(control);
  expect(getComputedStyle(control).opacity).toBe("1");
});

test("mixed and self-only interface facts remain readable with no unknown-fact warning", async () => {
  await view(); selectBilling();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invoice API, invoice-api" }));
  expect(arcs()).toEqual(billing);
  fireEvent.keyDown(screen.getByRole("tab", { name: "Sources" }), { key: "Enter" });
  const consumers = within(screen.getByRole("dialog")).getByRole("group", { name: "Allowed consumers" }).textContent;
  for (const id of ["checkout", "reporting", "billing"]) expect(consumers).toContain(id);
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Health, health" }));
  fireEvent.keyDown(screen.getByRole("tab", { name: "Sources" }), { key: "Enter" });
  expect(arcs()).toEqual([]);
  for (const name of ["Owner", "Allowed consumers"]) expect(within(screen.getByRole("dialog")).getByRole("group", { name }).textContent).toContain("billing");
  expect(screen.getByText("No connections shown.").style.visibility).toBe("visible");
  expect(screen.queryByText(/unknown owners or allowed consumers/)).toBeNull();
});

test.each(["selected", "all"])("hiding an inspected loop keeps checkbox focus and uses owner fallback on closing %s inspection", async (mode) => {
  await view(); selectBilling(); chooseSelf();
  if (mode === "all") showAllConnections();
  const opener = health();
  act(() => opener.focus());
  pointerClick(opener);
  chooseSelf();
  expect(opener.isConnected).toBe(false);
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBeTruthy();
  expect(document.activeElement === choice()).toBe(true);
  act(() => within(screen.getByRole("dialog")).getByRole("heading", { name: "Interface details" }).focus());
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
  expect(document.activeElement === screen.getByRole("button", { name: "Billing, billing" })).toBe(true);
});

test("closing All inspection restores the recreated opener instead of another loop with the same endpoints", async () => {
  await view(); selectBilling(); chooseSelf(); showAllConnections();
  const opener = health();
  fireEvent.click(opener, { detail: 0 });
  const panel = screen.getByRole("dialog", { name: "Interface details" });
  chooseSelf();
  expect(opener.isConnected).toBe(false);
  chooseSelf();
  const restored = health();
  expect(restored).not.toBe(opener);
  expect(screen.getByRole("dialog")).toBe(panel);
  const heading = within(panel).getByRole("heading", { name: "Interface details" });
  act(() => heading.focus());
  fireEvent.keyDown(heading, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement?.getAttribute("aria-label")).toBe(restored.getAttribute("aria-label"));
  expect(document.activeElement === restored).toBe(true);
});

test("hiding and restoring a held loop rejects its stale release and accepts a fresh press", async () => {
  await view(); selectBilling(); chooseSelf();
  const old = health();
  fireEvent.pointerDown(old, { pointerId: 1, isPrimary: true, button: 0 });
  chooseSelf();
  expect(arcs()).toEqual(billing);
  expect(document.querySelector('[data-interface-label][data-interface-id="health"]')).toBeNull();
  chooseSelf();
  expect(health() === old).toBe(false);
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(health(), { detail: 1 });
  expect(screen.getByRole("dialog", { name: "Component details" })).toBeTruthy();
  act(() => health().focus());
  pointerClick(health());
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBeTruthy();
});

test("both connection choices belong to the published view and survive same-view renders and Reset", () => {
  const baseline = selfConnectionBaseline();
  const layout = layoutFor(baseline);
  const diagram = render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  showAllConnections(); chooseSelf();
  fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
  diagram.rerender(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  expect(choice().checked).toBe(true);
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "All" }).checked).toBe(true);
  diagram.rerender(<ArchitectureDiagram baseline={baseline} layout={structuredClone(layout)} />);
  expect(choice().checked).toBe(false);
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "Selected" }).checked).toBe(true);
  showAllConnections(); chooseSelf();
  diagram.rerender(<ArchitectureDiagram baseline={structuredClone(baseline)} layout={layout} />);
  expect(choice().checked).toBe(false);
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "Selected" }).checked).toBe(true);
});
