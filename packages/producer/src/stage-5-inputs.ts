import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assert, type Fields, hash, object, text } from './record-checks.ts';
import { directory, read } from './stage-3-inputs.ts';
import type { EntryAnalysis, IndexedFile, QueryState } from './stage-5-query.ts';

// The checked inputs of a Stage 5 action: the working drafts after the published
// Stage 4 review, the registered artifacts checked by digest, every indexed
// snapshot file checked by digest, the selected Stage 4 facts and the chain of
// saved entry analyses. Saved JSON and YAML stay unchecked values until the checks
// below read them.
export type Parse = (text: string) => unknown;
// The facts that start saves in handoff.json and every later action compares, in this key order.
export type StageFacts = Fields;
export interface StageState extends QueryState {
  facts: StageFacts;
  inputs: Record<string, Buffer>;
  resourceAccessRef: string;
}
interface Drafts { inputs: Record<string, Buffer>; run: Fields; discovery: Fields; baseline: Fields }
interface Registered { count: number; digests: Record<string, unknown>; artifact(ref: unknown): Buffer }
interface FactRefs { selected: string; mappingRef: string; graphRef: string; resourceAccessRef: string; sourceSitesRef: string }
type Header = QueryState['header'];

export const draftNames = ['run.yaml', 'discovery.yaml', 'baseline.yaml'];
export const checkpoint = (name: string): string => name.replace('.yaml', '.before.yaml');
export const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

export function safe(name: unknown): name is string {
  return text(name) && !isAbsolute(name) && !/[\\\u0000-\u001f\u007f]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}

function openFile(path: string): number {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical regular file: ' + path);
  return openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
}

// Streams the file to check its size and digest.
function hashIndexed(fd: number, file: IndexedFile): string {
  const stream = createHash('sha256');
  const block = Buffer.allocUnsafe(64 * 1024);
  let count = 0;
  for (let length: number; (length = readSync(fd, block, 0, block.length, null)) > 0;) {
    stream.update(block.subarray(0, length));
    count += length;
  }
  assert(count === file.bytes, 'Indexed file size changed while hashing: ' + file.path);
  return stream.digest('hex');
}

// Reads all bytes of the file.
function readAll(fd: number, file: IndexedFile): Buffer {
  const bytes = Buffer.allocUnsafe(file.bytes);
  let offset = 0;
  while (offset < bytes.length) {
    const length = readSync(fd, bytes, offset, bytes.length - offset, null);
    assert(length > 0, 'Indexed file shrank while reading: ' + file.path);
    offset += length;
  }
  return bytes;
}

// Checks an indexed snapshot file against the inventory. With maxBytes, it also
// returns the bytes of a file of at most maxBytes.
function readIndexed(snapshot: string, file: IndexedFile, maxBytes?: number): Buffer | undefined {
  const path = join(snapshot, file.path);
  if (maxBytes !== undefined) assert(file.bytes <= maxBytes, 'Indexed input exceeds byte limit: ' + file.path);
  const fd = openFile(path);
  try {
    const before = fstatSync(fd);
    assert(before.isFile() && before.size === file.bytes, 'Indexed file type or size changed: ' + file.path);
    let checksum: string;
    let bytes: Buffer | undefined;
    if (maxBytes === undefined) checksum = hashIndexed(fd, file);
    else {
      bytes = readAll(fd, file);
      checksum = hash(bytes);
    }
    const after = fstatSync(fd);
    const current = lstatSync(path);
    assert(after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs &&
      current.dev === before.dev && current.ino === before.ino && realpathSync(path) === path && checksum === file.sha256,
    'Indexed file changed: ' + file.path);
    return bytes;
  } finally { closeSync(fd); }
}

