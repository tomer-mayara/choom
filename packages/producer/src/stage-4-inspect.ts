import {
  appendFileSync, closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync,
  readdirSync, realpathSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type * as TsMorph from 'ts-morph';
import type * as Yaml from 'yaml';
import { behaviorEntryRulesFile, behaviorEntryRulesPath, checkPinnedRuleList, readRuleList } from './behavior-entry-rules.ts';
import { savedSettings, settingsRef } from './compiler-settings.ts';
import { refuseChangedProducerCode } from './producer-code.ts';
import { assert, type Fields, hash } from './record-checks.ts';
import { syntaxParser } from './snapshot-project.ts';
import { directory, safePath } from './stage-3-inputs.ts';
import { behaviorEntryRecord, stageOneReviewRef } from './stage-4-behavior-entries.ts';
import type { Picomatch } from './stage-4-graph-profile.ts';
import { referencesRecord } from './stage-4-references.ts';
import { reviewPrompt } from './stage-4-review-prompt.ts';
import { type SourceFile, sourceSites } from './stage-4-source-sites.ts';

// The Stage 4 source collection helper. collect saves the source sites of the
// graph profile scope, the behavior entry candidates of the rule list that start saved,
// the first excerpts, the review prompt and the proposed artifact map; excerpt saves a requested range of an indexed file; references
// saves the references to a symbol of a source file of the graph scope. Each action
// first checks that the attempt is still the one that Stage 4 start, toolchain and
// run prepared, then saves a receipt and appends its outcome to the command log.
interface InventoryFile { path: string; kind: string; bytes: number; sha256: string }
// The checked attempt: the handoff, the run, its registered artifacts, the graph
// profile, the inventory, the snapshot folder, the checked reader of indexed
// snapshot files and the selected entry analysis.
interface InspectState {
  handoff: Fields; run: Fields; artifacts: Map<string, Buffer>; profile: Fields; files: Map<string, InventoryFile>;
  snapshotRoot: string; entry: Fields;
  source(path: string, maxBytes?: number): Buffer;
}
interface OperatorRecord {
  formatVersion: 1; attemptId: string; action: string; phase: string; startedAt: string;
  command: { args: string[]; cwd: string; environment: Record<string, string> };
  status: string; exitCode?: number; digests?: Record<string, string>; reason?: string; finishedAt?: string;
}

const excerptSourceBytes = 2 * 1024 * 1024;
function read(path: string): Buffer {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular file: ' + path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular file: ' + path);
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
function utf8(bytes: Buffer, label: string): string {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text).equals(bytes), 'Invalid UTF-8: ' + label);
  return text;
}
const { CHOOM_WORK, CHOOM_TOOLS } = process.env;
const id = process.env.CHOOM_STAGE4_ID ?? '';
const [action, ...args] = process.argv.slice(2);
assert(/^s4-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), 'Set CHOOM_STAGE4_ID to an s4-... ID.');
assert((action === 'collect' && args.length === 0) || (action === 'excerpt' && args.length === 3) ||
  (action === 'references' && args.length === 2), 'Use collect, excerpt PATH FIRST LAST, or references PATH SYMBOL.');
const work = directory(CHOOM_WORK);
const tools = directory(CHOOM_TOOLS);
const attempt = directory(join(directory(join(work, 'evidence')), id));
assert(!process.env.CHOOM_STAGE4 || process.env.CHOOM_STAGE4 === attempt, 'CHOOM_STAGE4 does not match the attempt.');
assert(fileURLToPath(import.meta.url) === join(tools, 'packages/producer/src/stage-4-inspect.ts'),
  'Use the Stage 4 inspection helper in the trusted checkout.');
