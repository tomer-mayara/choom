import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { draftUpdate } from './draft-update.ts';
import { refuseChangedProducerCode } from './producer-code.ts';
import { assert, type Fields, hash, object, savedDocument, text } from './record-checks.ts';
import { RunSummary } from './run-summary.ts';
import { SavedAttemptFiles } from './saved-attempt-files.ts';
import { StageThreeGaps } from './stage-3-gaps.ts';
import { checkReview, utf8 } from './stage-3-review.ts';

// The Stage 3 finalizer. It checks the saved attempt, its receipts, the earlier
// stage records and the LLM review packet, and only then publishes the discovery
// and run drafts as one update, run.yaml last. With verify, it checks that the
// drafts are still the state that this attempt published.
interface Yaml { parse(text: string): unknown; stringify(value: unknown): string }
interface Entry { path: string; sha256: string }
interface Settings { id: string; work: string; tools: string; attempt: string; verifyOnly: boolean; yaml: Yaml; analysisRef: string }
type Drafts = Record<string, Buffer>;
interface Checkpoints { before: Drafts; current: Drafts; checkDrafts(): void }
interface Records { run: Fields; discovery: Fields }
// The registered artifacts and the attempt files, read once and checked by digest.
interface SavedAttempt {
  artifacts: Record<string, Entry>;
  buffers: Map<string, Buffer>;
  names: string[];
  attemptRef(name: string): string;
  verify(artifactId: string, entry: unknown): Buffer;
  document(ref: string): unknown;
  registered(ref: unknown): unknown;
  saved(name: string): unknown;
  attemptDigests(fileNames: string[]): Record<string, string>;
  receipt(phase: string, action: string, outputs: string[]): void;
  // Checks the receipt of each failed request, then refuses each attempt file that no
  // checked receipt names and that is not the command log. Call it after the other receipt checks.
  refuseUnsaved(): void;
}
interface Inputs {
  snapshotRef: string;
  inventoryRef: unknown;
  inventory: Fields;
  paths: Map<unknown, Fields>;
  snapshot: string;
  previousRef: string;
  previous: Fields;
}
interface Finalization extends Records {
  config: Settings;
  drafts: Checkpoints;
  attempt: SavedAttempt;
  inputs: Inputs;
  loading: Fields;
  analysis: Fields;
  currentExcerpts: Fields[];
  checkedSourceBytes(record: Fields, label: string): Buffer;
}

const draftNames = ['run', 'discovery', 'baseline'];
// The documents that Stage 3 start saved; the attempt holds no producer code.
const toolFiles = ['step-3-cookbook.md'];
const checkpoints = draftNames.map(name => name + '.before.yaml');
const collectFiles = ['loading-search.json', 'symbol-mentions.json', 'source-excerpts.json', StageThreeGaps.collectFile,
  'review-prompt.md', 'artifact-map.json'];
const reviewFiles = ['entry-analysis.yaml', 'llm/analysis-prompt.md', 'llm/analysis-response.md',
  'llm/analysis-call.yaml', 'llm/review-scope.json'];

