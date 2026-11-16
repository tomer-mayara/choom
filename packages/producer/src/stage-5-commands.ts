import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type * as TsMorph from 'ts-morph';
import type * as Yaml from 'yaml';
import { appendCommandLog, cookbookPrompt } from './attempt-files.ts';
import { refuseChangedProducerCode } from './producer-code.ts';
import { assert, type Fields, hash, object, text } from './record-checks.ts';
import { runLayout } from './run-layout.mjs';
import { directory, read } from './stage-3-inputs.ts';
import { checkpoint, digest, draftNames, readState, safe, type StageState } from './stage-5-inputs.ts';
import { partsRecord } from './stage-5-parts.ts';
import { collectEvidence, excerpt, type SavedScope, scopeFor } from './stage-5-query.ts';

// The Stage 5 helper. start checks the run after the published Stage 4 review and
// saves the checkpoints, the documents that the stage follows, the query scope and
// the handoff with the pinned tool versions; collect saves the remaining-code
// evidence, the review prompt and the proposed artifact map; excerpt saves a
// requested range; parts saves the parts of a file that named symbols divide, with
// the dependencies of the file at both levels. Each action saves a receipt and
// appends its outcome to the command log.
interface Versions { node: string; yaml: string; tsMorph: string; typescript: string; modules: Record<string, string> }
// YAML, and ts-morph with its own copy of TypeScript, which the syntax query uses.
interface Toolchain { parse: (text: string) => unknown; tsMorph: typeof TsMorph; versions: Versions }
interface Prepared { toolchain: Toolchain; state: StageState; frozenTools: Record<string, Buffer> }
interface Started { state: StageState; toolchain: Toolchain }
interface Reservation { phase: string; prefix: string; started: Fields }
type Output = (name: string, bytes: string | Buffer) => void;

const self = fileURLToPath(import.meta.url);
const [action = '', ...args] = process.argv.slice(2);
const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE5 } = process.env;
const id = process.env.CHOOM_STAGE5_ID ?? '';
const helper = 'stage-5-commands.ts';
const cookbook = 'step-5-cookbook.md';
// Start saves the documents that the stage follows. The review prompt comes from
// the saved cookbook. Every action runs the producer code in the tool checkout.
const toolFiles = [cookbook, 'record-format.md'];
const startOutputs = [...draftNames.map(checkpoint), ...toolFiles, 'handoff.json', 'scope.json'];
const collectOutputs = ['remaining-units.json', 'inspection-coverage.json', 'source-candidates.json',
  'source-excerpts.json', 'review-prompt.md', 'artifact-map.json'];
const commandLog = 'commands.md';
const commandHeader = '# Stage 5 commands\n\n' +
  'The commands below use saved inputs. A content read by a tool does not record LLM inspection.\n';
// The cookbooks and record format stay in docs/design/app-a; the code is in packages/producer/src.
const sourceTool = (name: string): string =>
  join(CHOOM_TOOLS as string, name.endsWith('.md') ? 'docs/design/app-a' : 'packages/producer/src', name);
const artifactId = (name: string): string => id + '-file@' + encodeURIComponent(name);
const exists = (path: string): boolean => Boolean(lstatSync(path, { throwIfNoEntry: false }));
const utc = (): string => new Date().toISOString();
const errorText = (error: unknown): string => String((error as { message?: unknown }).message ?? error);

// The actions that the operator can repeat. Each request takes the next number of its action.
const numbered = ['excerpt', 'parts'];
assert((['start', 'collect'].includes(action) && args.length === 0) || (action === 'excerpt' && args.length === 3) ||
  (action === 'parts' && args.length >= 2), 'Use start, collect, excerpt PATH FIRST LAST, or parts PATH SYMBOL [SYMBOL ...].');
assert(/^s5-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), 'Set CHOOM_STAGE5_ID to an s5-... ID.');
const work = directory(CHOOM_WORK);
const tools = directory(CHOOM_TOOLS);
runLayout(work, tools);
const attempt = join(directory(join(work, 'evidence')), id);
assert(CHOOM_STAGE5 === attempt, 'Set CHOOM_STAGE5 to the matching attempt directory.');
assert(self === sourceTool(helper) && realpathSync(self) === self,
  'Use the Stage 5 command helper in the trusted checkout.');
refuseChangedProducerCode(work, tools);

const saved = (name: string): Buffer => {
  assert(safe(name), 'Invalid saved attempt path: ' + name);
  return read(join(attempt, name));
};
const save = (name: string, bytes: string | Buffer): void => writeFileSync(join(attempt, name), bytes, { flag: 'wx' });
const encode = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
const json = (name: string): Fields => JSON.parse(String(saved(name))) as Fields;
const digests = (names: string[]): Record<string, string> => Object.fromEntries(names.map(name => [name, hash(saved(name))]));
const logNames = (prefix: string): string[] => ['.started.json', '.stdout.txt', '.stderr.txt'].map(suffix => prefix + suffix);
const require = createRequire(join(tools, 'package.json'));

