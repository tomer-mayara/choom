import { randomBytes } from 'node:crypto';
import {
  appendFileSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, realpathSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type * as Yaml from 'yaml';
import { refuseChangedProducerCode } from './producer-code.ts';
import { assert, type Fields, hash, object, text } from './record-checks.ts';
import { checkPinnedRules, readRules } from './rule-lists.ts';
import { graphProfile, type IndexedFile, type Picomatch, type ProfileFacts, safePath } from './stage-4-graph-profile.ts';
import { stageFourRuleLists } from './stage-4-rule-lists.ts';

// The Stage 4 helper. start checks the run after Stage 3 and saves the graph
// profile, toolchain builds and approves the graph image, and run extracts the
// graph in a container. Saved JSON and YAML stay unchecked values until the checks
// below read them.
interface RegisteredArtifact { path: string; sha256: string; bytes: Buffer }
interface Facts extends ProfileFacts {
  formatVersion: 1; attemptId: string; runRef: string; entryAnalysisRef: string; inventoryRef: string;
  knipRunsRef: string; work: string; tools: string; registeredArtifacts: number; checkpointDigests: Record<string, string>;
}
// The checked run after Stage 3 that an action starts from.
interface StageState {
  inputs: Record<string, Buffer>;
  artifact(ref: string): RegisteredArtifact;
  indexed: Map<string, IndexedFile>;
  loading: Fields;
  settings: Fields;
  plan: Fields;
  facts: Facts;
}
interface CommandRecord {
  command: string; args: string[]; startedAt: string; timeoutMs: number; maxOutputBytes: number; stdout: string; stderr: string;
  finishedAt?: string; exitCode?: number | null; signal?: string | null; error?: { code: unknown; message: string } | null;
}
interface DockerSelection { context: string | null; endpoint: string }
// The receipt of one action: its command, its outcome and the digests of what it saved.
interface OperatorRecord {
  formatVersion: 1; attemptId: string; phase: string; action: string;
  command: { args: string[]; cwd: string; environment: Record<string, string> };
  startedAt: string; status: string; finishedAt?: string; exitCode?: number;
  digests?: Record<string, string>; logDigests?: Record<string, string>;
}

const self = fileURLToPath(import.meta.url);
const [action = '', ...args] = process.argv.slice(2);
const { CHOOM_WORK, CHOOM_TOOLS } = process.env;
const id = process.env.CHOOM_STAGE4_ID ?? '';
// Start saves the documents that the stage follows and the rule lists, which the
// producer code record does not cover. Every action runs the producer code in the
// tool checkout after the producer code check, and refuses a changed rule list.
const toolsToFreeze = ['step-4-cookbook.md', 'record-format.md', ...stageFourRuleLists.map(list => list.file)];
// The graph helper in the tool checkout, and its path in the container, where each
// run mounts it. Node runs a .mts file as an ES module and removes its types, with
// no package.json and no module format detection.
const graphHelperSource = 'stage-4-graph.ts';
const graphHelper = '/producer/stage-4-graph.mts';
const drafts = ['run', 'discovery', 'baseline'];
const maxOutputBytes = 64 * 1024 * 1024;
const utc = (): string => new Date().toISOString();
const isDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const exists = (path: string): boolean => Boolean(lstatSync(path, { throwIfNoEntry: false }));

function directory(path: string | undefined): string {
  assert(isAbsolute(path ?? '') && lstatSync(path as string).isDirectory() && realpathSync(path as string) === path,
    'Expected a canonical directory: ' + path);
  return path as string;
}
function read(path: string): Buffer {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { assert(fstatSync(fd).isFile(), 'Expected a regular file.'); return readFileSync(fd); }
  finally { closeSync(fd); }
}
function files(root: string, prefix = ''): string[] {
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
assert(/^s4-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), 'Set CHOOM_STAGE4_ID to an s4-... ID.');
const work = directory(CHOOM_WORK);
const tools = directory(CHOOM_TOOLS);
assert(work !== tools && !tools.startsWith(work + '/'), 'Keep trusted tools outside CHOOM_WORK.');
const attempt = join(directory(join(work, 'evidence')), id);
assert(!process.env.CHOOM_STAGE4 || process.env.CHOOM_STAGE4 === attempt, 'CHOOM_STAGE4 does not match the attempt.');
// The cookbooks and record format stay in docs/design/app-a; the code is in packages/producer/src.
const ruleList = (name: string) => stageFourRuleLists.find(list => list.file === name);
const sourceTool = (name: string): string => join(tools, ruleList(name)?.path ??
  join(name.endsWith('.md') ? 'docs/design/app-a' : 'packages/producer/src', name));
const sourceSelf = sourceTool('stage-4-commands.ts');
assert(self === sourceSelf, 'Use the Stage 4 helper in the trusted checkout.');
refuseChangedProducerCode(work, tools);
const require = createRequire(join(tools, 'package.json'));
function trustedModule(name: string): unknown {
  const path = require.resolve(name);
  assert(path.startsWith(join(tools, 'node_modules', name) + '/') && realpathSync(path) === path,
    'Install ' + name + ' in the trusted tool checkout.');
  return require(path);
}
const yaml = trustedModule('yaml') as typeof Yaml;
const { parse } = yaml;
const saved = (name: string): Buffer => { assert(safePath(name), 'Invalid attempt path.'); return read(join(attempt, name)); };
const json = (name: string) => JSON.parse(saved(name).toString());
const save = (name: string, bytes: string | Buffer): void => {
  assert(safePath(name), 'Invalid output path.'); writeFileSync(join(attempt, name), bytes, { flag: 'wx' });
};
const saveJson = (name: string, value: unknown): void => save(name, JSON.stringify(value, null, 2) + '\n');
const artifactId = (name: string): string => id + '-file@' + encodeURIComponent(name);
const digests = (names: string[]): Record<string, string> => Object.fromEntries(names.map(name => [name, hash(saved(name))]));

// The working drafts after Stage 3: a finalized run, a discovery result that has
// not advanced past this handoff, and the empty initial baseline.
function readDrafts() {
  const inputs = Object.fromEntries(drafts.map(name => [name, read(join(work, name + '.yaml'))]));
  const { run, discovery, baseline } = Object.fromEntries(drafts.map(name => [name, parse((inputs[name] as Buffer).toString())]));
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
  return { inputs, run, discovery };
}

// The registered artifacts of the run, each checked against its digest.
function registeredArtifacts(run: Fields): { artifact: (ref: string) => RegisteredArtifact; count: number } {
  const artifacts = new Map<string, RegisteredArtifact>();
  for (const [ref, record] of Object.entries(run.artifacts as Record<string, Fields | null>)) {
    assert(safePath(record?.path) && isDigest(record.sha256) &&
      !drafts.some(name => record.path === name + '.yaml') && !record.path.startsWith('evidence/' + id + '/'),
    'Invalid or already registered artifact: ' + ref);
    const bytes = read(join(work, record.path));
    assert(hash(bytes) === record.sha256, 'Registered artifact changed: ' + ref);
    artifacts.set(ref, { ...record, bytes } as RegisteredArtifact);
  }
  function artifact(ref: string): RegisteredArtifact {
    assert(artifacts.has(ref), 'Missing registered artifact: ' + ref);
    return artifacts.get(ref) as RegisteredArtifact;
  }
  return { artifact, count: artifacts.size };
}

function indexedInventory(run: Fields, artifact: (ref: string) => RegisteredArtifact): Map<string, IndexedFile> {
  const snapshot = run.snapshot as Fields;
  const inventory = JSON.parse(artifact(snapshot.inventoryRef as string).bytes.toString());
  assert(inventory.formatVersion === 1 && inventory.snapshotId === snapshot.id && Array.isArray(inventory.files),
    'Inventory snapshot mismatch.');
  const indexed = new Map<string, IndexedFile>();
  for (const file of inventory.files) {
    assert(safePath(file?.path) && !indexed.has(file.path) && file.kind === 'file' && isDigest(file.sha256),
      'This graph profile requires unique regular inventory files.');
    indexed.set(file.path, file);
  }
  return indexed;
}

function state(): StageState {
  const { inputs, run, discovery } = readDrafts();
  const { artifact, count } = registeredArtifacts(run);
  const entry = parse(artifact(discovery.entryAnalysisRef).bytes.toString());
  assert(/^s3-.+-entry-analysis$/.test(discovery.entryAnalysisRef) && entry?.kind === 'entry-analysis' &&
    entry.snapshotRef === run.snapshot.id && entry.knipAssessment?.action === 'reuse' &&
    Array.isArray(entry.inspectionPriorities) && entry.inspectionPriorities.length,
  'Expected the finalized Stage 3 entry analysis.');
  const indexed = indexedInventory(run, artifact);
  directory(join(work, 'snapshot'));
  const loadingRef = discovery.entryAnalysisRef.replace(/-entry-analysis$/, '-file@loading-search.json');
  const loading = JSON.parse(artifact(loadingRef).bytes.toString());
  assert(loading.snapshotRef === run.snapshot.id && loading.status === 'completed' && Array.isArray(loading.scope) &&
    loading.scope.length && loading.scope.every((file: Fields) => indexed.get(file.path as string)?.sha256 === file.sha256) &&
    new Set(loading.scope.map((file: Fields) => file.path)).size === loading.scope.length, 'Invalid saved Stage 3 query scope.');
  const settingsRef = 'settings-001';
  const settings = JSON.parse(artifact(settingsRef).bytes.toString());
  const plan = JSON.parse(artifact(entry.planRef).bytes.toString());
  artifact(entry.knipRunsRef);
  assert(settings.snapshotId === run.snapshot.id && plan.snapshotRef === run.snapshot.id,
    'Settings or retained Knip plan describe a different snapshot.');
  const facts: Facts = { formatVersion: 1, attemptId: id, runRef: run.id, snapshotRef: run.snapshot.id,
    entryAnalysisRef: discovery.entryAnalysisRef, inventoryRef: run.snapshot.inventoryRef, settingsRef,
    planRef: entry.planRef, knipRunsRef: entry.knipRunsRef, loadingRef, work, tools,
    registeredArtifacts: count,
    checkpointDigests: Object.fromEntries(drafts.map(name => [name + '.before.yaml', hash(inputs[name] as Buffer)])) };
  return { inputs: inputs as Record<string, Buffer>, artifact, indexed, loading, settings, plan, facts };
}

function checkSnapshotMetadata(current: StageState): void {
  const counts = { missing: 0, type: 0, path: 0, size: 0, unavailable: 0, inventory: 0 };
  const samples: string[] = [];
  function problem(kind: keyof typeof counts, file: IndexedFile, reason: string): void {
    counts[kind] += 1;
    if (samples.length < 12) samples.push(file.path.slice(0, 240) + ': ' + reason);
  }
  for (const file of current.indexed.values()) {
    if (!Number.isSafeInteger(file.bytes) || (file.bytes as number) < 0) {
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
      const code = (error as NodeJS.ErrnoException).code;
      problem(code === 'ENOENT' ? 'missing' : 'unavailable', file,
        code === 'ENOENT' ? 'missing' : 'metadata could not be read (' + (code ?? 'unknown error') + ')');
    }
  }
  const failures = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (failures) {
    const labels = { missing: 'missing', type: 'wrong file type', path: 'noncanonical path',
      size: 'wrong byte size', unavailable: 'unavailable metadata', inventory: 'invalid inventory size' };
    const summary = Object.entries(counts).filter(([, count]) => count)
      .map(([kind, count]) => count + ' ' + labels[kind as keyof typeof counts]).join(', ');
    throw new Error(`Snapshot metadata preflight failed for ${failures} of ${current.indexed.size} indexed files: ${summary}.\n` +
      samples.map(sample => '- ' + sample).join('\n') +
      (failures > samples.length ? `\n${failures - samples.length} further problem files are not listed.` : '') +
      '\nNo attempt was created. Restore the exact saved files from a backup, or capture a new snapshot and start a new run. ' +
      'Keep the existing inventory and evidence unchanged. This preflight checks paths, file types, and byte sizes; content hashing remains a run check.');
  }
}

function checkFrozen(current: StageState): void {
  directory(attempt);
  const handoff = json('handoff.json');
  for (const [key, value] of Object.entries(current.facts))
    assert(isDeepStrictEqual(handoff[key], value), 'The prepared handoff changed: ' + key);
  for (const name of drafts) assert(saved(name + '.before.yaml').equals(current.inputs[name] as Buffer), 'Draft changed: ' + name);
  assert(isDeepStrictEqual(handoff.toolInputDigests, digests(toolsToFreeze)) &&
    handoff.graphProfileSha256 === hash(saved('graph-profile.json')) &&
    handoff.profileNotesSha256 === hash(saved('graph-profile-notes.json')), 'A frozen tool or profile changed.');
  for (const list of stageFourRuleLists) checkPinnedRules(list, saved(list.file), read(sourceTool(list.file)));
}
function receipt(phase: string): void {
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
    value.command?.args?.[1] === sourceSelf &&
    isDeepStrictEqual(value.command.args.slice(2), [phase]) &&
    [value.digests, value.logDigests].every(records => Object.entries(records)
      .every(([name, digest]) => hash(saved(name)) === digest)),
  'The ' + phase + ' action failed or its evidence changed. Use a new attempt.');
}