function savedPath(root: string, name: unknown): string {
  assert(text(name) && !isAbsolute(name) && !/[\\\0\r\n]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid saved path: ' + name);
  return join(root, name);
}

function file(root: string, name: unknown): Buffer {
  const path = savedPath(root, name);
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + name);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular saved file: ' + name);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

function directory(path: string): string {
  assert(lstatSync(path).isDirectory() && realpathSync(path) === path, 'Expected a real directory: ' + path);
  return path;
}

function* attemptFiles(attempt: string, folder = ''): Generator<string> {
  const names = readdirSync(join(attempt, folder), { encoding: 'buffer' })
    .map(bytes => utf8(bytes, 'attempt filename')).sort();
  for (const name of names) {
    const path = folder ? folder + '/' + name : name;
    const stat = lstatSync(savedPath(attempt, path));
    if (stat.isDirectory()) yield* attemptFiles(attempt, path);
    else {
      assert(stat.isFile(), 'Expected a regular attempt file: ' + path);
      yield path;
    }
  }
}

function settings(): Settings {
  const [action, ...args] = process.argv.slice(2);
  const verifyOnly = action === 'verify';
  assert((action === undefined || verifyOnly) && args.length === 0,
    'Run the Stage 3 finalizer without arguments to publish, or with verify to check completed Stage 3.');
  const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE3_ID: id = '' } = process.env;
  assert([CHOOM_WORK, CHOOM_TOOLS].every(value => text(value) && isAbsolute(value)),
    'Set CHOOM_WORK and CHOOM_TOOLS to absolute paths.');
  assert(/^s3-[a-z0-9-]+$/.test(id), 'Set CHOOM_STAGE3_ID to an s3-... ID.');
  const work = directory(CHOOM_WORK as string);
  const tools = directory(CHOOM_TOOLS as string);
  assert(work !== tools && !tools.startsWith(work + '/'), 'Use a trusted tool checkout outside CHOOM_WORK.');
  const attempt = directory(join(directory(join(work, 'evidence')), id));
  assert(!process.env.CHOOM_STAGE3 || process.env.CHOOM_STAGE3 === attempt, 'CHOOM_STAGE3 does not match the attempt.');
  assert(fileURLToPath(import.meta.url) === join(tools, 'packages/producer/src/stage-3-finish.ts'),
    'Use the Stage 3 finalizer in the trusted checkout.');
  refuseChangedProducerCode(work, tools);
  const require = createRequire(join(tools, 'package.json'));
  const yamlPath = require.resolve('yaml');
  assert(yamlPath.startsWith(join(tools, 'node_modules/yaml') + '/') && realpathSync(yamlPath) === yamlPath,
    'Install YAML in the trusted tool checkout.');
  return { id, work, tools, attempt, verifyOnly, yaml: require(yamlPath) as Yaml, analysisRef: id + '-entry-analysis' };
}

// The drafts that the attempt checkpointed, and with verify the current drafts.
function draftCheckpoints({ work, attempt, verifyOnly, yaml, analysisRef }: Settings): Checkpoints {
  const before = Object.fromEntries(draftNames.map(name => [name, file(attempt, name + '.before.yaml')]));
  const current = verifyOnly
    ? Object.fromEntries(draftNames.map(name => [name, file(work, name + '.yaml')])) : before;
  const checkDrafts = (): void => {
    for (const name of draftNames) {
      assert((current[name] as Buffer).equals(file(work, name + '.yaml')),
        name + '.yaml changed ' + (verifyOnly ? 'during verification.' : 'after checkpointing.'));
      assert((before[name] as Buffer).equals(file(attempt, name + '.before.yaml')), name + '.before.yaml changed.');
    }
  };
  checkDrafts();
  if (verifyOnly) {
    const publishedRun = yaml.parse(utf8(current.run as Buffer, 'run.yaml')) as Fields | null | undefined;
    const publishedDiscovery = yaml.parse(utf8(current.discovery as Buffer, 'discovery.yaml')) as Fields | null | undefined;
    const progress = publishedRun?.progress as Fields | null | undefined;
    assert(publishedRun?.status === 'in-progress' && progress?.inspectionPriorities === 'complete' &&
      progress.baselineRecovery === 'pending' && publishedDiscovery?.entryAnalysisRef === analysisRef,
    'Verify only this attempt as the latest published Stage 3 state, before later stages change the drafts.');
  }
  return { before, current, checkDrafts };
}

