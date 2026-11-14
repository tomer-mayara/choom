import { fixtureItem, proposed } from "./baseline-fixtures.ts";
import { sourceUsageBaseline } from "./source-usage-fixtures.ts";

function acceptIntentStatements(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  if ("status" in value && "evidenceRefs" in value && "value" in value) {
    Object.assign(value, { status: "accepted", acceptanceRef: "interface-intent-review#/decisions/1" });
  }
  for (const child of Object.values(value)) acceptIntentStatements(child);
}

export function sourceUseReadingBaseline(variant = "complete") {
  const input = sourceUsageBaseline();
  const item = fixtureItem(input.interfaces);
  input.components.push({ ...structuredClone(fixtureItem(input.components)), id: "admin", name: "Admin" });
  item.allowedConsumers = proposed(["admin"]);
  const entry = fixtureItem(item.documentation.entries);
  item.publicAccess.value = ["createInvoice", "refundInvoice"];
  item.documentation.entries.push({ ...structuredClone(entry), id: "refund-invoice", name: "Refund invoice", accessPoint: "refundInvoice" });
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const original = fixtureItem(assessment.uses);
  assessment.uses.push(
    { ...structuredClone(original), id: "checkout-refund", description: "Checkout refunds a cancelled invoice.", entryId: "refund-invoice", accessPoint: "refundInvoice" },
    { ...structuredClone(original), id: "billing-tool", consumerId: "billing", context: "tooling", description: "Billing's migration tool reads the invoice value." },
    { ...structuredClone(original), id: "checkout-type", kind: "type", description: "Checkout imports the invoice type." },
    { ...structuredClone(original), id: "checkout-test", context: "test", description: "Checkout tests create an invoice." },
    { ...structuredClone(original), id: "unknown-context", context: "unknown", description: "The caller's execution context could not be established." },
    { ...structuredClone(original), id: "unmapped-caller", consumerId: null, description: "The caller file has no selected component owner." },
  );
  switch (variant) {
    case "accepted intent": acceptIntentStatements(item); break;
    case "no source object": Reflect.deleteProperty(input, "sourceUsage"); break;
    case "no assessment": input.sourceUsage.assessments = []; break;
    case "empty assessment": assessment.uses = []; break;
    case "unknown provider": item.owner = proposed(null); break;
    case "other references only": assessment.uses = assessment.uses.filter((use) => use.kind === "type" || use.context === "test"); break;
    case "unmapped caller": assessment.uses = assessment.uses.filter((use) => use.consumerId === null); break;
    case "duplicate names":
      input.components.push({ ...structuredClone(fixtureItem(input.components)), id: "second-checkout", name: "Checkout" });
      assessment.uses.push({ ...structuredClone(original), id: "second-client", consumerId: "second-checkout" });
      break;
    case "unknown policies":
      input.interfaces = Array.from({ length: 10 }, (_, index) => ({ ...structuredClone(item),
        id: index === 0 ? "invoice-api" : `invoice-api-${index}`, name: index === 0 ? "Invoice API" : `Invoice API ${index}`,
        allowedConsumers: proposed(null),
      }));
      break;
    case "long text":
      fixtureItem(input.components).name = "Checkout ".repeat(45);
      fixtureItem(assessment.sourceNotes).location.path = `${"long-directory/".repeat(45)}order.ts`;
      original.description = "A saved caller description. ".repeat(80);
      break;
  }
  return input;
}
