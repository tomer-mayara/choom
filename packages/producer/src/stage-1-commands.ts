import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { appendFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { checkReasoningNotSaved, checkVisibleResponse } from './llm-response.ts';
import { producerReceipt, producerRecordPath, refuseChangedProducerCode } from './producer-code.ts';
import { evidenceBase, type EvidenceTarget, type PointerMessages, resolveEvidence, savedDocument } from './record-checks.ts';
import { localRunExclusion, pathsOverlap, runLayout } from './run-layout.mjs';
import { defaultCaptureExclusions, readCaptureExclusions } from './stage-1-exclusions.ts';
import { type DiscoveryGap, toolGaps } from './stage-1-gaps.ts';
import { type GitIdentityRecord, gitIdentity, gitIdentityGaps, gitIdentityPath, gitIdentityRef, type RunGit }
  from './stage-1-git.ts';

// The Stage 1 helper. Every action runs from the trusted tool checkout. Start
// records the producer code, and each later action refuses the run when the
// code in the checkout differs from that record.
// Saved JSON and YAML stay unchecked values until the checks below read them.
type Fields = Record<string, unknown>;
interface InventoryFile { path: string; kind: string; bytes: number; sha256: string }
interface Inventory { formatVersion: number; snapshotId: string; files: InventoryFile[] }
interface CaptureLayout { workLayout: string; requiredExclusion: string | null }
interface StageOneInputs extends CaptureLayout {
  runRef: string; snapshotRef: string; baselineId: string; target: string; tools: string;
}
// `settings` are variables of `env` that the call record lists.
interface CommandOptions { timeout?: number; input?: Buffer; env?: NodeJS.ProcessEnv; settings?: Record<string, string> }
interface SavedArtifact { path: string; bytes: Buffer }
interface Review { reviewedFiles: Fields[]; roles: Fields[]; workspaceDeclarations: Fields[]; questions: Fields[]; gaps: Fields[] }
interface ReviewEvidence { artifacts: Map<string, SavedArtifact>; sources: Map<string, Fields>; excerpts: Fields[]; ids: Set<unknown> }

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const safe = (name: unknown): name is string => text(name) && !isAbsolute(name) && !/[\\\u0000-\u001f\u007f]/.test(name) &&
  name.split('/').every(part => part && part !== '.' && part !== '..');
const lineNumber = (value: unknown): value is number => Number.isInteger(value);
// Reads value?.[key] from an unchecked value.
const at = (value: unknown, key: PropertyKey): unknown => (value as Record<PropertyKey, unknown> | null | undefined)?.[key];
const [action, ...args] = process.argv.slice(2);
const self = fileURLToPath(import.meta.url);
const tools = realpathSync(process.env.CHOOM_TOOLS ?? '');
assert(self === join(tools, 'packages/producer/src/stage-1-commands.ts'), 'Use the trusted Stage 1 helper.');
// The settings action runs the settings collector in the tool checkout.
const collector = join(dirname(self), 'stage-1-settings.ts');
assert(isAbsolute(process.env.CHOOM_WORK ?? ''), 'Set CHOOM_WORK to a new absolute path.');
const work = resolve(process.env.CHOOM_WORK ?? '');
const require = createRequire(join(tools, 'package.json'));
const { parse, stringify } = require('yaml');
const packet = ['review.yaml', 'review-scope.json', 'llm-prompt.md', 'llm-response.md', 'llm-call.yaml'];
const issueKinds = ['roles', 'workspaceDeclarations', 'questions', 'gaps'] as const;
const utc = (): string => new Date().toISOString();
const save = (name: string, bytes: string | Buffer): void => writeFileSync(join(work, name), bytes, { flag: 'wx' });
const saveJson = (name: string, value: unknown): void => save(name, JSON.stringify(value, null, 2) + '\n');
function read(name: string): Buffer {
  assert(safe(name), 'Invalid saved path: ' + name);
  const path = join(work, name);
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + name);
  return readFileSync(path);
}
const json = (name: string) => JSON.parse(read(name).toString());
function present(name: string): boolean { return Boolean(lstatSync(join(work, name), { throwIfNoEntry: false })); }
// Runs a program in the working folder, and saves its output and a record of the call.
function recordedCall(program: string, commandArgs: string[], stem: string,
  { timeout = 300_000, input, env = { ...process.env, CHOOM_WORK: work }, settings }: CommandOptions = {}): SpawnSyncReturns<Buffer> {
  const result = spawnSync(program, commandArgs, { cwd: work, env, input, timeout, maxBuffer: 128 * 1024 * 1024 });
  const record = { command: program, args: commandArgs, ...(settings && { environment: settings }), recordedAt: utc(),
    exitCode: result.status, signal: result.signal, error: result.error?.message ?? null };
  save(stem + '.stdout.txt', result.stdout ?? ''); save(stem + '.stderr.txt', result.stderr ?? '');
  saveJson(stem + '.json', record);
  return result;
}
function command(program: string, commandArgs: string[], stem: string, options: CommandOptions = {}): Buffer {
  const result = recordedCall(program, commandArgs, stem, options);
  assert(!result.error && !result.signal && result.status === 0, 'Command failed; see ' + stem + '.stderr.txt');
  return result.stdout;
}
function enumerate(dir = ''): string[] {
  const files: string[] = [];
  for (const name of readdirSync(join(work, dir)).sort()) {
    const path = dir ? dir + '/' + name : name;
    assert(safe(path), 'Unsupported saved path: ' + path);
    const stat = lstatSync(join(work, path));
    assert(!stat.isSymbolicLink(), 'Symbolic links are unsupported: ' + path);
    if (stat.isDirectory()) files.push(...enumerate(path));
    else { assert(stat.isFile(), 'Unsupported filesystem item: ' + path); files.push(path); }
  }
  return files;
}
function verifyInventory(inventory: Inventory): void {
  const files = enumerate('snapshot').map(path => path.slice('snapshot/'.length));
  assert(isDeepStrictEqual(files, inventory.files.map(file => file.path)), 'Snapshot file set changed.');
  for (const record of inventory.files) {
    const bytes = read('snapshot/' + record.path);
    assert(record.kind === 'file' && bytes.length === record.bytes && hash(bytes) === record.sha256,
      'Snapshot content changed: ' + record.path);
  }
}
function sourceRange(path: unknown, first: unknown, last: unknown, inventory: Inventory) {
  assert(safe(path), 'Use a snapshot-relative source path.');
  const file = inventory.files.find(file => file.path === path);
  assert(file?.kind === 'file', 'Source is not in the saved inventory: ' + path);
  assert(file.bytes <= 2 * 1024 * 1024, 'Source excerpt input exceeds 2 MiB: ' + path);
  const bytes = read('snapshot/' + path);
  assert(bytes.length === file.bytes && hash(bytes) === file.sha256, 'Source content changed: ' + path);
  const source = bytes.toString('utf8');
  const lines = source ? source.split(/\r\n|\r|\n/) : []; if (/[\r\n]$/.test(source)) lines.pop();
  assert(!source.includes('\0') && Buffer.from(source).equals(bytes), 'Excerpt input must be UTF-8 text.');
  assert(lineNumber(first) && lineNumber(last) && first >= 1 && last >= first && last <= lines.length && last - first < 300,
    'Source range is outside the saved file.');
  const excerpt = lines.slice(first - 1, last).map((value, index) => `${first + index}: ${value}`).join('\n');
  assert(Buffer.byteLength(excerpt) <= 100 * 1024, 'Numbered excerpt exceeds 100 KiB.');
  return { snapshotRef: inventory.snapshotId, path, sha256: file.sha256, lines: [first, last],
    excerpt, totalLines: lines.length };
}
function artifactId(path: string): string {
  const fixed: Record<string, string> = { 'evidence/inventory.json': 'inventory-001', 'evidence/settings.json': 'settings-001',
    'evidence/review.yaml': 'review-001', 'evidence/tools.json': 'tools-001', 'exclusions.txt': 'exclusions-001',
    'evidence/scope-notes.md': 'scope-notes-001', 'evidence/extra-configs.json': 'extra-configs-001',
    'evidence/stage1-discovery.yaml': 'discovery-001', 'evidence/review-scope.json': 'review-scope-001',
    [gitIdentityPath]: gitIdentityRef };
  return fixed[path] ?? 's1-file@' + encodeURIComponent(path);
}
function captureLayout(target: string): CaptureLayout {
  const workLayout = runLayout(work, tools);
  const sameCheckout = target === tools;
  assert(lstatSync(target).isDirectory() && realpathSync(target) === target, 'Use a canonical target directory.');
  assert(!pathsOverlap(target, work) || (sameCheckout && workLayout === 'checkout-local'),
    'Keep the working folder outside the target unless it is a direct child of work-choom in the shared checkout.');
  return { workLayout, requiredExclusion: sameCheckout ? localRunExclusion : null };
}
function inventoryHelper(snapshotRef: string): string {
  return `import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root = join(process.env.CHOOM_WORK, 'snapshot');
const files = [];
function visit(relative = '') {
  for (const name of readdirSync(join(root, relative)).sort()) {
    const path = relative ? relative + '/' + name : name;
    const absolute = join(root, path); const stat = lstatSync(absolute);
    if (stat.isDirectory()) visit(path);
    else if (stat.isFile()) { const bytes = readFileSync(absolute); files.push({ path, kind: 'file', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    else throw new Error('Unsupported filesystem item: ' + path);
  }
}
visit(); console.log(JSON.stringify({ formatVersion: 1, snapshotId: ${JSON.stringify(snapshotRef)}, files }, null, 2));
`;
}