assert(work !== tools && !tools.startsWith(work + '/'), 'Keep the trusted tool checkout out of the saved run.');
refuseChangedProducerCode(work, tools);
const artifactId = (name: string): string => id + '-file@' + encodeURIComponent(name);
const saved = (name: string): Buffer => { assert(safePath(name), 'Invalid saved path.'); return read(join(attempt, name)); };
const json = (name: string): Fields => JSON.parse(utf8(saved(name), name)) as Fields;
const save = (name: string, bytes: string | Buffer): void => writeFileSync(join(attempt, name), bytes, { flag: 'wx' });
const saveJson = (name: string, value: unknown): void => save(name, JSON.stringify(value, null, 2) + '\n');
const require = createRequire(join(tools, 'package.json'));
const yamlPath = require.resolve('yaml');
assert(yamlPath.startsWith(join(tools, 'node_modules/yaml') + '/'), 'Use YAML from the trusted checkout.');
read(yamlPath);
const yaml = require(yamlPath) as typeof Yaml;
const { parse } = yaml;
const parsed = (name: string): Fields => parse(utf8(saved(name), name)) as Fields;

// ts-morph and its own copy of TypeScript from the trusted checkout. The parser
// record names their versions and the digest of each tool file that ts-morph
// loaded. Collect saves it with the source sites, and every later action refuses
// the attempt when it changed.
function loadParser(): { tsMorph: typeof TsMorph; parser: Fields } {
  const modules = join(tools, 'node_modules') + '/';
  const before = new Set(Object.keys(require.cache));
  function load(name: string): unknown {
    const path = require.resolve(name);
    assert(path.startsWith(modules + 'ts-morph/'), 'Use ts-morph from the trusted checkout.');
    read(path);
    return require(path);
  }
  const tsMorph = load('ts-morph') as typeof TsMorph;
  const { version } = load('ts-morph/package.json') as { version: string };
  const loaded = Object.keys(require.cache).filter(path => path.startsWith(modules) && !before.has(path)).sort();
  return { tsMorph, parser: { name: syntaxParser, node: process.version, tsMorph: version,
    typescript: tsMorph.ts.version, modules: Object.fromEntries(loaded.map(path => [path.slice(modules.length), hash(read(path))])) } };
}
const { tsMorph, parser } = loadParser();

// The completed receipt of a phase: its started record, its outputs and its logs, with unchanged digests.
function receipt(phase: string, required: string[]): void {
  const value = json('operator-' + phase + '.json');
  const started = json('operator-' + phase + '.started.json');
  assert(value.formatVersion === 1 && value.attemptId === id && value.phase === phase && value.action === phase &&
    value.status === 'completed' && value.exitCode === 0 &&
    started.formatVersion === 1 && started.attemptId === id && started.phase === phase && started.action === phase &&
    started.status === 'started' && started.startedAt === value.startedAt &&
    isDeepStrictEqual(started.command, value.command), 'Invalid ' + phase + ' receipt.');
  const logs = ['.started.json', '.stdout.txt', '.stderr.txt'].map(suffix => 'operator-' + phase + suffix);
  assert(required.every(name => Object.hasOwn((value.digests ?? {}) as object, name)) &&
    logs.every(name => Object.hasOwn((value.logDigests ?? {}) as object, name)), 'Missing ' + phase + ' output digests.');
  assert(isDeepStrictEqual(Object.keys(value.logDigests as object).sort(), [...logs].sort()), 'Unexpected receipt log names.');
  for (const map of [value.digests, value.logDigests])
    for (const [name, digest] of Object.entries(map as Record<string, unknown>))
      assert(/^[a-f0-9]{64}$/.test(digest as string) && hash(saved(name)) === digest, 'Changed ' + phase + ' output: ' + name);
}

