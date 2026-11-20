import { createContext, useContext, useState } from "react";
import type { BoundaryRole } from "@choom/baseline-model/contracts";
import { type BoundaryInventory, roleNames, type ReviewedComponent, type VisibleOperation, type VisibleSite } from "../lib/boundary-inventory.ts";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import type { ArchitectureInspection } from "./use-architecture-inspection.ts";
import { BoundaryDiscovery } from "./boundary-discovery.tsx";
import { Button } from "./ui/button.tsx";

export const BoundaryContext = createContext<BoundaryInventory | null>(null);
export const useBoundaryInventory = () => useContext(BoundaryContext);
type Navigation = ArchitectureInspection["navigate"];

function SourceSite({ site, showRoute, navigate }: { site: VisibleSite; showRoute: boolean; navigate?: Navigation }) {
  return <li className="space-y-1">
    <p>{roleNames[site.role]} · {site.kind} · {site.member}</p>
    {site.target && <p>{site.target} · {roleNames[site.targetRole]}</p>}
    {navigate && site.targetId && <button type="button" data-record-id={site.id} className="underline"
      onClick={(event) => navigate({ kind: "component", componentId: site.targetId ?? "" }, event.currentTarget)}>Inspect {site.target}</button>}
    {showRoute && site.route && <code>{site.route}</code>}
    {site.location && <p>{site.caller}, {site.location}</p>}
    {site.reason && <p>{site.reason}</p>}
    {site.notes.map((note) => <p key={note.evidenceRef}>{note.description}
      {note.location && <> · <code>{note.location.path}</code> · lines {note.location.lines.join("–")}</>}</p>)}
  </li>;
}

function Callers({ operation, view, navigate }: { operation: VisibleOperation; view: BoundaryInventory; navigate: Navigation }) {
  if (!view.fresh) return null;
  return <section aria-label="Observed callers" className="space-y-2">
    <h5 className="font-medium">Observed callers</h5>
    {!operation.callers.has("production") && operation.completeProductionSearch && <p>0 production callers in reviewed scope</p>}
    {Array.from(operation.callers, ([role, groups]) => <div key={role}>
      <p>{groups.length} {roleNames[role].toLowerCase()} {groups.length === 1 ? "caller" : "callers"}</p>
      {groups.map((group) => <details key={group.id}>
        <summary className="cursor-pointer">{group.name} · {roleNames[role]} · {group.sites.length} {group.sites.length === 1 ? "site" : "sites"}</summary>
        <button type="button" className="underline" data-record-id={group.id}
          onClick={(event) => navigate({ kind: "component", componentId: group.id }, event.currentTarget)}>Inspect {group.name}</button>
        <ul className="ml-3 list-disc">{group.sites.map((site) => <SourceSite key={site.id} site={site} showRoute={view.showAll} />)}</ul>
      </details>)}
    </div>)}
    {!operation.completeProductionSearch && <p>Caller coverage incomplete</p>}
  </section>;
}

function Operation({ operation, view, navigate }: { operation: VisibleOperation; view: BoundaryInventory; navigate: Navigation }) {
  return <article className="space-y-2 rounded border border-border p-3">
    <h4 className="font-semibold">{operation.name}</h4>
    <p>{operation.roles.map((role: BoundaryRole) => roleNames[role]).join(", ")} · {operation.visibility === "unknown" ? "Visibility unknown" : operation.visibility}</p>
    {operation.reason && <p>{operation.reason}</p>}
    <p>Provider · {operation.ownerName}</p>
    <p>{operation.permittedCallers === null ? "Permitted callers unknown" : `Permitted callers · ${operation.permittedCallers.join(", ") || "None in this scope"}`}</p>
    {operation.markers.length > 0 && <p>Entry evidence · {operation.markers.join(", ")}</p>}
    <Callers operation={operation} view={view} navigate={navigate} />
  </article>;
}

export function BoundaryDetails({ view, panel, navigate, digest }: {
  view: BoundaryInventory; panel: ArchitecturePanel; navigate: Navigation; digest?: string;
}) {
  if (panel.kind === "component") {
    const component = view.components.get(panel.componentId);
    return component && <ComponentReview component={component} view={view} digest={digest} navigate={navigate} />;
  }
  if (panel.kind === "interface" || panel.kind === "operation") {
    const ops = panel.kind === "operation" ? [view.operations.get(panel.operationId)].filter((operation) => operation !== undefined)
      : [...view.operations.values()].filter((operation) => operation.interfaceId === panel.interfaceId);
    return <div className="space-y-3 wrap-anywhere">{ops.map((op) => <Operation key={op.id} operation={op} view={view} navigate={navigate} />)}</div>;
  }
  if (panel.kind === "baseline") return <div className="space-y-3 wrap-anywhere">
    <p>{view.baseline.boundaryReview.identity.projectKey}</p>
    <section aria-label="Components" className="space-y-2"><h3 className="font-semibold">Components ({view.components.size})</h3>
      {Array.from(view.components.values(), (item) => <Button key={item.id} data-record-id={item.id} className="block h-auto w-full text-left" variant="outline"
        onClick={(event) => navigate({ kind: "component", componentId: item.id }, event.currentTarget)}>{item.name} · {item.roleLabel}</Button>)}
    </section>
    {view.fresh && <section aria-label="Operations" className="space-y-2"><h3 className="font-semibold">Operations ({view.operations.size})</h3>
      {Array.from(view.operations.values(), (op) => <Button key={op.id} data-record-id={op.id} className="block h-auto w-full text-left" variant="outline"
        onClick={(event) => navigate({ kind: "operation", operationId: op.id }, event.currentTarget)}>{op.name} · {op.ownerName} · {op.roles.map((role) => roleNames[role]).join(", ")}</Button>)}
    </section>}
    {view.showAll && view.unresolved.length > 0 && <section aria-label="Unresolved uses" className="space-y-2"><h3 className="font-semibold">Unresolved uses</h3>
      <ul>{view.unresolved.map((site) => <SourceSite key={site.id} site={site} showRoute />)}</ul>
    </section>}
    <AuditEvidence view={view} digest={digest} />
  </div>;
  if (panel.kind === "rules") return <section aria-label="Scoped findings">
    {view.findings.map(({ caller, finding }) => <details key={finding.id}>
      <summary>{caller} · {finding.label} · {roleNames[finding.role]}</summary>
      <p>{finding.rule}</p>{finding.callerLocation && <p>{finding.callerLocation}</p>}
      <ul>{finding.sites.map((site) => <SourceSite key={site.id} site={site} showRoute={view.showAll} />)}</ul>
    </details>)}
    {!view.fresh ? <p>Needs refresh</p> : !view.findings.length && <p>No findings recorded in the selected scope.</p>}
  </section>;
  return null;
}

