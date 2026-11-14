import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { duplicationUiFixture } from "../../support/interface-duplication-fixtures.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";

afterEach(cleanup);

function openComparison(fixture = duplicationUiFixture()) {
  render(<ArchitectureDiagram baseline={fixture.baseline} layout={{ nodes: [] }} duplication={{ report: fixture.report, session: 1 }} />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  fireEvent.click(screen.getByRole("button", { name: /^Compare / }));
  return fixture;
}

test("a comparison keeps the scoped judgment, differences and source facts separate from score", () => {
  const fixture = duplicationUiFixture();
  fixture.finding.facts = [
    { endpoint: { interfaceId: "invoice-api" }, topic: "success", basis: "recorded-contract", field: "summary" },
    { endpoint: { interfaceId: "invoice-api" }, topic: "effects", basis: "source-review", state: "unknown", value: null,
      reason: "Resource lifetime was not established.", evidenceRefs: [] },
    { endpoint: { interfaceId: "invoice-api", entryId: "invoice-type" }, topic: "input", basis: "source-review", state: "not-applicable", value: null,
      reason: "This entry is a type declaration.", evidenceRefs: ["type-declaration"] },
  ];
  openComparison(fixture);
  const panel = within(screen.getByRole("dialog", { name: "Duplicate comparison" }));
  expect(panel.getByText(fixture.finding.overlap ?? "Missing overlap")).toBeTruthy();
  expect(panel.getByText(fixtureItem(fixture.finding.differences))).toBeTruthy();
  expect(panel.getByText("Create an invoice from a supported order.")).toBeTruthy();
  expect(panel.getByText("Accepted (recorded)")).toBeTruthy();
  expect(panel.getByText("Unknown: Resource lifetime was not established.")).toBeTruthy();
  expect(panel.getByText("Not applicable: This entry is a type declaration.")).toBeTruthy();
  fireEvent.click(panel.getByText("Evidence", { selector: "summary" }));
  expect(panel.getByText("No structural score")).toBeTruthy();
  expect(panel.getByText("Structural similarity does not measure behavioral equivalence.")).toBeTruthy();
  expect(panel.getByText("Evidence not loaded")).toBeTruthy();
});

test("an entry observation opens its exact entry while a whole-interface action uses the normal initial entry", () => {
  openComparison();
  fireEvent.click(screen.getByRole("button", { name: "Inspect A observation 1" }));
  expect(screen.getByRole("dialog", { name: "Interface details" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Invoice type, invoice-type" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect A" }));
  expect(screen.getByRole("button", { name: "Create invoice, create-invoice" }).getAttribute("aria-pressed")).toBe("true");
});