const childEnv = { ...process.env };
for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'BASH_ENV', 'ENV', 'PYTHONPATH', 'PYTHONSTARTUP', 'PYTHONINSPECT']) delete childEnv[name];
let endpoint: string | null = null;
function command(program: string, arguments_: string[], stem: string, timeoutMs: number, input?: string): CommandRecord {
  const actualArgs = program === 'docker' && endpoint ? ['--host', endpoint, ...arguments_] : arguments_;
  const result: CommandRecord = { command: program, args: actualArgs, startedAt: utc(), timeoutMs, maxOutputBytes,
    stdout: stem + '.stdout.txt', stderr: stem + '.stderr.txt' };
  const execution = spawnSync(program, actualArgs, { input, maxBuffer: maxOutputBytes, timeout: timeoutMs,
    env: endpoint && program === 'docker' ? { ...childEnv, DOCKER_CONTEXT: '' } : childEnv });
  save(result.stdout, execution.stdout ?? Buffer.alloc(0)); save(result.stderr, execution.stderr ?? Buffer.alloc(0));
  const failure = execution.error as NodeJS.ErrnoException | undefined;
  Object.assign(result, { finishedAt: utc(), exitCode: execution.status, signal: execution.signal,
    error: failure ? { code: failure.code ?? null, message: failure.message } : null });
  saveJson(stem + '.json', result);
  return result;
}
const succeeded = (result: CommandRecord): boolean => result.exitCode === 0 && !result.signal && !result.error;
function selectDocker(stem: string): DockerSelection {
  const context = process.env.DOCKER_CONTEXT || null;
  const host = process.env.DOCKER_HOST || null;
  let selection: DockerSelection;
  if (host && !context) selection = { context: null, endpoint: host };
  else {
    const result = command('docker', ['context', 'inspect', '--format',
      '{"context":{{json .Name}},"endpoint":{{json .Endpoints.docker.Host}}}', ...(context ? [context] : [])], stem, 30000);
    assert(succeeded(result), 'Docker context inspection failed; see ' + result.stderr);
    selection = JSON.parse(saved(result.stdout).toString());
  }
  assert(/^unix:\/\/\//.test(selection.endpoint ?? '') && !/[\r\n\0]/.test(selection.endpoint),
    'Only a local Unix Docker endpoint with shared bind mounts is supported.');
  endpoint = selection.endpoint;
  return selection;
}
function mount(path: string, target: string): string[] {
  assert(!/[,\r\n\0]/.test(path), 'Unsupported Docker mount path.');
  return ['--mount', 'type=bind,source=' + path + ',target=' + target + ',readonly'];
}
function container(imageId: string, nodeArgs: string[], stem: string, mounts: string[] = [], cwd = '/tmp'): CommandRecord {
  const name = 'choom-' + id.slice(0, 40) + '-' + stem.replaceAll('/', '-') + '-' + randomBytes(5).toString('hex');
  const result = command('docker', ['run', '--rm', '--pull=never', '--name', name,
    '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', '65532:65532', '--pids-limit', '128', '--memory', '2g', '--memory-swap', '2g', '--cpus', '2',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=512m,mode=1777', ...mounts,
    '--workdir', cwd, '--entrypoint', 'node', imageId, ...nodeArgs], stem, 300000);
  let removal: CommandRecord | null = null;
  if (!succeeded(result)) removal = command('docker', ['rm', '--force', name], stem + '-cleanup', 30000);
  const check = command('docker', ['ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}'],
    stem + '-cleanup-check', 30000);
  const cleanup = { status: succeeded(check) && saved(check.stdout).toString().trim() === '' ? 'confirmed' : 'unconfirmed',
    containerName: name, removal, check };
  saveJson(stem + '-container.json', { result, cleanup });
  assert(cleanup.status === 'confirmed', 'Container cleanup is unconfirmed. Stop and remove ' + name + ' before another attempt.');
  return result;
}