function ComponentReview({ component, view, digest, navigate }: { component: ReviewedComponent; view: BoundaryInventory; digest?: string; navigate: Navigation }) {
  return <div className="space-y-4 text-sm wrap-anywhere">
    <h2 className="text-lg font-semibold">{component.name} · {component.roleLabel}</h2>
    <p>{component.purpose}</p>{component.reason && <p>{component.reason}</p>}
    {view.fresh ? <>
      <section aria-label="Provides" className="space-y-2"><h3 className="font-semibold">Provides</h3>
        {component.provides.length === 0 && <p>No visible operations recorded.</p>}
        {component.provides.map((op) => <Operation key={op.id} operation={op} view={view} navigate={navigate} />)}
      </section>
      <section aria-label="Uses" className="space-y-2"><h3 className="font-semibold">Uses</h3>
        {component.uses.length === 0 && <p>No visible uses recorded.</p>}
        <ul className="space-y-2">{component.uses.map((site) => <SourceSite key={site.id} site={site} showRoute={view.showAll} navigate={navigate} />)}</ul>
      </section>
      {component.findings.length > 0 && <section aria-label="Boundary findings"><h3 className="font-semibold">Boundary findings</h3>
        {component.findings.map((finding) => <details key={finding.id}><summary className="cursor-pointer">{finding.label}</summary>
          <p>{component.name} · {roleNames[finding.role]} · {finding.rule}</p>
          {finding.callerLocation && <p>{finding.callerLocation}</p>}
          {finding.target && <p>{finding.target}</p>}
          <ul>{finding.sites.map((site) => <SourceSite key={site.id} site={site} showRoute={view.showAll} />)}</ul>
        </details>)}
      </section>}
    </> : <p>Needs refresh</p>}
    <AuditEvidence view={view} component={component} digest={digest} />
  </div>;
}

function OriginalRecords({ view, component }: { view: BoundaryInventory; component?: ReviewedComponent }) {
  const [open, setOpen] = useState(false);
  function record() {
    if (!component) return view.baseline;
    const file = view.baseline;
    const unitIds = new Set(file.boundaryReview.units.filter(({ ownerId }) => ownerId === component.id).map(({ id }) => id));
    return {
      component: file.components.find(({ id }) => id === component.id),
      operations: file.boundaryReview.operations.filter((op) => unitIds.has(op.unitId)),
      accesses: file.boundaryReview.accesses.filter((site) => unitIds.has(site.callerUnitId) || (site.targetUnitId && unitIds.has(site.targetUnitId))),
      interfaces: file.interfaces.filter((item) => item.owner.value === component.id),
    };
  }
  return <details onToggle={(event) => setOpen(event.currentTarget.open)}><summary className="cursor-pointer">Original records</summary>
    {open && <pre className="whitespace-pre-wrap">{JSON.stringify(record(), null, 2)}</pre>}
  </details>;
}

function AuditEvidence({ view, digest, component }: { view: BoundaryInventory; digest?: string; component?: ReviewedComponent }) {
  const review = view.baseline.boundaryReview;
  const fileDigest = digest ?? view.fileDigest;
  return <details data-section="boundary-evidence" className="space-y-2 text-sm">
    <summary className="cursor-pointer font-semibold">Evidence</summary>
    <p>Snapshot · {review.identity.snapshotRef}</p>
    <p>Inventory SHA-256 · <code>{review.identity.inventoryDigest}</code></p>
    {fileDigest && <p>File SHA-256 · <code>{fileDigest}</code></p>}
    {view.fresh && <p>{component ? `${component.uses.length} visible use sites` : `${view.operations.size} visible operations`}</p>}
    {view.showAll && <>
      {component && <BoundaryDiscovery componentId={component.id} />}
      {review.limitations.map((limit, index) => <p key={index}>{limit}</p>)}
      {component?.notes.map((note) => <p key={note.evidenceRef}>{note.description} · {note.location?.path} · {note.location?.lines.join("–")}</p>)}
      <OriginalRecords view={view} component={component} />
    </>}
  </details>;
}
