import { useMemo, useState } from "react";
import type { Baseline, IsolationInput } from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import type { LoadWorkflowSnapshot } from "../architecture/workspace-view.ts";
import { IsolationEvidenceView, type ComparisonSide, type VisibleChange } from "../lib/isolation-evidence.ts";

type Pair = NonNullable<LoadWorkflowSnapshot["comparison"]>;

function FileIdentity({ name, input }: { name: string; input: ReadonlyData<IsolationInput> }) {
  const file = input.baseline;
  const identity = file.formatVersion === 6 && file.boundaryReview.identity;
  return <div className="min-w-0 space-y-0.5 rounded border border-border p-2">
    <h3 className="font-semibold">{name} · {file.id}</h3>
    {identity && <p>{identity.projectKey} · {identity.sourceKind === "working-tree" ? "Working tree" : "Snapshot"} · {identity.snapshotRef}
      {identity.baseCommit && ` · ${identity.baseCommit}`}</p>}
    <p className="break-all">File SHA-256 · <code>{input.sha256}</code></p>
  </div>;
}

function Evidence({ name, side }: { name: string; side: ComparisonSide }) {
  return <section aria-label={`${name} evidence`} className="min-w-0 space-y-1 rounded border border-border p-2">
    <h4 className="font-semibold">{name} evidence</h4>
    <p>{side.caller} → {side.target} · {side.roles.join(", ")}</p>
    {side.rule && <p>{side.rule}</p>}
    <ul className="list-inside list-disc">{side.evidence.map((line, index) => <li key={index}>{line}</li>)}</ul>
  </section>;
}

function projector(baseline: ReadonlyData<Baseline>, showAll: boolean) {
  return baseline.formatVersion === 6 ? new IsolationEvidenceView(baseline, showAll) : undefined;
}

export function IsolationComparisonPanel({ pair, after, showAll }: { pair: Pair; after: ReadonlyData<IsolationInput>; showAll: boolean }) {
  const findings = useMemo(() => {
    const left = projector(pair.before.baseline, showAll), right = projector(after.baseline, showAll);
    return pair.result.findings.flatMap(finding => {
      const before = left?.describe(finding.before), after = right?.describe(finding.after);
      if (before || after || (!finding.before && !finding.after)) return [{ before, after, finding }];
      return [];
    });
  }, [pair, after, showAll]);
  const [expanded, setExpanded] = useState<VisibleChange["finding"]>();
  const stale = [after.baseline, pair.before.baseline].some(file => file.formatVersion === 6 && file.boundaryReview.status === "needs-refresh");
  const newCount = findings.filter(item => item.finding.change === "New violation").length;
  return <section aria-label="Isolation comparison" className="max-h-[54vh] shrink-0 space-y-2 overflow-auto border-b border-border bg-card px-4 py-3 text-sm wrap-anywhere">
    <h2 className="text-base font-semibold">Isolation comparison</h2><p>Before → After</p>
    <div className="grid gap-2 text-xs sm:grid-cols-2"><FileIdentity name="Before" input={pair.before} /><FileIdentity name="After" input={after} /></div>
    {pair.result.status === "identical" ? <p>Identical input files</p> : <>
      {stale && <p>Comparison limited · Needs refresh</p>}
      {newCount === 0 && pair.result.complete && !stale && <p>No new production violations in the compared scope</p>}
      {newCount === 0 && !pair.result.complete && !stale && <p>Comparison limited · Available checks do not establish an all-clear.</p>}
      <ul className="space-y-1">{findings.map(({ finding, before, after: next }, index) => {
        const side = next ?? before;
        const open = expanded === finding;
        return <li key={index}>
          <button type="button" aria-expanded={open} className="w-full rounded border border-border px-2 py-1.5 text-left focus-visible:outline"
            onClick={() => setExpanded(open ? undefined : finding)}>
            <strong>{finding.change}</strong>{finding.reason.startsWith("First observed") && " · First observed in After"}{side && ` · ${side.caller} → ${side.target} · ${side.roles.join(", ")}`}
            {side?.rule && ` · ${side.rule}`}
          </button>
          {open && <div className="space-y-1 p-2 text-xs">
            <p>{finding.reason}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {before && <Evidence name="Before" side={before} />}{next && <Evidence name="After" side={next} />}
            </div>
          </div>}
        </li>;
      })}</ul>
    </>}
  </section>;
}
