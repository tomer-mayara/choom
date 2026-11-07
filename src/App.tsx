import { lazy, Suspense, useState, useSyncExternalStore } from "react";
import { FolderOpen, Workflow } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { WorkspaceControls } from "@/components/workspace-controls";
import { workspace as defaultWorkspace } from "@/architecture/workspace";
import type { WorkspaceBinding } from "@/architecture/workspace-view";
import { isDesktop, selectProjectDirectory } from "@/platform/desktop";

const ArchitecturePreview = lazy(
  () => import("@/components/architecture-preview"),
);
const introduction =
  "A place to explore **systems, connections, and decisions**. Open the example to try the architecture canvas.";

export default function App({ workspace = defaultWorkspace }: { workspace?: WorkspaceBinding } = {}) {
  const snapshot = useSyncExternalStore(workspace.workflow.subscribe, workspace.workflow.getSnapshot, workspace.workflow.getSnapshot);
  const { current } = snapshot;
  const desktop = isDesktop();
  const [showExample, setShowExample] = useState(false);
  const [directory, setDirectory] = useState<string | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseDirectory() {
    setDialogPending(true);
    setError(null);
    try {
      const selected = await selectProjectDirectory();
      if (selected) setDirectory(selected);
    } catch {
      setError("The directory picker could not be opened. Please try again.");
    } finally {
      setDialogPending(false);
    }
  }

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden">
      <WorkspaceControls workspace={workspace} snapshot={snapshot} desktop={desktop}>
        {!current ? (
          <Button
            variant="outline"
            aria-expanded={showExample}
            aria-controls="example"
            onClick={() => setShowExample((shown) => !shown)}
          >
            <Workflow aria-hidden="true" className="size-4" />
            {showExample ? "Close example" : "Explore example"}
          </Button>
        ) : null}
        {desktop ? (
          <Button
            variant="outline"
            disabled={dialogPending || snapshot.state.phase !== "idle"}
            onClick={() => { void chooseDirectory(); }}
          >
            <FolderOpen aria-hidden="true" className="size-4" />
            Choose directory
          </Button>
        ) : null}
      </WorkspaceControls>
      {directory || error ? (
        <div className="shrink-0 border-b border-border bg-card px-4 py-1 text-xs">
          {directory ? <p role="status" className="wrap-anywhere text-muted-foreground">Selected directory: {directory}</p> : null}
          {error ? <p role="alert" className="text-destructive">{error}</p> : null}
        </div>
      ) : null}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {current ? <ArchitectureDiagram document={current.document} layout={current.layout} /> : (
          <>
            {!showExample ? (
              <section aria-labelledby="welcome-heading" className="mx-auto w-full max-w-5xl space-y-4 overflow-auto px-4 py-8 sm:px-6 sm:py-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your workspace</p>
                <h1 id="welcome-heading" className="text-4xl font-semibold tracking-tight md:text-5xl">Architecture starts here.</h1>
                <div className="max-w-xl text-lg leading-relaxed text-muted-foreground">
                  <ReactMarkdown>{introduction}</ReactMarkdown>
                </div>
              </section>
            ) : null}
            <section id="example" aria-label="Example architecture" className="min-h-0 min-w-0 flex-1" hidden={!showExample}>
              {showExample ? (
                <>
                  <h1 className="sr-only">Example architecture</h1>
                  <Suspense fallback={<p role="status">Loading example…</p>}>
                    <ArchitecturePreview />
                  </Suspense>
                </>
              ) : null}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
