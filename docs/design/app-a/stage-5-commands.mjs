import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readSync, realpathSync, writeFileSync, writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { runLayout } from './run-layout.mjs';

const self = fileURLToPath(import.meta.url);
const [action, ...args] = process.argv.slice(2);
const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE5, CHOOM_STAGE5_ID: id } = process.env;
const helper = 'stage-5-commands.mjs';
const cookbook = 'step-5-cookbook.md';
const queryName = 'stage-5-query.mjs';
const toolFiles = [helper, queryName, cookbook, 'stage-4-5-publish.mjs', 'stage-6-records.mjs', 'record-format.md',
  'run-layout.mjs'];
const draftNames = ['run.yaml', 'discovery.yaml', 'baseline.yaml'];
const checkpoint = name => name.replace('.yaml', '.before.yaml');
const startOutputs = [...draftNames.map(checkpoint), ...toolFiles, 'handoff.json', 'scope.json'];
const collectOutputs = ['remaining-units.json', 'inspection-coverage.json', 'source-candidates.json',
  'source-excerpts.json', 'review-prompt.md', 'artifact-map.json'];
const commandLog = 'commands.md';
const commandHeader = '# Stage 5 commands\n\n' +
  'The commands below use saved inputs. A content read by a tool does not record LLM inspection.\n';
const sourceTool = name => join(CHOOM_TOOLS, 'docs/design/app-a', name);
const artifactId = name => id + '-file@' + encodeURIComponent(name);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const exists = path => Boolean(lstatSync(path, { throwIfNoEntry: false }));
const utc = () => new Date().toISOString();
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function safe(name) {
  return text(name) && !isAbsolute(name) && !/[\\\u0000-\u001f\u007f]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}
