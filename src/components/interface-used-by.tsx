import type { Baseline, BaselineInterface, BaselineSourceAssessment, BaselineSourceNote, BaselineSourceUse } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { componentName } from "../lib/component-name.ts";
import { InterfaceSourceLocation } from "./interface-source-location.tsx";
import type { InterfaceDisclosure } from "./use-interface-disclosures.ts";

type Use = ReadonlyData<BaselineSourceUse>;
type Interface = ReadonlyData<BaselineInterface>;

function primaryUse(use: Use): boolean {
  return use.consumerId !== null && use.kind === "value" && (use.context === "application" || use.context === "tooling");
}

function excludedReasons(use: Use, item: Interface): string[] {
  const reasons: string[] = [];
  if (use.kind === "type") reasons.push("Type references stay in details.");
  if (use.context === "test") reasons.push("Test references stay in details.");
  if (use.context === "unknown") reasons.push("Context is unknown, so no canvas arrow is shown.");
  if (use.consumerId === null) reasons.push("Caller component is not mapped, so no canvas arrow is shown.");
  if (item.owner.value === null) reasons.push("Provider unknown; no canvas arrow can be drawn.");
  return reasons;
}

function UseRow({ use, item, note, disclosure }: {
  use: Use; item: Interface; note?: ReadonlyData<BaselineSourceNote>; disclosure: InterfaceDisclosure;
}) {
  const caller = disclosure(`source-use-caller-${use.id}`);
  const entry = item.documentation?.entries.find((entry) => entry.id === use.entryId);
  const internal = use.consumerId !== null && use.consumerId === item.owner.value;
  return <li data-use-id={use.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3">
    <p className="whitespace-pre-wrap">{use.description}</p>
    <p className="text-xs text-muted-foreground">Kind: {use.kind} reference · Context: {use.context}</p>
    {internal ? <p className="text-xs font-medium">Internal use.{primaryUse(use) ? " Self-connections are hidden by default." : ""}</p> : null}
    {use.entryId ? <p className="text-xs">Entry: {entry?.name ?? use.entryId} <code>({use.entryId})</code></p> : null}
    {use.accessPoint ? <p className="text-xs">Access point: <code>{use.accessPoint}</code></p> : null}
    {!use.entryId && !use.accessPoint ? <p className="text-xs text-muted-foreground">Entry binding not recorded.</p> : null}
    {excludedReasons(use, item).map((reason) => <p key={reason} className="text-xs text-muted-foreground">{reason}</p>)}
    <details data-section={`source-use-caller-${use.id}`} {...caller}>
      <summary className="cursor-pointer rounded-sm text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Caller source</summary>
      {caller.open ? <div className="space-y-2 pt-2">
        <p className="whitespace-pre-wrap">{note?.description ?? "Caller note not recorded."}</p>
        <InterfaceSourceLocation location={note?.location} />
        <code className="block text-xs">{use.callerRef}</code>
      </div> : null}
    </details>
  </li>;
}

function UseGroups({ baseline, item, uses, notes, disclosure }: {
  baseline: ReadonlyData<Baseline>; item: Interface; uses: readonly Use[];
  notes: ReadonlyMap<string, ReadonlyData<BaselineSourceNote>>; disclosure: InterfaceDisclosure;
}) {
  const groups = new Map<string | null, Use[]>();
  for (const use of uses) {
    const group = groups.get(use.consumerId) ?? [];
    group.push(use);
    groups.set(use.consumerId, group);
  }
  return <div className="space-y-3">{[...groups].map(([consumerId, group]) => <section key={JSON.stringify(consumerId)}
    data-consumer-group={consumerId ?? ""} className="space-y-2">
    <h4 className="font-semibold">{consumerId === null ? "Component not mapped" : componentName(baseline, consumerId)}</h4>
    <ul className="space-y-2">{group.map((use) => <UseRow key={use.id} use={use} item={item} note={notes.get(use.callerRef)} disclosure={disclosure} />)}</ul>
  </section>)}</div>;
}

export function InterfaceUsedBy({ baseline, item, assessment, disclosure }: {
  baseline: ReadonlyData<Baseline>; item: Interface;
  assessment?: ReadonlyData<BaselineSourceAssessment>; disclosure: InterfaceDisclosure;
}) {
  const source = baseline.formatVersion === 3 ? baseline.sourceUsage : undefined;
  const primary = assessment?.uses.filter(primaryUse) ?? [];
  const other = assessment?.uses.filter((use) => !primaryUse(use)) ?? [];
  const notes = new Map(assessment?.sourceNotes.map((note) => [note.evidenceRef, note]));
  const others = disclosure("other-source-references");
  return <section aria-label="Used by" className="space-y-3 text-sm wrap-anywhere">
    <h3 className="font-semibold">Used by</h3>
    <p className="text-xs text-muted-foreground">Interface-wide source use. Entry selection does not filter these records.</p>
    {!source ? <p>Source use not recorded.</p> : !assessment ? <p>Source use not assessed for this interface.</p> : <>
      {assessment.uses.length === 0 ? <p>No uses found in the reviewed scope.</p> : null}
      <p className="text-muted-foreground">Source review is partial. Other uses may exist.</p>
      <div className="space-y-1"><p className="font-semibold">Reviewed scope</p><p className="whitespace-pre-wrap">{assessment.scope}</p></div>
      {assessment.limitations.length ? <ul className="list-disc space-y-1 pl-5">{assessment.limitations.map((limit, index) => <li key={index} className="whitespace-pre-wrap">{limit}</li>)}</ul> : null}
      <UseGroups baseline={baseline} item={item} uses={primary} notes={notes} disclosure={disclosure} />
      {other.length ? <details data-section="other-source-references" {...others}>
        <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Other source references ({other.length})</summary>
        {others.open ? <div className="pt-3"><UseGroups baseline={baseline} item={item} uses={other} notes={notes} disclosure={disclosure} /></div> : null}
      </details> : null}
    </>}
    {baseline.formatVersion === 3 ? <p className="text-xs text-muted-foreground">Runtime execution is not recorded.</p> : null}
  </section>;
}
