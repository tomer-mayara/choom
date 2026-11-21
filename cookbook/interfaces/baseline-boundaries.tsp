import "@typespec/json-schema";

using TypeSpec.JsonSchema;

namespace Choom.BaselineModel;

union BoundaryRole {
  "production",
  "test",
  "development",
  "build",
  "ci",
  "benchmark",
  "example",
  "environment",
  "unknown",
}

union BoundaryAccessKind {
  "import",
  "re-export",
  "dynamic-import",
  "require",
  "call",
  "type",
}

@extension("additionalProperties", false)
model BoundaryIdentity {
  projectKey: baselineText;
  snapshotRef: baselineText;
  inventoryDigest: baselineSourceDigest;
  sourceKind: "commit" | "working-tree" | "snapshot";
  baseCommit: baselineText | null;
  analysisRoots: baselineText[];
  mappingRef: baselineText;
  referenceDigest?: baselineSourceDigest;
}

@extension("additionalProperties", false)
model BoundaryComponentScope {
  componentId: baselineId;
  name: baselineText;
  purpose: baselineText;
  roles: BoundaryRole[];
  basis: "declaration" | "complete-review" | "observed" | "unknown";
  evidenceRefs: baselineText[];
  reason?: baselineText;
}

@extension("additionalProperties", false)
model BoundaryUnit {
  id: baselineId;
  path: baselineText;
  symbol?: baselineText;
  unitKind: "file" | "symbol" | "rest";
  ownerId: baselineId | null;
  stableId?: baselineText;
  roles: BoundaryRole[];
  purposeRoles?: baselineText[];
  generatedFromRef?: baselineText;
  evidenceRefs: baselineText[];
  reason?: baselineText;
}

@extension("additionalProperties", false)
model BoundaryOperation {
  id: baselineId;
  unitId: baselineId;
  member: baselineText;
  name: baselineText;
  stableId?: baselineText;
  roles: BoundaryRole[];
  visibility: "public" | "private" | "unknown";
  interfaceId?: baselineId;
  entryId?: baselineId;
  systemEntryIds?: baselineId[];
  evidenceRefs: baselineText[];
  reason?: baselineText;
}

@extension("additionalProperties", false)
model BoundarySourceUseLink {
  interfaceId: baselineId;
  useId: baselineId;
}

@extension("additionalProperties", false)
model BoundaryEmittedCopy {
  sourceRef: baselineText;
  emittedRef: baselineText;
  proofRef: baselineText;
}

@extension("additionalProperties", false)
model BoundaryAccess {
  id: baselineId;
  callerUnitId: baselineId;
  writtenPath: baselineText;
  targetUnitId: baselineId | null;
  member: baselineText | null;
  operationId?: baselineId;
  kind: BoundaryAccessKind;
  context: baselineText;
  callerRole: BoundaryRole;
  targetRole: BoundaryRole;
  callerRef: baselineText;
  evidenceRefs: baselineText[];
  sourceUse?: BoundarySourceUseLink;
  emittedCopies?: BoundaryEmittedCopy[];
  reason?: baselineText;
}

// Settings retain the effective declarative configuration of the checked rule.
@extension("additionalProperties", false)
model BoundaryRule {
  id: baselineId;
  name: baselineText;
  kind:
    | "reachability"
    | "path"
    | "visibility"
    | "allowlist"
    | "exception"
    | "unsupported";
  authority: "repository" | "accepted" | "proposed" | "conflict";
  revision: baselineText;
  scope: baselineText;
  settings: BaselineRuleObject;
  accessKinds: BoundaryAccessKind[];
  evidenceRefs: baselineText[];
  statementRef?: baselineText;
  acceptanceRef?: baselineText;
  referenceDigest?: baselineSourceDigest;
  overridesRuleId?: baselineId;
}

@extension("additionalProperties", false)
model BoundaryCoverage {
  status: "complete" | "partial" | "unassessed";
  roots: baselineText[];

  // When present, the producer reconciled every source unit under each root
  // with the captured inventory and the selected mapping for this check.
  inventoryRoots?: baselineText[];

  examinedUnitIds: baselineId[];
  accessKinds: BoundaryAccessKind[];
  missingRoots: baselineText[];
  unresolvedAccessIds: baselineId[];
  limitations: baselineText[];
}

@extension("additionalProperties", false)
model BoundaryCheck {
  id: baselineId;
  ruleId: baselineId;
  sourceUnitId: baselineId;
  targetUnitId: baselineId;
  context: baselineText;
  checker: baselineText;
  checkerVersion: baselineText;
  result: "forbidden" | "allowed" | "absent" | "unknown";
  accessIds: baselineId[];
  coverage: BoundaryCoverage;
  evidenceRefs: baselineText[];
  exceptionId?: baselineId;
}

@extension("additionalProperties", false)
model BoundaryCallerSearch {
  operationId: baselineId;
  role: BoundaryRole;
  coverage: BoundaryCoverage;
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model BoundaryMatch {
  referenceDigest: baselineSourceDigest;
  oldPath: baselineText;
  oldSymbol?: baselineText;
  oldMember?: baselineText;
  unitId: baselineId;
  operationId?: baselineId;
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model BoundarySourceNote {
  evidenceRef: baselineText;
  description: baselineText;
  location: BaselineSourceLocation;
}

// Raw observations survive a decision. Only a current review supports counts and verdicts.
@extension("additionalProperties", false)
model BaselineBoundaryReview {
  status: "current" | "needs-refresh";
  identity: BoundaryIdentity;
  componentScopes: BoundaryComponentScope[];
  units: BoundaryUnit[];
  operations: BoundaryOperation[];

  @maxItems(2000)
  accesses: BoundaryAccess[];

  rules: BoundaryRule[];
  checks: BoundaryCheck[];
  callerSearches: BoundaryCallerSearch[];

  @maxItems(4000)
  sourceNotes: BoundarySourceNote[];

  matches: BoundaryMatch[];
  limitations: baselineText[];
  statementRefs?: baselineText[];
}
