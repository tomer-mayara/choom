import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, realpathSync, writeFileSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type * as Ripgrep from '@vscode/ripgrep';
import type * as TsMorph from 'ts-morph';
import type * as Yaml from 'yaml';
import { refuseChangedProducerCode } from './producer-code.ts';
import { assert, type Fields, hash } from './record-checks.ts';
import { ripgrepVersion, runRipgrep } from './ripgrep.ts';
import { collect, type Output } from './stage-3-collect.ts';
import { exportsRecord } from './stage-3-exports.ts';
import {
  checkpoint, directory, drafts, handoffState, numberedExcerpt, type Parse, read, safePath, type StageState,
} from './stage-3-inputs.ts';
import {
  captureExclusions, ripgrepArgs, ripgrepResult, type RipgrepTool, searchOutcome, searchScope, textQuery, textSearchLimits,
  textSearchRecord,
} from './stage-3-text-search.ts';

// The Stage 3 helper. start checks the run after Stage 2 and saves the checkpoints,
// the cookbook and the handoff; collect saves the loading search, the symbol
// mentions, the first excerpts, the review prompt and the proposed artifact map;
// excerpt saves a requested range; text-search saves the record of a ripgrep search
// of the snapshot; exports saves the exports of a source file, read with the
// snapshot project; save-review copies the LLM review packet. Each action saves a
// receipt and appends its outcome to the command log.
interface Toolchain {
  parse: Parse;
  // ts-morph, with its own copy of TypeScript, which Stage 3 uses.
  tsMorph: typeof TsMorph;
  // The absolute path of the ripgrep program.
  ripgrep: string;
  versions: { node: string; tsMorph: string; typescript: string; ripgrep: RipgrepTool; modules: Record<string, string> };
}
interface Prepared { toolchain: Toolchain; state: StageState; sourceInputs: Record<string, Buffer> }
interface Started { toolchain: Toolchain; state: StageState }
interface Reservation { phase: string; prefix: string; started: Fields }

const self = fileURLToPath(import.meta.url);
const [action = '', ...args] = process.argv.slice(2);
const { CHOOM_WORK, CHOOM_TOOLS } = process.env;
const id = process.env.CHOOM_STAGE3_ID ?? '';
const helper = 'stage-3-commands.ts';
const cookbook = 'step-3-cookbook.md';
// Start saves the cookbook. The review prompt comes from that saved copy.
const toolInputs = [cookbook];
const frozen = [...drafts.map(checkpoint), ...toolInputs, 'handoff.json'];
const commandLog = 'commands.md';
const reviewFiles = ['entry-analysis.yaml', 'llm/analysis-prompt.md', 'llm/analysis-response.md',
  'llm/analysis-call.yaml', 'llm/review-scope.json'];
const utc = (): string => new Date().toISOString();
const exists = (path: string): boolean => Boolean(lstatSync(path, { throwIfNoEntry: false }));
const errorText = (error: unknown): string => String((error as { message?: unknown }).message ?? error).slice(0, 500);

assert(/^s3-[a-z0-9-]+$/.test(id), 'Set CHOOM_STAGE3_ID to an s3-... ID.');
assert((['start', 'collect'].includes(action) && args.length === 0) ||
  (action === 'excerpt' && args.length === 3) || (action === 'save-review' && args.length === 1) ||
  (action === 'text-search' && (args.length === 1 || (args.length === 2 && args[1] === '--pattern'))) ||
  (action === 'exports' && args.length === 1),
'Use start, collect, excerpt PATH FIRST LAST, text-search TEXT [--pattern], exports PATH, or save-review REVIEW_DIR.');
const work = directory(CHOOM_WORK);
const tools = directory(CHOOM_TOOLS);
assert(work !== tools && !tools.startsWith(work + '/'), 'Use a trusted tool checkout outside CHOOM_WORK.');
const evidence = directory(join(work, 'evidence'));
const attempt = join(evidence, id);
assert(!process.env.CHOOM_STAGE3 || process.env.CHOOM_STAGE3 === attempt, 'CHOOM_STAGE3 does not match the attempt.');
const sourceHelper = join(tools, 'packages/producer/src', helper);
const sourceCookbook = join(tools, 'docs/design/app-a', cookbook);
function saved(name: string): Buffer {
  assert(safePath(name), 'Invalid attempt path: ' + name);
  return read(join(attempt, name));
}
const save = (name: string, bytes: string | Buffer): void => writeFileSync(join(attempt, name), bytes, { flag: 'wx' });
const saveJson = (name: string, value: unknown): void => save(name, JSON.stringify(value, null, 2) + '\n');
const artifactId = (name: string): string => id + '-file@' + encodeURIComponent(name);
const digests = (names: string[]): Record<string, string> => Object.fromEntries(names.map(name => [name, hash(saved(name))]));
const logs = (prefix: string): string[] => ['.started.json', '.stdout.txt', '.stderr.txt'].map(suffix => prefix + suffix);
const require = createRequire(join(tools, 'package.json'));
const modules = join(tools, 'node_modules') + '/';

