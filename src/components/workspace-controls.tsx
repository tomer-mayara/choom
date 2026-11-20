import type { ReactNode } from "react";
import { Boxes, FileUp } from "lucide-react";
import type { WorkspaceBinding } from "../architecture/workspace-view.ts";
import type { WorkflowStage, WorkflowState } from "../architecture/generated/workflow.ts";
import { Button } from "./ui/button.tsx";

type WorkspaceSnapshot = ReturnType<WorkspaceBinding["workflow"]["getSnapshot"]>;
const stageProgress: Record<WorkflowStage, string> = {
  selection: "Waiting for your selection…", reading: "Reading the baseline…",
  validation: "Checking the baseline…", layout: "Arranging component cards…",
};
// The file that each operation loads, and its announcements.
const operations: Record<WorkflowState["operation"], { file: string; cancelled: string; ready: string }> = {
  baseline: { file: "baseline", cancelled: "Load cancelled.", ready: "Baseline ready." },
  report: { file: "duplication report", cancelled: "Report load cancelled.", ready: "Duplication report ready." },
  comparison: { file: "earlier baseline", cancelled: "Comparison load cancelled.", ready: "Comparison ready." },
  discovery: { file: "discovery result", cancelled: "Discovery result load cancelled.", ready: "Discovery result ready." },
};

function progressText({ state }: WorkspaceSnapshot): string | null {
  if (state.phase === "cancelling") return state.stage === "selection" ? "Cancelling the load. Waiting for the file picker to close…" : "Cancelling the load…";
  if (state.phase === "loading") {
    const text = state.stage ? stageProgress[state.stage] : "Loading the baseline…";
    return text.replace("baseline", operations[state.operation].file);
  }
  if (state.lastOutcome?.status === "cancelled") return operations[state.operation].cancelled;
  if (state.lastOutcome?.status === "success") return operations[state.operation].ready;
  return null;
}

export function WorkspaceControls({ workspace, snapshot, desktop, children, scopeStatus }: {
  workspace: WorkspaceBinding; snapshot: WorkspaceSnapshot; desktop: boolean; children: ReactNode; scopeStatus?: ReactNode;
}) {
  const { state } = snapshot;
  const loading = state.phase !== "idle";
  const failure = state.lastOutcome?.status === "failure" ? state.lastOutcome : null;
  const progress = progressText(snapshot);
  // A narrow window uses less vertical space here, so the diagram and its details panel keep more height.
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-card px-4 py-1.5 sm:gap-y-1.5 sm:py-2">
      <div className="flex shrink-0 items-center gap-2">
        <Boxes aria-hidden="true" className="size-5 text-primary" />
        <span className="font-semibold tracking-tight">Choom</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{desktop ? "Desktop" : "Browser"}</span>
      </div>
      <nav aria-label="Workspace actions" className="flex min-w-0 flex-wrap items-center gap-1.5 [&>button]:h-8 [&>button]:gap-1.5 [&>button]:px-2 sm:[&>button]:px-2.5 [&>button]:py-0 [&>button]:text-xs [&>button]:whitespace-nowrap">
        <Button disabled={loading} onClick={() => { void workspace.workflow.openBaseline(); }}>
          <FileUp aria-hidden="true" className="size-4" />Open Baseline
        </Button>
        {loading ? <Button variant="outline" disabled={state.phase === "cancelling"} onClick={() => { void workspace.workflow.cancel(); }}>Cancel</Button> : null}
        {failure && !loading ? <Button variant="outline" onClick={() => { void workspace.workflow.retry(); }}>Retry</Button> : null}
        {snapshot.current && <Button id="compare-earlier-baseline" variant="outline" disabled={loading}
          aria-label="Compare with earlier baseline" onClick={() => { void workspace.workflow.openComparison(); }}>
          <span className="sm:hidden">Compare</span><span className="hidden sm:inline">Compare with earlier baseline</span></Button>}
        {snapshot.comparison && <Button variant="outline" disabled={loading}
          onClick={() => { void workspace.workflow.closeComparison(); }}>Close comparison</Button>}
        {children}
      </nav>
      <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 wrap-anywhere text-xs text-muted-foreground empty:hidden">
        {progress ? <p role="status">{progress}</p> : null}
        {scopeStatus}
        {failure ? <p role="alert" className="text-destructive">The {operations[state.operation].file} {failure.stage} failed: {failure.message}</p> : null}
      </div>
    </header>
  );
}
