import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { fixtureItem, baselineExample } from "../../support/baseline-fixtures.ts";
import { selectInterfaceTab } from "../../support/interface-details-dom.ts";
import { interfaceSourceFixture } from "../../support/interface-source-fixtures.ts";

afterEach(cleanup);
const sources = () => within(screen.getByRole("tabpanel", { name: "Sources" }));
function view() {
  const baseline = interfaceSourceFixture();
  const mounted = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: "invoice-api" }} />);
  selectInterfaceTab("Sources");
  return { ...mounted, baseline };
}
function expand(name: string) { fireEvent.click(sources().getByText(name, { selector: "summary" })); }

test("Sources starts with useful saved notes, exact locations, and what each note supports", () => {
  const { container } = view();
  expect(sources().getByText("Invoice validation and result construction.")).toBeTruthy();
  expect(sources().getByText("billing/invoice.ts")).toBeTruthy();
  expect(sources().getByText("Lines 1–12")).toBeTruthy();
  expect(sources().getAllByText("snapshot-invoice")).toHaveLength(2);
  expect(sources().getByText("a".repeat(64))).toBeTruthy();
  const missing = sources().getByText("Approved public contract and permitted callers.").closest("li");
  expect(missing?.textContent).toContain("Location not recorded.");
  expect(missing?.textContent).toContain("Provider");
  expect(missing?.textContent).not.toContain("billing/invoice.ts");
  expect(container.querySelector("a[href], img, script, iframe")).toBeNull();
  expect(sources().queryByText("Evidence not loaded")).toBeNull();
  expect(sources().queryByRole("group", { name: "Owner" })).toBeNull();
});

test("Evidence references deduplicate IDs and retain all citing paths as plain text", () => {
  view();
  expect(sources().queryByText("contract-notes")).toBeNull();
  expand("Evidence references");
  const evidence = sources().getByText("contract-notes", { exact: true });
  expect(sources().getAllByText("contract-notes", { exact: true })).toHaveLength(1);
  const reference = evidence.closest("li");
  if (!reference) throw new Error("An evidence ID must have a containing list entry.");
  const paths = within(reference);
  for (const path of ["owner", "publicAccess", "allowedConsumers", "documentation.summary", "documentation.entries.create-invoice.examples.empty-order.content"]) {
    expect(paths.getByText(`invoice-api.${path}`)).toBeTruthy();
  }
  const unresolved = sources().getByText("unresolved-contract#/claims/7", { exact: true }).closest("li");
  expect(sources().getAllByText("Evidence content is not included.")).toHaveLength(1);
  expect(unresolved?.querySelector("a")).toBeNull();
});

test("Recorded statements retain every status, grouped interaction, and acceptance reference", () => {
  view(); expand("Recorded statements");
  const purpose = sources().getByText("invoice-api.documentation.summary").closest("li");
  expect(purpose?.textContent).toContain("Accepted (recorded)");
  expect(purpose?.textContent).toContain("review-42#decision-1");
  const interaction = sources().getByText("invoice-api.documentation.entries.create-invoice.interaction").closest("li");
  expect(interaction?.textContent).toContain("Proposed");
  expect(interaction?.textContent).not.toContain("Acceptance reference");
  expect(sources().getByText("invoice-api.documentation.entries.invoice-data.examples.valid-order.content")).toBeTruthy();
  expect(sources().queryByText(/Verified|Executed/)).toBeNull();
});

test("Original record stays lazy and preserves every saved field including duplicate references", () => {
  const { baseline } = view();
  const item = fixtureItem(baseline.interfaces); const original = structuredClone(item);
  const disclosure = sources().getByText("Original record", { selector: "summary" }).closest("details");
  expect(disclosure?.querySelector("pre")).toBeNull();
  expand("Original record");
  expect(JSON.parse(disclosure?.querySelector("pre")?.textContent ?? "null")).toEqual(original);
  expect(item).toEqual(original);
});

test("legacy Sources states that no saved source notes were supplied", () => {
  const baseline = baselineExample();
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: "invoice-api" }} />);
  selectInterfaceTab("Sources");
  expect(sources().getByText("No source notes recorded.")).toBeTruthy();
  expand("Evidence references");
  expect(sources().getAllByText("Evidence content is not included.")).toHaveLength(1);
});

test("Overview disclosure choices survive entry and tab changes in the same frame", () => {
  view(); selectInterfaceTab("Overview");
  for (const name of ["Interface-wide contract", "What changes and when it ends", "Access rule"]) {
    fireEvent.click(screen.getByText(name, { selector: "summary" }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Invoice data, invoice-data" }));
  selectInterfaceTab("Example"); selectInterfaceTab("Sources"); selectInterfaceTab("Overview");
  for (const name of ["Interface-wide contract", "What changes and when it ends", "Access rule"]) {
    expect(screen.getByText(name, { selector: "summary" }).closest("details")?.open).toBe(true);
  }
});

test("Original record remains expanded after leaving and returning to Sources", () => {
  const { baseline } = view(); expand("Original record");
  selectInterfaceTab("Overview"); selectInterfaceTab("Sources");
  const original = sources().getByText("Original record", { selector: "summary" }).closest("details");
  expect(original?.open).toBe(true);
  expect(JSON.parse(original?.querySelector("pre")?.textContent ?? "null")).toEqual(fixtureItem(baseline.interfaces));
});


test("a late disclosure body keeps the next focused summary visible", () => {
  const content = createRef<HTMLDivElement>(); const baseline = interfaceSourceFixture();
  render(<div ref={content}><ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: "invoice-api" }} contentRef={content} /></div>);
  selectInterfaceTab("Sources");
  const area = content.current;
  if (!area) throw new Error("The record area must be mounted.");
  const recorded = sources().getByText("Recorded statements", { selector: "summary" }).closest("details");
  if (!recorded) throw new Error("Recorded statements must be a disclosure.");
  const next = sources().getByText("Evidence references", { selector: "summary" });
  area.getBoundingClientRect = () => new DOMRect(0, 0, 400, 180);
  screen.getByRole("tablist").getBoundingClientRect = () => new DOMRect(0, 0, 400, 40);
  next.getBoundingClientRect = () => new DOMRect(0, (recorded.querySelector("ul") ? 900 : 80) - area.scrollTop, 200, 20);
  // Native open can change before its toggle event renders the lazy body.
  act(() => { recorded.open = true; next.focus(); });
  fireEvent(recorded, new Event("toggle"));
  expect(document.activeElement).toBe(next);
  expect(next.getBoundingClientRect().top).toBeGreaterThanOrEqual(40);
  expect(next.getBoundingClientRect().bottom).toBeLessThanOrEqual(180);
});