// The handoff of the completed start, with the unchanged drafts, saved documents and graph profile.
function startedHandoff(): Fields {
  // The documents and the rule list that Stage 4 start saved; the attempt holds no producer code.
  const frozen = ['step-4-cookbook.md', 'record-format.md', behaviorEntryRulesFile];
  receipt('start', ['handoff.json', 'graph-profile.json', 'graph-profile-notes.json', ...frozen,
    'run.before.yaml', 'discovery.before.yaml', 'baseline.before.yaml']);
  const handoff = json('handoff.json');
  assert(handoff.attemptId === id && handoff.work === work && handoff.tools === tools, 'Invalid Stage 4 handoff.');
  for (const name of ['run', 'discovery', 'baseline']) {
    const bytes = saved(name + '.before.yaml');
    assert(bytes.equals(read(join(work, name + '.yaml'))), 'Draft changed after preparation: ' + name);
    assert(hash(bytes) === (handoff.checkpointDigests as Fields)[name + '.before.yaml'], 'Checkpoint changed: ' + name);
  }
  for (const [name, digest] of Object.entries(handoff.toolInputDigests as Fields))
    assert(hash(saved(name)) === digest, 'Saved tool changed: ' + name);
  assert(hash(saved('graph-profile.json')) === handoff.graphProfileSha256, 'Graph profile changed.');
  checkPinnedRuleList(saved(behaviorEntryRulesFile), read(join(tools, behaviorEntryRulesPath)));
  return handoff;
}

// The registered artifacts of the run, checked by digest. This attempt is not registered yet.
function registeredArtifacts(run: Fields): Map<string, Buffer> {
  const artifacts = new Map<string, Buffer>();
  for (const [ref, record] of Object.entries(run.artifacts as Record<string, { path: string; sha256: string }>)) {
    assert(safePath(record.path) && !['run.yaml', 'discovery.yaml', 'baseline.yaml'].includes(record.path),
      'Invalid artifact path: ' + ref);
    assert(!record.path.startsWith('evidence/' + id + '/'), 'This attempt is registered. Keep it unchanged.');
    const bytes = read(join(work, record.path));
    assert(hash(bytes) === record.sha256, 'Registered evidence changed: ' + ref);
    artifacts.set(ref, bytes);
  }
  return artifacts;
}

// The indexed regular files of the saved inventory, by path.
function inventoryFiles(handoff: Fields, run: Fields, artifacts: Map<string, Buffer>): Map<string, InventoryFile> {
  const snapshot = run.snapshot as Fields;
  assert(snapshot.id === handoff.snapshotRef && snapshot.inventoryRef === handoff.inventoryRef, 'Snapshot identity changed.');
  const inventory = JSON.parse(String(artifacts.get(handoff.inventoryRef as string))) as Fields;
  assert(inventory.formatVersion === 1 && inventory.snapshotId === handoff.snapshotRef && Array.isArray(inventory.files),
    'Inventory snapshot mismatch.');
  const files = new Map((inventory.files as InventoryFile[]).map(file => [file.path, file]));
  assert(files.size === (inventory.files as unknown[]).length, 'Duplicate inventory paths.');
  return files;
}

// The saved graph profile, after the checks that the graph run completed for its
// contexts and that its source scope is the saved Stage 3 scope.
function checkedProfile(handoff: Fields, discovery: Fields, artifacts: Map<string, Buffer>): Fields {
  const profile = json('graph-profile.json');
  const graph = json('graph-results.json');
  receipt('run', ['graph-results.json', 'graph-run.json']);
  const loadingRef = (discovery.entryAnalysisRef as string).replace(/-entry-analysis$/, '-file@loading-search.json');
  const loading = JSON.parse(String(artifacts.get(loadingRef))) as Fields;
  const scope = (value: SourceFile[]): SourceFile[] => value.map(({ path, sha256 }) => ({ path, sha256 })).sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const sourceFiles = profile.sourceFiles as SourceFile[];
  assert(profile.formatVersion === 1 && profile.snapshotRef === handoff.snapshotRef && profile.attemptId === id &&
    Array.isArray(sourceFiles) && new Set(sourceFiles.map(file => file.path)).size === sourceFiles.length &&
    loading.snapshotRef === handoff.snapshotRef && loading.status === 'completed' &&
    isDeepStrictEqual(scope(sourceFiles), scope(loading.scope as SourceFile[])), 'Graph profile changed the saved source scope.');
  const contexts = graph.contexts as Fields[];
  const profileContexts = profile.contexts as Fields[];
  assert(graph.snapshotRef === handoff.snapshotRef && graph.profileRef === artifactId('graph-profile.json') &&
    graph.status === 'completed' && contexts.length === profileContexts.length &&
    contexts.every((context, index) => context.status === 'completed' && context.id === profileContexts[index]?.id),
  'Expected completed graph contexts with documented coverage limits.');
  const graphRun = json('graph-run.json');
  assert(graphRun.attemptId === id && graphRun.snapshotRef === handoff.snapshotRef && graphRun.status === 'completed' &&
    graphRun.profileRef === artifactId('graph-profile.json') && graphRun.profileSha256 === hash(saved('graph-profile.json')) &&
    graphRun.graphRef === artifactId('graph-results.json') && graphRun.graphSha256 === hash(saved('graph-results.json')),
  'Graph run identity or digests changed.');
  return profile;
}

