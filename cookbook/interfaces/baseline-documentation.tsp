import "@typespec/json-schema";

using TypeSpec.JsonSchema;

namespace Choom.Domain;

// Runtime validation measures UTF-8 byte budgets and checks local references.
union BaselineEntryKind {
  "function",
  "command",
  "type",
  "data",
  "message",
  "workflow",
  null,
}

@extension("additionalProperties", false)
model ProposedEntryKindStatement {
  value: BaselineEntryKind;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedEntryKindStatement {
  value: BaselineEntryKind;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineEntryKindStatement {
  ProposedEntryKindStatement,
  AcceptedEntryKindStatement,
}

@extension("additionalProperties", false)
model BaselineInteraction {
  input: baselineText | null;
  success: baselineText | null;
  failures: baselineText | null;
  effects: baselineText | null;
}

@extension("additionalProperties", false)
model ProposedInteractionStatement {
  value: BaselineInteraction;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedInteractionStatement {
  value: BaselineInteraction;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineInteractionStatement {
  ProposedInteractionStatement,
  AcceptedInteractionStatement,
}

@extension("additionalProperties", false)
model BaselineExampleResult {
  text: baselineText;
  summary: baselineText;
  scope: "complete" | "excerpt";
}

@extension("additionalProperties", false)
model BaselineExampleContent {
  text: baselineText;
  input?: baselineText;
  result?: BaselineExampleResult;
}

@extension("additionalProperties", false)
model ProposedExampleStatement {
  value: BaselineExampleContent;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedExampleStatement {
  value: BaselineExampleContent;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineExampleStatement {
  ProposedExampleStatement,
  AcceptedExampleStatement,
}

@extension("additionalProperties", false)
model BaselineDocumentationExample {
  id: baselineId;
  name: baselineText;
  basis: "illustrative" | "source-reviewed";
  content: BaselineExampleStatement;
}

@extension("additionalProperties", false)
model BaselineDocumentedEntry {
  id: baselineId;
  name: baselineText;
  accessPoint: baselineText;
  kind: BaselineEntryKindStatement;
  description: BaselineNullableTextStatement;
  interaction?: BaselineInteractionStatement;

  @maxItems(8)
  examples: BaselineDocumentationExample[];
}

@pattern("^[a-fA-F0-9]{64}$")
scalar baselineSourceDigest extends string;

@minValue(1)
@maxValue(9007199254740991)
scalar baselineSourceLine extends integer;

@extension("additionalProperties", false)
model BaselineSourceLocation {
  snapshotRef: baselineText;
  path: baselineText;
  sha256: baselineSourceDigest;

  @minItems(2)
  @maxItems(2)
  lines: baselineSourceLine[];
}

@extension("additionalProperties", false)
model BaselineSourceNote {
  evidenceRef: baselineText;
  description: baselineText;
  location?: BaselineSourceLocation;
}

@extension("additionalProperties", false)
model BaselineDocumentation {
  summary: BaselineNullableTextStatement;

  @maxItems(32)
  entries: BaselineDocumentedEntry[];

  sourceNotes: BaselineSourceNote[];
}
