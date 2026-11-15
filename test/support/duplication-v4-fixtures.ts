import { createHash } from "node:crypto";
import { duplicationV3Fixture } from "./interface-duplication-fixtures.ts";

/** Synthetic version 4 report pair for the reader boundary. Version 5 keeps the same records. */
export function duplicationV4Fixture(formatVersion: 4 | 5 = 4) {
  const fixture = duplicationV3Fixture();
  const baseline = {
    ...fixture.baseline, formatVersion,
    systemEntryPoints: {
      snapshotRef: fixture.baseline.sourceUsage.snapshotRef,
      mappingRef: fixture.baseline.sourceUsage.mappingRef,
      scope: "Reviewed the checkout CLI start.", evidenceRefs: ["entry-review"], limitations: [],
      entries: [{
        id: "checkout-cli", kind: "startup" as const, label: "CLI checkout",
        path: "checkout/order.ts", componentId: "checkout", evidenceRefs: ["checkout-start"],
      }],
    },
  };
  const baselineText = `${JSON.stringify(baseline, null, 2)}\n`;
  const sha256 = createHash("sha256").update(baselineText).digest("hex");
  const report = { ...fixture.report, baseline: { id: baseline.id, formatVersion, sha256 } };
  return { baseline, baselineText, report, sha256 };
}
