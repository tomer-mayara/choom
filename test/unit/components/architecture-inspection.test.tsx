import { afterEach, expect, test } from "bun:test";
import { componentControlHeight } from "../../../src/lib/component-geometry.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { baselineExample, fixtureItem, proposed } from "../../support/baseline-fixtures.ts";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { pointerClick } from "../../support/pointer.ts";

afterEach(cleanup);

function view(baseline = baselineExample()) {
  const layout = { nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 260, y: 0 }, width: 240, height: componentControlHeight,
  })) };
  render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  return baseline;
}

test("one pointer selection opens a nonmodal side panel without moving focus into it", () => {
  view();
  const billing = screen.getByRole("button", { name: "Billing, billing" });
  billing.focus();
  pointerClick(billing);
  const panel = screen.getByRole("dialog", { name: "Component details" });
  expect(panel.getAttribute("aria-modal")).toBe("false");
  expect(document.activeElement).toBe(billing);
  expect(within(panel).getByRole("heading", { name: "Billing" })).toBeTruthy();
});

test("pointer selection moves focus from the panel to its canvas header without moving the camera", async () => {
  const baseline = baselineExample();
  const canvas = await renderDiagramWithViewport(baseline, { nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 240, y: 24 }, width: 240, height: componentControlHeight,
  })) });
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }), { detail: 0 });
  expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  await act(async () => { await canvas.setViewport({ x: -120, y: 20, zoom: 1 }); });
  const camera = canvas.getViewport();
  const checkout = screen.getByRole("button", { name: "Checkout, checkout" });
  pointerClick(checkout);
  expect(document.activeElement === checkout).toBe(true);
  expect(canvas.getViewport()).toEqual(camera);
});

test("component inspection lists only direct ownership and Back restores the chosen row", () => {
  const baseline = view();
  const original = structuredClone(baseline);
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  const panel = screen.getByRole("dialog");
  const list = within(panel).getByRole("region", { name: "Owned interfaces" });
  expect(within(list).getAllByRole("button").length).toBe(1);
  const row = within(list).getByRole("button", { name: "Invoice API, invoice-api" });
  fireEvent.click(row);
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBeTruthy();
  expect(screen.getByRole("group", { name: "Allowed consumers" }).textContent).toContain("checkout");
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  const restored = within(screen.getByRole("dialog")).getByRole("button", { name: "Invoice API, invoice-api" });
  expect(document.activeElement).toBe(restored);
  expect(baseline).toEqual(original);
});

test("baseline lists include unowned resources and open their recorded details", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  const resources = within(screen.getByRole("dialog")).getByRole("region", { name: "Resources" });
  expect(resources.textContent).toContain("Owner unknown");
  fireEvent.click(within(resources).getByRole("button", { name: "Invoices, invoice-store" }));
  expect(screen.getByRole("dialog", { name: "Resource details" })).toBeTruthy();
  expect(screen.getByRole("group", { name: "Owner" }).textContent).toContain("Unknown (null)");
});

test("Escape outside the nonmodal inspector preserves external focus", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  const checkout = screen.getByRole("button", { name: "Checkout, checkout" });
  act(() => checkout.focus());
  fireEvent.keyDown(checkout, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(checkout);
});

test("closing inspection uses Baseline details when the opener becomes hidden", () => {
  view();
  const billing = screen.getByRole("button", { name: "Billing, billing" });
  fireEvent.click(billing, { detail: 0 });
  billing.hidden = true;
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(document.activeElement === screen.getByRole("button", { name: "Baseline details" })).toBe(true);
});

test("a new toolbar path moves removed panel focus to its new heading", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }), { detail: 0 });
  const details = within(screen.getByRole("dialog")).getByText("Recorded details");
  act(() => details.focus());
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }), { detail: 1 });
  const heading = within(screen.getByRole("dialog")).getByRole("heading", { name: "Baseline details" });
  expect(document.activeElement === heading).toBe(true);
});

test("owned lists keep baseline order, distinct IDs, and empty results", () => {
  const baseline = baselineExample();
  const item = fixtureItem(baseline.interfaces);
  baseline.interfaces = [
    { ...item, id: "second-api" }, { ...item, id: "unowned-api", owner: proposed(null) }, item,
  ];
  fixtureItem(baseline.components, 1).parent = proposed("checkout");
  view(baseline);
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  const list = within(screen.getByRole("dialog")).getByRole("region", { name: "Owned interfaces" });
  expect(within(list).getByRole("heading").textContent).toBe("Owned interfaces (2)");
  expect(within(list).getAllByRole("button").map((row) => row.getAttribute("aria-label"))).toEqual([
    "Invoice API, second-api", "Invoice API, invoice-api",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Checkout, checkout" }));
  const empty = within(screen.getByRole("dialog")).getByRole("region", { name: "Owned interfaces" });
  expect(empty.textContent).toContain("No interfaces recorded.");
  expect(within(empty).queryAllByRole("button")).toHaveLength(0);
});

test("Back returns through a component's resource list to the baseline catalog", () => {
  const baseline = baselineExample();
  fixtureItem(baseline.resources).owner = proposed("billing");
  view(baseline);
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Billing, billing" }));
  const panel = screen.getByRole("dialog");
  const resources = within(panel).getByText("Resources");
  fireEvent.click(resources);
  const list = within(panel).getByRole("region", { name: "Owned resources" });
  fireEvent.click(within(list).getByRole("button", { name: "Invoices, invoice-store" }));
  expect(screen.getByRole("dialog", { name: "Resource details" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Billing, billing" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  const restored = within(screen.getByRole("dialog")).getByRole("button", { name: "Invoices, invoice-store" });
  expect(restored.closest("details")?.open).toBe(true);
  expect(document.activeElement === restored).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  const catalog = screen.getByRole("dialog", { name: "Baseline details" });
  expect(document.activeElement === within(catalog).getByRole("button", { name: "Billing, billing" })).toBe(true);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
});
