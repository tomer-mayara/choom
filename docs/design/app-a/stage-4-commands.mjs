import { createHash, randomBytes } from 'node:crypto';
import {
  appendFileSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, realpathSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const self = fileURLToPath(import.meta.url);
const [action, ...args] = process.argv.slice(2);
const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE4_ID: id } = process.env;
const toolsToFreeze = ['stage-4-commands.mjs', 'stage-4-graph.mjs', 'stage-4-inspect.mjs',
  'step-4-cookbook.md', 'inventory-view.py', 'stage-4-5-publish.mjs', 'stage-6-records.mjs', 'record-format.md',
  'run-layout.mjs'];
const drafts = ['run', 'discovery', 'baseline'];
const maxOutputBytes = 64 * 1024 * 1024;
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const compilerKeys = ['target', 'module', 'moduleResolution', 'jsx', 'verbatimModuleSyntax'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const utc = () => new Date().toISOString();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const exists = path => Boolean(lstatSync(path, { throwIfNoEntry: false }));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function safePath(path) {
  return text(path) && !isAbsolute(path) && !/[\\\u0000-\u001f\u007f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}
function directory(path) {
  assert(isAbsolute(path ?? '') && lstatSync(path).isDirectory() && realpathSync(path) === path,
    'Expected a canonical directory: ' + path);
  return path;
}
function read(path) {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { assert(fstatSync(fd).isFile(), 'Expected a regular file.'); return readFileSync(fd); }
  finally { closeSync(fd); }
}
function files(root, prefix = '') {
  return readdirSync(join(root, prefix)).sort().flatMap(name => {
    const path = prefix ? prefix + '/' + name : name;
    assert(safePath(path), 'Unsupported filename: ' + path);
    const absolute = join(root, path);
    if (lstatSync(absolute).isDirectory()) { directory(absolute); return files(root, path); }
    read(absolute);
    return [path];
  });
}

assert(['start', 'toolchain', 'run'].includes(action) && args.length === 0, 'Use start, toolchain, or run.');
assert(/^s4-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id ?? ''), 'Set CHOOM_STAGE4_ID to an s4-... ID.');
const work = directory(CHOOM_WORK);
const tools = directory(CHOOM_TOOLS);
assert(work !== tools && !tools.startsWith(work + '/'), 'Keep trusted tools outside CHOOM_WORK.');
const attempt = join(directory(join(work, 'evidence')), id);
assert(!process.env.CHOOM_STAGE4 || process.env.CHOOM_STAGE4 === attempt, 'CHOOM_STAGE4 does not match the attempt.');
const sourceSelf = join(tools, 'docs/design/app-a/stage-4-commands.mjs');
assert(self === (action === 'start' ? sourceSelf : join(attempt, 'stage-4-commands.mjs')),
  'Use the trusted checkout for start and the frozen attempt helper for later commands.');
const require = createRequire(join(tools, 'package.json'));
function trustedModule(name) {
  const path = require.resolve(name);
  assert(path.startsWith(join(tools, 'node_modules', name) + '/') && realpathSync(path) === path,
    'Install ' + name + ' in the trusted tool checkout.');
  return require(path);
}
const { parse } = trustedModule('yaml');
const saved = name => { assert(safePath(name), 'Invalid attempt path.'); return read(join(attempt, name)); };
const json = name => JSON.parse(saved(name));
const save = (name, bytes) => { assert(safePath(name), 'Invalid output path.'); writeFileSync(join(attempt, name), bytes, { flag: 'wx' }); };
const saveJson = (name, value) => save(name, JSON.stringify(value, null, 2) + '\n');
const artifactId = name => id + '-file@' + encodeURIComponent(name);
const digests = names => Object.fromEntries(names.map(name => [name, hash(saved(name))]));

function state() {
  const inputs = Object.fromEntries(drafts.map(name => [name, read(join(work, name + '.yaml'))]));
  const { run, discovery, baseline } = Object.fromEntries(drafts.map(name => [name, parse(inputs[name].toString())]));
  assert(run?.formatVersion === 1 && run.mode === 'A' && run.status === 'in-progress' &&
    run.progress?.inventory === 'complete' && run.progress.entryAnalysis === 'complete' &&
    run.progress.inspectionPriorities === 'complete' && run.progress.baselineRecovery === 'pending' &&
    run.snapshot?.root === 'snapshot' && text(run.snapshot.id) && object(run.artifacts),
  'Expected finalized Stage 3 and pending baseline recovery.');
  assert(discovery?.kind === 'architecture-discovery' && discovery.runRef === run.id &&
    !['baselineRef', 'overview', 'inspectedPaths', 'codeMappingRef', 'dependenciesRef', 'resourceAccessRef']
      .some(key => Object.hasOwn(discovery, key)), 'Discovery has advanced past this handoff.');
  assert(baseline?.formatVersion === 1 && baseline.parentId === null &&
    ['components', 'interfaces', 'resources', 'rules'].every(key => Array.isArray(baseline[key]) && !baseline[key].length),
  'Expected the empty initial baseline.');
  const artifacts = new Map();
  for (const [ref, record] of Object.entries(run.artifacts)) {
    assert(safePath(record?.path) && sha256(record.sha256) &&
      !drafts.some(name => record.path === name + '.yaml') && !record.path.startsWith('evidence/' + id + '/'),
    'Invalid or already registered artifact: ' + ref);
    const bytes = read(join(work, record.path));
    assert(hash(bytes) === record.sha256, 'Registered artifact changed: ' + ref);
    artifacts.set(ref, { ...record, bytes });
  }
  function artifact(ref) { assert(artifacts.has(ref), 'Missing registered artifact: ' + ref); return artifacts.get(ref); }
  const selected = artifact(discovery.entryAnalysisRef);
  const entry = parse(selected.bytes.toString());
  assert(/^s3-.+-entry-analysis$/.test(discovery.entryAnalysisRef) && entry?.kind === 'entry-analysis' &&
    entry.snapshotRef === run.snapshot.id && entry.knipAssessment?.action === 'reuse' &&
    Array.isArray(entry.inspectionPriorities) && entry.inspectionPriorities.length,
  'Expected the finalized Stage 3 entry analysis.');
  const inventory = JSON.parse(artifact(run.snapshot.inventoryRef).bytes);
  assert(inventory.formatVersion === 1 && inventory.snapshotId === run.snapshot.id && Array.isArray(inventory.files),
    'Inventory snapshot mismatch.');
  const indexed = new Map();
  for (const file of inventory.files) {
    assert(safePath(file?.path) && !indexed.has(file.path) && file.kind === 'file' && sha256(file.sha256),
      'This graph profile requires unique regular inventory files.');
    indexed.set(file.path, file);
  }
  directory(join(work, 'snapshot'));
  const loadingRef = discovery.entryAnalysisRef.replace(/-entry-analysis$/, '-file@loading-search.json');
  const loading = JSON.parse(artifact(loadingRef).bytes);
  assert(loading.snapshotRef === run.snapshot.id && loading.status === 'completed' && Array.isArray(loading.scope) &&
    loading.scope.length && loading.scope.every(file => indexed.get(file.path)?.sha256 === file.sha256) &&
    new Set(loading.scope.map(file => file.path)).size === loading.scope.length, 'Invalid saved Stage 3 query scope.');
  const settingsRef = 'settings-001';
  const settings = JSON.parse(artifact(settingsRef).bytes);
  const plan = JSON.parse(artifact(entry.planRef).bytes);
  artifact(entry.knipRunsRef);
  assert(settings.snapshotId === run.snapshot.id && plan.snapshotRef === run.snapshot.id,
    'Settings or retained Knip plan describe a different snapshot.');
  const facts = { formatVersion: 1, attemptId: id, runRef: run.id, snapshotRef: run.snapshot.id,
    entryAnalysisRef: discovery.entryAnalysisRef, inventoryRef: run.snapshot.inventoryRef, settingsRef,
    planRef: entry.planRef, knipRunsRef: entry.knipRunsRef, loadingRef, work, tools,
    registeredArtifacts: artifacts.size,
    checkpointDigests: Object.fromEntries(drafts.map(name => [name + '.before.yaml', hash(inputs[name])])) };
  return { inputs, run, discovery, baseline, entry, artifact, indexed, loading, settings, plan, facts };
}

function checkSnapshotMetadata(current) {
  const counts = { missing: 0, type: 0, path: 0, size: 0, unavailable: 0, inventory: 0 };
  const samples = [];
  function problem(kind, file, reason) {
    counts[kind] += 1;
    if (samples.length < 12) samples.push(file.path.slice(0, 240) + ': ' + reason);
  }
  for (const file of current.indexed.values()) {
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      problem('inventory', file, 'invalid inventory byte count');
      continue;
    }
    const path = join(work, 'snapshot', file.path);
    try {
      const stat = lstatSync(path);
      if (!stat.isFile()) problem('type', file, 'expected a regular file; found another file type');
      else if (realpathSync(path) !== path) problem('path', file, 'path resolves outside its saved location');
      else if (stat.size !== file.bytes) problem('size', file, `expected ${file.bytes} bytes; found ${stat.size}`);
    } catch (error) {
      problem(error.code === 'ENOENT' ? 'missing' : 'unavailable', file,
        error.code === 'ENOENT' ? 'missing' : 'metadata could not be read (' + (error.code ?? 'unknown error') + ')');
    }
  }
  const failures = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (failures) {
    const labels = { missing: 'missing', type: 'wrong file type', path: 'noncanonical path',
      size: 'wrong byte size', unavailable: 'unavailable metadata', inventory: 'invalid inventory size' };
    const summary = Object.entries(counts).filter(([, count]) => count)
      .map(([kind, count]) => count + ' ' + labels[kind]).join(', ');
    throw new Error(`Snapshot metadata preflight failed for ${failures} of ${current.indexed.size} indexed files: ${summary}.\n` +
      samples.map(sample => '- ' + sample).join('\n') +
      (failures > samples.length ? `\n${failures - samples.length} further problem files are not listed.` : '') +
      '\nNo attempt was created. Restore the exact saved files from a backup, or capture a new snapshot and start a new run. ' +
      'Keep the existing inventory and evidence unchanged. This preflight checks paths, file types, and byte sizes; content hashing remains a run check.');
  }
}

