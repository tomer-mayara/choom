import type { BaselineInterface } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { projectInterfaceSources } from "../lib/interface-provenance.ts";
import { RecordedStatus } from "./interface-overview.tsx";
import type { InterfaceDisclosure } from "./use-interface-disclosures.ts";

export function InterfaceSources({ item, disclosure }: { item: ReadonlyData<BaselineInterface>; disclosure: InterfaceDisclosure }) {
  const view = projectInterfaceSources(item);
  const statements = disclosure("interface-statements");
  const evidence = disclosure("interface-evidence");
  const original = disclosure("original-interface-record");
  const ownerUnknown = item.owner.value === null;
  const consumersUnknown = item.allowedConsumers.value === null;
  const explanation = ownerUnknown && consumersUnknown ? "Owner and allowed consumers are unknown."
    : ownerUnknown ? "Owner is unknown." : consumersUnknown ? "Allowed consumers are unknown." : null;
  return <div className="space-y-5 text-sm wrap-anywhere">
    <section aria-label="Saved source notes" className="space-y-3">
      <h3 className="font-semibold">Saved source notes</h3>
      <p className="text-muted-foreground">These are saved notes. Choom does not load or verify their source files.</p>
      {view.notes.length ? <ul className="space-y-4">{view.notes.map(({ note, statements: supports }) => <li key={note.evidenceRef} className="space-y-3 rounded-lg border border-border p-3">
        <p className="whitespace-pre-wrap font-medium">{note.description}</p>
        {note.location ? <div className="space-y-1 text-xs">
          <code className="block">{note.location.path}</code>
          <p>Lines {note.location.lines[0]}–{note.location.lines[1]}</p>
          <p className="font-semibold">Snapshot</p><code className="block">{note.location.snapshotRef}</code>
          <p className="font-semibold">SHA-256</p><code className="block">{note.location.sha256}</code>
        </div> : <p className="text-muted-foreground">Location not recorded.</p>}
        <div className="space-y-1"><p className="font-semibold">Supports</p>
          <ul className="list-disc space-y-1 pl-4">{supports.map((statement) => <li key={statement.path}>{statement.label}</li>)}</ul>
        </div>
      </li>)}</ul> : <p>No source notes recorded.</p>}
    </section>
    {explanation ? <p className="text-muted-foreground">{explanation}</p> : null}
    <div role="group" aria-label="Interface ID" className="space-y-1"><p className="font-semibold">Interface ID</p><p>{item.id}</p></div>
    <details data-section="interface-statements" {...statements}>
      <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Recorded statements</summary>
      {statements.open ? <ul className="space-y-4 pt-3">{view.statements.map((statement) => <li key={statement.path} className="space-y-1">
        <p className="font-medium">{statement.label}</p><code className="block text-xs">{statement.path}</code>
        <RecordedStatus status={statement.status} />
        {statement.acceptanceRef ? <div><p>Acceptance reference</p><code className="text-xs">{statement.acceptanceRef}</code></div> : null}
      </li>)}</ul> : null}
    </details>
    <details data-section="interface-evidence" {...evidence}>
      <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Evidence references</summary>
      {evidence.open ? <div className="space-y-3 pt-3">
        <p className="text-muted-foreground">Evidence content is not included.</p>
        <ul className="space-y-4">{view.references.map((reference) => <li key={reference.id} className="space-y-2">
        <code className="block text-xs">{reference.id}</code>
        <p className="font-semibold">Cited by</p>
        <ul className="list-disc space-y-1 pl-4">{reference.statements.map((statement) => <li key={statement.path}>
          <p>{statement.label}</p><code className="block text-xs">{statement.path}</code>
        </li>)}</ul>
        </li>)}</ul>
      </div> : null}
    </details>
    <details data-section="original-interface-record" {...original}>
      <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Original record</summary>
      {original.open ? <div className="space-y-2 pt-3">
        <p className="text-muted-foreground">All saved field values. YAML comments and formatting are not retained.</p>
        <pre className="select-text whitespace-pre-wrap wrap-anywhere text-xs">{JSON.stringify(item, null, 2)}</pre>
      </div> : null}
    </details>
  </div>;
}
