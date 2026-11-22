import { isDeepStrictEqual as same } from 'node:util';
import type { RequiredGaps } from './generated/contracts.ts';
import { assert, type Fields, object, strings, text } from './record-checks.ts';

// The gaps that a stage gives from the records of its tools, so that a gap that a
// tool found does not depend on the review. Each gap gets a stable ID from the ID
// prefix of the stage, the name of the tool record and the position of the gap,
// such as s1-settings-gap-001, and cites its place in the tool record as evidence.
// A gap has the fields of a discovery gap, as the required-gaps record holds it
// (cookbook/interfaces/producer-run-records.tsp).
export type DiscoveryGap = RequiredGaps['gaps'][number];
// A saved tool record: its name in the gap IDs, its artifact ID and its gaps.
export interface ToolRecord { readonly name: string; readonly artifactRef: string; readonly gaps: readonly unknown[] }
// A saved Stage 4 candidate record: its name in the gap IDs, its artifact ID, the words
// that name it in a reason, such as behavior entry candidates, and the record.
export interface CandidateRecord { readonly name: string; readonly artifactRef: string; readonly label: string; readonly record: unknown }
interface RecordGap { kind?: unknown; subjectRefs?: unknown; reason?: unknown }
// A tool outcome that needs a gap: its reason and the record that shows it.
interface Outcome { reason: string; evidenceRef: string }

// The discovery contract limits a gap reason to 16 KiB of UTF-8.
const reasonLimit = 16 * 1024;
// The first sentence of the gap of the symbol mentions, by their status. Completed symbol mentions need no gap.
const symbolOutcomes: Readonly<Record<string, string | null>> = {
  completed: null,
  partial: 'The symbol mentions are partial: they cover only the exports and types that the completed Knip runs reported.',
  unavailable: 'The symbol mentions are unavailable: no Knip run completed, so they cover no reported export or type.',
  skipped: 'The symbol mentions are skipped: Knip did not run, so they cover no reported export or type.',
};
const knipStatuses = ['completed', 'failed', 'skipped'];
const listed = (value: unknown): string[] => Array.isArray(value) ? value.filter(text) : [];
const sentence = (value: string): string => /[.!?]$/.test(value.trimEnd()) ? value.trimEnd() : value.trimEnd() + '.';

// A gap reason: the first sentence, and then each reason of the record as a sentence.
// When the reasons do not fit in the limit, the reason gives the number of the reasons
// that it leaves out. The cited record keeps them all.
function reasonText(first: string, reasons: readonly string[], ref: string): string {
  const sentences = reasons.map(sentence);
  const whole = [first, ...sentences].join(' ');
  if (Buffer.byteLength(whole) <= reasonLimit) return whole;
  const rest = (count: number): string => ` ${count} more ${count === 1 ? 'reason is' : 'reasons are'} in ${ref}.`;
  let reason = first;
  let count = 0;
  while (count < sentences.length && Buffer.byteLength(reason + ' ' + sentences[count] + rest(sentences.length)) <= reasonLimit)
    reason += ' ' + sentences[count++];
  return reason + rest(sentences.length - count);
}

// What the record of a failed Knip run shows: a time limit, a signal, an exit code
// other than 0 and 1, the errors of the command and a report that is not valid.
function failureReasons(run: Fields): string[] {
  const reasons: string[] = [];
  if (run.timedOut === true) reasons.push('The run reached its time limit.');
  if (text(run.signal)) reasons.push(`The run stopped on the signal ${run.signal}.`);
  if (typeof run.exitCode === 'number' && run.exitCode !== 0 && run.exitCode !== 1)
    reasons.push(`The run exited with code ${run.exitCode}.`);
  reasons.push(...listed(run.errors));
  const report = object(run.report) ? run.report : {};
  if (report.valid === false && text(report.error)) reasons.push(`The report is not valid: ${report.error}`);
  return reasons;
}