function startRun(): void {
  assert(args.length === 0 && !lstatSync(work, { throwIfNoEntry: false }), 'Use a new working folder.');
  assert(realpathSync(dirname(work)) === dirname(work), 'Use a canonical working-folder parent.');
  const target = realpathSync(process.env.CHOOM_TARGET ?? '');
  const layout = captureLayout(target);
  const ids = { runRef: process.env.CHOOM_RUN_ID, snapshotRef: process.env.CHOOM_SNAPSHOT_ID,
    baselineId: process.env.CHOOM_BASELINE_ID };
  for (const [key, prefix] of [['runRef', 'run'], ['snapshotRef', 'snapshot'], ['baselineId', 'baseline']] as const)
    assert(new RegExp('^' + prefix + '-[a-z0-9]+(?:-[a-z0-9]+)*$').test(ids[key] ?? ''), 'Set ' + key + ' to a simple new ID.');
  const producer = producerReceipt(tools);
  mkdirSync(work); mkdirSync(join(work, 'snapshot')); mkdirSync(join(work, 'evidence'));
  saveJson('evidence/stage1-inputs.json', { formatVersion: 1, ...ids, target, tools, ...layout, startedAt: utc() });
  saveJson(producerRecordPath, producer);
  // A record of the instructions and prompts for this run. No code reads it.
  save('evidence/cookbook.md', readFileSync(join(tools, 'docs/design/app-a/step-1-cookbook.md')));
  saveJson('evidence/tools.json', { node: process.version, tsMorph: require('ts-morph/package.json').version,
    typescript: require('ts-morph').ts.version, yaml: require('yaml/package.json').version });
  const protectedRule = layout.requiredExclusion ? layout.requiredExclusion + '\n' : '';
  save('exclusions.txt', protectedRule + defaultCaptureExclusions);
  save('evidence/scope-notes.md', 'The initial capture excludes dot-prefixed directories, dependencies, common credential files, and listed root build/report folders. Hidden CI and tool settings may be missing. Generated source outside the listed folders remains eligible. Review and amend these exclusions before capture.\n' +
    '\nWorking folder layout: ' + layout.workLayout + '.\n' +
    (protectedRule ? 'The required ' + layout.requiredExclusion + ' exclusion keeps the entire local run area out of the captured tool checkout.\n' : ''));
  saveJson('evidence/extra-configs.json', []);
  save('evidence/commands.md', '# Stage 1 commands\n');
  console.log('Working folder prepared. Review exclusions.txt and scope-notes.md before capture.');
}