function profile(state) {
  const { settings, plan, loading, indexed, facts } = state;
  assert(Array.isArray(plan.workspaces) && plan.workspaces.some(workspace => workspace.dir === '.') &&
    plan.workspaces.every(workspace => (workspace.dir === '.' || safePath(workspace.dir)) &&
      Array.isArray(workspace.entry) && workspace.entry.every(text)), 'Invalid saved workspace entry patterns.');
  const sourceFiles = loading.scope.map(({ path, sha256 }) => ({ path, sha256 }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert(sourceFiles.length && sourceFiles.every(file => sourceExtension.test(file.path) && !/[!*?{}\[\]()]/.test(file.path)),
    'This profile needs saved JS/TS source with no glob characters in its filenames.');
  const selected = new Set(sourceFiles.map(file => file.path));
  const configurationLimits = [];
  const groups = [];
  const covered = new Set();
  for (const [index, config] of (settings.configs ?? []).entries()) {
    const ref = facts.settingsRef + '#/configs/' + index;
    if (config.status !== 'parsed' || !Array.isArray(config.fileNames)) {
      configurationLimits.push({ configRef: ref, reason: 'No fully parsed saved file selection; affected files use another supported context or the fallback.' });
      continue;
    }
    const configured = new Set(config.fileNames.map(path => path.startsWith('/repo/') ? path.slice(6) : path));
    const files = sourceFiles.filter(file => configured.has(file.path));
    if (!files.length) {
      configurationLimits.push({ configRef: ref, reason: 'This compiler context selects no indexed JS/TS scan files.' });
      continue;
    }
    const options = Object.fromEntries(compilerKeys.filter(key => Object.hasOwn(config.compilerOptions ?? {}, key))
      .map(key => [key, config.compilerOptions[key]]));
    assert(Object.entries(options).every(([key, value]) => key === 'verbatimModuleSyntax'
      ? typeof value === 'boolean' : Number.isSafeInteger(value) && value >= 0), 'Unsupported compiler option values: ' + config.path);
    const aliases = [];
    const paths = config.compilerOptions?.paths ?? {};
    const base = config.compilerOptions?.baseUrl ?? config.compilerOptions?.pathsBasePath;
    for (const [name, targets] of Object.entries(paths)) {
      const target = Array.isArray(targets) && targets.length === 1 && text(targets[0]) && text(base)
        ? posix.resolve(base, targets[0]) : null;
      if (!/^[A-Za-z0-9@._/-]+\*?$/.test(name) || !target?.startsWith('/repo/') ||
        !/^[A-Za-z0-9._/-]+\*?$/.test(target) || name.endsWith('*') !== target.endsWith('*')) {
        configurationLimits.push({ configRef: ref, reason: 'Alias is outside the supported single-target form and was omitted: ' + name });
        continue;
      }
      aliases.push({ name, alias: target });
    }
    if (config.compilerOptions?.baseUrl)
      configurationLimits.push({ configRef: ref, reason: 'baseUrl-only bare imports are not resolved; only the recorded explicit path aliases are approximated.' });
    groups.push({ name: 'compiler-' + (index + 1), files, ref, options, aliases });
    files.forEach(file => covered.add(file.path));
  }
  const fallback = sourceFiles.filter(file => !covered.has(file.path));
  if (fallback.length) groups.push({ name: 'fallback', files: fallback, ref: null, options: {}, aliases: [] });
  const picomatch = trustedModule('picomatch');
  const selectors = plan.workspaces.map((workspace, workspaceIndex) => ({
    dir: workspace.dir,
    patterns: workspace.entry.map((pattern, index) => {
      const source = pattern.replace(/!$/, '');
      const excluded = source.startsWith('!');
      assert(source.length > (excluded ? 1 : 0), 'Empty entry pattern.');
      return { excluded, match: picomatch(excluded ? source.slice(1) : source, { dot: true }),
        ref: facts.planRef + '#/workspaces/' + workspaceIndex + '/entry/' + index };
    }),
  }));
  function rootEvidence(path) {
    return [...new Set(selectors.flatMap(({ dir, patterns }) => {
      if (dir !== '.' && !path.startsWith(dir + '/')) return [];
      const relative = dir === '.' ? path : path.slice(dir.length + 1);
      if (patterns.some(pattern => pattern.excluded && pattern.match(relative))) return [];
      return patterns.filter(pattern => !pattern.excluded && pattern.match(relative)).map(pattern => pattern.ref);
    }))];
  }
  const contexts = groups.flatMap(group => ['import', 'require'].map(mode => ({
    id: group.name + '-' + mode, compilerSettingsRef: group.ref,
    sourceFiles: group.files.map(file => file.path), compilerOptions: group.options,
    aliases: group.aliases, conditionNames: [mode, 'default'],
    moduleSystems: mode === 'import' ? ['es6', 'tsd'] : ['cjs'],
    roots: group.files.flatMap(file => {
      const evidenceRefs = rootEvidence(file.path);
      return evidenceRefs.length ? [{ path: file.path, evidenceRefs }] : [];
    }),
  })));
  const outsideScope = [...indexed.values()].filter(file => sourceExtension.test(file.path) && !selected.has(file.path));
  return {
    graph: { formatVersion: 1, snapshotRef: facts.snapshotRef, attemptId: id, sourceFiles, contexts },
    notes: { formatVersion: 1, snapshotRef: facts.snapshotRef, scopeRef: facts.loadingRef + '#/scope',
      settingsRef: facts.settingsRef, planRef: facts.planRef,
      groups: groups.map(group => ({ name: group.name, files: group.files.length, compilerSettingsRef: group.ref })),
      configurationLimits,
      outsideScope: outsideScope.map(({ path, sha256 }) => ({ path, sha256, status: 'unassessed' })),
      limits: ['Scan files come from all indexed regular JavaScript and TypeScript files in the Stage 3 source query.',
        "Explicit traversal roots use the retained entry patterns in each saved workspace; they are not Knip's complete effective roots.",
        'Each parsed compiler file selection is a separate context. Overlapping selections stay separate; remaining source uses a named configuration-free fallback.',
        'Import and require are separate, platform-neutral passes. Browser, Node, Bun, custom, and type-specific package conditions remain outside this profile.',
        'Compiler inclusion does not claim production use, execution, or ownership. Referenced project contexts are not merged.',
        'Only target, module, moduleResolution, jsx, and verbatimModuleSyntax are passed to the parser.',
        'Recorded single-target path aliases approximate source resolution; omitted alias forms remain gaps and TypeScript paths do not establish runtime rewriting.',
        'Ambient declarations, package dependencies, non-JS/TS source and cross-context traversal remain limited.'] },
  };
}

function checkFrozen(current) {
  directory(attempt);
  const handoff = json('handoff.json');
  for (const [key, value] of Object.entries(current.facts))
    assert(isDeepStrictEqual(handoff[key], value), 'The prepared handoff changed: ' + key);
  for (const name of drafts) assert(saved(name + '.before.yaml').equals(current.inputs[name]), 'Draft changed: ' + name);
  assert(isDeepStrictEqual(handoff.toolInputDigests, digests(toolsToFreeze)) &&
    handoff.graphProfileSha256 === hash(saved('graph-profile.json')) &&
    handoff.profileNotesSha256 === hash(saved('graph-profile-notes.json')), 'A frozen tool or profile changed.');
  return handoff;
}
function receipt(phase) {
  const value = json('operator-' + phase + '.json');
  const required = phase === 'start' ? [...toolsToFreeze, ...drafts.map(name => name + '.before.yaml'),
    'handoff.json', 'graph-profile.json', 'graph-profile-notes.json']
    : ['toolchain-selection.json', 'toolchain/Dockerfile', 'toolchain/build-image-id.txt',
      'toolchain/package-lock.json', 'toolchain/fixture.stdout.txt', 'toolchain/fixture-container.json'];
  const logs = ['.started.json', '.stdout.txt', '.stderr.txt'].map(suffix => 'operator-' + phase + suffix);
  assert(value.formatVersion === 1 && value.phase === phase && value.action === phase && value.attemptId === id &&
    value.status === 'completed' && value.exitCode === 0 && object(value.digests) && object(value.logDigests) &&
    required.every(name => Object.hasOwn(value.digests, name)) &&
    isDeepStrictEqual(Object.keys(value.logDigests).sort(), logs.sort()) &&
    !Object.keys(value.digests).some(name => logs.includes(name)) &&
    value.command?.args?.[1] === (phase === 'start' ? sourceSelf : join(attempt, 'stage-4-commands.mjs')) &&
    isDeepStrictEqual(value.command.args.slice(2), [phase]) &&
    [value.digests, value.logDigests].every(records => Object.entries(records)
      .every(([name, digest]) => hash(saved(name)) === digest)),
  'The ' + phase + ' action failed or its evidence changed. Use a new attempt.');
  return value;
}

const childEnv = { ...process.env };
for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'BASH_ENV', 'ENV', 'PYTHONPATH', 'PYTHONSTARTUP', 'PYTHONINSPECT']) delete childEnv[name];
let endpoint = null;
function command(program, arguments_, stem, timeoutMs, input) {
  const actualArgs = program === 'docker' && endpoint ? ['--host', endpoint, ...arguments_] : arguments_;
  const result = { command: program, args: actualArgs, startedAt: utc(), timeoutMs, maxOutputBytes,
    stdout: stem + '.stdout.txt', stderr: stem + '.stderr.txt' };
  const execution = spawnSync(program, actualArgs, { input, maxBuffer: maxOutputBytes, timeout: timeoutMs,
    env: endpoint && program === 'docker' ? { ...childEnv, DOCKER_CONTEXT: '' } : childEnv });
  save(result.stdout, execution.stdout ?? Buffer.alloc(0)); save(result.stderr, execution.stderr ?? Buffer.alloc(0));
  Object.assign(result, { finishedAt: utc(), exitCode: execution.status, signal: execution.signal,
    error: execution.error ? { code: execution.error.code ?? null, message: execution.error.message } : null });
  saveJson(stem + '.json', result);
  return result;
}
const succeeded = result => result.exitCode === 0 && !result.signal && !result.error;
function selectDocker(stem) {
  const context = process.env.DOCKER_CONTEXT || null;
  const host = process.env.DOCKER_HOST || null;
  let selection;
  if (host && !context) selection = { context: null, endpoint: host };
  else {
    const result = command('docker', ['context', 'inspect', '--format',
      '{"context":{{json .Name}},"endpoint":{{json .Endpoints.docker.Host}}}', ...(context ? [context] : [])], stem, 30000);
    assert(succeeded(result), 'Docker context inspection failed; see ' + result.stderr);
    selection = JSON.parse(saved(result.stdout));
  }
  assert(/^unix:\/\/\//.test(selection.endpoint ?? '') && !/[\r\n\0]/.test(selection.endpoint),
    'Only a local Unix Docker endpoint with shared bind mounts is supported.');
  endpoint = selection.endpoint;
  return selection;
}
function mount(path, target) {
  assert(!/[,\r\n\0]/.test(path), 'Unsupported Docker mount path.');
  return ['--mount', 'type=bind,source=' + path + ',target=' + target + ',readonly'];
}
function container(imageId, nodeArgs, stem, mounts = [], cwd = '/tmp') {
  const name = 'choom-' + id.slice(0, 40) + '-' + stem.replaceAll('/', '-') + '-' + randomBytes(5).toString('hex');
  const result = command('docker', ['run', '--rm', '--pull=never', '--name', name,
    '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', '65532:65532', '--pids-limit', '128', '--memory', '2g', '--memory-swap', '2g', '--cpus', '2',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=512m,mode=1777', ...mounts,
    '--workdir', cwd, '--entrypoint', 'node', imageId, ...nodeArgs], stem, 300000);
  let removal = null;
  if (!succeeded(result)) removal = command('docker', ['rm', '--force', name], stem + '-cleanup', 30000);
  const check = command('docker', ['ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}'],
    stem + '-cleanup-check', 30000);
  const cleanup = { status: succeeded(check) && saved(check.stdout).toString().trim() === '' ? 'confirmed' : 'unconfirmed',
    containerName: name, removal, check };
  saveJson(stem + '-container.json', { result, cleanup });
  assert(cleanup.status === 'confirmed', 'Container cleanup is unconfirmed. Stop and remove ' + name + ' before another attempt.');
  return result;
}

