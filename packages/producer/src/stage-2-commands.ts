import {
  appendFileSync, closeSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, writeFileSync, writeSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { checkReasoningNotSaved, checkVisibleResponse } from './llm-response.ts';
import { refuseChangedProducerCode } from './producer-code.ts';
import { checkQuestionsAndGaps } from './questions-and-gaps.ts';
import { evidenceBase, type EvidenceTarget, type PointerMessages, resolveEvidence, savedDocument } from './record-checks.ts';
import { ToolGaps } from './tool-gaps.ts';

// The Stage 2 driver. Every action runs from the tool checkout, after it checks
// that the producer code is the code that started the run. The saved commands of
// each action run the stage modules in the tool checkout.
// Saved JSON and YAML stay unchecked values until the checks below read them.
type Fields = Record<string, unknown>;
interface InventoryFile { path: string; kind: string; bytes: number; sha256: string }
interface Inventory { snapshotId: string; files: InventoryFile[] }
interface Artifact { name: string; content: Buffer }
interface RunState { discovery: Fields; artifacts: Map<string, Artifact>; inventory: Inventory }
interface Selection { status: string; imageId: string | null; reason: string | null }
interface SavedCommand {
  args: string[]; cwd: string; startedAt: string; environment: Record<string, string | undefined>;
  finishedAt?: string; exitCode?: number | null; signal?: string | null; error?: string | null;
}
interface PhaseRecord {
  formatVersion: number; attemptId: string; action: string | undefined; startedAt: string; args: string[]; node: string;
  commands: SavedCommand[]; digests: Record<string, string>; exitCode: number; stdout: string; stderr: string;
  selection?: Selection; error?: string; finishedAt?: string;
}
interface PhaseContext { record: PhaseRecord; stdout: number; stderr: number }
interface PlanChecks { ids: Set<unknown>; artifacts: Map<string, Artifact>; reviewed: Map<unknown, Fields> }

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const object = (value: unknown): value is Fields => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const oneOf = (value: string | undefined, values: string[]): boolean => value !== undefined && values.includes(value);
const self = fileURLToPath(import.meta.url);
const [action, ...args] = process.argv.slice(2);
const planPath = action === 'start' ? args[0] : undefined;
const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE2_ID: id = '' } = process.env;
// Start saves the cookbook as a record of the instructions and prompts; no code reads it.
const cookbook = 'cookbook.md';
const modules = { handoff: 'stage-2-handoff.ts', profile: 'stage-2-knip-profile.ts', input: 'stage-2-knip-input.ts',
  image: 'stage-2-tool-image.ts', knip: 'stage-2-knip-run.ts', finish: 'stage-2-finish.ts' };
// The saved command that runs one stage module in the tool checkout.
const runModule = (name: string): string => 'node "$CHOOM_TOOLS/packages/producer/src/' + name + '"\n';
const drafts = ['run', 'discovery', 'baseline'];
const planFile = 'entry-plan.json';
const coreFiles = [planFile, 'entry-analysis.yaml', 'knip-runs.json', 'knip-profile.json', 'preflight.json', 'required-gaps.json'];
const imageFiles = ['image-id.txt', 'build-exit.txt', 'image-inspect-exit.txt', 'check-exit.txt', 'metadata.json']
  .map(name => 'toolchain/' + name);

assert((action === 'start' && (args.length === 0 || (args.length === 1 && isAbsolute(planPath ?? '')))) ||
  (oneOf(action, ['prepare', 'toolchain', 'run', 'finish']) && args.length === 0) ||
  (oneOf(action, ['plan', 'save-review']) && args.length === 1 && isAbsolute(args[0] ?? '')) ||
  (action === 'excerpt' && args.length === 4),
'Use start, excerpt PATH FIRST LAST REASON, plan REVIEW_DIR, prepare, toolchain, run, save-review REVIEW_DIR, or finish.');
assert(/^s2-[a-z0-9-]+$/.test(id), 'Set CHOOM_STAGE2_ID to a new or prepared s2-... ID.');
assert([CHOOM_WORK, CHOOM_TOOLS].every(value => text(value) && isAbsolute(value)),
  'Set CHOOM_WORK and CHOOM_TOOLS to absolute paths.');
