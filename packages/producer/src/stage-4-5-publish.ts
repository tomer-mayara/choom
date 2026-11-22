import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync,
  readdirSync, realpathSync, rmdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import type * as Yaml from 'yaml';
import { CandidateGaps } from './candidate-gaps.ts';
import { draftUpdate, type DraftUpdate } from './draft-update.ts';
import { checkReasoningNotSaved, checkVisibleResponse } from './llm-response.ts';
import { refuseChangedProducerCode } from './producer-code.ts';
import { type Artifact, type Fields, sourceExtension } from './record-checks.ts';
import { runLayout } from './run-layout.mjs';
import { RunSummary } from './run-summary.ts';
import { SavedAttemptFiles } from './saved-attempt-files.ts';
import type { ProjectTools } from './snapshot-project.ts';
import { readBaselineYaml, type RecordCounts, type RunRecord, validateDiscoveryRecords } from './stage-6-records.ts';
import { checkPinnedModules, loadTsMorph } from './ts-morph-modules.ts';

// The Stage 4/5 publisher. check validates a reviewed packet, finish validates it
// again and publishes it as one update of the drafts, and verify checks a
// published attempt. Saved JSON and YAML stay unchecked values until the checks read them.
type Packet = Map<string, Buffer>;
interface IndexedFile { path: string; kind: unknown; bytes: number; sha256: string }
// The checked inputs of a publication: the checkpointed drafts, the registered
// artifacts, the indexed snapshot and the attempt files.
interface State {
  drafts: Map<string, Buffer>;
  run: RunRecord;
  priorDiscovery: Fields;
  priorBaseline: Fields;
  artifacts: Map<string, Artifact>;
  put(ref: string, path: unknown, bytes: Buffer, sha256?: unknown): void;
  inventory: Fields;
  indexed: Map<unknown, IndexedFile>;
  attemptFiles: Map<string, Buffer>;
  verifySnapshot(): void;
  readSource(path: string, limit: number): Buffer;
}
interface Candidate { counts: RecordCounts; baseline: unknown; discovery: Fields }