function checkpointRecords({ yaml }: Settings, { before }: Checkpoints): Records {
  const [run, discovery, baseline] = draftNames
    .map(name => yaml.parse(utf8(before[name] as Buffer, name + '.before.yaml')) as Fields | null | undefined);
  const progress = run?.progress as Fields | null | undefined;
  const snapshot = run?.snapshot as Fields | null | undefined;
  assert(run?.formatVersion === 1 && run.mode === 'A' && text(run.id) && run.status === 'in-progress' && object(run.artifacts) &&
    progress?.inventory === 'complete' && progress.entryAnalysis === 'complete' &&
    progress.baselineRecovery === 'pending' && progress.inspectionPriorities !== 'complete' &&
    snapshot?.root === 'snapshot' && text(snapshot.id), 'Expected an in-progress Stage 2 run.');
  assert(discovery?.formatVersion === 1 && discovery.kind === 'architecture-discovery' &&
    discovery.runRef === run.id && Object.hasOwn(run.artifacts, discovery.entryAnalysisRef as PropertyKey),
  'Invalid discovery checkpoint.');
  for (const key of ['baselineRef', 'overview', 'inspectedPaths', 'codeMappingRef', 'dependenciesRef', 'resourceAccessRef'])
    assert(!Object.hasOwn(discovery, key), 'Discovery advanced beyond Stage 3: ' + key);
  assert(baseline?.formatVersion === 1 && baseline.parentId === null && text(baseline.id) &&
    ['components', 'interfaces', 'resources', 'rules'].every(key => {
      const records = baseline[key];
      return Array.isArray(records) && !records.length;
    }), 'The baseline must still be empty.');
  return { run, discovery };
}

// Registers each attempt file under its new artifact ID next to the registered artifacts.
function savedAttempt({ id, work, attempt, analysisRef, yaml }: Settings, run: Fields): SavedAttempt {
  const artifacts: Record<string, Entry> = { ...(run.artifacts as Record<string, Entry>) };
  const buffers = new Map<string, Buffer>();
  const attemptRef = (name: string): string => id + '-file@' + encodeURIComponent(name);
  function verify(artifactId: string, entry: unknown): Buffer {
    const record = entry as Fields | null | undefined;
    assert(object(record) && /^[a-f0-9]{64}$/i.test(String(record.sha256 ?? '')), 'Invalid artifact: ' + artifactId);
    assert(!draftNames.some(name => record.path === name + '.yaml'), 'Mutable draft registered as evidence: ' + record.path);
    const bytes = file(work, record.path);
    assert(hash(bytes) === (record.sha256 as string).toLowerCase(), 'Artifact digest mismatch: ' + artifactId);
    return bytes;
  }
  for (const [artifactId, entry] of Object.entries(artifacts)) buffers.set(artifactId, verify(artifactId, entry));
  const names = [...attemptFiles(attempt)];
  const registeredPaths = new Set(Object.values(artifacts).map(entry => entry.path));
  for (const name of names) {
    const artifactId = name === 'entry-analysis.yaml' ? analysisRef : attemptRef(name);
    const path = relative(work, join(attempt, name));
    assert(!Object.hasOwn(artifacts, artifactId) && !registeredPaths.has(path), 'Artifact collision: ' + artifactId);
    const bytes = file(attempt, name);
    artifacts[artifactId] = { path, sha256: hash(bytes) };
    buffers.set(artifactId, bytes);
  }
  const documents = new Map<string, unknown>();
  function document(ref: string): unknown {
    assert(buffers.has(ref), 'Unknown artifact: ' + ref);
    if (!documents.has(ref))
      documents.set(ref, savedDocument((artifacts[ref] as Entry).path, utf8(buffers.get(ref) as Buffer, ref), yaml.parse));
    return documents.get(ref);
  }
  function registered(ref: unknown): unknown {
    assert(text(ref) && Object.hasOwn(run.artifacts as Fields, ref), 'Expected a previously registered artifact: ' + ref);
    return document(ref);
  }
  const saved = (name: string): unknown => document(attemptRef(name));
  const attemptDigests = (fileNames: string[]): Record<string, string> => Object.fromEntries(fileNames.map(name => {
    const ref = name === 'entry-analysis.yaml' ? analysisRef : attemptRef(name);
    assert(buffers.has(ref), 'Missing saved attempt file: ' + name);
    return [name, hash(buffers.get(ref) as Buffer)];
  }));
  return { artifacts, buffers, names, attemptRef, verify, document, registered, saved, attemptDigests,
    ...receiptChecks(id, names, saved, attemptDigests) };
}

