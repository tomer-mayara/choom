import { lazy, Suspense, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Workflow } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { ScopeSwitch, SourceIdentity } from "@/components/production-scope";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { IsolationComparisonPanel } from "@/components/isolation-comparison";
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
  const [expandedScope, setExpandedScope] = useState<typeof current>(null);
  const showNonProduction = current !== null && expandedScope === current;
  const visible = showNonProduction ? current : current?.production;
  const desktop = isDesktop();
  const [showExample, setShowExample] = useState(false);
  const focusInView = useRef(false);
  const previous = useRef(current);
  const comparisonOpen = useRef(false);
  const lastDiagramFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (comparisonOpen.current && !snapshot.comparison && previous.current === current) {
      const last = lastDiagramFocus.current;
      const target = last?.isConnected && !last.closest("[hidden]") ? last : document.getElementById("compare-earlier-baseline");
      target?.focus({ preventScroll: true });
    }
    comparisonOpen.current = Boolean(snapshot.comparison);
  }, [current, snapshot.comparison]);
  useLayoutEffect(() => {
    const replaced = previous.current !== current;
    previous.current = current;
    if (replaced && current && focusInView.current) {
      document.getElementById("current-diagram-heading")?.focus({ preventScroll: true });
    }
  }, [current]);
  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden">
      <WorkspaceControls workspace={workspace} snapshot={snapshot} desktop={desktop}
        scopeStatus={current && current.baseline.formatVersion < 6 && <SourceIdentity file={current.baseline} showAll={showNonProduction} />}>
        {current && <ScopeSwitch showAll={showNonProduction} onChange={(on) => setExpandedScope(on ? current : null)} />}
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
        onFocusCapture={(event) => {
          focusInView.current = true;
          if (event.target instanceof HTMLElement && !event.target.closest('[aria-label="Isolation comparison"]')) lastDiagramFocus.current = event.target;
        }}
        onBlurCapture={(event) => {
          if (event.relatedTarget instanceof Node) focusInView.current = event.currentTarget.contains(event.relatedTarget);
          else if (event.target instanceof Node && event.target.isConnected) focusInView.current = false;
        }}>
        {current?.baseline.formatVersion === 6 && <SourceIdentity file={current.baseline} showAll={showNonProduction} />}
        {current && snapshot.comparison && <IsolationComparisonPanel key={snapshot.comparison.before.sha256 + current.sha256}
          pair={snapshot.comparison} after={current} showAll={showNonProduction} />}
        {current && visible ? <ArchitectureDiagram baseline={visible.baseline} layout={visible.layout} baselineSha256={current.sha256}
          sourceBaseline={current.baseline} showNonProduction={showNonProduction}
          duplication={showNonProduction ? snapshot.duplication : null}
          onOpenDuplicationReport={() => { void workspace.workflow.openDuplicationReport(); }}
          onRemoveDuplicationReport={() => { void workspace.workflow.removeDuplicationReport(); }}
          discovery={showNonProduction ? snapshot.discovery : null}
          onOpenDiscoveryResult={() => { void workspace.workflow.openDiscoveryResult(); }}
          onRemoveDiscoveryResult={() => { void workspace.workflow.removeDiscoveryResult(); }}
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
