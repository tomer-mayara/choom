import {
  appendFileSync, closeSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, writeFileSync, writeSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.every(text);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const self = fileURLToPath(import.meta.url);
const [action, ...args] = process.argv.slice(2);
const planPath = action === 'start' ? args[0] : undefined;
const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE2_ID: id } = process.env;
const sources = ['cookbook.md', 'stage-2-commands.mjs', 'check-knip-image.mjs', 'inventory-view.py'];
const drafts = ['run', 'discovery', 'baseline'];
const planFile = 'entry-plan.json';
const coreFiles = [planFile, 'entry-analysis.yaml', 'knip-runs.json', 'knip-profile.json', 'preflight.json'];
const imageFiles = ['image-id.txt', 'build-exit.txt', 'image-inspect-exit.txt', 'check-exit.txt', 'metadata.json']
  .map(name => 'toolchain/' + name);

assert((action === 'start' && (args.length === 0 || (args.length === 1 && isAbsolute(planPath)))) ||
  (['prepare', 'toolchain', 'run', 'finish'].includes(action) && args.length === 0) ||
  (['plan', 'save-review'].includes(action) && args.length === 1 && isAbsolute(args[0])) ||
  (action === 'excerpt' && args.length === 4),
'Use start, excerpt PATH FIRST LAST REASON, plan REVIEW_DIR, prepare, toolchain, run, save-review REVIEW_DIR, or finish.');
assert(/^s2-[a-z0-9-]+$/.test(id ?? ''), 'Set CHOOM_STAGE2_ID to a new or prepared s2-... ID.');
assert([CHOOM_WORK, CHOOM_TOOLS].every(value => text(value) && isAbsolute(value)),
  'Set CHOOM_WORK and CHOOM_TOOLS to absolute paths.');
const work = realpathSync(CHOOM_WORK);
const tools = realpathSync(CHOOM_TOOLS);
const evidence = join(work, 'evidence');
assert(realpathSync(evidence) === evidence && lstatSync(evidence).isDirectory(), 'Expected a real evidence directory.');
const attempt = join(evidence, id);
const savedSelf = join(attempt, 'stage-2-commands.mjs');
const { parse } = createRequire(join(tools, 'package.json'))('yaml');
const env = { ...process.env, CHOOM_WORK: work, CHOOM_TOOLS: tools, CHOOM_STAGE2: attempt,
  CHOOM_STAGE2_ID: id, CHOOM_KNIP_IMAGE: '' };
delete env.BASH_ENV;
delete env.ENV;

function regularFile(path) {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a real file: ' + path);
  return readFileSync(path);
}

function safeName(name) {
  return text(name) && !isAbsolute(name) && !/[\\\0\r\n]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}

function read(base, name) {
  assert(safeName(name), 'Invalid saved path: ' + name);
  return regularFile(join(base, name));
}

const saved = name => read(attempt, name);
const json = name => JSON.parse(saved(name));
const save = (name, data) => writeFileSync(join(attempt, name), data, { flag: 'wx' });
const saveJson = (name, data) => save(name, JSON.stringify(data, null, 2) + '\n');
const utc = () => new Date().toISOString();

function exact(record, keys, label) {
  assert(object(record) && Object.keys(record).length === keys.length &&
    keys.every(key => Object.hasOwn(record, key)), 'Invalid ' + label + ' fields.');
}

function state(checkpoints) {
  const runBytes = read(work, 'run.yaml');
  const discoveryBytes = read(work, 'discovery.yaml');
  if (checkpoints) {
    for (const [name, bytes] of [['run', runBytes], ['discovery', discoveryBytes], ['baseline', read(work, 'baseline.yaml')]])
      assert(bytes.equals(saved(name + '.before.yaml')), 'Draft changed: ' + name);
  }
  const run = parse(runBytes.toString());
  const discovery = parse(discoveryBytes.toString());
  assert(run?.formatVersion === 1 && run.status === 'in-progress' && run.progress?.inventory === 'complete' &&
    run.snapshot?.root === 'snapshot' && object(run.artifacts) && discovery?.runRef === run.id,
  'Expected a saved stage 1 run.');
  const artifacts = new Map();
  for (const [artifactId, record] of Object.entries(run.artifacts)) {
    assert(object(record) && record.path !== 'run.yaml' && /^[a-f0-9]{64}$/i.test(record.sha256 ?? ''),
      'Invalid registered artifact: ' + artifactId);
    const content = read(work, record.path);
    assert(hash(content) === record.sha256.toLowerCase(), 'Changed registered artifact: ' + artifactId);
    artifacts.set(artifactId, { name: record.path, content });
  }
  assert(artifacts.has(run.snapshot.inventoryRef), 'Missing registered inventory.');
  const inventory = JSON.parse(artifacts.get(run.snapshot.inventoryRef).content);
  assert(inventory?.snapshotId === run.snapshot.id && Array.isArray(inventory.files), 'Inventory snapshot mismatch.');
  if (checkpoints) for (const name of readdirSync(attempt).filter(name => /^excerpt-[0-9]+\.json$/.test(name))) {
    const artifactId = id + '-file@' + encodeURIComponent(name);
    assert(!artifacts.has(artifactId), 'Attempt excerpt ID is already registered: ' + artifactId);
    artifacts.set(artifactId, { name, content: saved(name) });
  }
  return { discovery, artifacts, inventory };
}

