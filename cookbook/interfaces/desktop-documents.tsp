import "@typespec/json-schema";
import "./desktop.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Desktop;

// Native and platform bindings enforce UTF-8 bytes in addition to character count.
@maxLength(16777216)
scalar documentFileText extends string;

@minLength(1)
@maxLength(4096)
scalar documentFilePath extends string;

// Opaque session-local identity. It is not a host path or a durable pointer.
@pattern("^document-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[1-9][0-9]{0,19}$")
scalar documentSnapshotId extends string;

@extension("additionalProperties", false)
model CreateDocumentSnapshotRequest {
  text: documentFileText;
}

@extension("additionalProperties", false)
model DocumentSnapshotRequest {
  snapshotId: documentSnapshotId;
}

@extension("additionalProperties", false)
model ReadDocumentFileRequest {
  // An absolute native path chosen by the caller; not saved in document metadata.
  path: documentFilePath;
}

@extension("additionalProperties", false)
model ExportDocumentRequest {
  path: documentFilePath;
  text: documentFileText;

  // True requires the user's explicit replacement consent. False never replaces a file.
  overwrite: boolean;
}

@extension("additionalProperties", false)
model RetryDocumentCleanupRequest {}

union DocumentNativeStage {
  "storage",
  "export",
  "cleanup",
}

union DocumentNativeFailureCode {
  "invalid-request",
  "invalid-snapshot",
  "snapshot-limit",
  "not-found",
  "not-file",
  "limit-exceeded",
  "invalid-utf8",
  "destination-exists",
  "source-changed",
  "cleanup-failed",
  "io-error",
  "unavailable",
  "invalid-response",
}

@extension("additionalProperties", false)
model DocumentNativeFailure {
  status: "failure";
  stage: DocumentNativeStage;
  code: DocumentNativeFailureCode;

  @minLength(1)
  @maxLength(2048)
  message: string;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model CreatedDocumentSnapshot {
  status: "success";
  snapshotId: documentSnapshotId;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model ReadDocumentText {
  status: "success";
  text: documentFileText;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model ReleasedDocumentSnapshot {
  status: "success";
  released: true;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model ExportedDocument {
  status: "success";
  exported: true;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model CleanedDocumentFiles {
  status: "success";
  cleaned: true;

  @minValue(0)
  durationMs: float64;
}

union CreateDocumentSnapshotOutcome {
  CreatedDocumentSnapshot,
  DocumentNativeFailure,
}

union ReadDocumentTextOutcome {
  ReadDocumentText,
  DocumentNativeFailure,
}

union ReleaseDocumentSnapshotOutcome {
  ReleasedDocumentSnapshot,
  DocumentNativeFailure,
}

union ExportDocumentOutcome {
  ExportedDocument,
  DocumentNativeFailure,
}

union RetryDocumentCleanupOutcome {
  CleanedDocumentFiles,
  DocumentNativeFailure,
}

// Promise bindings use product-specific native commands, never arbitrary file APIs.
// At most two snapshots are retained. Failed cleanup blocks new writes until retried.
// Native storage preserves bytes; the workspace codec validates architecture meaning.
interface DocumentFileOperations {
  createDocumentSnapshot(
    request: CreateDocumentSnapshotRequest,
  ): CreateDocumentSnapshotOutcome;
  readDocumentSnapshot(
    request: DocumentSnapshotRequest,
  ): ReadDocumentTextOutcome;
  releaseDocumentSnapshot(
    request: DocumentSnapshotRequest,
  ): ReleaseDocumentSnapshotOutcome;
  readDocumentFile(request: ReadDocumentFileRequest): ReadDocumentTextOutcome;
  exportDocument(request: ExportDocumentRequest): ExportDocumentOutcome;
  retryDocumentCleanup(
    request: RetryDocumentCleanupRequest,
  ): RetryDocumentCleanupOutcome;
}
