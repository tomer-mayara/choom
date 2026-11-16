import { mkdirSync, realpathSync, renameSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { refuseChangedProducerCode } from './producer-code.ts';
import { type Artifact, assert, type Fields, hash, json, object, oneOf, text } from './record-checks.ts';
import { runLayout } from './run-layout.mjs';
import { directory, ensureDirectory, file, fileNames, type OwnedFile, type OwnedFolder, present, removeOwned,
  removeOwnedDirectories, requireNames, saveNew, stillOwned, withLock } from './stage-6-files.ts';
import { type CheckedInventory, draftNames, loadYaml, plainId, readRegistry, type SnapshotIdentity, type TrustedYaml,
  verifyInventory } from './stage-6-inputs.ts';
import { factKeys, fixedDiscovery, packetFiles, readBaselineYaml, type RunRecord, validateRecords } from './stage-6-records.ts';

// The Stage 6 helper. preflight and start check the finalized Stage 5 drafts and
// the readiness packet; start saves the checkpoints, the packet and the prepared
// fixed records in a new attempt. check validates the prepared attempt again,
// finish publishes the fixed baseline and discovery result and completes the run
// manifest last, and verify checks a completed publication. Saved JSON and YAML
// stay unchecked values until the checks read them.
type Files = Map<string, Buffer>;
interface Facts extends Fields {
  runRef: string;
  snapshotRef: string;
  baselineRef: string;
  discoveryRef: string;
  baselinePath: string;
  discoveryPath: string;
  snapshot: SnapshotIdentity;
  selectedRefs: Fields;
}
// The checked drafts and inputs of the finalized Stage 5, and the prepared fixed records.
interface State { run: RunRecord; drafts: Files; artifacts: Map<string, Artifact>; candidates: Files; facts: Facts; validation: Fields }
interface Prepared { state: State; prepared: Files; yaml: TrustedYaml }
interface CommandRecord { args: string[]; cwd: string; environment: Record<string, string> }
// The receipts, the fixed records and the staged files of a publication.
interface Staged { phase: Files; baseline: Buffer; stagedDiscovery: OwnedFile; stagedRun: OwnedFile }
// What a publication wrote so far, so that a failure can undo it.
interface Publication {
  tracked: Map<string, OwnedFile>;
  directories: OwnedFolder[];
  fixed: Set<string>;
  phases: Set<string>;
  stagedDiscovery?: OwnedFile;
  publishedDiscovery: boolean;
  nextRun?: Buffer;
  phaseStarted: boolean;
  committed: boolean;
}

const self = fileURLToPath(import.meta.url);
const [action, reviewDir, ...extra] = process.argv.slice(2);
const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE6, CHOOM_STAGE6_ID } = process.env;
const id = CHOOM_STAGE6_ID ?? '';
const commandsName = 'stage-6-commands.ts';
// Start saves the cookbook as a record. Every action runs the producer code in
// the tool checkout after the producer code check.
const toolsToFreeze = ['step-6-cookbook.md'];
const checkpoints = draftNames.map(name => name.replace('.yaml', '.before.yaml'));
const candidateNames = ['baseline.candidate.yaml', 'discovery.candidate.yaml'];
const startReceiptName = 'operator-start.json';
const finishStartedName = 'operator-finish.started.json';
const finishReceiptName = 'operator-finish.json';
const finishFailedName = 'operator-finish.failed.json';
const maxReviewBytes = 16 * 1024 * 1024;
const encode = (value: unknown): Buffer => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const utc = (): string => new Date().toISOString();
const artifactId = (name: string): string => id + '-file@' + encodeURIComponent(name);

function checkedIds(run: Fields, baseline: Fields): Pick<Facts, 'runRef' | 'snapshotRef' | 'baselineRef' | 'discoveryRef' |
  'baselinePath' | 'discoveryPath'> {
  assert(plainId(run.id) && plainId(baseline.id), 'Invalid run or baseline ID.');
  return { runRef: run.id, snapshotRef: (run.snapshot as Fields).id as string, baselineRef: baseline.id, discoveryRef: id + '-discovery',
    baselinePath: 'baselines/' + baseline.id + '/baseline.yaml', discoveryPath: 'runs/' + run.id + '/discovery.yaml' };
}

