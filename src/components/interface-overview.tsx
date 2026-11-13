import type { ReactNode } from "react";
import type { Baseline, BaselineDocumentedEntry, BaselineInterface } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { Button } from "./ui/button.tsx";
import { interfaceSourceStatements } from "../lib/interface-provenance.ts";
import type { InterfaceDisclosure } from "./use-interface-disclosures.ts";

type Interface = ReadonlyData<BaselineInterface>;
type Entry = ReadonlyData<BaselineDocumentedEntry>;

export function RecordedStatus({ status }: { status: "proposed" | "accepted" }) {
  return <p className="text-xs text-muted-foreground">{status === "accepted" ? "Accepted (recorded)" : "Proposed"}</p>;
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return <div role="group" aria-label={name} className="space-y-1 text-sm">
    <p className="font-semibold">{name}</p>{children}
  </div>;
}

function SavedText({ value }: { value: string | null }) {
  return <p className="whitespace-pre-wrap wrap-anywhere">{value ?? "Unknown"}</p>;
}

function componentName(baseline: ReadonlyData<Baseline>, id: string): string {
  const component = baseline.components.find((item) => item.id === id);
  if (!component) return id;
  return baseline.components.some((item) => item.id !== id && item.name === component.name)
    ? `${component.name} (${id})` : component.name;
}

export function InterfaceProvider({ baseline, item }: { baseline: ReadonlyData<Baseline>; item: Interface }) {
  return <Fact name="Provider">
    <p>{item.owner.value === null ? "Provider unknown" : componentName(baseline, item.owner.value)}</p>
    <RecordedStatus status={item.owner.status} />
  </Fact>;
}

export function InterfaceRecordedStatus({ item }: { item: Interface }) {
  const statements = interfaceSourceStatements(item);
  const statuses = new Set(statements.map(({ status }) => status));
  return <p className="text-xs text-muted-foreground">{statuses.size > 1 ? "Mixed recorded statuses"
    : item.owner.status === "accepted" ? "Accepted (recorded)" : "Proposed"}</p>;
}

function LegacyContract({ item, disclosure }: { item: Interface; disclosure: InterfaceDisclosure }) {
  const promises = item.promises.value;
  if (!promises || Object.values(promises).every((value) => value === null)) return <div className="space-y-1 text-sm">
    <p>Behavior is not recorded.</p><RecordedStatus status={item.promises.status} />
  </div>;
  return <div className="space-y-4">
    <Fact name="Behavior"><SavedText value={promises.behavior} /></Fact>
    <Fact name="Data exchanged"><SavedText value={promises.data} /></Fact>
    <Fact name="Failures"><SavedText value={promises.errors} /></Fact>
    <details data-section="interface-lifecycle" {...disclosure("interface-lifecycle")}>
      <summary className="cursor-pointer rounded-sm text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">What changes and when it ends</summary>
      <div className="pt-2 text-sm"><SavedText value={promises.lifecycle} /></div>
    </details>
    <RecordedStatus status={item.promises.status} />
  </div>;
}

function EntryInteraction({ entry }: { entry: Entry }) {
  if (!["function", "command", "workflow"].includes(entry.kind.value ?? "")) return null;
  if (!entry.interaction) return <p className="text-sm text-muted-foreground">Interaction details not recorded.</p>;
  const facts = entry.interaction.value;
  const unknown = Object.values(facts).every((value) => value === null);
  return <div role="group" aria-label="Interaction" className="space-y-3">
    {unknown ? <p className="text-sm text-muted-foreground">Interaction facts are unknown.</p> : <>
      <Fact name="Input"><SavedText value={facts.input} /></Fact>
      <Fact name="Success"><SavedText value={facts.success} /></Fact>
      <Fact name="Failures"><SavedText value={facts.failures} /></Fact>
      <Fact name="Effects"><SavedText value={facts.effects} /></Fact>
    </>}
    <RecordedStatus status={entry.interaction.status} />
  </div>;
}

