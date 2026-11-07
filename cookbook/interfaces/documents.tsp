import "@typespec/json-schema";
import "./architecture.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Documents;

// Runtime also enforces 16777216 UTF-8 bytes, depth 32, and 250000 structure nodes.
// YAML text is limited to 1500000 lexer tokens, 250000 flow commas, and 250000 line breaks.
// LF, bare CR, and CRLF each count as one line break.
@maxLength(16777216)
scalar architectureYaml extends string;

union DocumentCodecFailureCode {
  "unsupported-version",
  "invalid-encoding",
  "invalid-document",
  "limit-exceeded",
}

@extension("additionalProperties", false)
model DocumentCodecFailure {
  status: "failure";
  stage: "encoding" | "decoding";
  code: DocumentCodecFailureCode;

  @minLength(1)
  @maxLength(2048)
  message: string;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model EncodedArchitectureDocument {
  status: "success";
  text: architectureYaml;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model DecodedArchitectureDocument {
  status: "success";
  document: Choom.Domain.ArchitectureDocument;

  @minValue(0)
  durationMs: float64;
}

union EncodeArchitectureOutcome {
  EncodedArchitectureDocument,
  DocumentCodecFailure,
}

union DecodeArchitectureOutcome {
  DecodedArchitectureDocument,
  DocumentCodecFailure,
}

// Pure synchronous format operations. No source lookup, analyzer, or presentation data.
interface ArchitectureDocumentCodec {
  encode(
    document: Choom.Domain.ArchitectureDocument,
  ): EncodeArchitectureOutcome;
  decode(text: architectureYaml): DecodeArchitectureOutcome;
}