assert(extra.length === 0 && ((oneOf(['preflight', 'start'], action) && isAbsolute(reviewDir ?? '')) ||
  (oneOf(['check', 'finish', 'verify'], action) && reviewDir === undefined)), 'Use preflight REVIEW_DIR, start REVIEW_DIR, check, finish, or verify.');
assert(/^s6-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), 'Set CHOOM_STAGE6_ID to a new or prepared s6-... ID.');
const work = directory(CHOOM_WORK);
const tools = directory(CHOOM_TOOLS);
runLayout(work, tools);
const sourceTools = join(tools, 'packages/producer/src');
// The Stage 6 cookbook stays in docs/design/app-a.
const sourceFolder = (name: string): string => name.endsWith('.md') ? join(tools, 'docs/design/app-a') : sourceTools;
assert(self === join(sourceTools, commandsName) && realpathSync(self) === self, 'Use the Stage 6 helper in the trusted checkout.');
const attempt = join(directory(join(work, 'evidence')), id);
assert(CHOOM_STAGE6 === attempt, 'Set CHOOM_STAGE6 to the matching attempt directory.');
refuseChangedProducerCode(work, tools);
const lockPath = join(work, '.stage-6-publish.lock');
const environment = { CHOOM_WORK: work, CHOOM_TOOLS: tools, CHOOM_STAGE6_ID: id, CHOOM_STAGE6: attempt };
const command = (): CommandRecord => ({ args: process.argv, cwd: process.cwd(), environment });
const saved = (name: string): Buffer => file(attempt, name);
const hashMap = (files: Iterable<[string, Buffer | undefined]>): Record<string, string> =>
  Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes as Buffer)]));
const candidate = (state: State, name: string): Buffer => state.candidates.get(name) as Buffer;
const draft = (state: State, name: string): Buffer => state.drafts.get(name) as Buffer;

function requireWorkingDrafts(expected: Files): void {
  for (const [name, bytes] of expected) assert(file(work, name).equals(bytes), 'Working draft changed: ' + name);
}
function workingDrafts(): Files { return new Map(draftNames.map(name => [name, file(work, name)])); }

// The run state of a finalized Stage 5 with pending baseline recovery.
function checkStageFiveRun(run: Fields | null | undefined): asserts run is RunRecord {
  assert(run?.formatVersion === 1 && run.mode === 'A' && run.status === 'in-progress' &&
    same(run.progress, { inventory: 'complete', entryAnalysis: 'complete', inspectionPriorities: 'complete',
      componentRecovery: 'complete', remainingCode: 'complete', baselineRecovery: 'pending' }) &&
    !Object.hasOwn(run, 'baselineRef') && !Object.hasOwn(run, 'discoveryRef') && !Object.hasOwn(run, 'completedAt') &&
    (run.snapshot as Fields | null | undefined)?.root === 'snapshot' && plainId((run.snapshot as Fields).id),
  'Expected finalized Stage 5 and pending baseline recovery.');
}