function document({ name, content }) {
  return name.endsWith('.json') ? JSON.parse(content) : parse(content.toString());
}

function pointer(value, encoded, ref) {
  const decoded = decodeURIComponent(encoded);
  assert(decoded === '' || decoded.startsWith('/'), 'Invalid JSON Pointer: ' + ref);
  for (const part of decoded === '' ? [] : decoded.slice(1).split('/')) {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    assert(!/~(?:[^01]|$)/.test(part) && value !== null && typeof value === 'object' &&
      (!Array.isArray(value) || /^(0|[1-9][0-9]*)$/.test(key)) && Object.hasOwn(value, key),
    'Unresolved JSON Pointer: ' + ref);
    value = value[key];
  }
}

function validatePlan(bytes, { discovery, artifacts, inventory }) {
  const plan = JSON.parse(bytes);
  exact(plan, ['formatVersion', 'snapshotRef', 'runProduction', 'productionReason',
    'candidates', 'workspaces', 'questions', 'gaps'], 'plan');
  assert(plan.formatVersion === 1 && plan.snapshotRef === inventory.snapshotId &&
    typeof plan.runProduction === 'boolean' && text(plan.productionReason) &&
    ['candidates', 'workspaces', 'questions', 'gaps'].every(key => Array.isArray(plan[key])), 'Invalid entry plan.');

  const paths = new Map(inventory.files.map(file => [file.path, file]));
  assert(paths.size === inventory.files.length, 'Duplicate inventory paths.');
  const workspaces = new Set();
  for (const workspace of plan.workspaces) {
    exact(workspace, ['dir', 'entry', 'project'], 'workspace');
    assert((workspace.dir === '.' || safeName(workspace.dir)) && !workspaces.has(workspace.dir) &&
      strings(workspace.entry) && strings(workspace.project) && workspace.project.length, 'Invalid workspace.');
    workspaces.add(workspace.dir);
  }
  assert(workspaces.has('.'), 'The entry plan must include the root workspace.');

  const reviewed = new Map();
  for (const record of artifacts.values()) {
    if (!/\.(?:json|ya?ml)$/.test(record.name)) continue;
    let value;
    try { value = document(record); } catch { continue; }
    const sources = Array.isArray(value?.reviewedFiles) ? value.reviewedFiles :
      /(?:^|\/)(?:source-excerpts\.json|excerpt-[0-9]+\.json)$/.test(record.name) ?
        (Array.isArray(value?.excerpts) ? value.excerpts : [value]) : [];
    for (const source of sources) {
      const file = Object.fromEntries(['id', 'snapshotRef', 'path', 'sha256', 'lines'].map(key => [key, source[key]]));
      assert(text(file?.id) && file.snapshotRef === inventory.snapshotId &&
        paths.get(file.path)?.kind === 'file' && file.sha256 === paths.get(file.path).sha256 &&
        (!reviewed.has(file.id) || isDeepStrictEqual(reviewed.get(file.id), file)),
      'Invalid saved source record: ' + file?.id);
      reviewed.set(file.id, file);
    }
  }
  const ids = new Set();
  function checkRecord(record, prior) {
    assert(text(record.id) && !ids.has(record.id) && !artifacts.has(record.id) && !reviewed.has(record.id) &&
      (prior.has(record.id) || record.id.startsWith(id + '-')) && !record.id.startsWith(id + '-file@') &&
      !coreFiles.some(name => record.id === id + '-' + name.replace(/\.[^.]+$/, '')),
    'Invalid or duplicate record ID: ' + record.id);
    ids.add(record.id);
    assert(strings(record.evidenceRefs) && record.evidenceRefs.length, 'Missing evidence: ' + record.id);
    for (const ref of record.evidenceRefs) {
      const at = ref.indexOf('#');
      const artifactId = at < 0 ? ref : ref.slice(0, at);
      const source = reviewed.get(artifactId);
      const artifact = artifacts.get(artifactId);
      assert(artifact || source, 'Unknown saved evidence: ' + artifactId);
      if (at >= 0) pointer(artifact ? document(artifact) : source, ref.slice(at + 1), ref);
    }
  }
  const noPrior = new Map();
  for (const candidate of plan.candidates) {
    exact(candidate, ['id', 'expression', 'path', 'workspace', 'roles', 'origin', 'evidenceRefs'], 'candidate');
    assert(text(candidate.expression) && workspaces.has(candidate.workspace) &&
      (candidate.path === null || paths.get(candidate.path)?.kind === 'file') &&
      strings(candidate.roles) && candidate.roles.length &&
      ['package-field', 'script', 'convention', 'source', 'inference', 'unknown'].includes(candidate.origin),
    'Invalid candidate: ' + candidate.id);
    checkRecord(candidate, noPrior);
  }
  for (const [key, field] of [['questions', 'text'], ['gaps', 'reason']]) {
    assert(Array.isArray(discovery[key]), 'Missing prior discovery ' + key);
    const prior = new Map(discovery[key].map(record => [record.id, record]));
    for (const record of plan[key]) {
      const fields = ['id', 'subjectRefs', field, 'evidenceRefs', ...(key === 'gaps' ? ['kind'] : [])];
      if (!prior.has(record?.id)) exact(record, fields, key);
      assert(object(record) && strings(record.subjectRefs) && text(record[field]) && (key !== 'gaps' || text(record.kind)),
        'Invalid record: ' + record?.id);
      checkRecord(record, prior);
    }
    for (const [priorId, record] of prior)
      assert(isDeepStrictEqual(plan[key].find(item => item.id === priorId), record), 'Changed prior record: ' + priorId);
  }
}

