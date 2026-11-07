import { useState, type ReactNode } from "react";
import { Boxes, Download, FileUp, FolderOpen } from "lucide-react";
import type { WorkspaceBinding } from "../architecture/workspace-view.ts";
import type { WorkflowStage } from "../architecture/generated/workflow.ts";
import { Button } from "./ui/button.tsx";

type WorkspaceSnapshot = ReturnType<WorkspaceBinding["workflow"]["getSnapshot"]>;
interface ExportNotice { pending: boolean; message: string; failed: boolean }

const stageNames: Record<WorkflowStage, string> = {
  selection: "selection", discovery: "repository discovery", setup: "analyzer setup",
  analysis: "repository analysis", conversion: "report conversion", storage: "document storage",
  reading: "document reading", validation: "document validation", layout: "diagram layout", cleanup: "cleanup",
};
const stageProgress: Record<WorkflowStage, string> = {
  selection: "Waiting for your selection…", discovery: "Reading repository declarations…",
  setup: "Preparing repository analysis…", analysis: "Analyzing repository imports…",
  conversion: "Preparing architecture…", storage: "Saving the diagram…",
  reading: "Reading the diagram…", validation: "Checking the diagram…",
  layout: "Arranging component cards…", cleanup: "Finishing cleanup…",
};

function progressText({ state }: WorkspaceSnapshot): string | null {
  if (state.phase === "cancelling") return "Cancelling the load. Waiting for unfinished work to stop…";
  if (state.phase === "cleanup") return state.cleanupRecovery === "none" ? stageProgress.cleanup : null;
  if (state.phase === "loading") return state.stage ? stageProgress[state.stage] : "Loading the diagram…";
  if (state.lastOutcome?.status === "cancelled") return "Load cancelled.";
  if (state.lastOutcome?.status === "success") return "Diagram ready.";
  return null;
}

export function WorkspaceControls({ workspace, snapshot, desktop, children }: {
  workspace: WorkspaceBinding; snapshot: WorkspaceSnapshot; desktop: boolean; children: ReactNode;
}) {
  const [exportNotice, setExportNotice] = useState<ExportNotice | null>(null);
  const [cleanupPending, setCleanupPending] = useState(false);
  const { state, current } = snapshot;
  const unavailable = state.phase !== "idle" || state.cleanupRecovery !== "none";
  const loading = state.phase === "loading" || state.phase === "cancelling";
  const failure = state.lastOutcome?.status === "failure" ? state.lastOutcome : null;
  const progress = cleanupPending ? "Retrying cleanup…" : progressText(snapshot);

  async function retryCleanup() {
    setCleanupPending(true);
    try { await workspace.workflow.retryCleanup(); }
    finally { setCleanupPending(false); }
  }

  async function exportCurrentDocument() {
    if (!current || exportNotice?.pending) return;
    const { document } = current;
    try {
      // The exporter captures this document before the destination chooser can wait.
      const exporting = workspace.exportDocument(document);
      setExportNotice({ pending: true, failed: false, message: `Exporting “${document.name}”…` });
      const outcome = await exporting;
      setExportNotice({
        pending: false, failed: outcome.status === "failure",
        message: outcome.status === "success" ? `Exported “${document.name}”.`
          : outcome.status === "cancelled" ? `Export of “${document.name}” cancelled.`
            : `Diagram export failed: ${outcome.message}`,
      });
    } catch {
      setExportNotice({ pending: false, failed: true, message: "The diagram could not be exported. Please try again." });
    }
  }

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border bg-card px-4 py-2">
      <div className="flex shrink-0 items-center gap-2">
        <Boxes aria-hidden="true" className="size-5 text-primary" />
        <span className="font-semibold tracking-tight">Choom</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {desktop ? "Desktop" : "Browser"}
        </span>
      </div>
      <nav aria-label="Workspace actions" className="flex min-w-0 flex-wrap items-center gap-1.5 [&>button]:h-8 [&>button]:gap-1.5 [&>button]:px-2.5 [&>button]:py-0 [&>button]:text-xs [&>button]:whitespace-nowrap">
        {desktop ? (
          <Button disabled={unavailable} aria-describedby="repository-trust" onClick={() => { void workspace.workflow.loadRepository(); }}>
            <FolderOpen aria-hidden="true" className="size-4" />Load Repo
          </Button>
        ) : null}
        <Button variant={desktop ? "outline" : "default"} disabled={unavailable} onClick={() => { void workspace.workflow.openDocument(); }}>
          <FileUp aria-hidden="true" className="size-4" />Open Diagram
        </Button>
        <Button variant="outline" disabled={!current || exportNotice?.pending} onClick={() => { void exportCurrentDocument(); }}>
          <Download aria-hidden="true" className="size-4" />Export Diagram
        </Button>
        {loading ? (
          <Button variant="outline" disabled={state.phase === "cancelling"} onClick={() => { void workspace.workflow.cancel(); }}>Cancel</Button>
        ) : null}
        {failure && !unavailable ? (
          <Button variant="outline" onClick={() => { void workspace.workflow.retry(); }}>Retry</Button>
        ) : null}
        {state.cleanupRecovery === "retry" ? (
          <Button variant="outline" disabled={cleanupPending} onClick={() => { void retryCleanup(); }}>Retry cleanup</Button>
        ) : null}
        {children}
      </nav>
      <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 wrap-anywhere text-xs text-muted-foreground empty:hidden">
        {desktop ? <p id="repository-trust">Loading a repository runs its JavaScript configuration. Only load repositories you trust.</p> : null}
        {progress ? <p role="status">{progress}</p> : null}
        {failure && !state.cleanupFailure ? <p role="alert" className="text-destructive">The {stageNames[failure.stage]} failed: {failure.message}</p> : null}
        {state.cleanupFailure ? <p role="alert" className="text-destructive">Cleanup could not finish: {state.cleanupFailure.message}</p> : null}
        {exportNotice ? <p role={exportNotice.failed ? "alert" : "status"} className={exportNotice.failed ? "text-destructive" : undefined}>{exportNotice.message}</p> : null}
      </div>
    </header>
  );
}
