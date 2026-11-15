import type { BaselineInterface, BaselineSystemEntryPoint } from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import { Button } from "./ui/button.tsx";

type Entry = ReadonlyData<BaselineSystemEntryPoint>;
type Interface = ReadonlyData<BaselineInterface>;

function EntryRow({ entry, interfaces, navigate }: {
  entry: Entry; interfaces: readonly Interface[];
  navigate: (panel: ArchitecturePanel, trigger: HTMLElement) => void;
}) {
  const item = interfaces.find(({ id }) => id === entry.interfaceId);
  const operation = item?.documentation?.entries.find(({ id }) => id === entry.entryId);
  return <li data-system-entry-id={entry.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3 text-sm wrap-anywhere">
    <p className="font-medium">{entry.label}</p>
    <code className="block text-xs text-muted-foreground">{entry.path}</code>
    {entry.source ? <p className="text-xs">Lines {entry.source.location.lines[0]}–{entry.source.location.lines[1]}</p> : null}
    <p className="text-xs">Evidence: {entry.evidenceRefs.map((reference, index) => <span key={reference}>
      {index ? ", " : ""}<code>{reference}</code>
    </span>)}</p>
    {item ? <Button variant="outline" className="h-auto max-w-full whitespace-normal text-left wrap-anywhere"
      data-record-id={`system-entry:${entry.id}`}
      aria-label={operation ? `Open ${operation.name} in ${item.name}` : `Open ${item.name} overview`}
      onClick={(event) => navigate({ kind: "interface", interfaceId: item.id, ...(operation ? { entryId: operation.id } : {}) }, event.currentTarget)}>
      {operation ? `Open ${operation.name} in ${item.name}` : `Open ${item.name} overview`}
    </Button> : null}
  </li>;
}

export function SystemEntryDetails({ entries, interfaces, navigate }: {
  entries: readonly Entry[]; interfaces: readonly Interface[];
  navigate: (panel: ArchitecturePanel, trigger: HTMLElement) => void;
}) {
  if (!entries.length) return null;
  return <section role="region" aria-label="System entry points" className="min-w-0 space-y-3">
    <h3 className="text-sm font-semibold">System entry points ({entries.length})</h3>
    {(["startup", "external"] as const).map((kind) => {
      const group = entries.filter((entry) => entry.kind === kind);
      if (!group.length) return null;
      const name = kind === "startup" ? "Startup" : "External";
      return <section key={kind} aria-label={name} className="space-y-2">
        <h4 className="text-sm font-semibold">{name} ({group.length})</h4>
        <ul className="space-y-2">{group.map((entry) => <EntryRow key={entry.id} entry={entry} interfaces={interfaces} navigate={navigate} />)}</ul>
      </section>;
    })}
  </section>;
}