function toolchain() {
  receipt('start');
  mkdirSync(join(attempt, 'toolchain'));
  const dockerEndpoint = selectDocker('toolchain/context');
  const dockerfile = 'FROM node:24-bookworm-slim\nWORKDIR /opt/choom-tools\n' +
    'RUN npm install --ignore-scripts --omit=optional --legacy-peer-deps --no-audit --no-fund ' +
    'dependency-cruiser@18.7.2 typescript@6.0.2 enhanced-resolve@5.26.0\n';
  save('toolchain/Dockerfile', dockerfile);
  const build = command('docker', ['build', '--progress=plain', '--iidfile', join(attempt, 'toolchain/build-image-id.txt'), '-'],
    'toolchain/build', 900000, dockerfile);
  assert(succeeded(build), 'Tool image build failed; see saved build logs. The target was not mounted.');
  const imageId = saved('toolchain/build-image-id.txt').toString().trim();
  assert(/^sha256:[a-f0-9]{64}$/.test(imageId), 'Expected a concrete image ID.');
  const inspect = command('docker', ['image', 'inspect', '--format', '{{.Id}}', imageId], 'toolchain/image', 30000);
  assert(succeeded(inspect) && saved(inspect.stdout).toString().trim() === imageId, 'Built image identity mismatch.');
  const fixture = container(imageId, ['/control/stage-4-graph.mjs', '--fixture'], 'toolchain/fixture',
    mount(join(attempt, 'stage-4-graph.mjs'), '/control/stage-4-graph.mjs'));
  assert(succeeded(fixture), 'Image fixture failed; do not run it on the snapshot.');
  const check = JSON.parse(saved(fixture.stdout));
  assert(check.status === 'approved' && check.toolVersions?.dependencyCruiser === '18.7.2' &&
    check.toolVersions.typescript === '6.0.2' && check.toolVersions.enhancedResolve === '5.26.0',
  'The image fixture did not approve the required tools.');
  const lock = container(imageId, ['--input-type=module', '-e',
    "import {readFileSync} from 'node:fs'; process.stdout.write(readFileSync('/opt/choom-tools/package-lock.json'));"], 'toolchain/lock');
  assert(succeeded(lock), 'Could not record the toolchain lockfile.');
  const lockBytes = saved(lock.stdout); JSON.parse(lockBytes); save('toolchain/package-lock.json', lockBytes);
  saveJson('toolchain-selection.json', { formatVersion: 1, status: 'approved', imageId, dockerEndpoint,
    toolVersions: check.toolVersions, fixtureRef: artifactId(fixture.stdout), fixtureSha256: hash(saved(fixture.stdout)),
    packageLockRef: artifactId('toolchain/package-lock.json'), packageLockSha256: hash(lockBytes),
    checkedAt: utc(), limits: ['The image build may use the network to install trusted tools. No target input is part of the build.',
      'The fixture verifies this pinned analysis profile; it is not a general security certification.'] });
  return 'Graph toolchain approved: ' + imageId;
}