// The receipt checks of the attempt. Each checked receipt adds itself and the files
// that it names to the saved files. finish registers every attempt file, so
// refuseUnsaved refuses every other file.
function receiptChecks(id: string, names: string[], saved: (name: string) => unknown,
  attemptDigests: (fileNames: string[]) => Record<string, string>): Pick<SavedAttempt, 'receipt' | 'refuseUnsaved'> {
  const savedFiles = new SavedAttemptFiles().add(['commands.md']);
  // The receipt has the outcome, and names exactly the outputs and the three logs, with their digests.
  function checkedReceipt(phase: string, action: string, outputs: string[], outcome: { status: string; exitCode: number }): void {
    const prefix = 'operator-' + phase;
    const value = saved(prefix + '.json') as Fields | null | undefined;
    const logs = ['.started.json', '.stdout.txt', '.stderr.txt'].map(suffix => prefix + suffix);
    assert(value?.formatVersion === 1 && value.attemptId === id && value.phase === phase && value.action === action &&
      value.status === outcome.status && value.exitCode === outcome.exitCode &&
      isDeepStrictEqual(value.digests, attemptDigests(outputs)) && isDeepStrictEqual(value.logDigests, attemptDigests(logs)),
    'The ' + phase + ' receipt is incomplete, failed, or changed. Use a new attempt.');
    savedFiles.addReceipt(prefix + '.json', [...outputs, ...logs]);
  }
  return {
    receipt: (phase, action, outputs) => checkedReceipt(phase, action, outputs, { status: 'completed', exitCode: 0 }),
    // A numbered request that failed saved no record. The cookbook says to keep its
    // receipt and to request again in the same attempt.
    refuseUnsaved() {
      for (const name of names) {
        const [, phase, action] = /^operator-((excerpt|text-search|exports)-[0-9]+)\.json$/.exec(name) ?? [];
        if (!phase || !action || names.includes(phase + '.json')) continue;
        const digests = (saved(name) as Fields | null | undefined)?.digests;
        checkedReceipt(phase, action, object(digests) ? Object.keys(digests) : [], { status: 'failed', exitCode: 1 });
      }
      savedFiles.refuseOthers(names);
    },
  };
}

// The inventory, the selected entry analysis, the handoff and the proposed artifact map.
function selectedInputs({ id, work, tools }: Settings, { run, discovery }: Records, attempt: SavedAttempt): Inputs {
  const runSnapshot = run.snapshot as Fields;
  const snapshotRef = runSnapshot.id as string;
  const inventoryRef = runSnapshot.inventoryRef;
  const inventory = attempt.registered(inventoryRef) as Fields | null | undefined;
  assert(inventory?.formatVersion === 1 && inventory.snapshotId === snapshotRef && Array.isArray(inventory.files),
    'Inventory snapshot mismatch.');
  const files = inventory.files as Fields[];
  const paths = new Map<unknown, Fields>(files.map(record => [record.path, record]));
  assert(paths.size === files.length, 'Duplicate inventory paths.');
  const snapshot = directory(join(work, runSnapshot.root as string));
  const previousRef = discovery.entryAnalysisRef as string;
  const previous = attempt.registered(previousRef) as Fields | null | undefined;
  assert(previous?.formatVersion === 1 && previous.kind === 'entry-analysis' && previous.snapshotRef === snapshotRef &&
    Array.isArray(previous.candidates) && Array.isArray(previous.reviewedFiles), 'Invalid preceding entry analysis.');
  const handoff = attempt.saved('handoff.json') as Fields | null | undefined;
  const { dev, ino } = lstatSync(snapshot);
  const handoffFacts = { formatVersion: 1, attemptId: id, work, tools, runRef: run.id, snapshotRef, inventoryRef,
    snapshot: { path: snapshot, dev, ino }, entryAnalysisRef: previousRef,
    planRef: previous.planRef, knipRunsRef: previous.knipRunsRef, registeredArtifacts: Object.keys(run.artifacts as Fields).length,
    indexedRegularFiles: files.filter(item => item.kind === 'file').length,
    checkpointDigests: attempt.attemptDigests(checkpoints), toolInputDigests: attempt.attemptDigests(toolFiles) };
  assert(Object.entries(handoffFacts).every(([key, value]) => isDeepStrictEqual(handoff?.[key], value)),
    'Stage 3 handoff does not match the saved inputs.');
  const artifactMap = attempt.saved('artifact-map.json') as Fields | null | undefined;
  assert(artifactMap?.formatVersion === 1 && artifactMap.attemptId === id && artifactMap.snapshotRef === snapshotRef &&
    artifactMap.status === 'proposed' && object(artifactMap.artifacts) &&
    Object.entries(artifactMap.artifacts).every(([ref, entry]) => Object.hasOwn(attempt.artifacts, ref) &&
      isDeepStrictEqual(attempt.artifacts[ref], entry)),
  'The proposed artifact map does not match the saved files.');
  return { snapshotRef, inventoryRef, inventory, paths, snapshot, previousRef, previous };
}

