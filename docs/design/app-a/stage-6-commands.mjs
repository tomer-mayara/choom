import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync,
  realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { runLayout } from './run-layout.mjs';

const self = fileURLToPath(import.meta.url);
const [action, reviewDir, ...extra] = process.argv.slice(2);
const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE6, CHOOM_STAGE6_ID: id } = process.env;
const commandsName = 'stage-6-commands.mjs';
const recordsName = 'stage-6-records.mjs';
const runtimeTools = [commandsName, recordsName, 'run-layout.mjs'];
const toolsToFreeze = [...runtimeTools, 'step-6-cookbook.md'];
const draftNames = ['run.yaml', 'baseline.yaml', 'discovery.yaml'];
const checkpoints = draftNames.map(name => name.replace('.yaml', '.before.yaml'));
const candidateNames = ['baseline.candidate.yaml', 'discovery.candidate.yaml'];
const startReceiptName = 'operator-start.json';
const finishStartedName = 'operator-finish.started.json';
const finishReceiptName = 'operator-finish.json';
const finishFailedName = 'operator-finish.failed.json';
const maxArtifactBytes = 128 * 1024 * 1024;
const maxRegistryBytes = 256 * 1024 * 1024;
const maxReviewBytes = 16 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(bytes.toString('utf8'));
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const utc = () => new Date().toISOString();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const plainId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const present = path => Boolean(lstatSync(path, { throwIfNoEntry: false }));
const artifactId = name => id + '-file@' + encodeURIComponent(name);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function safe(name) {
  return text(name) && !isAbsolute(name) && !/[\\\u0000-\u001f\u007f]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}
function directory(path) {
  assert(isAbsolute(path ?? '') && lstatSync(path).isDirectory() && realpathSync(path) === path, 'Expected a canonical directory: ' + path);
  return path;
}
function file(root, name, { maxBytes = maxArtifactBytes, indexed } = {}) {
  assert(safe(name), 'Invalid saved path: ' + name);
  const path = join(root, name);
  const listed = lstatSync(path);
  assert(listed.isFile() && realpathSync(path) === path, 'Expected a canonical regular file: ' + path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    assert(before.isFile() && before.dev === listed.dev && before.ino === listed.ino,
      'File changed before opening: ' + path);
    let bytes;
    if (indexed) {
      assert(before.size === indexed.bytes, 'Indexed size changed: ' + name);
      const stream = createHash('sha256');
      const block = Buffer.allocUnsafe(64 * 1024);
      let count = 0;
      for (let length; (length = readSync(fd, block, 0, block.length, null)) > 0;) {
        stream.update(block.subarray(0, length));
        count += length;
      }
      assert(count === indexed.bytes && stream.digest('hex') === indexed.sha256, 'Indexed content changed: ' + name);
    } else {
      assert(before.size <= maxBytes, 'Saved file exceeds byte limit: ' + name);
      bytes = Buffer.allocUnsafe(before.size);
      for (let offset = 0; offset < bytes.length;) {
        const count = readSync(fd, bytes, offset, bytes.length - offset, null);
        assert(count > 0, 'Saved file shrank while reading: ' + name);
        offset += count;
      }
    }
    const after = fstatSync(fd);
    const current = lstatSync(path);
    assert(after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs &&
      current.dev === before.dev && current.ino === before.ino && realpathSync(path) === path,
    'Saved file changed while reading: ' + path);
    return bytes;
  } finally { closeSync(fd); }
}
function fileNames(root, prefix = '') {
  return readdirSync(join(root, prefix), { encoding: 'buffer' }).flatMap(bytes => {
    const name = bytes.toString('utf8');
    const relative = prefix ? prefix + '/' + name : name;
    assert(Buffer.from(name).equals(bytes) && safe(relative), 'Invalid saved filename: ' + relative);
    const path = join(root, relative);
    const info = lstatSync(path);
    assert(!info.isSymbolicLink() && realpathSync(path) === path && (info.isFile() || info.isDirectory()), 'Invalid saved path: ' + path);
    return info.isDirectory() ? fileNames(root, relative) : [relative];
  }).sort();
}
function requireNames(actual, expected, label) {
  assert(same([...actual].sort(), [...expected].sort()), 'Unexpected ' + label + ' file set.');
}
function checkedIds(run, baseline) {
  assert(plainId(run.id) && plainId(baseline.id), 'Invalid run or baseline ID.');
  return { runRef: run.id, snapshotRef: run.snapshot.id, baselineRef: baseline.id, discoveryRef: id + '-discovery',
    baselinePath: 'baselines/' + baseline.id + '/baseline.yaml', discoveryPath: 'runs/' + run.id + '/discovery.yaml' };
}

