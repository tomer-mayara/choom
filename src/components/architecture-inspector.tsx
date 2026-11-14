import { ArrowLeft, X } from "lucide-react";
import type { Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { ArchitectureDetails } from "./architecture-details.tsx";
import { ArchitectureRecordList } from "./architecture-record-list.tsx";
import type { ArchitectureInspection } from "./use-architecture-inspection.ts";
import { Button } from "./ui/button.tsx";
import { DuplicationList } from "./duplication-list.tsx";
import { DuplicationComparison } from "./duplication-comparison.tsx";
import type { duplicationCounts, DuplicationControls } from "./duplication-view.ts";

function InspectionContent({ baseline, inspection, duplication, counts }: {
  baseline: ReadonlyData<Baseline>; inspection: ArchitectureInspection;
  counts: ReturnType<typeof duplicationCounts>;
} & DuplicationControls) {
  const { panel, navigate, sections } = inspection;
  if (!panel) return null;
  if (panel.kind === "duplicates") return <DuplicationList baseline={baseline} report={duplication?.report} filter={panel} navigate={navigate} listState={inspection.listState} />;
  if (panel.kind === "duplicate") {
    const finding = duplication?.report.findings.find(({ id }) => id === panel.findingId);
    return finding ? <DuplicationComparison baseline={baseline} finding={finding} navigate={navigate} sections={sections} /> : null;
  }
  if (panel.kind === "component") {
    const component = baseline.components.find(({ id }) => id === panel.componentId);
    if (!component) return null;
    return <div className="space-y-4">
      <h2 className="text-lg font-semibold wrap-anywhere">{component.name}</h2>
      {(counts.components.get(component.id) ?? 0) > 0 ? <Button variant="outline" data-record-id={`duplicates-${component.id}`}
        onClick={(event) => navigate({ kind: "duplicates", componentId: component.id }, event.currentTarget)}>
        Possible duplicates ({counts.components.get(component.id)})</Button> : null}
      <ArchitectureRecordList title="Owned interfaces" kind="interface" navigate={navigate}
        items={baseline.interfaces.filter(({ owner }) => owner.value === component.id)} duplicateCounts={counts.interfaces} />
      <details data-section="resources" open={sections.includes("resources")}>
        <summary className="cursor-pointer py-2 font-semibold">Resources</summary>
        <ArchitectureRecordList title="Owned resources" kind="resource" navigate={navigate}
          items={baseline.resources.filter(({ owner }) => owner.value === component.id)} />
      </details>
      <details data-section="recorded" open={sections.includes("recorded")}>
        <summary className="cursor-pointer py-2 font-semibold">Recorded details</summary>
        <ArchitectureDetails baseline={baseline} panel={panel} showHeading={false} />
      </details>
    </div>;
  }
  return <div className="space-y-6">
    {panel.kind === "interface" && (counts.interfaces.get(panel.interfaceId) ?? 0) > 0 ? <Button variant="outline" data-record-id={`duplicates-${panel.interfaceId}`}
      onClick={(event) => navigate({ kind: "duplicates", interfaceId: panel.interfaceId }, event.currentTarget)}>
      Possible duplicates ({counts.interfaces.get(panel.interfaceId)})</Button> : null}
    <ArchitectureDetails baseline={baseline} panel={panel} contentRef={inspection.content} reading={inspection.reading} />
    {panel.kind === "baseline" ? <>
      <ArchitectureRecordList title="Components" kind="component" items={baseline.components} navigate={navigate} />
      <ArchitectureRecordList title="Interfaces" kind="interface" items={baseline.interfaces} navigate={navigate} duplicateCounts={counts.interfaces} />
      <ArchitectureRecordList title="Resources" kind="resource" items={baseline.resources} navigate={navigate} />
    </> : null}
  </div>;
}

export function ArchitectureDetailsPanel({ baseline, inspection, duplication, counts, onOpenDuplicationReport, onRemoveDuplicationReport, reportBusy = false }: {
  baseline: ReadonlyData<Baseline>; inspection: ArchitectureInspection;
  counts: ReturnType<typeof duplicationCounts>;
} & DuplicationControls) {
  const { panel, container, heading, content, close, back, canGoBack } = inspection;
  if (!panel) return null;
  const titles = { component: "Component details", interface: "Interface details", resource: "Resource details", baseline: "Baseline details", rules: "Rules", duplicates: "Duplicates", duplicate: "Duplicate comparison" };
  return <aside ref={container} role="dialog" aria-modal="false" aria-labelledby="inspection-title"
    className="flex min-h-0 w-full basis-1/2 shrink-0 flex-col border-t border-border bg-card md:w-96 md:basis-auto md:border-t-0 md:border-l">
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2 sm:px-5 sm:py-3">
      {canGoBack ? <Button variant="outline" aria-label="Back" className="size-8 shrink-0 p-0" onClick={back}><ArrowLeft aria-hidden="true" className="size-4" /></Button> : null}
      <h2 ref={heading} id="inspection-title" tabIndex={-1} className="min-w-0 flex-1 text-base font-semibold">{titles[panel.kind]}</h2>
      <Button variant="outline" aria-label="Close details" className="size-8 shrink-0 p-0" onClick={close}><X aria-hidden="true" className="size-4" /></Button>
    </div>
    {panel.kind === "duplicates" || duplication ? <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2 sm:px-5 sm:py-3 [&>button]:px-2 sm:[&>button]:px-4">
      {onOpenDuplicationReport ? <Button id="open-duplication-report" aria-label="Open duplication report" variant="outline" disabled={reportBusy} onClick={onOpenDuplicationReport}>
        <span className="sm:hidden">Open report</span><span className="hidden sm:inline">Open duplication report</span>
      </Button>
        : <p className="text-sm text-muted-foreground">Open a saved baseline before attaching a duplication report.</p>}
      {duplication && onRemoveDuplicationReport ? <Button variant="outline" onClick={(event) => {
        if (document.activeElement === event.currentTarget) heading.current?.focus({ preventScroll: true });
        onRemoveDuplicationReport();
      }}>Remove report</Button> : null}
    </div> : null}
    <div ref={content} aria-label="Record content" className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
      <InspectionContent key={inspection.frameKey} baseline={baseline} inspection={inspection} duplication={duplication} counts={counts} />
    </div>
  </aside>;
}
