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

export type Baseline = BaselineV1 | BaselineV2;

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

export type BaselineConsumers = Array<baselineId>;

export type BaselineConsumersStatement = ProposedConsumersStatement | AcceptedConsumersStatement;

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

export interface DuplicationBaselineBinding {
  id: duplicationReference;
  formatVersion: 1 | 2;
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
  lines: Array<baselineSourceLine>;
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

export type baselineId = string;

export type baselineSelector = baselineText;

export type baselineSourceDigest = string;

export type baselineSourceLine = number;

export type baselineText = string;

export type duplicationCount = number;

export type duplicationDigest = string;

export type duplicationReference = string;

export type duplicationScore = number;

export type duplicationText = string;
