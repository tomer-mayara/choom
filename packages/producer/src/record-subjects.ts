import type { SubjectItems } from '@choom/baseline-model/subject-items';
import { CandidateGaps } from './candidate-gaps.ts';
import type { Fields } from './record-checks.ts';
import { isToolGap } from './stage-1-gaps.ts';

// The subjects of the questions and gaps of a discovery. The shared record checks of
// Stages 4 to 6 check that each subject reference names something that the run
// holds, so that no question or gap is about nothing.

// The baseline items that a subject can name: SubjectItems of @choom/baseline-model.
export type ItemNames = Pick<SubjectItems, 'namedItem'>;
// A question or gap of a discovery. A gap has a kind, and a question has none.
export interface SubjectRecord {
  readonly id: unknown;
  readonly kind?: unknown;
  readonly subjectRefs: readonly string[];
  readonly evidenceRefs?: unknown;
  readonly [field: string]: unknown;
}
// What the subjects of the questions and gaps of a run can name.
export interface SubjectRun {
  // The paths of the files of the snapshot inventory.
  readonly paths: Iterable<unknown>;
  readonly snapshotRef: string;
  // The discovery, or other records, with the questions and gaps. The lists keep their history.
  readonly issues: Fields;
  // The IDs of the entry candidates of the selected entry analysis and of the earlier
  // entry analyses that it names. Stage 3 can retire a candidate with a note that names it.
  readonly candidateIds: Iterable<unknown>;
  readonly items: ItemNames;
}

const issueLists = [['questions', 'question'], ['gaps', 'gap']] as const;
const subjectForms = 'A subject names a file of the snapshot, a folder of the snapshot written as <folder>/**, the snapshot ID, ' +
  'a question or gap, an entry candidate, or a baseline item ID or a field of it, such as billing.purpose.';

// The folders that hold at least one of the files, without a final /.
function foldersOf(files: Iterable<unknown>): Set<string> {
  const folders = new Set<string>();
  for (const path of files) {
    if (typeof path !== 'string') continue;
    for (let at = path.indexOf('/'); at > 0; at = path.indexOf('/', at + 1)) folders.add(path.slice(0, at));
  }
  return folders;
}

// The subject check of the questions and gaps of a run. A subject names one of these:
// a file of the snapshot inventory; a folder that holds at least one such file,
// written as the membership selector <folder>/**, such as src/billing/**; the
// snapshot ID; the ID of a question or gap; the ID of an entry candidate; or a
// baseline item, as the viewer places a record (SubjectItems), such as
// billing.purpose. Later stages keep each question and gap unchanged, so a draft
// that renames or removes what a subject names is refused while the reviewer can
// still keep the old ID.
export class SubjectChecker {
  private readonly files: ReadonlySet<unknown>;
  private readonly folders: ReadonlySet<string>;
  private readonly snapshotRef: string;
  private readonly issues: Fields;
  private readonly issueIds: ReadonlySet<unknown>;
  private readonly candidateIds: ReadonlySet<unknown>;
  private readonly items: ItemNames;

  constructor({ paths, snapshotRef, issues, candidateIds, items }: SubjectRun) {
    this.files = new Set(paths);
    this.folders = foldersOf(this.files);
    this.snapshotRef = snapshotRef;
    this.issues = issues;
    this.issueIds = new Set(issueLists.flatMap(([kind]) => (issues[kind] as SubjectRecord[]).map(issue => issue.id)));
    this.candidateIds = new Set(candidateIds);
    this.items = items;
  }

  // Each subject of the question or gap that names nothing of the run, in the order of
  // the record. A gap that Stage 1 finish copied from a tool record keeps the subjects
  // of the tool, which can name a missing input or a path outside the snapshot. So does
  // a required gap of a gap that a Stage 4 candidate record lists (CandidateGaps).
  refused(record: SubjectRecord): string[] {
    if (record.kind !== undefined && (isToolGap(record) || CandidateGaps.isListedGap(record))) return [];
    return record.subjectRefs.filter(subject => !this.names(subject));
  }

  // Refuses the first question or gap with a subject that names nothing. The message
  // names the subject and the question or gap. For a folder written without /**, it
  // gives the folder selector to write.
  check(): void {
    for (const [kind, label] of issueLists) {
      for (const record of this.issues[kind] as SubjectRecord[]) {
        const [subject] = this.refused(record);
        if (subject === undefined) continue;
        const selector = this.folderSelector(subject);
        throw new Error(`The subject ${subject} of the ${label} ${String(record.id)} ` + (selector === undefined
          ? `names nothing. ${subjectForms}` : `names a folder without /**. Write the folder as ${selector}.`));
      }
    }
  }

  private names(subject: string): boolean {
    return this.files.has(subject) || (subject.endsWith('/**') && this.folders.has(subject.slice(0, -3))) ||
      subject === this.snapshotRef || this.issueIds.has(subject) || this.candidateIds.has(subject) ||
      this.items.namedItem(subject) !== undefined;
  }

  // The folder selector for a subject that names a folder of the snapshot without /**, with or without a final /.
  private folderSelector(subject: string): string | undefined {
    const folder = subject.endsWith('/') ? subject.slice(0, -1) : subject;
    return this.folders.has(folder) ? folder + '/**' : undefined;
  }
}