// Streams an indexed file that is too large for an excerpt to check its digest,
// then refuses it with the code that collect records as a skip reason.
function refuseLargeSource(absolute: string, file: InventoryFile): never {
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular saved source: ' + file.path);
    const digest = createHash('sha256'); const chunk = Buffer.alloc(64 * 1024); let size = 0; let count: number;
    while ((count = readSync(fd, chunk, 0, chunk.length, null)) > 0) { digest.update(chunk.subarray(0, count)); size += count; }
    assert(size === file.bytes && digest.digest('hex') === file.sha256, 'Snapshot source changed: ' + file.path);
  } finally { closeSync(fd); }
  throw Object.assign(new Error('Excerpt source exceeds 2 MiB: ' + file.path), { code: 'EXCERPT_SOURCE_TOO_LARGE' });
}

// The checked reader of indexed regular files in the saved snapshot.
function snapshotReader(snapshot: string, files: Map<string, InventoryFile>): InspectState['source'] {
  return (path, maxBytes = Infinity) => {
    assert(safePath(path) && files.get(path)?.kind === 'file', 'Path is not an indexed regular file: ' + path);
    const file = files.get(path) as InventoryFile; const absolute = join(snapshot, path);
    const stat = lstatSync(absolute);
    assert(stat.isFile() && stat.size === file.bytes && realpathSync(absolute) === absolute, 'Snapshot source changed: ' + path);
    if (file.bytes > maxBytes) refuseLargeSource(absolute, file);
    const bytes = read(absolute);
    assert(bytes.length === file.bytes && hash(bytes) === file.sha256, 'Snapshot source changed: ' + path);
    return bytes;
  };
}

// The attempt as start, toolchain and run left it, checked again before and after
// each action. Once collect saved the source sites, the trusted parser must be the same.
function state(): InspectState {
  const handoff = startedHandoff();
  const run = parsed('run.before.yaml');
  const discovery = parsed('discovery.before.yaml');
  const progress = run.progress as Fields | undefined;
  assert(progress?.inspectionPriorities === 'complete' && progress.baselineRecovery === 'pending' &&
    run.status === 'in-progress' && (run.snapshot as Fields | undefined)?.root === 'snapshot' && run.id === handoff.runRef &&
    discovery.kind === 'architecture-discovery' && discovery.runRef === run.id &&
    discovery.entryAnalysisRef === handoff.entryAnalysisRef, 'Expected a finalized Stage 3 handoff.');
  const artifacts = registeredArtifacts(run);
  const files = inventoryFiles(handoff, run, artifacts);
  const profile = checkedProfile(handoff, discovery, artifacts);
  for (const record of profile.sourceFiles as SourceFile[])
    assert(files.get(record.path)?.kind === 'file' && files.get(record.path)?.sha256 === record.sha256,
      'Source scope does not match the inventory: ' + record.path);
  const snapshot = directory(join(work, (run.snapshot as Fields).root as string));
  read(join(attempt, 'commands.md'));
  assert(lstatSync(join(attempt, 'commands.md')).nlink === 1, 'Command log must not share a hard link.');
  const source = snapshotReader(snapshot, files);
  const entry = parse(utf8(artifacts.get(discovery.entryAnalysisRef as string) as Buffer, 'selected entry analysis')) as Fields;
  if (lstatSync(join(attempt, 'source-sites.json'), { throwIfNoEntry: false }))
    assert(isDeepStrictEqual(json('source-sites.json').parser, parser), 'Trusted parser changed since collect.');
  return { handoff, run, artifacts, profile, files, snapshotRoot: snapshot, source, entry };
}

