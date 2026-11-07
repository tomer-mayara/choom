import type { DocumentExportOutcome } from "../documents/document-files.ts";
import type { ArchitectureDocument } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import type { WorkflowOperations, WorkflowState } from "./generated/workflow.ts";

export type LoadWorkflowSnapshot = ReadonlyData<{
  state: WorkflowState;
  current: { document: ArchitectureDocument; layout: ArchitectureLayout } | null;
}>;

type ViewOperations = {
  readonly [Name in Exclude<keyof WorkflowOperations, "documentCleanupFailed">]: (
    ...args: Parameters<WorkflowOperations[Name]>
  ) => Promise<ReadonlyData<ReturnType<WorkflowOperations[Name]>>>;
};

/** Commands and observations used by a view; lifetime and exporter notifications stay with the owner. */
export interface WorkflowView extends ViewOperations {
  getSnapshot(): LoadWorkflowSnapshot;
  subscribe(listener: () => void): () => void;
}

export type WorkspaceExportOutcome = DocumentExportOutcome;

export interface WorkspaceBinding {
  readonly workflow: WorkflowView;
  exportDocument(document: ReadonlyData<ArchitectureDocument>): Promise<WorkspaceExportOutcome>;
}
