import "@typespec/json-schema";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Desktop;

scalar DesktopAvailability extends boolean;

union DirectorySelection {
  string,
  null,
}

// Operations describe logical results. The adapter keeps its synchronous
// detection and asynchronous picker behavior, including rejection.
interface DesktopOperations {
  isDesktop(): DesktopAvailability;
  selectProjectDirectory(): DirectorySelection;
}

// The native boundary accepts at most 4096 UTF-8 bytes for paths. JSON Schema
// also limits character count; runtime validation enforces the byte limit.
@extension("additionalProperties", false)
model OpenRepositoryRequest {
  @minLength(1)
  @maxLength(4096)
  rootPath: string;
}

@extension("additionalProperties", false)
model ReadRepositoryTextRequest {
  @minLength(1)
  repositorySession: string;

  @minLength(1)
  @maxLength(4096)
  path: string;
}

@extension("additionalProperties", false)
model ResolveRepositoryPathsRequest {
  @minLength(1)
  repositorySession: string;

  @minLength(1)
  @maxLength(4096)
  base: string;

  // Inputs are relative to base or native absolute paths. Manifest discovery
  // accepts only literal relative references before reaching this boundary.
  @minItems(1)
  @maxItems(128)
  paths: string[];
}

@extension("additionalProperties", false)
model CloseRepositoryRequest {
  @minLength(1)
  repositorySession: string;
}

@extension("additionalProperties", false)
model RepositorySession {
  @minLength(1)
  repositorySession: string;
}

@extension("additionalProperties", false)
model RepositoryText {
  // Canonical repository-relative file path, with forward slashes.
  @minLength(1)
  @maxLength(4096)
  path: string;

  // Native and frontend boundaries also enforce 262144 UTF-8 bytes.
  @maxLength(262144)
  text: string;
}

@extension("additionalProperties", false)
model InternalRepositoryPath {
  location: "inside";

  // Canonical repository-relative path. The selected root is represented by '.'.
  @minLength(1)
  @maxLength(4096)
  path: string;

  kind: "file" | "directory";
}

@extension("additionalProperties", false)
model ExternalRepositoryPath {
  location: "outside";

  // Opaque session-local identity, never an absolute host path.
  @minLength(1)
  reference: string;
}

union ResolvedRepositoryPath {
  InternalRepositoryPath,
  ExternalRepositoryPath,
}

@extension("additionalProperties", false)
model RepositoryPaths {
  // One result for each requested path, in the same order.
  @minItems(1)
  @maxItems(128)
  paths: ResolvedRepositoryPath[];
}

@extension("additionalProperties", false)
model ClosedRepository {
  closed: true;
}

union RepositoryFailureCode {
  "invalid-request",
  "invalid-session",
  "not-found",
  "not-directory",
  "not-file",
  "outside-root",
  "limit-exceeded",
  "invalid-utf8",
  "access-denied",
  "io-error",
  "source-changed",
  "unavailable",
  "invalid-response",
}

@extension("additionalProperties", false)
model RepositoryFailure {
  status: "failure";
  code: RepositoryFailureCode;

  @minLength(1)
  message: string;
}

@extension("additionalProperties", false)
model OpenRepositorySuccess {
  status: "success";
  value: RepositorySession;
}

@extension("additionalProperties", false)
model ReadRepositoryTextSuccess {
  status: "success";
  value: RepositoryText;
}

@extension("additionalProperties", false)
model ResolveRepositoryPathsSuccess {
  status: "success";
  value: RepositoryPaths;
}

@extension("additionalProperties", false)
model CloseRepositorySuccess {
  status: "success";
  value: ClosedRepository;
}

union OpenRepositoryOutcome {
  OpenRepositorySuccess,
  RepositoryFailure,
}

union ReadRepositoryTextOutcome {
  ReadRepositoryTextSuccess,
  RepositoryFailure,
}

union ResolveRepositoryPathsOutcome {
  ResolveRepositoryPathsSuccess,
  RepositoryFailure,
}

union CloseRepositoryOutcome {
  CloseRepositorySuccess,
  RepositoryFailure,
}

// These logical operations are asynchronous at the platform boundary. Native
// commands own canonical roots, bounded reads, and session cleanup.
interface RepositoryOperations {
  openRepository(request: OpenRepositoryRequest): OpenRepositoryOutcome;
  readRepositoryText(
    request: ReadRepositoryTextRequest,
  ): ReadRepositoryTextOutcome;
  resolveRepositoryPaths(
    request: ResolveRepositoryPathsRequest,
  ): ResolveRepositoryPathsOutcome;
  closeRepository(request: CloseRepositoryRequest): CloseRepositoryOutcome;
}
