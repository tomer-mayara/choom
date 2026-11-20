import "@typespec/json-schema";

using TypeSpec.JsonSchema;

namespace Choom.Producer;

// An observation applies to this use of the selector.
@extension("additionalProperties", false)
model ReviewedRoleUse {
  role: Choom.BaselineModel.BoundaryRole;

  @minItems(1)
  evidenceRefs: string[];
}

@extension("additionalProperties", false)
model UnitUseReview {
  unitScope: Choom.BaselineModel.BoundaryRole | "mixed";
  basis: "declaration" | "complete-review" | "partial-review";
  uses: ReviewedRoleUse[];

  @minItems(1)
  evidenceRefs: string[];

  limits: string[];
}

@extension("additionalProperties", false)
model FrozenBaselineReference {
  artifactRef: "reference-baseline-001";
  sha256: Choom.BaselineModel.baselineSourceDigest;
}

@extension("additionalProperties", false)
model RunProject {
  // Preserve the original text. The UTF-8 encoding fits in 4096 bytes.
  projectKey: Choom.BaselineModel.baselineText;

  referenceBaseline: FrozenBaselineReference | null;
}

@extension("additionalProperties", false)
model CandidateKnipClaim {
  mode: "normal" | "production";
  receiptRef: string;
  outcome: "unknown" | "reported";
}

@extension("additionalProperties", false)
model RegistrationClue {
  kind: "registration";
  operation: string;
  context: Choom.BaselineModel.BoundaryRole;
  sourceRef: string;
}

@extension("additionalProperties", false)
model UnresolvedLoaderClue {
  kind: "unresolved-loader";
  context: "unknown";
  sourceRef: string;
  matchRef: string;
  expression: string;
  missingBinding: string;
}

union InspectionClue {
  RegistrationClue,
  UnresolvedLoaderClue,
}