function EntryDetails({ entry, duplicateName }: { entry: Entry; duplicateName: boolean }) {
  return <section aria-label="Selected entry" className="space-y-4 rounded-lg border border-border p-3">
    <h3 className="font-semibold">{entry.name}</h3>
    {duplicateName ? <code className="block text-xs text-muted-foreground">{entry.id}</code> : null}
    <Fact name="Entry reference"><code className="wrap-anywhere">{entry.accessPoint}</code></Fact>
    <Fact name="Kind"><p>{entry.kind.value ?? "Kind is unknown."}</p><RecordedStatus status={entry.kind.status} /></Fact>
    <Fact name="Description"><p className="whitespace-pre-wrap">{entry.description.value ?? "Description is unknown."}</p><RecordedStatus status={entry.description.status} /></Fact>
    <EntryInteraction entry={entry} />
  </section>;
}

export function InterfaceOverview({ baseline, item, entry, selectEntry, disclosure }: {
  baseline: ReadonlyData<Baseline>; item: Interface; entry?: Entry; selectEntry: (id: string) => void; disclosure: InterfaceDisclosure;
}) {
  const entries = item.documentation?.entries ?? [];
  const unmatched = item.publicAccess.value?.filter((value) => !entries.some(({ accessPoint }) => accessPoint === value));
  const hasDetail = entry && (entry.description.value !== null
    || (entry.interaction && Object.values(entry.interaction.value).some((value) => value !== null)));
  return <div className="space-y-5">
    {item.documentation ? <Fact name="Purpose"><SavedText value={item.documentation.summary.value} /><RecordedStatus status={item.documentation.summary.status} /></Fact> : null}
    {!entry ? <LegacyContract item={item} disclosure={disclosure} /> : null}
    <section aria-label="Entry points" className="space-y-3">
      <h3 className="font-semibold">Entry points</h3>
      {entries.length ? <div className="flex flex-col gap-2">{entries.map((candidate) => <Button key={candidate.id} variant="outline"
        aria-label={`${candidate.name}, ${candidate.id}`} aria-pressed={entry?.id === candidate.id}
        className="h-auto justify-start whitespace-normal text-left wrap-anywhere aria-pressed:border-primary aria-pressed:bg-muted"
        onClick={() => selectEntry(candidate.id)}>
        <span>{candidate.name}{entries.some((other) => other.id !== candidate.id && other.name === candidate.name)
          ? <code className="block text-xs text-muted-foreground">{candidate.id}</code> : null}</span>
      </Button>)}</div> : null}
      {item.publicAccess.value === null ? <p className="text-sm">Entry references are unknown.</p>
        : unmatched?.map((value, index) => <Fact key={`${index}-${value}`} name="Recorded entry reference"><code className="wrap-anywhere">{value}</code></Fact>)}
      <RecordedStatus status={item.publicAccess.status} />
    </section>
    {entry ? <EntryDetails key={entry.id} entry={entry} duplicateName={entries.some((other) => other.id !== entry.id && other.name === entry.name)} /> : null}
    {entry && hasDetail ? <details data-section="interface-wide-contract" {...disclosure("interface-wide-contract")}>
      <summary className="cursor-pointer rounded-sm text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Interface-wide contract</summary>
      <div className="pt-3"><LegacyContract item={item} disclosure={disclosure} /></div>
    </details> : entry ? <LegacyContract item={item} disclosure={disclosure} /> : null}
    <details data-section="interface-access-rule" {...disclosure("interface-access-rule")}>
      <summary className="cursor-pointer rounded-sm text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Access rule</summary>
      <div className="space-y-2 pt-2 text-sm">
        {item.allowedConsumers.value === null ? <p>Permitted components are not recorded.</p>
          : <><p>Permitted components:</p><ul className="list-disc space-y-1 pl-5">{item.allowedConsumers.value.map((id) => <li key={id}>{componentName(baseline, id)}</li>)}</ul></>}
        <p>Call activity is not recorded. This rule states permission in the baseline, not runtime authorization.</p>
        <RecordedStatus status={item.allowedConsumers.status} />
      </div>
    </details>
  </div>;
}
