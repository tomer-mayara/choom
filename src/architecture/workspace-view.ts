import type { Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import type { WorkflowOperations, WorkflowState } from "./generated/workflow.ts";

export type LoadWorkflowSnapshot = ReadonlyData<{
  state: WorkflowState;
  current: { baseline: Baseline; layout: ArchitectureLayout } | null;
}>;

type ViewOperations = {
  readonly [Name in keyof WorkflowOperations]: (
    ...args: Parameters<WorkflowOperations[Name]>
  ) => Promise<ReadonlyData<ReturnType<WorkflowOperations[Name]>>>;
};

/** Commands and observations used by a view; lifetime stays with the owner. */
export interface WorkflowView extends ViewOperations {
  getSnapshot(): LoadWorkflowSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface WorkspaceBinding {
  readonly workflow: WorkflowView;
}
