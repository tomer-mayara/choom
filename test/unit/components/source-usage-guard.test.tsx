import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { sourceUsageBaseline } from "../../support/source-usage-fixtures.ts";

afterEach(cleanup);

test("Baseline details preserves every saved source-use field", () => {
  const baseline = sourceUsageBaseline();
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "baseline" }} />);
  expect(screen.getByText("Original source-use data")).toBeTruthy();
  const record = document.querySelector("details[data-section='original-source-usage'] pre");
  expect(JSON.parse(record?.textContent ?? "null")).toEqual(baseline.sourceUsage);
});

test("v3 does not display the legacy permission legend or missing-policy banner", async () => {
  const baseline = sourceUsageBaseline();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 }, width: 240, height: 88 })) };
  await renderDiagramWithViewport(baseline, layout);
  expect(screen.queryByText("Arrow: consumer may use the owner's interface.") === null).toBe(true);
  expect(screen.queryByText(/unknown owners or allowed consumers/) === null).toBe(true);
});
