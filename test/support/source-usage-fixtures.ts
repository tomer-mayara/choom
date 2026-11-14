import { fixtureItem, proposed } from "./baseline-fixtures.ts";
import { enrichedBaseline } from "./interface-documentation-fixtures.ts";

export function sourceUsageBaseline() {
  const baseline = enrichedBaseline();
  fixtureItem(baseline.interfaces).allowedConsumers = proposed(null);
  return {
    ...baseline, formatVersion: 3 as const,
    sourceUsage: {
      snapshotRef: "snapshot-invoice", mappingRef: "selected-code-mapping",
      assessments: [{
        interfaceId: "invoice-api", scope: "Reviewed the checkout caller and invoice declaration.",
        evidenceRefs: ["reviewed-caller", "reviewed-binding"], limitations: ["Other callers were not reviewed."],
        uses: [{
          id: "checkout-invoice", consumerId: "checkout" as string | null,
          kind: "value" as "value" | "type", context: "application" as "application" | "tooling" | "test" | "unknown",
          description: "Checkout creates the invoice for an order.", callerRef: "reviewed-caller",
          evidenceRefs: ["reviewed-caller", "reviewed-binding"], accessPoint: "createInvoice", entryId: "create-invoice",
        }],
        sourceNotes: [{
          evidenceRef: "reviewed-caller", description: "Checkout calls createInvoice with the order.",
          location: { snapshotRef: "snapshot-invoice", path: "checkout/order.ts", sha256: "b".repeat(64), lines: [8, 10] },
        }, {
          evidenceRef: "reviewed-binding", description: "The imported createInvoice declaration belongs to Billing.",
          location: { snapshotRef: "snapshot-invoice", path: "billing/invoice.ts", sha256: "a".repeat(64), lines: [1, 12] },
        }],
      }],
    },
  };
}

export function invalidSourceUsage(defect: string) {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const use = fixtureItem(assessment.uses);
  const note = fixtureItem(assessment.sourceNotes);
  let path = "sourceUsage";
  switch (defect) {
    case "duplicate interface assessments": input.sourceUsage.assessments.push(structuredClone(assessment)); break;
    case "duplicate use IDs": assessment.uses.push(structuredClone(use)); break;
    case "a missing component": use.consumerId = "missing"; break;
    case "a missing interface": assessment.interfaceId = "missing"; break;
    case "a blank mapping reference": input.sourceUsage.mappingRef = " "; break;
    case "an unlocated caller": Reflect.deleteProperty(note, "location"); break;
    case "unlocated binding evidence": Reflect.deleteProperty(fixtureItem(assessment.sourceNotes, 1), "location"); break;
    case "a fragmented use reference": use.evidenceRefs.push("reviewed-caller#/line/8"); break;
    case "a different source snapshot": note.location.snapshotRef = "different"; break;
    case "conflicting entry and access bindings":
      fixtureItem(input.interfaces).publicAccess.value = ["createInvoice", "anotherEntry"];
      use.accessPoint = "anotherEntry";
      break;
    case "an unsupported kind": Object.assign(use, { kind: "executed" }); break;
    case "an unsupported context": Object.assign(use, { context: "runtime" }); break;
    case "too many uses":
      assessment.uses = Array.from({ length: 2001 }, (_, index) => ({ ...structuredClone(use), id: `use-${index}` }));
      break;
    case "excessive text bytes": use.description = "é".repeat(4096) + "x"; break;
    case "invalid inherited documentation":
      fixtureItem(fixtureItem(input.interfaces).documentation.entries).accessPoint = "missing";
      path = "interfaces.0.documentation";
      break;
    default: throw new Error(`Unknown source-use defect: ${defect}`);
  }
  return { input, path };
}

export function sourceUsageAtBudget(bytes: number) {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const original = fixtureItem(assessment.uses);
  assessment.uses = Array.from({ length: 300 }, (_, index) => ({
    ...structuredClone(original), id: `use-${index}`, description: "x",
  }));
  let remaining = bytes - new TextEncoder().encode(JSON.stringify(input.sourceUsage)).byteLength;
  for (const use of assessment.uses) {
    const addition = Math.min(Math.max(remaining, 0), 8 * 1024 - 1);
    use.description += "x".repeat(addition);
    remaining -= addition;
  }
  if (remaining !== 0) throw new Error("The requested source-use budget is outside the fixture range.");
  return input;
}
