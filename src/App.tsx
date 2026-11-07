import { lazy, Suspense, useState, useSyncExternalStore } from "react";
import { Boxes, FolderOpen, Workflow } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { WorkspaceControls } from "@/components/workspace-controls";
import { workspace as defaultWorkspace, type WorkspaceBinding } from "@/architecture/workspace";
import { isDesktop, selectProjectDirectory } from "@/platform/desktop";

const ArchitecturePreview = lazy(
  () => import("@/components/architecture-preview"),
);
const introduction =
  "A place to explore **systems, connections, and decisions**. Open the example to try the architecture canvas.";

export default function App({ workspace = defaultWorkspace }: { workspace?: WorkspaceBinding } = {}) {
  const snapshot = useSyncExternalStore(workspace.workflow.subscribe, workspace.workflow.getSnapshot, workspace.workflow.getSnapshot);
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
    <main className="mx-auto max-w-5xl px-6 py-12 md:py-20">
      <header className="mb-14 flex items-center gap-3">
        <Boxes aria-hidden="true" className="size-7 text-primary" />
        <span className="text-xl font-semibold tracking-tight">Choom</span>
        <span className="ml-auto rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          {desktop ? "Desktop" : "Browser"}
        </span>
      </header>
      <section aria-labelledby="welcome-heading" className="space-y-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Your workspace
        </p>
        <h1
          id="welcome-heading"
          className="text-4xl font-semibold tracking-tight md:text-5xl"
        >
          Architecture starts here.
        </h1>
        <div className="max-w-xl text-lg leading-relaxed text-muted-foreground">
          <ReactMarkdown>{snapshot.current ? "Explore the recorded **components, imports, and findings**." : introduction}</ReactMarkdown>
        </div>
        <WorkspaceControls workspace={workspace} snapshot={snapshot} desktop={desktop} />
        <div className="flex flex-wrap gap-3">
          {!snapshot.current ? <Button
            variant="outline"
            aria-expanded={showExample}
            aria-controls="example"
            onClick={() => setShowExample((shown) => !shown)}
          >
            <Workflow aria-hidden="true" className="size-4" />
            {showExample ? "Close example" : "Explore example"}
          </Button> : null}
          {desktop ? (
            <Button
              variant="outline"
              disabled={dialogPending || snapshot.state.phase !== "idle"}
              onClick={() => {
                void chooseDirectory();
              }}
            >
              <FolderOpen aria-hidden="true" className="size-4" />
              Choose directory
            </Button>
          ) : null}
        </div>
        {directory ? (
          <p role="status" className="break-all text-sm text-muted-foreground">
            Selected directory: {directory}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
      <section
        id="example"
        aria-label="Example architecture"
        className="mt-12"
        hidden={!showExample || Boolean(snapshot.current)}
      >
        {showExample && !snapshot.current ? (
          <Suspense fallback={<p role="status">Loading example…</p>}>
            <ArchitecturePreview />
          </Suspense>
        ) : null}
      </section>
      {snapshot.current ? <ArchitectureDiagram document={snapshot.current.document} layout={snapshot.current.layout} /> : null}
    </main>
  );
}