function graphRun(current) {
  receipt('start'); receipt('toolchain');
  const chosen = json('toolchain-selection.json');
  assert(chosen.status === 'approved' && /^sha256:[a-f0-9]{64}$/.test(chosen.imageId), 'No approved graph image.');
  const dockerEndpoint = selectDocker('graph-context');
  assert(dockerEndpoint.endpoint === chosen.dockerEndpoint.endpoint, 'Docker endpoint differs from the approved toolchain.');
  const inspect = command('docker', ['image', 'inspect', '--format', '{{.Id}}', chosen.imageId], 'graph-image', 30000);
  assert(succeeded(inspect) && saved(inspect.stdout).toString().trim() === chosen.imageId, 'Approved image is unavailable.');
  const inventory = current.artifact(current.facts.inventoryRef);
  const inputRoot = join(work, 'knip-input-' + inventory.sha256);
  const viewArgs = [work, join(work, inventory.path), inventory.sha256, current.facts.snapshotRef, id];
  function view(operation, stem) {
    const result = command('python3', [join(attempt, 'inventory-view.py'), operation, ...viewArgs], stem, 900000);
    assert(succeeded(result), 'Inventory input ' + operation + ' failed; see ' + result.stderr);
    const value = JSON.parse(saved(result.stdout));
    assert(value.status === 'verified' && value.snapshotRef === current.facts.snapshotRef && value.attemptId === id &&
      value.viewRoot === inputRoot && value.inventorySha256 === inventory.sha256 && value.unindexedInputsAvailable === false,
    'Inventory input receipt mismatch.');
    return { operation, receiptRef: artifactId(result.stdout), sha256: hash(saved(result.stdout)), result };
  }
  const prepared = view('prepare', 'graph-input-prepare');
  const before = view('verify', 'graph-input-before');
  const result = container(chosen.imageId, ['/control/stage-4-graph.mjs', '/control/graph-profile.json'], 'graph',
    [...mount(directory(inputRoot), '/repo'), ...mount(attempt, '/control')], '/repo');
  const after = view('verify', 'graph-input-after');
  const report = { formatVersion: 1, attemptId: id, snapshotRef: current.facts.snapshotRef, profileRef: artifactId('graph-profile.json'),
    profileSha256: hash(saved('graph-profile.json')), imageId: chosen.imageId, dockerEndpoint,
    toolInputDigests: digests(toolsToFreeze), inventoryRef: current.facts.inventoryRef, inventorySha256: inventory.sha256,
    inputView: { root: inputRoot, prepared, before, after }, result, status: 'failed', graphRef: null };
  try {
    assert(succeeded(result), 'Graph extraction failed; raw output is preserved.');
    const graph = JSON.parse(saved(result.stdout));
    const profile = json('graph-profile.json');
    assert(graph.formatVersion === 1 && graph.snapshotRef === profile.snapshotRef &&
      graph.profileRef === artifactId('graph-profile.json') && ['completed', 'partial'].includes(graph.status) &&
      isDeepStrictEqual(graph.toolVersions, chosen.toolVersions) &&
      Array.isArray(graph.contexts) && graph.contexts.length === profile.contexts.length,
    'Graph output identity or context count is invalid.');
    for (let index = 0; index < profile.contexts.length; index++) {
      const expected = profile.contexts[index]; const context = graph.contexts[index];
      assert(context.id === expected.id && ['completed', 'failed'].includes(context.status) &&
        isDeepStrictEqual(context.scanFiles, expected.sourceFiles) &&
        isDeepStrictEqual(context.conditionNames, expected.conditionNames) &&
        isDeepStrictEqual(context.moduleSystems, expected.moduleSystems) &&
        context.compilerSettingsRef === expected.compilerSettingsRef &&
        isDeepStrictEqual(context.roots, expected.roots), 'Graph context differs from the profile: ' + expected.id);
    }
    save('graph-results.json', saved(result.stdout));
    report.status = graph.status;
    report.graphRef = artifactId('graph-results.json'); report.graphSha256 = hash(saved('graph-results.json'));
    assert(graph.status === 'completed' && graph.contexts.every(context => context.status === 'completed'),
      'The graph has partial execution. Review it before collecting component evidence.');
  } finally { saveJson('graph-run.json', report); }
  return 'Graph extraction completed. All contexts and the input view passed their checks. Drafts remain unchanged.';
}