function protectedArguments(layout: CaptureLayout, exclusions: Buffer): string[] {
  const protectedArgs: string[] = [];
  if (layout.requiredExclusion) {
    const rules = exclusions.toString().split(/\r\n|\r|\n/);
    assert(rules.includes(layout.requiredExclusion),
      'Keep the required ' + layout.requiredExclusion + ' line in exclusions.txt.');
    assert(!exclusions.includes(0) && !rules.some(rule => rule.trim() === '!'),
      'Capture exclusions cannot contain a NUL byte or clear the filter list.');
    protectedArgs.push('--exclude=' + layout.requiredExclusion);
  }
  return protectedArgs;
}

function capture(inputs: StageOneInputs): void {
  assert(args.length === 0 && !present('evidence/capture.json'), 'Capture already attempted; use a new working folder.');
  const layout = captureLayout(inputs.target);
  assert(layout.workLayout === inputs.workLayout && layout.requiredExclusion === inputs.requiredExclusion,
    'Capture layout differs from the saved inputs.');
  const exclusions = read('exclusions.txt');
  const scopeNotes = read('evidence/scope-notes.md');
  assert(exclusions.length && scopeNotes.length, 'Record capture scope first.');
  const captureArgs = [...protectedArguments(layout, exclusions), '--exclude-from=-',
    inputs.target + '/', join(work, 'snapshot') + '/'];
  command('rsync', ['--version'], 'evidence/rsync-version');
  command('rsync', ['-rlt', '--links', ...captureArgs], 'evidence/capture', { input: exclusions });
  const comparison = command('rsync', ['-rcnl', '--delete', '--itemize-changes', ...captureArgs],
    'evidence/capture-comparison', { input: exclusions });
  assert(comparison.toString().trim() === '', 'Capture comparison found changes. Use a new folder and retry.');
  assert(exclusions.equals(read('exclusions.txt')) && scopeNotes.equals(read('evidence/scope-notes.md')),
    'Capture scope changed during capture. Use a new folder and retry.');
  // Later graph and publication profiles require regular files. Reject links at capture.
  const paths = enumerate('snapshot');
  const inventory = { formatVersion: 1, snapshotId: inputs.snapshotRef, files: paths.map(path => {
    const bytes = read(path); return { path: path.slice('snapshot/'.length), kind: 'file', bytes: bytes.length, sha256: hash(bytes) };
  }) };
  saveJson('evidence/inventory.json', inventory);
  save('evidence/captured-at.txt', utc() + '\n');
  saveJson('evidence/capture-scope.json', { formatVersion: 1, snapshotRef: inputs.snapshotRef, ...layout,
    exclusionsSha256: hash(exclusions), scopeNotesSha256: hash(scopeNotes) });
  save('inventory.mjs', inventoryHelper(inputs.snapshotRef));
  const git = recordGitIdentity(inputs, inventory, exclusions);
  console.log(`Captured ${inventory.files.length} regular files. Atomic capture is not proven.`);
  console.log(git.status === 'available' ? `Git identity recorded: commit ${git.commit}. See ${gitIdentityPath}.`
    : `Git evidence is not available. See ${gitIdentityPath}.`);
}

