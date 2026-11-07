import "@typespec/json-schema";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Workspace;

union WorkflowOperation {
  "repository",
  "document",
}

union WorkflowStage {
  "selection",
  "discovery",
  "setup",
  "analysis",
  "conversion",
  "storage",
  "reading",
  "validation",
  "layout",
  "cleanup",
}

@extension("additionalProperties", false)
model WorkflowSuccess {
  status: "success";

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model WorkflowCancelled {
  status: "cancelled";

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model WorkflowBusy {
  status: "busy";

  @minValue(0)
  durationMs: float64;
}

@extension("additionalProperties", false)
model WorkflowFailure {
  status: "failure";
  stage: WorkflowStage;

  @minLength(1)
  @maxLength(128)
  code: string;

  @minLength(1)
  @maxLength(2048)
  message: string;

  @minValue(0)
  durationMs: float64;
}

union WorkflowOutcome {
  WorkflowSuccess,
  WorkflowCancelled,
  WorkflowBusy,
  WorkflowFailure,
}

@extension("additionalProperties", false)
model WorkflowState {
  phase: "idle" | "loading" | "cancelling" | "cleanup";
  operation: WorkflowOperation | null;
  stage: WorkflowStage | null;
  lastOutcome: WorkflowOutcome | null;
  cleanupRecovery: "none" | "retry" | "restart";
  cleanupFailure?: WorkflowFailure;
}

// Live selection, cancellation signals, subscriptions, and prepared render data
// remain TypeScript bindings. A synchronous view commit completes the load;
// superseded-file cleanup can still gate the next load without reversing it.
interface WorkflowOperations {
  loadRepository(): WorkflowOutcome;
  openDocument(): WorkflowOutcome;
  cancel(): WorkflowOutcome | null;
  retry(): WorkflowOutcome;
  retryCleanup(): WorkflowOutcome;
  // Synchronous notification from the independent exporter; it does not replace a load outcome.
  documentCleanupFailed(): void;
}
