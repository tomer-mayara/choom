import { createHash } from "node:crypto";
import { stringify } from "yaml";
import type { Baseline } from "@choom/baseline-model/contracts";
import { baselineExample } from "./baseline-fixtures.ts";

export const deferredFile = "src/legacy/exporter.ts";
export const deferredReason = "The old exporter has no declared entry and no single owner. This run defers it.";

/**
 * A saved baseline file and a version 2 discovery result for its exact bytes,
 * written by hand in the shape of CR-004: two questions about Billing and one
 * deferred file that names no baseline item. The baseline is a first version with
 * no parent, as a run publishes it, so the viewer can copy a decision for it.
 */
export function discoveryFixture() {
  const baseline: Baseline = { ...baselineExample(), parentId: null };
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

/** A copy of the fixture result as plain data, for tests that change or break its shape. */
export type DiscoveryInput = Record<string, unknown> & { questions: Record<string, unknown>[]; gaps: Record<string, unknown>[] };

export function discoveryRecord(list: Record<string, unknown>[], index = 0): Record<string, unknown> {
  const item = list[index];
  if (item === undefined) throw new Error(`The discovery fixture needs record ${index}.`);
  return item;
}

/** Copies of the first record of the list, each with its own ID and its own lists. */
export function discoveryRecordCopies(list: Record<string, unknown>[], count: number, prefix: string): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({ ...structuredClone(discoveryRecord(list)), id: `${prefix}-${index}` }));
}

/** The fixture with one more record on each other item kind: an interface of Billing, a resource and a rule. */
export function discoveryOnEveryItemKind(): DiscoveryFixture {
  const fixture = discoveryFixture();
  // Each record gets its own list, so that the YAML writer gives no anchors, which the viewer refuses.
  const evidenceRefs = () => ["s4-001-file@review.yaml"];
  fixture.result.questions.push({ id: "s4-001-question-002", subjectRefs: ["invoice-api.allowedConsumers"],
    text: "May Checkout use the Invoice API?", evidenceRefs: evidenceRefs() });
  fixture.result.gaps.push(
    { id: "s4-001-gap-001", kind: "unknown-owner", subjectRefs: ["invoice-store.owner"], reason: "No code writes the invoice store.",
      evidenceRefs: evidenceRefs() },
    { id: "s4-001-gap-002", kind: "a-kind-that-the-viewer-does-not-know", subjectRefs: ["invoice-access.check"],
      reason: "The access rule has no check yet.", evidenceRefs: evidenceRefs() },
  );
  return fixture;
}