function readStageFive({ drafts, packet, yaml }: { drafts: Files; packet: Files; yaml: TrustedYaml }): State {
  const parse = (bytes: Buffer | undefined): unknown => yaml.parse((bytes as Buffer).toString('utf8'));
  const run = parse(drafts.get('run.yaml')) as Fields | null | undefined;
  const baseline = readBaselineYaml(drafts.get('baseline.yaml') as Buffer, yaml) as Fields;
  const discovery = parse(drafts.get('discovery.yaml')) as Fields | null | undefined;
  checkStageFiveRun(run);
  const selected = discovery?.entryAnalysisRef as string | undefined;
  const stageFive = /^s5-[a-z0-9]+(?:-[a-z0-9]+)*(?=-entry-analysis$)/.exec(selected ?? '')?.[0];
  assert(stageFive, 'Expected the selected Stage 5 entry analysis.');
  const artifacts = readRegistry(work, id, run);
  for (const name of ['baseline', 'discovery']) {
    const ref = stageFive + '-file@' + name + '.proposed.yaml';
    assert((drafts.get(name + '.yaml') as Buffer).equals(artifacts.get(ref)?.bytes ?? Buffer.alloc(0)),
      'Working draft differs from the published Stage 5 proposal: ' + name);
  }
  const verified = verifyInventory(work, run, artifacts);
  const draftDigests = hashMap(drafts);
  const refs = checkedIds(run, baseline);
  const attemptRecords = [...checkpoints, ...toolsToFreeze, ...packetFiles, ...candidateNames,
    'handoff.json', 'validation.json', 'commands.md', startReceiptName, finishStartedName, finishReceiptName];
  // The record validator reserves the baseline ID itself, as it does for Stages 4 and 5.
  const reservedIds = [refs.discoveryRef, ...attemptRecords.map(artifactId)];
  const counts = validateRecords({ run, baseline, discovery, artifacts, packet, draftDigests, reservedIds,
    inventory: verified.inventory, parse: yaml.parse, readSource: verified.readSource });
  const working = discovery as Fields;
  assert(!artifacts.has(refs.baselineRef) && !artifacts.has(refs.discoveryRef) &&
    ![...artifacts.values()].some(item => [refs.baselinePath, refs.discoveryPath].includes(item.path)),
  'A fixed baseline or discovery artifact is already registered.');
  // The fixed baseline is the reviewed baseline draft, byte for byte; the fixed discovery result names its SHA-256.
  const fixed = fixedDiscovery(working, refs.baselineRef, drafts.get('baseline.yaml') as Buffer);
  const candidates = new Map([
    ['baseline.candidate.yaml', drafts.get('baseline.yaml') as Buffer],
    ['discovery.candidate.yaml', Buffer.from(yaml.stringify(fixed))],
  ]);
  assert(same(parse(candidates.get('discovery.candidate.yaml')), fixed), 'Fixed discovery serialization changed the reviewed result.');
  return { run, drafts, artifacts, candidates, facts: stageFacts({ run, refs, verified, artifacts, draftDigests, discovery: working }),
    validation: { formatVersion: 1, attemptId: id, runRef: refs.runRef, snapshotRef: refs.snapshotRef,
      baselineRef: refs.baselineRef, status: 'verified', registeredArtifactsVerified: artifacts.size,
      indexedFilesVerified: (verified.inventory.files as unknown[]).length, ...counts,
      limits: ['Deterministic records, digests, source ranges and references only. No target execution or new tool analysis.',
        'The separate readiness review records semantic judgments and limits. Proposed intent remains proposed.'] } };
}

interface FactInputs {
  run: RunRecord;
  refs: ReturnType<typeof checkedIds>;
  verified: CheckedInventory;
  artifacts: Map<string, Artifact>;
  draftDigests: Record<string, string>;
  discovery: Fields;
}

// The facts that start saves in handoff.json and every later action compares, in this key order.
function stageFacts({ run, refs, verified, artifacts, draftDigests, discovery }: FactInputs): Facts {
  return { formatVersion: 1, attemptId: id, ...refs, work, tools, snapshot: verified.snapshot,
    inventoryRef: run.snapshot.inventoryRef, inventorySha256: verified.inventorySha256,
    indexedFiles: (verified.inventory.files as unknown[]).length, registeredArtifacts: artifacts.size, draftDigests,
    selectedRefs: Object.fromEntries(factKeys.map(key => [key, discovery[key]])),
    registeredArtifactDigests: Object.fromEntries([...artifacts].map(([ref, item]) => [ref, item.sha256])),
  };
}

function handoffRecord(state: State, frozenTools: Files, packet: Files, yaml: TrustedYaml): Fields {
  return { ...state.facts, toolInputDigests: hashMap(frozenTools), packetDigests: hashMap(packet),
    parserVersions: yaml.versions, validationSha256: hash(encode(state.validation)), candidateDigests: hashMap(state.candidates) };
}

function startFiles(state: State, frozenTools: Files, packet: Files, yaml: TrustedYaml, startedAt: string): Files {
  const files: Files = new Map([
    ...draftNames.map((name, index): [string, Buffer] => [checkpoints[index] as string, draft(state, name)]),
    ...frozenTools, ...packet, ...state.candidates,
    ['validation.json', encode(state.validation)],
    ['handoff.json', encode(handoffRecord(state, frozenTools, packet, yaml))],
    ['commands.md', Buffer.from('# Stage 6 commands\n\n' +
      'The trusted checkout helper prepares and publishes the fixed records. Saved scripts are evidence.\n\n' +
      'Start command: ' + JSON.stringify(command()) + '\n')],
  ]);
  const receipt = { formatVersion: 1, attemptId: id, action: 'start', status: 'completed', command: command(),
    startedAt, finishedAt: utc(), digests: hashMap(files) };
  return new Map([...files, [startReceiptName, encode(receipt)]]);
}

