import { accepted, fixtureItem } from "./baseline-fixtures.ts";
import { interfaceExampleFixture } from "./interface-example-fixtures.ts";

export function interfaceSourceFixture(variant: "compact" | "reading" | "owned-list" = "compact") {
  const baseline = interfaceExampleFixture();
  const item = fixtureItem(baseline.interfaces);
  const docs = item.documentation;
  if (!docs) throw new Error("Source fixtures need interface documentation.");
  item.owner.evidenceRefs = ["contract-notes", "unresolved-contract#/claims/7", "contract-notes"];
  item.publicAccess.evidenceRefs = ["contract-notes", "unresolved-contract#/claims/7"];
  item.allowedConsumers.evidenceRefs = ["contract-notes"];
  docs.summary = { ...accepted("Create an invoice from a supported order."), evidenceRefs: ["contract-notes"], acceptanceRef: "review-42#decision-1" };
  const entry = fixtureItem(docs.entries);
  fixtureItem(entry.examples, 1).content.evidenceRefs = ["empty-order-source", "contract-notes"];
  docs.sourceNotes.push(
    { evidenceRef: "empty-order-source", description: "Empty orders are rejected before storage.",
      location: { snapshotRef: "snapshot-invoice", path: "billing/order-check.ts", sha256: "b".repeat(64), lines: [17, 23] } },
    { evidenceRef: "contract-notes", description: "Approved public contract and permitted callers." },
  );
  if (variant !== "compact") fixtureItem(entry.examples, 1).content.value.text = "saved empty-order sample line\n".repeat(100);
  if (variant === "owned-list") {
    const record = structuredClone(item);
    delete record.documentation;
    baseline.interfaces.unshift(...Array.from({ length: 24 }, (_, index) => ({
      ...structuredClone(record), id: `billing-api-${index}`, name: `Billing API ${index}`,
    })));
  }
  return baseline;
}