// Saves the Git identity of the target folder. Each Git call is saved as the rsync
// calls are, and its record lists the Git variables that the call set.
function recordGitIdentity(inputs: StageOneInputs, inventory: Inventory, exclusions: Buffer): GitIdentityRecord {
  mkdirSync(join(work, 'evidence/git'));
  let calls = 0;
  const runGit: RunGit = ({ args: gitArgs, env }) => {
    const stem = 'evidence/git/call-' + String(++calls).padStart(3, '0');
    const settings = Object.fromEntries(Object.entries(env).filter(([name]) => name.startsWith('GIT_')));
    const result = recordedCall('git', gitArgs, stem, { env, settings, timeout: 120_000 });
    return { status: result.status, stdout: result.stdout ?? Buffer.alloc(0), stderr: String(result.stderr ?? ''),
      error: result.error?.message ?? (result.signal ? 'Git stopped with signal ' + result.signal : null) };
  };
  const record = gitIdentity(runGit, { target: inputs.target, environment: process.env,
    snapshot: { snapshotRef: inputs.snapshotRef, paths: inventory.files.map(file => file.path), read: path => read('snapshot/' + path) },
    exclusions: readCaptureExclusions(exclusions.toString()) });
  saveJson(gitIdentityPath, record);
  return record;
}

function collectSettings(inputs: StageOneInputs): void {
  assert(args.length === 0, 'settings takes no arguments.');
  const inventory: Inventory = json('evidence/inventory.json'); verifyInventory(inventory);
  const extras = json('evidence/extra-configs.json');
  assert(Array.isArray(extras) && extras.every(safe), 'Extra compiler settings must be saved relative paths.');
  if (!present('evidence/settings-probes')) mkdirSync(join(work, 'evidence/settings-probes'));
  const prior = readdirSync(join(work, 'evidence/settings-probes')).map(name => /^probe-([0-9]+)\./.exec(name))
    .filter(match => match !== null).map(match => Number(match[1]));
  const n = Math.max(0, ...prior) + 1;
  const stem = 'evidence/settings-probes/probe-' + String(n).padStart(3, '0');
  save(stem + '.extra-configs.json', read('evidence/extra-configs.json'));
  const bytes = command(process.execPath, [collector], stem, { timeout: 60_000 });
  const result = JSON.parse(bytes.toString()); assert(result.snapshotId === inputs.snapshotRef, 'Wrong settings snapshot.');
  save(stem + '.result.json', bytes);
  writeFileSync(join(work, 'evidence/settings.json'), bytes);
  writeFileSync(join(work, 'evidence/settings-selection.json'), JSON.stringify({ formatVersion: 1,
    snapshotRef: inputs.snapshotRef, probe: stem, settingsSha256: hash(bytes),
    extraConfigsSha256: hash(read('evidence/extra-configs.json')),
    collectorSha256: hash(readFileSync(collector)) }, null, 2) + '\n');
  console.log('Settings collected. Evidence ID for this probe: ' + artifactId(stem + '.result.json'));
}

