import type { RunCoverage, RunProgress } from './generated/contracts.ts';
import { list } from './record-checks.ts';

// The summary of a run: the coverage of run.yaml (DB4). Every publisher makes it
// from the progress that it writes and from the records that it selects, and writes
// it in place of the summary of the earlier stage, so no text keeps a claim that a
// later stage made obsolete. The summary names records by artifact ID and counts
// records. Choom does not decide which question or gap is answered, so the summary
// gives the record counts of the question and gap lists, which keep their history
// and linked notes. The values come from saved records: the summary checks that a
// list is a list before it counts it.

// The progress key of each stage, in stage order: Stage 1 has the key inventory.
const stageProgress: readonly (keyof RunProgress)[] = ['inventory', 'entryAnalysis', 'inspectionPriorities',
  'componentRecovery', 'remainingCode', 'baselineRecovery'];

// The progress and the selected records of a run, as a publisher writes and selects them.
export interface SummaryRecords {
  // The progress of the run that the publisher writes. A stage whose value is not
  // complete has not completed, also when the progress has no value for it yet.
  readonly progress: Readonly<Partial<Record<keyof RunProgress, unknown>>>;
  // The selected inventory of the snapshot. The summary counts its regular files.
  readonly inventory: { readonly files?: unknown };
  // The artifact ID of the selected review with the reviewed source ranges: the
  // Stage 1 review, or from Stage 2 the selected entry analysis.
  readonly reviewRef: string;
  // The artifact ID of the selected code mapping. Stage 4 saves the first one.
  readonly codeMappingRef?: string;
  // The artifact ID of the selected record with the questions and gaps of the discovery, and that record.
  readonly issuesRef: string;
  readonly issues: { readonly questions?: unknown; readonly gaps?: unknown };
}

// A count and its noun, such as 1 gap or 2 gaps.
const counted = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

// The stage numbers as a list in a sentence, such as Stage 6 or Stages 5 and 6.
function stageList(numbers: readonly number[]): string {
  const last = String(numbers.at(-1));
  return numbers.length === 1 ? 'Stage ' + last : `Stages ${numbers.slice(0, -1).join(', ')} and ${last}`;
}

export class RunSummary {
  readonly #records: SummaryRecords;

  constructor(records: SummaryRecords) {
    this.#records = records;
  }

  // The summary, with its fields in the order of run.yaml.
  coverage(): RunCoverage {
    return { inventoried: this.#inventoried(), inspected: this.#inspected(), recorded: this.#recorded(),
      pending: this.#pending() };
  }

  #inventoried(): string {
    const files = list(this.#records.inventory.files, 'inventory file')
      .filter(file => (file as { kind?: unknown } | null)?.kind === 'file');
    return `${counted(files.length, 'regular file')} in the selected capture scope.`;
  }

  #inspected(): string {
    const { reviewRef, codeMappingRef } = this.#records;
    const mapping = codeMappingRef === undefined ? '' :
      ` ${codeMappingRef} maps each code unit to its owner and says whether a review read it.`;
    return `${reviewRef}#/reviewedFiles lists the source ranges that the selected review read. Earlier reviews keep ` +
      `their own ranges.${mapping} Tool reads are not LLM inspection.`;
  }

  #recorded(): string {
    const { issuesRef, issues } = this.#records;
    const questions = list(issues.questions, 'question').length;
    const gaps = list(issues.gaps, 'gap').length;
    return `${issuesRef} records ${counted(questions, 'question')} and ${counted(gaps, 'gap')}, with history and linked notes.`;
  }

  #pending(): string {
    const pending = stageProgress.flatMap((key, index) => this.#records.progress[key] === 'complete' ? [] : [index + 1]);
    if (pending.length === 0) return 'No stage is pending.';
    return `${stageList(pending)} ${pending.length === 1 ? 'is' : 'are'} pending.`;
  }
}