const work = realpathSync(CHOOM_WORK ?? '');
const tools = realpathSync(CHOOM_TOOLS ?? '');
const evidence = join(work, 'evidence');
assert(realpathSync(evidence) === evidence && lstatSync(evidence).isDirectory(), 'Expected a real evidence directory.');
const attempt = join(evidence, id);
assert(!process.env.CHOOM_STAGE2 || process.env.CHOOM_STAGE2 === attempt, 'CHOOM_STAGE2 does not match the attempt.');
const { parse } = createRequire(join(tools, 'package.json'))('yaml');
const env: NodeJS.ProcessEnv = { ...process.env, CHOOM_WORK: work, CHOOM_TOOLS: tools, CHOOM_STAGE2: attempt,
  CHOOM_STAGE2_ID: id, CHOOM_KNIP_IMAGE: '' };
delete env.BASH_ENV;
delete env.ENV;

function regularFile(path: string): Buffer {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a real file: ' + path);
  return readFileSync(path);
}

function safeName(name: unknown): name is string {
  return text(name) && !isAbsolute(name) && !/[\\\0\r\n]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}

function read(base: string, name: string): Buffer {
  assert(safeName(name), 'Invalid saved path: ' + name);
  return regularFile(join(base, name));
}

const saved = (name: string): Buffer => read(attempt, name);
const json = (name: string) => JSON.parse(saved(name).toString());
const save = (name: string, data: string | Buffer): void => writeFileSync(join(attempt, name), data, { flag: 'wx' });
const saveJson = (name: string, data: unknown): void => save(name, JSON.stringify(data, null, 2) + '\n');
const utc = (): string => new Date().toISOString();

function exact(record: unknown, keys: string[], label: string): void {
  assert(object(record) && Object.keys(record).length === keys.length &&
    keys.every(key => Object.hasOwn(record, key)), 'Invalid ' + label + ' fields.');
}

function state(checkpoints: boolean): RunState {
  const runBytes = read(work, 'run.yaml');
  const discoveryBytes = read(work, 'discovery.yaml');
  if (checkpoints) {
    for (const [name, bytes] of [['run', runBytes], ['discovery', discoveryBytes], ['baseline', read(work, 'baseline.yaml')]] as const)
      assert(bytes.equals(saved(name + '.before.yaml')), 'Draft changed: ' + name);
  }
  const run = parse(runBytes.toString());
  const discovery = parse(discoveryBytes.toString());
  assert(run?.formatVersion === 1 && run.status === 'in-progress' && run.progress?.inventory === 'complete' &&
    run.snapshot?.root === 'snapshot' && object(run.artifacts) && discovery?.runRef === run.id,
  'Expected a saved stage 1 run.');
  const artifacts = new Map<string, Artifact>();
  for (const [artifactId, record] of Object.entries(run.artifacts)) {
    assert(object(record) && record.path !== 'run.yaml' && /^[a-f0-9]{64}$/i.test(String(record.sha256 ?? '')),
      'Invalid registered artifact: ' + artifactId);
    const content = read(work, record.path as string);
    assert(hash(content) === (record.sha256 as string).toLowerCase(), 'Changed registered artifact: ' + artifactId);
    artifacts.set(artifactId, { name: record.path as string, content });
  }
  assert(artifacts.has(run.snapshot.inventoryRef), 'Missing registered inventory.');
  const inventory = JSON.parse(artifacts.get(run.snapshot.inventoryRef)?.content.toString() ?? '');
  assert(inventory?.snapshotId === run.snapshot.id && Array.isArray(inventory.files), 'Inventory snapshot mismatch.');
  if (checkpoints) for (const name of readdirSync(attempt).filter(name => /^excerpt-[0-9]+\.json$/.test(name))) {
    const artifactId = id + '-file@' + encodeURIComponent(name);
    assert(!artifacts.has(artifactId), 'Attempt excerpt ID is already registered: ' + artifactId);
    artifacts.set(artifactId, { name, content: saved(name) });
  }
  return { discovery, artifacts, inventory };
}

function document({ name, content }: Artifact) {
  return savedDocument(name, content.toString(), parse);
}