function saveExcerpt(): void {
  assert(args.length === 4 && text(args[3]), 'Use excerpt PATH FIRST LAST REASON.');
  const [sourcePath, first, last, reason] = args;
  const inventory: Inventory = json('evidence/inventory.json');
  if (!present('evidence/excerpts')) mkdirSync(join(work, 'evidence/excerpts'));
  const n = readdirSync(join(work, 'evidence/excerpts')).length + 1;
  const path = 'evidence/excerpts/excerpt-' + String(n).padStart(3, '0') + '.json';
  const id = 's1-source-' + String(n).padStart(3, '0');
  const result = { formatVersion: 1, id, artifactRef: artifactId(path), reason, ...sourceRange(sourcePath, Number(first), Number(last), inventory) };
  saveJson(path, result); console.log(JSON.stringify(result, null, 2));
}

// Checks the capture scope and the selected settings record, and returns that record.
function checkCapturedInputs(inputs: StageOneInputs): { gaps: unknown[] } {
  const capturedScope = json('evidence/capture-scope.json');
  assert(capturedScope.snapshotRef === inputs.snapshotRef && capturedScope.workLayout === inputs.workLayout &&
    capturedScope.requiredExclusion === inputs.requiredExclusion && capturedScope.exclusionsSha256 === hash(read('exclusions.txt')) &&
    capturedScope.scopeNotesSha256 === hash(read('evidence/scope-notes.md')), 'Capture exclusions or scope notes changed after capture.');
  const settings = json('evidence/settings.json');
  assert(settings.formatVersion === 2 && settings.snapshotId === inputs.snapshotRef && Array.isArray(settings.configs) &&
    Array.isArray(settings.packages) && Object.hasOwn(settings, 'parsingProfile') && Array.isArray(settings.gaps),
  'Complete settings collection before the final review.');
  const selection = json('evidence/settings-selection.json');
  assert(selection.formatVersion === 1 && selection.snapshotRef === inputs.snapshotRef && safe(selection.probe) &&
    selection.settingsSha256 === hash(read('evidence/settings.json')) &&
    selection.settingsSha256 === hash(read(selection.probe + '.result.json')) &&
    selection.extraConfigsSha256 === hash(read('evidence/extra-configs.json')) &&
    selection.extraConfigsSha256 === hash(read(selection.probe + '.extra-configs.json')) &&
    selection.collectorSha256 === hash(readFileSync(collector)) && json(selection.probe + '.json').exitCode === 0,
  'Settings do not match the selected successful probe and current extra paths. Rerun settings before review.');
  return settings;
}

// The discovery gaps that finish adds from each tool record, such as missing
// project settings or missing Git evidence, with the name of the record.
interface AddedGaps { record: string; gaps: DiscoveryGap[] }
function addedGaps(settings: { gaps: unknown[] }, inputs: StageOneInputs): AddedGaps[] {
  return [{ record: 'settings', gaps: toolGaps({ name: 'settings', artifactRef: 'settings-001', gaps: settings.gaps }) },
    { record: 'Git identity', gaps: gitIdentityGaps(json(gitIdentityPath), inputs.snapshotRef) }];
}

function readReview(reviewDir: string, inputs: StageOneInputs): { bytes: Map<string, Buffer>; review: Review } {
  const bytes = new Map(packet.map((name): [string, Buffer] => {
    const path = join(reviewDir, name); assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular review file: ' + name);
    return [name, readFileSync(path)];
  }));
  const file = (name: string): Buffer => bytes.get(name) as Buffer;
  const review = parse(file('review.yaml').toString());
  const lists = ['reviewedFiles', 'roles', 'workspaceDeclarations', 'questions', 'gaps'];
  assert(review?.formatVersion === 1 && review.snapshotRef === inputs.snapshotRef && review.llmReview === 'recorded' &&
    lists.every(key => Array.isArray(review[key])) && Object.keys(review).length === lists.length + 3,
  'Expected a complete Stage 1 review.');
  const call = parse(file('llm-call.yaml').toString());
  assert(call && ['provider', 'model', 'date'].every(key => text(call[key])) &&
    (call.settings === 'unknown' || (call.settings !== null && typeof call.settings === 'object' && !Array.isArray(call.settings))),
  'Record LLM provider, model, date and settings; use unknown for unavailable metadata.');
  assert(packet.every(name => file(name).length), 'Empty review packet file.');
  assert(file('llm-response.md').toString().includes(file('review.yaml').toString().trim()),
    'Save the complete final review YAML in the LLM response.');
  checkReasoningNotSaved(call, 'llm-call.yaml');
  checkVisibleResponse(file('llm-response.md').toString(), 'llm-response.md');
  return { bytes, review };
}

