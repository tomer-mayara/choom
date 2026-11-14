import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { duplicationUiFixture } from "../../support/interface-duplication-fixtures.ts";
import { selectInterfaceTab } from "../../support/interface-details-dom.ts";

afterEach(cleanup);

function reportView() {
  const fixture = duplicationUiFixture();
  const layout = { nodes: fixture.baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 260, y: 0 }, width: 240, height: 88,
  })) };
  const rendered = render(<ArchitectureDiagram baseline={fixture.baseline} layout={layout} duplication={{ report: fixture.report, session: 1 }} />);
  return { ...fixture, layout, ...rendered };
}

test("Back restores the reviewed-distinction filter, row focus and comparison disclosure", () => {
  const { finding } = reportView();
  finding.status = "justified-distinction";
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Show reviewed distinctions" }));
  fireEvent.click(screen.getByRole("button", { name: /^Compare / }));
  fireEvent.click(screen.getByText("Evidence", { selector: "summary" }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect A observation 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("Evidence", { selector: "summary" }).closest("details")?.open).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect((screen.getByRole("checkbox", { name: "Show reviewed distinctions" }) as HTMLInputElement).checked).toBe(true);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Compare / }));
});

test("an interface keeps its reading state through a report comparison", async () => {
  reportView();
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Owned interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  fireEvent.click(screen.getByRole("button", { name: "Invoice type, invoice-type" }));
  selectInterfaceTab("Sources");
  fireEvent.click(screen.getByText("Original record", { selector: "summary" }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  screen.getByLabelText("Record content").scrollTop = 94;
  fireEvent.click(screen.getByRole("button", { name: "Possible duplicates (1)" }));
  fireEvent.click(screen.getByRole("button", { name: /^Compare / }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect B observation 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("tab", { name: "Sources" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText("Original record", { selector: "summary" }).closest("details")?.open).toBe(true);
  expect(screen.getByLabelText("Record content").scrollTop).toBe(94);
  selectInterfaceTab("Overview");
  expect(screen.getByRole("button", { name: "Invoice type, invoice-type" }).getAttribute("aria-pressed")).toBe("true");
});

test("report frames keep their origin scope and endpoint inspection uses its own interface", () => {
  reportView();
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  expect(document.querySelectorAll("[data-interface-label]")).toHaveLength(2);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Duplicates for Invoice API, invoice-api" }));
  fireEvent.click(screen.getByRole("button", { name: /^Compare / }));
  expect(document.querySelectorAll("[data-interface-label]")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Inspect B" }));
  expect(document.querySelectorAll("[data-interface-label]")).toHaveLength(1);
  expect(document.querySelector("[data-interface-label]")?.getAttribute("data-interface-id")).toBe("invoice-lookup");
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(document.querySelectorAll("[data-interface-label]")).toHaveLength(2);
});

function RemovableReport() {
  const [fixture] = useState(duplicationUiFixture);
  const [attached, setAttached] = useState(true);
  const [layout] = useState({ nodes: [] });
  return <ArchitectureDiagram baseline={fixture.baseline} layout={layout} duplication={attached ? { report: fixture.report, session: 1 } : null}
    onOpenDuplicationReport={() => {}} onRemoveDuplicationReport={() => setAttached(false)} />;
}

test("removal from a report endpoint clears its return frames and focuses the file action", () => {
  render(<RemovableReport />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  fireEvent.click(screen.getByRole("button", { name: /^Compare / }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect A" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove report" }));
  expect(screen.getByRole("dialog", { name: "Duplicates" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(screen.getByText("No duplication report loaded")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open duplication report" }));
});

test("replacement clears report paths even when IDs repeat, while removal preserves a fresh canvas selection", () => {
  const view = reportView();
  fireEvent.click(screen.getByRole("button", { name: "Duplicates" }));
  fireEvent.click(screen.getByRole("button", { name: /^Compare / }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect A" }));
  view.rerender(<ArchitectureDiagram baseline={view.baseline} layout={view.layout} duplication={{ report: structuredClone(view.report), session: 2 }} />);
  expect(screen.getByRole("dialog", { name: "Duplicates" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  view.rerender(<ArchitectureDiagram baseline={view.baseline} layout={view.layout} duplication={null} />);
  expect(screen.getByRole("dialog", { name: "Component details" })).toBeTruthy();
  expect(screen.queryByText(/possible duplicate/)).toBeNull();
});

test.each(["removal", "replacement"] as const)("report %s preserves ordinary interface reading and focus", async (change) => {
  const view = reportView();
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Owned interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  selectInterfaceTab("Sources");
  const summary = screen.getByText("Original record", { selector: "summary" });
  fireEvent.click(summary);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  screen.getByLabelText("Record content").scrollTop = 94;
  summary.focus();
  view.rerender(<ArchitectureDiagram baseline={view.baseline} layout={view.layout}
    duplication={change === "removal" ? null : { report: structuredClone(view.report), session: 2 }} />);
  expect(screen.getByRole("tab", { name: "Sources" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByLabelText("Record content").scrollTop).toBe(94);
  expect(document.activeElement).toBe(summary);
  expect(summary.closest("details")?.open).toBe(true);
});

test("removing a report from its focused action keeps ordinary reading and focuses the surviving heading", async () => {
  render(<RemovableReport />);
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  selectInterfaceTab("Sources");
  fireEvent.click(screen.getByText("Original record", { selector: "summary" }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  screen.getByLabelText("Record content").scrollTop = 94;
  const remove = screen.getByRole("button", { name: "Remove report" });
  remove.focus();
  fireEvent.click(remove);
  expect(document.activeElement?.id).toBe(screen.getByRole("heading", { name: "Interface details" }).id);
  expect(screen.getByLabelText("Record content").scrollTop).toBe(94);
  expect(screen.getByRole("tab", { name: "Sources" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText("Original record", { selector: "summary" }).closest("details")?.open).toBe(true);
});