// The run draft records a finalized Stage 4 and a pending baseline recovery.
function checkRun(run: Fields): void {
  const progress = run?.progress as Fields | undefined;
  const snapshot = run?.snapshot as Fields | undefined;
  assert(run?.formatVersion === 1 && run.mode === 'A' && run.status === 'in-progress' &&
    ['inventory', 'entryAnalysis', 'inspectionPriorities', 'componentRecovery'].every(key => progress?.[key] === 'complete') &&
    progress?.baselineRecovery === 'pending' && !Object.hasOwn(progress, 'remainingCode') &&
    snapshot?.root === 'snapshot' && text(snapshot.id) && object(run.artifacts),
  'Expected finalized Stage 4 and pending baseline recovery.');
}

// The working drafts: finalized Stage 4, published discovery and the proposed baseline.
function checkedDrafts(parse: Parse, work: string): Drafts {
  const inputs = Object.fromEntries(draftNames.map(name => [name, read(join(work, name))]));
  const [run, discovery, baseline] = draftNames.map(name => parse((inputs[name] as Buffer).toString('utf8')) as Fields) as
    [Fields, Fields, Fields];
  checkRun(run);
  assert(discovery?.formatVersion === 1 && discovery.kind === 'architecture-discovery' &&
    discovery.runRef === run.id && !Object.hasOwn(discovery, 'baselineRef') &&
    text((discovery.overview as Fields | undefined)?.text) && Array.isArray(discovery.inspectedPaths),
  'Expected published Stage 4 discovery without a fixed baseline.');
  assert([1, 2, 3, 4, 6].includes(baseline?.formatVersion as number) && text(baseline.id) && baseline.parentId === null &&
    ['components', 'interfaces', 'resources', 'rules'].every(key => Array.isArray(baseline[key])) &&
    (baseline.components as unknown[]).length > 0,
  'Expected the proposed working baseline.');
  return { inputs, run, discovery, baseline };
}

// The registered artifacts of the run, checked by digest. This attempt is not registered yet.
function registeredArtifacts(run: Fields, work: string, id: string): Registered {
  const artifacts = new Map<string, Buffer>();
  const registeredPaths = new Set<string>();
  const records = run.artifacts as Record<string, { path?: unknown; sha256?: unknown }>;
  for (const [ref, record] of Object.entries(records)) {
    assert(safe(record?.path) && digest(record.sha256) && !draftNames.includes(record.path) &&
      !record.path.startsWith('evidence/' + id + '/') && !registeredPaths.has(record.path), 'Invalid registered artifact: ' + ref);
    const bytes = read(join(work, record.path));
    assert(hash(bytes) === record.sha256, 'Registered artifact changed: ' + ref);
    artifacts.set(ref, bytes);
    registeredPaths.add(record.path);
  }
  return {
    count: artifacts.size,
    digests: Object.fromEntries(Object.entries(records).map(([ref, record]) => [ref, record?.sha256])),
    artifact(ref) {
      assert(artifacts.has(ref as string), 'Missing registered artifact: ' + ref);
      return artifacts.get(ref as string) as Buffer;
    },
  };
}

// The references of the selected Stage 4 attempt, whose published proposals are the working drafts.
function selectedFacts({ inputs, discovery }: Drafts, { artifact }: Registered): FactRefs {
  const selected = discovery.entryAnalysisRef as string;
  const stage4 = /^s4-[a-z0-9]+(?:-[a-z0-9]+)*(?=-entry-analysis$)/.exec(selected ?? '')?.[0];
  assert(stage4, 'Expected the selected Stage 4 entry analysis.');
  const stage4Ref = (name: string): string => stage4 + '-file@' + encodeURIComponent(name);
  for (const [draft, proposed] of [['baseline.yaml', 'baseline.proposed.yaml'], ['discovery.yaml', 'discovery.proposed.yaml']])
    assert((inputs[draft as string] as Buffer).equals(artifact(stage4Ref(proposed as string))),
      'Working draft differs from the published proposal: ' + draft);
  const refs = { selected, mappingRef: discovery.codeMappingRef as string, graphRef: discovery.dependenciesRef as string,
    resourceAccessRef: discovery.resourceAccessRef as string, sourceSitesRef: stage4Ref('source-sites.json') };
  assert(refs.mappingRef === stage4Ref('code-mapping.json') && refs.graphRef === stage4Ref('graph-results.json') &&
    refs.resourceAccessRef === stage4Ref('resource-access.json'), 'Stage 4 fact references do not match the selected attempt.');
  return refs;
}