// A settings gap of the behavior entry candidates (kind unknown-settings-value) names
// its file and the range of the value, and no subjects. As a required gap, its subject
// is its file, and its reason first names the rule and the start of the value. Any
// other gap stays as it is, and fromRecord refuses a gap without subjects.
function locatedGap(gap: unknown): unknown {
  if (!object(gap) || gap.kind !== 'unknown-settings-value') return gap;
  const [start] = Array.isArray(gap.range) ? gap.range as unknown[] : [];
  const { line, column } = object(start) ? start : {};
  if (!text(gap.path) || !text(gap.ruleId) || !text(gap.reason) || !Number.isSafeInteger(line) || !Number.isSafeInteger(column))
    return gap;
  return { kind: gap.kind, subjectRefs: [gap.path], reason: `The behavior entry rule ${gap.ruleId} (version ` +
    `${String(gap.ruleVersion)}) cannot read the value at line ${String(line)}, column ${String(column)} of ${gap.path}. ${gap.reason}` };
}

export class ToolGaps {
  // The name of the Knip outcomes in the gap IDs, as in s2-001-knip-gap-001.
  static readonly knip = 'knip';
  // The name of the Stage 3 symbol mentions in the gap IDs, as in s3-001-symbol-mentions-gap-001.
  static readonly symbolMentions = 'symbol-mentions';
  readonly #prefix: string;

  // `prefix` starts each gap ID: s1- for Stage 1, and the attempt ID and a hyphen for Stages 2 and 3.
  constructor(prefix: string) {
    this.#prefix = prefix;
  }

  // The ID of gap N (from 0) of the named tool record: the prefix, the name, -gap- and N + 1 in three digits.
  id(name: string, index: number): string {
    return this.#prefix + name + '-gap-' + String(index + 1).padStart(3, '0');
  }

  // The gaps that a tool record lists, each with the kind, subjects and reason of the record.
  fromRecord({ name, artifactRef, gaps }: ToolRecord): DiscoveryGap[] {
    return gaps.map((value, index) => {
      const pointer = artifactRef + '#/gaps/' + index;
      const gap = value as RecordGap | null;
      assert(text(gap?.kind) && strings(gap.subjectRefs) && text(gap.reason), 'Invalid gap in the tool record: ' + pointer);
      return { id: this.id(name, index), kind: gap.kind, subjectRefs: [...gap.subjectRefs], reason: gap.reason,
        evidenceRefs: [pointer] };
    });
  }

  // The gaps of the Knip outcomes: one for a preflight that marked the profile
  // unsupported, which cites the preflight record, and one for each run that was
  // skipped or failed, which cites the run in the Knip receipts, as
  // <receiptsRef>#/runs/N. Each gap has kind tool-outcome, the snapshot ID as its
  // subject and the reasons of its record, and the ID <prefix>knip-gap-NNN.
  fromKnipRuns(receipts: unknown, receiptsRef: string, preflight: unknown): DiscoveryGap[] {
    const runs = object(receipts) ? receipts.runs : undefined;
    assert(object(receipts) && text(receipts.snapshotRef) && text(receipts.preflightRef) && Array.isArray(runs) &&
      runs.every(run => object(run) && text(run.mode)) && object(preflight), 'Invalid Knip receipts: ' + receiptsRef);
    const { snapshotRef, preflightRef } = receipts;
    const outcomes: Outcome[] = preflight.status === 'unsupported' ? [{ evidenceRef: preflightRef,
      reason: reasonText('Knip preflight marked the profile unsupported.', listed(preflight.reasons), preflightRef) }] : [];
    (runs as Fields[]).forEach((run, index) => {
      const evidenceRef = `${receiptsRef}#/runs/${index}`;
      if (run.status === 'skipped')
        outcomes.push({ evidenceRef, reason: reasonText(`The ${run.mode} Knip run was skipped.`, listed(run.reasons), evidenceRef) });
      if (run.status === 'failed')
        outcomes.push({ evidenceRef, reason: reasonText(`The ${run.mode} Knip run failed.`, failureReasons(run), evidenceRef) });
    });
    return outcomes.map(({ reason, evidenceRef }, index) => ({ id: this.id(ToolGaps.knip, index), kind: 'tool-outcome',
      subjectRefs: [snapshotRef], reason, evidenceRefs: [evidenceRef] }));
  }

