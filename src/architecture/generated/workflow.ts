// Generated from TypeSpec by bun run contracts:generate. Do not edit.

export interface WorkflowBusy {
  status: "busy";
  durationMs: number;
}

export interface WorkflowCancelled {
  status: "cancelled";
  durationMs: number;
}

export interface WorkflowFailure {
  status: "failure";
  stage: WorkflowStage;
  code: string;
  message: string;
  durationMs: number;
}

export interface WorkflowOperations {
  openBaseline(): WorkflowOutcome;
  openDuplicationReport(): WorkflowOutcome;
  removeDuplicationReport(): WorkflowOutcome;
  cancel(): WorkflowOutcome | null;
  retry(): WorkflowOutcome;
}

export type WorkflowOutcome = WorkflowSuccess | WorkflowCancelled | WorkflowBusy | WorkflowFailure;

export type WorkflowStage = "selection" | "reading" | "validation" | "layout";

export interface WorkflowState {
  operation: "baseline" | "report";
  phase: "idle" | "loading" | "cancelling";
  stage: WorkflowStage | null;
  lastOutcome: WorkflowOutcome | null;
}

export interface WorkflowSuccess {
  status: "success";
  durationMs: number;
}
