import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { componentControlHeight, componentControlWidth } from "../../../src/lib/component-geometry.ts";
import { baselineExample, fixtureItem } from "../../support/baseline-fixtures.ts";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { markedSystemEntryPointsBaseline, systemEntryReviewLimit } from "../../support/system-entry-points-fixtures.ts";

afterEach(cleanup);

test("a component header shows both counts in one button with its full name", async () => {
  const baseline = markedSystemEntryPointsBaseline(20);
  fixtureItem(baseline.systemEntryPoints.entries).componentId = "billing";
  const billing = fixtureItem(baseline.components, 2);
  billing.name = "Customer Billing ".repeat(16).trim();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 300, y: 24 }, width: componentControlWidth, height: componentControlHeight,
  })) };
  await renderDiagramWithViewport(baseline, layout);
  const header = screen.getByRole("button", {
    name: `${billing.name}, billing`, description: /Startup 1.*External 20/,
  });
  expect(within(header).getByText("Startup 1")).toBeTruthy();
  expect(within(header).getByText("External 20")).toBeTruthy();
  expect(header.tabIndex).toBe(0);
  expect(within(header).queryByRole("button")).toBeNull();
  const visibleName = within(header).getByTitle(billing.name);
  expect(visibleName.classList.contains("line-clamp-2")).toBe(true);
  fireEvent.click(header);
  expect(within(screen.getByRole("dialog", { name: "Component details" })).getByRole("heading", { name: billing.name })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Commerce, commerce" }).textContent).not.toMatch(/Startup|External/);
});

test("the plot reports when older baselines have no saved assessment", () => {
  const baseline = baselineExample();
  render(<ArchitectureDiagram baseline={baseline} layout={{ nodes: [] }} />);
  expect(screen.getByText("Entry points not recorded")).toBeTruthy();
});

test("an empty limited assessment shows both coverage facts", () => {
  const baseline = markedSystemEntryPointsBaseline(0);
  baseline.systemEntryPoints.entries = [];
  baseline.systemEntryPoints.limitations = [systemEntryReviewLimit];
  render(<ArchitectureDiagram baseline={baseline} layout={{ nodes: [] }} />);
  expect(screen.getByText("No entry points found in this scope")).toBeTruthy();
  expect(screen.getByText("Review has limits")).toBeTruthy();
});

test("Baseline details shows saved review scope, evidence, and limits", () => {
  const baseline = markedSystemEntryPointsBaseline();
  baseline.systemEntryPoints.limitations = [systemEntryReviewLimit];
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "baseline" }} />);
  expect(screen.getByText(baseline.systemEntryPoints.scope)).toBeTruthy();
  expect(screen.getByText(fixtureItem(baseline.systemEntryPoints.evidenceRefs))).toBeTruthy();
  expect(screen.getByText(systemEntryReviewLimit)).toBeTruthy();
});