function block(marker, qualifier = '') {
  const body = saved('cookbook.md').toString().replaceAll('\r\n', '\n');
  const matches = [...body.matchAll(/^\x60\x60\x60sh\n([\s\S]*?)^\x60\x60\x60[ \t]*$/gm)]
    .map(match => match[1]).filter(value => value.startsWith(marker) && value.includes(qualifier));
  assert(matches.length === 1, 'Expected one saved cookbook block for: ' + marker.trimEnd());
  return matches[0];
}

function startRecipe() {
  const body = saved('cookbook.md').toString().replaceAll('\r\n', '\n');
  const matches = [...body.matchAll(/^cat > "\$CHOOM_STAGE2\/prepare\.mjs" <<'JS'\n[\s\S]*?^JS\nnode "\$CHOOM_STAGE2\/prepare\.mjs"\n/gm)];
  assert(matches.length === 1, 'Expected one saved prepare.mjs heredoc.');
  return matches[0][0];
}

function digests(names) {
  return Object.fromEntries(names.map(name => [name, hash(saved(name))]));
}

function receiptFor(phase) {
  const receipt = json('operator-' + phase + '.json');
  assert(receipt.action === phase && receipt.attemptId === id && object(receipt.digests),
    'Unexpected phase receipt: ' + phase);
  for (const [name, digest] of Object.entries(receipt.digests))
    assert(hash(saved(name)) === digest, 'Saved phase input or output changed: ' + name);
  return receipt;
}

function selection() {
  try {
    assert(imageFiles.every(name => lstatSync(join(attempt, name), { throwIfNoEntry: false })),
      'Docker build, image inspection, or fixture check did not produce a complete receipt.');
    const [idFile, buildExit, inspectExit, checkExit, metadata] = imageFiles.map(name => saved(name).toString().trim());
    const check = JSON.parse(metadata);
    assert(/^sha256:[a-f0-9]{64}$/.test(idFile) && [buildExit, inspectExit, checkExit].every(code => code === '0') &&
      check.imageId === idFile && check.knip === '6.44.1' && check.toolRoot === '/opt/choom-tools' &&
      check.environment?.KNIP_DISABLE_RAW_TRANSFER === '1' && object(check.packageLock) &&
      check.check?.status === 'passed' && check.check.runs?.length === 2 &&
      ['normal', 'production'].every(mode => check.check.runs.some(run => run.mode === mode && run.exitCode === 1)),
    'The image lacks a successful pinned fixture in both modes.');
    return { status: 'approved', imageId: idFile, reason: null };
  } catch (error) {
    return { status: 'unavailable', imageId: null, reason: error.message };
  }
}

