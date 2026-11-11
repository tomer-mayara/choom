import "@typespec/json-schema";
import "./baseline.tsp";
import "./documents.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Documents;

// The decoder also enforces the shared YAML byte, structure, and token limits.
@maxLength(16777216)
scalar baselineYaml extends string;

@extension("additionalProperties", false)
model DecodedBaseline {
  status: "success";
  baseline: Choom.Domain.Baseline;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model BaselineDecodeFailure {
  status: "failure";
  stage: "decoding";
  code: DocumentCodecFailureCode;

  @minLength(1)
  @maxLength(2048)
  message: string;

  @minValue(0)
  durationMs: float64;
}

union DecodeBaselineOutcome {
  DecodedBaseline,
  BaselineDecodeFailure,
}

// Reads recorded data only. No source lookup, evidence lookup, or layout.
interface BaselineCodec {
  decode(text: baselineYaml): DecodeBaselineOutcome;
}
