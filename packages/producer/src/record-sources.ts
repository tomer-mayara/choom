import { isDeepStrictEqual as same } from 'node:util';
import { type Artifact, assert, boundedText, exact, type Fields, hash, safe, text } from './record-checks.ts';

// The saved source records and excerpts of a run, and the check that a cited
// source range still matches its saved text and the snapshot or saved inventory.
const sourceLimit = 2 * 1024 * 1024;

export interface SourceRecords {
  records: Map<unknown, Fields>;
  verify(record: Fields): void;
  verified: Set<unknown>;
}
export interface SourceInputs {
  artifacts: Map<string, Artifact>;
  document(id: string): unknown;
  snapshotRef: string;
  inventory: Fields;
  readSource(path: string, limit: number): Buffer;
}
interface SavedSources { records: Map<unknown, Fields>; excerpts: Fields[]; indexes: Map<unknown, Fields> }

const matches = (left: Fields, right: Fields): boolean => left.snapshotRef === right.snapshotRef && left.path === right.path &&
  left.sha256 === right.sha256 && same(left.lines, right.lines);

function addReviewedFiles(saved: SavedSources, artifacts: Map<string, Artifact>, value: unknown): void {
  const reviewedFiles = (value as Fields | null | undefined)?.reviewedFiles;
  if (!Array.isArray(reviewedFiles)) return;
  for (const record of reviewedFiles as Fields[]) {
    assert(text(record?.id) && !artifacts.has(record.id) &&
      (!saved.records.has(record.id) || same(saved.records.get(record.id), record)), 'Conflicting source record: ' + record?.id);
    saved.records.set(record.id, record);
  }
}

function savedSources({ artifacts, document, snapshotRef, inventory }: SourceInputs): SavedSources {
  const saved: SavedSources = { records: new Map(), excerpts: [], indexes: new Map([[snapshotRef, inventory]]) };
  for (const [id, { path }] of artifacts) {
    if (/\/(?:parent-)?inventory\.json$/.test(path)) {
      const record = document(id) as Fields;
      if (record.formatVersion === 1 && text(record.snapshotId) && Array.isArray(record.files)) {
        const prior = saved.indexes.get(record.snapshotId);
        assert(!prior || same(prior, record), 'Conflicting inventory for ' + record.snapshotId);
        saved.indexes.set(record.snapshotId, record);
      }
    }
    if (/\/(?:source-excerpts\.json|excerpt-[0-9]+\.json)$/.test(path)) {
      const excerpts = document(id) as Fields;
      if (Array.isArray(excerpts.excerpts)) saved.excerpts.push(...(excerpts.excerpts as Fields[]));
      else saved.excerpts.push(excerpts);
    }
    if (!/\.ya?ml$/.test(path)) continue;
    addReviewedFiles(saved, artifacts, document(id));
  }
  for (const excerpt of saved.excerpts) {
    assert(text(excerpt?.id) && !artifacts.has(excerpt.id) &&
      (!saved.records.has(excerpt.id) || matches(saved.records.get(excerpt.id) as Fields, excerpt)),
    'Conflicting excerpt identity: ' + excerpt?.id);
    if (!saved.records.has(excerpt.id)) saved.records.set(excerpt.id, excerpt);
  }
  return saved;
}

// The saved file split into lines, as the excerpts number them.
function savedLines(bytes: Buffer, record: Fields): string[] {
  assert(hash(bytes) === record.sha256, 'Changed source file: ' + record.path);
  const value = bytes.toString('utf8');
  assert(Buffer.from(value).equals(bytes), 'Source range is not UTF-8: ' + record.path);
  const lines = value ? value.split(/\r\n|\r|\n/) : [];
  if (/[\r\n]$/.test(value)) lines.pop();
  return lines;
}

export function sourcesFor(inputs: SourceInputs): SourceRecords {
  const { records, excerpts, indexes } = savedSources(inputs);
  const indexed = new Map([...indexes].map(([id, index]) =>
    [id, new Map((index.files as Fields[]).map(file => [file.path, file]))]));
  const linesByPath = new Map<unknown, string[]>();
  const verified = new Set<unknown>();
  function checkCurrentRange(record: Fields, excerpt: Fields, [first, last]: [number, number]): void {
    if (!linesByPath.has(record.path)) linesByPath.set(record.path, savedLines(inputs.readSource(record.path as string, sourceLimit), record));
    const lines = linesByPath.get(record.path) as string[];
    assert(last <= lines.length, 'Source range exceeds saved file: ' + record.id);
    const slice = lines.slice(first - 1, last);
    const expected = typeof excerpt.excerpt === 'string' ?
      slice.map((line, index) => (first + index) + ': ' + line).join('\n') : slice.join('\n');
    assert(expected === (excerpt.excerpt ?? excerpt.text), 'Saved source range differs: ' + record.id);
    if (Object.hasOwn(excerpt, 'totalLines')) assert(excerpt.totalLines === lines.length, 'Changed line count: ' + record.id);
  }
  function verify(record: Fields): void {
    if (verified.has(record.id)) return;
    const saved = indexed.get(record.snapshotRef)?.get(record.path);
    const lines = record.lines as number[];
    assert(saved?.kind === 'file' && record.sha256 === saved.sha256 && Array.isArray(record.lines) &&
      lines.length === 2 && lines.every(Number.isSafeInteger) && (lines[0] as number) > 0 &&
      (lines[1] as number) >= (lines[0] as number), 'Source record is outside its own saved inventory: ' + record.id);
    const excerpt = excerpts.find(item => matches(item, record));
    assert(excerpt && (typeof excerpt.excerpt === 'string' || typeof excerpt.text === 'string'), 'Source range has no saved text: ' + record.id);
    const [first, last] = lines as [number, number];
    if (record.snapshotRef === inputs.snapshotRef) checkCurrentRange(record, excerpt, [first, last]);
    else {
      // An older snapshot is not a fallback path. Only its registered inventory and saved excerpt are used.
      const numbered = ((excerpt.excerpt ?? excerpt.text) as string).split('\n');
      assert(numbered.length === last - first + 1 && (excerpt.excerpt === undefined ||
        numbered.every((line, index) => line.startsWith((first + index) + ': '))),
      'Invalid numbered historical excerpt: ' + record.id);
    }
    verified.add(record.id);
  }
  return { records, verify, verified };
}

// A source note with a location names a saved source range exactly.
export function validateSourceLocation(note: Fields, source: SourceRecords): void {
  const location = note.location as Fields;
  const record = source.records.get(note.evidenceRef);
  const lines = location?.lines as number[];
  assert(!(note.evidenceRef as string).includes('#') && exact(location, ['snapshotRef', 'path', 'sha256', 'lines']) &&
    boundedText(location.snapshotRef, 4096) &&
    boundedText(location.path, 4096) && safe(location.path) && !/^[A-Za-z]:/.test(location.path) &&
    /^[a-fA-F0-9]{64}$/.test(location.sha256 as string) &&
    Array.isArray(lines) && lines.length === 2 && lines.every(Number.isSafeInteger) &&
    (lines[0] as number) > 0 && (lines[1] as number) >= (lines[0] as number) && record &&
    same(location, { snapshotRef: record.snapshotRef, path: record.path, sha256: record.sha256, lines: record.lines }),
  'Source note differs from its saved source record: ' + note.evidenceRef);
  source.verify(record);
}
