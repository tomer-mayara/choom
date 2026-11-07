// Generated from TypeSpec by bun run contracts:generate. Do not edit.

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
