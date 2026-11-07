import "@typespec/json-schema";
import "./architecture.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.DepCruiser;

// The JSON payload remains an upstream dependency-cruiser protocol. Runtime
// parsing validates the supported report subset and its graph semantics.
@extension("additionalProperties", false)
model CompletedDepCruiserReport {
  // Runtime also limits the report to 16777216 UTF-8 bytes.
  @minLength(1)
  @maxLength(16777216)
  json: string;

  @minLength(1)
  version: string;

  // The producing process runs at the selected repository session root.
  workingDirectory: ".";

  @format("date-time")
  @pattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$")
  generatedAt: string;
}

@extension("additionalProperties", false)
model DepCruiserConversionRequest {
  request: Choom.Domain.AnalysisRequest;
  completed: CompletedDepCruiserReport;
}

union DepCruiserConversionOutcome {
  Choom.Domain.AnalysisSuccess,
  Choom.Domain.AnalysisFailure,
}

// The implementation binds this operation asynchronously and borrows the
// request's session. Its caller retains responsibility for closing the session.
interface DepCruiserConversionOperations {
  convert(input: DepCruiserConversionRequest): DepCruiserConversionOutcome;
}

@extension("additionalProperties", false)
model DepCruiserExecutionRequest {
  @minLength(1)
  repositorySession: string;

  @minLength(1)
  @maxLength(4096)
  config: string;

  @minItems(1)
  @maxItems(128)
  inputs: string[];
}

@extension("additionalProperties", false)
model DepCruiserExecutionCompleted {
  status: "completed";
  report: CompletedDepCruiserReport;

  @minValue(0)
  durationMs: float64;
}

union DepCruiserRunOutcome {
  DepCruiserExecutionCompleted,
  Choom.Domain.AnalysisFailure,
  Choom.Domain.AnalysisCancelled,
}

// AbortSignal and progress callbacks are live controls bound in TypeScript.
interface DepCruiserExecutionOperations {
  run(request: DepCruiserExecutionRequest): DepCruiserRunOutcome;
}