// The saved snapshot folder and the indexed regular files of the inventory, each checked against it.
function indexedSnapshot(run: Fields, header: Header, artifact: Registered['artifact'], work: string):
  { snapshot: string; indexed: Map<string, IndexedFile> } {
  const inventory = JSON.parse(String(artifact((run.snapshot as Fields).inventoryRef))) as Fields;
  assert(inventory.formatVersion === 1 && inventory.snapshotId === header.snapshotRef && Array.isArray(inventory.files),
    'Inventory snapshot mismatch.');
  const snapshot = directory(join(work, (run.snapshot as Fields).root as string));
  const indexed = new Map<string, IndexedFile>();
  for (const file of inventory.files as (IndexedFile | null | undefined)[]) {
    assert(safe(file?.path) && file.kind === 'file' && digest(file.sha256) && Number.isSafeInteger(file.bytes) &&
      file.bytes >= 0 && !indexed.has(file.path), 'Expected unique indexed regular files.');
    readIndexed(snapshot, file);
    indexed.set(file.path, file);
  }
  return { snapshot, indexed };
}

// The mapping, the graph, the resource observations and the source sites of the selected Stage 4 attempt.
function stageFourRecords(refs: FactRefs, drafts: Drafts, artifact: Registered['artifact'],
  { header, indexed }: { header: Header; indexed: Map<string, IndexedFile> }): { mapping: Fields; graph: Fields; sourceSites: Fields } {
  const [mapping, graph, resourceAccess, sourceSites] = [refs.mappingRef, refs.graphRef, refs.resourceAccessRef, refs.sourceSitesRef]
    .map(ref => JSON.parse(String(artifact(ref))) as Fields) as [Fields, Fields, Fields, Fields];
  assert([mapping, graph, resourceAccess, sourceSites].every(record =>
    record.formatVersion === 1 && record.snapshotRef === header.snapshotRef), 'A Stage 4 fact uses a different snapshot.');
  const scope = mapping.scope as Fields | undefined;
  assert(mapping.kind === 'code-mapping' && scope?.inventoryRef === (drafts.run.snapshot as Fields).inventoryRef &&
    scope?.unitKind === 'file' && Array.isArray(mapping.units) && mapping.units.length === indexed.size,
  'Expected a complete file mapping for the saved inventory.');
  const components = drafts.baseline.components as Fields[];
  const componentIds = new Set(components.map(item => item.id));
  assert(componentIds.size === components.length && [...componentIds].every(text), 'Invalid proposed component IDs.');
  const mapped = new Set<unknown>();
  for (const unit of mapping.units as (Fields | null | undefined)[]) {
    assert(unit && indexed.get(unit.path as string)?.sha256 === unit.sha256 && !mapped.has(unit.path) &&
      Array.isArray(unit.roles) && (unit.owner === null || componentIds.has(unit.owner)), 'Invalid mapped file: ' + unit?.path);
    mapped.add(unit.path);
  }
  const contexts = graph.contexts as Fields[];
  assert(Array.isArray(contexts) && contexts.length > 0 && new Set(contexts.map(context => context.id)).size === contexts.length &&
    contexts.every(context => text(context.id) && Array.isArray(context.scanFiles) && Array.isArray(context.edges)) &&
    Array.isArray(sourceSites.sites) && (sourceSites.sites as Fields[]).every(site =>
      indexed.get(site.path as string)?.sha256 === site.sha256) &&
    resourceAccess.kind === 'resource-observations' && Array.isArray(resourceAccess.observations),
  'Invalid Stage 4 graph or source facts.');
  return { mapping, graph, sourceSites };
}

