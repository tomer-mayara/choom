import { type Artifact, assert, exact, type Fields, object, strings, text } from './record-checks.ts';

// The behavior entry candidates that a selected entry analysis names: the record that
// Stage 4 collect saved, with the saved rule list that it names. Each candidate and
// each settings gap names an indexed file with its inventory digest, its range lies
// in that saved file, and the text at the range starts with its expression. A handler
// range lies in the saved file that it names.
export interface CandidateInputs {
  // The reference that the entry analysis names.
  ref: unknown;
  snapshotRef: string;
  artifacts: Map<string, Artifact>;
  indexed: Map<unknown, Fields>;
  document(id: unknown): unknown;
  readSource(path: string, limit: number): Buffer;
}
// The text that the parser read from a saved file, and where the text of each line starts and ends.
interface SavedText { text: string; starts: number[]; ends: number[] }
// The checks of the record that each candidate and gap uses.
interface Context { indexed: Map<unknown, Fields>; known: Set<string>; textOf(path: unknown): SavedText }

const candidateKeys = ['ruleId', 'ruleVersion', 'entryKind', 'found', 'role', 'roleRef', 'path', 'sha256', 'range', 'expression',
  'truncated', 'name', 'nameReason', 'handler', 'handlerReason'];
const settingsGapKeys = ['kind', 'ruleId', 'ruleVersion', 'entryKind', 'path', 'sha256', 'range', 'expression', 'truncated', 'reason'];
const projectGapKeys = ['kind', 'input', 'missing', 'subjectRefs', 'reason'];
const sourceLimit = 64 * 1024 * 1024;
const ruleKey = (item: Fields): string => [item.ruleId, item.ruleVersion, item.entryKind].join(' ');

// TypeScript ends a line at CRLF, CR, LF, U+2028 and U+2029, and it does not count a byte order mark.
function savedText(bytes: Buffer, path: unknown): SavedText {
  const decoded = bytes.toString('utf8');
  assert(Buffer.from(decoded).equals(bytes), 'A behavior entry candidate names a file that is not UTF-8 text: ' + path + '.');
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

// The saved text at a range, after the check that the range lies in the file.
function textAt(context: Context, path: unknown, range: unknown, label: string): string {
  const saved = context.textOf(path);
  const [start, end] = Array.isArray(range) && range.length === 2 ? range.map(position => offsetOf(saved, position)) : [];
  assert(start !== undefined && end !== undefined && start <= end, label + ' outside the saved file ' + path + '.');
  return saved.text.slice(start, end);
}

// A site names an indexed file with its inventory digest, and the text at its range starts with its expression.
function checkSite(context: Context, item: Fields, label: string): void {
  const file = context.indexed.get(item.path);
  assert(file?.kind === 'file' && file.sha256 === item.sha256,
    'Behavior entry ' + label + ' names a file that is not in the saved inventory: ' + item.path + '.');
  const found = textAt(context, item.path, item.range, 'Behavior entry ' + label + ' has a range');
  const expression = item.expression as string;
  assert(typeof expression === 'string' && typeof item.truncated === 'boolean' &&
    (item.truncated ? found.length > expression.length && found.startsWith(expression) : found === expression),
  'Behavior entry ' + label + ' differs from the saved text at its range.');
}

function checkCandidate(context: Context, candidate: unknown, index: number): void {
  const label = 'candidate ' + index;
  const item = (object(candidate) ? candidate : {}) as Fields;
  const handler = item.handler as Fields | null;
  assert(exact(candidate, candidateKeys) && item.found === 'syntax-rule' && context.known.has(ruleKey(item)) &&
    (item.role === 'test' ? text(item.roleRef) : item.role === 'unknown' && item.roleRef === null) &&
    (item.name === null ? text(item.nameReason) : typeof item.name === 'string' && item.nameReason === null) &&
    (handler === null ? text(item.handlerReason) : exact(handler, ['path', 'range']) && item.handlerReason === null),
  'Invalid behavior entry ' + label + '.');
  checkSite(context, item, label);
  if (handler === null) return;
  assert(context.indexed.get(handler.path)?.kind === 'file',
    'Behavior entry ' + label + ' names a handler file that is not in the saved inventory: ' + handler.path + '.');
  textAt(context, handler.path, handler.range, 'Behavior entry ' + label + ' has a handler range');
}

// A settings gap is located like a candidate. A project gap names a compiler input that the snapshot does not hold.
function checkGap(context: Context, gap: unknown, index: number): void {
  const label = 'gap ' + index;
  const item = (object(gap) ? gap : {}) as Fields;
  const settingsGap = item.kind === 'unknown-settings-value';
  assert(settingsGap ? exact(gap, settingsGapKeys) && context.known.has(ruleKey(item)) && text(item.reason)
    : item.kind === 'missing-compiler-input' && exact(gap, projectGapKeys) && text(item.input) && text(item.missing) &&
      strings(item.subjectRefs) && text(item.reason), 'Invalid behavior entry ' + label + '.');
  if (settingsGap) checkSite(context, item, label);
}

// Checks the candidates record that the entry analysis names and returns the number of its candidates.
export function validateBehaviorCandidates(inputs: CandidateInputs): number {
  const { ref, artifacts } = inputs;
  assert(typeof ref === 'string' && artifacts.get(ref)?.path.endsWith('/behavior-entry-candidates.json'),
    'The entry analysis names ' + ref + ' as its behavior entry candidates, which is not a saved candidates record.');
  const record = inputs.document(ref) as Fields;
  const omitted = record.omittedCandidates as number;
  assert(record.formatVersion === 1 && record.snapshotRef === inputs.snapshotRef && Array.isArray(record.candidates) &&
    Array.isArray(record.gaps) && Number.isSafeInteger(omitted) && omitted >= 0 &&
    record.status === (omitted > 0 ? 'partial' : 'completed') && strings(record.notes),
  'The behavior entry candidates ' + ref + ' are not a record of this snapshot.');
  const rulesRef = record.rulesRef;
  assert(text(rulesRef) && artifacts.get(rulesRef)?.sha256 === record.rulesSha256,
    'The behavior entry candidates ' + ref + ' do not name their saved rule list.');
  const rules = (inputs.document(rulesRef) as Fields | null)?.rules;
  const texts = new Map<unknown, SavedText>();
  const context: Context = { indexed: inputs.indexed,
    known: new Set((Array.isArray(rules) ? rules as Fields[] : []).map(rule => ruleKey({ ruleId: rule.id, ruleVersion: rule.version,
      entryKind: rule.entryKind }))),
    textOf(path) {
      if (!texts.has(path)) texts.set(path, savedText(inputs.readSource(path as string, sourceLimit), path));
      return texts.get(path) as SavedText;
    } };
  record.candidates.forEach((candidate, index) => checkCandidate(context, candidate, index));
  record.gaps.forEach((gap, index) => checkGap(context, gap, index));
  return record.candidates.length;
}
