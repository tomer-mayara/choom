import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { InterfaceRecordedStatus } from "../../../src/components/interface-overview.tsx";
import type { Baseline } from "../../../src/domain/generated/contracts.ts";
import { fixtureItem, proposed } from "../../support/baseline-fixtures.ts";
import { baselineWithSignature } from "../../support/interface-documentation-fixtures.ts";
import { originalInterfaceRecord, selectInterfaceTab } from "../../support/interface-details-dom.ts";

afterEach(cleanup);
function fixture() {
  const baseline: Baseline = baselineWithSignature().input;
  const item = fixtureItem(baseline.interfaces);
  if (!item.documentation) throw new Error("Signature fixture needs documentation.");
  const entry = fixtureItem(item.documentation.entries);
  return { baseline, item, entry };
}
function show(baseline: Baseline) {
  return render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: "invoice-api" }} />);
}
function removeSignature(data: ReturnType<typeof fixture>) {
  delete data.entry.signature;
  if (data.item.documentation) data.item.documentation.sourceNotes = data.item.documentation.sourceNotes.filter(({ evidenceRef }) => evidenceRef !== "invoice-declaration");
}

test("the function signature preserves its exact declaration and own status as literal code", () => {
  const { baseline, entry } = fixture();
  const declaration = 'createInvoice(\n  label: "<img src=x onerror=alert(1)>",\n  order: Order,\n): Promise<Invoice>';
  entry.signature = { ...proposed(declaration), evidenceRefs: ["invoice-declaration"] };
  const { container } = show(baseline);
  const group = screen.getByRole("group", { name: "Signature" });
  expect(group.querySelector("pre code")?.textContent).toBe(declaration);
  expect(within(group).getByText("Proposed")).toBeTruthy();
  expect(within(group).queryByText("Accepted (recorded)")).toBeNull();
  expect(container.querySelector("img, script, iframe")).toBeNull();
});

test.each(["missing", "unknown"] as const)("a %s signature has distinct wording without a made-up declaration", (kind) => {
  const data = fixture(); const { baseline, entry } = data;
  if (kind === "missing") removeSignature(data);
  else if (entry.signature) entry.signature.value = null;
  show(baseline);
  const group = screen.getByRole("group", { name: "Signature" });
  expect(group.textContent).toContain(kind === "missing" ? "Signature not recorded." : "Signature is unknown.");
  expect(group.querySelector("pre")).toBeNull();
  expect(within(group).queryByText("Accepted (recorded)") !== null).toBe(kind === "unknown");
});

test.each(["type", "data", "message", "command", "workflow", null] as const)("a %s entry does not invent a method signature", (kind) => {
  const data = fixture(); const { baseline, entry } = data;
  removeSignature(data); delete entry.interaction;
  entry.kind = proposed(kind);
  show(baseline);
  expect(screen.queryByRole("group", { name: "Signature" })).toBeNull();
});

test("changing entries replaces the declaration and retains no prior function signature", () => {
  const { baseline, item, entry } = fixture();
  item.documentation?.entries.push({ ...structuredClone(entry), id: "read-invoice", name: "Read invoice", accessPoint: "readInvoice",
    signature: proposed("readInvoice(id: string): Invoice | undefined") });
  item.publicAccess.value?.push("readInvoice");
  show(baseline);
  fireEvent.click(screen.getByRole("button", { name: "Read invoice, read-invoice" }));
  expect(screen.getByRole("group", { name: "Signature" }).querySelector("pre")?.textContent).toBe("readInvoice(id: string): Invoice | undefined");
  expect(screen.queryByText(entry.signature?.value ?? "")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create invoice, create-invoice" }));
  expect(screen.getByRole("group", { name: "Signature" }).querySelector("pre")?.textContent).toBe(entry.signature?.value ?? "");
});

test("a signature has its own recorded status and does not inherit a proposed interface status", () => {
  const { item } = fixture();
  item.allowedConsumers = proposed(item.allowedConsumers.value);
  render(<InterfaceRecordedStatus item={item} />);
  expect(screen.getByText("Mixed recorded statuses")).toBeTruthy();
});

test("a signature alone keeps the general behavior prominent when description and interaction are absent", () => {
  const { baseline, entry } = fixture();
  entry.description = proposed(null); delete entry.interaction;
  show(baseline);
  expect(screen.queryByText("Interface-wide contract", { selector: "summary" })).toBeNull();
  expect(screen.getByRole("group", { name: "Behavior" }).textContent).toContain("Create an invoice");
});

test("Sources connects a signature-only note to its statement and retains acceptance and original values", () => {
  const { baseline, item } = fixture();
  show(baseline); selectInterfaceTab("Sources");
  const sources = within(screen.getByRole("tabpanel", { name: "Sources" }));
  const note = sources.getByText("Declaration of createInvoice.").closest("li");
  expect(note?.textContent).toContain("Create invoice: signature");
  fireEvent.click(sources.getByText("Recorded statements", { selector: "summary" }));
  const statement = sources.getByText("invoice-api.documentation.entries.create-invoice.signature").closest("li");
  expect(statement?.textContent).toContain("Accepted (recorded)");
  expect(statement?.textContent).toContain("missing-review#/decisions/4");
  const original: unknown = originalInterfaceRecord();
  expect(original).toEqual(item);
});