function excerpt(current: InspectState, path: string, first: number, last: number, sourceId: string): Fields {
  assert(Number.isSafeInteger(first) && Number.isSafeInteger(last) && first >= 1 && last >= first &&
    last - first < 300, 'Use a range of 1 to 300 lines.');
  const text = utf8(current.source(path, excerptSourceBytes), path);
  const lines = text ? text.split(/\r\n|\r|\n/) : [];
  if (/[\r\n]$/.test(text)) lines.pop();
  assert(first <= lines.length, 'First line is outside the file: ' + path);
  const end = Math.min(last, lines.length);
  const numbered = lines.slice(first - 1, end).map((line, index) => (first + index) + ': ' + line).join('\n');
  assert(Buffer.byteLength(numbered) <= 100 * 1024, 'Excerpt exceeds 100 KiB; request a smaller range.');
  return { id: sourceId, snapshotRef: current.handoff.snapshotRef, path, sha256: current.files.get(path)?.sha256,
    lines: [first, end], totalLines: lines.length, truncated: first !== 1 || end !== lines.length, excerpt: numbered };
}

// The paths of the first excerpts: inspection priorities, root README files, entry
// candidates and component declarations. The first 40 paths are excerpted.
function initialExcerpts(current: InspectState): Fields {
  const entryCandidates = current.entry.candidates as Fields[];
  const candidates = new Map(entryCandidates.map(item => [item.id, item.path as string]));
  const prioritized = (current.entry.inspectionPriorities as Fields[]).flatMap(item => (item.subjectRefs as string[]).flatMap(ref =>
    current.files.has(ref) ? [ref] : candidates.get(ref) ? [candidates.get(ref) as string] : []));
  const initial = [...prioritized, ...[...current.files.keys()].filter(path => /^readme(?:\.[^/]*)?$/i.test(path)),
    ...entryCandidates.map(item => item.path).filter(path => typeof path === 'string')];
  const declarations = [...current.files.keys()].filter(path => path === 'component.yaml' || path.endsWith('/component.yaml')).sort();
  const paths = [...new Set([...initial, ...declarations])];
  const excerpts: Fields[] = []; const skipped: Fields[] = [];
  for (const [index, path] of paths.entries()) {
    if (index >= 40) { skipped.push({ path, reason: 'Initial excerpt limit of 40 paths.' }); continue; }
    if (current.files.get(path)?.kind !== 'file') { skipped.push({ path, reason: 'Not an indexed regular file.' }); continue; }
    try {
      const bytes = current.source(path, excerptSourceBytes);
      if (!bytes.length) { skipped.push({ path, reason: 'Empty file.' }); continue; }
      excerpts.push(excerpt(current, path, 1, 200, id + '-source-' + encodeURIComponent(path)));
    }
    catch (error) {
      const failure = error as NodeJS.ErrnoException;
      if (failure.code === 'EXCERPT_SOURCE_TOO_LARGE' || failure.message.startsWith('Excerpt exceeds') ||
        failure.message.startsWith('Invalid UTF-8'))
        skipped.push({ path, reason: failure.message });
      else throw error;
    }
  }
  return { formatVersion: 1, snapshotRef: current.handoff.snapshotRef, excerpts, skipped,
    limits: ['Initial excerpts end at line 200 and 100 KiB from UTF-8 files of at most 2 MiB; truncation and skipped paths are explicit.',
      'Only source spans actually read by the LLM can become reviewedFiles.'] };
}

