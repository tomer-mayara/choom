import { lazy, Suspense, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Workflow } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { WorkspaceControls } from "@/components/workspace-controls";
import { workspace as defaultWorkspace } from "@/architecture/workspace";
import type { WorkspaceBinding } from "@/architecture/workspace-view";
import { isDesktop } from "@/platform/desktop";

const ArchitecturePreview = lazy(
  () => import("@/components/architecture-preview"),
);
const introduction =
  "Open a saved **architecture baseline** to explore its model. Try the example to explore the component canvas.";

export default function App({ workspace = defaultWorkspace }: { workspace?: WorkspaceBinding } = {}) {
  const snapshot = useSyncExternalStore(workspace.workflow.subscribe, workspace.workflow.getSnapshot, workspace.workflow.getSnapshot);
  const { current } = snapshot;
  const desktop = isDesktop();
  const [showExample, setShowExample] = useState(false);
  const focusInView = useRef(false);
  const previous = useRef(current);
  useLayoutEffect(() => {
    const replaced = previous.current !== current;
    previous.current = current;
    if (replaced && current && focusInView.current) {
      document.getElementById("current-diagram-heading")?.focus({ preventScroll: true });
    }
  }, [current]);
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
      </WorkspaceControls>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col"
        onFocusCapture={() => { focusInView.current = true; }}
        onBlurCapture={(event) => {
          if (event.relatedTarget instanceof Node) focusInView.current = event.currentTarget.contains(event.relatedTarget);
          else if (event.target instanceof Node && event.target.isConnected) focusInView.current = false;
        }}>
        {current ? <ArchitectureDiagram baseline={current.baseline} layout={current.layout}
          duplication={snapshot.duplication}
          onOpenDuplicationReport={() => { void workspace.workflow.openDuplicationReport(); }}
          onRemoveDuplicationReport={() => { void workspace.workflow.removeDuplicationReport(); }}
          reportBusy={snapshot.state.phase !== "idle"} /> : (
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
