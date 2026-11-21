// Generated from TypeSpec by bun run contracts:generate. Do not edit.

import type * as ChoomBaselineModel from "./records";

export type * from "./records";

export type Baseline = ChoomBaselineModel.BaselineV1 | ChoomBaselineModel.BaselineV2 | ChoomBaselineModel.BaselineV3 | ChoomBaselineModel.BaselineV4 | ChoomBaselineModel.BaselineV5 | BaselineV6;

export interface BaselineBoundaryReview {
  status: "current" | "needs-refresh";
  identity: BoundaryIdentity;
  componentScopes: Array<BoundaryComponentScope>;
  units: Array<BoundaryUnit>;
  operations: Array<BoundaryOperation>;
  accesses: Array<BoundaryAccess>;
  rules: Array<BoundaryRule>;
  checks: Array<BoundaryCheck>;
  callerSearches: Array<BoundaryCallerSearch>;
  sourceNotes: Array<BoundarySourceNote>;
  matches: Array<BoundaryMatch>;
  limitations: Array<ChoomBaselineModel.baselineText>;
  statementRefs?: Array<ChoomBaselineModel.baselineText>;
}

export interface BaselineV6 {
  formatVersion: 6;
  id: ChoomBaselineModel.baselineId;
  parentId: ChoomBaselineModel.baselineText | null;
  components: Array<ChoomBaselineModel.BaselineComponentV5>;
  interfaces: Array<ChoomBaselineModel.BaselineInterface>;
  resources: Array<ChoomBaselineModel.BaselineResource>;
  rules: Array<ChoomBaselineModel.BaselineRule>;
  sourceUsage?: ChoomBaselineModel.BaselineSourceUsage;
  systemEntryPoints?: ChoomBaselineModel.BaselineSystemEntryPoints;
  boundaryReview: BaselineBoundaryReview;
}

export interface BoundaryAccess {
  id: ChoomBaselineModel.baselineId;
  callerUnitId: ChoomBaselineModel.baselineId;
  writtenPath: ChoomBaselineModel.baselineText;
  targetUnitId: ChoomBaselineModel.baselineId | null;
  member: ChoomBaselineModel.baselineText | null;
  operationId?: ChoomBaselineModel.baselineId;
  kind: BoundaryAccessKind;
  context: ChoomBaselineModel.baselineText;
  callerRole: BoundaryRole;
  targetRole: BoundaryRole;
  callerRef: ChoomBaselineModel.baselineText;
  evidenceRefs: Array<ChoomBaselineModel.baselineText>;
  sourceUse?: BoundarySourceUseLink;
  emittedCopies?: Array<BoundaryEmittedCopy>;
  reason?: ChoomBaselineModel.baselineText;
}

export type BoundaryAccessKind = "import" | "re-export" | "dynamic-import" | "require" | "call" | "type";

export interface BoundaryCallerSearch {
  operationId: ChoomBaselineModel.baselineId;
  role: BoundaryRole;
  coverage: BoundaryCoverage;
  evidenceRefs: Array<ChoomBaselineModel.baselineText>;
}

export interface BoundaryCheck {
  id: ChoomBaselineModel.baselineId;
  ruleId: ChoomBaselineModel.baselineId;
  sourceUnitId: ChoomBaselineModel.baselineId;
  targetUnitId: ChoomBaselineModel.baselineId;
  context: ChoomBaselineModel.baselineText;
  checker: ChoomBaselineModel.baselineText;
  checkerVersion: ChoomBaselineModel.baselineText;
  result: "forbidden" | "allowed" | "absent" | "unknown";
  accessIds: Array<ChoomBaselineModel.baselineId>;
  coverage: BoundaryCoverage;
  evidenceRefs: Array<ChoomBaselineModel.baselineText>;
  exceptionId?: ChoomBaselineModel.baselineId;
}

export interface BoundaryComponentScope {
  componentId: ChoomBaselineModel.baselineId;
  name: ChoomBaselineModel.baselineText;
  purpose: ChoomBaselineModel.baselineText;
  roles: Array<BoundaryRole>;
  basis: "declaration" | "complete-review" | "observed" | "unknown";
  evidenceRefs: Array<ChoomBaselineModel.baselineText>;
  reason?: ChoomBaselineModel.baselineText;
}

export interface BoundaryCoverage {
  status: "complete" | "partial" | "unassessed";
  roots: Array<ChoomBaselineModel.baselineText>;
  inventoryRoots?: Array<ChoomBaselineModel.baselineText>;
  examinedUnitIds: Array<ChoomBaselineModel.baselineId>;
  accessKinds: Array<BoundaryAccessKind>;
  missingRoots: Array<ChoomBaselineModel.baselineText>;
  unresolvedAccessIds: Array<ChoomBaselineModel.baselineId>;
  limitations: Array<ChoomBaselineModel.baselineText>;
}

export interface BoundaryEmittedCopy {
  sourceRef: ChoomBaselineModel.baselineText;
  emittedRef: ChoomBaselineModel.baselineText;
  proofRef: ChoomBaselineModel.baselineText;
}

