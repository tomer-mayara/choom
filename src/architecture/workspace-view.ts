import type { Baseline, DiscoveryResult } from "@choom/baseline-model/contracts";
import type { DuplicationReport } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import type { WorkflowOperations, WorkflowState } from "./generated/workflow.ts";

/** The open baseline and the reports attached to it. Each attachment is independent of the other. */
export type LoadWorkflowSnapshot = ReadonlyData<{
  state: WorkflowState;
  current: { baseline: Baseline; layout: ArchitectureLayout; sha256: string } | null;
  duplication: { report: DuplicationReport; session: number } | null;
  discovery: { result: DiscoveryResult } | null;
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