let current;
if (action === 'start') {
  assert(!exists(attempt), 'Attempt already exists. Use a new Stage 4 ID.');
  current = state();
  try { checkSnapshotMetadata(current); }
  catch (error) { console.error(error.message); process.exit(1); }
  const prepared = profile(current);
  const frozen = Object.fromEntries(toolsToFreeze.map(name => [name, read(join(tools, 'docs/design/app-a', name))]));
  mkdirSync(attempt);
  for (const [name, bytes] of Object.entries(frozen)) save(name, bytes);
  for (const name of drafts) save(name + '.before.yaml', current.inputs[name]);
  saveJson('graph-profile.json', prepared.graph); saveJson('graph-profile-notes.json', prepared.notes);
  saveJson('handoff.json', { ...current.facts, toolInputDigests: digests(toolsToFreeze),
    graphProfileSha256: hash(saved('graph-profile.json')), profileNotesSha256: hash(saved('graph-profile-notes.json')) });
} else { current = state(); checkFrozen(current); }
const stem = 'operator-' + action;
assert(!exists(join(attempt, stem + '.started.json')), 'This phase already started. Use a new attempt.');
if (exists(join(attempt, 'commands.md'))) {
  saved('commands.md');
  assert(lstatSync(join(attempt, 'commands.md')).nlink === 1, 'Expected an independent command log.');
}
const initialFiles = action === 'start' ? new Set() : new Set(files(attempt));
const record = { formatVersion: 1, attemptId: id, phase: action, action,
  command: { args: process.argv, cwd: process.cwd(), environment: { CHOOM_WORK: work, CHOOM_TOOLS: tools,
    CHOOM_STAGE4_ID: id, CHOOM_STAGE4: attempt } }, startedAt: utc(), status: 'started' };
