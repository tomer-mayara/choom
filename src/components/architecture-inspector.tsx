import { ArrowLeft, X } from "lucide-react";
import type { Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { ArchitectureDetails } from "./architecture-details.tsx";
import { ArchitectureRecordList } from "./architecture-record-list.tsx";
import type { ArchitectureInspection } from "./use-architecture-inspection.ts";
import { Button } from "./ui/button.tsx";

function InspectionContent({ baseline, inspection }: {
  baseline: ReadonlyData<Baseline>; inspection: ArchitectureInspection;
}) {
  const { panel, navigate, sections } = inspection;
  if (!panel) return null;
  if (panel.kind === "component") {
    const component = baseline.components.find(({ id }) => id === panel.componentId);
    if (!component) return null;
    return <div className="space-y-4">
      <h2 className="text-lg font-semibold wrap-anywhere">{component.name}</h2>
      <ArchitectureRecordList title="Owned interfaces" kind="interface" navigate={navigate}
        items={baseline.interfaces.filter(({ owner }) => owner.value === component.id)} />
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
    <ArchitectureDetails baseline={baseline} panel={panel} contentRef={inspection.content} />
    {panel.kind === "baseline" ? <>
      <ArchitectureRecordList title="Components" kind="component" items={baseline.components} navigate={navigate} />
      <ArchitectureRecordList title="Interfaces" kind="interface" items={baseline.interfaces} navigate={navigate} />
      <ArchitectureRecordList title="Resources" kind="resource" items={baseline.resources} navigate={navigate} />
    </> : null}
  </div>;
}

export function ArchitectureDetailsPanel({ baseline, inspection }: {
  baseline: ReadonlyData<Baseline>; inspection: ArchitectureInspection;
}) {
  const { panel, container, heading, content, close, back, canGoBack } = inspection;
  if (!panel) return null;
  const titles = { component: "Component details", interface: "Interface details", resource: "Resource details", baseline: "Baseline details", rules: "Rules" };
  return <aside ref={container} role="dialog" aria-modal="false" aria-labelledby="inspection-title"
    className="flex min-h-0 w-full basis-1/2 shrink-0 flex-col border-t border-border bg-card md:w-96 md:basis-auto md:border-t-0 md:border-l">
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
      {canGoBack ? <Button variant="outline" aria-label="Back" className="size-8 shrink-0 p-0" onClick={back}><ArrowLeft aria-hidden="true" className="size-4" /></Button> : null}
      <h2 ref={heading} id="inspection-title" tabIndex={-1} className="min-w-0 flex-1 text-base font-semibold">{titles[panel.kind]}</h2>
      <Button variant="outline" aria-label="Close details" className="size-8 shrink-0 p-0" onClick={close}><X aria-hidden="true" className="size-4" /></Button>
    </div>
    <div ref={content} aria-label="Record content" className="min-h-0 flex-1 overflow-y-auto p-5">
      <InspectionContent key={inspection.frameKey} baseline={baseline} inspection={inspection} />
    </div>
  </aside>;
}
