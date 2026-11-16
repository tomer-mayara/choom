import { type Artifact, assert, exact, type Fields, object, strings, text } from './record-checks.ts';

// The checks that the candidate records of the Stage 4 rule lists share, as part of
// the shared record validation: a record that Stage 4 collect saved for this
// snapshot, with the saved rule list that it names, and sites that lie in the saved
// snapshot files. A record kind has a label, such as behavior entry, that the
// messages use.
export interface CandidateInputs {
  // The reference that a selected record names.
  ref: unknown;
  snapshotRef: string;
  artifacts: Map<string, Artifact>;
  indexed: Map<unknown, Fields>;
  document(id: unknown): unknown;
  readSource(path: string, limit: number): Buffer;
}
// The text that the parser read from a saved file, and where the text of each line starts and ends.
interface SavedText { text: string; starts: number[]; ends: number[] }
// The indexed files and the saved text of each file, read once, with the label of the record.
export interface Sites { label: string; indexed: Map<unknown, Fields>; textOf(path: unknown): SavedText }
// A checked record and the rules of its saved rule list.
export interface SavedRecord { record: Fields & { candidates: unknown[]; gaps: unknown[] }; rules: Fields[] }

const sourceLimit = 64 * 1024 * 1024;
const projectGapKeys = ['kind', 'input', 'missing', 'subjectRefs', 'reason'];
// The label at the start of a message, such as Behavior entry.
const capital = (label: string): string => label.charAt(0).toUpperCase() + label.slice(1);

// TypeScript ends a line at CRLF, CR, LF, U+2028 and U+2029, and it does not count a byte order mark.
function savedText(bytes: Buffer, path: unknown, label: string): SavedText {
  const decoded = bytes.toString('utf8');
  assert(Buffer.from(decoded).equals(bytes), 'A ' + label + ' candidate names a file that is not UTF-8 text: ' + path + '.');
  const value = decoded.startsWith('\uFEFF') ? decoded.slice(1) : decoded;
  const starts = [0];
  const ends: number[] = [];
  for (const match of value.matchAll(/\r\n|\r|\n|\u2028|\u2029/g)) {
    ends.push(match.index);
    starts.push(match.index + match[0].length);
  }
  ends.push(value.length);
  return { text: value, starts, ends };
}

// The offset of a 1-based position in the text, or undefined when the position is outside it.
function offsetOf({ starts, ends }: SavedText, position: unknown): number | undefined {
  const { line, column } = object(position) ? position : {};
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || (column as number) < 1) return undefined;
  const start = starts[(line as number) - 1];
  const end = ends[(line as number) - 1];
  const offset = start === undefined ? undefined : start + (column as number) - 1;
  return offset === undefined || end === undefined || offset > end ? undefined : offset;
}

// The sites of a record of the inputs, each saved file read once.
export function sitesOf(inputs: CandidateInputs, label: string): Sites {
  const texts = new Map<unknown, SavedText>();
  return { label, indexed: inputs.indexed, textOf(path) {
    if (!texts.has(path)) texts.set(path, savedText(inputs.readSource(path as string, sourceLimit), path, label));
    return texts.get(path) as SavedText;
  } };
}

// The saved text at a range, after the check that the range lies in the file.
export function textAt(sites: Sites, path: unknown, range: unknown, message: string): string {
  const saved = sites.textOf(path);
  const [start, end] = Array.isArray(range) && range.length === 2 ? range.map(position => offsetOf(saved, position)) : [];
  assert(start !== undefined && end !== undefined && start <= end, message + ' outside the saved file ' + path + '.');
  return saved.text.slice(start, end);
}

// A site names an indexed file with its inventory digest, and the text at its range
// starts with its expression. `name` names the site in the messages, such as candidate 0.
export function checkSite(sites: Sites, item: Fields, name: string): void {
  const label = capital(sites.label) + ' ' + name;
  const file = sites.indexed.get(item.path);
  assert(file?.kind === 'file' && file.sha256 === item.sha256, label + ' names a file that is not in the saved inventory: ' +
    item.path + '.');
  const found = textAt(sites, item.path, item.range, label + ' has a range');
  const expression = item.expression as string;
  assert(typeof expression === 'string' && typeof item.truncated === 'boolean' &&
    (item.truncated ? found.length > expression.length && found.startsWith(expression) : found === expression),
  label + ' differs from the saved text at its range.');
}

// A gap of a compiler input that the snapshot does not hold.
export const projectGap = (gap: unknown): boolean => object(gap) && gap.kind === 'missing-compiler-input' &&
  exact(gap, projectGapKeys) && text(gap.input) && text(gap.missing) && strings(gap.subjectRefs) && text(gap.reason);

// The record that the reference names: a registered `file` artifact of the current
// snapshot that Stage 4 collect saved, with its saved rule list. `refused` is the
// message for a reference to another artifact.
export function savedRecord(inputs: CandidateInputs, file: string, label: string, refused: string): SavedRecord {
  const { ref, artifacts } = inputs;
  assert(typeof ref === 'string' && artifacts.get(ref)?.path.endsWith('/' + file), refused);
  const record = inputs.document(ref) as Fields;
  const omitted = record.omittedCandidates as number;
  const named = 'The ' + label + ' candidates ' + ref;
  assert(record.formatVersion === 1 && record.snapshotRef === inputs.snapshotRef && Array.isArray(record.candidates) &&
    Array.isArray(record.gaps) && Number.isSafeInteger(omitted) && omitted >= 0 &&
    record.status === (omitted > 0 ? 'partial' : 'completed') && strings(record.notes),
  named + ' are not a record of this snapshot.');
  const rulesRef = record.rulesRef;
  assert(text(rulesRef) && artifacts.get(rulesRef)?.sha256 === record.rulesSha256, named + ' do not name their saved rule list.');
  const rules = (inputs.document(rulesRef) as Fields | null)?.rules;
  return { record: record as SavedRecord['record'], rules: Array.isArray(rules) ? rules as Fields[] : [] };
}
