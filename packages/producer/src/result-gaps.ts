import { CandidateGaps } from './candidate-gaps.ts';
import { assert, evidenceBase, type Fields } from './record-checks.ts';
import { stageOneGaps, stageOneTools } from './stage-1-gaps.ts';
import { StageThreeGaps } from './stage-3-gaps.ts';
import { type DiscoveryGap, ToolGaps } from './tool-gaps.ts';

// An analysis that did not run fully keeps its result record, and a gap cites that
// result, so that the missing coverage stays visible (P4, DB5). The action that saves a
// tool record gives the required gaps of its outcomes, and the stage that publishes the
// record refuses a review that does not copy each one exactly (tool-gaps.ts). Later
// stages keep each question and gap unchanged. The shared record checks of Stages 4
// to 6 then check the completion rule again for all the selected tool results: each
// one has a gap whose evidence cites it.

// The selected records of a run, as the shared record checks of Stages 4 to 6 read them.
export interface SelectedHistory {
  // The registered records of the run, by artifact ID.
  readonly artifacts: ReadonlyMap<string, unknown>;
  // A registered record, as JSON or YAML data.
  document(id: unknown): unknown;
  // The working or fixed discovery. It names the selected entry analysis and resource
  // observations, and it has the gaps.
  readonly discovery: Fields;
  // The earlier entry analyses of the selected one, from the newest to the oldest.
  readonly historyRefs: readonly unknown[];
}
// A tool result whose outcome needs a gap: its evidence reference, such as
// s2-001-knip-runs#/runs/1, and the required gap that its stage gives from it.
export interface ToolResult { readonly ref: string; readonly gap: DiscoveryGap }

// The JSON Pointer of an evidence reference, decoded as the evidence checks decode it,
// or '' when the reference names the whole record.
function pointerOf(ref: string): string {
  const split = ref.indexOf('#');
  return split < 0 ? '' : decodeURIComponent(ref.slice(split + 1));
}

// True when an evidence reference cites the tool result: it names the record of the
// result, and the result is the whole record, or the JSON Pointer of the reference is
// the pointer of the result or a pointer inside it. So a reference to one Knip run, or
// to the whole Knip receipts, does not cite the other run.
function citesResult(ref: unknown, result: string): boolean {
  if (typeof ref !== 'string' || evidenceBase(ref) !== evidenceBase(result)) return false;
  const [pointer, part] = [pointerOf(ref), pointerOf(result)];
  return part === '' || pointer === part || pointer.startsWith(part + '/');
}

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

  // Refuses the first tool result that no gap of the discovery cites. Any gap can cite
  // it, also a gap of an earlier stage; the stages check the exact copy of the required gaps.
  check(): void {
    const gaps = this.#history.discovery.gaps;
    const refs = (Array.isArray(gaps) ? gaps : []).flatMap(gap => {
      const evidenceRefs = (gap as Fields | null | undefined)?.evidenceRefs;
      return Array.isArray(evidenceRefs) ? evidenceRefs as unknown[] : [];
    });
    for (const { ref } of this.list())
      assert(refs.some(item => citesResult(item, ref)), `The tool result ${ref} has no gap that cites it. Record a gap that cites ${ref}.`);
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