function reviewSources(review: Review, inventory: Inventory): ReviewEvidence {
  const artifacts = new Map<string, SavedArtifact>(enumerate('evidence').map(path => [artifactId(path), { path, bytes: read(path) }]));
  artifacts.set('exclusions-001', { path: 'exclusions.txt', bytes: read('exclusions.txt') });
  const sources = new Map<string, Fields>();
  const ids = new Set<unknown>([...artifacts.keys(), ...packet.map(name => artifactId('evidence/' + name)), 'discovery-001']);
  const excerpts: Fields[] = [...artifacts.values()].filter(record => record.path.startsWith('evidence/excerpts/'))
    .map(record => JSON.parse(record.bytes.toString()));
  for (const excerpt of excerpts) {
    const expected = sourceRange(excerpt.path, at(excerpt.lines, 0), at(excerpt.lines, 1), inventory);
    assert(text(excerpt.id) && !artifacts.has(excerpt.id) && excerpt.snapshotRef === expected.snapshotRef &&
      excerpt.sha256 === expected.sha256 && excerpt.excerpt === expected.excerpt && excerpt.totalLines === expected.totalLines,
    'Saved excerpt differs from indexed source: ' + excerpt.id);
  }
  for (const source of review.reviewedFiles) {
    assert(text(source.id) && !ids.has(source.id), 'Duplicate source ID: ' + source.id); ids.add(source.id);
    const expected = sourceRange(source.path, at(source.lines, 0), at(source.lines, 1), inventory);
    assert(source.snapshotRef === expected.snapshotRef && source.sha256 === expected.sha256 &&
      excerpts.some(excerpt => excerpt.id === source.id && excerpt.path === source.path && excerpt.sha256 === source.sha256 &&
        isDeepStrictEqual(excerpt.lines, source.lines)), 'No exact supplied excerpt supports source record: ' + source.id);
    sources.set(source.id, source);
  }
  for (const excerpt of excerpts) ids.add(excerpt.id);
  return { artifacts, sources, excerpts, ids };
}

// The words of the Stage 1 messages for a JSON Pointer that it refuses.
const pointerMessages: PointerMessages = { invalid: 'Invalid JSON Pointer: ', escape: 'Invalid JSON Pointer: ',
  index: 'Unresolved JSON Pointer: ', unresolved: 'Unresolved JSON Pointer: ' };

// An evidence reference resolves as every later stage resolves it, so later stages
// accept each question and gap that Stage 1 saves.
function checkReference(ref: unknown, { artifacts, sources }: ReviewEvidence): void {
  assert(text(ref), 'Empty evidence reference.');
  const id = evidenceBase(ref);
  const source = sources.get(id);
  const artifact = artifacts.get(id);
  const target: EvidenceTarget | undefined = source ? { record: source } : artifact &&
    { path: artifact.path, document: () => savedDocument(artifact.path, artifact.bytes.toString(), parse) };
  assert(target, 'Unknown evidence reference: ' + ref);
  resolveEvidence(ref, target, pointerMessages);
}

function checkReviewItem(key: typeof issueKinds[number], item: Fields, ids: Set<unknown>): void {
  if (key === 'questions' || key === 'gaps') {
    assert(text(item.id) && !ids.has(item.id) && Array.isArray(item.subjectRefs) && item.subjectRefs.length &&
      item.subjectRefs.every(text) && text(item[key === 'questions' ? 'text' : 'reason']) &&
      (key !== 'gaps' || text(item.kind)), 'Invalid question or gap.'); ids.add(item.id);
  } else if (key === 'roles') assert(text(item.selector) && Array.isArray(item.roles) && item.roles.length &&
    item.roles.every(text) && ['observed', 'inferred'].includes(item.basis as string), 'Invalid role.');
  else assert(text(item.path) && Array.isArray(item.patterns) && item.patterns.every(text) &&
    ['verified', 'unverified'].includes(item.membershipStatus as string), 'Invalid workspace declaration.');
}

