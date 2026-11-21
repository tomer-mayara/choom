// Generated from TypeSpec by bun run contracts:generate. Do not edit.

export interface AcceptedAccessPointsStatement {
  value: Array<baselineText> | null;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedComponentReferenceStatement {
  value: baselineId | null;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedConsumersStatement {
  value: Array<baselineId> | null;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedEntryKindStatement {
  value: BaselineEntryKind;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedExampleStatement {
  value: BaselineExampleContent;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedInteractionStatement {
  value: BaselineInteraction;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedMembershipStatement {
  value: BaselineMembership;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedMembershipV5Statement {
  value: BaselineMembershipV5;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedNullableTextStatement {
  value: baselineText | null;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedPromisesStatement {
  value: BaselinePromises | null;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedRuleObjectStatement {
  value: BaselineRuleObject | null;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface AcceptedTextStatement {
  value: baselineText;
  status: "accepted";
  evidenceRefs: Array<baselineText>;
  acceptanceRef: baselineText;
}

export interface BaselineAcceptDecision {
  action: "accept";
  itemId: baselineId;
  field: baselineText;
}

export type BaselineAccessPoints = Array<baselineText>;

export type BaselineAccessPointsStatement = ProposedAccessPointsStatement | AcceptedAccessPointsStatement;

export interface BaselineComponent {
  id: baselineId;
  name: baselineText;
  purpose: BaselineTextStatement;
  membership: BaselineMembershipStatement;
  groupingReason: BaselineTextStatement;
  parent?: BaselineComponentReferenceStatement;
}

export type BaselineComponentReferenceStatement = ProposedComponentReferenceStatement | AcceptedComponentReferenceStatement;

export interface BaselineComponentV5 {
  id: baselineId;
  name: baselineText;
  purpose: BaselineTextStatement;
  membership: BaselineMembershipV5Statement;
  groupingReason: BaselineTextStatement;
  parent?: BaselineComponentReferenceStatement;
}

export type BaselineConsumers = Array<baselineId>;

export type BaselineConsumersStatement = ProposedConsumersStatement | AcceptedConsumersStatement;

export interface BaselineCorrectDecision {
  action: "correct";
  itemId: baselineId;
  field: baselineText;
  oldValue: BaselineDecisionValue;
  newValue: BaselineDecisionValue;
}

export interface BaselineDecider {
  name: baselineText;
  kind: "human";
}

export type BaselineDecision = BaselineAcceptDecision | BaselineCorrectDecision;

export interface BaselineDecisionObject {
  [key: string]: BaselineDecisionValue;
}

export type BaselineDecisionValue = string | boolean | number | null | BaselineDecisionObject | Array<BaselineDecisionValue>;

export interface BaselineDecisions {
  formatVersion: 1;
  id: baselineDecisionsId;
  baselineRef: baselineId;
  baselineDigest: baselineFileDigest;
  decider: BaselineDecider;
  decidedAt: baselineDecisionTime;
  entries: Array<BaselineDecision>;
}

export interface BaselineDocumentation {
  summary: BaselineNullableTextStatement;
  entries: Array<BaselineDocumentedEntry>;
  sourceNotes: Array<BaselineSourceNote>;
}

export interface BaselineDocumentationExample {
  id: baselineId;
  name: baselineText;
  basis: "illustrative" | "source-reviewed";
  content: BaselineExampleStatement;
}

export interface BaselineDocumentedEntry {
  id: baselineId;
  name: baselineText;
  accessPoint: baselineText;
  kind: BaselineEntryKindStatement;
  description: BaselineNullableTextStatement;
  signature?: BaselineNullableTextStatement;
  interaction?: BaselineInteractionStatement;
  examples: Array<BaselineDocumentationExample>;
}

export type BaselineEntryKind = "function" | "command" | "type" | "data" | "message" | "workflow" | null;

export type BaselineEntryKindStatement = ProposedEntryKindStatement | AcceptedEntryKindStatement;

export interface BaselineExampleContent {
  text: baselineText;
  input?: baselineText;
  result?: BaselineExampleResult;
}

export interface BaselineExampleResult {
  text: baselineText;
  summary: baselineText;
  scope: "complete" | "excerpt";
}

export type BaselineExampleStatement = ProposedExampleStatement | AcceptedExampleStatement;

export interface BaselineInteraction {
  input: baselineText | null;
  success: baselineText | null;
  failures: baselineText | null;
  effects: baselineText | null;
}

export type BaselineInteractionStatement = ProposedInteractionStatement | AcceptedInteractionStatement;

export interface BaselineInterface {
  id: baselineId;
  name: baselineText;
  owner: BaselineComponentReferenceStatement;
  publicAccess: BaselineAccessPointsStatement;
  allowedConsumers: BaselineConsumersStatement;
  promises: BaselinePromisesStatement;
  documentation?: BaselineDocumentation;
}

export interface BaselineInterfaceV1 {
  id: baselineId;
  name: baselineText;
  owner: BaselineComponentReferenceStatement;
  publicAccess: BaselineAccessPointsStatement;
  allowedConsumers: BaselineConsumersStatement;
  promises: BaselinePromisesStatement;
}

export interface BaselineMembership {
  paths: Array<baselineSelector>;
  excludePaths?: Array<baselineSelector>;
}

export type BaselineMembershipStatement = ProposedMembershipStatement | AcceptedMembershipStatement;

export interface BaselineMembershipV5 {
  paths: Array<baselineSelector>;
  excludePaths?: Array<baselineSelector>;
  symbols?: Array<BaselineSymbolSelector>;
}

export type BaselineMembershipV5Statement = ProposedMembershipV5Statement | AcceptedMembershipV5Statement;

export type BaselineNullableTextStatement = ProposedNullableTextStatement | AcceptedNullableTextStatement;

export interface BaselinePromises {
  behavior: baselineText | null;
  data: baselineText | null;
  errors: baselineText | null;
  lifecycle: baselineText | null;
}

export type BaselinePromisesStatement = ProposedPromisesStatement | AcceptedPromisesStatement;

export interface BaselineResource {
  id: baselineId;
  name: baselineText;
  identity: BaselineNullableTextStatement;
  owner: BaselineComponentReferenceStatement;
  accessRules: BaselineNullableTextStatement;
}

export interface BaselineRule {
  id: baselineId;
  name: baselineText;
  subject: BaselineRuleObjectStatement;
  expected: BaselineRuleObjectStatement;
  check: BaselineRuleObjectStatement;
}

export interface BaselineRuleObject {
  [key: string]: BaselineRuleValue;
}

export type BaselineRuleObjectStatement = ProposedRuleObjectStatement | AcceptedRuleObjectStatement;

export type BaselineRuleValue = string | boolean | number | null | BaselineRuleObject | Array<BaselineRuleValue>;

export interface BaselineSourceAssessment {
  interfaceId: baselineId;
  scope: baselineText;
  evidenceRefs: Array<baselineText>;
  limitations: Array<baselineText>;
  uses: Array<BaselineSourceUse>;
  sourceNotes: Array<BaselineSourceNote>;
}

export interface BaselineSourceLocation {
  snapshotRef: baselineText;
  path: baselineText;
  sha256: baselineSourceDigest;
  lines: Array<baselineSourceLine>;
}

export interface BaselineSourceNote {
  evidenceRef: baselineText;
  description: baselineText;
  location?: BaselineSourceLocation;
}

export interface BaselineSourceUsage {
  snapshotRef: baselineText;
  mappingRef: baselineText;
  assessments: Array<BaselineSourceAssessment>;
}

export interface BaselineSourceUse {
  id: baselineId;
  consumerId: baselineId | null;
  kind: "value" | "type";
  context: "application" | "tooling" | "test" | "unknown";
  description: baselineText;
  callerRef: baselineText;
  evidenceRefs: Array<baselineText>;
  accessPoint?: baselineText;
  entryId?: baselineId;
}

export interface BaselineSymbolSelector {
  path: baselineSymbolPath;
  symbol: baselineSymbolName;
}

export interface BaselineSystemEntryPoint {
  id: baselineId;
  kind: "startup" | "external";
  label: baselineText;
  path: baselineText;
  componentId: baselineId;
  evidenceRefs: Array<baselineText>;
  source?: BaselineSystemEntrySource;
  interfaceId?: baselineId;
  entryId?: baselineId;
}

export interface BaselineSystemEntryPoints {
  snapshotRef: baselineText;
  mappingRef: baselineText;
  scope: baselineText;
  evidenceRefs: Array<baselineText>;
  limitations: Array<baselineText>;
  entries: Array<BaselineSystemEntryPoint>;
}

export interface BaselineSystemEntrySource {
  evidenceRef: baselineText;
  location: BaselineSourceLocation;
}

export type BaselineTextStatement = ProposedTextStatement | AcceptedTextStatement;

export interface BaselineV1 {
  formatVersion: 1;
  id: baselineId;
  parentId: baselineText | null;
  components: Array<BaselineComponent>;
  interfaces: Array<BaselineInterfaceV1>;
  resources: Array<BaselineResource>;
  rules: Array<BaselineRule>;
}

export interface BaselineV2 {
  formatVersion: 2;
  id: baselineId;
  parentId: baselineText | null;
  components: Array<BaselineComponent>;
  interfaces: Array<BaselineInterface>;
  resources: Array<BaselineResource>;
  rules: Array<BaselineRule>;
}

export interface BaselineV3 {
  formatVersion: 3;
  id: baselineId;
  parentId: baselineText | null;
  components: Array<BaselineComponent>;
  interfaces: Array<BaselineInterface>;
  resources: Array<BaselineResource>;
  rules: Array<BaselineRule>;
  sourceUsage?: BaselineSourceUsage;
}

export interface BaselineV4 {
  formatVersion: 4;
  id: baselineId;
  parentId: baselineText | null;
  components: Array<BaselineComponent>;
  interfaces: Array<BaselineInterface>;
  resources: Array<BaselineResource>;
  rules: Array<BaselineRule>;
  sourceUsage?: BaselineSourceUsage;
  systemEntryPoints?: BaselineSystemEntryPoints;
}

export interface BaselineV5 {
  formatVersion: 5;
  id: baselineId;
  parentId: baselineText | null;
  components: Array<BaselineComponentV5>;
  interfaces: Array<BaselineInterface>;
  resources: Array<BaselineResource>;
  rules: Array<BaselineRule>;
  sourceUsage?: BaselineSourceUsage;
  systemEntryPoints?: BaselineSystemEntryPoints;
}

export interface DiscoveryGap {
  id: discoveryReference;
  kind: discoveryReference;
  subjectRefs: Array<discoveryReference>;
  reason: discoveryText;
  evidenceRefs: Array<discoveryReference>;
}

export interface DiscoveryQuestion {
  id: discoveryReference;
  subjectRefs: Array<discoveryReference>;
  text: discoveryText;
  evidenceRefs: Array<discoveryReference>;
}

export interface DiscoveryResult {
  formatVersion: 2;
  kind: "architecture-discovery";
  baselineRef: baselineId;
  baselineDigest: baselineFileDigest;
  runRef: unknown;
  entryAnalysisRef: unknown;
  codeMappingRef: unknown;
  dependenciesRef: unknown;
  resourceAccessRef: unknown;
  overview: unknown;
  inspectedPaths: unknown;
  questions: Array<DiscoveryQuestion>;
  gaps: Array<DiscoveryGap>;
}

export interface ProposedAccessPointsStatement {
  value: Array<baselineText> | null;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedComponentReferenceStatement {
  value: baselineId | null;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedConsumersStatement {
  value: Array<baselineId> | null;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedEntryKindStatement {
  value: BaselineEntryKind;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedExampleStatement {
  value: BaselineExampleContent;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedInteractionStatement {
  value: BaselineInteraction;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedMembershipStatement {
  value: BaselineMembership;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedMembershipV5Statement {
  value: BaselineMembershipV5;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedNullableTextStatement {
  value: baselineText | null;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedPromisesStatement {
  value: BaselinePromises | null;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedRuleObjectStatement {
  value: BaselineRuleObject | null;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export interface ProposedTextStatement {
  value: baselineText;
  status: "proposed";
  evidenceRefs: Array<baselineText>;
}

export type baselineDecisionTime = string;

export type baselineDecisionsId = baselineId;

export type baselineFileDigest = string;

export type baselineId = string;

export type baselineSelector = baselineText;

export type baselineSourceDigest = string;

export type baselineSourceLine = number;

export type baselineSymbolName = baselineText;

export type baselineSymbolPath = baselineText;

export type baselineText = string;

export type discoveryReference = string;

export type discoveryText = string;