function requireFreeTargets(state: State): void {
  for (const name of [state.facts.baselinePath, state.facts.discoveryPath]) {
    const parent = dirname(join(work, name));
    const base = dirname(parent);
    if (present(base)) directory(base);
    if (present(parent)) directory(parent);
    assert(!present(join(work, name)), 'Fixed record already exists: ' + name);
  }
  for (const name of ['run', 'discovery'])
    assert(!present(join(work, '.stage-6-' + name + '.next.yaml')), 'Publication temporary file already exists: ' + name);
}

function start(): Fields {
  assert(!present(attempt), 'Start with a fresh attempt ID.');
  const review = directory(reviewDir);
  assert(review !== work && !review.startsWith(work + '/') && !work.startsWith(review + '/'),
    'Keep the readiness packet outside the saved run.');
  const frozenTools = new Map(toolsToFreeze.map(name => [name, file(sourceFolder(name), name)]));
  requireNames(fileNames(review), packetFiles, 'readiness packet');
  const packet = new Map(packetFiles.map(name => [name, file(review, name, maxReviewBytes)]));
  const yaml = loadYaml(tools);
  const state = readStageFive({ drafts: workingDrafts(), packet, yaml });
  requireFreeTargets(state);
  if (action === 'preflight') return { ...state.validation, status: 'stage6-preflight-verified', writes: [] };
  const startedAt = utc();
  const staged = startFiles(state, frozenTools, packet, yaml, startedAt);
  const tracked = new Map<string, OwnedFile>();
  mkdirSync(attempt);
  try {
    mkdirSync(join(attempt, 'llm'));
    for (const [name, bytes] of staged) saveNew(join(attempt, name), bytes, tracked);
    requireWorkingDrafts(state.drafts);
  } catch (error) {
    try {
      saveNew(join(attempt, 'operator-start.failed.json'), encode({ formatVersion: 1, attemptId: id, action: 'start',
        status: 'failed', command: command(), startedAt, finishedAt: utc(), reason: (error as Error).message }), new Map());
    } catch { /* Report the original failure and keep the partial attempt. */ }
    throw error;
  }
  return { ...state.validation, status: 'stage6-prepared', writes: [...staged.keys()] };
}

function loadPrepared({ completed }: { completed: boolean }): Prepared {
  directory(attempt);
  const receiptBytes = saved(startReceiptName);
  const receipt = json(receiptBytes) as Fields | null | undefined;
  assert(receipt?.formatVersion === 1 && receipt.attemptId === id && receipt.action === 'start' &&
    receipt.status === 'completed' && same((receipt.command as Fields).environment, environment) && object(receipt.digests),
  'Missing completed start receipt.');
  const digests = receipt.digests;
  const names = Object.keys(digests);
  const prepared = new Map(names.map(name => {
    const bytes = saved(name);
    assert(hash(bytes) === digests[name], 'Changed prepared artifact: ' + name);
    return [name, bytes];
  }));
  const handoff = json(prepared.get('handoff.json') as Buffer) as Fields;
  const frozenTools = new Map(toolsToFreeze.map(name => [name, prepared.get(name) as Buffer]));
  assert(same(hashMap(frozenTools), handoff.toolInputDigests) && object(handoff.parserVersions), 'Missing or changed frozen tool pins.');
  const yaml = loadYaml(tools, handoff.parserVersions);
  requireNames(names, [...checkpoints, ...toolsToFreeze, ...packetFiles, ...candidateNames,
    'handoff.json', 'validation.json', 'commands.md'], 'prepared output');
  const packet = new Map(packetFiles.map(name => [name, prepared.get(name) as Buffer]));
  const drafts = new Map(draftNames.map((name, index) => [name, prepared.get(checkpoints[index] as string) as Buffer]));
  const state = readStageFive({ drafts, packet, yaml });
  assert(same(handoff, handoffRecord(state, frozenTools, packet, yaml)), 'Prepared handoff differs from verified inputs.');
  assert((prepared.get('validation.json') as Buffer).equals(encode(state.validation)), 'Prepared validation result changed.');
  for (const [name, bytes] of state.candidates)
    assert((prepared.get(name) as Buffer).equals(bytes), 'Prepared candidate changed: ' + name);
  prepared.set(startReceiptName, receiptBytes);
  const additions = completed ? [finishStartedName, finishReceiptName] : [];
  requireNames(fileNames(attempt), [...prepared.keys(), ...additions], 'attempt');
  if (!completed) {
    requireWorkingDrafts(drafts);
    requireFreeTargets(state);
  }
  return { state, prepared, yaml };
}

