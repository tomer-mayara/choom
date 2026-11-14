import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync,
  readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { runLayout } from './run-layout.mjs';
import { readBaselineYaml, validateDiscoveryRecords } from './stage-6-records.mjs';

const [action, stage, reviewDirectory, ...extra] = process.argv.slice(2);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safe = value => text(value) && !isAbsolute(value) && !/[\\\u0000-\u001f\u007f]/.test(value) &&
  value.split('/').every(part => part && part !== '.' && part !== '..');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const exists = path => Boolean(lstatSync(path, { throwIfNoEntry: false }));
function directory(path) {
  assert(isAbsolute(path ?? '') && lstatSync(path).isDirectory() && realpathSync(path) === path,
    'Expected a canonical directory: ' + path);
  return path;
}
function read(root, name) {
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
function names(root, prefix = '') {
  return readdirSync(join(root, prefix)).sort().flatMap(name => {
    const relative = prefix ? prefix + '/' + name : name;
    assert(safe(relative), 'Invalid filename: ' + relative);
    const path = join(root, relative);
    if (lstatSync(path).isDirectory()) { directory(path); return names(root, relative); }
    assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical regular file: ' + path);
    return [relative];
  }).sort();
}
function verifyIndexed(root, item) {
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
const toolFiles = ['stage-4-5-publish.mjs', 'stage-6-records.mjs', 'record-format.md', 'run-layout.mjs'];
const draftFiles = ['run.yaml', 'baseline.yaml', 'discovery.yaml'];
const checkpoint = name => name.replace('.yaml', '.before.yaml');
const receiptName = 'publication.json';
const progressKey = stage === '4' ? 'componentRecovery' : 'remainingCode';
assert(['4', '5'].includes(stage) && extra.length === 0 &&
  ((['check', 'finish'].includes(action) && isAbsolute(reviewDirectory ?? '')) ||
    (action === 'verify' && reviewDirectory === undefined)), 'Use check STAGE REVIEW_DIR, finish STAGE REVIEW_DIR, or verify STAGE (4 or 5).');
const id = process.env['CHOOM_STAGE' + stage + '_ID'];
assert(new RegExp('^s' + stage + '-[a-z0-9]+(?:-[a-z0-9]+)*$').test(id ?? ''), 'Set the matching stage attempt ID.');
const work = directory(process.env.CHOOM_WORK);
const tools = directory(process.env.CHOOM_TOOLS);
runLayout(work, tools);
const source = directory(join(tools, 'docs/design/app-a'));
assert(fileURLToPath(import.meta.url) === join(source, toolFiles[0]), 'Use the publisher in the trusted checkout.');
const attempt = directory(join(directory(join(work, 'evidence')), id));
assert(process.env['CHOOM_STAGE' + stage] === attempt, 'Set the matching stage attempt directory.');
const require = createRequire(join(tools, 'package.json'));
const yamlPath = require.resolve('yaml');
assert(yamlPath.startsWith(join(tools, 'node_modules/yaml') + '/') && realpathSync(yamlPath) === yamlPath,
  'Use YAML from the trusted checkout.');
const yaml = require(yamlPath);
const { parse, stringify } = yaml;
const parseBytes = bytes => parse(bytes.toString('utf8'));
const json = bytes => JSON.parse(bytes.toString('utf8'));
const refFor = name => name === 'entry-analysis.yaml' ? id + '-entry-analysis' : id + '-file@' + encodeURIComponent(name);
const lock = join(work, '.app-a-publish.lock');

function verifiedInput() {
  const drafts = new Map(draftFiles.map(name => [name, read(attempt, checkpoint(name))]));
  const run = parseBytes(drafts.get('run.yaml'));
  const priorDiscovery = parseBytes(drafts.get('discovery.yaml'));
  const priorBaseline = readBaselineYaml(drafts.get('baseline.yaml'), yaml);
  assert(run?.formatVersion === 1 && run.mode === 'A' && run.status === 'in-progress' && run.snapshot?.root === 'snapshot' &&
    ['inventory', 'entryAnalysis', 'inspectionPriorities'].every(key => run.progress?.[key] === 'complete') &&
    run.progress.baselineRecovery === 'pending' && !Object.hasOwn(run.progress, progressKey) &&
    (stage === '4' || run.progress.componentRecovery === 'complete'), 'Unexpected pre-publication run state.');
  const artifacts = new Map();
  const paths = new Set();
  const put = (ref, path, bytes, sha256 = hash(bytes)) => {
    assert(text(ref) && !artifacts.has(ref) && safe(path) && !draftFiles.includes(path) && !paths.has(path) && digest(sha256),
      'Invalid or colliding artifact: ' + ref);
    assert(hash(bytes) === sha256, 'Registered artifact changed: ' + ref);
    artifacts.set(ref, { path, bytes, sha256 }); paths.add(path);
  };
  for (const [ref, item] of Object.entries(run.artifacts ?? {})) put(ref, item.path, read(work, item.path), item.sha256);
  const inventory = json(artifacts.get(run.snapshot.inventoryRef)?.bytes ?? Buffer.from('null'));
  assert(inventory?.formatVersion === 1 && inventory.snapshotId === run.snapshot.id && Array.isArray(inventory.files), 'Invalid inventory.');
  const snapshot = directory(join(work, 'snapshot'));
  const indexed = new Map();
  for (const item of inventory.files) {
    assert(safe(item.path) && item.kind === 'file' && !indexed.has(item.path) && digest(item.sha256) &&
      Number.isSafeInteger(item.bytes) && item.bytes >= 0, 'This profile requires unique regular inventory files.');
    verifyIndexed(snapshot, item);
    indexed.set(item.path, item);
  }
  assert(same(names(snapshot), [...indexed.keys()].sort()), 'Snapshot file set differs from its inventory.');
  const attemptFiles = new Map(names(attempt).map(name => [name, read(attempt, name)]));
  const get = name => { assert(attemptFiles.has(name), 'Missing attempt file: ' + name); return attemptFiles.get(name); };
  const handoff = json(get('handoff.json'));
  assert(handoff.attemptId === id && handoff.runRef === run.id && handoff.snapshotRef === run.snapshot.id &&
    handoff.work === work && handoff.tools === tools, 'Attempt identities changed.');
  for (const [name, bytes] of drafts) assert(handoff.checkpointDigests?.[checkpoint(name)] === hash(bytes), 'Checkpoint digest changed: ' + name);
  for (const name of toolFiles) assert(handoff.toolInputDigests?.[name] === hash(get(name)) && get(name).equals(read(source, name)),
    'Publication tools changed or were not frozen at start: ' + name + '. Use a new attempt.');
  const required = stage === '4' ? ['start', 'toolchain', 'run', 'collect'] : ['start', 'collect'];
  const requiredOutputs = {
    start: [...draftFiles.map(checkpoint), ...toolFiles, 'handoff.json', ...(stage === '4' ? ['graph-profile.json'] : ['scope.json'])],
    toolchain: ['toolchain-selection.json'], run: ['graph-results.json', 'graph-run.json'],
    collect: stage === '4' ? ['source-sites.json', 'source-excerpts.json', 'review-prompt.md', 'artifact-map.json'] :
      ['remaining-units.json', 'inspection-coverage.json', 'source-candidates.json', 'source-excerpts.json', 'review-prompt.md', 'artifact-map.json'],
  };
  const phases = [...new Set([...required, ...[...attemptFiles.keys()].flatMap(name => /^operator-(excerpt-[0-9]+)\.started\.json$/.exec(name)?.slice(1) ?? [])])];
  for (const phase of phases) {
    const receipt = json(get('operator-' + phase + '.json'));
    const started = json(get('operator-' + phase + '.started.json'));
    assert(receipt.attemptId === id && receipt.phase === phase &&
      receipt.startedAt === started.startedAt && same(receipt.command, started.command),
    'Collection or excerpt identity changed: ' + phase);
    if (phase.startsWith('excerpt-') && receipt.status === 'failed' && receipt.exitCode !== 0) {
      assert(!attemptFiles.has(phase + '.json') && Object.keys(receipt.digests ?? {}).length === 0,
        'A failed excerpt has partial output. Preserve it and use a fresh attempt: ' + phase);
    } else {
      assert(receipt.status === 'completed' && receipt.exitCode === 0 && object(receipt.digests),
        'Required collection or excerpt did not complete: ' + phase + '. Preserve it and use a fresh attempt.');
      assert((requiredOutputs[phase] ?? [phase + '.json']).every(name => Object.hasOwn(receipt.digests, name)),
        'Required output was not recorded: ' + phase);
    }
    for (const [name, sha256] of Object.entries({ ...receipt.digests, ...receipt.logDigests }))
      assert(digest(sha256) && hash(get(name)) === sha256, 'Collection output changed: ' + name);
  }
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

function reviewMetadata(packet, state) {
  const scope = json(packet.get('llm/review-scope.json'));
  const call = parseBytes(packet.get('llm/analysis-call.yaml'));
  assert(scope.formatVersion === 1 && scope.runRef === state.run.id && scope.snapshotRef === state.run.snapshot.id &&
    scope.attemptId === id && Array.isArray(scope.suppliedArtifactRefs) && scope.suppliedArtifactRefs.length &&
    scope.suppliedArtifactRefs.every(ref => text(ref) && state.artifacts.has(ref.split('#')[0])) &&
    Array.isArray(scope.limits) && scope.limits.length && scope.limits.every(text), 'Invalid LLM review scope.');
  assert(text(call.provider) && text(call.model) && text(call.date) && (object(call.settings) || call.settings === 'unknown'),
    'Record exposed LLM metadata; use unknown for unavailable values.');
  const response = packet.get('llm/analysis-response.md').toString('utf8');
  assert(text(packet.get('llm/analysis-prompt.md').toString('utf8')) &&
    recordFiles.every(name => response.includes(packet.get(name).toString('utf8').trimEnd())),
  'Save the complete prompt and response, including the exact five candidate records.');
}

function candidate(state, packet) {
  const { run, priorDiscovery, priorBaseline, artifacts, put, inventory, readSource } = state;
  for (const [name, bytes] of [...state.attemptFiles, ...packet]) {
    if (name === receiptName || name.startsWith('.publication-')) continue;
    put(refFor(name), 'evidence/' + id + '/' + name, bytes);
  }
  const baseline = readBaselineYaml(packet.get('baseline.proposed.yaml'), yaml);
  const discovery = parseBytes(packet.get('discovery.proposed.yaml'));
  const entry = parseBytes(packet.get('entry-analysis.yaml'));
  assert(baseline.id === priorBaseline.id && baseline.parentId === priorBaseline.parentId &&
    discovery.entryAnalysisRef === id + '-entry-analysis' && entry.previousEntryAnalysisRef === priorDiscovery.entryAnalysisRef &&
    discovery.codeMappingRef === refFor('code-mapping.json') && discovery.resourceAccessRef === refFor('resource-access.json') &&
    discovery.dependenciesRef === (stage === '4' ? refFor('graph-results.json') : priorDiscovery.dependenciesRef),
  'Candidate identities or selected facts differ from this stage.');
  const previous = parseBytes(artifacts.get(priorDiscovery.entryAnalysisRef).bytes);
  assert(entry.planRef === previous.planRef && entry.knipRunsRef === previous.knipRunsRef &&
    Array.isArray(entry.candidates) && same(entry.candidates.slice(0, previous.candidates.length), previous.candidates) &&
    same(entry.inspectionPriorities, previous.inspectionPriorities),
  'Preserve previous file candidates, Knip inputs and inspection priorities. Revisit the affected stage for changes.');
  const graph = json(artifacts.get(discovery.dependenciesRef).bytes);
  const roots = new Set(graph.contexts.flatMap(context => context.roots.map(root => root.path)));
  for (const added of entry.candidates.slice(previous.candidates.length))
    assert(added.path === null || !/\.(?:[cm]?[jt]s|[jt]sx)$/.test(added.path) || roots.has(added.path),
      'New JavaScript/TypeScript entry is outside the saved root set: ' + added.id + '. Revisit entry and graph analysis.');
  if (stage === '5') for (const item of priorBaseline.components)
    assert(baseline.components.some(next => next.id === item.id), 'Keep continuing component IDs during remaining-code review.');
  reviewMetadata(packet, state);
  const counts = validateDiscoveryRecords({ run, baseline, discovery, artifacts, inventory, parse, readSource,
    reservedIds: [refFor(receiptName)] });
  return { counts, baseline, discovery };
}

function readPacket(root) {
  assert(same(names(root), [...packetFiles].sort()), 'Expected exactly the nine review packet files from record-format.md.');
  return new Map(packetFiles.map(name => [name, read(root, name)]));
}
function expectedRun(state, receipt) {
  const artifacts = Object.fromEntries([...state.artifacts].map(([ref, { path, sha256 }]) => [ref, { path, sha256 }]));
  artifacts[refFor(receiptName)] = { path: 'evidence/' + id + '/' + receiptName, sha256: hash(receipt) };
  return Buffer.from(stringify({ ...state.run, progress: { ...state.run.progress, [progressKey]: 'complete' }, artifacts }));
}
function checkCurrent(drafts) {
  for (const [name, bytes] of drafts) assert(read(work, name).equals(bytes), 'Working draft changed: ' + name);
}
function sameFiles(root, expected) {
  assert(same(names(root), [...expected.keys()].sort()), 'File set changed during publication: ' + root);
  for (const [name, bytes] of expected) assert(read(root, name).equals(bytes), 'File changed during publication: ' + name);
}
function verify() {
  assert(!exists(lock), 'Publication lock remains: ' + lock);
  const state = verifiedInput();
  const all = state.attemptFiles;
  const receiptBytes = all.get(receiptName);
  assert(receiptBytes, 'Missing publication receipt.');
  const receipt = json(receiptBytes);
  assert(receipt.formatVersion === 1 && receipt.attemptId === id && receipt.runRef === state.run.id &&
    receipt.snapshotRef === state.run.snapshot.id && receipt.stage === Number(stage) && receipt.status === 'prepared-for-publication',
  'Invalid publication receipt.');
  const packet = new Map(packetFiles.map(name => [name, all.get(name)]));
  assert(packetFiles.every(name => Buffer.isBuffer(packet.get(name))), 'Missing saved review packet.');
  state.attemptFiles = new Map([...all].filter(([name]) => !packetFiles.includes(name) && name !== receiptName));
  assert(same(receipt.inputDigests, Object.fromEntries([...state.attemptFiles].map(([name, bytes]) => [name, hash(bytes)]))) &&
    same(receipt.packetDigests, Object.fromEntries([...packet].map(([name, bytes]) => [name, hash(bytes)]))), 'Publication evidence changed.');
  const result = candidate(state, packet);
  checkCurrent(new Map([['run.yaml', expectedRun(state, receiptBytes)],
    ['baseline.yaml', packet.get('baseline.proposed.yaml')], ['discovery.yaml', packet.get('discovery.proposed.yaml')]]));
  return { status: 'stage' + stage + '-publication-verified', ...result.counts, writes: [] };
}

function publish(state, packet, result, review) {
  assert(!exists(lock), 'Another publication owns the lock or cleanup is pending: ' + lock);
  mkdirSync(lock, { mode: 0o700 });
  const lockStat = lstatSync(lock);
  const placed = new Map();
  const temporary = new Map();
  let committed = false;
  let failure;
  let output;
  try {
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
    const outputs = new Map([['baseline.yaml', packet.get('baseline.proposed.yaml')],
      ['discovery.yaml', packet.get('discovery.proposed.yaml')], ['run.yaml', expectedRun(state, receipt)]]);
    for (const [name, bytes] of outputs) {
      const path = '.publication-' + id + '-' + name;
      writeFileSync(join(work, path), bytes, { flag: 'wx' }); temporary.set(path, bytes);
    }
    for (const [ref, item] of state.artifacts) {
      if (item.path.startsWith('evidence/' + id + '/')) continue;
      assert(read(work, item.path).equals(item.bytes), 'Registered input changed before publication: ' + ref);
    }
    sameFiles(attempt, new Map([...state.attemptFiles, ...packet, [receiptName, receipt]]));
    state.verifySnapshot();
    checkCurrent(state.drafts);
    for (const [name, bytes] of outputs) {
      const path = '.publication-' + id + '-' + name;
      assert(read(work, path).equals(bytes), 'Staged output changed: ' + name);
      checkCurrent(new Map([...state.drafts].filter(([key]) => !placed.has(key))));
      for (const [key, value] of placed) assert(read(work, key).equals(value), 'Published output changed: ' + key);
      renameSync(join(work, path), join(work, name)); temporary.delete(path); placed.set(name, bytes);
    }
    committed = true;
    output = { status: 'stage' + stage + '-published', ...result.counts,
      writes: [...packetFiles, receiptName, ...outputs.keys()] };
  } catch (error) {
    failure = error;
    if (!committed) {
      const leftovers = [];
      for (const [name, bytes] of [...placed].reverse()) {
        try {
          assert(read(work, name).equals(bytes), 'Changed output');
          const rollback = '.publication-' + id + '-rollback-' + name;
          writeFileSync(join(work, rollback), state.drafts.get(name), { flag: 'wx' });
          renameSync(join(work, rollback), join(work, name));
        } catch { leftovers.push(name); }
      }
      for (const [name, bytes] of temporary) {
        try { if (read(work, name).equals(bytes)) unlinkSync(join(work, name)); else leftovers.push(name); }
        catch { leftovers.push(name); }
      }
      failure = new Error(error.message + ' Keep this attempt unchanged; use a fresh attempt after resolving the cause.' +
        (leftovers.length ? ' Inspect retained paths: ' + leftovers.join(', ') : ''));
    }
  }
  try {
    const current = lstatSync(lock);
    assert(current.dev === lockStat.dev && current.ino === lockStat.ino, 'Lock changed.'); rmdirSync(lock);
  } catch (error) {
    if (failure) failure = new Error(failure.message + ' Lock cleanup pending: ' + lock);
    else output = { ...output, lockCleanup: 'pending', warning: 'Inspect ' + lock + ': ' + error.message };
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
} catch (error) { console.error(error.message); process.exitCode = 1; }
