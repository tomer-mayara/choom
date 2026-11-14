import "@typespec/json-schema";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Workspace;

union WorkflowStage {
  "selection",
  "reading",
  "validation",
  "layout",
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
  operation: "baseline" | "report";
  phase: "idle" | "loading" | "cancelling";
  stage: WorkflowStage | null;
  lastOutcome: WorkflowOutcome | null;
}

// Selection, cancellation signals, subscriptions, and prepared render data
// remain TypeScript bindings. Publication owns the full baseline and layout.
interface WorkflowOperations {
  openBaseline(): WorkflowOutcome;
  openDuplicationReport(): WorkflowOutcome;
  removeDuplicationReport(): WorkflowOutcome;
  cancel(): WorkflowOutcome | null;
  retry(): WorkflowOutcome;
}
