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

export interface AnalysisCancelled {
  status: "cancelled";
}

export interface AnalysisDescriptor {
  enforcer: string;
  config: string;
  inputs: Array<string>;
}

export interface AnalysisFailure {
  status: "failure";
  stage: AnalysisStage;
  code: AnalysisFailureCode;
  message: string;
}

export type AnalysisFailureCode = "invalid-request" | "unavailable" | "unsupported" | "execution-failed" | "invalid-observations" | "invalid-document" | "source-changed" | "limit-exceeded";

export type AnalysisOutcome = AnalysisSuccess | AnalysisFailure | AnalysisCancelled;

export interface AnalysisProgress {
  stage: AnalysisStage;
  elapsedMs?: number;
}

export interface AnalysisProvenance {
  enforcer: string;
  version: string;
  config: string;
  inputs: Array<string>;
  generatedAt: string;
  scopeNotes: Array<string>;
}

export interface AnalysisRequest {
  repositorySession: string;
  components: Array<ComponentDeclaration>;
  analysis: AnalysisDescriptor;
}

export type AnalysisStage = "discovery" | "setup" | "analysis" | "conversion" | "validation" | "cleanup";

export interface AnalysisSuccess {
  status: "success";
  document: ArchitectureDocument;
}

export interface ArchitecturalLayerContract {
  analyze(request: AnalysisRequest): AnalysisOutcome;
}

export interface Architecture {
  name: string;
  nodes: Array<ArchitectureNode>;
  edges: Array<ArchitectureEdge>;
}

export interface ArchitectureBuildInput {
  name: string;
  analysis: AnalysisProvenance;
  components: Array<ComponentDeclaration>;
  observations: ArchitectureObservations;
}

export interface ArchitectureComponent {
  id: string;
  name: string;
  parent?: string;
  reportedFiles: number;
}

export interface ArchitectureDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  rule?: string;
  subjects: Array<DiagnosticSubject>;
  cycle?: Array<DiagnosticReference>;
  via?: Array<DiagnosticReference>;
  metrics?: Record<string, number>;
}

export interface ArchitectureDocument {
  schemaVersion: 1;
  name: string;
  analysis: AnalysisProvenance;
  components: Array<ArchitectureComponent>;
  relationships: Array<ComponentRelationship>;
  diagnostics: Array<ArchitectureDiagnostic>;
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
}

export interface ArchitectureNode {
  id: string;
  label: string;
}

export interface ArchitectureObservations {
  files: Array<string>;
  imports: Array<ImportObservation>;
  diagnostics: Array<ArchitectureDiagnostic>;
}

export interface Baseline {
  formatVersion: 1;
  id: baselineId;
  parentId: baselineText | null;
  components: Array<BaselineComponent>;
  interfaces: Array<BaselineInterface>;
  resources: Array<BaselineResource>;
  rules: Array<BaselineRule>;
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

export type BaselineConsumers = Array<baselineId>;

export type BaselineConsumersStatement = ProposedConsumersStatement | AcceptedConsumersStatement;

export interface BaselineInterface {
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

export type BaselineTextStatement = ProposedTextStatement | AcceptedTextStatement;

export interface ComponentDeclaration {
  id: string;
  name: string;
  parent?: string;
}

export interface ComponentRelationship {
  id: string;
  source: string;
  target: string;
  kind: "imports";
  evidence: Array<ImportEvidence>;
}

export type DiagnosticKind = "file" | "folder" | "package" | "builtin" | "unresolved" | "outside-root";

export interface DiagnosticReference {
  kind: DiagnosticKind;
  value: string;
}

export type DiagnosticRole = "source" | "target" | "subject";

export type DiagnosticSeverity = "ignored" | "info" | "warning" | "error";

export interface DiagnosticSubject {
  role: DiagnosticRole;
  kind: DiagnosticKind;
  value: string;
}

export interface ImportEvidence {
  sourceFile: string;
  targetFile: string;
  variants: Array<ImportVariant>;
}

export interface ImportObservation {
  sourceFile: string;
  targetFile: string;
  typeOnly?: boolean;
  dynamic?: boolean;
  preCompilationOnly?: boolean;
}

export interface ImportVariant {
  typeOnly?: boolean;
  dynamic?: boolean;
  preCompilationOnly?: boolean;
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

export type baselineText = string;