function checkReviewItems(review: Review, evidence: ReviewEvidence): void {
  for (const key of issueKinds) for (const item of review[key]) {
    assert(Array.isArray(item.evidenceRefs) && item.evidenceRefs.length, 'Missing evidence in ' + key);
    item.evidenceRefs.forEach(ref => checkReference(ref, evidence));
    checkReviewItem(key, item, evidence.ids);
  }
}

// The IDs of the gaps that finish adds stay unique: no review question or gap uses them.
// No question or gap uses the baseline ID either: Stages 4 to 6 reserve it for the
// fixed baseline, and later stages keep each question and gap unchanged.
function checkReservedIds(review: Review, added: AddedGaps[], baselineId: string): void {
  for (const item of [...review.questions, ...review.gaps])
    assert(item.id !== baselineId, 'The ID ' + item.id + ' is reserved for the baseline. Use a different ID.');
  for (const { record, gaps } of added) {
    const reserved = new Set<unknown>(gaps.map(gap => gap.id));
    for (const item of [...review.questions, ...review.gaps])
      assert(!reserved.has(item.id), 'The ID ' + item.id + ' is reserved for a gap that finish adds from the ' + record +
        ' record. Use a different ID.');
  }
}

function checkSuppliedScope(scopeBytes: Buffer, inputs: StageOneInputs, review: Review, evidence: ReviewEvidence): void {
  const scope = JSON.parse(scopeBytes.toString());
  assert(scope?.formatVersion === 1 && scope.runRef === inputs.runRef && scope.snapshotRef === inputs.snapshotRef &&
    Array.isArray(scope.suppliedArtifactRefs) && scope.suppliedArtifactRefs.every(text) && Array.isArray(scope.limits) &&
    scope.limits.every(text), 'Save the complete supplied-evidence scope with the review.');
  for (const id of scope.suppliedArtifactRefs) assert(evidence.artifacts.has(id), 'Unknown supplied artifact: ' + id);
  for (const id of ['inventory-001', 'settings-001', 'exclusions-001', 'scope-notes-001', 'extra-configs-001'])
    assert(scope.suppliedArtifactRefs.includes(id), 'Missing required supplied evidence: ' + id);
  for (const key of issueKinds) for (const item of review[key])
    for (const ref of item.evidenceRefs as string[]) {
      const id = ref.split('#')[0] ?? '';
      assert(evidence.sources.has(id) || scope.suppliedArtifactRefs.includes(id), 'Cited artifact was not declared supplied: ' + ref);
    }
  for (const source of review.reviewedFiles) {
    const supplied = evidence.excerpts.filter(excerpt => excerpt.path === source.path && excerpt.sha256 === source.sha256 &&
      isDeepStrictEqual(excerpt.lines, source.lines));
    assert(supplied.some(excerpt => scope.suppliedArtifactRefs.includes(excerpt.artifactRef)),
      'Reviewed source excerpt is absent from supplied-evidence scope: ' + source.id);
  }
}

// Review packets are copied only after validation; the manifest is published last.
// Discovery has the review gaps and then the gaps that the tools found.
function publish(inputs: StageOneInputs, bytes: Map<string, Buffer>, review: Review, inventory: Inventory,
  addedGaps: DiscoveryGap[]): void {
  for (const [name, content] of bytes) save('evidence/' + name, content);
  const discovery = { formatVersion: 1, kind: 'architecture-discovery', runRef: inputs.runRef,
    questions: review.questions, gaps: [...review.gaps, ...addedGaps] };
  save('evidence/stage1-discovery.yaml', stringify(discovery));
  save('baseline.yaml', stringify({ formatVersion: 1, id: inputs.baselineId, parentId: null,
    components: [], interfaces: [], resources: [], rules: [] }));
  save('discovery.yaml', stringify(discovery));
  appendFileSync(join(work, 'evidence/commands.md'), '\nCompleted Stage 1 review and verification at ' + utc() + '.\n');
  const all = [...enumerate('evidence'), 'exclusions.txt', 'inventory.mjs'];
  const registry = Object.fromEntries(all.map(path => [artifactId(path), { path, sha256: hash(read(path)) }]));
  assert(Object.keys(registry).length === all.length, 'Duplicate artifact IDs.');
  save('run.yaml', stringify({ formatVersion: 1, id: inputs.runRef, mode: 'A', status: 'in-progress',
    progress: { inventory: 'complete', baselineRecovery: 'pending' }, snapshot: { id: inputs.snapshotRef,
      root: 'snapshot', inventoryRef: 'inventory-001', exclusions: 'exclusions.txt',
      captureMethod: 'rsync copy followed by a checksum dry-run comparison',
      captureLimit: 'The copy was checked for differences; atomic capture is not proven.', sourcePath: inputs.target,
      capturedAt: read('evidence/captured-at.txt').toString().trim() },
    coverage: { inventoried: inventory.files.length + ' regular files in the selected capture scope.',
      inspected: 'Source ranges are in review-001#/reviewedFiles. Tool reads are separate.',
      unresolved: 'See discovery.yaml questions and gaps. The baseline is not yet recovered.' }, artifacts: registry }));
  console.log('Stage 1 saved. Run verify, then continue to Stage 2.');
}

