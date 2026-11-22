import { isDeepStrictEqual as same } from 'node:util';
import type { RequiredGaps } from './generated/contracts.ts';
import { assert, type Fields, list } from './record-checks.ts';
import { ToolGaps } from './tool-gaps.ts';

// The required gaps of the candidate records of a Stage 4 attempt (DB5). Stage 4
// collect saves the behavior entry candidates and the resource access candidates, and
// then required-gaps.json: one gap for each gap that a record lists, and one for a
// record that is partial (ToolGaps.fromCandidateRecord). The gap IDs start with the
// attempt ID and the name of the record, such as s4-001-behavior-entry-gap-001 and
// s4-001-resource-access-gap-001. An attempt file has the artifact ID
// <attempt>-file@<file>, as the Stage 4/5 publisher registers it.
interface CandidateFile { readonly name: string; readonly file: string; readonly label: string }
// The registered records of a run and the files of an attempt, by artifact ID.
type Registered = ReadonlyMap<string, { readonly bytes: Buffer }>;

const behaviorEntries: CandidateFile = { name: 'behavior-entry', file: 'behavior-entry-candidates.json',
  label: 'behavior entry candidates' };
const resourceAccess: CandidateFile = { name: 'resource-access', file: 'resource-access-candidates.json',
  label: 'resource access candidates' };
// A Stage 4 attempt ID, as the Stage 4 helpers accept it, and the reference to gap N of an attempt file.
const attemptId = 's4-[a-z0-9]+(?:-[a-z0-9]+)*';
const stageFourAttempt = new RegExp('^' + attemptId + '$');
const listedGapRef = new RegExp('^(' + attemptId + ')-file@([^#]+)#/gaps/(0|[1-9][0-9]*)$');

export class CandidateGaps {
  // The attempt file of the required gaps.
  static readonly file = 'required-gaps.json';
  // The candidate records, in the order of their gaps in the required gaps.
  static readonly records: readonly CandidateFile[] = [behaviorEntries, resourceAccess];
  readonly #attempt: string;
  readonly #gaps: ToolGaps;

  constructor(attempt: string) {
    this.#attempt = attempt;
    this.#gaps = new ToolGaps(attempt + '-');
  }

  // The required gaps of the Stage 4 attempt that saved the behavior entry candidates
  // with the artifact ID `ref`. Stage 5 keeps the candidates of Stage 4, so a Stage 5
  // entry analysis names that attempt too.
  static ofCandidates(ref: unknown): CandidateGaps {
    const suffix = '-file@' + encodeURIComponent(behaviorEntries.file);
    const attempt = typeof ref === 'string' && ref.endsWith(suffix) ? ref.slice(0, -suffix.length) : '';
    assert(stageFourAttempt.test(attempt), `The behavior entry candidates ${String(ref)} are not a record of a Stage 4 attempt.`);
    return new CandidateGaps(attempt);
  }

  // The artifact ID of an attempt file.
  ref(file: string): string {
    return this.#attempt + '-file@' + encodeURIComponent(file);
  }

  // The start of the IDs that the required gaps of each record use. No other question or gap can use them.
  reservedPrefixes(): string[] {
    return CandidateGaps.records.map(({ name }) => this.#gaps.reservedPrefix(name));
  }

  // The required gaps of the saved candidate records. `read` gives a saved attempt file, by its name.
  record(read: (file: string) => unknown): RequiredGaps {
    return { formatVersion: 1, gaps: CandidateGaps.records.flatMap(({ name, file, label }) =>
      this.#gaps.fromCandidateRecord({ name, label, artifactRef: this.ref(file), record: read(file) })) };
  }

  // Refuses saved required gaps that differ from the gaps that the saved candidate
  // records give, and a review (an entry analysis) that leaves out or changes a
  // required gap or that gives a question or another gap a reserved ID. `artifacts`
  // holds the files of the attempt by artifact ID: for Stage 5, the registered files of
  // the Stage 4 attempt.
  check(artifacts: Registered, review: Fields): void {
    const read = (file: string): unknown => {
      const artifact = artifacts.get(this.ref(file));
      assert(artifact, 'Missing registered artifact: ' + this.ref(file));
      return JSON.parse(artifact.bytes.toString('utf8'));
    };
    const source = this.ref(CandidateGaps.file);
    const required = this.record(read).gaps;
    assert(same(read(CandidateGaps.file), { formatVersion: 1, gaps: required }),
      `The required gaps in ${source} differ from the gaps that the candidate records give. Use a new attempt.`);
    const issues = { questions: list(review.questions, 'questions'), gaps: list(review.gaps, 'gaps') };
    for (const { name } of CandidateGaps.records)
      this.#gaps.checkCopied(name, required.filter(gap => this.#gaps.reserves(name, gap.id)), issues, source);
  }

  // True when a discovery gap has the form of a required gap that Stage 4 collect gave
  // from a gap that a candidate record lists: its only evidence reference is that gap,
  // <attempt>-file@<record file>#/gaps/N, and its ID is the ID of that gap,
  // <attempt>-<name>-gap-NNN with NNN = N + 1. Such a gap keeps the subjects of the
  // record, which can name a missing compiler input outside the snapshot.
  static isListedGap({ id, evidenceRefs }: { id?: unknown; evidenceRefs?: unknown }): boolean {
    const [ref, ...others] = Array.isArray(evidenceRefs) ? evidenceRefs as unknown[] : [];
    const match = listedGapRef.exec(String(ref));
    const record = CandidateGaps.records.find(({ file }) => encodeURIComponent(file) === match?.[2]);
    return others.length === 0 && match !== null && record !== undefined &&
      id === new ToolGaps(match[1] + '-').id(record.name, Number(match[3]));
  }
}
