import { createHash } from "node:crypto";
import { stringify } from "yaml";
import { baselineExample } from "./baseline-fixtures.ts";

export const deferredFile = "src/legacy/exporter.ts";
export const deferredReason = "The old exporter has no declared entry and no single owner. This run defers it.";

/**
 * A saved baseline file and a version 2 discovery result for its exact bytes,
 * written by hand in the shape of CR-004: two questions about Billing and one
 * deferred file that names no baseline item.
 */
export function discoveryFixture() {
  const baseline = baselineExample();
  const baselineText = stringify(baseline);
  const sha256 = createHash("sha256").update(baselineText).digest("hex");
  const result = {
    formatVersion: 2 as const, kind: "architecture-discovery" as const, runRef: "run-001",
    baselineRef: baseline.id, baselineDigest: sha256,
    entryAnalysisRef: "s5-001-entry-analysis", codeMappingRef: "s5-001-file@code-mapping.json",
    dependenciesRef: "s4-001-file@graph-results.json", resourceAccessRef: "s5-001-file@resource-observations.json",
    overview: { text: "Checkout asks Billing to prepare invoices.", evidenceRefs: ["s4-001-file@review.yaml"] },
    inspectedPaths: [],
    questions: [
      { id: "s3-001-question-001", subjectRefs: ["billing"], text: "Is Billing the only component that writes invoices?",
        evidenceRefs: ["s3-001-entry-analysis"] },
      { id: "s4-001-question-001", subjectRefs: ["billing.purpose"], text: "Does Billing also send the invoices that it prepares?",
        evidenceRefs: ["s4-001-file@review.yaml"] },
    ],
    gaps: [
      { id: "s3-001-gap-001", kind: "deferred", subjectRefs: [deferredFile], reason: deferredReason,
        evidenceRefs: ["s3-001-entry-analysis"] },
    ],
  };
  return { baseline, baselineText, sha256, result };
}

export type DiscoveryFixture = ReturnType<typeof discoveryFixture>;