// The words of the Stage 2 plan messages for a JSON Pointer that it refuses.
const pointerMessages: PointerMessages = { invalid: 'Invalid JSON Pointer: ', escape: 'Unresolved JSON Pointer: ',
  index: 'Unresolved JSON Pointer: ', unresolved: 'Unresolved JSON Pointer: ' };
const artifactTarget = (artifact: Artifact): EvidenceTarget => ({ path: artifact.name, document: () => document(artifact) });

// Source records that saved reviews and excerpts already contain, by ID.
function reviewedSources(artifacts: Map<string, Artifact>, inventory: Inventory, paths: Map<string, InventoryFile>): Map<unknown, Fields> {
  const reviewed = new Map<unknown, Fields>();
  for (const record of artifacts.values()) {
    if (!/\.(?:json|ya?ml)$/.test(record.name)) continue;
    let value: Fields | null | undefined;
    try { value = document(record) as Fields | null | undefined; } catch { continue; }
    const records = (Array.isArray(value?.reviewedFiles) ? value.reviewedFiles :
      /(?:^|\/)(?:source-excerpts\.json|excerpt-[0-9]+\.json)$/.test(record.name) ?
        (Array.isArray(value?.excerpts) ? value.excerpts : [value]) : []) as Fields[];
    for (const source of records) {
      const file = Object.fromEntries(['id', 'snapshotRef', 'path', 'sha256', 'lines'].map(key => [key, source[key]]));
      const indexed = paths.get(file.path as string);
      assert(text(file?.id) && file.snapshotRef === inventory.snapshotId &&
        indexed?.kind === 'file' && file.sha256 === indexed.sha256 &&
        (!reviewed.has(file.id) || isDeepStrictEqual(reviewed.get(file.id), file)),
      'Invalid saved source record: ' + file?.id);
      reviewed.set(file.id, file);
    }
  }
  return reviewed;
}

// The IDs <attempt>-knip-gap-NNN belong to the required gaps that run saves.
const attemptGaps = new ToolGaps(id + '-');

function checkRecord(record: Fields, prior: Map<unknown, unknown>, { ids, artifacts, reviewed }: PlanChecks): void {
  assert(text(record.id) && !ids.has(record.id) && !artifacts.has(record.id) && !reviewed.has(record.id) &&
    (prior.has(record.id) || record.id.startsWith(id + '-')) && !record.id.startsWith(id + '-file@') &&
    !coreFiles.some(name => record.id === id + '-' + name.replace(/\.[^.]+$/, '')) &&
    !attemptGaps.reserves(ToolGaps.knip, record.id),
  'Invalid or duplicate record ID: ' + record.id);
  ids.add(record.id);
  assert(strings(record.evidenceRefs) && record.evidenceRefs.length, 'Missing evidence: ' + record.id);
  for (const ref of record.evidenceRefs) {
    const artifactId = evidenceBase(ref);
    const source = reviewed.get(artifactId);
    const artifact = artifacts.get(artifactId);
    assert(artifact || source, 'Unknown saved evidence: ' + artifactId);
    resolveEvidence(ref, artifact ? artifactTarget(artifact) : { record: source }, pointerMessages);
  }
}

function checkPlanRecords(plan: Fields & { candidates: Fields[] }, discovery: Fields, checks: PlanChecks,
  workspaces: Set<unknown>, paths: Map<string, InventoryFile>): void {
  const noPrior = new Map();
  for (const candidate of plan.candidates) {
    exact(candidate, ['id', 'expression', 'path', 'workspace', 'roles', 'origin', 'evidenceRefs'], 'candidate');
    assert(text(candidate.expression) && workspaces.has(candidate.workspace) &&
      (candidate.path === null || paths.get(candidate.path as string)?.kind === 'file') &&
      strings(candidate.roles) && candidate.roles.length &&
      ['package-field', 'script', 'convention', 'source', 'inference', 'unknown'].includes(candidate.origin as string),
    'Invalid candidate: ' + candidate.id);
    checkRecord(candidate, noPrior, checks);
  }
  for (const [key, field] of [['questions', 'text'], ['gaps', 'reason']] as const) {
    assert(Array.isArray(discovery[key]), 'Missing prior discovery ' + key);
    const prior = new Map<unknown, unknown>((discovery[key] as Fields[]).map(record => [record.id, record]));
    for (const record of plan[key] as Fields[]) {
      const fields = ['id', 'subjectRefs', field, 'evidenceRefs', ...(key === 'gaps' ? ['kind'] : [])];
      if (!prior.has(record?.id)) exact(record, fields, key);
      assert(object(record) && strings(record.subjectRefs) && text(record[field]) && (key !== 'gaps' || text(record.kind)),
        'Invalid record: ' + record?.id);
      checkRecord(record, prior, checks);
    }
    for (const [priorId, record] of prior)
      assert(isDeepStrictEqual((plan[key] as Fields[]).find(item => item.id === priorId), record), 'Changed prior record: ' + priorId);
  }
}