const [action, stage, reviewDirectory, ...extra] = process.argv.slice(2);
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const object = (value: unknown): value is Fields => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safe = (value: unknown): value is string => text(value) && !isAbsolute(value) &&
  !/[\\\u0000-\u001f\u007f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const encode = (value: unknown): Buffer => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const exists = (path: string): boolean => Boolean(lstatSync(path, { throwIfNoEntry: false }));
function directory(path: string | undefined): string {
  assert(isAbsolute(path ?? '') && lstatSync(path as string).isDirectory() && realpathSync(path as string) === path,
    'Expected a canonical directory: ' + path);
  return path as string;
}
function read(root: string, name: unknown): Buffer {
  assert(safe(name), 'Invalid file path: ' + name);
  const path = join(root, name);
  const before = lstatSync(path);
  assert(before.isFile() && realpathSync(path) === path && before.size <= 128 * 1024 * 1024,
    'Expected a bounded canonical regular file: ' + path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    assert(opened.isFile() && opened.dev === before.dev && opened.ino === before.ino, 'File changed before read: ' + path);
    const bytes = readFileSync(fd);
    const after = lstatSync(path);
    assert(bytes.length === before.size && after.dev === before.dev && after.ino === before.ino &&
      after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs,
    'File changed during read: ' + path);
    return bytes;
  } finally { closeSync(fd); }
}
function names(root: string, prefix = ''): string[] {
  return readdirSync(join(root, prefix)).sort().flatMap(name => {
    const relative = prefix ? prefix + '/' + name : name;
    assert(safe(relative), 'Invalid filename: ' + relative);
    const path = join(root, relative);
    if (lstatSync(path).isDirectory()) { directory(path); return names(root, relative); }
    assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical regular file: ' + path);
    return [relative];
  }).sort();
}
function verifyIndexed(root: string, item: IndexedFile): void {
  const path = join(root, item.path);
  const before = lstatSync(path);
  assert(before.isFile() && realpathSync(path) === path && before.size === item.bytes, 'Indexed metadata changed: ' + item.path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    assert(opened.isFile() && opened.dev === before.dev && opened.ino === before.ino, 'Indexed file changed before read: ' + item.path);
    const stream = createHash('sha256');
    const block = Buffer.allocUnsafe(64 * 1024);
    let bytes = 0;
    for (let length; (length = readSync(fd, block, 0, block.length, null)) > 0;) {
      stream.update(block.subarray(0, length)); bytes += length;
    }
    const after = lstatSync(path);
    assert(bytes === item.bytes && stream.digest('hex') === item.sha256 && after.dev === before.dev && after.ino === before.ino &&
      after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs,
    'Indexed file changed: ' + item.path);
  } finally { closeSync(fd); }
}
const recordFiles = ['baseline.proposed.yaml', 'discovery.proposed.yaml', 'entry-analysis.yaml',
  'code-mapping.json', 'resource-access.json'];
const packetFiles = [...recordFiles, 'llm/analysis-prompt.md', 'llm/analysis-response.md',
  'llm/analysis-call.yaml', 'llm/review-scope.json'];
// The record format that Stage 4 and Stage 5 start saved. It must still match the
// tool checkout; the producer code check covers the code.
const toolFiles = ['record-format.md'];
const draftFiles = ['run.yaml', 'baseline.yaml', 'discovery.yaml'];
// The order in which publication replaces the drafts: the run manifest, the publication marker, last.
const replacedDrafts = ['baseline.yaml', 'discovery.yaml', 'run.yaml'];
const checkpoint = (name: string): string => name.replace('.yaml', '.before.yaml');
const receiptName = 'publication.json';
const progressKey = stage === '4' ? 'componentRecovery' : 'remainingCode';
assert(['4', '5'].includes(stage as string) && extra.length === 0 &&
  ((['check', 'finish'].includes(action as string) && isAbsolute(reviewDirectory ?? '')) ||
    (action === 'verify' && reviewDirectory === undefined)), 'Use check STAGE REVIEW_DIR, finish STAGE REVIEW_DIR, or verify STAGE (4 or 5).');
const id = process.env['CHOOM_STAGE' + stage + '_ID'] ?? '';
assert(new RegExp('^s' + stage + '-[a-z0-9]+(?:-[a-z0-9]+)*$').test(id), 'Set the matching stage attempt ID.');
const work = directory(process.env.CHOOM_WORK);
const tools = directory(process.env.CHOOM_TOOLS);
runLayout(work, tools);
const source = directory(join(tools, 'packages/producer/src'));
// The record format stays with the cookbooks in docs/design/app-a.
const documents = directory(join(tools, 'docs/design/app-a'));
const sourceFolder = (name: string): string => name.endsWith('.md') ? documents : source;
assert(fileURLToPath(import.meta.url) === join(source, 'stage-4-5-publish.ts'), 'Use the publisher in the trusted checkout.');
const attempt = directory(join(directory(join(work, 'evidence')), id));
assert(process.env['CHOOM_STAGE' + stage] === attempt, 'Set the matching stage attempt directory.');
refuseChangedProducerCode(work, tools);
const require = createRequire(join(tools, 'package.json'));
const yamlPath = require.resolve('yaml');
assert(yamlPath.startsWith(join(tools, 'node_modules/yaml') + '/') && realpathSync(yamlPath) === yamlPath,
  'Use YAML from the trusted checkout.');
const yaml = require(yamlPath) as typeof Yaml;
const { parse, stringify } = yaml;
const parseBytes = (bytes: Buffer | undefined): Fields => parse((bytes as Buffer).toString('utf8')) as Fields;
const json = (bytes: Buffer | undefined): Fields => JSON.parse((bytes as Buffer).toString('utf8')) as Fields;
const refFor = (name: string): string => name === 'entry-analysis.yaml' ? id + '-entry-analysis' : id + '-file@' + encodeURIComponent(name);
const lock = join(work, '.app-a-publish.lock');

function checkpointedRun(): Pick<State, 'drafts' | 'run' | 'priorDiscovery' | 'priorBaseline'> {
  const drafts = new Map(draftFiles.map(name => [name, read(attempt, checkpoint(name))]));
  const run = parseBytes(drafts.get('run.yaml'));
  const priorDiscovery = parseBytes(drafts.get('discovery.yaml'));
  const priorBaseline = readBaselineYaml(drafts.get('baseline.yaml') as Buffer, yaml) as Fields;
  const progress = run?.progress as Fields | null | undefined;
  assert(run?.formatVersion === 1 && run.mode === 'A' && run.status === 'in-progress' &&
    (run.snapshot as Fields | null | undefined)?.root === 'snapshot' &&
    ['inventory', 'entryAnalysis', 'inspectionPriorities'].every(key => progress?.[key] === 'complete') &&
    (progress as Fields).baselineRecovery === 'pending' && !Object.hasOwn(progress as Fields, progressKey) &&
    (stage === '4' || (progress as Fields).componentRecovery === 'complete'), 'Unexpected pre-publication run state.');
  return { drafts, run: run as RunRecord, priorDiscovery, priorBaseline };
}

// The registered artifacts of the run, each checked by digest.
function registry(run: RunRecord): Pick<State, 'artifacts' | 'put'> {
  const artifacts = new Map<string, Artifact>();
  const paths = new Set<unknown>();
  const put = (ref: string, path: unknown, bytes: Buffer, sha256: unknown = hash(bytes)): void => {
    assert(text(ref) && !artifacts.has(ref) && safe(path) && !draftFiles.includes(path) && !paths.has(path) && digest(sha256),
      'Invalid or colliding artifact: ' + ref);
    assert(hash(bytes) === sha256, 'Registered artifact changed: ' + ref);
    artifacts.set(ref, { path, bytes, sha256 }); paths.add(path);
  };
  for (const [ref, item] of Object.entries((run.artifacts ?? {}) as Record<string, Fields>))
    put(ref, item.path, read(work, item.path), item.sha256);
  return { artifacts, put };
}

// The saved inventory and the snapshot files that it indexes, each checked by digest.
function indexedSnapshot(run: RunRecord, artifacts: Map<string, Artifact>): Pick<State, 'inventory' | 'indexed'> & { snapshot: string } {
  const inventory = json(artifacts.get(run.snapshot.inventoryRef)?.bytes ?? Buffer.from('null'));
  assert(inventory?.formatVersion === 1 && inventory.snapshotId === run.snapshot.id && Array.isArray(inventory.files), 'Invalid inventory.');
  const snapshot = directory(join(work, 'snapshot'));
  const indexed = new Map<unknown, IndexedFile>();
  for (const item of inventory.files as IndexedFile[]) {
    assert(safe(item.path) && item.kind === 'file' && !indexed.has(item.path) && digest(item.sha256) &&
      Number.isSafeInteger(item.bytes) && item.bytes >= 0, 'This profile requires unique regular inventory files.');
    verifyIndexed(snapshot, item);
    indexed.set(item.path, item);
  }
  assert(same(names(snapshot), [...indexed.keys()].sort()), 'Snapshot file set differs from its inventory.');
  return { inventory, indexed, snapshot };
}

// The attempt files. The handoff names this run and attempt, and the drafts and tool documents that start froze.
function attemptInput(run: RunRecord, drafts: Map<string, Buffer>): { attemptFiles: Map<string, Buffer>; get(name: string): Buffer } {
  const attemptFiles = new Map(names(attempt).map(name => [name, read(attempt, name)]));
  const get = (name: string): Buffer => { assert(attemptFiles.has(name), 'Missing attempt file: ' + name); return attemptFiles.get(name) as Buffer; };
  const handoff = json(get('handoff.json'));
  assert(handoff.attemptId === id && handoff.runRef === run.id && handoff.snapshotRef === run.snapshot.id &&
    handoff.work === work && handoff.tools === tools, 'Attempt identities changed.');
  const checkpointDigests = handoff.checkpointDigests as Fields | null | undefined;
  const toolInputDigests = handoff.toolInputDigests as Fields | null | undefined;
  for (const [name, bytes] of drafts) assert(checkpointDigests?.[checkpoint(name)] === hash(bytes), 'Checkpoint digest changed: ' + name);
  for (const name of toolFiles) assert(toolInputDigests?.[name] === hash(get(name)) && get(name).equals(read(sourceFolder(name), name)),
    'Publication tools changed or were not frozen at start: ' + name + '. Use a new attempt.');
  return { attemptFiles, get };
}

// The numbered requests of each stage after collect: excerpts, in Stage 4 also references, and in Stage 5 also parts.
const requestPhase = new RegExp('^(?:' + (stage === '4' ? 'excerpt|references' : 'excerpt|parts') + ')-[0-9]+$');

// Each required phase and each numbered request completed, and its recorded outputs did not change.
// A failed request has no output. Returns the files that the phases saved: each receipt,
// its start record and the outputs and logs that it records.
function checkPhases(attemptFiles: Map<string, Buffer>, get: (name: string) => Buffer): SavedAttemptFiles {
  const required = stage === '4' ? ['start', 'toolchain', 'run', 'collect'] : ['start', 'collect'];
  const requiredOutputs: Record<string, string[]> = {
    start: [...draftFiles.map(checkpoint), ...toolFiles, 'handoff.json',
      ...(stage === '4' ? ['graph-profile.json', 'behavior-entry-rules.yaml', 'resource-access-rules.yaml'] : ['scope.json'])],
    toolchain: ['toolchain-selection.json'], run: ['graph-results.json', 'graph-run.json'],
    collect: stage === '4' ? ['source-sites.json', 'behavior-entry-candidates.json', 'resource-access-candidates.json',
      'source-excerpts.json', 'review-prompt.md', 'artifact-map.json'] :
      ['remaining-units.json', 'inspection-coverage.json', 'source-candidates.json', 'source-excerpts.json', 'review-prompt.md', 'artifact-map.json'],
  };
  const requests = [...attemptFiles.keys()].flatMap(name => /^operator-(.+)\.started\.json$/.exec(name)?.slice(1) ?? [])
    .filter(phase => requestPhase.test(phase));
  const phases = [...new Set([...required, ...requests])];
  const saved = new SavedAttemptFiles();
  for (const phase of phases) {
    const receipt = json(get('operator-' + phase + '.json'));
    const started = json(get('operator-' + phase + '.started.json'));
    assert(receipt.attemptId === id && receipt.phase === phase &&
      receipt.startedAt === started.startedAt && same(receipt.command, started.command),
    'Collection or request identity changed: ' + phase);
    if (requestPhase.test(phase) && receipt.status === 'failed' && receipt.exitCode !== 0) {
      assert(!attemptFiles.has(phase + '.json') && Object.keys(receipt.digests ?? {}).length === 0,
        'A failed request has partial output. Preserve it and use a fresh attempt: ' + phase);
    } else {
      assert(receipt.status === 'completed' && receipt.exitCode === 0 && object(receipt.digests),
        'Required collection or request did not complete: ' + phase + '. Preserve it and use a fresh attempt.');
      const digests = receipt.digests;
      assert((requiredOutputs[phase] ?? [phase + '.json']).every(name => Object.hasOwn(digests, name)),
        'Required output was not recorded: ' + phase);
    }
    const recorded = Object.entries({ ...(receipt.digests as Fields), ...(receipt.logDigests as Fields) });
    for (const [name, sha256] of recorded) assert(digest(sha256) && hash(get(name)) === sha256, 'Collection output changed: ' + name);
    saved.addReceipt('operator-' + phase + '.json', ['operator-' + phase + '.started.json', ...recorded.map(([name]) => name)]);
  }
  return saved;
}

function verifiedInput(): State {
  const { drafts, run, priorDiscovery, priorBaseline } = checkpointedRun();
  const { artifacts, put } = registry(run);
  const { inventory, indexed, snapshot } = indexedSnapshot(run, artifacts);
  const { attemptFiles, get } = attemptInput(run, drafts);
  // finish registers every attempt file, so each one must be a file that a producer
  // action saved: a file of a phase, the command log, or a file of the publication.
  checkPhases(attemptFiles, get).add(['commands.md', ...packetFiles, receiptName]).refuseOthers(attemptFiles.keys());
  return { drafts, run, priorDiscovery, priorBaseline, artifacts, put, inventory, indexed, attemptFiles,
    verifySnapshot() {
      assert(same(names(snapshot), [...indexed.keys()].sort()), 'Snapshot file set changed.');
      for (const item of indexed.values()) verifyIndexed(snapshot, item);
    },
    readSource(path, limit) {
      const item = indexed.get(path);
      assert(item && item.bytes <= limit, 'Source is outside scope or exceeds the source limit: ' + path);
      return read(snapshot, path);
    } };
}

// Stage 5 divides a file by symbol selectors with the ts-morph of the tool checkout,
// after the check of its module files against the pins of Stage 5 start: the
// versions.modules of its handoff. Stage 4 maps whole files and divides none.
function stageFiveTsMorph(state: State): ProjectTools {
  const { tools: tsMorph, versions } = loadTsMorph();
  const handoff = json(state.attemptFiles.get('handoff.json'));
  checkPinnedModules(versions.modules, (handoff.versions as Fields | undefined)?.modules, 'Stage 5 start');
  return tsMorph;
}

function reviewMetadata(packet: Packet, state: State): void {
  const scope = json(packet.get('llm/review-scope.json'));
  const call = parseBytes(packet.get('llm/analysis-call.yaml'));
  assert(scope.formatVersion === 1 && scope.runRef === state.run.id && scope.snapshotRef === state.run.snapshot.id &&
    scope.attemptId === id && Array.isArray(scope.suppliedArtifactRefs) && scope.suppliedArtifactRefs.length &&
    scope.suppliedArtifactRefs.every(ref => text(ref) && state.artifacts.has(ref.split('#')[0] as string)) &&
    Array.isArray(scope.limits) && scope.limits.length && scope.limits.every(text), 'Invalid LLM review scope.');
  assert(text(call.provider) && text(call.model) && text(call.date) && (object(call.settings) || call.settings === 'unknown'),
    'Record exposed LLM metadata; use unknown for unavailable values.');
  const response = (packet.get('llm/analysis-response.md') as Buffer).toString('utf8');
  assert(text((packet.get('llm/analysis-prompt.md') as Buffer).toString('utf8')) &&
    recordFiles.every(name => response.includes((packet.get(name) as Buffer).toString('utf8').trimEnd())),
  'Save the complete prompt and response, including the exact five candidate records.');
  checkReasoningNotSaved(call, 'llm/analysis-call.yaml');
  checkVisibleResponse(response, 'llm/analysis-response.md');
}

function candidate(state: State, packet: Packet): Candidate {
  const { run, priorDiscovery, priorBaseline, artifacts, put, inventory, readSource } = state;
  for (const [name, bytes] of [...state.attemptFiles, ...packet]) {
    if (name === receiptName || name.startsWith('.publication-')) continue;
    put(refFor(name), 'evidence/' + id + '/' + name, bytes);
  }
  const baseline = readBaselineYaml(packet.get('baseline.proposed.yaml') as Buffer, yaml) as Fields;
  const discovery = parseBytes(packet.get('discovery.proposed.yaml'));
  const entry = parseBytes(packet.get('entry-analysis.yaml'));
  assert(baseline.id === priorBaseline.id && baseline.parentId === priorBaseline.parentId &&
    discovery.entryAnalysisRef === id + '-entry-analysis' && entry.previousEntryAnalysisRef === priorDiscovery.entryAnalysisRef &&
    discovery.codeMappingRef === refFor('code-mapping.json') && discovery.resourceAccessRef === refFor('resource-access.json') &&
    discovery.dependenciesRef === (stage === '4' ? refFor('graph-results.json') : priorDiscovery.dependenciesRef),
  'Candidate identities or selected facts differ from this stage.');
  const previous = parseBytes((artifacts.get(priorDiscovery.entryAnalysisRef as string) as Artifact).bytes);
  const previousCandidates = previous.candidates as unknown[];
  assert(entry.planRef === previous.planRef && entry.knipRunsRef === previous.knipRunsRef &&
    Array.isArray(entry.candidates) && same(entry.candidates.slice(0, previousCandidates.length), previousCandidates) &&
    same(entry.inspectionPriorities, previous.inspectionPriorities),
  'Preserve previous file candidates, Knip inputs and inspection priorities. Revisit the affected stage for changes.');
  // Stage 4 names the candidates that its collect saved, and Stage 5 keeps them; the shared validator checks them.
  const candidatesRef = stage === '4' ? refFor('behavior-entry-candidates.json') : previous.behaviorEntryCandidatesRef;
  assert(entry.behaviorEntryCandidatesRef === candidatesRef,
    'The entry analysis must name the behavior entry candidates of Stage 4 collect: ' + candidatesRef + '.');
  // The resource observations keep their resource access candidates in the same way.
  const accessRef = stage === '4' ? refFor('resource-access-candidates.json')
    : json((artifacts.get(priorDiscovery.resourceAccessRef as string) as Artifact).bytes).resourceAccessCandidatesRef;
  assert(json(packet.get('resource-access.json')).resourceAccessCandidatesRef === accessRef,
    'The resource observations must name the resource access candidates of Stage 4 collect: ' + accessRef + '.');
  // DB5: the entry analysis copies each gap that the candidate records of Stage 4 collect require, and Stage 5 keeps them.
  CandidateGaps.ofCandidates(candidatesRef).check(artifacts, entry);
  const graph = json((artifacts.get(discovery.dependenciesRef as string) as Artifact).bytes);
  const roots = new Set((graph.contexts as Fields[]).flatMap(context => (context.roots as Fields[]).map(root => root.path)));
  for (const added of entry.candidates.slice(previousCandidates.length) as Fields[])
    assert(added.path === null || !sourceExtension.test(added.path as string) || roots.has(added.path),
      'New JavaScript/TypeScript entry is outside the saved root set: ' + added.id + '. Revisit entry and graph analysis.');
  if (stage === '5') for (const item of priorBaseline.components as Fields[])
    assert((baseline.components as Fields[]).some(next => next.id === item.id), 'Keep continuing component IDs during remaining-code review.');
  reviewMetadata(packet, state);
  // Stage 5 starts from the Stage 4 mapping of whole files; only Stage 5 divides a file by symbol selectors.
  const wholeFiles = 'Stage 4 maps whole files: use formatVersion 6 (1 to 4 for legacy runs) and a mapping with unitKind: file. ' +
    'Stage 5 can divide a file by symbol selectors.';
  assert(stage === '5' || baseline.formatVersion !== 5, wholeFiles);
  const counts = validateDiscoveryRecords({ run, baseline, discovery, artifacts, inventory, parse, readSource,
    reservedIds: [refFor(receiptName)], divisionTools: () => stageFiveTsMorph(state) });
  assert(stage === '5' || (json(packet.get('code-mapping.json')).scope as Fields).unitKind === 'file', wholeFiles);
  return { counts, baseline, discovery };
}

function readPacket(root: string): Packet {
  assert(same(names(root), [...packetFiles].sort()), 'Expected exactly the nine review packet files from record-format.md.');
  return new Map(packetFiles.map(name => [name, read(root, name)]));
}
// The run manifest of the published drafts. Its summary names the records of this
// attempt and counts the questions and gaps of the validated discovery proposal, so
// verify makes the same manifest again from the saved records.
function expectedRun(state: State, receipt: Buffer, discovery: Fields): Buffer {
  const artifacts = Object.fromEntries([...state.artifacts].map(([ref, { path, sha256 }]) => [ref, { path, sha256 }]));
  artifacts[refFor(receiptName)] = { path: 'evidence/' + id + '/' + receiptName, sha256: hash(receipt) };
  const progress = { ...(state.run.progress as Fields), [progressKey]: 'complete' };
  return Buffer.from(stringify({ ...state.run, progress, coverage: new RunSummary({ progress, inventory: state.inventory,
    reviewRef: refFor('entry-analysis.yaml'), codeMappingRef: refFor('code-mapping.json'),
    issuesRef: refFor('discovery.proposed.yaml'), issues: discovery }).coverage(), artifacts }));
}
function checkCurrent(drafts: Map<string, Buffer>): void {
  for (const [name, bytes] of drafts) assert(read(work, name).equals(bytes), 'Working draft changed: ' + name);
}
function sameFiles(root: string, expected: Map<string, Buffer>): void {
  assert(same(names(root), [...expected.keys()].sort()), 'File set changed during publication: ' + root);
  for (const [name, bytes] of expected) assert(read(root, name).equals(bytes), 'File changed during publication: ' + name);
}
function verify(): Fields {
  assert(!exists(lock), 'Publication lock remains: ' + lock);
  const state = verifiedInput();
  const all = state.attemptFiles;
  const receiptBytes = all.get(receiptName);
  assert(receiptBytes, 'Missing publication receipt.');
  const receipt = json(receiptBytes);
  assert(receipt.formatVersion === 1 && receipt.attemptId === id && receipt.runRef === state.run.id &&
    receipt.snapshotRef === state.run.snapshot.id && receipt.stage === Number(stage) && receipt.status === 'prepared-for-publication',
  'Invalid publication receipt.');
  const packet = new Map(packetFiles.map(name => [name, all.get(name) as Buffer]));
  assert(packetFiles.every(name => Buffer.isBuffer(packet.get(name))), 'Missing saved review packet.');
  state.attemptFiles = new Map([...all].filter(([name]) => !packetFiles.includes(name) && name !== receiptName));
  assert(same(receipt.inputDigests, Object.fromEntries([...state.attemptFiles].map(([name, bytes]) => [name, hash(bytes)]))) &&
    same(receipt.packetDigests, Object.fromEntries([...packet].map(([name, bytes]) => [name, hash(bytes)]))), 'Publication evidence changed.');
  const result = candidate(state, packet);
  checkCurrent(new Map([['run.yaml', expectedRun(state, receiptBytes, result.discovery)],
    ['baseline.yaml', packet.get('baseline.proposed.yaml') as Buffer], ['discovery.yaml', packet.get('discovery.proposed.yaml') as Buffer]]));
  return { status: 'stage' + stage + '-publication-verified', ...result.counts, writes: [] };
}

// Saves the packet and the receipt in the attempt, and the three new drafts as temporary files.
function stageOutputs(state: State, { packet, discovery }: { packet: Packet; discovery: Fields }, review: string,
  update: DraftUpdate): Buffer {
  checkCurrent(state.drafts);
  sameFiles(attempt, state.attemptFiles);
  sameFiles(review, packet);
  if (!exists(join(attempt, 'llm'))) mkdirSync(join(attempt, 'llm'));
  for (const [name, bytes] of packet) writeFileSync(join(attempt, name), bytes, { flag: 'wx' });
  const receipt = encode({ formatVersion: 1, stage: Number(stage), attemptId: id, runRef: state.run.id,
    snapshotRef: state.run.snapshot.id, status: 'prepared-for-publication', preparedAt: new Date().toISOString(),
    command: { args: process.argv, cwd: process.cwd() },
    inputDigests: Object.fromEntries([...state.attemptFiles].map(([name, bytes]) => [name, hash(bytes)])),
    packetDigests: Object.fromEntries([...packet].map(([name, bytes]) => [name, hash(bytes)])),
    note: 'The updated run manifest is the publication marker. Proposed intent remains proposed.' });
  writeFileSync(join(attempt, receiptName), receipt, { flag: 'wx' });
  update.stage('baseline.yaml', packet.get('baseline.proposed.yaml') as Buffer);
  update.stage('discovery.yaml', packet.get('discovery.proposed.yaml') as Buffer);
  update.stage('run.yaml', expectedRun(state, receipt, discovery));
  return receipt;
}

// Checks every input again, then replaces the drafts one by one, run.yaml last.
function placeOutputs(state: State, packet: Packet, receipt: Buffer, update: DraftUpdate): void {
  for (const [ref, item] of state.artifacts) {
    if (item.path.startsWith('evidence/' + id + '/')) continue;
    assert(read(work, item.path).equals(item.bytes), 'Registered input changed before publication: ' + ref);
  }
  sameFiles(attempt, new Map([...state.attemptFiles, ...packet, [receiptName, receipt]]));
  state.verifySnapshot();
  checkCurrent(state.drafts);
  update.place();
}

function publish(state: State, packet: Packet, result: Candidate, review: string): Fields | undefined {
  assert(!exists(lock), 'Another publication owns the lock or cleanup is pending: ' + lock);
  mkdirSync(lock, { mode: 0o700 });
  const lockStat = lstatSync(lock);
  // A failed publication restores the replaced drafts and removes its temporary files.
  const update = draftUpdate({ work, prefix: '.publication-' + id + '-', before: state.drafts, read: name => read(work, name),
    advice: 'Keep this attempt unchanged; use a fresh attempt after resolving the cause.' });
  let committed = false;
  let failure: Error | undefined;
  let output: Fields | undefined;
  try {
    const receipt = stageOutputs(state, { packet, discovery: result.discovery }, review, update);
    placeOutputs(state, packet, receipt, update);
    committed = true;
    output = { status: 'stage' + stage + '-published', ...result.counts,
      writes: [...packetFiles, receiptName, ...replacedDrafts] };
  } catch (error) {
    failure = error as Error;
    if (!committed) failure = update.rollBack(error as Error);
  }
  try {
    const current = lstatSync(lock);
    assert(current.dev === lockStat.dev && current.ino === lockStat.ino, 'Lock changed.'); rmdirSync(lock);
  } catch (error) {
    if (failure) failure = new Error(failure.message + ' Lock cleanup pending: ' + lock);
    else output = { ...output, lockCleanup: 'pending', warning: 'Inspect ' + lock + ': ' + (error as Error).message };
  }
  if (failure) throw failure;
  return output;
}

try {
  if (action === 'verify') console.log(JSON.stringify(verify(), null, 2));
  else {
    const review = directory(reviewDirectory);
    assert(review !== work && !review.startsWith(work + '/') && !work.startsWith(review + '/'), 'Keep review output outside the saved run.');
    const state = verifiedInput();
    checkCurrent(state.drafts);
    assert(!state.attemptFiles.has(receiptName) && packetFiles.every(name => !state.attemptFiles.has(name)),
      'This attempt already has review output. Use verify after success or a fresh attempt after failure.');
    const packet = readPacket(review);
    const result = candidate(state, packet);
    console.log(JSON.stringify(action === 'check' ? { status: 'stage' + stage + '-review-verified', ...result.counts, writes: [] }
      : publish(state, packet, result, review), null, 2));
  }
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
