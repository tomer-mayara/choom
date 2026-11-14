import "@typespec/json-schema";
import "./baseline.tsp";

using TypeSpec.JsonSchema;

namespace Choom.Domain;

@pattern("\\S")
@maxLength(16384)
scalar duplicationText extends string;

@pattern("\\S")
@maxLength(4096)
scalar duplicationReference extends string;

@pattern("^[a-f0-9]{64}$")
scalar duplicationDigest extends string;

@minValue(0)
@maxValue(9007199254740991)
scalar duplicationCount extends integer;

@minValue(0)
@maxValue(1)
scalar duplicationScore extends float64;

union DuplicationStatus {
  "needs-review",
  "potential-redundancy",
  "justified-distinction",
  "insufficient-evidence",
}

union DuplicationFactTopic {
  "input",
  "success",
  "failures",
  "effects",
  "lifecycle",
}

union DuplicationFactField {
  "promises.behavior",
  "promises.data",
  "promises.errors",
  "promises.lifecycle",
  "summary",
  "description",
  "signature",
  "kind",
  "interaction.input",
  "interaction.success",
  "interaction.failures",
  "interaction.effects",
}

@extension("additionalProperties", false)
model DuplicationEndpointReference {
  interfaceId: duplicationReference;
  entryId?: duplicationReference;
}

@extension("additionalProperties", false)
model DuplicationEndpoint {
  interfaceId: duplicationReference;
  entryId?: duplicationReference;

  @minItems(1)
  evidenceRefs: duplicationReference[];
}

@extension("additionalProperties", false)
model DuplicationRecordedFact {
  endpoint: DuplicationEndpointReference;
  topic: DuplicationFactTopic;
  basis: "recorded-contract";
  field: DuplicationFactField;
}

@extension("additionalProperties", false)
model DuplicationSourceFact {
  endpoint: DuplicationEndpointReference;
  topic: DuplicationFactTopic;
  basis: "source-review";
  state: "known" | "unknown" | "not-applicable";
  value: duplicationText | null;
  reason: duplicationText | null;
  evidenceRefs: duplicationReference[];
}

union DuplicationFact {
  DuplicationRecordedFact,
  DuplicationSourceFact,
}

@extension("additionalProperties", false)
model DuplicationResolvedFact {
  value: string | null;
  status: "proposed" | "accepted";
  evidenceRefs: string[];
  acceptanceRef?: string;
}

@extension("additionalProperties", false)
model DuplicationSource {
  snapshotId: duplicationReference;
  path: duplicationReference;
  sha256: duplicationDigest;

  @minItems(2)
  @maxItems(2)
  lines: baselineSourceLine[];

  evidenceRef: duplicationReference;
}

@extension("additionalProperties", false)
model DuplicationObservation {
  origin: "jscpd-ast" | "jscpd-token" | "source-review";

  @minItems(2)
  @maxItems(2)
  endpoints: DuplicationEndpoint[];

  score: duplicationScore | null;
  method: duplicationReference;
  toolVersion: duplicationReference | null;

  @minItems(1)
  evidenceRefs: duplicationReference[];
}

@extension("additionalProperties", false)
model DuplicationReview {
  worker: duplicationReference;
  `model`: duplicationReference;
  settingsRef: duplicationReference;
  manager: duplicationReference;
  reviewedAt: duplicationReference;

  @minItems(1)
  decisionRefs: duplicationReference[];
}

@extension("additionalProperties", false)
model DuplicationFinding {
  id: duplicationReference;
  kind: "interface-pair" | "entry-pair";

  @minItems(2)
  @maxItems(2)
  endpoints: DuplicationEndpoint[];

  @minItems(1)
  @maxItems(100)
  observations: DuplicationObservation[];

  status: DuplicationStatus;
  overlap: duplicationText | null;
  differences: duplicationText[];
  rationale: duplicationText | null;
  gaps: duplicationText[];

  @maxItems(100)
  facts: DuplicationFact[];

  evidenceRefs: duplicationReference[];
  counterevidenceRefs: duplicationReference[];

  @maxItems(100)
  sources: DuplicationSource[];

  review: DuplicationReview | null;
  recommendation?: duplicationText;
}

@extension("additionalProperties", false)
model DuplicationBaselineBinding {
  id: duplicationReference;
  formatVersion: 1 | 2 | 3;
  sha256: duplicationDigest;
}

@extension("additionalProperties", false)
model DuplicationSnapshotBinding {
  id: duplicationReference;
  inventorySha256: duplicationDigest;
}

@extension("additionalProperties", false)
model DuplicationTool {
  name: duplicationReference;
  version: duplicationReference;
}

@extension("additionalProperties", false)
model DuplicationScanCounts {
  // The first three counts are source files; the last two are candidate pairs.
  examined: duplicationCount | null;

  excluded: duplicationCount | null;
  unsupported: duplicationCount | null;
  helperOnly: duplicationCount | null;
  unmapped: duplicationCount | null;
}

@extension("additionalProperties", false)
model DuplicationScan {
  status: "completed" | "partial" | "failed" | "skipped";
  profile: duplicationReference;
  tool: DuplicationTool;
  counts: DuplicationScanCounts;
  scopeRefs: duplicationReference[];
  diagnostics: duplicationText[];
  mappingGaps: duplicationText[];
  evidenceRefs: duplicationReference[];
}

@extension("additionalProperties", false)
model DuplicationReviewCoverage {
  status: "pending" | "partial" | "completed";
  inspected: duplicationCount;
  pending: duplicationCount;
  scopeRefs: duplicationReference[];
  gaps: duplicationText[];
}

@extension("additionalProperties", false)
model DuplicationReport {
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

  @maxItems(1000)
  findings: DuplicationFinding[];
}