function validatePlan(bytes: Buffer, { discovery, artifacts, inventory }: RunState): void {
  const plan = JSON.parse(bytes.toString());
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
  const reviewed = reviewedSources(artifacts, inventory, paths);
  checkPlanRecords(plan, discovery, { ids: new Set(), artifacts, reviewed }, workspaces, paths);
  // The entry analysis must keep the questions and gaps of the plan, so they enter the run here.
  checkQuestionsAndGaps({ questions: plan.questions, gaps: plan.gaps });
}

function digests(names: string[]): Record<string, string> {
  return Object.fromEntries(names.map(name => [name, hash(saved(name))]));
}

// The receipt of a phase, after a check that each file that it names still has its
// recorded digest. A numbered excerpt phase, such as excerpt-001, has the action excerpt.
function receiptFor(phase: string, phaseAction = phase) {
  const receipt = json('operator-' + phase + '.json');
  assert(receipt.action === phaseAction && receipt.attemptId === id && object(receipt.digests),
    'Unexpected phase receipt: ' + phase);
  for (const [name, digest] of Object.entries(receipt.digests))
    assert(hash(saved(name)) === digest, 'Saved phase input or output changed: ' + name);
  return receipt;
}

function selection(): Selection {
  try {
    assert(imageFiles.every(name => lstatSync(join(attempt, name), { throwIfNoEntry: false })),
      'Docker build, image inspection, or fixture check did not produce a complete receipt.');
    const [idFile = '', buildExit, inspectExit, checkExit, metadata = ''] = imageFiles.map(name => saved(name).toString().trim());
    const check = JSON.parse(metadata);
    assert(/^sha256:[a-f0-9]{64}$/.test(idFile) && [buildExit, inspectExit, checkExit].every(code => code === '0') &&
      check.imageId === idFile && check.knip === '6.44.1' && check.toolRoot === '/opt/choom-tools' &&
      check.environment?.KNIP_DISABLE_RAW_TRANSFER === '1' && object(check.packageLock) &&
      check.check?.status === 'passed' && check.check.runs?.length === 2 &&
      ['normal', 'production'].every(mode => check.check.runs.some((run: Fields) => run.mode === mode && run.exitCode === 1)),
    'The image lacks a successful pinned fixture in both modes.');
    return { status: 'approved', imageId: idFile, reason: null };
  } catch (error) {
    return { status: 'unavailable', imageId: null, reason: (error as Error).message };
  }
}

function execute({ record, stdout, stderr }: PhaseContext, recipe: string, name: string): void {
  const script = 'operator-' + action + '-' + name + '.sh';
  save(script, 'set -eCu\n' + recipe);
  record.digests[script] = hash(saved(script));
  const command: SavedCommand = {
    args: ['/bin/bash', join(attempt, script)], cwd: attempt, startedAt: utc(),
    environment: { CHOOM_KNIP_IMAGE: env.CHOOM_KNIP_IMAGE },
  };
  record.commands.push(command);
  const result = spawnSync('/bin/bash', command.args.slice(1), {
    cwd: command.cwd, env, stdio: ['ignore', stdout, stderr],
  });
  Object.assign(command, { finishedAt: utc(), exitCode: result.status, signal: result.signal,
    error: result.error?.message ?? null });
  assert(!result.error && result.status === 0 && !result.signal, 'Saved command failed: ' + script);
}