function phase(record, stdout, stderr) {
  function execute(recipe, name) {
    const script = 'operator-' + action + '-' + name + '.sh';
    save(script, 'set -eCu\n' + recipe);
    record.digests[script] = hash(saved(script));
    const command = {
      args: ['/bin/bash', join(attempt, script)], cwd: attempt, startedAt: utc(),
      environment: { CHOOM_KNIP_IMAGE: env.CHOOM_KNIP_IMAGE },
    };
    record.commands.push(command);
    const result = spawnSync(command.args[0], command.args.slice(1), {
      cwd: command.cwd, env, stdio: ['ignore', stdout, stderr],
    });
    Object.assign(command, { finishedAt: utc(), exitCode: result.status, signal: result.signal,
      error: result.error?.message ?? null });
    assert(!result.error && result.status === 0 && !result.signal, 'Saved command failed: ' + script);
  }

  if (action === 'start') {
    const plan = planPath ? regularFile(resolve(planPath)) : null;
    if (plan) validatePlan(plan, state(false));
    for (const name of sources) {
      const path = name === sources[0] ? join(dirname(self), 'step-2-cookbook.md') : join(dirname(self), name);
      save(name, regularFile(path));
    }
    Object.assign(record.digests, digests(sources));
    execute(startRecipe(), 'handoff');
    state(true);
    if (plan) save(planFile, plan);
    Object.assign(record.digests, digests([
      ...(plan ? [planFile] : []), 'prepare.mjs', 'handoff.json', 'run.input.yaml', ...drafts.map(name => name + '.before.yaml'),
    ]));
    writeSync(stdout, plan ? 'Saved and validated the supplied entry plan.\n' : 'Prepared the attempt. Collect needed excerpts, then save the LLM plan packet with plan REVIEW_DIR.\n');
    return;
  }

  const current = state(true);
  assert(receiptFor('start').exitCode === 0, 'Start must succeed before continuing.');
  if (action === 'excerpt') {
    const [path, from, to, reason] = args;
    const first = Number(from); const last = Number(to);
    const file = current.inventory.files.find(file => file.path === path);
    assert(safeName(path) && file?.kind === 'file' && file.bytes <= 2 * 1024 * 1024 && text(reason),
      'Use an indexed regular file of at most 2 MiB and a reason.');
    const bytes = read(join(work, 'snapshot'), path);
    assert(hash(bytes) === file.sha256 && bytes.length === file.bytes, 'Changed excerpt input.');
    const source = bytes.toString('utf8');
    assert(Buffer.from(source).equals(bytes) && !source.includes('\0'), 'Excerpt input must be UTF-8 text.');
    const lines = source ? source.split(/\r\n|\r|\n/) : []; if (/[\r\n]$/.test(source)) lines.pop();
    assert(Number.isSafeInteger(first) && Number.isSafeInteger(last) && first > 0 && last >= first &&
      last - first < 300 && last <= lines.length, 'Use an existing range of at most 300 lines.');
    const excerpt = lines.slice(first - 1, last).map((line, n) => (first + n) + ': ' + line).join('\n');
    assert(Buffer.byteLength(excerpt) <= 100 * 1024, 'Excerpt exceeds 100 KiB.');
    const name = receiptStem.replace('operator-', '') + '.json';
    saveJson(name, { formatVersion: 1, id: id + '-source-' + receiptStem.replace('operator-', ''),
      snapshotRef: current.inventory.snapshotId, path, sha256: file.sha256, lines: [first, last], excerpt,
      totalLines: lines.length, reason });
    Object.assign(record.digests, digests([name]));
    writeSync(stdout, 'Saved ' + id + '-file@' + name + '. Source record: ' + id + '-source-' + receiptStem.replace('operator-', '') + '\n');
    return;
  }
  if (action === 'plan' || action === 'save-review') {
    const reviewDir = realpathSync(args[0]);
    assert(reviewDir !== work && !reviewDir.startsWith(work + '/'), 'Keep LLM review packets outside the run.');
    const names = action === 'plan' ? ['entry-plan.json', 'llm/plan-prompt.md', 'llm/plan-response.json',
      'llm/plan-call.yaml', 'llm/plan-scope.json'] : ['entry-analysis.yaml', 'llm/analysis-prompt.md',
      'llm/analysis-response.md', 'llm/analysis-call.yaml', 'llm/review-scope.json'];
    if (action === 'save-review') assert(receiptFor('run').exitCode === 0, 'Run must save its outcomes before review.');
    const packet = new Map(names.map(name => [name, read(reviewDir, name)]));
    const primary = packet.get(names[0]);
    if (action === 'plan') {
      validatePlan(primary, current);
      assert(isDeepStrictEqual(JSON.parse(primary), JSON.parse(packet.get('llm/plan-response.json'))), 'Plan response differs from entry plan.');
    } else {
      const analysis = parse(primary.toString());
      assert(analysis?.kind === 'entry-analysis' && analysis.snapshotRef === current.inventory.snapshotId &&
        analysis.planRef === id + '-entry-plan' && analysis.knipRunsRef === id + '-knip-runs' && analysis.llmReview === 'recorded',
        'Invalid Stage 2 entry analysis identity.');
      assert(packet.get('llm/analysis-response.md').toString().includes(primary.toString().trim()), 'Save complete analysis YAML in the response.');
    }
    const prefix = action === 'plan' ? 'plan' : 'analysis';
    const call = parse(packet.get('llm/' + prefix + '-call.yaml').toString());
    assert(object(call) && ['provider', 'model', 'date'].every(key => text(call[key])) &&
      (call.settings === 'unknown' || object(call.settings)), 'Record LLM call metadata; use unknown for unexposed values.');
    const scope = JSON.parse(packet.get(action === 'plan' ? 'llm/plan-scope.json' : 'llm/review-scope.json'));
    assert(scope?.formatVersion === 1 && scope.snapshotRef === current.inventory.snapshotId && scope.attemptId === id &&
      strings(scope.suppliedArtifactRefs) && scope.suppliedArtifactRefs.length && strings(scope.limits),
    'Record supplied artifact IDs and review limits.');
    const supplied = new Map(current.artifacts);
    function indexInputs(dir = '') {
      for (const leaf of readdirSync(join(attempt, dir))) {
        const name = dir ? dir + '/' + leaf : leaf;
        const info = lstatSync(join(attempt, name));
        assert(!info.isSymbolicLink(), 'Attempt evidence cannot contain symbolic links: ' + name);
        if (info.isDirectory()) indexInputs(name);
        else {
          const core = coreFiles.includes(name) ? id + '-' + name.replace(/\.[^.]+$/, '') : id + '-file@' + encodeURIComponent(name);
          supplied.set(core, { name, content: saved(name) });
        }
      }
    }
    indexInputs();
    for (const ref of scope.suppliedArtifactRefs) {
      const at = ref.indexOf('#'); const base = at < 0 ? ref : ref.slice(0, at);
      assert(supplied.has(base), 'Unknown supplied artifact: ' + ref);
      if (at >= 0) pointer(document(supplied.get(base)), ref.slice(at + 1), ref);
    }
    for (const name of names) assert(!lstatSync(join(attempt, name), { throwIfNoEntry: false }), 'Packet file already exists: ' + name);
    if (!lstatSync(join(attempt, 'llm'), { throwIfNoEntry: false })) mkdirSync(join(attempt, 'llm'));
    for (const [name, bytes] of packet) save(name, bytes);
    Object.assign(record.digests, digests(names));
    writeSync(stdout, 'Saved the complete ' + (action === 'plan' ? 'entry plan' : 'entry analysis') + ' packet.\n');
    return;
  }
  if (action === 'prepare') {
    validatePlan(saved(planFile), current);
    if (!Object.hasOwn(receiptFor('start').digests, planFile)) assert(receiptFor('plan').exitCode === 0, 'Save the plan before prepare.');
    execute(block('cat > "$CHOOM_STAGE2/profile.mjs"'), 'profile');
    execute(block("node --input-type=module <<'JS'", 'knip-input.json'), 'inventory');
    Object.assign(record.digests, digests(['profile.mjs', 'knip-profile.json', 'preflight.json',
      ...(json('preflight.json').status === 'eligible' ? ['knip-input.json'] : [])]));
    return;
  }
  assert(receiptFor('prepare').exitCode === 0, 'Prepare must succeed before continuing.');

  if (action === 'toolchain') {
    const eligible = json('preflight.json').status === 'eligible';
    if (eligible) {
      execute('if command -v docker >/dev/null 2>&1; then\n' +
        block('mkdir "$CHOOM_STAGE2/toolchain"') +
        block('if [ -n "$CHOOM_KNIP_IMAGE" ]; then', 'toolchain/metadata.json') +
        "else\n  printf 'Docker is unavailable.\\n'\nfi\n", 'image');
    }
    const selected = eligible ? selection() : {
      status: 'unavailable', imageId: null, reason: 'Preflight marked this profile unsupported.',
    };
    saveJson('toolchain-selection.json', selected);
    record.selection = selected;
    Object.assign(record.digests, digests(['toolchain-selection.json', ...imageFiles.filter(name =>
      lstatSync(join(attempt, name), { throwIfNoEntry: false }))]));
    writeSync(stdout, JSON.stringify(selected, null, 2) + '\n');
    assert(selected.status === 'approved' || !eligible,
      'No tool image was approved. Run can still record skipped Knip outcomes.');
    return;
  }

  const toolchain = receiptFor('toolchain');
  if (toolchain.exitCode === 0 && toolchain.selection?.status === 'approved') {
    const selected = selection();
    assert(isDeepStrictEqual(selected, toolchain.selection), 'Approved image evidence changed.');
    env.CHOOM_KNIP_IMAGE = selected.imageId;
  }
  execute(block('cat > "$CHOOM_STAGE2/run-knip.mjs"'), 'knip');
  Object.assign(record.digests, digests(['run-knip.mjs', 'knip-runs.json']));
}

