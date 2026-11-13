import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { interfaceEndpointBaseline } from "../../support/interface-endpoint-fixtures.ts";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { showAllConnections } from "../../support/connection-controls.tsx";
import { selectInterfaceTab } from "../../support/interface-details-dom.ts";

afterEach(cleanup);

test("unknown consumers have a clear explanation without losing the owner or statement metadata", () => {
  const baseline = interfaceEndpointBaseline("unknown consumers");
  const item = fixtureItem(baseline.interfaces);
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  selectInterfaceTab("Sources");
  expect(screen.getByText("Allowed consumers are unknown.")).toBeTruthy();
  expect(within(screen.getByRole("group", { name: "Owner" })).getByText("billing")).toBeTruthy();
  const consumers = within(screen.getByRole("group", { name: "Allowed consumers" }));
  expect(consumers.getByText("Unknown (null)")).toBeTruthy();
  expect(consumers.getByText("Accepted (recorded)")).toBeTruthy();
  expect(consumers.getByRole("group", { name: "Evidence references" }).textContent).toContain("missing-evidence#/items/1");
  expect(consumers.getByRole("group", { name: "Acceptance reference" }).textContent).toContain("missing-review#/decisions/4");
});

test.each([
  ["unknown owner", "Owner is unknown."],
  ["both unknown", "Owner and allowed consumers are unknown."],
])("%s explains missing facts while preserving known consumer values", (facts, message) => {
  const baseline = interfaceEndpointBaseline(facts);
  const item = fixtureItem(baseline.interfaces);
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  selectInterfaceTab("Sources");
  expect(screen.getByText(message)).toBeTruthy();
  const owner = within(screen.getByRole("group", { name: "Owner" }));
  expect(owner.getByText("Unknown (null)")).toBeTruthy();
  expect(owner.getByText("Proposed")).toBeTruthy();
  const consumers = within(screen.getByRole("group", { name: "Allowed consumers" }));
  expect(consumers.getByText("Accepted (recorded)")).toBeTruthy();
  if (item.allowedConsumers.value === null) expect(consumers.getByText("Unknown (null)")).toBeTruthy();
  else expect(JSON.parse(consumers.getByText(/checkout/).textContent ?? "null")).toEqual(["checkout"]);
});

test("complete endpoints need no missing-facts explanation", () => {
  const baseline = interfaceEndpointBaseline("complete");
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: "invoice-api" }} />);
  selectInterfaceTab("Sources");
  expect(screen.queryByText(/^(Owner|Allowed consumers|Owner and allowed consumers) (is|are) unknown\.$/)).toBeNull();
});

test.each([1, 2])("the overview explains %s incomplete interfaces and keeps Baseline details available", async (count) => {
  const baseline = interfaceEndpointBaseline("unknown consumers");
  if (count === 2) baseline.interfaces.push({ ...fixtureItem(baseline.interfaces), id: "invoice-events" });
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 }, width: 240, height: 88 })) };
  await renderDiagramWithViewport(baseline, layout);
  showAllConnections();
  expect(screen.getByText(`${count} ${count === 1 ? "interface has" : "interfaces have"} unknown owners or allowed consumers. Open Baseline details to inspect them.`)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Baseline details" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Billing, billing" }).textContent).toBe(`Billing${count} ${count === 1 ? "interface" : "interfaces"}`);
  expect(document.querySelectorAll("path[data-interface-arc]")).toHaveLength(0);
});

test.each(["complete", "no interfaces"])("%s does not show an unknown-endpoint note", async (facts) => {
  const baseline = interfaceEndpointBaseline(facts);
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 }, width: 240, height: 88 })) };
  await renderDiagramWithViewport(baseline, layout);
  expect(screen.queryByText(/unknown owners or allowed consumers/)).toBeNull();
});

test("a baseline without components keeps the summary, empty message, and interface inspection", () => {
  const baseline = interfaceEndpointBaseline("no components");
  render(<ArchitectureDiagram baseline={baseline} layout={{ nodes: [] }} />);
  expect(screen.getByText("No components modeled")).toBeTruthy();
  expect(screen.getByText("1 interface has unknown owners or allowed consumers. Open Baseline details to inspect them.")).toBeTruthy();
  expect(document.querySelector(".react-flow")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Interfaces" }))
    .getByRole("button", { name: "Invoice API, invoice-api" }));
  selectInterfaceTab("Sources");
  expect(screen.getByText("Owner and allowed consumers are unknown.")).toBeTruthy();
});
