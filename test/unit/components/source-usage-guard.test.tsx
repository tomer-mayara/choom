import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { sourceUsageBaseline } from "../../support/source-usage-fixtures.ts";

afterEach(cleanup);

test.each([3, 4, 5] as const)("version %i Baseline details preserves every saved source-use field", (formatVersion) => {
  const baseline = { ...sourceUsageBaseline(), formatVersion };
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "baseline" }} />);
  expect(screen.getByText("Original source-use data")).toBeTruthy();
  const record = document.querySelector("details[data-section='original-source-usage'] pre");
  expect(JSON.parse(record?.textContent ?? "null")).toEqual(baseline.sourceUsage);
});

test.each([3, 4, 5] as const)("version %i shows the source legend and review notice", async (formatVersion) => {
  const baseline = { ...sourceUsageBaseline(), formatVersion };
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 }, width: 240, height: 88 })) };
  await renderDiagramWithViewport(baseline, layout);
  expect(screen.getByText("Arrow: component uses the interface in saved source.")).toBeTruthy();
  expect(screen.getByText("Source review is partial. See interface details for scope and gaps.")).toBeTruthy();
  expect(screen.queryByText("Arrow: consumer may use the owner's interface.") === null).toBe(true);
  expect(screen.queryByText(/unknown owners or allowed consumers/) === null).toBe(true);
});