saveJson(stem + '.started.json', record);
let message; let error = null;
try {
  message = action === 'start' ? `Prepared ${id}: ${current.facts.registeredArtifacts} registered artifacts verified; ${json('graph-profile.json').contexts.length} graph contexts saved. ` +
    `Snapshot path, type, and size metadata checked for ${current.indexed.size} files; content hashing remains a run check.`
    : action === 'toolchain' ? toolchain() : graphRun(current);
  checkFrozen(state());
} catch (failure) { error = String(failure.message ?? failure).slice(0, 2000); }
save(stem + '.stdout.txt', message ? message + '\n' : '');
save(stem + '.stderr.txt', error ? error + '\n' : '');
const logs = [stem + '.started.json', stem + '.stdout.txt', stem + '.stderr.txt'];
const outputFiles = files(attempt).filter(name => !initialFiles.has(name) && !logs.includes(name) && name !== 'commands.md');
Object.assign(record, { finishedAt: utc(), status: error ? 'failed' : 'completed', exitCode: error ? 1 : 0,
  digests: digests(outputFiles), logDigests: digests(logs) });
saveJson(stem + '.json', record);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const commandLog = openSync(join(attempt, 'commands.md'),
  constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
try {
  const logStat = fstatSync(commandLog);
  assert(logStat.isFile() && logStat.nlink === 1, 'Expected an independent regular command log.');
  appendFileSync(commandLog, ['\n## ' + action, '', 'Started: ' + record.startedAt,
  'Finished: ' + record.finishedAt, 'Working directory: ' + record.command.cwd, '', '```sh',
  ...Object.entries(record.command.environment).map(([key, value]) => 'export ' + key + '=' + quote(value)),
  record.command.args.map(quote).join(' '), '```', '', 'Outcome: ' + record.status,
    'Receipt: ' + stem + '.json', '', message ?? error, ''].join('\n'));
} finally { closeSync(commandLog); }
if (error) { console.error(error); process.exitCode = 1; } else console.log(message);