// The trusted tools of the checkout: YAML, ts-morph with its TypeScript, and ripgrep,
// with their versions and the digest of each tool file that this action loaded.
function loadTools(): Toolchain {
  function load(name: string, file = ''): unknown {
    const path = require.resolve(name + file);
    assert(path.startsWith(modules + name + '/'), 'Install ' + name + ' in the trusted tool checkout.');
    read(path);
    return require(path);
  }

  const { parse } = load('yaml') as typeof Yaml;
  const tsMorph = load('ts-morph') as typeof TsMorph;
  const { version: tsMorphVersion } = load('ts-morph', '/package.json') as { version: string };
  // @vscode/ripgrep names the program of this platform, from its own package in the checkout.
  const { rgPath } = load('@vscode/ripgrep') as typeof Ripgrep;
  assert(rgPath.startsWith(modules + '@vscode/ripgrep-'), 'Install @vscode/ripgrep in the trusted tool checkout.');
  const ripgrep = { version: ripgrepVersion(rgPath), program: rgPath.slice(modules.length), sha256: hash(read(rgPath)) };
  const toolFiles = Object.keys(require.cache).filter(path => path.startsWith(modules)).sort();
  return { parse, tsMorph, ripgrep: rgPath, versions: {
    node: process.version, tsMorph: tsMorphVersion, typescript: tsMorph.ts.version, ripgrep,
    modules: Object.fromEntries(toolFiles.map(path => [path.slice(modules.length), hash(read(path))])),
  } };
}

function reviewPrompt({ entryAnalysisRef }: { entryAnalysisRef: unknown }): string {
  const body = saved(cookbook).toString().replaceAll('\r\n', '\n');
  const pattern = /^<!-- stage3-review-prompt:start -->\n\x60\x60\x60text\n([\s\S]*?)^\x60\x60\x60\n<!-- stage3-review-prompt:end -->$/gm;
  const blocks = [...body.matchAll(pattern)];
  assert(blocks.length === 1, 'Expected one review prompt in the frozen Stage 3 cookbook.');
  const tokens: Record<string, unknown> = { WORK: work, ATTEMPT: attempt, ID: id, PREVIOUS_ENTRY_REF: entryAnalysisRef };
  const prompt = ((blocks[0] as RegExpMatchArray)[1] as string).replace(/\{\{([^{}\n]+)\}\}/g, (_, token: string) => {
    assert(Object.hasOwn(tokens, token), 'Unknown review prompt token: ' + token);
    return tokens[token] as string;
  });
  assert(!prompt.includes('{{'), 'Unresolved token in review prompt.');
  return prompt;
}

