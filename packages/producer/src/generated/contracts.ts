// Generated from TypeSpec by bun run contracts:generate. Do not edit.

import type * as ChoomBaselineModel from "@choom/baseline-model/contracts";

export interface BehaviorEntryCallRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  entryKind: behaviorEntryKind;
  kind: "call";
  importName: behaviorEntryModuleName;
  callPath: behaviorEntryCallPath;
  nameArgument: behaviorEntryArgument | null;
  handlerArgument: behaviorEntryArgument | "last" | null;
  nameCall?: behaviorEntryNameCall;
  sameValueMethods?: Array<behaviorEntryMethodName>;
}

export interface BehaviorEntryPackageBinRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  entryKind: behaviorEntryKind;
  kind: "package-bin";
}

export type BehaviorEntryRule = BehaviorEntryCallRule | BehaviorEntrySettingsLiteralRule | BehaviorEntryPackageBinRule;

export interface BehaviorEntryRuleList {
  formatVersion: 1;
  rules: Array<BehaviorEntryRule>;
}

export interface BehaviorEntrySettingsLiteralRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  entryKind: behaviorEntryKind;
  kind: "settings-literal";
  fileGlob: behaviorEntryFileGlob;
  propertyPath: behaviorEntryPropertyPath;
}

export interface CandidateKnipClaim {
  mode: "normal" | "production";
  receiptRef: string;
  outcome: "unknown" | "reported";
}

export interface FrozenBaselineReference {
  artifactRef: "reference-baseline-001";
  sha256: ChoomBaselineModel.baselineSourceDigest;
}

export type InspectionClue = RegistrationClue | UnresolvedLoaderClue;

export interface RegistrationClue {
  kind: "registration";
  operation: string;
  context: ChoomBaselineModel.BoundaryRole;
  sourceRef: string;
}

export interface RequiredGaps {
  formatVersion: 1;
  gaps: Array<ChoomBaselineModel.DiscoveryGap>;
}

export interface ResourceAccessRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  resourceKind: resourceAccessKind;
  operation: resourceAccessOperation;
  importName: behaviorEntryModuleName;
  callPath: behaviorEntryCallPath;
  typePath: resourceAccessTypePath | null;
  nameCall: resourceAccessCall;
  nameArgument: behaviorEntryArgument;
}

export interface ResourceAccessRuleList {
  formatVersion: 1;
  rules: Array<ResourceAccessRule>;
}

export interface ReviewedRoleUse {
  role: ChoomBaselineModel.BoundaryRole;
  evidenceRefs: Array<string>;
}

export interface RunArtifact {
  path: string;
  sha256: string;
}

export interface RunCoverage {
  inventoried: string;
  inspected: string;
  recorded: string;
  pending: string;
}

export interface RunManifest {
  formatVersion: 1;
  id: string;
  mode: "A";
  status: "in-progress" | "completed";
  projectKey: ChoomBaselineModel.baselineText;
  referenceBaseline: FrozenBaselineReference | null;
  progress: RunProgress;
  snapshot: RunSnapshot;
  coverage: RunCoverage;
  artifacts: Record<string, RunArtifact>;
  baselineRef?: ChoomBaselineModel.baselineId;
  discoveryRef?: string;
  completedAt?: string;
}

export interface RunProgress {
  inventory: "complete";
  entryAnalysis?: "complete";
  inspectionPriorities?: "pending" | "complete";
  componentRecovery?: "complete";
  remainingCode?: "complete";
  baselineRecovery: "pending" | "complete";
}

export interface RunProject {
  projectKey: ChoomBaselineModel.baselineText;
  referenceBaseline: FrozenBaselineReference | null;
}

export interface RunSnapshot {
  id: string;
  root: "snapshot";
  inventoryRef: string;
  exclusions: "exclusions.txt";
  captureMethod: string;
  captureLimit: string;
  sourcePath: string;
  capturedAt: string;
}

export interface UnitUseReview {
  unitScope: ChoomBaselineModel.BoundaryRole | "mixed";
  basis: "declaration" | "complete-review" | "partial-review";
  uses: Array<ReviewedRoleUse>;
  evidenceRefs: Array<string>;
  limits: Array<string>;
}

export interface UnresolvedLoaderClue {
  kind: "unresolved-loader";
  context: "unknown";
  sourceRef: string;
  matchRef: string;
  expression: string;
  missingBinding: string;
}

export type behaviorEntryArgument = number;

export type behaviorEntryCallPath = string;

export type behaviorEntryFileGlob = string;

export type behaviorEntryKind = string;

export type behaviorEntryMethodName = string;

export type behaviorEntryModuleName = string;

export type behaviorEntryNameCall = number;

export type behaviorEntryPropertyPath = string;

export type behaviorEntryRuleId = string;

export type behaviorEntryRuleVersion = number;

export type behaviorEntryText = string;

export type resourceAccessCall = number;

export type resourceAccessKind = string;

export type resourceAccessOperation = string;

export type resourceAccessTypePath = string;
