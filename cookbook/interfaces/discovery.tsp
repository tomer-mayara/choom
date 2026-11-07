import "@typespec/json-schema";
import "./architecture.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Discovery;

@extension("additionalProperties", false)
model ManifestArtifact {
  @minLength(1)
  path: string;
}

// Root analyzer selection is semantic. Incomplete metadata remains readable so
// discovery can report a specific error. Child metadata selects no extra job.
@extension("additionalProperties", false)
model ManifestArchitectureArtifact {
  @minLength(1)
  path: string;

  @minLength(1)
  enforcer?: string;

  @maxItems(128)
  inputs?: string[];
}

@extension("additionalProperties", false)
model ManifestArtifacts {
  @maxItems(128)
  behavior?: ManifestArtifact[];

  @maxItems(128)
  observability?: ManifestArtifact[];

  @maxItems(128)
  architecture?: ManifestArchitectureArtifact[];

  @maxItems(128)
  contracts?: ManifestArtifact[];
}

@extension("additionalProperties", false)
model ManifestChild {
  @minLength(1)
  name: string;

  @minLength(1)
  path: string;
}

// Only linked declarations create components. Artifact and source directories
// remain part of their nearest owning declaration.
@extension("additionalProperties", false)
model ComponentManifest {
  @minLength(1)
  name: string;

  @minLength(1)
  description?: string;

  artifacts?: ManifestArtifacts;

  @maxItems(128)
  children?: ManifestChild[];
}

@extension("additionalProperties", false)
model DiscoveryRequest {
  // Native absolute path selected by the user; at most 4096 UTF-8 bytes.
  @minLength(1)
  @maxLength(4096)
  rootPath: string;
}

@extension("additionalProperties", false)
model DiscoveredRepository {
  @minLength(1)
  repositorySession: string;

  @minLength(1)
  name: string;

  @minItems(1)
  @maxItems(256)
  components: Choom.Domain.ComponentDeclaration[];

  analysis: Choom.Domain.AnalysisDescriptor;
}

union DiscoveryFailureCode {
  "invalid-root",
  "manifest-unreadable",
  "invalid-manifest",
  "missing-analyzer",
  "multiple-analyzers",
  "unsupported-enforcer",
  "invalid-input",
  "invalid-reference",
  "duplicate-component",
  "name-mismatch",
  "limit-exceeded",
  "access-failed",

  // Failure cleanup did not release the repository session. No owner is transferred.
  "cleanup-failed",
}

@extension("additionalProperties", false)
model DiscoverySuccess {
  status: "success";
  repository: DiscoveredRepository;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model DiscoveryFailure {
  status: "failure";
  stage: "discovery";
  code: DiscoveryFailureCode;

  @minLength(1)
  message: string;

  @minValue(0)
  durationMs: float64;
}

union DiscoveryOutcome {
  DiscoverySuccess,
  DiscoveryFailure,
}

// The workspace binds asynchronous execution. A success transfers the native
// repository session to its caller; discovery closes it on failure.
interface DiscoveryOperations {
  discover(request: DiscoveryRequest): DiscoveryOutcome;
}
