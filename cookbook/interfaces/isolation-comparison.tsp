import "@typespec/json-schema";
import "./baseline.tsp";

using TypeSpec.JsonSchema;

namespace Choom.BaselineModel;

// Compare already validated files. The digest identifies the original bytes.
@extension("additionalProperties", false)
model IsolationInput {
  baseline: Baseline;
  sha256: baselineSourceDigest;
}

union IsolationChange {
  "New violation",
  "Resolved violation",
  "Existing violation",
  "Interface use changed",
  "Policy or ownership changed",
  "Entered production scope",
  "Left production scope",
  "Needs review",
  "Comparison limited",
}

// All IDs resolve within the named input. Keep sites and ordered paths in the
// baseline, so a comparison does not copy source text or expand the graph.
@extension("additionalProperties", false)
model IsolationEvidence {
  callerUnitId: baselineId | null;
  targetUnitId: baselineId | null;
  ruleId: baselineId | null;
  statementRef?: baselineText;
  accessIds: baselineId[];
  resultIds: baselineId[];
  coverageIds: baselineId[];
}

@extension("additionalProperties", false)
model IsolationFinding {
  change: IsolationChange;
  reason: baselineText;
  before: IsolationEvidence | null;
  after: IsolationEvidence | null;
}

@extension("additionalProperties", false)
model IsolationComparison {
  status: "compared" | "identical" | "incompatible-format" | "project-mismatch";
  findings: IsolationFinding[];
  complete: boolean;
}

interface IsolationComparisonOperations {
  compare(before: IsolationInput, after: IsolationInput): IsolationComparison;
}