// The selected entry analysis and its saved predecessors, newest first.
function entryAnalyses(parse: Parse, selected: string, header: Header, artifact: Registered['artifact']): EntryAnalysis[] {
  const entryChain: EntryAnalysis[] = [];
  const seen = new Set<unknown>();
  for (let ref: unknown = selected; ref !== undefined;) {
    assert(text(ref) && !seen.has(ref), 'Invalid or cyclic entry-analysis history.');
    seen.add(ref);
    const analysis = parse(artifact(ref).toString('utf8')) as Fields;
    assert(analysis?.formatVersion === 1 && analysis.kind === 'entry-analysis' && analysis.snapshotRef === header.snapshotRef &&
      analysis.llmReview === 'recorded' && Array.isArray(analysis.candidates) && Array.isArray(analysis.reviewedFiles),
    'Invalid saved entry analysis: ' + ref);
    entryChain.push({ ref, analysis });
    ref = analysis.previousEntryAnalysisRef;
  }
  return entryChain;
}

// The checked run after the published Stage 4 review, and the facts that start saves.
export function readState(parse: Parse, { work, tools, id }: { work: string; tools: string; id: string }): StageState {
  const drafts = checkedDrafts(parse, work);
  const { run, discovery } = drafts;
  const snapshotRecord = run.snapshot as Fields;
  const header = { formatVersion: 1, attemptId: id, runRef: run.id, snapshotRef: snapshotRecord.id };
  const registered = registeredArtifacts(run, work, id);
  const { artifact } = registered;
  const refs = selectedFacts(drafts, registered);
  const { snapshot, indexed } = indexedSnapshot(run, header, artifact, work);
  const { mapping, graph, sourceSites } = stageFourRecords(refs, drafts, artifact, { header, indexed });
  const entryChain = entryAnalyses(parse, refs.selected, header, artifact);
  const entry = (entryChain[0] as EntryAnalysis).analysis;
  assert((entry.reachability as Fields | undefined)?.dependenciesRef === refs.graphRef && Array.isArray(entry.behaviorEntries) &&
    isDeepStrictEqual(entry.questions, discovery.questions) && isDeepStrictEqual(entry.gaps, discovery.gaps),
  'Selected entry analysis differs from the published Stage 4 discovery.');
  artifact(entry.planRef);
  artifact(entry.knipRunsRef);
  const { dev, ino } = lstatSync(snapshot);
  const facts = {
    ...header, work, tools, snapshot: { path: snapshot, dev, ino },
    inventoryRef: snapshotRecord.inventoryRef, inventorySha256: hash(artifact(snapshotRecord.inventoryRef)),
    mappingRef: refs.mappingRef, graphRef: refs.graphRef, resourceAccessRef: refs.resourceAccessRef,
    sourceSitesRef: refs.sourceSitesRef, entryAnalysisRef: refs.selected,
    entryAnalysisHistory: entryChain.map(item => item.ref), planRef: entry.planRef, knipRunsRef: entry.knipRunsRef,
    indexedRegularFiles: indexed.size, registeredArtifacts: registered.count, registeredArtifactDigests: registered.digests,
    checkpointDigests: Object.fromEntries(draftNames.map(name => [checkpoint(name), hash(drafts.inputs[name] as Buffer)])),
  };
  return { header, facts, inputs: drafts.inputs, indexed, snapshotRoot: snapshot, mapping, mappingRef: refs.mappingRef, graph,
    graphRef: refs.graphRef,
    resourceAccessRef: refs.resourceAccessRef, sourceSites, sourceSitesRef: refs.sourceSitesRef, entryChain,
    readIndexed: (path, maxBytes) => {
      assert(indexed.has(path), 'File is outside the inventory: ' + path);
      return readIndexed(snapshot, indexed.get(path) as IndexedFile, maxBytes) as Buffer;
    } };
}
