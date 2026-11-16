import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Baseline } from "@choom/baseline-model/contracts";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { baselineExample } from "../../support/baseline-fixtures.ts";
import { enrichedBaseline } from "../../support/interface-documentation-fixtures.ts";
import { selectInterfaceTab } from "../../support/interface-details-dom.ts";

const sha256 = "0123456789abcdef".repeat(4);
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
let writes: string[];

beforeEach(() => {
  writes = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { writes.push(text); } } });
});

afterEach(() => {
  cleanup();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});

function show(baseline: Baseline) {
  render(<ArchitectureDiagram baseline={baseline} layout={{ nodes: [] }} baselineSha256={sha256} />);
}

// The baseline example names a parent, as a next version does. The producer records
// decisions only about a first version, which a run publishes with no parent.
const firstVersion = (baseline: Baseline = baselineExample()): Baseline => ({ ...baseline, parentId: null });

function openRecordedDetails(component: string) {
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Components" })).getByRole("button", { name: component }));
  fireEvent.click(screen.getByText("Recorded details", { selector: "summary" }));
}

const entry = (itemId: string, field: string) =>
  `# Baseline baseline-example, SHA-256 ${sha256}\n- action: accept\n  itemId: ${itemId}\n  field: ${field}\n`;

test("Copy decision copies an accept entry for the Billing purpose and changes no baseline value", async () => {
  const baseline = firstVersion();
  const original = structuredClone(baseline);
  show(baseline);
  openRecordedDetails("Billing, billing");
  const purpose = within(screen.getByRole("group", { name: "Purpose" }));
  fireEvent.click(purpose.getByRole("button", { name: "Copy decision for billing.purpose" }));
  await waitFor(() => expect(purpose.getByRole("status").textContent).toBe("Decision copied."));
  expect(writes).toEqual([entry("billing", "purpose")]);
  expect(purpose.getByText("Proposed")).toBeTruthy();
  expect(baseline).toEqual(original);
});

test("each proposed statement has the action, and an accepted statement has none", () => {
  show(firstVersion());
  openRecordedDetails("Checkout, checkout");
  for (const field of ["purpose", "membership"]) expect(screen.getByRole("button", { name: `Copy decision for checkout.${field}` })).toBeTruthy();
  expect(within(screen.getByRole("group", { name: "Grouping reason" })).getByText("Accepted (recorded)")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Copy decision for checkout.groupingReason" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Copy decision for checkout.parent/ })).toBeNull();
});

test("the built-in example has no file digest, so it offers no decision", () => {
  render(<ArchitectureDiagram baseline={firstVersion()} layout={{ nodes: [] }} />);
  openRecordedDetails("Billing, billing");
  expect(screen.queryByRole("button", { name: /^Copy decision/ })).toBeNull();
});

test("a next version, which names its parent, offers no decision for its proposed statements", () => {
  const nextVersion = { ...baselineExample(), id: "baseline-example-decisions-001", parentId: "baseline-example" };
  show(nextVersion);
  openRecordedDetails("Billing, billing");
  expect(within(screen.getByRole("group", { name: "Purpose" })).getByText("Proposed")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Copy decision/ })).toBeNull();
});

test("a failed copy keeps the entry readable for a manual copy", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } });
  show(firstVersion());
  openRecordedDetails("Billing, billing");
  const purpose = within(screen.getByRole("group", { name: "Purpose" }));
  fireEvent.click(purpose.getByRole("button", { name: "Copy decision for billing.purpose" }));
  await waitFor(() => expect(purpose.getByRole("status").textContent).toBe("Could not copy. Select the decision text and copy it manually."));
  expect(purpose.getByText((_content, element) => element?.tagName === "PRE" && element.textContent === entry("billing", "purpose"))).toBeTruthy();
});

test("resource, rule and interface statements use the field paths of the shared statement list", async () => {
  show(firstVersion(enrichedBaseline()));
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Resources" })).getByRole("button", { name: "Invoices, invoice-store" }));
  for (const field of ["identity", "owner", "accessRules"]) expect(screen.getByRole("button", { name: `Copy decision for invoice-store.${field}` })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Rules" }));
  fireEvent.click(screen.getByText("Invoice access"));
  for (const field of ["subject", "expected", "check"]) expect(screen.getByRole("button", { name: `Copy decision for invoice-access.${field}` })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  selectInterfaceTab("Sources");
  fireEvent.click(screen.getByText("Recorded statements", { selector: "summary" }));
  expect(screen.getByRole("button", { name: "Copy decision for invoice-api.owner" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Copy decision for invoice-api.allowedConsumers" })).toBeNull();
  const summary = screen.getByRole("button", { name: "Copy decision for invoice-api.documentation.summary" });
  fireEvent.click(summary);
  await waitFor(() => expect(writes).toEqual([entry("invoice-api", "documentation.summary")]));
  expect(screen.getByRole("button", { name: "Copy decision for invoice-api.documentation.entries.create-invoice.description" })).toBeTruthy();
});
