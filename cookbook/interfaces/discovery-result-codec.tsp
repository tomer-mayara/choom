import "@typespec/json-schema";
import "./baseline-codec.tsp";
import "./discovery-result.tsp";

using TypeSpec.JsonSchema;

namespace Choom.Documents;

union DiscoveryDecodeFailureCode {
  "unsupported-version",
  "invalid-encoding",
  "invalid-document",
  "limit-exceeded",
  "baseline-mismatch",
}

@extension("additionalProperties", false)
model DecodedDiscoveryResult {
  status: "success";
  result: Choom.BaselineModel.DiscoveryResult;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model DiscoveryDecodeFailure {
  status: "failure";
  stage: "decoding";
  code: DiscoveryDecodeFailureCode;

  @minLength(1)
  @maxLength(2048)
  message: string;

  @minValue(0)
  durationMs: float64;
}

union DecodeDiscoveryResultOutcome {
  DecodedDiscoveryResult,
  DiscoveryDecodeFailure,
}

// Reads the selected discovery result only. It does not open the files that
// the result names, and it binds the result to the open baseline file by its ID
// and the SHA-256 of its bytes.
interface DiscoveryResultCodec {
  decode(
    text: baselineYaml,
    baseline: Choom.BaselineModel.Baseline,
    baselineSha256: Choom.BaselineModel.baselineFileDigest,
  ): DecodeDiscoveryResultOutcome;
}