function startPhase(context: PhaseContext): void {
  const plan = planPath ? regularFile(resolve(planPath)) : null;
  if (plan) validatePlan(plan, state(false));
  save(cookbook, regularFile(join(tools, 'docs/design/app-a/step-2-cookbook.md')));
  Object.assign(context.record.digests, digests([cookbook]));
  execute(context, runModule(modules.handoff), 'handoff');
  state(true);
  if (plan) save(planFile, plan);
  Object.assign(context.record.digests, digests([
    ...(plan ? [planFile] : []), 'handoff.json', 'run.input.yaml', ...drafts.map(name => name + '.before.yaml'),
  ]));
  writeSync(context.stdout, plan ? 'Saved and validated the supplied entry plan.\n' : 'Prepared the attempt. Collect needed excerpts, then save the LLM plan packet with plan REVIEW_DIR.\n');
}

function excerptPhase({ record, stdout }: PhaseContext, current: RunState): void {
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
}

function checkPacket(packet: Map<string, Buffer>, names: string[], current: RunState) {
  const file = (name: string): Buffer => packet.get(name) as Buffer;
  const primary = file(names[0] ?? '');
  if (action === 'plan') {
    validatePlan(primary, current);
    assert(isDeepStrictEqual(JSON.parse(primary.toString()), JSON.parse(file('llm/plan-response.json').toString())), 'Plan response differs from entry plan.');
  } else {
    const analysis = parse(primary.toString());
    assert(analysis?.kind === 'entry-analysis' && analysis.snapshotRef === current.inventory.snapshotId &&
      analysis.planRef === id + '-entry-plan' && analysis.knipRunsRef === id + '-knip-runs' && analysis.llmReview === 'recorded',
      'Invalid Stage 2 entry analysis identity.');
    assert(file('llm/analysis-response.md').toString().includes(primary.toString().trim()), 'Save complete analysis YAML in the response.');
  }
  const prefix = action === 'plan' ? 'plan' : 'analysis';
  const call = parse(file('llm/' + prefix + '-call.yaml').toString());
  assert(object(call) && ['provider', 'model', 'date'].every(key => text(call[key])) &&
    (call.settings === 'unknown' || object(call.settings)), 'Record LLM call metadata; use unknown for unexposed values.');
  checkReasoningNotSaved(call, 'llm/' + prefix + '-call.yaml');
  const response = 'llm/' + prefix + (action === 'plan' ? '-response.json' : '-response.md');
  checkVisibleResponse(file(response).toString(), response);
  const scope = JSON.parse(file(action === 'plan' ? 'llm/plan-scope.json' : 'llm/review-scope.json').toString());
  assert(scope?.formatVersion === 1 && scope.snapshotRef === current.inventory.snapshotId && scope.attemptId === id &&
    strings(scope.suppliedArtifactRefs) && scope.suppliedArtifactRefs.length && strings(scope.limits),
  'Record supplied artifact IDs and review limits.');
  return scope;
}

// Every saved attempt file, by the artifact ID that finish will register.
function indexInputs(supplied: Map<string, Artifact>, dir = ''): void {
  for (const leaf of readdirSync(join(attempt, dir))) {
    const name = dir ? dir + '/' + leaf : leaf;
    const info = lstatSync(join(attempt, name));
    assert(!info.isSymbolicLink(), 'Attempt evidence cannot contain symbolic links: ' + name);
    if (info.isDirectory()) indexInputs(supplied, name);
    else {
      const core = coreFiles.includes(name) ? id + '-' + name.replace(/\.[^.]+$/, '') : id + '-file@' + encodeURIComponent(name);
      supplied.set(core, { name, content: saved(name) });
    }
  }
}

