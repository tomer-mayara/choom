import type { Baseline, BaselineDocumentation } from "../../src/domain/generated/contracts.ts";
import { accepted, fixtureItem, proposed } from "./baseline-fixtures.ts";
import { enrichedBaseline } from "./interface-documentation-fixtures.ts";

export function interfaceOverviewFixture(variant = "complete"): Baseline {
  const baseline: Baseline = enrichedBaseline();
  const item = fixtureItem(baseline.interfaces);
  const documentation: BaselineDocumentation = structuredClone(fixtureItem(enrichedBaseline().interfaces).documentation);
  item.documentation = documentation;
  item.publicAccess = proposed(["createInvoice", "Invoice", "InvoiceFile", "unclassified-reference"]);
  documentation.entries.push(
    { id: "invoice-type", name: "Invoice type", accessPoint: "Invoice", kind: proposed("type"), description: proposed("The invoice ID and its line items."), examples: [] },
    { id: "invoice-data", name: "Invoice data", accessPoint: "InvoiceFile", kind: proposed("data"), description: proposed("Saved invoice records."), examples: [] },
  );
  const entry = fixtureItem(documentation.entries);
  if (variant === "partial") entry.interaction = proposed({ input: null, success: "An invoice with a stable ID.", failures: null, effects: "Save the invoice once validation succeeds." });
  if (variant === "unknown interaction") entry.interaction = proposed({ input: null, success: null, failures: null, effects: null });
  if (variant === "missing interaction") { delete entry.interaction; entry.description = proposed(null); }
  if (variant === "unknown provider") item.owner = proposed(null);
  if (variant === "unknown permission") item.allowedConsumers = proposed(null);
  if (variant === "mixed status") item.owner = accepted("billing");
  if (variant === "duplicate names") {
    fixtureItem(baseline.components).name = "Billing";
    fixtureItem(documentation.entries, 1).name = entry.name;
    item.allowedConsumers = proposed(["checkout", "billing"]);
  }
  return baseline;
}