// The proposed IDs and digests of the attempt files, except the command log and the map itself.
function artifactMap(): Record<string, { path: string; sha256: string }> {
  const artifacts: Record<string, { path: string; sha256: string }> = {};
  function index(folder = ''): void {
    for (const name of readdirSync(join(attempt, folder)).sort()) {
      const path = folder ? folder + '/' + name : name;
      const stat = lstatSync(join(attempt, path));
      if (stat.isDirectory()) { directory(join(attempt, path)); index(path); }
      else if (!['commands.md', 'artifact-map.json'].includes(path))
        artifacts[artifactId(path)] = { path: 'evidence/' + id + '/' + path, sha256: hash(saved(path)) };
    }
  }
  index();
  return artifacts;
}

// picomatch from the trusted checkout, for the globs of the rules and of the Stage 1 role records.
function loadPicomatch(): { picomatch: Picomatch; version: string } {
  const path = require.resolve('picomatch');
  assert(path.startsWith(join(tools, 'node_modules/picomatch') + '/'), 'Use picomatch from the trusted checkout.');
  read(path);
  return { picomatch: require(path) as Picomatch, version: (require('picomatch/package.json') as { version: string }).version };
}

// The behavior entry candidates of the rule list that Stage 4 start saved.
function behaviorEntries(current: InspectState): Fields {
  const review = current.artifacts.get(stageOneReviewRef);
  assert(review, 'The run has no registered Stage 1 review ' + stageOneReviewRef + '.');
  const rules = saved(behaviorEntryRulesFile);
  const { picomatch, version } = loadPicomatch();
  return behaviorEntryRecord({ attemptId: id, snapshotRef: current.handoff.snapshotRef,
    snapshot: { files: [...current.files.values()], snapshotRoot: current.snapshotRoot },
    profile: current.profile, profileRef: artifactId('graph-profile.json'),
    settings: savedSettings(current.artifacts.get(settingsRef), current.handoff.snapshotRef),
    rules: readRuleList(rules, yaml), rulesRef: artifactId(behaviorEntryRulesFile), rulesSha256: hash(rules),
    review: parse(utf8(review, stageOneReviewRef)) as Fields, reviewRef: stageOneReviewRef, tsMorph, parser, picomatch,
    picomatchVersion: version });
}

function collect(current: InspectState): string[] {
  // The checked read of each source file keeps the messages of a changed file and a file that
  // is not UTF-8 text. The snapshot project then reads the same checked bytes.
  saveJson('source-sites.json', sourceSites({ tsMorph, parser, attemptId: id, snapshotRef: current.handoff.snapshotRef,
    sourceFiles: current.profile.sourceFiles as SourceFile[],
    snapshot: { files: [...current.files.values()], snapshotRoot: current.snapshotRoot },
    check: path => { utf8(current.source(path), path); } }));
  saveJson('behavior-entry-candidates.json', behaviorEntries(current));
  saveJson('source-excerpts.json', initialExcerpts(current));
  save('review-prompt.md', reviewPrompt({ runRef: current.handoff.runRef, snapshotRef: current.handoff.snapshotRef,
    entryAnalysisRef: current.handoff.entryAnalysisRef, attemptId: id, work, attempt }));
  saveJson('artifact-map.json', { formatVersion: 1, attemptId: id, snapshotRef: current.handoff.snapshotRef,
    status: 'proposed', artifacts: artifactMap(),
    limits: ['This map is not registered yet. It omits itself, the mutable command log, and later files.'] });
  return ['source-sites.json', 'behavior-entry-candidates.json', 'source-excerpts.json', 'review-prompt.md', 'artifact-map.json'];
}

