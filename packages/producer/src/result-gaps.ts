import { CandidateGaps } from './candidate-gaps.ts';
import { assert, evidenceBase, type Fields } from './record-checks.ts';
import { stageOneGaps, stageOneTools } from './stage-1-gaps.ts';
import { StageThreeGaps } from './stage-3-gaps.ts';
import { type DiscoveryGap, ToolGaps } from './tool-gaps.ts';

// An analysis that did not run fully keeps its result record, and a gap cites that
// result, so that the missing coverage stays visible (P4, DB5). The action that saves a
// tool record gives the required gaps of its outcomes, and the stage that publishes the
// record refuses a review that does not copy each one exactly (tool-gaps.ts).

// The selected records of a run, as the shared record checks of Stages 4 to 6 read them.
export interface SelectedHistory {
  // The registered records of the run, by artifact ID.
  readonly artifacts: ReadonlyMap<string, unknown>;
  // A registered record, as JSON or YAML data.
  document(id: unknown): unknown;
  // The working or fixed discovery. It names the selected entry analysis and resource observations.
  readonly discovery: Fields;
  // The earlier entry analyses of the selected one, from the newest to the oldest.
  readonly historyRefs: readonly unknown[];
}
// A tool result whose outcome needs a gap: its evidence reference, such as
// s2-001-knip-runs#/runs/1, and the required gap that its stage gives from it.
export interface ToolResult { readonly ref: string; readonly gap: DiscoveryGap }

// The tool results of the selected history whose outcome needs a gap (DB5). Each stage
// gives the required gaps of its tool records with its own class, and the evidence
// reference of each required gap is its tool result.
export class ToolResults {
  readonly #history: SelectedHistory;

  constructor(history: SelectedHistory) {
    this.#history = history;
  }

  // The tool results, in the order of the stages:
  // - each gap that the Stage 1 settings record or Git identity record lists, when the run registers the record;
  // - an unsupported Knip preflight, and each Knip run that failed or was skipped, of the
  //   Knip receipts that the selected entry analysis names (knipRunsRef);
  // - the symbol mentions that are partial, unavailable or skipped, and each gap of an
  //   exports record, of each Stage 3 attempt whose entry analysis is in the selected
  //   history, from the oldest attempt. An attempt outside the selected history gives none;
  // - each gap and a partial status of the behavior entry candidates that the selected
  //   entry analysis names, and of the resource access candidates that the selected
  //   resource observations name.
  list(): ToolResult[] {
    return [...this.#stageOne(), ...this.#knip(), ...this.#stageThree(), ...this.#stageFour()]
      .flatMap(gap => gap.evidenceRefs.map(ref => ({ ref, gap })));
  }

  #stageOne(): DiscoveryGap[] {
    const { artifacts, document } = this.#history;
    return stageOneTools.filter(tool => artifacts.has(tool.artifactRef)).flatMap(tool => {
      const gaps = (document(tool.artifactRef) as Fields | null)?.gaps;
      return stageOneGaps.fromRecord({ ...tool, gaps: Array.isArray(gaps) ? gaps : [] });
    });
  }

  // The Knip receipts of a Stage 2 attempt are <attempt>-knip-runs, and their required
  // gaps have the IDs <attempt>-knip-gap-NNN.
  #knip(): DiscoveryGap[] {
    const { document } = this.#history;
    const receiptsRef = String(this.#selected('entryAnalysisRef').knipRunsRef);
    const receipts = document(receiptsRef) as Fields;
    const prefix = receiptsRef.endsWith('knip-runs') ? receiptsRef.slice(0, -'knip-runs'.length) : '';
    return new ToolGaps(prefix).fromKnipRuns(receipts, receiptsRef, document(receipts.preflightRef));
  }

  #stageThree(): DiscoveryGap[] {
    const { artifacts, document, discovery, historyRefs } = this.#history;
    const attempts = [discovery.entryAnalysisRef, ...historyRefs].reverse().flatMap(ref => StageThreeGaps.ofEntryAnalysis(ref) ?? []);
    return attempts.flatMap(attempt => attempt.registered(artifacts.keys(), document));
  }

  #stageFour(): DiscoveryGap[] {
    const refs = [this.#selected('entryAnalysisRef').behaviorEntryCandidatesRef,
      this.#selected('resourceAccessRef').resourceAccessCandidatesRef];
    return refs.filter(ref => ref !== undefined).flatMap(ref => CandidateGaps.ofRecord(ref, this.#history.document(ref)));
  }

  // The selected record that the discovery names with the key, such as the entry analysis.
  #selected(key: string): Fields {
    return this.#history.document(this.#history.discovery[key]) as Fields;
  }
}

// An analysis that did not run keeps its result record, and a gap cites that record,
// so that the missing coverage stays visible. The shared record checks of Stages 4 to
// 6 check this for the Knip preflight and runs. Stage 2 finish and the Stage 3
// finalizer make the stronger check of tool-gaps.ts: the analysis copies each required
// gap exactly. A gap cites a record when one of its evidence references names the
// record, alone or with a JSON Pointer into it.
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