function toolchain(): string {
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
  const fixture = container(imageId, [graphHelper, '--fixture'], 'toolchain/fixture',
    mount(sourceTool(graphHelperSource), graphHelper));
  assert(succeeded(fixture), 'Image fixture failed; do not run it on the snapshot.');
  const check = JSON.parse(saved(fixture.stdout).toString());
  assert(check.status === 'approved' && check.toolVersions?.dependencyCruiser === '18.7.2' &&
    check.toolVersions.typescript === '6.0.2' && check.toolVersions.enhancedResolve === '5.26.0',
  'The image fixture did not approve the required tools.');
  const lock = container(imageId, ['--input-type=module', '-e',
    "import {readFileSync} from 'node:fs'; process.stdout.write(readFileSync('/opt/choom-tools/package-lock.json'));"], 'toolchain/lock');
  assert(succeeded(lock), 'Could not record the toolchain lockfile.');
  const lockBytes = saved(lock.stdout); JSON.parse(lockBytes.toString()); save('toolchain/package-lock.json', lockBytes);
  saveJson('toolchain-selection.json', { formatVersion: 1, status: 'approved', imageId, dockerEndpoint,
    toolVersions: check.toolVersions, fixtureRef: artifactId(fixture.stdout), fixtureSha256: hash(saved(fixture.stdout)),
    packageLockRef: artifactId('toolchain/package-lock.json'), packageLockSha256: hash(lockBytes),
    checkedAt: utc(), limits: ['The image build may use the network to install trusted tools. No target input is part of the build.',
      'The fixture verifies this pinned analysis profile; it is not a general security certification.'] });
  return 'Graph toolchain approved: ' + imageId;
}

