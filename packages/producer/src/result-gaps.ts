import { assert, evidenceBase, type Fields } from './record-checks.ts';

// An analysis that did not run keeps its result record, and a gap cites that record,
// so that the missing coverage stays visible. Each stage checks this where it accepts
// such a result: the shared record checks of Stages 4 to 6 for the Knip preflight and
// runs, and the Stage 3 finalizer for the symbol mentions. Stage 2 finish makes the
// stronger check of tool-gaps.ts: the analysis copies each required gap exactly. A gap
// cites a record when one of its evidence references names the record, alone or with
// a JSON Pointer into it.
export interface KnipResults {
  // The questions and gaps that the stage accepts with the results.
  gaps: unknown;
  preflightRef: unknown;
  preflight: Fields;
  runsRef: unknown;
  runs: Fields;
}

function cited(gaps: unknown, ref: unknown): boolean {
  return Array.isArray(gaps) && gaps.some(gap => {
    const evidenceRefs = (gap as Fields | null | undefined)?.evidenceRefs;
    return Array.isArray(evidenceRefs) && evidenceRefs.some(item => typeof item === 'string' && evidenceBase(item) === ref);
  });
}

// A Knip profile that preflight marked unsupported needs a gap that cites the
// preflight record. A Knip mode that failed or was skipped needs a gap that cites the
// Knip runs record.
export function checkKnipResultGaps({ gaps, preflightRef, preflight, runsRef, runs }: KnipResults): void {
  if (preflight.status === 'unsupported') assert(cited(gaps, preflightRef),
    `The Knip preflight ${String(preflightRef)} marks the profile unsupported. Record a gap that cites ${String(preflightRef)}.`);
  for (const run of (Array.isArray(runs.runs) ? runs.runs : []) as Fields[]) {
    if (run?.status !== 'failed' && run?.status !== 'skipped') continue;
    assert(cited(gaps, runsRef), `The ${String(run.mode)} Knip run in ${String(runsRef)} has the status ${run.status}. ` +
      `Record a gap that cites ${String(runsRef)}.`);
  }
}

// Symbol mentions that are unavailable or skipped need a gap that cites their record.
export function checkSymbolResultGap(gaps: unknown, ref: string, status: unknown): void {
  if (status === 'unavailable' || status === 'skipped')
    assert(cited(gaps, ref), `The symbol mentions in ${ref} have the status ${status}. Record a gap that cites ${ref}.`);
}