assert(extra.length === 0 && ((['preflight', 'start'].includes(action) && isAbsolute(reviewDir ?? '')) ||
  (['check', 'finish', 'verify'].includes(action) && reviewDir === undefined)), 'Use preflight REVIEW_DIR, start REVIEW_DIR, check, finish, or verify.');
assert(/^s6-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id ?? ''), 'Set CHOOM_STAGE6_ID to a new or prepared s6-... ID.');
const work = directory(CHOOM_WORK);
const tools = directory(CHOOM_TOOLS);
runLayout(work, tools);
const sourceTools = join(tools, 'docs/design/app-a');
assert(self === join(sourceTools, commandsName) && realpathSync(self) === self, 'Use the Stage 6 helper in the trusted checkout.');
const attempt = join(directory(join(work, 'evidence')), id);
assert(CHOOM_STAGE6 === attempt, 'Set CHOOM_STAGE6 to the matching attempt directory.');
const lockPath = join(work, '.stage-6-publish.lock');
const environment = { CHOOM_WORK: work, CHOOM_TOOLS: tools, CHOOM_STAGE6_ID: id, CHOOM_STAGE6: attempt };
const command = () => ({ args: process.argv, cwd: process.cwd(), environment });
const saved = name => file(attempt, name);
const hashMap = files => Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)]));

function loadYaml(pinned) {
  const root = directory(join(tools, 'node_modules/yaml'));
  const metadata = json(file(root, 'package.json'));
  assert(!Object.keys(metadata.dependencies ?? {}).length && !Object.keys(metadata.optionalDependencies ?? {}).length,
    'This profile needs a self-contained trusted YAML package.');
  const files = Object.fromEntries(fileNames(root).map(name => [name, hash(file(root, name))]));
  const versions = { node: process.version, yaml: metadata.version, files };
  if (pinned !== undefined) assert(same(versions, pinned), 'Trusted YAML package or Node changed since start.');
  const require = createRequire(join(tools, 'package.json'));
  const path = require.resolve('yaml');
  assert(path.startsWith(root + '/') && realpathSync(path) === path && Object.hasOwn(files, path.slice(root.length + 1)),
    'Use the pinned YAML entry from the trusted checkout.');
  const { parse, stringify } = require(path);
  return { parse, stringify, versions };
}

async function loadRecords(bytes) {
  // Use the bytes read from the trusted checkout, without reopening a saved helper path.
  return await import('data:text/javascript;base64,' + bytes.toString('base64'));
}

function readRegistry(run, { permitFinal = false } = {}) {
  assert(object(run.artifacts), 'Missing artifact registry.');
  const paths = new Set();
  const artifacts = new Map();
  let total = 0;
  for (const [ref, record] of Object.entries(run.artifacts)) {
    assert(text(ref) && safe(record?.path) && sha256(record.sha256) && !draftNames.includes(record.path) &&
      !paths.has(record.path) && (permitFinal || !record.path.startsWith('evidence/' + id + '/')), 'Invalid or duplicate artifact: ' + ref);
    const bytes = file(work, record.path, { maxBytes: Math.min(maxArtifactBytes, maxRegistryBytes - total) });
    total += bytes.length;
    assert(hash(bytes) === record.sha256, 'Registered artifact changed: ' + ref);
    artifacts.set(ref, { ...record, bytes });
    paths.add(record.path);
  }
  return artifacts;
}

