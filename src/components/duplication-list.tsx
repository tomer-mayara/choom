import { useState } from "react";
import type { Baseline, DuplicationFinding, DuplicationReport } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import { duplicationEndpointName, duplicationStatusLabels, findingsForRecord } from "./duplication-view.ts";
import { Button } from "./ui/button.tsx";

function DuplicationSummary({ report }: { report: ReadonlyData<DuplicationReport> }) {
  const { scan, review } = report;
  const incomplete = scan.status !== "completed" || review.status !== "completed" || scan.mappingGaps.length > 0
    || review.gaps.length > 0 || scan.counts.unmapped !== 0;
  const failed = scan.status === "failed" || scan.status === "skipped";
  const notes = [...scan.diagnostics, ...scan.mappingGaps, ...review.gaps].join("\n\n");
  return <section aria-label="Assessment coverage" className="space-y-3 text-sm wrap-anywhere">
    <p>Report: {report.id}</p><p>Created: {report.createdAt}</p>
    <p>Baseline: {report.baseline.id} (version {report.baseline.formatVersion})</p>
    <p className="text-xs text-muted-foreground">SHA-256: {report.baseline.sha256}</p>
    {incomplete ? <p className="font-semibold">Assessment incomplete</p> : null}
    {failed ? <p>Detection was not completed</p> : null}
    <p>Scan: {scan.status}. Review: {review.status}.</p>
    <ul className="space-y-1">{Object.entries(duplicationStatusLabels).map(([status, label]) =>
      <li key={status}>{label}: {report.findings.filter((finding) => finding.status === status).length}</li>)}</ul>
    <p>Helper-only candidates: {scan.counts.helperOnly ?? "Unknown"}. Unmapped candidates: {scan.counts.unmapped ?? "Unknown"}.</p>
    <p>Examined: {scan.counts.examined ?? "Unknown"}. Excluded: {scan.counts.excluded ?? "Unknown"}. Unsupported: {scan.counts.unsupported ?? "Unknown"}.</p>
    {notes ? <div role="region" aria-label="Coverage notes" tabIndex={0} className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-border p-2">
      <p>{notes}</p>
    </div> : null}
    {!failed && !incomplete && report.findings.length === 0 ? <p>No public-interface candidate pairs found in the recorded scope</p> : null}
    {report.findings.length > 0 && report.findings.every(({ status }) => status === "justified-distinction")
      ? <p>All recorded pairs have reviewed distinctions</p> : null}
  </section>;
}

function FindingRow({ baseline, finding, navigate }: {
  baseline: ReadonlyData<Baseline>; finding: ReadonlyData<DuplicationFinding>;
  navigate: (panel: ArchitecturePanel, trigger: HTMLElement) => void;
}) {
  const names = finding.endpoints.map((endpoint) => duplicationEndpointName(baseline, endpoint)).join(" ↔ ");
  return <li><Button variant="outline" className="h-auto w-full flex-col items-start gap-2 whitespace-normal text-left wrap-anywhere"
    data-finding-id={finding.id} data-record-id={finding.id} aria-label={`Compare ${names}, ${finding.id}`}
    onClick={(event) => navigate({ kind: "duplicate", findingId: finding.id }, event.currentTarget)}>
    <span className="font-semibold">{names}</span><span>{duplicationStatusLabels[finding.status]}</span>
    {finding.endpoints.map((endpoint, index) => {
      const item = baseline.interfaces.find(({ id }) => id === endpoint.interfaceId);
      const owner = baseline.components.find(({ id }) => id === item?.owner.value);
      return <span key={index} className="text-xs">{index === 0 ? "A" : "B"}: {owner?.name ?? "Owner unknown"} · {endpoint.interfaceId}{endpoint.entryId ? ` / ${endpoint.entryId}` : ""}</span>;
    })}
    <span>{finding.overlap ?? "Overlap has not been established."}</span>
  </Button></li>;
}

export function DuplicationList({ baseline, report, filter, navigate, listState }: {
  baseline: ReadonlyData<Baseline>; report?: ReadonlyData<DuplicationReport>;
  filter: { componentId?: string; interfaceId?: string };
  navigate: (panel: ArchitecturePanel, trigger: HTMLElement) => void;
  listState?: { showDistinctions: boolean };
}) {
  const [showDistinctions, setShowDistinctions] = useState(listState?.showDistinctions ?? false);
  if (!report) return <p>No duplication report loaded</p>;
  const filtered = findingsForRecord(baseline, report.findings, filter);
  const visible = filtered.filter(({ status }) => showDistinctions || status !== "justified-distinction");
  const origin = baseline.interfaces.find(({ id }) => id === filter.interfaceId)?.name
    ?? baseline.components.find(({ id }) => id === filter.componentId)?.name;
  return <div className="space-y-5">
    <DuplicationSummary report={report} />
    {origin ? <h3 className="font-semibold wrap-anywhere">Findings for {origin}</h3> : null}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDistinctions}
      onChange={(event) => {
        setShowDistinctions(event.currentTarget.checked);
        if (listState) listState.showDistinctions = event.currentTarget.checked;
      }} />Show reviewed distinctions</label>
    {visible.length ? <ul className="space-y-3">{visible.map((finding) => <FindingRow key={finding.id} baseline={baseline} finding={finding} navigate={navigate} />)}</ul>
      : <p className="text-sm text-muted-foreground">No findings in this view.</p>}
  </div>;
}