// Prepares or verifies the inventory-only input view of the graph run and checks its receipt.
function inputView(current: StageState, operation: string, stem: string): Fields {
  const inventory = current.artifact(current.facts.inventoryRef);
  const inputRoot = join(work, 'knip-input-' + inventory.sha256);
  const viewArgs = [work, join(work, inventory.path), inventory.sha256, current.facts.snapshotRef, id];
  const result = command('python3', [sourceTool('inventory-view.py'), operation, ...viewArgs], stem, 900000);
  assert(succeeded(result), 'Inventory input ' + operation + ' failed; see ' + result.stderr);
  const value = JSON.parse(saved(result.stdout).toString());
  assert(value.status === 'verified' && value.snapshotRef === current.facts.snapshotRef && value.attemptId === id &&
    value.viewRoot === inputRoot && value.inventorySha256 === inventory.sha256 && value.unindexedInputsAvailable === false,
  'Inventory input receipt mismatch.');
  return { operation, receiptRef: artifactId(result.stdout), sha256: hash(saved(result.stdout)), result };
}

// Checks the saved graph output against the profile and saves it as the graph result.
function saveGraph(result: CommandRecord, chosen: Fields, report: Fields): void {
  assert(succeeded(result), 'Graph extraction failed; raw output is preserved.');
  const graph = JSON.parse(saved(result.stdout).toString());
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
  assert(graph.status === 'completed' && graph.contexts.every((context: Fields) => context.status === 'completed'),
    'The graph has partial execution. Review it before collecting component evidence.');
}