function packetPhase({ record, stdout }: PhaseContext, current: RunState): void {
  const reviewDir = realpathSync(args[0] ?? '');
  assert(reviewDir !== work && !reviewDir.startsWith(work + '/'), 'Keep LLM review packets outside the run.');
  const names = action === 'plan' ? ['entry-plan.json', 'llm/plan-prompt.md', 'llm/plan-response.json',
    'llm/plan-call.yaml', 'llm/plan-scope.json'] : ['entry-analysis.yaml', 'llm/analysis-prompt.md',
    'llm/analysis-response.md', 'llm/analysis-call.yaml', 'llm/review-scope.json'];
  if (action === 'save-review') assert(receiptFor('run').exitCode === 0, 'Run must save its outcomes before review.');
  const packet = new Map(names.map((name): [string, Buffer] => [name, read(reviewDir, name)]));
  const scope = checkPacket(packet, names, current);
  const supplied = new Map(current.artifacts);
  indexInputs(supplied);
  for (const ref of scope.suppliedArtifactRefs as string[]) {
    const artifact = supplied.get(evidenceBase(ref));
    assert(artifact, 'Unknown supplied artifact: ' + ref);
    resolveEvidence(ref, artifactTarget(artifact), pointerMessages);
  }
  for (const name of names) assert(!lstatSync(join(attempt, name), { throwIfNoEntry: false }), 'Packet file already exists: ' + name);
  if (!lstatSync(join(attempt, 'llm'), { throwIfNoEntry: false })) mkdirSync(join(attempt, 'llm'));
  for (const [name, bytes] of packet) save(name, bytes);
  Object.assign(record.digests, digests(names));
  writeSync(stdout, 'Saved the complete ' + (action === 'plan' ? 'entry plan' : 'entry analysis') + ' packet.\n');
}

function preparePhase(context: PhaseContext, current: RunState): void {
  validatePlan(saved(planFile), current);
  if (!Object.hasOwn(receiptFor('start').digests, planFile)) assert(receiptFor('plan').exitCode === 0, 'Save the plan before prepare.');
  execute(context, runModule(modules.profile), 'profile');
  execute(context, runModule(modules.input), 'inventory');
  Object.assign(context.record.digests, digests(['knip-profile.json', 'preflight.json',
    ...(json('preflight.json').status === 'eligible' ? ['knip-input.json'] : [])]));
}

function toolchainPhase(context: PhaseContext): void {
  const eligible = json('preflight.json').status === 'eligible';
  if (eligible) {
    execute(context, 'if command -v docker >/dev/null 2>&1; then\n  ' + runModule(modules.image) +
      "else\n  printf 'Docker is unavailable.\\n'\nfi\n", 'image');
  }
  const selected: Selection = eligible ? selection() : {
    status: 'unavailable', imageId: null, reason: 'Preflight marked this profile unsupported.',
  };
  saveJson('toolchain-selection.json', selected);
  context.record.selection = selected;
  Object.assign(context.record.digests, digests(['toolchain-selection.json',
    ...imageFiles.filter(name => lstatSync(join(attempt, name), { throwIfNoEntry: false }))]));
  writeSync(context.stdout, JSON.stringify(selected, null, 2) + '\n');
  assert(selected.status === 'approved' || !eligible,
    'No tool image was approved. Run can still record skipped Knip outcomes.');
}

function runPhase(context: PhaseContext): void {
  const toolchain = receiptFor('toolchain');
  if (toolchain.exitCode === 0 && toolchain.selection?.status === 'approved') {
    const selected = selection();
    assert(isDeepStrictEqual(selected, toolchain.selection), 'Approved image evidence changed.');
    env.CHOOM_KNIP_IMAGE = selected.imageId as string;
  }
  execute(context, runModule(modules.knip), 'knip');
  Object.assign(context.record.digests, digests(['knip-runs.json', 'required-gaps.json']));
}

function phase(context: PhaseContext): void {
  if (action === 'start') return startPhase(context);
  const current = state(true);
  assert(receiptFor('start').exitCode === 0, 'Start must succeed before continuing.');
  if (action === 'excerpt') return excerptPhase(context, current);
  if (action === 'plan' || action === 'save-review') return packetPhase(context, current);
  if (action === 'prepare') return preparePhase(context, current);
  assert(receiptFor('prepare').exitCode === 0, 'Prepare must succeed before continuing.');
  if (action === 'toolchain') return toolchainPhase(context);
  runPhase(context);
}

// Finish registers every attempt file. So each phase receipt must still name the
// bytes that its phase saved: the files of start, plan, prepare, toolchain, run,
// each excerpt request and save-review. A toolchain or excerpt receipt can record a failure.
function checkPhaseReceipts(): void {
  const start = receiptFor('start');
  const planned = !Object.hasOwn(start.digests, planFile);
  assert(start.exitCode === 0 && (!planned || receiptFor('plan').exitCode === 0) && receiptFor('prepare').exitCode === 0 &&
    receiptFor('run').exitCode === 0 && receiptFor('save-review').exitCode === 0,
  'Start, plan, prepare, run and save-review must succeed before finish.');
  receiptFor('toolchain');
  for (const name of readdirSync(attempt).filter(name => /^operator-excerpt-[0-9]+\.json$/.test(name)))
    receiptFor(name.slice('operator-'.length, -'.json'.length), 'excerpt');
}

