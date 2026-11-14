import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { baselineExample, fixtureItem } from "../../support/baseline-fixtures.ts";
import { duplicationUiFixture, duplicationUnknownOwnerFixture } from "../../support/interface-duplication-fixtures.ts";

afterEach(cleanup);

test("a baseline opens an empty Duplicates panel without claiming a completed check", () => {
  const baseline = baselineExample();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 260, y: 0 }, width: 240, height: 88,
  })) };
  render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  expect(screen.getByRole("dialog", { name: "Duplicates" })).toBeTruthy();
  expect(screen.getByText("No duplication report loaded")).toBeTruthy();
  expect(screen.queryByText("No public-interface candidate pairs found in the recorded scope")).toBeNull();
});

test("the empty report panel offers the explicit file action", () => {
  const baseline = baselineExample();
  const onOpenDuplicationReport = mock(() => {});
  const props = { baseline, layout: { nodes: [] }, onOpenDuplicationReport };
  render(<ArchitectureDiagram {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  fireEvent.click(screen.getByRole("button", { name: "Open duplication report" }));
  expect(onOpenDuplicationReport).toHaveBeenCalledTimes(1);
});

test("whole-interface and entry observations count once for their direct owner", () => {
  const { baseline, report, finding } = duplicationUiFixture();
  finding.observations.push({ ...fixtureItem(finding.observations), endpoints: finding.endpoints });
  const props = { baseline, layout: { nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 260, y: 0 }, width: 240, height: 88,
  })) }, duplication: { report, session: 1 } };
  render(<ArchitectureDiagram {...props} />);
  const billing = screen.getByRole("button", { name: "Billing, billing" });
  expect(within(billing).getByText("1 possible duplicate")).toBeTruthy();
  expect(within(billing).getByText("2 interfaces")).toBeTruthy();
  expect(within(screen.getByRole("button", { name: "Checkout, checkout" })).queryByText(/possible duplicate/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  expect(screen.getAllByRole("button", { name: /^Compare / })).toHaveLength(1);
  expect(screen.getByText("Potential redundancy: 1")).toBeTruthy();
});

test("justified distinctions remain available without increasing badges", () => {
  const { baseline, report, finding } = duplicationUiFixture();
  finding.status = "justified-distinction";
  render(<ArchitectureDiagram {...{ baseline, layout: { nodes: [] }, duplication: { report, session: 1 } }} />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  expect(screen.getByText("All recorded pairs have reviewed distinctions")).toBeTruthy();
  expect(screen.queryAllByRole("button", { name: /^Compare / })).toHaveLength(0);
  fireEvent.click(screen.getByRole("checkbox", { name: "Show reviewed distinctions" }));
  expect(screen.getAllByRole("button", { name: /^Compare / })).toHaveLength(1);
});

test.each(["failed", "skipped"] as const)("a %s scan shows its gap rather than a clean zero", (status) => {
  const { baseline, report } = duplicationUiFixture();
  report.findings = [];
  report.scan.status = status;
  report.scan.diagnostics = ["Recorded scan could not complete."];
  render(<ArchitectureDiagram {...{ baseline, layout: { nodes: [] }, duplication: { report, session: 1 } }} />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  expect(screen.getByText("Detection was not completed")).toBeTruthy();
  expect(screen.getByText("Recorded scan could not complete.")).toBeTruthy();
  expect(screen.queryByText("No public-interface candidate pairs found in the recorded scope")).toBeNull();
});

test("large recorded diagnostics remain readable without a DOM node for each value", () => {
  const { baseline, report } = duplicationUiFixture();
  report.scan.diagnostics = Array.from({ length: 20_000 }, (_, index) => `Recorded note ${index}`);
  render(<ArchitectureDiagram {...{ baseline, layout: { nodes: [] }, duplication: { report, session: 1 } }} />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  const coverage = screen.getByRole("region", { name: "Assessment coverage" });
  expect(coverage.querySelectorAll("*").length).toBeLessThan(80);
  expect(coverage.textContent).toContain("Recorded note 19999");
});

test("a finding with an unknown owner remains reachable in the global list", () => {
  const { baseline, report } = duplicationUnknownOwnerFixture();
  render(<ArchitectureDiagram {...{ baseline, layout: { nodes: [] }, duplication: { report, session: 1 } }} />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  expect(screen.getAllByRole("button", { name: /^Compare / })).toHaveLength(1);
  expect(screen.getByText(/B: Owner unknown/)).toBeTruthy();
});

test("completed zero and partial coverage have different conclusions", () => {
  const { baseline, report } = duplicationUiFixture();
  report.findings = [];
  const layout = { nodes: [] };
  const view = render(<ArchitectureDiagram {...{ baseline, layout, duplication: { report, session: 1 } }} />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  expect(screen.getByText("No public-interface candidate pairs found in the recorded scope")).toBeTruthy();
  expect(screen.queryByText("Assessment incomplete")).toBeNull();
  const partial = structuredClone(report);
  partial.scan.status = "partial";
  partial.scan.counts.unmapped = null;
  partial.scan.diagnostics = ["A supported file could not be examined."];
  partial.scan.mappingGaps = ["Owner mapping is unresolved."];
  view.rerender(<ArchitectureDiagram {...{ baseline, layout, duplication: { report: partial, session: 2 } }} />);
  expect(screen.getByText("Scan: partial. Review: completed.")).toBeTruthy();
  expect(screen.getByText("Assessment incomplete")).toBeTruthy();
  expect(screen.queryByText("No public-interface candidate pairs found in the recorded scope")).toBeNull();
  expect(screen.getByText(/Unmapped candidates: Unknown/)).toBeTruthy();
  expect(screen.getByRole("region", { name: "Coverage notes" }).textContent).toContain("Owner mapping is unresolved.");
});

test("the summary displays all four exclusive states and the saved binding", () => {
  const { baseline, report, finding } = duplicationUiFixture();
  report.findings = (["needs-review", "potential-redundancy", "justified-distinction", "insufficient-evidence"] as const)
    .map((status, index) => ({ ...structuredClone(finding), id: `finding-${index}`, status }));
  render(<ArchitectureDiagram {...{ baseline, layout: { nodes: [] }, duplication: { report, session: 1 } }} />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  for (const label of ["Needs review", "Potential redundancy", "Justified distinction", "Insufficient evidence"]) {
    expect(screen.getByText(`${label}: 1`)).toBeTruthy();
  }
  const coverage = screen.getByRole("region", { name: "Assessment coverage" });
  expect(coverage.textContent).toContain(report.createdAt);
  expect(coverage.textContent).toContain(report.baseline.sha256);
  expect(screen.getAllByRole("button", { name: /^Compare / })).toHaveLength(3);
});