function graphRun(current: StageState): string {
  receipt('start'); receipt('toolchain');
  const chosen = json('toolchain-selection.json');
  assert(chosen.status === 'approved' && /^sha256:[a-f0-9]{64}$/.test(chosen.imageId), 'No approved graph image.');
  const dockerEndpoint = selectDocker('graph-context');
  assert(dockerEndpoint.endpoint === chosen.dockerEndpoint.endpoint, 'Docker endpoint differs from the approved toolchain.');
  const inspect = command('docker', ['image', 'inspect', '--format', '{{.Id}}', chosen.imageId], 'graph-image', 30000);
  assert(succeeded(inspect) && saved(inspect.stdout).toString().trim() === chosen.imageId, 'Approved image is unavailable.');
  const inventory = current.artifact(current.facts.inventoryRef);
  const inputRoot = join(work, 'knip-input-' + inventory.sha256);
  const prepared = inputView(current, 'prepare', 'graph-input-prepare');
  const before = inputView(current, 'verify', 'graph-input-before');
  const result = container(chosen.imageId, [graphHelper, '/control/graph-profile.json'], 'graph',
    [...mount(directory(inputRoot), '/repo'), ...mount(attempt, '/control'), ...mount(sourceTool(graphHelperSource), graphHelper)],
    '/repo');
  const after = inputView(current, 'verify', 'graph-input-after');
  const report: Fields = { formatVersion: 1, attemptId: id, snapshotRef: current.facts.snapshotRef, profileRef: artifactId('graph-profile.json'),
    profileSha256: hash(saved('graph-profile.json')), imageId: chosen.imageId, dockerEndpoint,
    toolInputDigests: digests(toolsToFreeze), inventoryRef: current.facts.inventoryRef, inventorySha256: inventory.sha256,
    inputView: { root: inputRoot, prepared, before, after }, result, status: 'failed', graphRef: null };
  try { saveGraph(result, chosen, report); }
  finally { saveJson('graph-run.json', report); }
  return 'Graph extraction completed. All contexts and the input view passed their checks. Drafts remain unchanged.';
}

