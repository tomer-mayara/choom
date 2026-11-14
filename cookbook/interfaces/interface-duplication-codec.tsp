import "@typespec/json-schema";
import "./interface-duplication.tsp";

using TypeSpec.JsonSchema;

namespace Choom.Documents;

union DuplicationDecodeFailureCode {
  "unsupported-version",
  "invalid-encoding",
  "invalid-document",
  "limit-exceeded",
  "baseline-mismatch",
}

@extension("additionalProperties", false)
model DecodedDuplicationReport {
  status: "success";
  report: Choom.Domain.DuplicationReport;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model DuplicationDecodeFailure {
  status: "failure";
  stage: "decoding";
  code: DuplicationDecodeFailureCode;

  @minLength(1)
  @maxLength(2048)
  message: string;

  @minValue(0)
  durationMs: float64;
}

union DecodeDuplicationReportOutcome {
  DecodedDuplicationReport,
  DuplicationDecodeFailure,
}

interface DuplicationReportCodec {
  decode(
    text: baselineYaml,
    baseline: Choom.Domain.Baseline,
    baselineSha256: Choom.Domain.duplicationDigest,
  ): DecodeDuplicationReportOutcome;
}
