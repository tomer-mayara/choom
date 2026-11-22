import type { RequiredGaps } from './generated/contracts.ts';
import { assert } from './record-checks.ts';
import { ToolGaps } from './tool-gaps.ts';

// The required gaps of the candidate records of a Stage 4 attempt (DB5). Stage 4
// collect saves the behavior entry candidates and the resource access candidates, and
// then required-gaps.json: one gap for each gap that a record lists, and one for a
// record that is partial (ToolGaps.fromCandidateRecord). The gap IDs start with the
// attempt ID and the name of the record, such as s4-001-behavior-entry-gap-001 and
// s4-001-resource-access-gap-001. An attempt file has the artifact ID
// <attempt>-file@<file>, as the Stage 4/5 publisher registers it.
interface CandidateFile { readonly name: string; readonly file: string; readonly label: string }

const behaviorEntries: CandidateFile = { name: 'behavior-entry', file: 'behavior-entry-candidates.json',
  label: 'behavior entry candidates' };
const resourceAccess: CandidateFile = { name: 'resource-access', file: 'resource-access-candidates.json',
  label: 'resource access candidates' };
const stageFourAttempt = /^s4-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
}
