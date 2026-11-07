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

export type WorkflowOperation = "repository" | "document";

export interface WorkflowOperations {
  loadRepository(): WorkflowOutcome;
  openDocument(): WorkflowOutcome;
  cancel(): WorkflowOutcome | null;
  retry(): WorkflowOutcome;
  retryCleanup(): WorkflowOutcome;
  documentCleanupFailed(): void;
}

export type WorkflowOutcome = WorkflowSuccess | WorkflowCancelled | WorkflowBusy | WorkflowFailure;

export type WorkflowStage = "selection" | "discovery" | "setup" | "analysis" | "conversion" | "storage" | "reading" | "validation" | "layout" | "cleanup";

export interface WorkflowState {
  phase: "idle" | "loading" | "cancelling" | "cleanup";
  operation: WorkflowOperation | null;
  stage: WorkflowStage | null;
  lastOutcome: WorkflowOutcome | null;
  cleanupRecovery: "none" | "retry" | "restart";
  cleanupFailure?: WorkflowFailure;
}

export interface WorkflowSuccess {
  status: "success";
  durationMs: number;
}