// Checks the tool files that start pinned before this action loads them.
function checkPinned(pinned: Fields, modules: string, paths: string[]): void {
  const pinnedModules = pinned.modules as Record<string, unknown>;
  assert(pinned.node === process.version && object(pinnedModules), 'Trusted Node or parser inputs changed since start.');
  for (const [path, sha256] of Object.entries(pinnedModules)) {
    assert(safe(path) && digest(sha256) && hash(read(join(modules, path))) === sha256,
      'Trusted parser module changed since start: ' + path);
  }
  assert(paths.every(path => Object.hasOwn(pinnedModules, path.slice(modules.length))),
    'Trusted parser resolution changed since start.');
}

// The trusted YAML and ts-morph of the checkout, with their versions, the version of
// the TypeScript of ts-morph, and the digest of each tool file that this action
// loaded. A later action compares them with start.
function loadTools(pinned?: Fields): Toolchain {
  const modules = join(tools, 'node_modules') + '/';
  const packages = ['yaml', 'ts-morph', 'yaml/package.json', 'ts-morph/package.json'];
  const paths = packages.map(name => {
    const path = require.resolve(name);
    assert(path.startsWith(modules + name.split('/')[0] + '/') && realpathSync(path) === path,
      'Use the trusted installation of ' + name + '.');
    return path;
  });
  if (pinned) checkPinned(pinned, modules, paths);
  const [{ parse }, tsMorph, { version: yaml }, { version: tsMorphVersion }] = paths.map(path => require(path)) as
    [typeof Yaml, typeof TsMorph, { version: string }, { version: string }];
  const loaded = Object.keys(require.cache).filter(path => path.startsWith(modules)).sort();
  const versions = { node: process.version, yaml, tsMorph: tsMorphVersion, typescript: tsMorph.ts.version,
    modules: Object.fromEntries(loaded.map(path => [path.slice(modules.length), hash(read(path))])) };
  if (pinned) assert(isDeepStrictEqual(versions, pinned), 'Trusted parser modules changed since start.');
  return { parse, tsMorph, versions };
}