// The loading search and the symbol mentions name the indexed files that they read.
function checkQueries(attempt: SavedAttempt, { snapshotRef, paths, previous }: Inputs): Fields {
  const loading = attempt.saved('loading-search.json') as Fields | null | undefined;
  const mentions = attempt.saved('symbol-mentions.json') as Fields | null | undefined;
  assert(loading?.formatVersion === 1 && loading.snapshotRef === snapshotRef && loading.status === 'completed' &&
    Array.isArray(loading.scope) && (loading.scope as Fields[]).every(item => paths.get(item?.path)?.kind === 'file' &&
      (paths.get(item.path) as Fields).sha256 === item.sha256) &&
    mentions?.formatVersion === 1 && mentions.snapshotRef === snapshotRef && mentions.knipRunsRef === previous.knipRunsRef &&
    ['completed', 'partial', 'unavailable', 'skipped'].includes(mentions.status as string) &&
    isDeepStrictEqual(mentions.scope, loading.scope),
  'Invalid Stage 3 query scope or outcome.');
  return loading;
}

// The Knip plan, receipts, profile and preflight that the selected entry analysis used.
function checkKnipInputs(attempt: SavedAttempt, { snapshotRef, inventoryRef, previous }: Inputs): Set<unknown> {
  const plan = attempt.registered(previous.planRef) as Fields | null | undefined;
  const receipts = attempt.registered(previous.knipRunsRef) as Fields | null | undefined;
  assert(plan?.formatVersion === 1 && plan.snapshotRef === snapshotRef && Array.isArray(plan.workspaces) &&
    (plan.workspaces as Fields[]).every(workspace => text(workspace?.dir)) &&
    receipts?.formatVersion === 1 && receipts.snapshotRef === snapshotRef && Array.isArray(receipts.runs) &&
    receipts.runs.length === 2, 'Invalid preceding Knip inputs or receipts.');
  const planWorkspaces = plan.workspaces as Fields[];
  const workspaces = new Set(planWorkspaces.map(workspace => workspace.dir));
  assert(workspaces.has('.') && workspaces.size === planWorkspaces.length, 'Invalid saved Knip workspaces.');
  attempt.registered(receipts.profileRef);
  const preflight = attempt.registered(receipts.preflightRef) as Fields | null | undefined;
  const digest = (ref: unknown): string => hash(attempt.buffers.get(ref as string) as Buffer);
  const inputDigests = {
    planSha256: digest(previous.planRef), profileSha256: digest(receipts.profileRef),
    preflightSha256: digest(receipts.preflightRef), inventorySha256: digest(inventoryRef),
  };
  const inventory = preflight?.inventory as Fields | null | undefined;
  assert(preflight?.formatVersion === 1 && preflight.snapshotRef === snapshotRef &&
    preflight.planSha256 === inputDigests.planSha256 && preflight.profileSha256 === inputDigests.profileSha256 &&
    inventory?.ref === inventoryRef && (inventory as Fields).path === (attempt.artifacts[inventoryRef as string] as Entry).path &&
    (inventory as Fields).sha256 === inputDigests.inventorySha256 &&
    isDeepStrictEqual(receipts.inputDigests, inputDigests), 'Recorded Knip inputs do not match the saved artifacts.');
  for (const mode of ['normal', 'production']) {
    const matches = (receipts.runs as Fields[]).filter(run => run?.mode === mode);
    assert(matches.length === 1 && ['completed', 'failed', 'skipped'].includes(matches[0]?.status as string),
      'Invalid Knip receipt for mode: ' + mode);
  }
  return workspaces;
}

