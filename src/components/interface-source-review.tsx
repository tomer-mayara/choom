import type { BaselineSourceAssessment, BaselineSourceUsage } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { projectInterfaceSources } from "../lib/interface-provenance.ts";
import { InterfaceSourceLocation } from "./interface-source-location.tsx";
import type { InterfaceDisclosure } from "./use-interface-disclosures.ts";

export function InterfaceSourceReview({ source, assessment, notes, disclosure }: {
  source?: ReadonlyData<BaselineSourceUsage>; assessment?: ReadonlyData<BaselineSourceAssessment>;
  notes: ReturnType<typeof projectInterfaceSources>["usageNotes"]; disclosure: InterfaceDisclosure;
}) {
  const original = disclosure("original-source-assessment");
  return <section aria-label="Source-use review" className="space-y-3">
    <h3 className="font-semibold">Source-use review</h3>
    {!source ? <p>Source use not recorded.</p> : <>
      <div className="space-y-1"><p className="font-semibold">Source snapshot</p><code className="block text-xs">{source.snapshotRef}</code></div>
      <div className="space-y-1"><p className="font-semibold">Code mapping</p><code className="block text-xs">{source.mappingRef}</code></div>
      <p className="text-muted-foreground">Component assignments depend on the saved mapping. Choom does not verify it.</p>
      {!assessment ? <p>Source use not assessed for this interface.</p> : <>
        <p className="text-muted-foreground">Source review is partial. These observations do not establish permission or runtime execution.</p>
        <div className="space-y-1"><p className="font-semibold">Reviewed scope</p><p className="whitespace-pre-wrap">{assessment.scope}</p></div>
        {assessment.limitations.length ? <div className="space-y-1"><p className="font-semibold">Review limits</p>
          <ul className="list-disc space-y-1 pl-5">{assessment.limitations.map((limit, index) => <li key={index} className="whitespace-pre-wrap">{limit}</li>)}</ul>
        </div> : null}
        {notes.length ? <ul className="space-y-3">{notes.map(({ note, uses, scope }) => {
          const key = `source-note-uses-${note.evidenceRef}`;
          const citations = disclosure(key);
          return <li key={note.evidenceRef} className="space-y-2 rounded-lg border border-border p-3">
          <p className="whitespace-pre-wrap font-medium">{note.description}</p>
          <InterfaceSourceLocation location={note.location} />
          {scope ? <p className="text-xs">Supports the reviewed scope.</p> : null}
          {uses.length ? <details data-section={key} {...citations}>
            <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Source uses ({uses.length})</summary>
            {citations.open ? <ul className="list-disc space-y-2 pt-2 pl-4">{uses.map((use) => <li key={use.id}>
              <code className="text-xs">{use.id}</code><p className="whitespace-pre-wrap">{use.description}</p>
            </li>)}</ul> : null}
          </details> : null}
        </li>; })}</ul> : <p>No source-use notes recorded.</p>}
        <details data-section="original-source-assessment" {...original}>
          <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Original source assessment</summary>
          {original.open ? <pre className="pt-3 select-text whitespace-pre-wrap wrap-anywhere text-xs">{JSON.stringify({
            snapshotRef: source.snapshotRef, mappingRef: source.mappingRef, assessment,
          }, null, 2)}</pre> : null}
        </details>
      </>}
    </>}
  </section>;
}
