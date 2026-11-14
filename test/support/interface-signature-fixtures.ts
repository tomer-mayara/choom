import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { fixtureItem, proposed } from "./baseline-fixtures.ts";
import { baselineWithSignature } from "./interface-documentation-fixtures.ts";

export type SignatureVariant = "saved" | "missing" | "unknown" | "long";

export function interfaceSignatureFixture(variant: SignatureVariant = "saved"): Baseline {
  const baseline: Baseline = baselineWithSignature().input;
  const item = fixtureItem(baseline.interfaces);
  const docs = item.documentation;
  if (!docs) throw new Error("Signature fixture needs documentation.");
  const entry = fixtureItem(docs.entries);
  item.publicAccess.value?.push("Invoice", "InvoiceFile");
  docs.entries.push(
    { id: "invoice-type", name: "Invoice type", accessPoint: "Invoice", kind: proposed("type"), description: proposed("The invoice ID and its line items."), examples: [] },
    { id: "invoice-data", name: "Invoice data", accessPoint: "InvoiceFile", kind: proposed("data"), description: proposed("Saved invoice records."), examples: [] },
  );
  if (variant === "missing") {
    delete entry.signature;
    docs.sourceNotes = docs.sourceNotes.filter(({ evidenceRef }) => evidenceRef !== "invoice-declaration");
  } else if (entry.signature) {
    if (variant === "unknown") entry.signature.value = null;
    if (variant === "long") entry.signature.value = `createInvoice(\n  order: OrderWith${"A".repeat(180)},\n  format: "<img src=x onerror=alert(1)>",\n): Promise<Invoice>`;
  }
  return baseline;
}
