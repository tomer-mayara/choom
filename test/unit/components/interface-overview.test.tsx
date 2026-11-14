import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { baselineDetailsExample } from "../../support/baseline-detail-fixtures.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { interfaceOverviewFixture } from "../../support/interface-overview-fixtures.ts";

afterEach(cleanup);

test("Overview reads legacy promises without audit arrays or invented call details", () => {
  const baseline = baselineDetailsExample();
  const item = fixtureItem(baseline.interfaces);
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  const overview = within(screen.getByRole("tabpanel", { name: "Overview" }));
  expect(overview.getByRole("group", { name: "Behavior" }).textContent).toContain("Submit one approved order.");
  expect(overview.getByRole("group", { name: "Data exchanged" }).textContent).toContain("Return the recorded order ID.");
  expect(overview.getByRole("group", { name: "Failures" }).textContent).toContain("Reject an expired approval.");
  fireEvent.click(overview.getByText("What changes and when it ends", { selector: "summary" }));
  expect(overview.getByText("Keep an order until retention ends.")).toBeTruthy();
  expect(overview.queryByText("Evidence references")).toBeNull();
  expect(overview.queryByRole("group", { name: "Input" })).toBeNull();
  expect(overview.getAllByRole("group", { name: "Recorded entry reference" }).map((row) => row.textContent)).toEqual([
    "Recorded entry referencesubmitOrder", "Recorded entry referencereadOrder",
  ]);
});

function renderDocumented(variant = "complete") {
  const baseline = interfaceOverviewFixture(variant);
  const item = fixtureItem(baseline.interfaces);
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  return { baseline, item, overview: within(screen.getByRole("tabpanel", { name: "Overview" })) };
}

test("saved entry order and selection keep each contract and unmatched reference distinct", () => {
  const { overview } = renderDocumented();
  expect(overview.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
    "Create invoice, create-invoice", "Invoice type, invoice-type", "Invoice data, invoice-data",
  ]);
  expect(overview.getByRole("button", { name: "Create invoice, create-invoice" }).getAttribute("aria-pressed")).toBe("true");
  expect(overview.getByRole("region", { name: "Selected entry" }).textContent).toContain("Create invoice");
  expect(overview.getByRole("group", { name: "Input" }).textContent).toContain("An order with at least one item.");
  expect(overview.getByRole("group", { name: "Recorded entry reference" }).textContent).toContain("unclassified-reference");
  fireEvent.click(overview.getByRole("button", { name: "Invoice type, invoice-type" }));
  const selected = within(overview.getByRole("region", { name: "Selected entry" }));
  expect(selected.getByRole("heading").textContent).toBe("Invoice type");
  expect(selected.getByText("The invoice ID and its line items.")).toBeTruthy();
  for (const name of ["Input", "Success", "Failures", "Effects"]) expect(selected.queryByRole("group", { name })).toBeNull();
  fireEvent.click(overview.getByRole("button", { name: "Invoice data, invoice-data" }));
  expect(within(overview.getByRole("region", { name: "Selected entry" })).getByText("Saved invoice records.")).toBeTruthy();
});

test("partly unknown interaction facts are not guessed", () => {
  const { overview } = renderDocumented("partial");
  const interaction = within(overview.getByRole("group", { name: "Interaction" }));
  for (const name of ["Input", "Failures"]) expect(interaction.getByRole("group", { name }).textContent).toContain("Unknown");
  expect(interaction.getByRole("group", { name: "Success" }).textContent).toContain("An invoice with a stable ID.");
  expect(interaction.getByRole("group", { name: "Effects" }).textContent).toContain("Save the invoice once validation succeeds.");
});

test("a wholly unknown interaction has one summary and retains its statement status", () => {
  const { overview } = renderDocumented("unknown interaction");
  const interaction = within(overview.getByRole("group", { name: "Interaction" }));
  expect(interaction.getByText("Interaction facts are unknown.")).toBeTruthy();
  expect(interaction.getByText("Proposed")).toBeTruthy();
  for (const name of ["Input", "Success", "Failures", "Effects"]) expect(interaction.queryByRole("group", { name })).toBeNull();
});

test("missing call details and description keep the general contract prominent", () => {
  const { overview } = renderDocumented("missing interaction");
  expect(overview.getByText("Interaction details not recorded.")).toBeTruthy();
  expect(overview.getByText("Description is unknown.")).toBeTruthy();
  expect(overview.queryByText("Interface-wide contract", { selector: "summary" })).toBeNull();
  expect(overview.getByRole("group", { name: "Behavior" }).textContent).toContain("Create an invoice");
});

test("rich details lead and the unchanged general contract is secondary", () => {
  const { overview } = renderDocumented();
  const summary = overview.getByText("Interface-wide contract", { selector: "summary" });
  expect(summary.closest("details")?.open).toBe(false);
  fireEvent.click(summary);
  expect(within(summary.closest("details") as HTMLDetailsElement).getByRole("group", { name: "Behavior" }).textContent).toContain("Create an invoice");
});

test("mixed statuses do not turn proposed interaction into verified ownership", () => {
  const { overview } = renderDocumented("mixed status");
  expect(screen.getByText("Mixed recorded statuses")).toBeTruthy();
  expect(screen.getByRole("group", { name: "Provider" }).textContent).toContain("Accepted (recorded)");
  expect(overview.getByRole("group", { name: "Interaction" }).textContent).toContain("Proposed");
  expect(screen.queryByText(/verified/i)).toBeNull();
});

test("duplicate provider and entry names retain IDs and access includes self-use", () => {
  const { overview } = renderDocumented("duplicate names");
  expect(screen.getByRole("group", { name: "Provider" }).textContent).toContain("Billing (billing)");
  fireEvent.click(overview.getByRole("button", { name: "Create invoice, invoice-type" }));
  expect(overview.getByRole("region", { name: "Selected entry" }).textContent).toContain("invoice-type");
  fireEvent.click(overview.getByText("Access rule", { selector: "summary" }));
  const rule = overview.getByText("Access rule", { selector: "summary" }).closest("details");
  expect(rule?.textContent).toContain("Billing (checkout)");
  expect(rule?.textContent).toContain("Billing (billing)");
  expect(rule?.textContent).toContain("Call activity is not recorded.");
});
