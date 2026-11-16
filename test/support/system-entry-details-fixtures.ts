import type { BaselineSystemEntryPoint } from "@choom/baseline-model/contracts";
import { fixtureItem } from "./baseline-fixtures.ts";
import { systemEntryPointsBaseline } from "./system-entry-points-fixtures.ts";

export function systemEntryDetailsBaseline() {
  const baseline = systemEntryPointsBaseline();
  const invoice = fixtureItem(baseline.interfaces);
  invoice.publicAccess.value = ["createInvoice", "refundInvoice"];
  invoice.documentation.entries.push({
    ...structuredClone(fixtureItem(invoice.documentation.entries)),
    id: "refund-invoice", name: "Refund invoice", accessPoint: "refundInvoice",
  });

  const entries: BaselineSystemEntryPoint[] = [{
    id: "checkout-cli", kind: "startup", label: "Checkout CLI",
    path: "checkout/main.ts", componentId: "checkout", evidenceRefs: ["reviewed-cli-start"],
  }, ...Array.from({ length: 20 }, (_, index): BaselineSystemEntryPoint => {
    const number = String(index + 1).padStart(2, "0");
    const path = `checkout/routes/route-${number}.ts`;
    return {
      id: `checkout-route-${number}`, kind: "external", label: `HTTP POST /orders/${number}`,
      path, componentId: "checkout", evidenceRefs: [`reviewed-route-${number}`],
      ...(index === 0 ? {
        source: {
          evidenceRef: "reviewed-route-01",
          location: { snapshotRef: "snapshot-invoice", path, sha256: "c".repeat(64), lines: [3, 14] },
        },
        interfaceId: "invoice-api", entryId: "refund-invoice",
      } : index === 1 ? { interfaceId: "invoice-api" } : {}),
    };
  })];
  return { ...baseline, systemEntryPoints: { ...baseline.systemEntryPoints, entries } };
}
