import { SubjectItems } from '@choom/baseline-model/subject-items';
import { assert, type Fields } from './record-checks.ts';
import { isToolGap } from './stage-1-gaps.ts';

// The subjects of the questions and gaps of a discovery. The shared record checks of
// Stages 4 to 6 check that each subject reference names something that the run
// holds, so that no question or gap is about nothing. Later stages keep each
// question and gap unchanged, so a draft that renames or removes what a subject
// names is refused while the reviewer can still keep the old ID.
export interface SubjectInputs {
  // The working or fixed discovery with its questions and gaps.
  discovery: Fields;
  snapshotRef: string;
  // The paths of the files of the snapshot inventory.
  paths: Iterable<unknown>;
  // The IDs of the entry candidates of the selected entry analysis and of the earlier
  // entry analyses that it names. Stage 3 can retire a candidate with a note that names it.
  candidateIds: ReadonlySet<unknown>;
  baseline: BaselineItems;
}
// The four collections of baseline items, with the ID of each item.
export interface BaselineItems {
  readonly components: readonly { readonly id: string }[];
  readonly interfaces: readonly { readonly id: string }[];
  readonly resources: readonly { readonly id: string }[];
  readonly rules: readonly { readonly id: string }[];
}

const issueKinds = [['questions', 'Question'], ['gaps', 'Gap']] as const;

// The folders that hold at least one of the files, without a final /.
function foldersOf(files: Set<unknown>): Set<string> {
  const folders = new Set<string>();
  for (const path of files) {
    if (typeof path !== 'string') continue;
    for (let at = path.indexOf('/'); at > 0; at = path.indexOf('/', at + 1)) folders.add(path.slice(0, at));
  }
  return folders;
}

// A subject names one of these: a file of the snapshot inventory; a folder that holds
// at least one such file, written with or without a final /; the snapshot ID; the ID
// of a question or gap of the discovery; the ID of an entry candidate; or a baseline
// item, as the viewer places it (SubjectItems), such as billing.purpose.
// A gap that Stage 1 finish copied from a tool record keeps the subjects of the tool,
// which can name a missing input or a path outside the snapshot; it is not checked.
export function checkSubjects({ discovery, snapshotRef, paths, candidateIds, baseline }: SubjectInputs): void {
  const files = new Set<unknown>(paths);
  const folders = foldersOf(files);
  const issueIds = new Set(issueKinds.flatMap(([kind]) => (discovery[kind] as Fields[]).map(issue => issue.id)));
  const items = new SubjectItems(baseline);
  const names = (subject: string): boolean =>
    files.has(subject) || folders.has(subject.endsWith('/') ? subject.slice(0, -1) : subject) ||
    subject === snapshotRef || issueIds.has(subject) || candidateIds.has(subject) || items.namedItem(subject) !== undefined;
  for (const [kind, label] of issueKinds) {
    for (const issue of discovery[kind] as Fields[]) {
      if (kind === 'gaps' && isToolGap(issue)) continue;
      for (const subject of issue.subjectRefs as string[])
        assert(names(subject), `${label} ${String(issue.id)} names the subject ${subject}, which is not a file or folder of ` +
          'the snapshot, the snapshot ID, a question or gap, an entry candidate or a baseline item.');
    }
  }
}
