import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { selectInterfaceTab } from "../../support/interface-details-dom.ts";
import { sourceUseReadingBaseline } from "../../support/source-use-reading-fixtures.ts";

afterEach(cleanup);
const sources = () => screen.getByRole("tabpanel", { name: "Sources" });
function view() {
  const baseline = sourceUseReadingBaseline();
  fixtureItem(baseline.interfaces).documentation.summary.evidenceRefs.push("reviewed-caller");
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: "invoice-api" }} />);
  selectInterfaceTab("Sources");
  return baseline;
}
function expand(name: string) { fireEvent.click(within(sources()).getByText(name, { selector: "summary" })); }

test("source review shows shared provenance, scope and each binding note without fetching source", () => {
  view();
  const section = screen.getByRole("region", { name: "Source-use review" });
  for (const text of ["snapshot-invoice", "selected-code-mapping", "Other callers were not reviewed.", "checkout/order.ts", "billing/invoice.ts"]) {
    expect(section.textContent).toContain(text);
  }
  expect(section.textContent).toContain("The imported createInvoice declaration belongs to Billing.");
  expect(section.textContent).not.toContain("Accepted (recorded)");
  expect(section.querySelectorAll("a[href],iframe,script")).toHaveLength(0);
});

test("shared note and evidence citations mount only when that source's list is expanded", () => {
  const baseline = view();
  const review = screen.getByRole("region", { name: "Source-use review" });
  expect(within(review).queryAllByText("checkout-invoice", { exact: true })).toHaveLength(0);
  expand("Evidence references");
  const keys = ["source-note-uses-reviewed-caller", "source-evidence-uses-reviewed-caller"];
  for (const key of keys) {
    const section = sources().querySelector(`details[data-section='${key}']`);
    const summary = section?.querySelector("summary");
    expect(section?.querySelectorAll("li").length).toBe(0);
    if (!summary) throw new Error("A source citation list needs a summary.");
    fireEvent.click(summary);
    for (const use of fixtureItem(baseline.sourceUsage.assessments).uses) expect(section?.textContent).toContain(use.id);
  }
  selectInterfaceTab("Overview"); selectInterfaceTab("Sources");
  for (const key of keys) expect(sources().querySelector(`details[data-section='${key}']`)?.hasAttribute("open")).toBe(true);
});

test("evidence reference IDs are shared while intent and source supports stay distinct", () => {
  const baseline = view();
  expand("Evidence references");
  const list = sources().querySelector("details[data-section='interface-evidence']");
  const references = list?.querySelectorAll('li[data-evidence-ref="reviewed-caller"]');
  expect(references).toHaveLength(1);
  const reference = references?.[0];
  expect(reference?.textContent).toContain("Intent statements");
  expect(reference?.textContent).toContain("invoice-api.documentation.summary");
  expect(reference?.textContent).toContain("Source uses");
  const citations = reference?.querySelector("details summary");
  if (!citations) throw new Error("The shared reference needs a source-use disclosure.");
  fireEvent.click(citations);
  for (const use of fixtureItem(baseline.sourceUsage.assessments).uses) expect(reference?.textContent).toContain(use.id);
});

test("original source assessment and original interface remain complete separate records across tabs", () => {
  const baseline = view();
  expand("Original source assessment");
  expand("Original record");
  selectInterfaceTab("Overview"); selectInterfaceTab("Sources");
  const original = sources().querySelector("details[data-section='original-source-assessment']");
  expect(original?.hasAttribute("open")).toBe(true);
  expect(JSON.parse(original?.querySelector("pre")?.textContent ?? "null")).toEqual({
    snapshotRef: baseline.sourceUsage.snapshotRef, mappingRef: baseline.sourceUsage.mappingRef,
    assessment: fixtureItem(baseline.sourceUsage.assessments),
  });
  expect(JSON.parse(sources().querySelector("details[data-section='original-interface-record'] pre")?.textContent ?? "null"))
    .toEqual(fixtureItem(baseline.interfaces));
});
