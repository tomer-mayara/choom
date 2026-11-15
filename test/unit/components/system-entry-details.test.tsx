import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Baseline } from "@choom/baseline-model/contracts";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { SystemEntryDetails } from "../../../src/components/system-entry-details.tsx";
import { componentControlHeight } from "../../../src/lib/component-geometry.ts";
import { systemEntryDetailsBaseline } from "../../support/system-entry-details-fixtures.ts";

afterEach(cleanup);

function openCheckout(baseline: Baseline = systemEntryDetailsBaseline()) {
  render(<ArchitectureDiagram baseline={baseline} layout={{ nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 260, y: 0 }, width: 240, height: componentControlHeight,
  })) }} />);
  fireEvent.click(screen.getByRole("button", { name: "Checkout, checkout" }));
  return screen.getByRole("dialog", { name: "Component details" });
}

test("component details keep every saved entry, group order, paths, evidence, and optional range", () => {
  const panel = openCheckout();
  const list = within(panel).getByRole("region", { name: "System entry points" });
  expect(within(list).getByRole("heading", { name: "Startup (1)" })).toBeTruthy();
  expect(within(list).getByRole("heading", { name: "External (20)" })).toBeTruthy();
  const rows = list.querySelectorAll("li[data-system-entry-id]");
  expect(rows).toHaveLength(21);
  expect(Array.from(rows, (row) => row.getAttribute("data-system-entry-id"))).toEqual([
    "checkout-cli", ...Array.from({ length: 20 }, (_, index) => `checkout-route-${String(index + 1).padStart(2, "0")}`),
  ]);
  expect(rows[0]?.textContent).toContain("Checkout CLI");
  expect(rows[0]?.textContent).toContain("checkout/main.ts");
  expect(rows[0]?.textContent).toContain("reviewed-cli-start");
  expect(rows[1]?.textContent).toContain("HTTP POST /orders/01");
  expect(rows[1]?.textContent).toContain("checkout/routes/route-01.ts");
  expect(rows[1]?.textContent).toContain("reviewed-route-01");
  expect(rows[1]?.textContent).toContain("Lines 3–14");
  expect(rows[20]?.textContent).toContain("checkout/routes/route-20.ts");
  expect(rows[20]?.textContent).not.toContain("Lines");
});

test("version 5 component details keep the saved entries", () => {
  const panel = openCheckout({ ...systemEntryDetailsBaseline(), formatVersion: 5 as const });
  const list = within(panel).getByRole("region", { name: "System entry points" });
  expect(list.querySelectorAll("li[data-system-entry-id]")).toHaveLength(21);
});

test("an operation link opens the exact second entry across owners and Back restores focus and scroll", () => {
  const panel = openCheckout();
  const content = within(panel).getByLabelText("Record content");
  content.scrollTop = 144;
  const link = within(panel).getByRole("button", { name: "Open Refund invoice in Invoice API" });
  fireEvent.click(link);
  const interfacePanel = screen.getByRole("dialog", { name: "Interface details" });
  expect(within(interfacePanel).getByRole("group", { name: "Provider" }).textContent).toContain("Billing");
  const entries = within(interfacePanel).getByRole("region", { name: "Interface entries" });
  expect(within(entries).getByRole("button", { name: "Refund invoice, refund-invoice" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(within(interfacePanel).getByRole("button", { name: "Back" }));
  const restored = screen.getByRole("dialog", { name: "Component details" });
  expect(within(restored).getByRole("heading", { name: "Checkout" })).toBeTruthy();
  expect(document.activeElement).toBe(within(restored).getByRole("button", { name: "Open Refund invoice in Invoice API" }));
  expect(within(restored).getByLabelText("Record content").scrollTop).toBe(144);
});

test("entry return focus cannot collide with an owned interface record ID", () => {
  const baseline = systemEntryDetailsBaseline();
  const template = baseline.interfaces[0];
  if (!template) throw new Error("The fixture needs its invoice interface.");
  baseline.interfaces.push({ ...structuredClone(template), id: "system-entry-checkout-route-01",
    owner: { ...template.owner, value: "checkout" } });
  const panel = openCheckout(baseline);
  const link = within(panel).getByRole("button", { name: "Open Refund invoice in Invoice API" });
  const owned = within(within(panel).getByRole("region", { name: "Owned interfaces" }))
    .getByRole("button", { name: "Invoice API, system-entry-checkout-route-01" });
  expect(link.getAttribute("data-record-id")).not.toBe(owned.getAttribute("data-record-id"));
  fireEvent.click(link);
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(document.activeElement).toBe(within(screen.getByRole("dialog", { name: "Component details" }))
    .getByRole("button", { name: "Open Refund invoice in Invoice API" }));
});

test("whole-interface links open Overview and unlinked entries have no dead control", () => {
  const panel = openCheckout();
  const unlinked = panel.querySelector('[data-system-entry-id="checkout-route-03"]');
  expect(unlinked).toBeTruthy();
  expect(within(unlinked as HTMLElement).queryAllByRole("button")).toHaveLength(0);
  expect(within(unlinked as HTMLElement).queryAllByRole("link")).toHaveLength(0);
  fireEvent.click(within(panel).getByRole("button", { name: "Open Invoice API overview" }));
  const interfacePanel = screen.getByRole("dialog", { name: "Interface details" });
  expect(within(interfacePanel).getByRole("heading", { name: "Invoice API" })).toBeTruthy();
  expect(within(interfacePanel).getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
});

test("the saved limit remains available without truncating the entry list", () => {
  const first = systemEntryDetailsBaseline().systemEntryPoints.entries[0];
  if (!first) throw new Error("The fixture needs its startup entry.");
  const entries = Array.from({ length: 2000 }, (_, index) => ({
    ...first, id: `startup-${index}`, label: `Start ${index}`,
  }));
  render(<SystemEntryDetails entries={entries} interfaces={[]} navigate={() => {}} />);
  const rows = screen.getByRole("region", { name: "System entry points" }).querySelectorAll("li[data-system-entry-id]");
  expect(rows).toHaveLength(2000);
  expect(rows[1999]?.textContent).toContain("Start 1999");
});
