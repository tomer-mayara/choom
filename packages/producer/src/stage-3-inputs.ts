import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { assert, type Fields, hash, object } from './record-checks.ts';

// The checked inputs of a Stage 3 action: the working drafts after Stage 2, the
// registered artifacts checked by digest, the inventory of the saved snapshot and
// the selected entry analysis with its plan and Knip runs. Saved JSON and YAML stay
// unchecked values until the checks below read them.
export type Parse = (text: string) => unknown;
export interface IndexedFile { path: string; kind: string; bytes: number; sha256: string }
export interface RegisteredArtifact { path: string; ref: string; bytes: Buffer }
// The facts that start saves in handoff.json and every later action compares, in this key order.
export interface StageFacts {
  runRef: unknown; snapshotRef: unknown; inventoryRef: unknown; snapshot: { path: string; dev: number; ino: number };
  entryAnalysisRef: unknown; planRef: unknown; knipRunsRef: unknown; registeredArtifacts: number;
  indexedRegularFiles: number; checkpointDigests: Record<string, string>;
}
export interface StageState {
  facts: StageFacts;
  // The snapshot record of run.yaml, with its root and the path of its capture exclusion rules.
  snapshotRecord: Fields;
  inputs: Record<string, Buffer>;
  files: Map<string, IndexedFile>;
  artifacts: Map<string, RegisteredArtifact>;
  runsArtifact: RegisteredArtifact;
  runs: Fields;
  analysis: Fields;
}
export interface Excerpt {
  snapshotRef: unknown; path: string; sha256: string; lines: [number, number] | null; excerpt: string;
  totalLineCount: number; truncated: boolean;
}
interface Drafts { inputs: Record<string, Buffer>; run: Fields; discovery: Fields }

export const drafts = ['run.yaml', 'discovery.yaml', 'baseline.yaml'];
export const checkpoint = (name: string): string => name.replace('.yaml', '.before.yaml');
const excerptBytes = 100 * 1024;
const excerptSourceBytes = 2 * 1024 * 1024;
const isDigest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

