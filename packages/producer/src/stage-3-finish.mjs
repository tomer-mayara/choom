import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.length > 0 && value.every(text);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const own = (value, key) => Object.hasOwn(value, key);
const draftNames = ['run', 'discovery', 'baseline'];
const toolFiles = ['stage-3-commands.mjs', 'stage-3-finish.mjs', 'step-3-cookbook.md'];
const checkpoints = draftNames.map(name => name + '.before.yaml');
const collectFiles = ['loading-search.json', 'symbol-mentions.json', 'source-excerpts.json',
  'review-prompt.md', 'artifact-map.json'];
const reviewFiles = ['entry-analysis.yaml', 'llm/analysis-prompt.md', 'llm/analysis-response.md',
  'llm/analysis-call.yaml', 'llm/review-scope.json'];
const issueKinds = ['questions', 'gaps'];
const origins = ['package-field', 'script', 'convention', 'source', 'inference', 'unknown'];

function exact(value, keys, label) {
  assert(object(value) && Object.keys(value).length === keys.length && keys.every(key => own(value, key)),
    'Invalid ' + label + ' fields.');
}

function savedPath(root, name) {
  assert(text(name) && !isAbsolute(name) && !/[\\\0\r\n]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid saved path: ' + name);
  return join(root, name);
}

function file(root, name) {
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

function directory(path) {
  assert(lstatSync(path).isDirectory() && realpathSync(path) === path, 'Expected a real directory: ' + path);
  return path;
}

function utf8(bytes, label) {
  const value = bytes.toString('utf8');
  assert(Buffer.from(value).equals(bytes), 'Invalid UTF-8: ' + label);
  return value;
}

function* attemptFiles(attempt, folder = '') {
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

function finish() {
  const [action, ...args] = process.argv.slice(2);
  const verifyOnly = action === 'verify';
  assert((action === undefined || verifyOnly) && args.length === 0,
    'Run the saved Stage 3 finalizer without arguments to publish, or with verify to check completed Stage 3.');
  const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE3_ID: id } = process.env;
  assert([CHOOM_WORK, CHOOM_TOOLS].every(value => text(value) && isAbsolute(value)),
    'Set CHOOM_WORK and CHOOM_TOOLS to absolute paths.');
  assert(/^s3-[a-z0-9-]+$/.test(id ?? ''), 'Set CHOOM_STAGE3_ID to an s3-... ID.');
  const work = directory(CHOOM_WORK);
  const tools = directory(CHOOM_TOOLS);
  assert(work !== tools && !tools.startsWith(work + '/'), 'Use a trusted tool checkout outside CHOOM_WORK.');
  const attempt = directory(join(directory(join(work, 'evidence')), id));
  const self = fileURLToPath(import.meta.url);
  assert(self === join(attempt, 'stage-3-finish.mjs'), 'Run stage-3-finish.mjs from the saved attempt.');
  const require = createRequire(join(tools, 'package.json'));
  const yamlPath = require.resolve('yaml');
  assert(yamlPath.startsWith(join(tools, 'node_modules/yaml') + '/') && realpathSync(yamlPath) === yamlPath,
    'Install YAML in the trusted tool checkout.');
  const { parse, stringify } = require(yamlPath);
  const analysisRef = id + '-entry-analysis';
  const attemptRef = name => id + '-file@' + encodeURIComponent(name);
  const newId = value => text(value) && value.startsWith(id + '-') && !value.startsWith(id + '-file@');

  const before = Object.fromEntries(draftNames.map(name => [name, file(attempt, name + '.before.yaml')]));
  const current = verifyOnly
    ? Object.fromEntries(draftNames.map(name => [name, file(work, name + '.yaml')])) : before;
  const checkDrafts = () => {
    for (const name of draftNames) {
      assert(current[name].equals(file(work, name + '.yaml')),
        name + '.yaml changed ' + (verifyOnly ? 'during verification.' : 'after checkpointing.'));
      assert(before[name].equals(file(attempt, name + '.before.yaml')), name + '.before.yaml changed.');
    }
  };
  checkDrafts();
  if (verifyOnly) {
    const publishedRun = parse(utf8(current.run, 'run.yaml'));
    const publishedDiscovery = parse(utf8(current.discovery, 'discovery.yaml'));
    assert(publishedRun?.status === 'in-progress' && publishedRun.progress?.inspectionPriorities === 'complete' &&
      publishedRun.progress.baselineRecovery === 'pending' && publishedDiscovery?.entryAnalysisRef === analysisRef,
    'Verify only this attempt as the latest published Stage 3 state, before later stages change the drafts.');
  }
  const { run, discovery, baseline } = Object.fromEntries(draftNames
    .map(name => [name, parse(utf8(before[name], name + '.before.yaml'))]));
  assert(run?.formatVersion === 1 && run.mode === 'A' && text(run.id) && run.status === 'in-progress' && object(run.artifacts) &&
    run.progress?.inventory === 'complete' && run.progress.entryAnalysis === 'complete' &&
    run.progress.baselineRecovery === 'pending' && run.progress.inspectionPriorities !== 'complete' &&
    run.snapshot?.root === 'snapshot' && text(run.snapshot.id), 'Expected an in-progress Stage 2 run.');
  assert(discovery?.formatVersion === 1 && discovery.kind === 'architecture-discovery' &&
    discovery.runRef === run.id && own(run.artifacts, discovery.entryAnalysisRef), 'Invalid discovery checkpoint.');
  for (const key of ['baselineRef', 'overview', 'inspectedPaths', 'codeMappingRef', 'dependenciesRef', 'resourceAccessRef'])
    assert(!own(discovery, key), 'Discovery advanced beyond Stage 3: ' + key);
  assert(baseline?.formatVersion === 1 && baseline.parentId === null && text(baseline.id) &&
    ['components', 'interfaces', 'resources', 'rules'].every(key => Array.isArray(baseline[key]) && !baseline[key].length),
  'The baseline must still be empty.');

  const artifacts = { ...run.artifacts };
  const buffers = new Map();
  function verify(artifactId, entry) {
    assert(object(entry) && /^[a-f0-9]{64}$/i.test(entry.sha256 ?? ''), 'Invalid artifact: ' + artifactId);
    assert(!draftNames.some(name => entry.path === name + '.yaml'), 'Mutable draft registered as evidence: ' + entry.path);
    const bytes = file(work, entry.path);
    assert(hash(bytes) === entry.sha256.toLowerCase(), 'Artifact digest mismatch: ' + artifactId);
    return bytes;
  }
  for (const [artifactId, entry] of Object.entries(artifacts)) buffers.set(artifactId, verify(artifactId, entry));
  const names = [...attemptFiles(attempt)];
  const registeredPaths = new Set(Object.values(artifacts).map(entry => entry.path));
  for (const name of names) {
    const artifactId = name === 'entry-analysis.yaml' ? analysisRef : attemptRef(name);
    const path = relative(work, join(attempt, name));
    assert(!own(artifacts, artifactId) && !registeredPaths.has(path), 'Artifact collision: ' + artifactId);
    const bytes = file(attempt, name);
    artifacts[artifactId] = { path, sha256: hash(bytes) };
    buffers.set(artifactId, bytes);
  }

  const documents = new Map();
  function document(ref) {
    assert(buffers.has(ref), 'Unknown artifact: ' + ref);
    if (!documents.has(ref)) {
      const bytes = utf8(buffers.get(ref), ref);
      documents.set(ref, /\.ya?ml$/.test(artifacts[ref].path) ? parse(bytes) : JSON.parse(bytes));
    }
    return documents.get(ref);
  }
  function registered(ref) {
    assert(text(ref) && own(run.artifacts, ref), 'Expected a previously registered artifact: ' + ref);
    return document(ref);
  }

  const saved = name => document(attemptRef(name));
  function attemptDigests(fileNames) {
    return Object.fromEntries(fileNames.map(name => {
      const ref = name === 'entry-analysis.yaml' ? analysisRef : attemptRef(name);
      assert(buffers.has(ref), 'Missing saved attempt file: ' + name);
      return [name, hash(buffers.get(ref))];
    }));
  }
  function receipt(phase, action, outputs) {
    const prefix = 'operator-' + phase;
    const value = saved(prefix + '.json');
    assert(value?.formatVersion === 1 && value.attemptId === id && value.phase === phase && value.action === action &&
      value.status === 'completed' && value.exitCode === 0 &&
      isDeepStrictEqual(value.digests, attemptDigests(outputs)) && isDeepStrictEqual(value.logDigests,
        attemptDigests(['.started.json', '.stdout.txt', '.stderr.txt'].map(suffix => prefix + suffix))),
    'The ' + phase + ' receipt is incomplete, failed, or changed. Use a new attempt.');
  }
  receipt('start', 'start', [...checkpoints, ...toolFiles, 'handoff.json']);
  receipt('collect', 'collect', collectFiles);
  receipt('save-review', 'save-review', reviewFiles);
  assert(buffers.has(attemptRef('commands.md')), 'Missing command log.');

  const snapshotRef = run.snapshot.id;
  const inventoryRef = run.snapshot.inventoryRef;
  const inventory = registered(inventoryRef);
  assert(inventory?.formatVersion === 1 && inventory.snapshotId === snapshotRef && Array.isArray(inventory.files),
    'Inventory snapshot mismatch.');
  const paths = new Map(inventory.files.map(record => [record.path, record]));
  assert(paths.size === inventory.files.length, 'Duplicate inventory paths.');
  const snapshot = directory(join(work, run.snapshot.root));
  const previousRef = discovery.entryAnalysisRef;
  const previous = registered(previousRef);
  assert(previous?.formatVersion === 1 && previous.kind === 'entry-analysis' && previous.snapshotRef === snapshotRef &&
    Array.isArray(previous.candidates) && Array.isArray(previous.reviewedFiles), 'Invalid preceding entry analysis.');
  const handoff = saved('handoff.json');
  const { dev, ino } = lstatSync(snapshot);
  const handoffFacts = { formatVersion: 1, attemptId: id, work, tools, runRef: run.id, snapshotRef, inventoryRef,
    snapshot: { path: snapshot, dev, ino }, entryAnalysisRef: previousRef,
    planRef: previous.planRef, knipRunsRef: previous.knipRunsRef, registeredArtifacts: Object.keys(run.artifacts).length,
    indexedRegularFiles: inventory.files.filter(item => item.kind === 'file').length,
    checkpointDigests: attemptDigests(checkpoints), toolInputDigests: attemptDigests(toolFiles) };
  assert(Object.entries(handoffFacts).every(([key, value]) => isDeepStrictEqual(handoff?.[key], value)),
    'Stage 3 handoff does not match the saved inputs.');
  const artifactMap = saved('artifact-map.json');
  assert(artifactMap?.formatVersion === 1 && artifactMap.attemptId === id && artifactMap.snapshotRef === snapshotRef &&
    artifactMap.status === 'proposed' && object(artifactMap.artifacts) &&
    Object.entries(artifactMap.artifacts).every(([ref, entry]) => own(artifacts, ref) && isDeepStrictEqual(artifacts[ref], entry)),
  'The proposed artifact map does not match the saved files.');
  const loading = saved('loading-search.json');
  const mentions = saved('symbol-mentions.json');
  assert(loading?.formatVersion === 1 && loading.snapshotRef === snapshotRef && loading.status === 'completed' &&
    Array.isArray(loading.scope) && loading.scope.every(item => paths.get(item?.path)?.kind === 'file' &&
      paths.get(item.path).sha256 === item.sha256) &&
    mentions?.formatVersion === 1 && mentions.snapshotRef === snapshotRef && mentions.knipRunsRef === previous.knipRunsRef &&
    ['completed', 'partial', 'unavailable', 'skipped'].includes(mentions.status) &&
    isDeepStrictEqual(mentions.scope, loading.scope),
  'Invalid Stage 3 query scope or outcome.');
  const plan = registered(previous.planRef);
  const receipts = registered(previous.knipRunsRef);
  assert(plan?.formatVersion === 1 && plan.snapshotRef === snapshotRef && Array.isArray(plan.workspaces) &&
    plan.workspaces.every(workspace => text(workspace?.dir)) &&
    receipts?.formatVersion === 1 && receipts.snapshotRef === snapshotRef && Array.isArray(receipts.runs) &&
    receipts.runs.length === 2, 'Invalid preceding Knip inputs or receipts.');
  const workspaces = new Set(plan.workspaces.map(workspace => workspace.dir));
  assert(workspaces.has('.') && workspaces.size === plan.workspaces.length, 'Invalid saved Knip workspaces.');
  registered(receipts.profileRef);
  const preflight = registered(receipts.preflightRef);
  const digest = ref => hash(buffers.get(ref));
  const inputDigests = {
    planSha256: digest(previous.planRef), profileSha256: digest(receipts.profileRef),
    preflightSha256: digest(receipts.preflightRef), inventorySha256: digest(inventoryRef),
  };
  assert(preflight?.formatVersion === 1 && preflight.snapshotRef === snapshotRef &&
    preflight.planSha256 === inputDigests.planSha256 && preflight.profileSha256 === inputDigests.profileSha256 &&
    preflight.inventory?.ref === inventoryRef && preflight.inventory.path === artifacts[inventoryRef].path &&
    preflight.inventory.sha256 === inputDigests.inventorySha256 &&
    isDeepStrictEqual(receipts.inputDigests, inputDigests), 'Recorded Knip inputs do not match the saved artifacts.');
  for (const mode of ['normal', 'production']) {
    const matches = receipts.runs.filter(run => run?.mode === mode);
    assert(matches.length === 1 && ['completed', 'failed', 'skipped'].includes(matches[0].status),
      'Invalid Knip receipt for mode: ' + mode);
  }

  const analysis = document(analysisRef);
  exact(analysis, ['formatVersion', 'kind', 'snapshotRef', 'previousEntryAnalysisRef', 'planRef', 'knipRunsRef',
    'candidates', 'reviewedFiles', 'questions', 'gaps', 'reachability', 'llmReview', 'knipAssessment',
    'inspectionPriorities'], 'Stage 3 entry analysis');
  assert(analysis.formatVersion === 1 && analysis.kind === 'entry-analysis' && analysis.snapshotRef === snapshotRef &&
    analysis.previousEntryAnalysisRef === previousRef && analysis.llmReview === 'recorded',
  'Invalid Stage 3 entry-analysis identity or review state.');
  exact(analysis.reachability, ['status', 'reason'], 'reachability');
  assert(analysis.reachability.status === 'not-assessed' && text(analysis.reachability.reason),
    'Reachability must remain unassessed.');
  exact(analysis.knipAssessment, ['action', 'reason', 'evidenceRefs'], 'Knip assessment');
  assert(analysis.knipAssessment.action !== 'rerun-required' && analysis.planRef === previous.planRef &&
    analysis.knipRunsRef === previous.knipRunsRef,
  'Knip rerun required. Save a new controlled Knip attempt and prepare a new Stage 3 attempt.');
  assert(analysis.knipAssessment.action === 'reuse' && text(analysis.knipAssessment.reason),
    'Expected a justified Knip reuse assessment.');

  const sourceRecords = new Map();
  const sourceLines = new Map();
  function checkedSourceBytes(record, label) {
    const saved = paths.get(record?.path);
    assert(saved?.kind === 'file' && record.sha256 === saved.sha256, 'Invalid ' + label + ' source: ' + record?.path);
    const bytes = file(snapshot, record.path);
    assert(hash(bytes) === record.sha256, label + ' source digest mismatch: ' + record.path);
    return bytes;
  }
  function checkSource(record) {
    const saved = paths.get(record?.path);
    assert(text(record?.id) && record.snapshotRef === snapshotRef && saved?.kind === 'file' &&
      record.sha256 === saved.sha256 && Array.isArray(record.lines) && record.lines.length === 2 &&
      record.lines.every(Number.isSafeInteger) && record.lines[0] >= 1 && record.lines[1] >= record.lines[0],
    'Invalid reviewed source: ' + record?.id);
    if (!sourceLines.has(record.path)) {
      const value = utf8(checkedSourceBytes(record, 'Reviewed'), record.path);
      const lines = value ? value.split(/\r\n|\r|\n/) : [];
      if (/[\r\n]$/.test(value)) lines.pop();
      sourceLines.set(record.path, lines);
    }
    assert(record.lines[1] <= sourceLines.get(record.path).length, 'Reviewed range exceeds source: ' + record.id);
  }
  const excerptBundle = saved('source-excerpts.json');
  assert(excerptBundle?.formatVersion === 1 && excerptBundle.snapshotRef === snapshotRef &&
    Array.isArray(excerptBundle.excerpts), 'Invalid collected excerpts.');
  const currentExcerpts = [...excerptBundle.excerpts];
  for (const name of names.filter(name => /^excerpt-[0-9]+\.json$/.test(name))) {
    receipt(name.slice(0, -5), 'excerpt', [name]);
    currentExcerpts.push(saved(name));
  }
  const excerpts = [...currentExcerpts];
  for (const [ref, artifact] of Object.entries(run.artifacts)) {
    if (!/\.(?:json|ya?ml)$/.test(artifact.path)) continue;
    let saved;
    try { saved = document(ref); } catch { continue; }
    if (Array.isArray(saved?.excerpts)) excerpts.push(...saved.excerpts);
    if (text(saved?.excerpt)) excerpts.push(saved);
    if (!Array.isArray(saved?.reviewedFiles)) continue;
    for (const record of saved.reviewedFiles) {
      assert(text(record?.id) && !buffers.has(record.id) &&
        (!sourceRecords.has(record.id) || isDeepStrictEqual(sourceRecords.get(record.id), record)),
      'Conflicting historical source ID: ' + record?.id);
      sourceRecords.set(record.id, record);
    }
  }

  const sameSource = (left, right) => left.snapshotRef === right.snapshotRef && left.path === right.path &&
    left.sha256 === right.sha256 && isDeepStrictEqual(left.lines, right.lines);
  const excerptRecords = new Map();
  for (const excerpt of excerpts) {
    const prior = excerptRecords.get(excerpt?.id) ?? sourceRecords.get(excerpt?.id);
    assert(text(excerpt?.id) && !buffers.has(excerpt.id) && (!prior || sameSource(prior, excerpt)),
      'Conflicting excerpt source ID: ' + excerpt?.id);
    excerptRecords.set(excerpt.id, excerpt);
  }
  const identifiers = new Set([...buffers.keys(), ...sourceRecords.keys(), ...excerptRecords.keys()]);
  function claim(id, fresh = false) {
    assert(text(id) && (!fresh || newId(id)) && !identifiers.has(id), 'Invalid or colliding analysis ID: ' + id);
    identifiers.add(id);
  }
  assert(Array.isArray(analysis.reviewedFiles), 'Missing reviewed source list.');
  for (const record of analysis.reviewedFiles) {
    exact(record, ['id', 'snapshotRef', 'path', 'sha256', 'lines'], 'reviewed source');
    const supplied = excerptRecords.get(record.id);
    if (supplied) {
      assert(newId(record.id) && !sourceRecords.has(record.id) && sameSource(record, supplied),
        'A reviewed source ID must match its supplied excerpt and be new: ' + record.id);
    } else claim(record.id, true);
    checkSource(record);
    const [first, last] = record.lines;
    const numbered = sourceLines.get(record.path).slice(first - 1, last)
      .map((line, index) => (first + index) + ': ' + line).join('\n');
    assert(excerpts.some(excerpt => excerpt?.snapshotRef === snapshotRef && excerpt.path === record.path &&
      excerpt.sha256 === record.sha256 && isDeepStrictEqual(excerpt.lines, record.lines) && excerpt.excerpt === numbered),
    'Reviewed range does not match a saved excerpt: ' + record.id);
    sourceRecords.set(record.id, record);
  }

  function evidence(record) {
    assert(strings(record.evidenceRefs), 'Missing evidence for ' + (record.id ?? 'Knip assessment'));
    for (const ref of record.evidenceRefs) {
      const split = ref.indexOf('#');
      const base = split === -1 ? ref : ref.slice(0, split);
      assert(base !== analysisRef && (buffers.has(base) || sourceRecords.has(base)), 'Unknown evidence: ' + ref);
      if (sourceRecords.has(base)) checkSource(sourceRecords.get(base));
      if (split === -1) continue;
      const pointer = decodeURIComponent(ref.slice(split + 1));
      assert(pointer === '' || pointer.startsWith('/'), 'Invalid JSON Pointer: ' + ref);
      let value = sourceRecords.get(base) ?? document(base);
      for (const part of pointer === '' ? [] : pointer.slice(1).split('/')) {
        const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
        assert(!/~(?:[^01]|$)/.test(part) && value !== null && typeof value === 'object' &&
          (!Array.isArray(value) || /^(0|[1-9][0-9]*)$/.test(key)) && own(value, key),
        'Unresolved JSON Pointer: ' + ref);
        value = value[key];
      }
    }
  }
  evidence(analysis.knipAssessment);

  const call = saved('llm/analysis-call.yaml');
  const scope = saved('llm/review-scope.json');
  assert(text(call.provider) && text(call.model) && text(call.date) &&
    (object(call.settings) || call.settings === 'unknown'), 'Missing LLM call metadata; use unknown for unexposed settings.');
  assert(text(utf8(buffers.get(attemptRef('llm/analysis-prompt.md')), 'LLM prompt')) &&
    utf8(buffers.get(attemptRef('llm/analysis-response.md')), 'LLM response')
      .includes(utf8(buffers.get(analysisRef), 'entry analysis').trimEnd()),
  'Keep the complete prompt and response, including the exact entry-analysis YAML.');
  assert(scope.formatVersion === 1 && scope.runRef === run.id && scope.snapshotRef === snapshotRef &&
    strings(scope.suppliedArtifactRefs) && strings(scope.limits), 'Missing or invalid LLM review scope.');
  evidence({ evidenceRefs: scope.suppliedArtifactRefs });

  const addedIssues = [];
  for (const kind of issueKinds) {
    assert([previous[kind], discovery[kind], analysis[kind]].every(Array.isArray), 'Missing ' + kind + ' list.');
    const prior = new Map();
    const current = new Map(analysis[kind].map(item => [item?.id, item]));
    for (const item of [...previous[kind], ...discovery[kind]]) {
      assert(text(item?.id) && isDeepStrictEqual(current.get(item.id), item), 'Removed or changed prior ' + kind + ': ' + item?.id);
      prior.set(item.id, item);
    }
    for (const item of analysis[kind]) {
      const isNew = !prior.has(item?.id);
      claim(item?.id, isNew);
      if (isNew) exact(item, kind === 'questions' ? ['id', 'subjectRefs', 'text', 'evidenceRefs']
        : ['id', 'kind', 'subjectRefs', 'reason', 'evidenceRefs'], kind + ' record');
      assert(strings(item.subjectRefs) && (kind === 'questions' ? text(item.text) : text(item.kind) && text(item.reason)),
        'Invalid ' + kind + ' record: ' + item.id);
      evidence(item);
      if (isNew) addedIssues.push(item);
    }
  }

  const priorCandidates = new Map(previous.candidates.map((item, index) => [item?.id, { item, index }]));
  assert(priorCandidates.size === previous.candidates.length, 'Duplicate previous candidate IDs.');
  assert(Array.isArray(analysis.candidates), 'Missing candidate list.');
  const candidateIds = new Set();
  for (const item of analysis.candidates) {
    exact(item, ['id', 'expression', 'path', 'workspace', 'roles', 'origin', 'evidenceRefs'], 'candidate');
    const prior = priorCandidates.get(item.id);
    claim(item.id, !prior);
    assert(!prior || isDeepStrictEqual(item, prior.item), 'Changed prior candidate: ' + item.id);
    assert(text(item.expression) && (item.path === null || paths.get(item.path)?.kind === 'file') &&
      strings(item.roles) && origins.includes(item.origin), 'Invalid candidate: ' + item.id);
    assert(workspaces.has(item.workspace), 'Unknown candidate workspace: ' + item.workspace);
    evidence(item);
    candidateIds.add(item.id);
  }
  for (const [candidateId, { index }] of priorCandidates) {
    assert(candidateIds.has(candidateId) || addedIssues.some(item => item.subjectRefs.includes(candidateId) &&
      item.evidenceRefs.includes(previousRef + '#/candidates/' + index)), 'Missing note for omitted candidate: ' + candidateId);
  }

  assert(Array.isArray(analysis.inspectionPriorities) && analysis.inspectionPriorities.length, 'Missing inspection priorities.');
  let lastPriority = 1;
  for (const item of analysis.inspectionPriorities) {
    exact(item, ['id', 'subjectRefs', 'priority', 'action', 'reason', 'evidenceRefs'], 'inspection priority');
    claim(item.id, true);
    assert(Number.isInteger(item.priority) && item.priority >= lastPriority && item.priority <= 3 &&
      strings(item.subjectRefs) && text(item.action) && text(item.reason), 'Invalid or out-of-order inspection priority: ' + item.id);
    evidence(item);
    lastPriority = item.priority;
  }

  checkDrafts();
  for (const record of loading.scope) checkedSourceBytes(record, 'Queried');
  for (const excerpt of currentExcerpts) {
    assert(excerpt?.snapshotRef === snapshotRef, 'Excerpt snapshot mismatch: ' + excerpt?.path);
    checkedSourceBytes(excerpt, 'Excerpt');
  }
  assert(isDeepStrictEqual([...attemptFiles(attempt)], names), 'Attempt files changed during finalization.');
  for (const [ref, entry] of Object.entries(artifacts)) verify(ref, entry);
  const nextRun = { ...run, artifacts, progress: { ...run.progress, inspectionPriorities: 'complete' },
    coverage: { ...run.coverage,
      inspected: 'Source reviews remain in the saved entry analyses. Stage 3 adds ' +
        analysisRef + '#/reviewedFiles. Tool query scope does not establish LLM inspection.' },
  };
  const nextDiscovery = { ...discovery, entryAnalysisRef: analysisRef, questions: analysis.questions, gaps: analysis.gaps };
  const published = { run: Buffer.from(stringify(nextRun)), discovery: Buffer.from(stringify(nextDiscovery)),
    baseline: before.baseline };
  if (verifyOnly) {
    for (const name of draftNames) assert(current[name].equals(published[name]),
      name + '.yaml differs from this attempt\'s published Stage 3 state. Do not use verify after later publication.');
    const regularFiles = inventory.files.filter(record => record.kind === 'file');
    for (const record of regularFiles) checkedSourceBytes(record, 'Indexed');
    checkDrafts();
    console.log(JSON.stringify({ formatVersion: 1, action: 'verify', status: 'verified',
      runRef: run.id, snapshotRef, attemptId: id, entryAnalysisRef: analysisRef,
      checked: { registeredArtifactDigests: Object.keys(artifacts).length,
        indexedRegularFileDigests: regularFiles.length, currentReviewedRanges: analysis.reviewedFiles.length,
        exactPublishedDrafts: draftNames.map(name => name + '.yaml') },
      limits: ['Only this latest published Stage 3 state is checked.',
        'Snapshot file membership, symlink targets, and excluded inputs are not checked.',
        'Structure and evidence checks do not certify analysis meaning or runtime behavior.'],
      writes: [],
    }, null, 2));
    return;
  }
  publish(work, published.run, published.discovery, checkDrafts);
  console.log('Stage 3 drafts updated. Structure and evidence checks passed. Review the analysis for meaning.');
  console.log('Keep all registered attempt files unchanged.');
}

function publish(work, run, discovery, checkDrafts) {
  const pending = new Map();
  let manifestPublished = false;
  try {
    for (const [name, bytes] of [['run', run], ['discovery', discovery]]) {
      const temp = join(work, '.stage-3-' + name + '.next.yaml');
      const fd = openSync(temp, 'wx');
      pending.set(name, temp);
      try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
    }
    checkDrafts();
    for (const [name, temp] of pending) {
      renameSync(temp, join(work, name + '.yaml'));
      pending.delete(name);
      if (name === 'run') manifestPublished = true;
    }
  } catch (error) {
    if (manifestPublished) console.error('Draft update incomplete. Restore run.yaml and discovery.yaml from the saved checkpoints before starting a new attempt.');
    throw error;
  } finally {
    for (const temp of pending.values()) unlinkSync(temp);
  }
}

try {
  finish();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