function requireCompleted(phase: string, outputs: string[]): void {
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

function reviewPrompt(state: StageState): string {
  return cookbookPrompt(saved(cookbook), 5, {
    WORK: work, ATTEMPT: attempt, ID: id, ENTRY_ANALYSIS_REF: state.facts.entryAnalysisRef,
    MAPPING_REF: state.mappingRef, DEPENDENCIES_REF: state.graphRef, RESOURCE_ACCESS_REF: state.resourceAccessRef,
  });
}

// Saves the started record of this action. Each excerpt or parts request takes the next free number of its action.
function reserve(): Reservation {
  const command = { args: [process.execPath, self, action, ...args], cwd: process.cwd(),
    environment: { CHOOM_WORK: work, CHOOM_TOOLS: tools, CHOOM_STAGE5: attempt, CHOOM_STAGE5_ID: id } };
  for (let index = 1; ; index++) {
    const phase = numbered.includes(action) ? action + '-' + String(index).padStart(3, '0') : action;
    const prefix = 'operator-' + phase;
    const started = { formatVersion: 1, attemptId: id, action, phase, command, startedAt: utc() };
    try {
      save(prefix + '.started.json', encode(started));
      return { phase, prefix, started };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (numbered.includes(action)) continue;
      throw new Error('This action was already started. Keep the attempt unchanged and use a new ID.');
    }
  }
}

// The checks before a new attempt folder exists: the saved documents, the tools and the run.
function prepareStart(): Prepared {
  assert(!exists(attempt), 'Start with a new attempt ID.');
  const frozenTools = Object.fromEntries(toolFiles.map(name => [name, read(sourceTool(name))]));
  const toolchain = loadTools();
  const state = readState(toolchain.parse, { work, tools, id });
  mkdirSync(attempt);
  save(commandLog, commandHeader);
  return { toolchain, state, frozenTools };
}

function startAction({ toolchain, state, frozenTools }: Prepared, output: Output): string {
  for (const name of draftNames) output(checkpoint(name), state.inputs[name] as Buffer);
  for (const [name, bytes] of Object.entries(frozenTools)) output(name, bytes);
  output('scope.json', encode(scopeFor(state)));
  output('handoff.json', encode({
    ...state.facts, versions: toolchain.versions, toolInputDigests: digests(toolFiles),
    scopeSha256: hash(saved('scope.json')), initialCommandsSha256: hash(commandHeader),
  }));
  return `Saved ${id} for ${String(state.facts.snapshotRef)}. Verified ${String(state.facts.registeredArtifacts)} registered artifacts and ${String(state.facts.indexedRegularFiles)} indexed file digests.`;
}

// Start completed with unchanged frozen inputs, and the tools, the run and the drafts still match the handoff.
function startedAttempt(): Started {
  requireCompleted('start', startOutputs);
  const handoff = json('handoff.json');
  const savedTools = Object.fromEntries(toolFiles.map(name => [name, saved(name)]));
  assert(isDeepStrictEqual(handoff.toolInputDigests, Object.fromEntries(toolFiles.map(name => [name, hash(savedTools[name] as Buffer)]))) &&
    handoff.scopeSha256 === hash(saved('scope.json')) &&
    hash(saved(commandLog).subarray(0, Buffer.byteLength(commandHeader))) === handoff.initialCommandsSha256,
  'Frozen tools, scope or command log changed since start.');
  assert(object(handoff.versions), 'Missing pinned parser versions.');
  const toolchain = loadTools(handoff.versions);
  const state = readState(toolchain.parse, { work, tools, id });
  assert(Object.entries(state.facts).every(([key, value]) => isDeepStrictEqual(handoff[key], value)),
    'Work, snapshot, checkpoints or registered inputs changed since start.');
  for (const name of draftNames)
    assert((state.inputs[name] as Buffer).equals(saved(checkpoint(name))), 'Working draft changed: ' + name);
  return { state, toolchain };
}

function collectAction({ state, toolchain }: Started, prefix: string, output: Output, outputs: string[]): string {
  assert(collectOutputs.every(name => !exists(join(attempt, name))), 'Collect output already exists. Use a new attempt.');
  const results = collectEvidence(state, json('scope.json') as unknown as SavedScope,
    { tsMorph: toolchain.tsMorph, versions: toolchain.versions });
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
  const count = (name: string, key: string): number => ((results[name] as Fields)[key] as unknown[]).length;
  return `Saved ${count('remaining-units.json', 'units')} owner-null units, ${count('inspection-coverage.json', 'units')} coverage records, ${count('source-candidates.json', 'candidates')} syntax candidates and ${count('source-excerpts.json', 'excerpts')} excerpts.`;
}

// The message of a request that saved one record.
const savedRecord = (name: string): string => `Saved ${artifactId(name)} at ${join(attempt, name)} (SHA-256 ${hash(saved(name))}).`;

function excerptAction({ state }: Started, phase: string, output: Output): string {
  requireCompleted('collect', collectOutputs);
  const [path = '', first = '', last = ''] = args;
  assert(safe(path) && [first, last].every(value => /^[1-9][0-9]*$/.test(value)), 'Use excerpt PATH FIRST LAST with positive line numbers.');
  const name = phase + '.json';
  output(name, encode({ ...state.header, id: id + '-source-' + phase, ...excerpt(state, path, Number(first), Number(last)) }));
  return savedRecord(name);
}

// Saves the parts of an indexed file that the symbols divide, with the dependencies of the file at both levels.
function partsAction({ state, toolchain }: Started, phase: string, output: Output): string {
  requireCompleted('collect', collectOutputs);
  const [path = '', ...symbols] = args;
  const file = state.indexed.get(path);
  assert(file, 'File is outside the inventory: ' + path);
  const name = phase + '.json';
  output(name, encode(partsRecord({ header: state.header, path, symbols, file, read: state.readIndexed,
    sites: state.sourceSites, sitesRef: state.sourceSitesRef, tools: { tsMorph: toolchain.tsMorph, versions: toolchain.versions } })));
  return savedRecord(name);
}

// Appends the outcome to the command log, saves the logs and the receipt of the action and prints its message.
function finishAction({ prefix, started }: Reservation, outputs: string[], message: string, failure: string | null): void {
  let errorMessage = failure;
  const finishedAt = utc();
  const outcome = (): { status: string; exitCode: number } =>
    ({ status: errorMessage ? 'failed' : 'completed', exitCode: errorMessage ? 1 : 0 });
  try { appendCommandLog(join(attempt, commandLog), { ...started, ...outcome(), finishedAt }); }
  catch (error) { errorMessage = [errorMessage, errorText(error)].filter(Boolean).join(' | '); }
  save(prefix + '.stdout.txt', message ? message + '\n' : '');
  save(prefix + '.stderr.txt', errorMessage ? errorMessage + '\n' : '');
  save(prefix + '.json', encode({ ...started, ...outcome(), finishedAt,
    digests: digests(outputs), logDigests: digests(logNames(prefix)) }));
  process.exitCode = outcome().exitCode;
  if (errorMessage) console.error(errorMessage);
  else console.log(message);
}

function main(): void {
  let prepared: Prepared | undefined;
  if (action === 'start') prepared = prepareStart();
  else directory(attempt);
  const reservation = reserve();
  const outputs: string[] = [];
  const output: Output = (name, bytes) => {
    save(name, bytes);
    outputs.push(name);
  };
  let message = '';
  let errorMessage: string | null = null;
  try {
    if (prepared) message = startAction(prepared, output);
    else {
      const started = startedAttempt();
      if (action === 'collect') message = collectAction(started, reservation.prefix, output, outputs);
      else if (action === 'excerpt') message = excerptAction(started, reservation.phase, output);
      else message = partsAction(started, reservation.phase, output);
    }
  } catch (error) {
    errorMessage = errorText(error).slice(0, 500);
  }
  finishAction(reservation, outputs, message, errorMessage);
}

try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