export interface BoundaryIdentity {
  projectKey: ChoomBaselineModel.baselineText;
  snapshotRef: ChoomBaselineModel.baselineText;
  inventoryDigest: ChoomBaselineModel.baselineSourceDigest;
  sourceKind: "commit" | "working-tree" | "snapshot";
  baseCommit: ChoomBaselineModel.baselineText | null;
  analysisRoots: Array<ChoomBaselineModel.baselineText>;
  mappingRef: ChoomBaselineModel.baselineText;
  referenceDigest?: ChoomBaselineModel.baselineSourceDigest;
}

export interface BoundaryMatch {
  referenceDigest: ChoomBaselineModel.baselineSourceDigest;
  oldPath: ChoomBaselineModel.baselineText;
  oldSymbol?: ChoomBaselineModel.baselineText;
  oldMember?: ChoomBaselineModel.baselineText;
  unitId: ChoomBaselineModel.baselineId;
  operationId?: ChoomBaselineModel.baselineId;
  evidenceRefs: Array<ChoomBaselineModel.baselineText>;
}

export interface BoundaryOperation {
  id: ChoomBaselineModel.baselineId;
  unitId: ChoomBaselineModel.baselineId;
  member: ChoomBaselineModel.baselineText;
  name: ChoomBaselineModel.baselineText;
  stableId?: ChoomBaselineModel.baselineText;
  roles: Array<BoundaryRole>;
  visibility: "public" | "private" | "unknown";
  interfaceId?: ChoomBaselineModel.baselineId;
  entryId?: ChoomBaselineModel.baselineId;
  systemEntryIds?: Array<ChoomBaselineModel.baselineId>;
  evidenceRefs: Array<ChoomBaselineModel.baselineText>;
  reason?: ChoomBaselineModel.baselineText;
}

export type BoundaryRole = "production" | "test" | "development" | "build" | "ci" | "benchmark" | "example" | "environment" | "unknown";

export interface BoundaryRule {
  id: ChoomBaselineModel.baselineId;
  name: ChoomBaselineModel.baselineText;
  kind: "reachability" | "path" | "visibility" | "allowlist" | "exception" | "unsupported";
  authority: "repository" | "accepted" | "proposed" | "conflict";
  revision: ChoomBaselineModel.baselineText;
  scope: ChoomBaselineModel.baselineText;
  settings: ChoomBaselineModel.BaselineRuleObject;
  accessKinds: Array<BoundaryAccessKind>;
  evidenceRefs: Array<ChoomBaselineModel.baselineText>;
  statementRef?: ChoomBaselineModel.baselineText;
  acceptanceRef?: ChoomBaselineModel.baselineText;
  referenceDigest?: ChoomBaselineModel.baselineSourceDigest;
  overridesRuleId?: ChoomBaselineModel.baselineId;
}

export interface BoundarySourceNote {
  evidenceRef: ChoomBaselineModel.baselineText;
  description: ChoomBaselineModel.baselineText;
  location: ChoomBaselineModel.BaselineSourceLocation;
}

export interface BoundarySourceUseLink {
  interfaceId: ChoomBaselineModel.baselineId;
  useId: ChoomBaselineModel.baselineId;
}

export interface BoundaryUnit {
  id: ChoomBaselineModel.baselineId;
  path: ChoomBaselineModel.baselineText;
  symbol?: ChoomBaselineModel.baselineText;
  unitKind: "file" | "symbol" | "rest";
  ownerId: ChoomBaselineModel.baselineId | null;
  stableId?: ChoomBaselineModel.baselineText;
  roles: Array<BoundaryRole>;
  purposeRoles?: Array<ChoomBaselineModel.baselineText>;
  generatedFromRef?: ChoomBaselineModel.baselineText;
  evidenceRefs: Array<ChoomBaselineModel.baselineText>;
  reason?: ChoomBaselineModel.baselineText;
}

export type IsolationChange = "New violation" | "Resolved violation" | "Existing violation" | "Interface use changed" | "Policy or ownership changed" | "Entered production scope" | "Left production scope" | "Needs review" | "Comparison limited";

export interface IsolationComparison {
  status: "compared" | "identical" | "incompatible-format" | "project-mismatch";
  findings: Array<IsolationFinding>;
  complete: boolean;
}

export interface IsolationComparisonOperations {
  compare(before: IsolationInput, after: IsolationInput): IsolationComparison;
}

export interface IsolationEvidence {
  callerUnitId: ChoomBaselineModel.baselineId | null;
  targetUnitId: ChoomBaselineModel.baselineId | null;
  ruleId: ChoomBaselineModel.baselineId | null;
  statementRef?: ChoomBaselineModel.baselineText;
  accessIds: Array<ChoomBaselineModel.baselineId>;
  resultIds: Array<ChoomBaselineModel.baselineId>;
  coverageIds: Array<ChoomBaselineModel.baselineId>;
}

export interface IsolationFinding {
  change: IsolationChange;
  reason: ChoomBaselineModel.baselineText;
  before: IsolationEvidence | null;
  after: IsolationEvidence | null;
}

export interface IsolationInput {
  baseline: Baseline;
  sha256: ChoomBaselineModel.baselineSourceDigest;
}