function finish(inputs: StageOneInputs): void {
  assert(args.length === 1 && isAbsolute(args[0] ?? ''), 'Use finish /absolute/review-folder.');
  const reviewDir = realpathSync(args[0] ?? '');
  assert(!reviewDir.startsWith(work + '/') && reviewDir !== work, 'Keep review inputs outside the saved run.');
  const inventory: Inventory = json('evidence/inventory.json'); verifyInventory(inventory);
  const added = addedGaps(checkCapturedInputs(inputs), inputs);
  const { bytes, review } = readReview(reviewDir, inputs);
  const evidence = reviewSources(review, inventory);
  checkReviewItems(review, evidence);
  checkReservedIds(review, added, inputs.baselineId);
  checkSuppliedScope(bytes.get('review-scope.json') as Buffer, inputs, review, evidence);
  publish(inputs, bytes, review, inventory, added.flatMap(({ gaps }) => gaps));
}

// The saved Stage 1 discovery has each gap that finish adds from the saved tool records.
function checkSavedToolGaps(inputs: StageOneInputs): void {
  const discovery = parse(read('evidence/stage1-discovery.yaml').toString());
  for (const { record, gaps } of addedGaps(json('evidence/settings.json'), inputs))
    for (const gap of gaps)
      assert(Array.isArray(discovery?.gaps) && discovery.gaps.some((saved: unknown) => isDeepStrictEqual(saved, gap)),
        'The saved Stage 1 discovery lacks the ' + record + ' gap ' + gap.id + '. Start a new run.');
}

function verify(inputs: StageOneInputs): void {
  assert(args.length === 0, 'verify takes no arguments.');
  const run = parse(read('run.yaml').toString()); const inventory: Inventory = json('evidence/inventory.json');
  assert(run.id === inputs.runRef && run.snapshot.id === inputs.snapshotRef && run.progress?.inventory === 'complete', 'Run identity mismatch.');
  for (const [id, record] of Object.entries<{ path: string; sha256: string }>(run.artifacts))
    assert(hash(read(record.path)) === record.sha256, 'Changed artifact: ' + id);
  verifyInventory(inventory);
  checkSavedToolGaps(inputs);
  console.log(JSON.stringify({ status: 'stage1-inputs-verified', runRef: run.id, snapshotRef: run.snapshot.id,
    registeredArtifacts: Object.keys(run.artifacts).length, files: inventory.files.length, writes: [] }, null, 2));
}

function continueRun(): void {
  assert(realpathSync(work) === work, 'Use the canonical working-folder path.');
  refuseChangedProducerCode(work, tools);
  const inputs: StageOneInputs = json('evidence/stage1-inputs.json');
  assert(inputs.tools === tools,
    'The tool checkout path changed since start. Set CHOOM_TOOLS to the checkout that started this run.');
  if (action !== 'verify') assert(!present('run.yaml'), 'Stage 1 is already published. Use verify, not a repeated stage.');
  if (action === 'capture') capture(inputs);
  else if (action === 'settings') collectSettings(inputs);
  else if (action === 'excerpt') saveExcerpt();
  else if (action === 'finish') finish(inputs);
  else if (action === 'verify') verify(inputs);
}

try {
  assert(action !== undefined && ['start', 'capture', 'settings', 'excerpt', 'finish', 'verify'].includes(action),
    'Use start, capture, settings, excerpt PATH FIRST LAST REASON, finish REVIEW_FOLDER, or verify.');
  if (action === 'start') startRun();
  else continueRun();
  if (!['finish', 'verify'].includes(action)) appendFileSync(join(work, 'evidence/commands.md'),
    '\n' + utc() + ' ' + JSON.stringify([process.execPath, self, action, ...args]) + '\n');
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