// The checks of plan and save-review run again on each saved LLM call record and
// response, also on a plan packet that no plan receipt covers.
function checkSavedLlmRecords(): void {
  const packets: [string, string][] = [['llm/plan-call.yaml', 'llm/plan-response.json'],
    ['llm/analysis-call.yaml', 'llm/analysis-response.md']];
  for (const [call, response] of packets) {
    if (![call, response].some(name => lstatSync(join(attempt, name), { throwIfNoEntry: false }))) continue;
    checkReasoningNotSaved(parse(saved(call).toString()), call);
    checkVisibleResponse(saved(response).toString(), response);
  }
}

function finish(): never {
  state(true);
  checkPhaseReceipts();
  checkSavedLlmRecords();
  const script = 'operator-finish.sh';
  save(script, 'set -eCu\n' + runModule(modules.finish));
  appendFileSync(join(attempt, 'commands.md'), '\n' + utc() + ' Publish with ' + JSON.stringify([process.execPath, self, 'finish']) +
    '. The finalizer registers this command and the saved recipe; no log writes follow success.\n');
  const result = spawnSync('/bin/bash', [join(attempt, script)], { cwd: attempt, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// run.yaml registers each file of a published attempt under an ID that starts with
// the attempt ID and -file@. Those files are evidence, so an action on a published
// attempt stops here, before it saves a receipt or adds to commands.md.
function refusePublishedAttempt(): void {
  const run = parse(read(work, 'run.yaml').toString());
  if (!object(run?.artifacts) || !Object.keys(run.artifacts).some(key => key.startsWith(id + '-file@'))) return;
  writeSync(2, 'Attempt ' + id + ' is published: run.yaml registers its files, so they must stay unchanged. ' +
    'Use a new attempt ID for more Stage 2 work.\n');
  process.exit(1);
}

const checkoutDriver = join(tools, 'packages/producer/src/stage-2-commands.ts');
if (action === 'start') assert(self === checkoutDriver, 'Start from the tool checkout.');
else {
  assert(self === checkoutDriver && realpathSync(self) === self && realpathSync(attempt) === attempt,
    'Use the Stage 2 driver in the trusted checkout with a prepared attempt.');
}
refuseChangedProducerCode(work, tools);
if (action !== 'start') refusePublishedAttempt();
if (action === 'start') {
  mkdirSync(attempt);
  save('commands.md', '# Stage 2 commands\n');
} else saved('commands.md');

const stem = 'operator-' + action;
let receiptStem = stem;
if (action === 'excerpt') {
  let n = 1;
  while (lstatSync(join(attempt, 'operator-excerpt-' + String(n).padStart(3, '0') + '.json'), { throwIfNoEntry: false })) n++;
  receiptStem += '-' + String(n).padStart(3, '0');
}
if (action === 'finish') finish();
const stdoutName = receiptStem + '.stdout.txt';
const stderrName = receiptStem + '.stderr.txt';
const record: PhaseRecord = {
  formatVersion: 1, attemptId: id, action, startedAt: utc(),
  args: [process.execPath, self, action ?? '', ...args],
  node: process.version, commands: [], digests: {}, exitCode: 0, stdout: stdoutName, stderr: stderrName,
};
assert(!lstatSync(join(attempt, receiptStem + '.json'), { throwIfNoEntry: false }), 'Phase already recorded: ' + action);
const stdout = openSync(join(attempt, stdoutName), 'wx');
let stderr: number | undefined;
try {
  stderr = openSync(join(attempt, stderrName), 'wx');
  phase({ record, stdout, stderr });
} catch (error) {
  const failure = error as Error;
  record.exitCode = 1;
  record.error = failure.message;
  if (stderr !== undefined) writeSync(stderr, (failure.stack || failure.message) + '\n');
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