function verifyInventory(run, artifacts) {
  const inventoryArtifact = artifacts.get(run.snapshot.inventoryRef);
  assert(inventoryArtifact, 'Missing selected inventory.');
  const inventory = json(inventoryArtifact.bytes);
  assert(inventory.formatVersion === 1 && inventory.snapshotId === run.snapshot.id && Array.isArray(inventory.files),
    'Invalid selected inventory.');
  const snapshot = directory(join(work, 'snapshot'));
  const indexed = new Map();
  for (const record of inventory.files) {
    assert(safe(record?.path) && record.kind === 'file' && !indexed.has(record.path) &&
      Number.isSafeInteger(record.bytes) && record.bytes >= 0 && sha256(record.sha256),
    'Expected unique regular inventory records.');
    indexed.set(record.path, record);
    file(snapshot, record.path, { indexed: record });
  }
  const { dev, ino } = lstatSync(snapshot);
  return { inventory, snapshot: { path: snapshot, dev, ino }, inventorySha256: inventoryArtifact.sha256,
    readSource(path, limit) {
      assert(indexed.has(path), 'Source is outside the inventory: ' + path);
      const bytes = file(snapshot, path, { maxBytes: limit });
      assert(hash(bytes) === indexed.get(path).sha256, 'Changed reviewed source: ' + path);
      return bytes;
    } };
}

function requireWorkingDrafts(expected) {
  for (const [name, bytes] of expected) assert(file(work, name).equals(bytes), 'Working draft changed: ' + name);
}
function workingDrafts() { return new Map(draftNames.map(name => [name, file(work, name)])); }

function readStageFive({ drafts, packet, records, yaml }) {
  const parse = bytes => yaml.parse(bytes.toString('utf8'));
  const [run, baseline, discovery] = draftNames.map(name => parse(drafts.get(name)));
  assert(run?.formatVersion === 1 && run.mode === 'A' && run.status === 'in-progress' &&
    same(run.progress, { inventory: 'complete', entryAnalysis: 'complete', inspectionPriorities: 'complete',
      componentRecovery: 'complete', remainingCode: 'complete', baselineRecovery: 'pending' }) &&
    !Object.hasOwn(run, 'baselineRef') && !Object.hasOwn(run, 'discoveryRef') && !Object.hasOwn(run, 'completedAt') &&
    run.snapshot?.root === 'snapshot' && plainId(run.snapshot.id), 'Expected finalized Stage 5 and pending baseline recovery.');
  const selected = discovery?.entryAnalysisRef;
  const stageFive = /^s5-[a-z0-9]+(?:-[a-z0-9]+)*(?=-entry-analysis$)/.exec(selected ?? '')?.[0];
  assert(stageFive, 'Expected the selected Stage 5 entry analysis.');
  const artifacts = readRegistry(run);
  for (const name of ['baseline', 'discovery']) {
    const ref = stageFive + '-file@' + name + '.proposed.yaml';
    assert(drafts.get(name + '.yaml').equals(artifacts.get(ref)?.bytes ?? Buffer.alloc(0)),
      'Working draft differs from the published Stage 5 proposal: ' + name);
  }
  const verified = verifyInventory(run, artifacts);
  const draftDigests = hashMap(drafts);
  const refs = checkedIds(run, baseline);
  const attemptRecords = [...checkpoints, ...toolsToFreeze, ...records.packetFiles, ...candidateNames,
    'handoff.json', 'validation.json', 'commands.md', startReceiptName, finishStartedName, finishReceiptName];
  const reservedIds = [refs.baselineRef, refs.discoveryRef, ...attemptRecords.map(artifactId)];
  const counts = records.validateRecords({ run, baseline, discovery, artifacts, packet, draftDigests, reservedIds,
    inventory: verified.inventory, parse: yaml.parse, readSource: verified.readSource });
  assert(!artifacts.has(refs.baselineRef) && !artifacts.has(refs.discoveryRef) &&
    ![...artifacts.values()].some(item => [refs.baselinePath, refs.discoveryPath].includes(item.path)),
  'A fixed baseline or discovery artifact is already registered.');
  const candidates = new Map([
    ['baseline.candidate.yaml', drafts.get('baseline.yaml')],
    ['discovery.candidate.yaml', Buffer.from(yaml.stringify({ ...discovery, baselineRef: refs.baselineRef }))],
  ]);
  assert(same(parse(candidates.get('discovery.candidate.yaml')), { ...discovery, baselineRef: refs.baselineRef }),
    'Fixed discovery serialization changed the reviewed result.');
  const facts = { formatVersion: 1, attemptId: id, ...refs, work, tools, snapshot: verified.snapshot,
    inventoryRef: run.snapshot.inventoryRef, inventorySha256: verified.inventorySha256,
    indexedFiles: verified.inventory.files.length, registeredArtifacts: artifacts.size, draftDigests,
    selectedRefs: Object.fromEntries(records.factKeys.map(key => [key, discovery[key]])),
    registeredArtifactDigests: Object.fromEntries([...artifacts].map(([ref, item]) => [ref, item.sha256])),
  };
  const validation = { formatVersion: 1, attemptId: id, runRef: refs.runRef, snapshotRef: refs.snapshotRef,
    baselineRef: refs.baselineRef, status: 'verified', registeredArtifactsVerified: artifacts.size,
    indexedFilesVerified: verified.inventory.files.length, ...counts,
    limits: ['Deterministic records, digests, source ranges and references only. No target execution or new tool analysis.',
      'The separate readiness review records semantic judgments and limits. Proposed intent remains proposed.'],
  };
  return { run, drafts, artifacts, candidates, facts, validation };
}

