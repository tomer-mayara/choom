import "@typespec/json-schema";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Domain;

model ArchitectureNode {
  @minLength(1)
  id: string;

  @minLength(1)
  label: string;
}

model ArchitectureEdge {
  @minLength(1)
  id: string;

  @minLength(1)
  source: string;

  @minLength(1)
  target: string;
}

// Runtime validation also enforces unique IDs and valid edge references.
model Architecture {
  @minLength(1)
  name: string;

  @minItems(1)
  nodes: ArchitectureNode[];

  edges: ArchitectureEdge[];
}

// A component is declared by component.yaml. It can own several subdirectories.
@extension("additionalProperties", false)
model ComponentDeclaration {
  @minLength(1)
  id: string;

  @minLength(1)
  name: string;

  @minLength(1)
  parent?: string;
}

@extension("additionalProperties", false)
model ArchitectureComponent {
  @minLength(1)
  id: string;

  @minLength(1)
  name: string;

  @minLength(1)
  parent?: string;

  @minValue(0)
  @maxValue(9007199254740991)
  reportedFiles: integer;
}

// Config and inputs are repository-relative paths, not host paths.
@extension("additionalProperties", false)
model AnalysisDescriptor {
  @minLength(1)
  enforcer: string;

  @minLength(1)
  config: string;

  @minItems(1)
  inputs: string[];
}

@extension("additionalProperties", false)
model AnalysisProvenance {
  @minLength(1)
  enforcer: string;

  @minLength(1)
  version: string;

  @minLength(1)
  config: string;

  @minItems(1)
  inputs: string[];

  @format("date-time")
  // Use uppercase separators and seconds 00–59, with an optional fraction and
  // either Z or a colon-separated numeric offset. Leap seconds are not stored.
  @pattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$")
  generatedAt: string;

  scopeNotes: string[];
}

// An absent flag means that the analyzer did not report it.
@extension("additionalProperties", false)
model ImportVariant {
  typeOnly?: boolean;
  dynamic?: boolean;
  preCompilationOnly?: boolean;
}

@extension("additionalProperties", false)
model ImportEvidence {
  @minLength(1)
  sourceFile: string;

  @minLength(1)
  targetFile: string;

  @minItems(1)
  @uniqueItems
  variants: ImportVariant[];
}

@extension("additionalProperties", false)
model ComponentRelationship {
  @minLength(1)
  id: string;

  @minLength(1)
  source: string;

  @minLength(1)
  target: string;

  kind: "imports";

  @minItems(1)
  evidence: ImportEvidence[];
}

union DiagnosticKind {
  "file",
  "folder",
  "package",
  "builtin",
  "unresolved",
  "outside-root",
}

union DiagnosticRole {
  "source",
  "target",
  "subject",
}

union DiagnosticSeverity {
  "ignored",
  "info",
  "warning",
  "error",
}

@extension("additionalProperties", false)
model DiagnosticReference {
  kind: DiagnosticKind;

  @minLength(1)
  value: string;
}

@extension("additionalProperties", false)
model DiagnosticSubject {
  role: DiagnosticRole;
  kind: DiagnosticKind;

  @minLength(1)
  value: string;
}

@extension("additionalProperties", false)
model ArchitectureDiagnostic {
  @minLength(1)
  code: string;

  severity: DiagnosticSeverity;

  @minLength(1)
  message: string;

  @minLength(1)
  rule?: string;

  subjects: DiagnosticSubject[];
  cycle?: DiagnosticReference[];
  via?: DiagnosticReference[];
  metrics?: Record<float64>;
}

// This portable document contains semantic data only. Runtime validation checks
// canonical paths, declaration ownership, graph references, and unique evidence.
@extension("additionalProperties", false)
model ArchitectureDocument {
  schemaVersion: 1;

  @minLength(1)
  name: string;

  analysis: AnalysisProvenance;

  @minItems(1)
  components: ArchitectureComponent[];

  relationships: ComponentRelationship[];
  diagnostics: ArchitectureDiagnostic[];
}

@extension("additionalProperties", false)
model ImportObservation {
  @minLength(1)
  sourceFile: string;

  @minLength(1)
  targetFile: string;

  typeOnly?: boolean;
  dynamic?: boolean;
  preCompilationOnly?: boolean;
}

// Files are the analyzer's complete reported local-file inventory, including
// reference-only files. Duplicate observations are allowed before aggregation.
@extension("additionalProperties", false)
model ArchitectureObservations {
  files: string[];
  imports: ImportObservation[];
  diagnostics: ArchitectureDiagnostic[];
}

@extension("additionalProperties", false)
model ArchitectureBuildInput {
  @minLength(1)
  name: string;

  analysis: AnalysisProvenance;

  @minItems(1)
  components: ComponentDeclaration[];

  observations: ArchitectureObservations;
}

@extension("additionalProperties", false)
model AnalysisRequest {
  // Opaque session reference resolved only by the desktop boundary.
  @minLength(1)
  repositorySession: string;

  @minItems(1)
  components: ComponentDeclaration[];

  analysis: AnalysisDescriptor;
}

union AnalysisStage {
  "discovery",
  "setup",
  "analysis",
  "conversion",
  "validation",
}

union AnalysisFailureCode {
  "invalid-request",
  "unavailable",
  "unsupported",
  "execution-failed",
  "invalid-observations",
  "invalid-document",
  "source-changed",
  "limit-exceeded",
}

@extension("additionalProperties", false)
model AnalysisProgress {
  stage: AnalysisStage;
}

@extension("additionalProperties", false)
model AnalysisSuccess {
  status: "success";
  document: ArchitectureDocument;
}

@extension("additionalProperties", false)
model AnalysisFailure {
  status: "failure";
  stage: AnalysisStage;
  code: AnalysisFailureCode;

  @minLength(1)
  message: string;
}

@extension("additionalProperties", false)
model AnalysisCancelled {
  status: "cancelled";
}

union AnalysisOutcome {
  AnalysisSuccess,
  AnalysisFailure,
  AnalysisCancelled,
}

// Promise, cancellation, and progress controls are bound in TypeScript. This
// operation defines only data crossing the strategy boundary.
interface ArchitecturalLayerContract {
  analyze(request: AnalysisRequest): AnalysisOutcome;
}