function directory(path) {
  assert(isAbsolute(path ?? '') && lstatSync(path).isDirectory() && realpathSync(path) === path,
    'Expected a canonical directory: ' + path);
  return path;
}
function openFile(path) {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical regular file: ' + path);
  return openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
}
function read(path) {
  const fd = openFile(path);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular file: ' + path);
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
function readIndexed(snapshot, file, maxBytes) {
  const path = join(snapshot, file.path);
  if (maxBytes !== undefined) assert(file.bytes <= maxBytes, 'Indexed input exceeds byte limit: ' + file.path);
  const fd = openFile(path);
  try {
    const before = fstatSync(fd);
    assert(before.isFile() && before.size === file.bytes, 'Indexed file type or size changed: ' + file.path);
    let checksum;
    let bytes;
    if (maxBytes === undefined) {
      const stream = createHash('sha256');
      const block = Buffer.allocUnsafe(64 * 1024);
      let count = 0;
      for (let length; (length = readSync(fd, block, 0, block.length, null)) > 0;) {
        stream.update(block.subarray(0, length));
        count += length;
      }
      assert(count === file.bytes, 'Indexed file size changed while hashing: ' + file.path);
      checksum = stream.digest('hex');
    } else {
      bytes = Buffer.allocUnsafe(file.bytes);
      let offset = 0;
      while (offset < bytes.length) {
        const length = readSync(fd, bytes, offset, bytes.length - offset, null);
        assert(length > 0, 'Indexed file shrank while reading: ' + file.path);
        offset += length;
      }
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

assert((['start', 'collect'].includes(action) && args.length === 0) || (action === 'excerpt' && args.length === 3),
  'Use start, collect, or excerpt PATH FIRST LAST.');
assert(/^s5-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id ?? ''), 'Set CHOOM_STAGE5_ID to an s5-... ID.');
const work = directory(CHOOM_WORK);
const tools = directory(CHOOM_TOOLS);
runLayout(work, tools);
const attempt = join(directory(join(work, 'evidence')), id);
assert(CHOOM_STAGE5 === attempt, 'Set CHOOM_STAGE5 to the matching attempt directory.');
assert(self === sourceTool(helper) && realpathSync(self) === self,
  'Use the Stage 5 command helper in the trusted checkout.');

const saved = name => {
  assert(safe(name), 'Invalid saved attempt path: ' + name);
  return read(join(attempt, name));
};
const save = (name, bytes) => writeFileSync(join(attempt, name), bytes, { flag: 'wx' });
const encode = value => JSON.stringify(value, null, 2) + '\n';
const json = name => JSON.parse(saved(name));
const digests = names => Object.fromEntries(names.map(name => [name, hash(saved(name))]));
const logNames = prefix => ['.started.json', '.stdout.txt', '.stderr.txt'].map(suffix => prefix + suffix);
const require = createRequire(join(tools, 'package.json'));

function loadTools(pinned) {
  const modules = join(tools, 'node_modules') + '/';
  const packages = ['yaml', 'typescript', 'yaml/package.json'];
  const paths = packages.map(name => {
    const path = require.resolve(name);
    assert(path.startsWith(modules + name.split('/')[0] + '/') && realpathSync(path) === path,
      'Use the trusted installation of ' + name + '.');
    return path;
  });
  if (pinned) {
    assert(pinned.node === process.version && object(pinned.modules), 'Trusted Node or parser inputs changed since start.');
    for (const [path, sha256] of Object.entries(pinned.modules)) {
      assert(safe(path) && digest(sha256) && hash(read(join(modules, path))) === sha256,
        'Trusted parser module changed since start: ' + path);
    }
    assert(paths.every(path => Object.hasOwn(pinned.modules, path.slice(modules.length))),
      'Trusted parser resolution changed since start.');
  }
  const [{ parse }, ts, { version: yaml }] = paths.map(path => require(path));
  const loaded = Object.keys(require.cache).filter(path => path.startsWith(modules)).sort();
  const versions = { node: process.version, yaml, typescript: ts.version,
    modules: Object.fromEntries(loaded.map(path => [path.slice(modules.length), hash(read(path))])) };
  if (pinned) assert(isDeepStrictEqual(versions, pinned), 'Trusted parser modules changed since start.');
  return { parse, ts, versions };
}

async function loadQuery(bytes) {
  // Import the verified bytes without reopening the saved path.
  return await import('data:text/javascript;base64,' + bytes.toString('base64'));
}

function readState(parse) {
  const inputs = Object.fromEntries(draftNames.map(name => [name, read(join(work, name))]));
  const [run, discovery, baseline] = draftNames.map(name => parse(inputs[name].toString('utf8')));
  assert(run?.formatVersion === 1 && run.mode === 'A' && run.status === 'in-progress' &&
    ['inventory', 'entryAnalysis', 'inspectionPriorities', 'componentRecovery'].every(key => run.progress?.[key] === 'complete') &&
    run.progress.baselineRecovery === 'pending' && !Object.hasOwn(run.progress, 'remainingCode') &&
    run.snapshot?.root === 'snapshot' && text(run.snapshot.id) && object(run.artifacts),
  'Expected finalized Stage 4 and pending baseline recovery.');
  assert(discovery?.formatVersion === 1 && discovery.kind === 'architecture-discovery' &&
    discovery.runRef === run.id && !Object.hasOwn(discovery, 'baselineRef') &&
    text(discovery.overview?.text) && Array.isArray(discovery.inspectedPaths),
  'Expected published Stage 4 discovery without a fixed baseline.');
  assert([1, 2].includes(baseline?.formatVersion) && text(baseline.id) && baseline.parentId === null &&
    ['components', 'interfaces', 'resources', 'rules'].every(key => Array.isArray(baseline[key])) && baseline.components.length > 0,
  'Expected the proposed working baseline.');
  const header = { formatVersion: 1, attemptId: id, runRef: run.id, snapshotRef: run.snapshot.id };
  const artifacts = new Map();
  const registeredPaths = new Set();
  for (const [ref, record] of Object.entries(run.artifacts)) {
    assert(safe(record?.path) && digest(record.sha256) && !draftNames.includes(record.path) &&
      !record.path.startsWith('evidence/' + id + '/') && !registeredPaths.has(record.path), 'Invalid registered artifact: ' + ref);
    const bytes = read(join(work, record.path));
    assert(hash(bytes) === record.sha256, 'Registered artifact changed: ' + ref);
    artifacts.set(ref, bytes);
    registeredPaths.add(record.path);
  }
  function artifact(ref) {
    assert(artifacts.has(ref), 'Missing registered artifact: ' + ref);
    return artifacts.get(ref);
  }
  const selected = discovery.entryAnalysisRef;
  const stage4 = /^s4-[a-z0-9]+(?:-[a-z0-9]+)*(?=-entry-analysis$)/.exec(selected ?? '')?.[0];
  assert(stage4, 'Expected the selected Stage 4 entry analysis.');
  const stage4Ref = name => stage4 + '-file@' + encodeURIComponent(name);
  for (const [draft, proposed] of [['baseline.yaml', 'baseline.proposed.yaml'], ['discovery.yaml', 'discovery.proposed.yaml']])
    assert(inputs[draft].equals(artifact(stage4Ref(proposed))), 'Working draft differs from the published proposal: ' + draft);
  const mappingRef = discovery.codeMappingRef;
  const graphRef = discovery.dependenciesRef;
  const resourceAccessRef = discovery.resourceAccessRef;
  const sourceSitesRef = stage4Ref('source-sites.json');
  assert(mappingRef === stage4Ref('code-mapping.json') && graphRef === stage4Ref('graph-results.json') &&
    resourceAccessRef === stage4Ref('resource-access.json'), 'Stage 4 fact references do not match the selected attempt.');
  const inventory = JSON.parse(artifact(run.snapshot.inventoryRef));
  assert(inventory.formatVersion === 1 && inventory.snapshotId === header.snapshotRef && Array.isArray(inventory.files),
    'Inventory snapshot mismatch.');
  const snapshot = directory(join(work, run.snapshot.root));
  const indexed = new Map();
  for (const file of inventory.files) {
    assert(safe(file?.path) && file.kind === 'file' && digest(file.sha256) && Number.isSafeInteger(file.bytes) &&
      file.bytes >= 0 && !indexed.has(file.path), 'Expected unique indexed regular files.');
    readIndexed(snapshot, file);
    indexed.set(file.path, file);
  }
  const [mapping, graph, resourceAccess, sourceSites] = [mappingRef, graphRef, resourceAccessRef, sourceSitesRef]
    .map(ref => JSON.parse(artifact(ref)));
  assert([mapping, graph, resourceAccess, sourceSites].every(record =>
    record.formatVersion === 1 && record.snapshotRef === header.snapshotRef), 'A Stage 4 fact uses a different snapshot.');
  assert(mapping.kind === 'code-mapping' && mapping.scope?.inventoryRef === run.snapshot.inventoryRef &&
    mapping.scope?.unitKind === 'file' && Array.isArray(mapping.units) && mapping.units.length === indexed.size,
  'Expected a complete file mapping for the saved inventory.');
  const componentIds = new Set(baseline.components.map(item => item.id));
  assert(componentIds.size === baseline.components.length && [...componentIds].every(text), 'Invalid proposed component IDs.');
  const mapped = new Set();
  for (const unit of mapping.units) {
    assert(unit && indexed.get(unit.path)?.sha256 === unit.sha256 && !mapped.has(unit.path) &&
      Array.isArray(unit.roles) && (unit.owner === null || componentIds.has(unit.owner)), 'Invalid mapped file: ' + unit?.path);
    mapped.add(unit.path);
  }
  assert(Array.isArray(graph.contexts) && graph.contexts.length > 0 &&
    new Set(graph.contexts.map(context => context.id)).size === graph.contexts.length &&
    graph.contexts.every(context => text(context.id) && Array.isArray(context.scanFiles) && Array.isArray(context.edges)) &&
    Array.isArray(sourceSites.sites) && sourceSites.sites.every(site => indexed.get(site.path)?.sha256 === site.sha256) &&
    resourceAccess.kind === 'resource-observations' && Array.isArray(resourceAccess.observations), 'Invalid Stage 4 graph or source facts.');
  const entryChain = [];
  const seen = new Set();
  for (let ref = selected; ref !== undefined;) {
    assert(text(ref) && !seen.has(ref), 'Invalid or cyclic entry-analysis history.');
    seen.add(ref);
    const analysis = parse(artifact(ref).toString('utf8'));
    assert(analysis?.formatVersion === 1 && analysis.kind === 'entry-analysis' && analysis.snapshotRef === header.snapshotRef &&
      analysis.llmReview === 'recorded' && Array.isArray(analysis.candidates) && Array.isArray(analysis.reviewedFiles),
    'Invalid saved entry analysis: ' + ref);
    entryChain.push({ ref, analysis });
    ref = analysis.previousEntryAnalysisRef;
  }
  const entry = entryChain[0].analysis;
  assert(entry.reachability?.dependenciesRef === graphRef && Array.isArray(entry.behaviorEntries) &&
    isDeepStrictEqual(entry.questions, discovery.questions) && isDeepStrictEqual(entry.gaps, discovery.gaps),
  'Selected entry analysis differs from the published Stage 4 discovery.');
  artifact(entry.planRef);
  artifact(entry.knipRunsRef);
  const { dev, ino } = lstatSync(snapshot);
  const facts = {
    ...header, work, tools, snapshot: { path: snapshot, dev, ino },
    inventoryRef: run.snapshot.inventoryRef, inventorySha256: hash(artifact(run.snapshot.inventoryRef)),
    mappingRef, graphRef, resourceAccessRef, sourceSitesRef, entryAnalysisRef: selected,
    entryAnalysisHistory: entryChain.map(item => item.ref), planRef: entry.planRef, knipRunsRef: entry.knipRunsRef,
    indexedRegularFiles: indexed.size, registeredArtifacts: artifacts.size,
    registeredArtifactDigests: Object.fromEntries(Object.entries(run.artifacts).map(([ref, record]) => [ref, record.sha256])),
    checkpointDigests: Object.fromEntries(draftNames.map(name => [checkpoint(name), hash(inputs[name])])),
  };
  return { header, facts, inputs, indexed, mapping, mappingRef, graph, graphRef, resourceAccessRef, sourceSites, sourceSitesRef,
    entryChain, readIndexed: (path, maxBytes) => {
      assert(indexed.has(path), 'File is outside the inventory: ' + path);
      return readIndexed(snapshot, indexed.get(path), maxBytes);
    } };
}

function requireCompleted(phase, outputs) {
  const prefix = 'operator-' + phase;
  const receipt = json(prefix + '.json');
  const started = json(prefix + '.started.json');
  const { status, exitCode, finishedAt, digests: outputDigests, logDigests, ...record } = receipt;
  assert(status === 'completed' && exitCode === 0 && text(finishedAt) &&
    started.formatVersion === 1 && started.attemptId === id && started.phase === phase &&
    started.action === phase && isDeepStrictEqual(record, started) &&
    isDeepStrictEqual(outputDigests, digests(outputs)) && isDeepStrictEqual(logDigests, digests(logNames(prefix))),
  'Incomplete or changed ' + phase + ' evidence.');
}

function reviewPrompt(state) {
  const body = saved(cookbook).toString('utf8').replaceAll('\r\n', '\n');
  const blocks = [...body.matchAll(/^<!-- stage5-review-prompt:start -->\n\x60\x60\x60text\n([\s\S]*?)^\x60\x60\x60\n<!-- stage5-review-prompt:end -->$/gm)];
  assert(blocks.length === 1, 'Expected one review prompt in the frozen Stage 5 cookbook.');
  const tokens = {
    WORK: work, ATTEMPT: attempt, ID: id, ENTRY_ANALYSIS_REF: state.facts.entryAnalysisRef,
    MAPPING_REF: state.mappingRef, DEPENDENCIES_REF: state.graphRef, RESOURCE_ACCESS_REF: state.resourceAccessRef,
  };
  const prompt = blocks[0][1].replace(/\{\{([^{}\n]+)\}\}/g, (_, token) => {
    assert(Object.hasOwn(tokens, token), 'Unknown review prompt token: ' + token);
    return tokens[token];
  });
  assert(!prompt.includes('{{'), 'Unresolved token in review prompt.');
  return prompt;
}

function reserve() {
  const command = { args: [process.execPath, self, action, ...args], cwd: process.cwd(),
    environment: { CHOOM_WORK: work, CHOOM_TOOLS: tools, CHOOM_STAGE5: attempt, CHOOM_STAGE5_ID: id } };
  for (let index = 1; ; index++) {
    const phase = action === 'excerpt' ? 'excerpt-' + String(index).padStart(3, '0') : action;
    const prefix = 'operator-' + phase;
    const started = { formatVersion: 1, attemptId: id, action, phase, command, startedAt: utc() };
    try {
      save(prefix + '.started.json', encode(started));
      return { phase, prefix, started };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (action === 'excerpt') continue;
      throw new Error('This action was already started. Keep the attempt unchanged and use a new ID.');
    }
  }
}
function logCommand(entry) {
  const path = join(attempt, commandLog);
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical command log.');
  const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular command log.');
    const bytes = Buffer.from('\n\x60\x60\x60json\n' + JSON.stringify(entry) + '\n\x60\x60\x60\n');
    assert(writeSync(fd, bytes) === bytes.length, 'Incomplete command log write.');
  } finally { closeSync(fd); }
}

async function main() {
  let toolchain;
  let query;
  let state;
  let frozenTools;
  if (action === 'start') {
    assert(!exists(attempt), 'Start with a new attempt ID.');
    frozenTools = Object.fromEntries(toolFiles.map(name => [name, read(sourceTool(name))]));
    toolchain = loadTools();
    query = await loadQuery(frozenTools[queryName]);
    state = readState(toolchain.parse);
    mkdirSync(attempt);
    save(commandLog, commandHeader);
  } else directory(attempt);

  const { phase, prefix, started } = reserve();
  const outputs = [];
  function output(name, bytes) {
    save(name, bytes);
    outputs.push(name);
  }
  let message = '';
  let errorMessage = null;
  try {
    if (action === 'start') {
      for (const name of draftNames) output(checkpoint(name), state.inputs[name]);
      for (const [name, bytes] of Object.entries(frozenTools)) output(name, bytes);
      output('scope.json', encode(query.scopeFor(state)));
      output('handoff.json', encode({
        ...state.facts, versions: toolchain.versions, toolInputDigests: digests(toolFiles),
        scopeSha256: hash(saved('scope.json')), initialCommandsSha256: hash(commandHeader),
      }));
      message = `Saved ${id} for ${state.facts.snapshotRef}. Verified ${state.facts.registeredArtifacts} registered artifacts and ${state.facts.indexedRegularFiles} indexed file digests.`;
    } else {
      requireCompleted('start', startOutputs);
      const handoff = json('handoff.json');
      const savedTools = Object.fromEntries(toolFiles.map(name => [name, saved(name)]));
      assert(isDeepStrictEqual(handoff.toolInputDigests, Object.fromEntries(toolFiles.map(name => [name, hash(savedTools[name])]))) &&
        handoff.scopeSha256 === hash(saved('scope.json')) &&
        hash(saved(commandLog).subarray(0, Buffer.byteLength(commandHeader))) === handoff.initialCommandsSha256,
      'Frozen tools, scope or command log changed since start.');
      for (const name of [helper, queryName])
        assert(savedTools[name].equals(read(sourceTool(name))), 'Trusted implementation changed since start: ' + name);
      assert(object(handoff.versions), 'Missing pinned parser versions.');
      toolchain = loadTools(handoff.versions);
      state = readState(toolchain.parse);
      assert(Object.entries(state.facts).every(([key, value]) => isDeepStrictEqual(handoff[key], value)),
        'Work, snapshot, checkpoints or registered inputs changed since start.');
      query = await loadQuery(savedTools[queryName]);
      for (const name of draftNames)
        assert(state.inputs[name].equals(saved(checkpoint(name))), 'Working draft changed: ' + name);
      if (action === 'collect') {
        assert(collectOutputs.every(name => !exists(join(attempt, name))), 'Collect output already exists. Use a new attempt.');
        const results = query.collectEvidence(state, json('scope.json'), toolchain.ts);
        const prompt = reviewPrompt(state);
        for (const [name, value] of Object.entries(results)) output(name, encode(value));
        output('review-prompt.md', prompt);
        const known = [...startOutputs, 'operator-start.json', ...logNames('operator-start'), prefix + '.started.json', ...outputs];
        output('artifact-map.json', encode({
          ...state.header, status: 'proposed',
          limits: ['IDs proposed for later registration. The map excludes itself, the append-only log, and later files.'],
          artifacts: Object.fromEntries(known.map(name => [
            artifactId(name), { path: 'evidence/' + id + '/' + name, sha256: hash(saved(name)) },
          ])),
        }));
        message = `Saved ${results['remaining-units.json'].units.length} owner-null units, ${results['inspection-coverage.json'].units.length} coverage records, ${results['source-candidates.json'].candidates.length} syntax candidates and ${results['source-excerpts.json'].excerpts.length} excerpts.`;
      } else {
        requireCompleted('collect', collectOutputs);
        const [path, first, last] = args;
        assert(safe(path) && [first, last].every(value => /^[1-9][0-9]*$/.test(value)), 'Use excerpt PATH FIRST LAST with positive line numbers.');
        const name = phase + '.json';
        output(name, encode({ ...state.header, id: id + '-source-' + phase, ...query.excerpt(state, path, Number(first), Number(last)) }));
        message = `Saved ${artifactId(name)} at ${join(attempt, name)} (SHA-256 ${hash(saved(name))}).`;
      }
    }
  } catch (error) {
    errorMessage = String(error.message ?? error).slice(0, 500);
  }
  const finishedAt = utc();
  const outcome = () => ({ status: errorMessage ? 'failed' : 'completed', exitCode: errorMessage ? 1 : 0 });
  try { logCommand({ ...started, ...outcome(), finishedAt }); }
  catch (error) { errorMessage = [errorMessage, String(error.message ?? error)].filter(Boolean).join(' | '); }
  save(prefix + '.stdout.txt', message ? message + '\n' : '');
  save(prefix + '.stderr.txt', errorMessage ? errorMessage + '\n' : '');
  save(prefix + '.json', encode({ ...started, ...outcome(), finishedAt,
    digests: digests(outputs), logDigests: digests(logNames(prefix)) }));
  process.exitCode = outcome().exitCode;
  if (errorMessage) console.error(errorMessage);
  else console.log(message);
}

try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