export function safePath(path: unknown): path is string {
  return typeof path === 'string' && !/[\\\u0000-\u001f\u007f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

export function directory(path: string | undefined): string {
  assert(isAbsolute(path ?? '') && lstatSync(path as string).isDirectory() && realpathSync(path as string) === path,
    'Expected a canonical directory: ' + path);
  return path as string;
}

export function read(path: string): Buffer {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical regular file: ' + path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular file: ' + path);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

// The working drafts: a run whose entry analysis is complete, a discovery result
// that selects an entry analysis, and the empty initial baseline.
function checkedDrafts(parse: Parse, work: string): Drafts {
  const inputs = Object.fromEntries(drafts.map(name => [name, read(join(work, name))]));
  const [run, discovery, baseline] = drafts.map(name => parse((inputs[name] as Buffer).toString())) as (Fields | null | undefined)[];
  const progress = run?.progress as Fields | null | undefined;
  const snapshot = run?.snapshot as Fields | null | undefined;
  assert(run?.formatVersion === 1 && run.mode === 'A' && run.status === 'in-progress' &&
    progress?.inventory === 'complete' && progress.entryAnalysis === 'complete' &&
    progress.inspectionPriorities !== 'complete' &&
    progress.baselineRecovery === 'pending' && snapshot?.root === 'snapshot' &&
    typeof snapshot.id === 'string' && object(run.artifacts), 'Expected a completed Stage 2 handoff.');
  assert(discovery?.formatVersion === 1 && discovery.kind === 'architecture-discovery' &&
    discovery.runRef === run.id && typeof discovery.entryAnalysisRef === 'string', 'Expected selected entry analysis.');
  assert(baseline?.formatVersion === 1 && typeof baseline.id === 'string' && baseline.parentId === null &&
    ['components', 'interfaces', 'resources', 'rules'].every(key => {
      const records = baseline[key];
      return Array.isArray(records) && records.length === 0;
    }), 'Expected an empty initial baseline.');
  return { inputs, run, discovery };
}

// Every registered artifact of the run with its bytes, checked against its digest.
function registeredArtifacts(run: Fields, work: string, id: string): Map<string, RegisteredArtifact> {
  const artifacts = new Map<string, RegisteredArtifact>();
  for (const [ref, value] of Object.entries(run.artifacts as Fields)) {
    const record = value as Fields | null | undefined;
    const path = record?.path;
    assert(safePath(path) && !drafts.includes(path) &&
      !path.startsWith('evidence/' + id + '/') && isDigest(record?.sha256), 'Invalid registered artifact: ' + ref);
    const bytes = read(join(work, path));
    assert(hash(bytes) === record?.sha256, 'Changed registered artifact: ' + ref);
    artifacts.set(ref, { path, ref, bytes });
  }
  return artifacts;
}

function indexedFiles(inventory: Fields): Map<string, IndexedFile> {
  const files = new Map<string, IndexedFile>();
  for (const entry of inventory.files as (IndexedFile | null | undefined)[]) {
    assert(safePath(entry?.path) && !files.has(entry.path) &&
      (entry.kind === 'symlink' || (entry.kind === 'file' && isDigest(entry.sha256))),
    'Invalid or repeated inventory path: ' + entry?.path);
    files.set(entry.path, entry);
  }
  return files;
}

// The checked run after Stage 2 that a Stage 3 action reads.
export function handoffState(parse: Parse, work: string, id: string): StageState {
  const { inputs, run, discovery } = checkedDrafts(parse, work);
  const artifacts = registeredArtifacts(run, work, id);
  function artifact(ref: unknown): RegisteredArtifact {
    const record = artifacts.get(ref as string);
    assert(record, 'Missing registered artifact: ' + ref);
    return record;
  }

  const runSnapshot = run.snapshot as Fields;
  const { id: snapshotRef, inventoryRef } = runSnapshot;
  const snapshot = directory(join(work, runSnapshot.root as string));
  const { dev, ino } = lstatSync(snapshot);
  const inventoryArtifact = artifact(inventoryRef);
  const inventory = JSON.parse(inventoryArtifact.bytes.toString()) as Fields | null | undefined;
  assert(inventory?.formatVersion === 1 && inventory.snapshotId === snapshotRef &&
    Array.isArray(inventory.files), 'Inventory snapshot mismatch.');
  const files = indexedFiles(inventory);

  const { entryAnalysisRef } = discovery;
  const analysis = parse(artifact(entryAnalysisRef).bytes.toString()) as Fields | null | undefined;
  assert(analysis?.formatVersion === 1 && analysis.kind === 'entry-analysis' && analysis.snapshotRef === snapshotRef,
    'Selected entry analysis must describe this snapshot.');
  const { planRef, knipRunsRef } = analysis;
  const plan = JSON.parse(artifact(planRef).bytes.toString()) as Fields | null | undefined;
  const runsArtifact = artifact(knipRunsRef);
  const runs = JSON.parse(runsArtifact.bytes.toString()) as Fields | null | undefined;
  assert(plan?.formatVersion === 1 && plan.snapshotRef === snapshotRef &&
    runs?.formatVersion === 1 && runs.snapshotRef === snapshotRef && Array.isArray(runs.runs),
  'Selected plan and Knip runs must describe this snapshot.');
  const facts: StageFacts = {
    runRef: run.id, snapshotRef, inventoryRef, snapshot: { path: snapshot, dev, ino },
    entryAnalysisRef, planRef, knipRunsRef, registeredArtifacts: artifacts.size,
    indexedRegularFiles: [...files.values()].filter(file => file.kind === 'file').length,
    checkpointDigests: Object.fromEntries(drafts.map(name => [checkpoint(name), hash(inputs[name] as Buffer)])),
  };
  return { facts, snapshotRecord: runSnapshot, inputs, files, artifacts, runsArtifact, runs, analysis };
}

// The path of an indexed regular file of the snapshot, with its inventory record.
function indexedSource(state: StageState, path: string): { absolute: string; file: IndexedFile } {
  const file = state.files.get(path);
  assert(safePath(path) && file?.kind === 'file', 'Path is outside the indexed regular files: ' + path);
  const absolute = join(state.facts.snapshot.path, path);
  const stat = lstatSync(absolute);
  assert(stat.isFile() && stat.size === file.bytes && realpathSync(absolute) === absolute, 'Changed indexed source: ' + path);
  return { absolute, file };
}

// Checks the size and digest of a file in parts, without keeping its bytes.
function checkStreamedDigest(absolute: string, file: IndexedFile, path: string): void {
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular saved source: ' + path);
    const digest = createHash('sha256'); const chunk = Buffer.alloc(64 * 1024); let size = 0; let count: number;
    while ((count = readSync(fd, chunk, 0, chunk.length, null)) > 0) { digest.update(chunk.subarray(0, count)); size += count; }
    assert(size === file.bytes && digest.digest('hex') === file.sha256, 'Changed indexed source: ' + path);
  } finally { closeSync(fd); }
}

// Checks that an indexed regular file of the snapshot still has its inventory size and digest.
export function checkIndexedSource(state: StageState, path: string): void {
  const { absolute, file } = indexedSource(state, path);
  checkStreamedDigest(absolute, file, path);
}

// The bytes of an indexed regular file of the snapshot, checked against the inventory.
export function readSource(state: StageState, path: string, maxBytes = Infinity): Buffer {
  const { absolute, file } = indexedSource(state, path);
  if (file.bytes > maxBytes) {
    checkStreamedDigest(absolute, file, path);
    throw Object.assign(new Error('Excerpt source exceeds 2 MiB: ' + path), { code: 'EXCERPT_SOURCE_TOO_LARGE' });
  }
  const bytes = read(absolute);
  assert(bytes.length === file.bytes && hash(bytes) === file.sha256, 'Changed indexed source: ' + path);
  return bytes;
}

// Numbered lines of an indexed UTF-8 file. A focused (initial) excerpt stops at the
// end of the file or at 100 KiB; a requested range must fit in both.
export function numberedExcerpt(state: StageState, path: string, first: number, last: number, focused: boolean): Excerpt {
  const bytes = readSource(state, path, excerptSourceBytes);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const all = text ? text.replace(/(?:\r\n|[\r\n])$/, '').split(/\r\n|[\r\n]/) : [];
  assert(focused || last <= all.length, 'Requested lines exceed the indexed file: ' + path);
  const lines: string[] = [];
  let size = 0;
  for (let line = first; line <= Math.min(last, all.length); line++) {
    const numbered = line + ': ' + all[line - 1];
    size += Buffer.byteLength(numbered) + (lines.length ? 1 : 0);
    if (size > excerptBytes) {
      assert(focused, 'Requested excerpt exceeds 100 KiB: ' + path);
      break;
    }
    lines.push(numbered);
  }
  const end = first + lines.length - 1;
  return {
    snapshotRef: state.facts.snapshotRef, path, sha256: (state.files.get(path) as IndexedFile).sha256,
    lines: lines.length ? [first, end] : null, excerpt: lines.join('\n'), totalLineCount: all.length,
    truncated: first > 1 || end < all.length,
  };
}