function checkInputs({ state, prepared }: Pick<Prepared, 'state' | 'prepared'>,
  { checkDrafts = true, phase = new Map<string, Buffer>() }: { checkDrafts?: boolean; phase?: Files } = {}): void {
  if (checkDrafts) requireWorkingDrafts(state.drafts);
  for (const [ref, { path, bytes }] of state.artifacts)
    assert(file(work, path).equals(bytes), 'Registered artifact changed during publication: ' + ref);
  for (const [name, bytes] of [...prepared, ...phase])
    assert(saved(name).equals(bytes), 'Attempt evidence changed during publication: ' + name);
  requireNames(fileNames(attempt), [...prepared.keys(), ...phase.keys()], 'attempt');
  const inventory = verifyInventory(work, state.run, state.artifacts);
  assert(same(inventory.snapshot, state.facts.snapshot), 'Snapshot identity changed during publication.');
}

function completeManifest({ state, prepared, yaml }: Prepared, phase: Files, completedAt: unknown): Buffer {
  const { baselineRef, baselinePath, discoveryRef, discoveryPath, selectedRefs } = state.facts;
  const { inspectedPaths, questions, gaps, unknownOwners } = state.validation;
  const coverage = { ...(state.run.coverage as Fields | undefined),
    inspected: `See ${selectedRefs.entryAnalysisRef}#/reviewedFiles and its predecessor analyses for reviewed source ranges. ` +
      `See ${selectedRefs.codeMappingRef} for file review scope and ${discoveryRef}#/inspectedPaths for inspected behavior paths (${inspectedPaths}).`,
    unresolved: `Fixed baseline ${baselineRef} records proposed intent. ` +
      `See fixed discovery ${discoveryRef} for questions (${questions}) and gaps (${gaps}), ` +
      `and ${selectedRefs.codeMappingRef} for files with unknown owners (${unknownOwners}).`,
  };
  const artifacts = { ...(state.run.artifacts as Fields) };
  function add(ref: string, path: string, bytes: Buffer): void {
    assert(!Object.hasOwn(artifacts, ref), 'Artifact ID already exists: ' + ref);
    artifacts[ref] = { path, sha256: hash(bytes) };
  }
  for (const [name, bytes] of [...prepared, ...phase]) add(artifactId(name), 'evidence/' + id + '/' + name, bytes);
  add(baselineRef, baselinePath, candidate(state, 'baseline.candidate.yaml'));
  add(discoveryRef, discoveryPath, candidate(state, 'discovery.candidate.yaml'));
  const run = { ...state.run, status: 'completed', progress: { ...(state.run.progress as Fields), baselineRecovery: 'complete' },
    coverage, baselineRef, discoveryRef, completedAt, artifacts };
  return Buffer.from(yaml.stringify(run));
}

function finishRecords(state: State, startedAt: string, completedAt: string): Files {
  const started = { formatVersion: 1, attemptId: id, action: 'finish', status: 'started', startedAt, command: command() };
  const receipt = { formatVersion: 1, attemptId: id, runRef: state.facts.runRef, snapshotRef: state.facts.snapshotRef,
    action: 'finish', status: 'prepared-for-publication', completedAt, startedSha256: hash(encode(started)),
    records: {
      baseline: { id: state.facts.baselineRef, path: state.facts.baselinePath, sha256: hash(candidate(state, 'baseline.candidate.yaml')) },
      discovery: { id: state.facts.discoveryRef, path: state.facts.discoveryPath, sha256: hash(candidate(state, 'discovery.candidate.yaml')) },
    },
    note: 'The completed run manifest is the publication marker. The baseline draft stays unchanged.',
  };
  return new Map([[finishStartedName, encode(started)], [finishReceiptName, encode(receipt)]]);
}