// Saves the started record of this action. Each excerpt request, text search and
// exports request takes the next free number.
function reserve(): Reservation {
  const command = {
    args: [process.execPath, self, action, ...args], cwd: process.cwd(),
    environment: { CHOOM_WORK: work, CHOOM_TOOLS: tools, CHOOM_STAGE3_ID: id },
  };
  const numbered = ['excerpt', 'text-search', 'exports'].includes(action);
  for (let index = 1; ; index++) {
    const phase = numbered ? action + '-' + String(index).padStart(3, '0') : action;
    const prefix = 'operator-' + phase;
    const started = { formatVersion: 1, attemptId: id, action, phase, command, startedAt: utc() };
    try {
      saveJson(prefix + '.started.json', started);
      return { phase, prefix, started };
    } catch (error) {
      if (numbered && (error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
  }
}

function logCommand(entry: Fields): void {
  const path = join(attempt, commandLog);
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical command log.');
  const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular command log.');
    const bytes = Buffer.from('\n\x60\x60\x60json\n' + JSON.stringify(entry) + '\n\x60\x60\x60\n');
    assert(writeSync(fd, bytes) === bytes.length, 'Incomplete command log write.');
  } finally {
    closeSync(fd);
  }
}

// The checks before a new attempt folder exists, or before a later action uses its attempt.
function prepare(): Prepared | undefined {
  refuseChangedProducerCode(work, tools);
  if (action !== 'start') {
    directory(attempt);
    assert(self === sourceHelper, 'Use the Stage 3 helper in the trusted checkout.');
    return undefined;
  }
  assert(self === sourceHelper && !exists(attempt), 'Start from CHOOM_TOOLS with a fresh attempt ID.');
  const toolchain = loadTools();
  const state = handoffState(toolchain.parse, work, id);
  const sourceInputs = { [cookbook]: read(sourceCookbook) };
  mkdirSync(attempt);
  return { toolchain, state, sourceInputs };
}

function startAttempt({ toolchain, state, sourceInputs }: Prepared, outputNames: string[]): string {
  save(commandLog, '# Stage 3 commands\n\n' +
    'Set CHOOM_WORK, CHOOM_TOOLS and CHOOM_STAGE3_ID before running these commands.\n\n' +
    '\x60\x60\x60sh\nnode "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-3 start\n' +
    'node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-3 collect\n' +
    'node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-3 excerpt PATH FIRST LAST\n' +
    'node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-3 text-search TEXT [--pattern]\n' +
    'node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-3 exports PATH\n' +
    'node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-3 save-review REVIEW_DIR\n' +
    'node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-3-finish\n\x60\x60\x60\n\n' +
    '## Recorded invocations\n');
  for (const name of drafts) save(checkpoint(name), state.inputs[name] as Buffer);
  for (const [name, bytes] of Object.entries(sourceInputs)) save(name, bytes);
  saveJson('handoff.json', { formatVersion: 1, attemptId: id, work, tools, ...state.facts,
    versions: toolchain.versions, toolInputDigests: digests(toolInputs),
    initialCommandsSha256: hash(saved(commandLog)) });
  outputNames.push(...frozen);
  return `Saved ${id} for ${String(state.facts.snapshotRef)}. Verified ${state.facts.registeredArtifacts} registered artifacts and indexed ${state.facts.indexedRegularFiles} regular-file records.`;
}

// Start completed with unchanged frozen inputs, and the run, the snapshot and the
// trusted tools still match the handoff.
function startedAttempt(): Started {
  const start = JSON.parse(saved('operator-start.json').toString()) as Fields | null | undefined;
  assert(start?.attemptId === id && start.action === 'start' && start.status === 'completed' &&
    isDeepStrictEqual(start.digests, digests(frozen)) &&
    isDeepStrictEqual(start.logDigests, digests(logs('operator-start'))),
  'Frozen inputs changed or start did not complete.');
  const handoff = JSON.parse(saved('handoff.json').toString()) as Fields;
  const toolchain = loadTools();
  const state = handoffState(toolchain.parse, work, id);
  assert(handoff.work === work && handoff.tools === tools && isDeepStrictEqual(handoff.versions, toolchain.versions) &&
    Object.entries(state.facts).every(([key, value]) => isDeepStrictEqual(handoff[key], value)),
  'Work, snapshot, checkpoints or trusted tools changed since start.');
  return { toolchain, state };
}

function collectAction({ toolchain, state }: Started, prefix: string, output: Output, outputNames: string[]): string {
  const prompt = reviewPrompt(state.facts);
  const summary = collect(state, toolchain, output, id);
  save('review-prompt.md', prompt);
  outputNames.push('review-prompt.md');
  const known = [...frozen, 'operator-start.json', ...logs('operator-start'),
    prefix + '.started.json', ...outputNames];
  output('artifact-map.json', {
    formatVersion: 1, attemptId: id, snapshotRef: state.facts.snapshotRef, status: 'proposed',
    limits: ['Proposed IDs for immutable evidence available to the review.',
      'The map omits the mutable command log, itself, and later files.'],
    artifacts: Object.fromEntries(known.map(name => [
      artifactId(name), { path: 'evidence/' + id + '/' + name, sha256: hash(saved(name)) },
    ])),
  });
  return summary;
}

function saveReviewAction(outputNames: string[]): string {
  const review = directory(args[0]);
  assert(review !== work && !review.startsWith(work + '/'), 'Keep the review packet outside the saved run.');
  const supplied = Object.fromEntries(reviewFiles.map(name => [name, read(join(review, name))]));
  assert(reviewFiles.every(name => (supplied[name] as Buffer).length > 0), 'Review packet files must not be empty.');
  mkdirSync(join(attempt, 'llm'));
  for (const name of reviewFiles) { save(name, supplied[name] as Buffer); outputNames.push(name); }
  return 'Saved the review packet. Run stage-3-finish to validate and register it.';
}

function excerptAction(state: StageState, phase: string, output: Output): string {
  const [path = '', firstText = '', lastText = ''] = args;
  const [first, last] = [Number(firstText), Number(lastText)];
  assert([firstText, lastText].every(value => /^[1-9][0-9]*$/.test(value)) &&
    [first, last].every(Number.isSafeInteger) && first <= last && last - first < 300,
  'Use an inclusive range of at most 300 lines.');
  const name = phase + '.json';
  output(name, { formatVersion: 1, id: id + '-source-' + phase, ...numberedExcerpt(state, path, first, last, false),
    limit: 'Saving an excerpt records a tool read only.' });
  return `Saved ${artifactId(name)} at ${join(attempt, name)} (SHA-256 ${hash(saved(name))}).`;
}

// Runs ripgrep on the snapshot root and saves its raw output and the tool-call record.
// Nothing is saved for a refused search; its receipt keeps the reason.
function textSearchAction({ toolchain, state }: Started, phase: string, output: Output, outputNames: string[]): string {
  const query = textQuery(args);
  const exclusions = captureExclusions(state);
  const root = state.facts.snapshot.path;
  const ripgrepArguments = ripgrepArgs(query, root);
  const run = runRipgrep(toolchain.ripgrep, ripgrepArguments, root, textSearchLimits);
  const search = ripgrepResult(run, root, state.files);
  const scope = searchScope(state, search.searchedFiles, exclusions);
  const [stdout, stderr, name] = [phase + '.stdout.jsonl', phase + '.stderr.txt', phase + '.json'];
  save(stdout, run.stdout);
  save(stderr, run.stderr);
  outputNames.push(stdout, stderr);
  output(name, textSearchRecord({ attemptId: id, snapshotRef: state.facts.snapshotRef, query,
    tool: toolchain.versions.ripgrep, args: ripgrepArguments, exitCode: run.exitCode, scope, search,
    output: { stdout, stdoutSha256: hash(run.stdout), stderr, stderrSha256: hash(run.stderr) } }));
  return `Saved ${artifactId(name)} at ${join(attempt, name)} (SHA-256 ${hash(saved(name))}). ` +
    `Outcome: ${searchOutcome(search)}. ripgrep searched ${scope.searchedFiles} files.`;
}

// Lists the exports of one indexed source file and saves the record. Nothing is
// saved for a refused request; its receipt keeps the reason.
function exportsAction({ toolchain, state }: Started, phase: string, output: Output): string {
  const [path = ''] = args;
  const record = exportsRecord({ attemptId: id, state, path, tsMorph: toolchain.tsMorph, versions: toolchain.versions });
  const name = phase + '.json';
  output(name, record);
  return `Saved ${artifactId(name)} at ${join(attempt, name)} (SHA-256 ${hash(saved(name))}). ` +
    `Listed ${(record.exports as unknown[]).length} exports of ${path} and ${(record.gaps as unknown[]).length} gaps.`;
}

function runAction(prepared: Prepared | undefined, { phase, prefix }: Reservation, output: Output,
  outputNames: string[]): string {
  if (action === 'start') return startAttempt(prepared as Prepared, outputNames);
  const started = startedAttempt();
  if (action === 'collect') return collectAction(started, prefix, output, outputNames);
  if (action === 'save-review') return saveReviewAction(outputNames);
  if (action === 'text-search') return textSearchAction(started, phase, output, outputNames);
  if (action === 'exports') return exportsAction(started, phase, output);
  return excerptAction(started.state, phase, output);
}

// Appends the outcome to the command log, saves the receipt of the action and prints its message.
function finishAction({ prefix, started }: Reservation, outputNames: string[], message: string, failure: string | null): void {
  let errorMessage = failure;
  const finishedAt = utc();
  const outcome = (): { status: string; exitCode: number } =>
    errorMessage ? { status: 'failed', exitCode: 1 } : { status: 'completed', exitCode: 0 };
  try {
    logCommand({ ...started, ...outcome(), finishedAt });
  } catch (error) {
    errorMessage = [errorMessage, errorText(error)].filter(Boolean).join(' | ');
  }
  process.exitCode = outcome().exitCode;
  save(prefix + '.stdout.txt', message ? message + '\n' : '');
  save(prefix + '.stderr.txt', errorMessage ? errorMessage + '\n' : '');
  saveJson(prefix + '.json', {
    ...started, ...outcome(), finishedAt, digests: digests(outputNames),
    logDigests: digests(logs(prefix)),
  });
  if (errorMessage) console.error(errorMessage);
  else console.log(message);
}

function main(): void {
  const prepared = prepare();
  const reservation = reserve();
  const outputNames: string[] = [];
  const output: Output = (name, value) => {
    saveJson(name, value);
    outputNames.push(name);
  };
  let message = '';
  let errorMessage: string | null = null;
  try {
    message = runAction(prepared, reservation, output, outputNames);
  } catch (error) {
    errorMessage = errorText(error);
  }
  finishAction(reservation, outputNames, message, errorMessage);
}

try {
  main();
} catch (error) {
  console.error(errorText(error));
  process.exitCode = 1;
}
