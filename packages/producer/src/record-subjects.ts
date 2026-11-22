import type { SubjectItems } from '@choom/baseline-model/subject-items';
import { CandidateGaps } from './candidate-gaps.ts';
import type { Fields } from './record-checks.ts';
import { isToolGap } from './stage-1-gaps.ts';

// The subjects of the questions and gaps of a discovery. The shared record checks of
// Stages 4 to 6 check that each subject reference names something that the run
// holds, so that no question or gap is about nothing. Stages 1 to 3 check the
// records that they add in the same way, before later stages keep them unchanged.

// The baseline items that a subject can name: SubjectItems of @choom/baseline-model.
export type ItemNames = Pick<SubjectItems, 'namedItem'>;
// A question or gap of a discovery, or another record with subjects, such as an
// inspection priority. A gap has a kind, and a question has none.
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
  // Stage 2 plan gives the candidates of the plan, and Stage 1 none.
  readonly candidateIds: Iterable<unknown>;
  readonly items: ItemNames;
}

const issueLists = [['questions', 'question'], ['gaps', 'gap']] as const;
const subjectForms = 'A subject names a file of the snapshot, a folder of the snapshot written as <folder>/**, the snapshot ID, ' +
  'a question or gap, an entry candidate, or a baseline item ID or a field of it, such as billing.purpose.';
// The baseline items of Stages 1 to 3: none. Each of these stages checks that the baseline is still empty.
const noItems: ItemNames = { namedItem: () => undefined };

const issueIdsOf = (issues: Fields): Set<unknown> =>
  new Set(issueLists.flatMap(([kind]) => (issues[kind] as SubjectRecord[]).map(issue => issue.id)));

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
    this.issueIds = issueIdsOf(issues);
    this.candidateIds = new Set(candidateIds);
    this.items = items;
  }

  // The subject check of Stages 1 to 3 (DB2). These stages run before Stage 4 recovers
  // the baseline items, so a subject can name no baseline item yet.
  static beforeBaseline(run: Omit<SubjectRun, 'items'>): SubjectChecker {
    return new SubjectChecker({ ...run, items: noItems });
  }

  // The check of Stages 2 and 3 for the questions and gaps of an entry plan or entry
  // analysis (`record`). A subject can also name an entry candidate of the record or
  // of the `earlier` entry analyses. An example is a candidate that Stage 3 retired.
  static forEntryRecord(paths: Iterable<unknown>, snapshotRef: string, record: Fields, earlier: readonly Fields[] = []): SubjectChecker {
    const candidateIds = [record, ...earlier].flatMap(item => (item.candidates as { id: unknown }[]).map(candidate => candidate.id));
    return SubjectChecker.beforeBaseline({ paths, snapshotRef, issues: record, candidateIds });
  }

  // Each subject of the question or gap that names nothing of the run, in the order of
  // the record. A gap that keeps the subjects of its tool record (isToolGap), such as a
  // gap that Stage 1 finish copied or a required gap of a Stage 3 exports record, can
  // name a missing input or a path outside the snapshot. So can a required gap of a gap
  // that a Stage 4 candidate record lists (CandidateGaps).
  refused(record: SubjectRecord): string[] {
    if (record.kind !== undefined && (isToolGap(record) || CandidateGaps.isListedGap(record))) return [];
    return record.subjectRefs.filter(subject => !this.names(subject));
  }

  // Refuses the first question or gap with a subject that names nothing.
  check(): void {
    for (const [kind, label] of issueLists) this.checkRecords(this.issues[kind] as SubjectRecord[], label);
  }

  // Refuses the first question or gap that the stage adds. A record is added when its
  // ID is not in `earlier`, the questions and gaps before the stage. Stages 1 to 3
  // check only the records that they add.
  checkAdded(earlier: Fields): void {
    const earlierIds = issueIdsOf(earlier);
    for (const [kind, label] of issueLists)
      this.checkRecords((this.issues[kind] as SubjectRecord[]).filter(issue => !earlierIds.has(issue.id)), label);
  }

  // Refuses the first of the records with a subject that names nothing. The message
  // names the subject, the kind of the record (`label`, such as question) and its ID.
  // For a folder written without /**, it gives the folder selector to write.
  checkRecords(records: readonly SubjectRecord[], label: string): void {
    for (const record of records) {
      const [subject] = this.refused(record);
      if (subject === undefined) continue;
      const selector = this.folderSelector(subject);
      throw new Error(`The subject ${subject} of the ${label} ${String(record.id)} ` + (selector === undefined
        ? `names nothing. ${subjectForms}` : `names a folder without /**. Write the folder as ${selector}.`));
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
