import "@typespec/json-schema";
import "./desktop.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Desktop;

@extension("additionalProperties", false)
model PrepareDepCruiserRequest {
  @minLength(1)
  repositorySession: string;

  @minLength(1)
  @maxLength(4096)
  config: string;

  @minItems(1)
  @maxItems(128)
  inputs: string[];

  // An absolute executable selection; otherwise use the packaged process PATH.
  @minLength(1)
  @maxLength(4096)
  nodeExecutable?: string;
}

@extension("additionalProperties", false)
model DepCruiserJob {
  @pattern("^analysis-[1-9][0-9]{0,19}$")
  jobId: string;
}

union DepCruiserNativeStage {
  "setup",
  "analysis",
  "cleanup",
}

union DepCruiserNativeFailureCode {
  "invalid-request",
  "invalid-session",
  "invalid-job",
  "busy",
  "node-not-found",
  "unsupported-node",
  "analyzer-not-found",
  "unsupported-analyzer",
  "unsupported-config-path",
  "source-changed",
  "execution-failed",
  "timed-out",
  "output-limit",
  "report-missing",
  "report-invalid",
  "cleanup-failed",
  "unavailable",
  "invalid-response",
}

@extension("additionalProperties", false)
model DepCruiserNativeFailure {
  status: "failure";
  stage: DepCruiserNativeStage;
  code: DepCruiserNativeFailureCode;

  @minLength(1)
  @maxLength(2048)
  message: string;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model PreparedDepCruiser {
  status: "success";
  value: DepCruiserJob;
}

@extension("additionalProperties", false)
model CompletedDepCruiserExecution {
  status: "completed";

  // Native and platform bindings also enforce 16777216 UTF-8 bytes.
  @minLength(1)
  @maxLength(16777216)
  reportJson: string;

  version: "18.7.2";
  workingDirectory: ".";

  // Unix epoch milliseconds, converted to an ISO timestamp by the workspace.
  @minValue(0)
  @maxValue(253402300799999)
  completedAtMs: integer;

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model CancelledDepCruiserExecution {
  status: "cancelled";

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model StoppedDepCruiserJob {
  status: "success";
  stopped: true;
}

@extension("additionalProperties", false)
model ReleasedDepCruiserJob {
  status: "success";
  released: true;
}

@extension("additionalProperties", false)
model DepCruiserNativeProgress {
  @pattern("^analysis-[1-9][0-9]{0,19}$")
  jobId: string;

  stage: DepCruiserNativeStage;

  @minValue(0)
  elapsedMs: float64;
}

union PrepareDepCruiserOutcome {
  PreparedDepCruiser,
  DepCruiserNativeFailure,
}

union DepCruiserExecutionOutcome {
  CompletedDepCruiserExecution,
  CancelledDepCruiserExecution,
  DepCruiserNativeFailure,
}

union CancelDepCruiserOutcome {
  StoppedDepCruiserJob,
  DepCruiserNativeFailure,
}

union ReleaseDepCruiserOutcome {
  ReleasedDepCruiserJob,
  DepCruiserNativeFailure,
}

// The platform binds promises and a live progress callback. Native channels are
// transport handles, not serialized operation data. Prepare starts no process.
interface DepCruiserOperations {
  prepareDepCruiser(
    request: PrepareDepCruiserRequest,
  ): PrepareDepCruiserOutcome;
  runDepCruiser(request: DepCruiserJob): DepCruiserExecutionOutcome;
  cancelDepCruiser(request: DepCruiserJob): CancelDepCruiserOutcome;
  releaseDepCruiser(request: DepCruiserJob): ReleaseDepCruiserOutcome;
}