// Saves the finish receipts, the fixed records, and the staged discovery and run manifest.
function stageRecords(input: Prepared, publication: Publication): Staged {
  const { state } = input;
  requireFreeTargets(state);
  checkInputs(input);
  const now = utc();
  const phase = finishRecords(state, now, now);
  for (const [name, bytes] of phase) {
    const path = join(attempt, name);
    publication.phases.add(path);
    saveNew(path, bytes, publication.tracked);
    if (name === finishStartedName) publication.phaseStarted = true;
  }
  const baseline = candidate(state, 'baseline.candidate.yaml');
  const discovery = candidate(state, 'discovery.candidate.yaml');
  for (const [path, bytes] of [[state.facts.baselinePath, baseline], [state.facts.discoveryPath, discovery]] as const) {
    const absolute = join(work, path);
    ensureDirectory(dirname(dirname(absolute)), publication.directories);
    ensureDirectory(dirname(absolute), publication.directories);
    publication.fixed.add(absolute);
    saveNew(absolute, bytes, publication.tracked);
  }
  publication.nextRun = completeManifest(input, phase, now);
  const stagedDiscovery = saveNew(join(work, '.stage-6-discovery.next.yaml'), discovery, publication.tracked);
  publication.stagedDiscovery = stagedDiscovery;
  const stagedRun = saveNew(join(work, '.stage-6-run.next.yaml'), publication.nextRun, publication.tracked);
  return { phase, baseline, stagedDiscovery, stagedRun };
}

// Checks every input again, replaces the working discovery, checks the outputs
// again and publishes the completed run manifest last.
function commitRecords(input: Prepared, publication: Publication, { phase, baseline, stagedDiscovery, stagedRun }: Staged): Fields {
  const { state } = input;
  checkInputs(input, { phase });
  assert(stillOwned(stagedDiscovery), 'Staged discovery changed.');
  assert(file(work, 'discovery.yaml').equals(draft(state, 'discovery.yaml')), 'Working discovery changed during publication.');
  renameSync(stagedDiscovery.path, join(work, 'discovery.yaml'));
  publication.publishedDiscovery = true;
  publication.tracked.delete(stagedDiscovery.path);
  const placedDiscovery = { ...stagedDiscovery, path: join(work, 'discovery.yaml') };

  checkInputs(input, { checkDrafts: false, phase });
  for (const path of publication.fixed)
    assert(stillOwned(publication.tracked.get(path) as OwnedFile), 'Fixed record changed during publication: ' + path);
  assert(stillOwned(placedDiscovery) && stillOwned(stagedRun), 'Published discovery or staged run changed.');
  requireWorkingDrafts(new Map([['baseline.yaml', baseline], ['run.yaml', draft(state, 'run.yaml')]]));
  renameSync(stagedRun.path, join(work, 'run.yaml'));
  publication.committed = true;
  return { ...state.validation, status: 'stage6-published', baselinePath: state.facts.baselinePath,
    discoveryPath: state.facts.discoveryPath, discoveryRef: state.facts.discoveryRef,
    writes: [...phase.keys(), state.facts.baselinePath, state.facts.discoveryPath, 'discovery.yaml', 'run.yaml'] };
}

// Puts the working discovery of the drafts back in place of the published one,
// if the published file is still the file that this publication placed.
function restoreDiscovery(state: State, publication: Publication, leftovers: string[]): void {
  try {
    const placed = { ...(publication.stagedDiscovery as OwnedFile), path: join(work, 'discovery.yaml') };
    if (stillOwned(placed)) {
      const rollback = saveNew(join(work, '.stage-6-discovery.next.yaml'), draft(state, 'discovery.yaml'), publication.tracked);
      if (stillOwned(placed) && stillOwned(rollback)) {
        renameSync(rollback.path, placed.path);
        publication.tracked.delete(rollback.path);
      } else leftovers.push(placed.path);
    } else leftovers.push(placed.path);
  } catch { leftovers.push(join(work, 'discovery.yaml')); }
}

// Undoes a publication that did not publish the run manifest: restores the working
// discovery, and removes the files and folders that it still owns. The fixed
// records stay when a working draft no longer matches. A started finish gets a
// failure receipt.
function rollBack(state: State, publication: Publication, error: Error, leftovers: string[]): void {
  if (publication.publishedDiscovery) restoreDiscovery(state, publication, leftovers);
  let unreferenced = false;
  try {
    unreferenced = file(work, 'run.yaml').equals(draft(state, 'run.yaml')) &&
      file(work, 'discovery.yaml').equals(draft(state, 'discovery.yaml'));
  } catch { /* Keep fixed records if a working draft cannot be checked. */ }
  for (const [path, record] of publication.tracked) {
    if (publication.phases.has(path)) continue;
    if (publication.fixed.has(path) && !unreferenced) leftovers.push(path);
    else removeOwned(record, leftovers);
  }
  if (unreferenced) removeOwnedDirectories(publication.directories, leftovers);
  if (publication.phaseStarted) {
    try {
      saveNew(join(attempt, finishFailedName), encode({ formatVersion: 1, attemptId: id, action: 'finish', status: 'failed',
        command: command(), finishedAt: utc(), reason: error.message, leftovers }), new Map());
    } catch { leftovers.push(join(attempt, finishFailedName)); }
  }
}

