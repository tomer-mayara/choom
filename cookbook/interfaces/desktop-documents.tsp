import "@typespec/json-schema";
import "./desktop.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Desktop;

// Native and platform bindings enforce UTF-8 bytes in addition to character count.
@maxLength(16777216)
scalar documentFileText extends string;

@minLength(64)
@maxLength(64)
@pattern("^[a-f0-9]{64}$")
scalar documentFileDigest extends string;

@minLength(1)
@maxLength(4096)
scalar documentFilePath extends string;

@extension("additionalProperties", false)
model ReadDocumentFileRequest {
  // An absolute native path chosen by the caller; not saved in document metadata.
  path: documentFilePath;
}

union DocumentNativeStage {
  "storage",
}

union DocumentNativeFailureCode {
  "invalid-request",
  "not-found",
  "not-file",
  "limit-exceeded",
  "invalid-utf8",
  "source-changed",
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
model ReadDocumentText {
  status: "success";
  text: documentFileText;

  // SHA-256 of the bounded file bytes before UTF-8 decoding.
  sha256: documentFileDigest;

  @minValue(0)
  durationMs: float64;
}

union ReadDocumentTextOutcome {
  ReadDocumentText,
  DocumentNativeFailure,
}

// The selected file is read without a cache, snapshot, or write operation.
// Native reading preserves bytes; the workspace codec validates baseline meaning.
interface DocumentFileOperations {
  readDocumentFile(request: ReadDocumentFileRequest): ReadDocumentTextOutcome;
}