  // The gap of the symbol mentions of Stage 3 collect, whose record is `ref`: one gap
  // when their status is partial, unavailable or skipped, and none when it is completed.
  // The gap has kind tool-outcome, the snapshot ID as its subject, the outcome and each
  // Knip run that did not complete as its reason, the ID <prefix>symbol-mentions-gap-001,
  // and cites the record.
  fromSymbolMentions(record: unknown, ref: string): DiscoveryGap[] {
    const reports = object(record) ? record.reports : undefined;
    assert(object(record) && text(record.snapshotRef) && text(record.knipRunsRef) && typeof record.status === 'string' &&
      Object.hasOwn(symbolOutcomes, record.status) && Array.isArray(reports) &&
      reports.every(report => object(report) && text(report.mode) && knipStatuses.includes(report.status as string)),
    'Invalid symbol mentions: ' + ref);
    const outcome = symbolOutcomes[record.status];
    if (!outcome) return [];
    const reasons = (reports as Fields[]).filter(report => report.status !== 'completed').map(({ mode, status }) =>
      `The ${String(mode)} Knip run of ${String(record.knipRunsRef)} ${status === 'failed' ? 'failed' : 'was skipped'}.`);
    return [{ id: this.id(ToolGaps.symbolMentions, 0), kind: 'tool-outcome', subjectRefs: [record.snapshotRef],
      reason: reasonText(outcome, reasons, ref), evidenceRefs: [ref] }];
  }

  // The gaps of a Stage 3 exports record, whose name in the gap IDs is `name`, such as
  // exports-001, and whose record is `ref`: one gap for each compiler input that the
  // snapshot does not hold. Each gap has the kind, subjects and reason of the record, as
  // fromRecord gives them: its subject is the snapshot file that names the input.
  fromExports(name: string, record: unknown, ref: string): DiscoveryGap[] {
    assert(object(record) && Array.isArray(record.gaps), 'Invalid exports record: ' + ref);
    return this.fromRecord({ name, artifactRef: ref, gaps: record.gaps });
  }

  // The gaps of a Stage 4 candidate record (DB5): each gap that the record lists, as
  // fromRecord gives it, and then one gap for a record with status partial, which the
  // candidate limit cut. A settings gap gets its file as its subject (see locatedGap);
  // a gap of a compiler input has the subjects of the record, the snapshot file that
  // names the input. The gap of a partial record has kind tool-outcome, the snapshot ID
  // as its subject, and cites <artifactRef>#/status.
  fromCandidateRecord({ name, artifactRef, label, record }: CandidateRecord): DiscoveryGap[] {
    const { gaps, candidates, omittedCandidates, snapshotRef, status } = object(record) ? record : {};
    const omitted = Number.isSafeInteger(omittedCandidates) ? omittedCandidates as number : -1;
    assert(Array.isArray(gaps) && Array.isArray(candidates) && text(snapshotRef) && omitted >= 0 &&
      status === (omitted > 0 ? 'partial' : 'completed'), 'Invalid candidate record: ' + artifactRef);
    const listedGaps = this.fromRecord({ name, artifactRef, gaps: gaps.map(locatedGap) });
    if (status !== 'partial') return listedGaps;
    return [...listedGaps, { id: this.id(name, listedGaps.length), kind: 'tool-outcome', subjectRefs: [snapshotRef],
      reason: `The ${label} are partial: the record keeps the first ${candidates.length} candidates and leaves out ${omitted}.`,
      evidenceRefs: [artifactRef + '#/status'] }];
  }

  // Refuses a review whose gaps leave out or change one of the required gaps. A review
  // keeps each required gap exactly, in any place of its gaps. No ID form is reserved:
  // a gap of the review with the ID of a required gap must be that gap. `source` is the
  // artifact ID of the saved required gaps.
  static checkCopied(required: readonly DiscoveryGap[], gaps: readonly unknown[], source: string): void {
    const copies = new Map(gaps.map(item => [object(item) ? item.id : undefined, item]));
    for (const gap of required) {
      assert(copies.has(gap.id), `The entry analysis leaves out the required gap ${gap.id}. Copy each gap of ${source} exactly.`);
      assert(same(copies.get(gap.id), gap), `The entry analysis changes the required gap ${gap.id}. Copy each gap of ${source} exactly.`);
    }
  }
}