function sourceReader(paths: Map<unknown, Fields>, snapshot: string): (record: Fields, label: string) => Buffer {
  return function checkedSourceBytes(record, label) {
    const saved = paths.get(record?.path);
    assert(saved?.kind === 'file' && record.sha256 === saved.sha256, 'Invalid ' + label + ' source: ' + record?.path);
    const bytes = file(snapshot, record.path);
    assert(hash(bytes) === record.sha256, label + ' source digest mismatch: ' + record.path);
    return bytes;
  };
}

// The drafts, the queried and excerpted sources and every artifact are unchanged before the drafts change.
function finalChecks({ config, drafts, attempt, inputs, loading, currentExcerpts, checkedSourceBytes }: Finalization): void {
  drafts.checkDrafts();
  for (const record of loading.scope as Fields[]) checkedSourceBytes(record, 'Queried');
  for (const excerpt of currentExcerpts) {
    assert(excerpt?.snapshotRef === inputs.snapshotRef, 'Excerpt snapshot mismatch: ' + excerpt?.path);
    checkedSourceBytes(excerpt, 'Excerpt');
  }
  assert(isDeepStrictEqual([...attemptFiles(config.attempt)], attempt.names), 'Attempt files changed during finalization.');
  for (const [ref, entry] of Object.entries(attempt.artifacts)) attempt.verify(ref, entry);
}

function publishedDrafts({ config, drafts, attempt, run, discovery, analysis, inputs }: Finalization): Drafts {
  const { yaml, analysisRef } = config;
  const progress = { ...(run.progress as Fields), inspectionPriorities: 'complete' };
  const nextRun = { ...run, artifacts: attempt.artifacts, progress, coverage: new RunSummary({ progress,
    inventory: inputs.inventory, reviewRef: analysisRef, issuesRef: analysisRef, issues: analysis }).coverage() };
  const nextDiscovery = { ...discovery, entryAnalysisRef: analysisRef, questions: analysis.questions, gaps: analysis.gaps };
  return { run: Buffer.from(yaml.stringify(nextRun)), discovery: Buffer.from(yaml.stringify(nextDiscovery)),
    baseline: drafts.before.baseline as Buffer };
}

function verifyPublished(state: Finalization, published: Drafts): void {
  const { config, drafts, attempt, run, inputs, analysis, checkedSourceBytes } = state;
  for (const name of draftNames) assert((drafts.current[name] as Buffer).equals(published[name] as Buffer),
    name + '.yaml differs from this attempt\'s published Stage 3 state. Do not use verify after later publication.');
  const regularFiles = (inputs.inventory.files as Fields[]).filter(record => record.kind === 'file');
  for (const record of regularFiles) checkedSourceBytes(record, 'Indexed');
  drafts.checkDrafts();
  console.log(JSON.stringify({ formatVersion: 1, action: 'verify', status: 'verified',
    runRef: run.id, snapshotRef: inputs.snapshotRef, attemptId: config.id, entryAnalysisRef: config.analysisRef,
    checked: { registeredArtifactDigests: Object.keys(attempt.artifacts).length,
      indexedRegularFileDigests: regularFiles.length, currentReviewedRanges: (analysis.reviewedFiles as unknown[]).length,
      exactPublishedDrafts: draftNames.map(name => name + '.yaml') },
    limits: ['Only this latest published Stage 3 state is checked.',
      'Snapshot file membership, symlink targets, and excluded inputs are not checked.',
      'Structure and evidence checks do not certify analysis meaning or runtime behavior.'],
    writes: [],
  }, null, 2));
}

