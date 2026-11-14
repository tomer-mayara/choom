import "@typespec/json-schema";

using TypeSpec.JsonSchema;

namespace Choom.Domain;

// Runtime checks UTF-8 budgets, local bindings, note locations and references.
// Source observations do not establish permission or runtime execution.
@extension("additionalProperties", false)
model BaselineSourceUse {
  id: baselineId;
  consumerId: baselineId | null;
  kind: "value" | "type";
  context: "application" | "tooling" | "test" | "unknown";
  description: baselineText;
  callerRef: baselineText;

  @minItems(1)
  @uniqueItems
  evidenceRefs: baselineText[];

  accessPoint?: baselineText;
  entryId?: baselineId;
}

@extension("additionalProperties", false)
model BaselineSourceAssessment {
  interfaceId: baselineId;
  scope: baselineText;

  @minItems(1)
  @uniqueItems
  evidenceRefs: baselineText[];

  limitations: baselineText[];
  uses: BaselineSourceUse[];
  sourceNotes: BaselineSourceNote[];
}

@extension("additionalProperties", false)
model BaselineSourceUsage {
  snapshotRef: baselineText;
  mappingRef: baselineText;
  assessments: BaselineSourceAssessment[];
}
