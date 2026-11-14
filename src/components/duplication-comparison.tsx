import type { Baseline, DuplicationEndpoint, DuplicationFact, DuplicationFinding } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { resolveDuplicationRecordedFact } from "../domain/interface-duplication.ts";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import { duplicationEndpointName, duplicationStatusLabels } from "./duplication-view.ts";
import { Button } from "./ui/button.tsx";

function References({ values }: { values: readonly string[] }) {
  return values.length ? <p tabIndex={0} className="max-h-48 overflow-auto whitespace-pre-wrap text-xs wrap-anywhere">{values.join("\n")}</p> : null;
}

function ComparisonFact({ baseline, fact }: { baseline: ReadonlyData<Baseline>; fact: ReadonlyData<DuplicationFact> }) {
  const recorded = fact.basis === "recorded-contract" ? resolveDuplicationRecordedFact(baseline, fact) : null;
  return <section className="space-y-1 rounded border border-border p-3 text-sm wrap-anywhere">
    <h4 className="font-semibold">{duplicationEndpointName(baseline, fact.endpoint)} · {fact.topic}</h4>
    {fact.basis === "recorded-contract" ? <>
      <p className="whitespace-pre-wrap">{recorded?.value ?? "Unknown"}</p>
      <p>{recorded?.status === "accepted" ? "Accepted (recorded)" : "Proposed"}</p>
      <References values={recorded?.evidenceRefs ?? []} />
      {recorded?.acceptanceRef ? <p className="text-xs">Acceptance reference: {recorded.acceptanceRef}</p> : null}
    </> : <>
      <p className="whitespace-pre-wrap">{fact.state === "known" ? fact.value
        : `${fact.state === "unknown" ? "Unknown" : "Not applicable"}: ${fact.reason}`}</p>
      <p className="text-xs text-muted-foreground">Source review</p><References values={fact.evidenceRefs} />
    </>}
  </section>;
}

function FindingEvidence({ finding, open }: { finding: ReadonlyData<DuplicationFinding>; open: boolean }) {
  return <details data-section="duplication-evidence" open={open} className="space-y-3 text-sm wrap-anywhere">
    <summary className="cursor-pointer py-2 font-semibold">Evidence</summary>
    <p>Evidence not loaded</p><p>Structural similarity does not measure behavioral equivalence.</p>
    {finding.observations.map((observation, index) => <section key={index} className="space-y-1 border-t border-border pt-2">
      <h4 className="font-semibold">Observation {index + 1}: {observation.origin}</h4>
      <p>{observation.score === null ? "No structural score" : `Structural similarity: ${observation.score}`}</p>
      <p>Method: {observation.method}{observation.toolVersion ? ` (${observation.toolVersion})` : ""}</p>
      <References values={observation.evidenceRefs} />
    </section>)}
    <h4 className="font-semibold">Supporting references</h4><References values={finding.evidenceRefs} />
    <h4 className="font-semibold">Counterevidence</h4><References values={finding.counterevidenceRefs} />
    {finding.sources.map((source, index) => <div key={index} className="space-y-1 text-xs">
      <p>{source.snapshotId}: {source.path}:{source.lines.join("–")}</p><p>SHA-256: {source.sha256}</p><p>{source.evidenceRef}</p>
    </div>)}
    {finding.review ? <section className="space-y-1">
      <h4 className="font-semibold">Recorded review</h4>
      <p>Worker: {finding.review.worker}; model: {finding.review.model}</p>
      <p>Manager: {finding.review.manager}; reviewed: {finding.review.reviewedAt}</p>
      <p>Settings: {finding.review.settingsRef}</p><References values={finding.review.decisionRefs} />
    </section> : <p>Independent review is pending.</p>}
  </details>;
}

function EndpointButton({ baseline, endpoint, label, navigate }: {
  baseline: ReadonlyData<Baseline>; endpoint: ReadonlyData<DuplicationEndpoint>; label: string;
  navigate: (panel: ArchitecturePanel, trigger: HTMLElement) => void;
}) {
  return <Button variant="outline" className="h-auto whitespace-normal text-left wrap-anywhere" aria-label={label} data-record-id={label}
    onClick={(event) => navigate({ kind: "interface", interfaceId: endpoint.interfaceId, entryId: endpoint.entryId }, event.currentTarget)}>
    {label}: {duplicationEndpointName(baseline, endpoint)}
  </Button>;
}

export function DuplicationComparison({ baseline, finding, navigate, sections }: {
  baseline: ReadonlyData<Baseline>; finding: ReadonlyData<DuplicationFinding>;
  navigate: (panel: ArchitecturePanel, trigger: HTMLElement) => void; sections: readonly string[];
}) {
  return <div className="space-y-5 wrap-anywhere">
    <p className="font-semibold">{duplicationStatusLabels[finding.status]} — recorded judgment</p>
    <p className="text-xs text-muted-foreground">Finding: {finding.id}. This judgment applies to the recorded overlap.</p>
    {finding.endpoints.map((endpoint, index) => {
      const item = baseline.interfaces.find(({ id }) => id === endpoint.interfaceId);
      const owner = baseline.components.find(({ id }) => id === item?.owner.value);
      const label = index === 0 ? "A" : "B";
      return <section key={index} className="space-y-2">
        <h3 className="font-semibold">{label}: {duplicationEndpointName(baseline, endpoint)}</h3>
        <p className="text-sm">{owner?.name ?? "Owner unknown"} · {endpoint.interfaceId}{endpoint.entryId ? ` / ${endpoint.entryId}` : ""}</p>
        <EndpointButton baseline={baseline} endpoint={endpoint} label={`Inspect ${label}`} navigate={navigate} />
      </section>;
    })}
    <section className="space-y-2"><h3 className="font-semibold">Overlap</h3><p>{finding.overlap ?? "Overlap has not been established."}</p></section>
    <section className="space-y-2"><h3 className="font-semibold">Important differences</h3><p className="whitespace-pre-wrap">{finding.differences.join("\n\n")}</p></section>
    {finding.rationale ? <p>{finding.rationale}</p> : null}
    {finding.gaps.length ? <p className="whitespace-pre-wrap">Gaps: {finding.gaps.join("\n\n")}</p> : null}
    {finding.facts.map((fact, index) => <ComparisonFact key={index} baseline={baseline} fact={fact} />)}
    {finding.observations.map((observation, index) => observation.endpoints.some(({ entryId }) => entryId) ? <section key={index} className="space-y-2">
      <h3 className="font-semibold">Entry observation {index + 1}</h3>
      <div className="flex flex-col gap-2">{observation.endpoints.map((endpoint, side) => <EndpointButton key={side} baseline={baseline} endpoint={endpoint}
        label={`Inspect ${side === 0 ? "A" : "B"} observation ${index + 1}`} navigate={navigate} />)}</div>
    </section> : null)}
    {finding.recommendation ? <p>Proposed recommendation: {finding.recommendation}</p> : null}
    <FindingEvidence finding={finding} open={sections.includes("duplication-evidence")} />
  </div>;
}