function finish(): void {
  const config = settings();
  const drafts = draftCheckpoints(config);
  const records = checkpointRecords(config, drafts);
  const attempt = savedAttempt(config, records.run);
  attempt.receipt('start', 'start', [...checkpoints, ...toolFiles, 'handoff.json']);
  attempt.receipt('collect', 'collect', collectFiles);
  attempt.receipt('save-review', 'save-review', reviewFiles);
  // Each text-search record and its raw ripgrep output must be as the text-search action saved them.
  for (const name of attempt.names.filter(name => /^text-search-[0-9]+\.json$/.test(name))) {
    const phase = name.slice(0, -'.json'.length);
    attempt.receipt(phase, 'text-search', [phase + '.stdout.jsonl', phase + '.stderr.txt', name]);
  }
  // Each exports record and its required gaps must be as the exports action saved them.
  for (const name of attempt.names.filter(name => /^exports-[0-9]+\.json$/.test(name))) {
    const phase = name.slice(0, -'.json'.length);
    attempt.receipt(phase, 'exports', [name, StageThreeGaps.exportsFile(phase)]);
  }
  assert(attempt.buffers.has(attempt.attemptRef('commands.md')), 'Missing command log.');
  const inputs = selectedInputs(config, records, attempt);
  const loading = checkQueries(attempt, inputs);
  const workspaces = checkKnipInputs(attempt, inputs);
  const checkedSourceBytes = sourceReader(inputs.paths, inputs.snapshot);
  const { analysis, currentExcerpts } = checkReview({ ...records, ...inputs, id: config.id, workspaces,
    names: attempt.names, artifacts: attempt.artifacts, buffers: attempt.buffers, document: attempt.document,
    saved: attempt.saved, receipt: attempt.receipt, checkedSourceBytes });
  // The finalizer registers every attempt file, so each one must be a file that a producer action saved.
  attempt.refuseUnsaved();
  const state: Finalization = { ...records, config, drafts, attempt, inputs, loading, analysis, currentExcerpts,
    checkedSourceBytes };
  finalChecks(state);
  const published = publishedDrafts(state);
  if (config.verifyOnly) {
    verifyPublished(state, published);
    return;
  }
  publish(config, drafts, published);
  console.log('Stage 3 drafts updated. Structure and evidence checks passed. Review the analysis for meaning.');
  console.log('Keep all registered attempt files unchanged.');
}

// Replaces discovery.yaml and then run.yaml, the publication marker, as one update.
// When a step fails before run.yaml is replaced, the update gives discovery.yaml its
// bytes from before and removes its temporary files.
function publish({ id, work }: Settings, { before, checkDrafts }: Checkpoints, published: Drafts): void {
  const update = draftUpdate({ work, prefix: '.' + id + '-publication-', read: name => file(work, name),
    before: new Map(draftNames.map(name => [name + '.yaml', before[name] as Buffer])),
    advice: 'Keep this attempt unchanged; use a new attempt ID after you resolve the cause.' });
  try {
    update.stage('discovery.yaml', published.discovery as Buffer);
    update.stage('run.yaml', published.run as Buffer);
    checkDrafts();
    update.place();
  } catch (error) {
    throw update.rollBack(error as Error);
  }
}

try {
  finish();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