let current: StageState;
if (action === 'start') {
  assert(!exists(attempt), 'Attempt already exists. Use a new Stage 4 ID.');
  current = state();
  try { checkSnapshotMetadata(current); }
  catch (error) { console.error((error as Error).message); process.exit(1); }
  const readIndexed = (path: string): Buffer => {
    const bytes = read(join(work, 'snapshot', path));
    assert(hash(bytes) === current.indexed.get(path)?.sha256, 'Snapshot file changed: ' + path);
    return bytes;
  };
  const prepared = graphProfile({ attemptId: id, settings: current.settings, plan: current.plan, loading: current.loading,
    indexed: current.indexed, facts: current.facts, loadPicomatch: () => trustedModule('picomatch') as Picomatch, readIndexed });
  const frozen = Object.fromEntries(toolsToFreeze.map(name => [name, read(sourceTool(name))]));
  for (const list of stageFourRuleLists) readRules(list, frozen[list.file] as Buffer, yaml);
  mkdirSync(attempt);
  for (const [name, bytes] of Object.entries(frozen)) save(name, bytes);
  for (const name of drafts) save(name + '.before.yaml', current.inputs[name] as Buffer);
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
const initialFiles = action === 'start' ? new Set<string>() : new Set(files(attempt));
const record: OperatorRecord = { formatVersion: 1, attemptId: id, phase: action, action,
  command: { args: process.argv, cwd: process.cwd(), environment: { CHOOM_WORK: work, CHOOM_TOOLS: tools,
    CHOOM_STAGE4_ID: id, CHOOM_STAGE4: attempt } }, startedAt: utc(), status: 'started' };
saveJson(stem + '.started.json', record);
let message: string | undefined; let error: string | null = null;
try {
  message = action === 'start' ? `Prepared ${id}: ${current.facts.registeredArtifacts} registered artifacts verified; ${json('graph-profile.json').contexts.length} graph contexts saved. ` +
    `Snapshot path, type, and size metadata checked for ${current.indexed.size} files; content hashing remains a run check.`
    : action === 'toolchain' ? toolchain() : graphRun(current);
  checkFrozen(state());
} catch (failure) { error = String((failure as Error).message ?? failure).slice(0, 2000); }
save(stem + '.stdout.txt', message ? message + '\n' : '');
save(stem + '.stderr.txt', error ? error + '\n' : '');
const logs = [stem + '.started.json', stem + '.stdout.txt', stem + '.stderr.txt'];
const outputFiles = files(attempt).filter(name => !initialFiles.has(name) && !logs.includes(name) && name !== 'commands.md');
Object.assign(record, { finishedAt: utc(), status: error ? 'failed' : 'completed', exitCode: error ? 1 : 0,
  digests: digests(outputFiles), logDigests: digests(logs) });
saveJson(stem + '.json', record);
const quote = (value: string): string => "'" + value.replaceAll("'", "'\\''") + "'";
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