function publish(input: Prepared): Fields {
  return withLock(lockPath, () => {
    const publication: Publication = { tracked: new Map(), directories: [], fixed: new Set(), phases: new Set(),
      publishedDiscovery: false, phaseStarted: false, committed: false };
    try {
      return commitRecords(input, publication, stageRecords(input, publication));
    } catch (failure) {
      const error = failure as Error;
      const leftovers: string[] = [];
      try { publication.committed ||= publication.nextRun !== undefined && file(work, 'run.yaml').equals(publication.nextRun); }
      catch { /* Preserve an unreadable run. */ }
      if (!publication.committed) rollBack(input.state, publication, error, leftovers);
      const recovery = leftovers.length ? ' Check retained paths: ' + [...new Set(leftovers)].join(', ') + '.' : '';
      throw new Error('Stage 6 publication stopped: ' + error.message + '.' + recovery);
    }
  });
}

function verifyCompleted(input: Prepared): Fields {
  const { state, prepared, yaml } = input;
  const phase = new Map([[finishStartedName, saved(finishStartedName)], [finishReceiptName, saved(finishReceiptName)]]);
  const started = json(phase.get(finishStartedName) as Buffer) as Fields;
  const receipt = json(phase.get(finishReceiptName) as Buffer) as Fields;
  assert(started.formatVersion === 1 && started.attemptId === id && started.action === 'finish' && started.status === 'started' &&
    same((started.command as Fields).environment, environment) && receipt.formatVersion === 1 && receipt.attemptId === id &&
    receipt.runRef === state.facts.runRef && receipt.snapshotRef === state.facts.snapshotRef &&
    receipt.status === 'prepared-for-publication' && text(receipt.completedAt) && Number.isFinite(Date.parse(receipt.completedAt)) &&
    receipt.startedSha256 === hash(phase.get(finishStartedName) as Buffer), 'Invalid Stage 6 publication receipt.');
  const baseline = candidate(state, 'baseline.candidate.yaml');
  const discovery = candidate(state, 'discovery.candidate.yaml');
  assert(same(receipt.records, {
    baseline: { id: state.facts.baselineRef, path: state.facts.baselinePath, sha256: hash(baseline) },
    discovery: { id: state.facts.discoveryRef, path: state.facts.discoveryPath, sha256: hash(discovery) },
  }), 'Fixed record receipt differs from the prepared result.');
  const expectedRun = completeManifest(input, phase, receipt.completedAt);
  requireWorkingDrafts(new Map([['run.yaml', expectedRun], ['baseline.yaml', baseline], ['discovery.yaml', discovery]]));
  assert(file(work, state.facts.baselinePath).equals(baseline) && file(work, state.facts.discoveryPath).equals(discovery),
    'Fixed records do not match the prepared result.');
  const run = yaml.parse(expectedRun.toString('utf8')) as Fields;
  const registry = readRegistry(work, id, run, true);
  checkInputs({ state, prepared }, { checkDrafts: false, phase });
  return { ...state.validation, status: 'stage6-completed-verified', registeredArtifactsVerified: registry.size,
    baselinePath: state.facts.baselinePath, discoveryPath: state.facts.discoveryPath,
    discoveryRef: state.facts.discoveryRef, completedAt: receipt.completedAt, writes: [] };
}

function main(): Fields {
  if (action === 'preflight' || action === 'start') return start();
  if (action === 'verify') {
    assert(!present(lockPath), 'Publication lock remains. Check ' + lockPath);
    for (const name of ['run', 'discovery'])
      assert(!present(join(work, '.stage-6-' + name + '.next.yaml')), 'Publication temporary file remains: ' + name);
  }
  const prepared = loadPrepared({ completed: action === 'verify' });
  if (action === 'check') return { ...prepared.state.validation, status: 'stage6-prepared-verified', writes: [] };
  if (action === 'finish') return publish(prepared);
  return verifyCompleted(prepared);
}
try { console.log(JSON.stringify(main(), null, 2)); }
catch (error) { console.error((error as Error).message); process.exitCode = 1; }
