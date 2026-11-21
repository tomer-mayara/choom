// Generated from TypeSpec by bun run contracts:generate. Do not edit.

import type * as ChoomBaselineModel from "@choom/baseline-model/contracts";

export interface DuplicationBaselineBinding {
  id: duplicationReference;
  formatVersion: 1 | 2 | 3 | 4 | 5 | 6;
  sha256: duplicationDigest;
}

export interface DuplicationEndpoint {
  interfaceId: duplicationReference;
  entryId?: duplicationReference;
  evidenceRefs: Array<duplicationReference>;
}

export interface DuplicationEndpointReference {
  interfaceId: duplicationReference;
  entryId?: duplicationReference;
}

export type DuplicationFact = DuplicationRecordedFact | DuplicationSourceFact;

export type DuplicationFactField = "promises.behavior" | "promises.data" | "promises.errors" | "promises.lifecycle" | "summary" | "description" | "signature" | "kind" | "interaction.input" | "interaction.success" | "interaction.failures" | "interaction.effects";

export type DuplicationFactTopic = "input" | "success" | "failures" | "effects" | "lifecycle";

export interface DuplicationFinding {
  id: duplicationReference;
  kind: "interface-pair" | "entry-pair";
  endpoints: Array<DuplicationEndpoint>;
  observations: Array<DuplicationObservation>;
  status: DuplicationStatus;
  overlap: duplicationText | null;
  differences: Array<duplicationText>;
  rationale: duplicationText | null;
  gaps: Array<duplicationText>;
  facts: Array<DuplicationFact>;
  evidenceRefs: Array<duplicationReference>;
  counterevidenceRefs: Array<duplicationReference>;
  sources: Array<DuplicationSource>;
  review: DuplicationReview | null;
  recommendation?: duplicationText;
}

export interface DuplicationObservation {
  origin: "jscpd-ast" | "jscpd-token" | "source-review";
  endpoints: Array<DuplicationEndpoint>;
  score: duplicationScore | null;
  method: duplicationReference;
  toolVersion: duplicationReference | null;
  evidenceRefs: Array<duplicationReference>;
}

export interface DuplicationRecordedFact {
  endpoint: DuplicationEndpointReference;
  topic: DuplicationFactTopic;
  basis: "recorded-contract";
  field: DuplicationFactField;
}

export interface DuplicationReport {
  kind: "interface-duplication-review";
  formatVersion: 1;
  id: duplicationReference;
  runRef: duplicationReference;
  createdAt: duplicationReference;
  producer: DuplicationTool;
  baseline: DuplicationBaselineBinding;
  snapshot: DuplicationSnapshotBinding;
  scan: DuplicationScan;
  review: DuplicationReviewCoverage;
  findings: Array<DuplicationFinding>;
}

export interface DuplicationResolvedFact {
  value: string | null;
  status: "proposed" | "accepted";
  evidenceRefs: Array<string>;
  acceptanceRef?: string;
}

export interface DuplicationReview {
  worker: duplicationReference;
  model: duplicationReference;
  settingsRef: duplicationReference;
  manager: duplicationReference;
  reviewedAt: duplicationReference;
  decisionRefs: Array<duplicationReference>;
}

export interface DuplicationReviewCoverage {
  status: "pending" | "partial" | "completed";
  inspected: duplicationCount;
  pending: duplicationCount;
  scopeRefs: Array<duplicationReference>;
  gaps: Array<duplicationText>;
}

export interface DuplicationScan {
  status: "completed" | "partial" | "failed" | "skipped";
  profile: duplicationReference;
  tool: DuplicationTool;
  counts: DuplicationScanCounts;
  scopeRefs: Array<duplicationReference>;
  diagnostics: Array<duplicationText>;
  mappingGaps: Array<duplicationText>;
  evidenceRefs: Array<duplicationReference>;
}

export interface DuplicationScanCounts {
  examined: duplicationCount | null;
  excluded: duplicationCount | null;
  unsupported: duplicationCount | null;
  helperOnly: duplicationCount | null;
  unmapped: duplicationCount | null;
}

export interface DuplicationSnapshotBinding {
  id: duplicationReference;
  inventorySha256: duplicationDigest;
}

export interface DuplicationSource {
  snapshotId: duplicationReference;
  path: duplicationReference;
  sha256: duplicationDigest;
  lines: Array<ChoomBaselineModel.baselineSourceLine>;
  evidenceRef: duplicationReference;
}

export interface DuplicationSourceFact {
  endpoint: DuplicationEndpointReference;
  topic: DuplicationFactTopic;
  basis: "source-review";
  state: "known" | "unknown" | "not-applicable";
  value: duplicationText | null;
  reason: duplicationText | null;
  evidenceRefs: Array<duplicationReference>;
}

export type DuplicationStatus = "needs-review" | "potential-redundancy" | "justified-distinction" | "insufficient-evidence";

export interface DuplicationTool {
  name: duplicationReference;
  version: duplicationReference;
}

export type duplicationCount = number;

export type duplicationDigest = string;

export type duplicationReference = string;

export type duplicationScore = number;

export type duplicationText = string;