function startFiles(state, frozenTools, packet, yaml, startedAt) {
  const files = new Map([
    ...draftNames.map((name, index) => [checkpoints[index], state.drafts.get(name)]),
    ...frozenTools, ...packet, ...state.candidates,
    ['validation.json', encode(state.validation)],
    ['handoff.json', encode({ ...state.facts, toolInputDigests: hashMap(frozenTools), packetDigests: hashMap(packet),
      parserVersions: yaml.versions, validationSha256: hash(encode(state.validation)), candidateDigests: hashMap(state.candidates) })],
    ['commands.md', Buffer.from('# Stage 6 commands\n\n' +
      'The trusted checkout helper prepares and publishes the fixed records. Saved scripts are evidence.\n\n' +
      'Start command: ' + JSON.stringify(command()) + '\n')],
  ]);
  const receipt = { formatVersion: 1, attemptId: id, action: 'start', status: 'completed', command: command(),
    startedAt, finishedAt: utc(), digests: hashMap(files) };
  return new Map([...files, [startReceiptName, encode(receipt)]]);
}

function saveNew(path, bytes, tracked) {
  const fd = openSync(path, 'wx');
  const record = { path, bytes, stat: null };
  tracked.set(path, record);
  try {
    record.stat = fstatSync(fd);
    writeFileSync(fd, bytes);
  } finally { closeSync(fd); }
  assert(stillOwned(record), 'Output changed after writing: ' + path);
  return record;
}
function stillOwned(record) {
  const current = lstatSync(record.path, { throwIfNoEntry: false });
  return current?.isFile() && record.stat && current.dev === record.stat.dev && current.ino === record.stat.ino &&
    file(dirname(record.path), record.path.slice(dirname(record.path).length + 1)).equals(record.bytes);
}
function ensureDirectory(path, tracked) {
  if (!present(path)) {
    mkdirSync(path);
    tracked.push({ path, stat: lstatSync(path) });
  }
  return directory(path);
}
function removeOwned(record, leftovers) {
  try {
    if (!present(record.path)) return;
    if (stillOwned(record)) unlinkSync(record.path);
    else leftovers.push(record.path);
  } catch { leftovers.push(record.path); }
}
function removeOwnedDirectories(directories, leftovers) {
  for (const { path, stat } of [...directories].reverse()) {
    try {
      const current = lstatSync(path, { throwIfNoEntry: false });
      if (!current) continue;
      if (current.isDirectory() && stat.dev === current.dev && stat.ino === current.ino) rmdirSync(path);
      else leftovers.push(path);
    } catch { leftovers.push(path); }
  }
}
function requireFreeTargets(state) {
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

async function start() {
  assert(!present(attempt), 'Start with a fresh attempt ID.');
  const review = directory(reviewDir);
  assert(review !== work && !review.startsWith(work + '/') && !work.startsWith(review + '/'),
    'Keep the readiness packet outside the saved run.');
  const frozenTools = new Map(toolsToFreeze.map(name => [name, file(sourceTools, name)]));
  const records = await loadRecords(frozenTools.get(recordsName));
  requireNames(fileNames(review), records.packetFiles, 'readiness packet');
  const packet = new Map(records.packetFiles.map(name => [name, file(review, name, { maxBytes: maxReviewBytes })]));
  const yaml = loadYaml();
  const state = readStageFive({ drafts: workingDrafts(), packet, records, yaml });
  requireFreeTargets(state);
  if (action === 'preflight') return { ...state.validation, status: 'stage6-preflight-verified', writes: [] };
  const startedAt = utc();
  const staged = startFiles(state, frozenTools, packet, yaml, startedAt);
  const tracked = new Map();
  mkdirSync(attempt);
  try {
    mkdirSync(join(attempt, 'llm'));
    for (const [name, bytes] of staged) saveNew(join(attempt, name), bytes, tracked);
    requireWorkingDrafts(state.drafts);
  } catch (error) {
    try {
      saveNew(join(attempt, 'operator-start.failed.json'), encode({ formatVersion: 1, attemptId: id, action: 'start',
        status: 'failed', command: command(), startedAt, finishedAt: utc(), reason: error.message }), new Map());
    } catch { /* Report the original failure and keep the partial attempt. */ }
    throw error;
  }
  return { ...state.validation, status: 'stage6-prepared', writes: [...staged.keys()] };
}

async function loadPrepared({ completed }) {
  directory(attempt);
  const receiptBytes = saved(startReceiptName);
  const receipt = json(receiptBytes);
  assert(receipt?.formatVersion === 1 && receipt.attemptId === id && receipt.action === 'start' &&
    receipt.status === 'completed' && same(receipt.command.environment, environment) && object(receipt.digests),
  'Missing completed start receipt.');
  const names = Object.keys(receipt.digests);
  const prepared = new Map(names.map(name => {
    const bytes = saved(name);
    assert(hash(bytes) === receipt.digests[name], 'Changed prepared artifact: ' + name);
    return [name, bytes];
  }));
  const handoff = json(prepared.get('handoff.json'));
  const frozenTools = new Map(toolsToFreeze.map(name => [name, prepared.get(name)]));
  assert(same(hashMap(frozenTools), handoff.toolInputDigests) && object(handoff.parserVersions), 'Missing or changed frozen tool pins.');
  const trusted = new Map(runtimeTools.map(name => [name, file(sourceTools, name)]));
  for (const [name, bytes] of trusted)
    assert(bytes.equals(frozenTools.get(name)), 'Trusted helper changed since start: ' + name);
  const yaml = loadYaml(handoff.parserVersions);
  const records = await loadRecords(trusted.get(recordsName));
  requireNames(names, [...checkpoints, ...toolsToFreeze, ...records.packetFiles, ...candidateNames,
    'handoff.json', 'validation.json', 'commands.md'], 'prepared output');
  const packet = new Map(records.packetFiles.map(name => [name, prepared.get(name)]));
  const drafts = new Map(draftNames.map((name, index) => [name, prepared.get(checkpoints[index])]));
  const state = readStageFive({ drafts, packet, records, yaml });
  assert(same(handoff, { ...state.facts, toolInputDigests: hashMap(frozenTools), packetDigests: hashMap(packet),
    parserVersions: yaml.versions, validationSha256: hash(encode(state.validation)), candidateDigests: hashMap(state.candidates) }),
  'Prepared handoff differs from verified inputs.');
  assert(prepared.get('validation.json').equals(encode(state.validation)), 'Prepared validation result changed.');
  for (const [name, bytes] of state.candidates) assert(prepared.get(name).equals(bytes), 'Prepared candidate changed: ' + name);
  prepared.set(startReceiptName, receiptBytes);
  const additions = completed ? [finishStartedName, finishReceiptName] : [];
  requireNames(fileNames(attempt), [...prepared.keys(), ...additions], 'attempt');
  if (!completed) {
    requireWorkingDrafts(drafts);
    requireFreeTargets(state);
  }
  return { state, prepared, yaml };
}

function checkInputs({ state, prepared }, { checkDrafts = true, phase = new Map() } = {}) {
  if (checkDrafts) requireWorkingDrafts(state.drafts);
  for (const [ref, { path, bytes }] of state.artifacts)
    assert(file(work, path).equals(bytes), 'Registered artifact changed during publication: ' + ref);
  for (const [name, bytes] of [...prepared, ...phase])
    assert(saved(name).equals(bytes), 'Attempt evidence changed during publication: ' + name);
  requireNames(fileNames(attempt), [...prepared.keys(), ...phase.keys()], 'attempt');
  const inventory = verifyInventory(state.run, state.artifacts);
  assert(same(inventory.snapshot, state.facts.snapshot), 'Snapshot identity changed during publication.');
}

function completeManifest({ state, prepared, yaml }, phase, completedAt) {
  const { baselineRef, baselinePath, discoveryRef, discoveryPath, selectedRefs } = state.facts;
  const { inspectedPaths, questions, gaps, unknownOwners } = state.validation;
  const coverage = { ...state.run.coverage,
    inspected: `See ${selectedRefs.entryAnalysisRef}#/reviewedFiles and its predecessor analyses for reviewed source ranges. ` +
      `See ${selectedRefs.codeMappingRef} for file review scope and ${discoveryRef}#/inspectedPaths for inspected behavior paths (${inspectedPaths}).`,
    unresolved: `Fixed baseline ${baselineRef} records proposed intent. ` +
      `See fixed discovery ${discoveryRef} for questions (${questions}) and gaps (${gaps}), ` +
      `and ${selectedRefs.codeMappingRef} for files with unknown owners (${unknownOwners}).`,
  };
  const artifacts = { ...state.run.artifacts };
  function add(ref, path, bytes) {
    assert(!Object.hasOwn(artifacts, ref), 'Artifact ID already exists: ' + ref);
    artifacts[ref] = { path, sha256: hash(bytes) };
  }
  for (const [name, bytes] of [...prepared, ...phase]) add(artifactId(name), 'evidence/' + id + '/' + name, bytes);
  add(baselineRef, baselinePath, state.candidates.get('baseline.candidate.yaml'));
  add(discoveryRef, discoveryPath, state.candidates.get('discovery.candidate.yaml'));
  const run = { ...state.run, status: 'completed', progress: { ...state.run.progress, baselineRecovery: 'complete' },
    coverage, baselineRef, discoveryRef, completedAt, artifacts };
  return Buffer.from(yaml.stringify(run));
}

function finishRecords(state, startedAt, completedAt) {
  const started = { formatVersion: 1, attemptId: id, action: 'finish', status: 'started', startedAt, command: command() };
  const receipt = { formatVersion: 1, attemptId: id, runRef: state.facts.runRef, snapshotRef: state.facts.snapshotRef,
    action: 'finish', status: 'prepared-for-publication', completedAt, startedSha256: hash(encode(started)),
    records: {
      baseline: { id: state.facts.baselineRef, path: state.facts.baselinePath, sha256: hash(state.candidates.get('baseline.candidate.yaml')) },
      discovery: { id: state.facts.discoveryRef, path: state.facts.discoveryPath, sha256: hash(state.candidates.get('discovery.candidate.yaml')) },
    },
    note: 'The completed run manifest is the publication marker. The baseline draft stays unchanged.',
  };
  return new Map([[finishStartedName, encode(started)], [finishReceiptName, encode(receipt)]]);
}

function withLock(invoke) {
  try { mkdirSync(lockPath, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another publication owns the lock or cleanup is pending: ' + lockPath);
    throw error;
  }
  const lock = lstatSync(lockPath);
  let result;
  let failure;
  try { result = invoke(); } catch (error) { failure = error; }
  let cleanup;
  try {
    const current = lstatSync(lockPath, { throwIfNoEntry: false });
    assert(current?.isDirectory() && current.dev === lock.dev && current.ino === lock.ino, 'Lock identity changed.');
    rmdirSync(lockPath);
  } catch (error) {
    cleanup = 'Publication lock cleanup pending at ' + lockPath + ': ' + error.message;
  }
  if (failure) throw new Error(failure.message + (cleanup ? ' ' + cleanup : ''));
  if (cleanup) return { ...result, lockCleanup: 'pending', warning: cleanup };
  return result;
}

function publish(input) {
  return withLock(() => {
    const { state } = input;
    const tracked = new Map();
    const directories = [];
    const fixed = new Set();
    const phases = new Set();
    let stagedDiscovery;
    let publishedDiscovery = false;
    let nextRun;
    let phaseStarted = false;
    let committed = false;
    try {
      requireFreeTargets(state);
      checkInputs(input);
      const now = utc();
      const phase = finishRecords(state, now, now);
      for (const [name, bytes] of phase) {
        const path = join(attempt, name);
        phases.add(path);
        saveNew(path, bytes, tracked);
        if (name === finishStartedName) phaseStarted = true;
      }
      const baseline = state.candidates.get('baseline.candidate.yaml');
      const discovery = state.candidates.get('discovery.candidate.yaml');
      for (const [path, bytes] of [[state.facts.baselinePath, baseline], [state.facts.discoveryPath, discovery]]) {
        const absolute = join(work, path);
        ensureDirectory(dirname(dirname(absolute)), directories);
        ensureDirectory(dirname(absolute), directories);
        fixed.add(absolute);
        saveNew(absolute, bytes, tracked);
      }
      nextRun = completeManifest(input, phase, now);
      stagedDiscovery = saveNew(join(work, '.stage-6-discovery.next.yaml'), discovery, tracked);
      const stagedRun = saveNew(join(work, '.stage-6-run.next.yaml'), nextRun, tracked);
      checkInputs(input, { phase });
      assert(stillOwned(stagedDiscovery), 'Staged discovery changed.');
      assert(file(work, 'discovery.yaml').equals(state.drafts.get('discovery.yaml')), 'Working discovery changed during publication.');
      renameSync(stagedDiscovery.path, join(work, 'discovery.yaml'));
      publishedDiscovery = true;
      tracked.delete(stagedDiscovery.path);
      const placedDiscovery = { ...stagedDiscovery, path: join(work, 'discovery.yaml') };

      checkInputs(input, { checkDrafts: false, phase });
      for (const path of fixed) assert(stillOwned(tracked.get(path)), 'Fixed record changed during publication: ' + path);
      assert(stillOwned(placedDiscovery) && stillOwned(stagedRun), 'Published discovery or staged run changed.');
      requireWorkingDrafts(new Map([['baseline.yaml', baseline], ['run.yaml', state.drafts.get('run.yaml')]]));
      renameSync(stagedRun.path, join(work, 'run.yaml'));
      committed = true;
      return { ...state.validation, status: 'stage6-published', baselinePath: state.facts.baselinePath,
        discoveryPath: state.facts.discoveryPath, discoveryRef: state.facts.discoveryRef,
        writes: [...phase.keys(), state.facts.baselinePath, state.facts.discoveryPath, 'discovery.yaml', 'run.yaml'] };
    } catch (error) {
      const leftovers = [];
      try { committed ||= nextRun && file(work, 'run.yaml').equals(nextRun); } catch { /* Preserve an unreadable run. */ }
      if (!committed) {
        if (publishedDiscovery) {
          try {
            const placed = { ...stagedDiscovery, path: join(work, 'discovery.yaml') };
            if (stillOwned(placed)) {
              const rollback = saveNew(join(work, '.stage-6-discovery.next.yaml'), state.drafts.get('discovery.yaml'), tracked);
              if (stillOwned(placed) && stillOwned(rollback)) {
                renameSync(rollback.path, placed.path);
                tracked.delete(rollback.path);
              } else leftovers.push(placed.path);
            } else leftovers.push(placed.path);
          } catch { leftovers.push(join(work, 'discovery.yaml')); }
        }
        let unreferenced = false;
        try {
          unreferenced = file(work, 'run.yaml').equals(state.drafts.get('run.yaml')) &&
            file(work, 'discovery.yaml').equals(state.drafts.get('discovery.yaml'));
        } catch { /* Keep fixed records if a working draft cannot be checked. */ }
        for (const [path, record] of tracked) {
          if (phases.has(path)) continue;
          if (fixed.has(path) && !unreferenced) leftovers.push(path);
          else removeOwned(record, leftovers);
        }
        if (unreferenced) removeOwnedDirectories(directories, leftovers);
        if (phaseStarted) {
          try {
            saveNew(join(attempt, finishFailedName), encode({ formatVersion: 1, attemptId: id, action: 'finish', status: 'failed',
              command: command(), finishedAt: utc(), reason: error.message, leftovers }), new Map());
          } catch { leftovers.push(join(attempt, finishFailedName)); }
        }
      }
      const recovery = leftovers.length ? ' Check retained paths: ' + [...new Set(leftovers)].join(', ') + '.' : '';
      throw new Error('Stage 6 publication stopped: ' + error.message + '.' + recovery);
    }
  });
}

function verifyCompleted(input) {
  const { state, prepared, yaml } = input;
  const phase = new Map([[finishStartedName, saved(finishStartedName)], [finishReceiptName, saved(finishReceiptName)]]);
  const started = json(phase.get(finishStartedName));
  const receipt = json(phase.get(finishReceiptName));
  assert(started.formatVersion === 1 && started.attemptId === id && started.action === 'finish' && started.status === 'started' &&
    same(started.command.environment, environment) && receipt.formatVersion === 1 && receipt.attemptId === id &&
    receipt.runRef === state.facts.runRef && receipt.snapshotRef === state.facts.snapshotRef &&
    receipt.status === 'prepared-for-publication' && text(receipt.completedAt) && Number.isFinite(Date.parse(receipt.completedAt)) &&
    receipt.startedSha256 === hash(phase.get(finishStartedName)), 'Invalid Stage 6 publication receipt.');
  const baseline = state.candidates.get('baseline.candidate.yaml');
  const discovery = state.candidates.get('discovery.candidate.yaml');
  assert(same(receipt.records, {
    baseline: { id: state.facts.baselineRef, path: state.facts.baselinePath, sha256: hash(baseline) },
    discovery: { id: state.facts.discoveryRef, path: state.facts.discoveryPath, sha256: hash(discovery) },
  }), 'Fixed record receipt differs from the prepared result.');
  const expectedRun = completeManifest(input, phase, receipt.completedAt);
  requireWorkingDrafts(new Map([['run.yaml', expectedRun], ['baseline.yaml', baseline], ['discovery.yaml', discovery]]));
  assert(file(work, state.facts.baselinePath).equals(baseline) && file(work, state.facts.discoveryPath).equals(discovery),
    'Fixed records do not match the prepared result.');
  const run = yaml.parse(expectedRun.toString('utf8'));
  const registry = readRegistry(run, { permitFinal: true });
  checkInputs({ state, prepared }, { checkDrafts: false, phase });
  return { ...state.validation, status: 'stage6-completed-verified', registeredArtifactsVerified: registry.size,
    baselinePath: state.facts.baselinePath, discoveryPath: state.facts.discoveryPath,
    discoveryRef: state.facts.discoveryRef, completedAt: receipt.completedAt, writes: [] };
}

async function main() {
  if (action === 'preflight' || action === 'start') return await start();
  if (action === 'verify') {
    assert(!present(lockPath), 'Publication lock remains. Check ' + lockPath);
    for (const name of ['run', 'discovery'])
      assert(!present(join(work, '.stage-6-' + name + '.next.yaml')), 'Publication temporary file remains: ' + name);
  }
  const prepared = await loadPrepared({ completed: action === 'verify' });
  if (action === 'check') return { ...prepared.state.validation, status: 'stage6-prepared-verified', writes: [] };
  if (action === 'finish') return publish(prepared);
  return verifyCompleted(prepared);
}
try { console.log(JSON.stringify(await main(), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