if (action === 'start') {
  assert(self === join(tools, 'docs/design/app-a/stage-2-commands.mjs'), 'Start from the tool checkout.');
  mkdirSync(attempt);
  save('commands.md', '# Stage 2 commands\n');
} else {
  assert(self === savedSelf && realpathSync(attempt) === attempt && realpathSync(self) === self,
    'Use the saved driver in the prepared attempt.');
  saved('commands.md');
}

const stem = 'operator-' + action;
let receiptStem = stem;
if (action === 'excerpt') {
  let n = 1;
  while (lstatSync(join(attempt, 'operator-excerpt-' + String(n).padStart(3, '0') + '.json'), { throwIfNoEntry: false })) n++;
  receiptStem += '-' + String(n).padStart(3, '0');
}
if (action === 'finish') {
  state(true);
  assert(receiptFor('start').exitCode === 0 && receiptFor('run').exitCode === 0 && receiptFor('save-review').exitCode === 0,
    'Start, run and save-review must succeed before finish.');
  const script = 'operator-finish.sh';
  save(script, 'set -eCu\n' + block('cat > "$CHOOM_STAGE2/finish.mjs"'));
  appendFileSync(join(attempt, 'commands.md'), '\n' + utc() + ' Publish with ' + JSON.stringify([process.execPath, self, 'finish']) +
    '. The finalizer registers this command and the saved recipe; no log writes follow success.\n');
  const result = spawnSync('/bin/bash', [join(attempt, script)], { cwd: attempt, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const stdoutName = receiptStem + '.stdout.txt';
const stderrName = receiptStem + '.stderr.txt';
const record = {
  formatVersion: 1, attemptId: id, action, startedAt: utc(),
  args: [process.execPath, self, action, ...args],
  node: process.version, commands: [], digests: {}, exitCode: 0, stdout: stdoutName, stderr: stderrName,
};
assert(!lstatSync(join(attempt, receiptStem + '.json'), { throwIfNoEntry: false }), 'Phase already recorded: ' + action);
const stdout = openSync(join(attempt, stdoutName), 'wx');
let stderr;
try {
  stderr = openSync(join(attempt, stderrName), 'wx');
  phase(record, stdout, stderr);
} catch (error) {
  record.exitCode = 1;
  record.error = error.message;
  if (stderr !== undefined) writeSync(stderr, (error.stack || error.message) + '\n');
} finally {
  closeSync(stdout);
  if (stderr !== undefined) closeSync(stderr);
  record.finishedAt = utc();
  saveJson(receiptStem + '.json', record);
  appendFileSync(join(attempt, 'commands.md'), [
    '', '## ' + action + ' ' + record.startedAt, '',
    'Command ' + JSON.stringify(record.args),
    ...record.commands.map(command => 'Saved command ' + JSON.stringify(command.args) +
      ' exited ' + command.exitCode + (command.signal ? ' (' + command.signal + ')' : '')),
    'Finished ' + record.finishedAt + '. Exit code ' + record.exitCode + '.',
    'Receipt ' + receiptStem + '.json. Output ' + stdoutName + ' and ' + stderrName + '.', '',
  ].join('\n'));
}
process.stdout.write(saved(stdoutName));
if (stderr !== undefined) process.stderr.write(saved(stderrName));
process.exitCode = record.exitCode;
