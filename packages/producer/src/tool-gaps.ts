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
interface RecordGap { kind?: unknown; subjectRefs?: unknown; reason?: unknown }
// A tool outcome that needs a gap: its reason and the record that shows it.
interface Outcome { reason: string; evidenceRef: string }

// The discovery contract limits a gap reason to 16 KiB of UTF-8.
const reasonLimit = 16 * 1024;
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

export class ToolGaps {
  readonly #prefix: string;

  // `prefix` starts each gap ID: s1- for Stage 1, and the attempt ID and a hyphen for Stage 2.
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
    return outcomes.map(({ reason, evidenceRef }, index) => ({ id: this.id('knip', index), kind: 'tool-outcome',
      subjectRefs: [snapshotRef], reason, evidenceRefs: [evidenceRef] }));
  }
}