// The source sites that a completed collect saved, unchanged since then.
function collectedSites(): Fields {
  assert(lstatSync(join(attempt, 'operator-collect.json'), { throwIfNoEntry: false }), 'Run collect before ' + action + '.');
  const value = json('operator-collect.json');
  const started = json('operator-collect.started.json');
  assert(value.attemptId === id && value.phase === 'collect' && value.status === 'completed' && value.exitCode === 0 &&
    started.startedAt === value.startedAt && isDeepStrictEqual(started.command, value.command), 'Run collect before ' + action + '.');
  assert(hash(saved('source-sites.json')) === (value.digests as Fields | undefined)?.['source-sites.json'],
    'Changed collect output: source-sites.json');
  return json('source-sites.json');
}

// Saves the references to a symbol of a source file of the graph scope.
function references(current: InspectState, name: string): string[] {
  const sites = collectedSites();
  const [path = '', symbol = ''] = args;
  saveJson(name, referencesRecord({ attemptId: id, snapshotRef: current.handoff.snapshotRef, path, symbol,
    snapshot: { files: [...current.files.values()], snapshotRoot: current.snapshotRoot },
    profile: current.profile, profileRef: artifactId('graph-profile.json'), sites, sitesRef: artifactId('source-sites.json'),
    settings: savedSettings(current.artifacts.get(settingsRef), current.handoff.snapshotRef), tsMorph, parser }));
  return [name];
}

// The phase of the action. Each excerpt and references request takes the next number of its action.
function phase(): string {
  if (action === 'collect') return 'collect';
  for (let number = 1; number < 10000; number++) {
    const name = action + '-' + String(number).padStart(3, '0');
    if (!lstatSync(join(attempt, 'operator-' + name + '.started.json'), { throwIfNoEntry: false })) return name;
  }
  throw new Error('Too many saved ' + action + ' requests.');
}

// Runs the action and returns the names of its outputs.
function runAction(phaseName: string): string[] {
  const current = state();
  if (action === 'collect') return collect(current);
  if (action === 'references') return references(current, phaseName + '.json');
  const [path = '', first = '', last = ''] = args;
  assert(/^\d+$/.test(first) && /^\d+$/.test(last), 'Line numbers must be positive integers.');
  const name = phaseName + '.json';
  saveJson(name, excerpt(current, path, Number(first), Number(last), id + '-source-' + phaseName));
  return [name];
}

function appendCommandLog(phaseName: string, record: OperatorRecord): void {
  const log = join(attempt, 'commands.md');
  read(log);
  const fd = openSync(log, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    assert(stat.isFile() && stat.nlink === 1, 'Command log must be a separate regular file.');
    appendFileSync(fd, '\n## ' + phaseName + '\n\n```json\n' + JSON.stringify(record, null, 2) + '\n```\n');
  } finally { closeSync(fd); }
}

// Refuse a stale or registered attempt before creating any receipt there.
state();
const phaseName = phase();
const record: OperatorRecord = { formatVersion: 1, attemptId: id, action: action as string, phase: phaseName,
  startedAt: new Date().toISOString(),
  command: { args: process.argv, cwd: process.cwd(), environment: { CHOOM_WORK: work, CHOOM_TOOLS: tools, CHOOM_STAGE4_ID: id } },
  status: 'started' };
saveJson('operator-' + phaseName + '.started.json', record);
try {
  const outputs = runAction(phaseName);
  state();
  record.status = 'completed'; record.exitCode = 0;
  record.digests = Object.fromEntries(outputs.map(name => [name, hash(saved(name))]));
  console.log(action === 'collect' ? 'Saved source sites, behavior entry candidates, bounded excerpts, and the Stage 4 review prompt.'
    : 'Saved ' + outputs[0] + '.');
} catch (error) {
  record.status = 'failed'; record.exitCode = 1; record.reason = (error as Error).message;
  process.exitCode = 1; console.error((error as Error).message);
} finally {
  record.finishedAt = new Date().toISOString();
  saveJson('operator-' + phaseName + '.json', record);
  appendCommandLog(phaseName, record);
}
