import { readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve, relative, posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { draftUpdate } from './draft-update.ts';
import { checkQuestionsAndGaps } from './questions-and-gaps.ts';
import { evidenceBase, type EvidenceTarget, type PointerMessages, resolveEvidence, savedDocument } from './record-checks.ts';
import { SubjectChecker } from './record-subjects.ts';
import { CandidateClaims } from './stage-2-candidate-claims.ts';
import { snapshotInventory } from './snapshot-inventory.ts';
import { ToolGaps } from './tool-gaps.ts';

// The Stage 2 finish action runs this module in the tool checkout, after the
// driver checked the producer code record of the run. It checks every attempt
// file, the plan, the Knip receipts and the LLM entry analysis, registers the
// attempt files with their digests, and only then updates discovery.yaml and
// run.yaml as one update, run.yaml last. Saved JSON and YAML stay unchecked values
// until the checks below read them.
type Fields = Record<string, unknown>;
interface InventoryFile { path: string; kind: string; bytes: number; sha256: string }
interface Entry { path: string; sha256: string }
interface Finish {
  id: string; work: string; attempt: string; parse: (text: string) => unknown;
  artifacts: Record<string, Entry>; buffers: Map<string, Buffer>; documents: Map<string, unknown>;
  files: Map<string, InventoryFile>; inventory: { snapshotId: string; files: InventoryFile[] }; snapshot: string;
  savedExcerpts: Fields[]; sourceRecords: Map<string, Fields>;
}

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const object = (value: unknown): value is Fields => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const own = (value: object, key: string): boolean => Object.hasOwn(value, key);
const exact = (value: unknown, keys: string[], label: string): void => assert(object(value) && keys.every(key => own(value, key)) &&
  Object.keys(value).every(key => keys.includes(key)), `Invalid ${label} fields`);
const read = (path: string): Buffer => readFileSync(path);
const drafts = ['run', 'discovery', 'baseline'];

function safeFile(root: string, name: unknown): string {
  assert(text(name) && !posix.isAbsolute(name) && !name.includes('\\') &&
    name.split('/').every(part => part && part !== '.' && part !== '..'), `Invalid saved path: ${name}`);
  const path = resolve(root, name);
  assert(lstatSync(path).isFile() && realpathSync(path) === path, `Not a regular saved file: ${name}`);
  return path;
}

function environment() {
  const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE2, CHOOM_STAGE2_ID } = process.env;
  assert([CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE2, CHOOM_STAGE2_ID].every(text), 'Set all four CHOOM variables.');
  const id = CHOOM_STAGE2_ID as string;
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id), 'Use a simple attempt ID without path separators.');
  const work = realpathSync(CHOOM_WORK as string);
  const attempt = resolve(work, 'evidence', id);
  assert(realpathSync(CHOOM_STAGE2 as string) === attempt && resolve(CHOOM_STAGE2 as string) === resolve(CHOOM_WORK as string, 'evidence', id),
    'CHOOM_STAGE2 must be the real evidence/<attempt> directory inside CHOOM_WORK.');
  const require = createRequire(resolve(CHOOM_TOOLS as string, 'package.json'));
  const { parse, stringify } = require('yaml');
  return { id, work, attempt, parse, stringify };
}

// The three drafts as the attempt checkpointed them, and the checks that Stage 2 can still run.
function checkpointedDrafts(work: string, attempt: string, parse: (text: string) => unknown) {
  const before: Record<string, Buffer> = {};
  for (const name of drafts) {
    before[name] = read(safeFile(attempt, `${name}.before.yaml`));
    assert(before[name].equals(read(safeFile(work, `${name}.yaml`))), `${name}.yaml changed after checkpointing.`);
  }
  const value = (name: string) => parse((before[name] as Buffer).toString('utf8')) as Fields;
  const run = value('run');
  const discovery = value('discovery');
  const baseline = value('baseline');
  assert(run?.formatVersion === 1 && run.status === 'in-progress' &&
    (run.progress as Fields)?.inventory === 'complete' && object(run.artifacts) && object(run.snapshot), 'Invalid stage 1 run.');
  assert(discovery?.formatVersion === 1 && discovery.kind === 'architecture-discovery' &&
    discovery.runRef === run.id, 'Invalid discovery draft.');
  for (const key of ['baselineRef', 'overview', 'inspectedPaths', 'codeMappingRef', 'dependenciesRef', 'resourceAccessRef'])
    assert(!own(discovery, key), `This draft has advanced beyond stage 2: ${key}`);
  assert(baseline?.formatVersion === 1 && baseline.parentId === null && text(baseline.id) &&
    ['components', 'interfaces', 'resources', 'rules'].every(key => Array.isArray(baseline[key]) && !(baseline[key] as unknown[]).length),
    'The baseline must still be empty.');
  return { before, run, discovery };
}

function verifyArtifact(finish: Pick<Finish, 'work' | 'buffers'>, artifactId: string, entry: Entry): void {
  assert(object(entry) && /^[a-fA-F0-9]{64}$/.test(entry.sha256 ?? ''), `Missing digest: ${artifactId}`);
  assert(!['run.yaml', 'discovery.yaml', 'baseline.yaml'].includes(entry.path), `Mutable draft is registered as evidence: ${entry.path}`);
  const bytes = read(safeFile(finish.work, entry.path));
  assert(hash(bytes) === entry.sha256.toLowerCase(), `Artifact digest mismatch: ${artifactId}`);
  finish.buffers.set(artifactId, bytes);
}

const requiredFiles = new Map([
  ['entry-plan.json', 'entry-plan'],
  ['entry-analysis.yaml', 'entry-analysis'],
  ['knip-runs.json', 'knip-runs'],
  ['knip-profile.json', 'knip-profile'],
  ['preflight.json', 'preflight'],
  ['required-gaps.json', 'required-gaps'],
]);

// Every attempt file, by the artifact ID that it gets.
function attemptFiles(id: string, attempt: string, artifacts: Record<string, Entry>): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (dir = ''): void => {
    const names = readdirSync(join(attempt, dir), { encoding: 'buffer' }).map(bytes => {
      const name = bytes.toString('utf8');
      assert(Buffer.from(name).equals(bytes), 'Attempt filenames must use UTF-8.');
      return name;
    });
    for (const name of names.sort()) {
      const rel = dir ? `${dir}/${name}` : name;
      const path = join(attempt, rel);
      const stat = lstatSync(path);
      assert(!stat.isSymbolicLink(), `Attempt contains a symbolic link: ${rel}`);
      if (stat.isDirectory()) { visit(rel); continue; }
      const artifactId = `${id}-${requiredFiles.get(rel) ?? `file@${encodeURIComponent(rel)}`}`;
      assert(!own(artifacts, artifactId) && !found.has(artifactId), `Duplicate artifact ID: ${artifactId}`);
      found.set(artifactId, safeFile(attempt, rel));
    }
  };
  visit();
  for (const [name, suffix] of requiredFiles)
    assert(found.has(`${id}-${suffix}`), `Missing attempt file: ${name}`);
  return found;
}

function document(finish: Finish, artifactId: string) {
  assert(finish.buffers.has(artifactId), `Unknown artifact: ${artifactId}`);
  if (!finish.documents.has(artifactId)) {
    const value = (finish.buffers.get(artifactId) as Buffer).toString('utf8');
    finish.documents.set(artifactId, savedDocument((finish.artifacts[artifactId] as Entry).path, value, finish.parse));
  }
  return finish.documents.get(artifactId) as Fields;
}

const sameRange = (left: Fields, right: Fields): boolean => left.snapshotRef === right.snapshotRef && left.path === right.path &&
  left.sha256 === right.sha256 && isDeepStrictEqual(left.lines, right.lines);

function checkSource(finish: Finish, record: Fields): void {
  const file = finish.files.get(record?.path as string);
  const lines = record?.lines;
  assert(text(record?.id) && !finish.buffers.has(record.id) && record.snapshotRef === finish.inventory.snapshotId && file?.kind === 'file' &&
    file.bytes <= 2 * 1024 * 1024 && record.sha256 === file.sha256 && Array.isArray(lines) && lines.length === 2 &&
    lines.every(Number.isInteger) && lines[0] >= 1 && lines[1] >= lines[0],
    `Invalid reviewed source: ${record?.id}`);
  const bytes = read(safeFile(finish.snapshot, record.path));
  assert(hash(bytes) === record.sha256, `Changed reviewed source: ${record.path}`);
  const value = bytes.toString('utf8');
  assert(Buffer.from(value).equals(bytes), `Source is not UTF-8: ${record.path}`);
  const sourceLines = value ? value.split(/\r\n|\r|\n/) : [];
  if (/[\r\n]$/.test(value)) sourceLines.pop();
  assert(lines[1] <= sourceLines.length, `Source range exceeds saved file: ${record.id}`);
  const excerpt = finish.savedExcerpts.find(item => sameRange(item, record));
  assert(excerpt && (typeof excerpt.excerpt === 'string' || typeof excerpt.text === 'string'),
    `Source range has no saved excerpt: ${record.id}`);
  const slice = sourceLines.slice(lines[0] - 1, lines[1]);
  const expected = typeof excerpt.excerpt === 'string' ?
    slice.map((line, index) => (lines[0] + index) + ': ' + line).join('\n') : slice.join('\n');
  assert(expected === (excerpt.excerpt ?? excerpt.text), `Saved excerpt text differs from source: ${record.id}`);
  const canonical = Object.fromEntries(['id', 'snapshotRef', 'path', 'sha256', 'lines'].map(key => [key, record[key]]));
  assert(!finish.sourceRecords.has(record.id) || isDeepStrictEqual(finish.sourceRecords.get(record.id), canonical),
    `Conflicting source-record ID: ${record.id}`);
  finish.sourceRecords.set(record.id, canonical);
}

const excerptPath = (path: string): boolean => /\/(?:source-excerpts\.json|excerpt-[0-9]+\.json)$/.test(path);

// Stage 1 permits references to source records inside its saved review.
function indexSources(finish: Finish): void {
  for (const artifactId of finish.buffers.keys()) {
    if (!excerptPath((finish.artifacts[artifactId] as Entry).path)) continue;
    const value = document(finish, artifactId);
    finish.savedExcerpts.push(...(Array.isArray(value?.excerpts) ? value.excerpts : [value]));
  }
  for (const artifactId of finish.buffers.keys()) {
    if (!/\.(?:json|ya?ml)$/.test((finish.artifacts[artifactId] as Entry).path)) continue;
    let value;
    try { value = document(finish, artifactId); } catch { continue; }
    if (Array.isArray(value?.reviewedFiles)) value.reviewedFiles.forEach((record: Fields) => checkSource(finish, record));
    if (excerptPath((finish.artifacts[artifactId] as Entry).path))
      (Array.isArray(value?.excerpts) ? value.excerpts : [value]).forEach((record: Fields) => checkSource(finish, record));
  }
}

// The words of the Stage 2 finish messages for a JSON Pointer that it refuses.
const pointerMessages: PointerMessages = { invalid: 'Invalid JSON Pointer: ', escape: 'Invalid JSON Pointer escape: ',
  index: 'Invalid array JSON Pointer: ', unresolved: 'Unresolved JSON Pointer: ' };

function reference(finish: Finish, ref: unknown): void {
  assert(text(ref), 'Empty evidence reference.');
  const base = evidenceBase(ref);
  const target: EvidenceTarget | undefined = finish.buffers.has(base)
    ? { path: (finish.artifacts[base] as Entry).path, document: () => document(finish, base) }
    : finish.sourceRecords.has(base) ? { record: finish.sourceRecords.get(base) } : undefined;
  assert(target, `Unknown evidence reference: ${ref}`);
  resolveEvidence(ref, target, pointerMessages);
}

function evidence(finish: Finish, record: Fields): void {
  assert(strings(record.evidenceRefs) && record.evidenceRefs.length, `Missing evidence: ${record.id ?? record.selector}`);
  record.evidenceRefs.forEach(ref => reference(finish, ref));
}

function issues(finish: Finish, value: Fields, label: string): void {
  const ids = new Set();
  for (const key of ['questions', 'gaps']) {
    assert(Array.isArray(value[key]), `Missing ${label}.${key}`);
    for (const item of value[key] as unknown[]) {
      assert(object(item) && text(item.id) && !ids.has(item.id) && !finish.sourceRecords.has(item.id) && strings(item.subjectRefs) && item.subjectRefs.length &&
        text(key === 'questions' ? item.text : item.reason) && (key !== 'gaps' || text(item.kind)),
        `Invalid or duplicate ${label}.${key} record`);
      ids.add(item.id);
      evidence(finish, item);
    }
  }
}

function preserve(id: string, earlier: Fields, later: Fields): void {
  for (const key of ['questions', 'gaps']) {
    const prior = new Map((earlier[key] as Fields[]).map(item => [item.id, item]));
    const next = new Map((later[key] as Fields[]).map(item => [item.id, item]));
    for (const [itemId, item] of prior)
      assert(isDeepStrictEqual(next.get(itemId), item), `Removed or changed prior record: ${itemId}`);
    for (const item of later[key] as Fields[])
      assert(prior.has(item.id) || (item.id as string).startsWith(id), `New record needs this attempt's ID: ${item.id}`);
  }
}

function candidates(finish: Finish, value: unknown, claims?: CandidateClaims, requireClaims = false): void {
  assert(Array.isArray(value), 'Missing candidates.');
  const ids = new Set();
  for (const candidate of value) {
    exact(candidate, ['id', 'expression', 'path', 'workspace', 'roles', 'origin', 'evidenceRefs',
      ...(claims && candidate && Object.hasOwn(candidate, 'knipClaims') ? ['knipClaims'] : [])], 'candidate');
    assert(text(candidate.id) && candidate.id.startsWith(finish.id) && !ids.has(candidate.id) && !finish.sourceRecords.has(candidate.id) && text(candidate.expression) &&
      (candidate.path === null || (text(candidate.path) && finish.files.has(candidate.path))) && text(candidate.workspace) &&
      strings(candidate.roles) && candidate.roles.length &&
      ['package-field', 'script', 'convention', 'source', 'inference', 'unknown'].includes(candidate.origin),
      `Invalid or duplicate candidate: ${candidate.id}`);
    ids.add(candidate.id);
    evidence(finish, candidate);
    claims?.validate(candidate, requireClaims);
  }
}

function checkPlan(finish: Finish, discovery: Fields): Fields {
  const core = (name: string): string => `${finish.id}-${name}`;
  const plan = document(finish, core('entry-plan'));
  exact(plan, ['formatVersion', 'snapshotRef', 'runProduction', 'productionReason', 'candidates', 'workspaces', 'questions', 'gaps'], 'plan');
  assert(plan.formatVersion === 1 && plan.snapshotRef === finish.inventory.snapshotId && typeof plan.runProduction === 'boolean' &&
    text(plan.productionReason) && Array.isArray(plan.workspaces), 'Invalid entry plan.');
  const workspaceDirs = new Set();
  for (const workspace of plan.workspaces as Fields[]) {
    exact(workspace, ['dir', 'entry', 'project'], 'workspace');
    assert(text(workspace.dir) && !workspaceDirs.has(workspace.dir) && strings(workspace.entry) && strings(workspace.project), 'Invalid workspace.');
    workspaceDirs.add(workspace.dir);
  }
  assert(workspaceDirs.has('.'), 'The entry plan must include the root workspace.');
  candidates(finish, plan.candidates);
  issues(finish, discovery, 'prior discovery'); issues(finish, plan, 'plan'); preserve(finish.id, discovery, plan);
  return plan;
}

// The preflight and the Knip receipts must name the inputs that this attempt saved.
function checkReceipts(finish: Finish, run: Fields): void {
  const core = (name: string): string => `${finish.id}-${name}`;
  const snapshot = run.snapshot as { inventoryRef: string };
  const preflight = document(finish, core('preflight'));
  assert(preflight?.formatVersion === 1 && preflight.snapshotRef === finish.inventory.snapshotId && preflight.knipVersion === '6.44.1' &&
    ['eligible', 'unsupported'].includes(preflight.status as string) && Array.isArray(preflight.reasons) && Array.isArray(preflight.limits),
    'Invalid preflight receipt.');
  reference(finish, core('knip-profile'));
  const buffer = (artifactId: string): Buffer => finish.buffers.get(artifactId) as Buffer;
  const inputDigests = {
    planSha256: hash(buffer(core('entry-plan'))),
    profileSha256: hash(buffer(core('knip-profile'))),
    preflightSha256: hash(buffer(core('preflight'))),
    inventorySha256: hash(buffer(snapshot.inventoryRef))
  };
  const inventory = preflight.inventory as Fields | undefined;
  assert(preflight.planSha256 === inputDigests.planSha256 && preflight.profileSha256 === inputDigests.profileSha256 &&
    inventory?.ref === snapshot.inventoryRef &&
    inventory.path === ((run.artifacts as Record<string, Entry>)[snapshot.inventoryRef] as Entry).path &&
    inventory.sha256 === inputDigests.inventorySha256, 'Preflight inputs changed. Use a new attempt.');
  const receipts = document(finish, core('knip-runs'));
  assert(receipts?.formatVersion === 1 && receipts.snapshotRef === finish.inventory.snapshotId &&
    receipts.profileRef === core('knip-profile') && receipts.preflightRef === core('preflight') &&
    object(receipts.limits) && Array.isArray(receipts.runs) && receipts.runs.length === 2,
    'Invalid Knip receipts.');
  assert(isDeepStrictEqual(receipts.inputDigests, inputDigests), 'Recorded Knip inputs changed. Use a new attempt.');
  reference(finish, receipts.profileRef); reference(finish, receipts.preflightRef);
  for (const mode of ['normal', 'production']) {
    const matches = (receipts.runs as Fields[]).filter(item => item?.mode === mode);
    assert(matches.length === 1 && ['completed', 'failed', 'skipped'].includes(matches[0]?.status as string), `Invalid ${mode} receipt.`);
  }
  checkKnipOutputs(finish, receipts);
}

// Each command of the Knip receipts names its saved stdout and stderr files with their
// SHA-256: the Docker context and image checks, the input check, each run and its cleanup.
// A skipped run and a cleanup that Docker did by itself saved no output.
function checkKnipOutputs(finish: Finish, receipts: Fields): void {
  const runs = receipts.runs as Fields[];
  const commands = [(receipts.dockerEndpoint as Fields | undefined)?.check, receipts.imageCheck,
    (receipts.inputView as Fields | undefined)?.verification, ...runs, ...runs.map(run => run.cleanup)];
  const saved = (item: unknown): item is Fields => object(item) && (typeof item.stdout === 'string' || typeof item.stderr === 'string');
  for (const command of commands.filter(saved)) {
    for (const [name, digest] of [[command.stdout, command.stdoutSha256], [command.stderr, command.stderrSha256]]) {
      const bytes = finish.buffers.get(`${finish.id}-file@${encodeURIComponent(String(name))}`);
      assert(text(name) && bytes !== undefined && hash(bytes) === digest, `Recorded Knip output changed: ${String(name)}. Use a new attempt.`);
    }
  }
}

function checkAnalysis(finish: Finish, plan: Fields, requireClaims: boolean): Fields {
  const core = (name: string): string => `${finish.id}-${name}`;
  const analysis = document(finish, core('entry-analysis'));
  exact(analysis, ['formatVersion', 'kind', 'snapshotRef', 'planRef', 'knipRunsRef', 'candidates', 'reviewedFiles', 'questions', 'gaps', 'reachability', 'llmReview'], 'entry analysis');
  const reachability = analysis.reachability as Fields | undefined;
  assert(analysis.formatVersion === 1 && analysis.kind === 'entry-analysis' && analysis.snapshotRef === finish.inventory.snapshotId &&
    analysis.planRef === core('entry-plan') && analysis.knipRunsRef === core('knip-runs') && analysis.llmReview === 'recorded' &&
    reachability?.status === 'not-assessed' && text(reachability.reason) && Array.isArray(analysis.reviewedFiles),
    'Invalid entry analysis identity or state.');
  const runs = document(finish, core('knip-runs')).runs as Fields[];
  const claims = new CandidateClaims(core('knip-runs'), runs, name => {
    const bytes = finish.buffers.get(finish.id + '-file@' + encodeURIComponent(name));
    assert(bytes, 'Missing selected Knip report: ' + name);
    return JSON.parse(bytes.toString('utf8'));
  });
  candidates(finish, analysis.candidates, claims, requireClaims);
  for (const source of analysis.reviewedFiles as Fields[]) {
    assert(finish.savedExcerpts.some(excerpt => excerpt.id === source.id && sameRange(excerpt, source)),
      `Copy the exact saved excerpt source ID and range: ${source.id}`);
    checkSource(finish, source);
  }
  issues(finish, analysis, 'analysis'); preserve(finish.id, plan, analysis);
  checkQuestionsAndGaps({ questions: analysis.questions, gaps: analysis.gaps });
  const identifiers = new Set(Object.keys(finish.artifacts));
  const records = (key: string): Fields[] => analysis[key] as Fields[];
  for (const item of [...records('candidates'), ...records('reviewedFiles'), ...records('questions'), ...records('gaps')]) {
    assert(!identifiers.has(item.id as string), `Colliding final-analysis ID: ${item.id}`);
    identifiers.add(item.id as string);
  }
  return analysis;
}

// The gaps that the Knip outcomes require (DB5): run saved them in required-gaps.json.
// They must be the gaps that ToolGaps gives from the saved preflight and Knip receipts,
// and the analysis must copy each one exactly. No other question or gap can have an
// ID that starts with <attempt>-knip-gap-.
function checkRequiredGaps(finish: Finish, analysis: Fields): void {
  const core = (name: string): string => `${finish.id}-${name}`;
  const knipGaps = new ToolGaps(`${finish.id}-`);
  const required = knipGaps.fromKnipRuns(document(finish, core('knip-runs')), core('knip-runs'), document(finish, core('preflight')));
  assert(isDeepStrictEqual(document(finish, core('required-gaps')), { formatVersion: 1, gaps: required }),
    `The required gaps in ${core('required-gaps')} differ from the gaps that the Knip receipts and the preflight give. Use a new attempt.`);
  knipGaps.checkCopied(ToolGaps.knip, required, { questions: analysis.questions as unknown[], gaps: analysis.gaps as unknown[] },
    core('required-gaps'));
}

// The inventory of the saved snapshot, made with the checkout code, must still be
// the registered inventory. The saved inventory.mjs stays a registered record;
// finish does not run it.
function checkInventory(finish: Finish, run: Fields): void {
  const snapshot = run.snapshot as { id: string; inventoryRef: string };
  assert(Object.values(run.artifacts as Record<string, Entry>).some(entry => entry.path === 'inventory.mjs'),
    'The saved inventory helper must have a registered digest.');
  const failure = 'Snapshot inventory changed. Start a new snapshot.';
  let current: Buffer;
  try {
    current = snapshotInventory(finish.work, snapshot.id);
  } catch (error) {
    throw new Error(failure + ' ' + (error as Error).message, { cause: error });
  }
  assert(current.equals(finish.buffers.get(snapshot.inventoryRef) as Buffer), failure);
}

function finishAttempt(): void {
  const { id, work, attempt, parse, stringify } = environment();
  const { before, run, discovery } = checkpointedDrafts(work, attempt, parse);
  const artifacts: Record<string, Entry> = { ...(run.artifacts as Record<string, Entry>) };
  const buffers = new Map<string, Buffer>();
  for (const [artifactId, entry] of Object.entries(artifacts)) verifyArtifact({ work, buffers }, artifactId, entry);
  for (const [artifactId, path] of attemptFiles(id, attempt, artifacts)) {
    const bytes = read(path);
    artifacts[artifactId] = { path: relative(work, path), sha256: hash(bytes) };
    buffers.set(artifactId, bytes);
  }
  const snapshotRecord = run.snapshot as { id: string; root: string; inventoryRef: string };
  const finish: Finish = { id, work, attempt, parse, artifacts, buffers, documents: new Map(), files: new Map(),
    inventory: { snapshotId: '', files: [] }, snapshot: '', savedExcerpts: [], sourceRecords: new Map() };
  const inventory = document(finish, snapshotRecord.inventoryRef);
  assert(inventory?.snapshotId === snapshotRecord.id && Array.isArray(inventory.files), 'Inventory snapshot mismatch.');
  finish.inventory = inventory as unknown as Finish['inventory'];
  finish.files = new Map(finish.inventory.files.map(file => [file.path, file]));
  assert(finish.files.size === finish.inventory.files.length, 'Duplicate inventory paths.');
  finish.snapshot = resolve(work, snapshotRecord.root);
  assert(finish.snapshot === join(work, 'snapshot') && realpathSync(finish.snapshot) === finish.snapshot, 'Invalid snapshot root.');
  indexSources(finish);
  const plan = checkPlan(finish, discovery);
  checkReceipts(finish, run);
  const analysis = checkAnalysis(finish, plan, typeof run.projectKey === 'string');
  checkRequiredGaps(finish, analysis);
  // Each subject of a record that finish adds names a snapshot file or folder, the snapshot ID, a question or gap, or
  // a candidate of the analysis. Later stages do not accept a candidate of the plan.
  SubjectChecker.forEntryRecord(finish.files.keys(), finish.inventory.snapshotId, analysis).checkAdded(discovery);
  checkInventory(finish, run);
  for (const name of drafts)
    assert((before[name] as Buffer).equals(read(safeFile(work, `${name}.yaml`))), `${name}.yaml changed during finalization.`);
  for (const [artifactId, entry] of Object.entries(artifacts)) verifyArtifact(finish, artifactId, entry);
  publish(finish, { before, run, discovery, analysis, stringify });
}

// Replaces discovery.yaml and then run.yaml, the publication marker, as one update.
// When a step fails before run.yaml is replaced, the update gives discovery.yaml its
// bytes from before and removes its temporary files.
function publish({ id, work, artifacts }: Finish, { before, run, discovery, analysis, stringify }:
  { before: Record<string, Buffer>; run: Fields; discovery: Fields; analysis: Fields; stringify: (value: unknown) => string }): void {
  const core = (name: string): string => `${id}-${name}`;
  const nextDiscovery = { ...discovery, entryAnalysisRef: core('entry-analysis'), questions: analysis.questions, gaps: analysis.gaps };
  const nextRun = { ...run, artifacts, progress: { ...(run.progress as Fields), entryAnalysis: 'complete', inspectionPriorities: 'pending' },
    coverage: { ...(run.coverage as Fields),
      inspected: `LLM source inspections are listed in the saved reviews and entry analyses. This attempt uses ${core('entry-analysis')}#/reviewedFiles. Tool query scopes and limits are in ${core('knip-runs')}; tool reads do not establish LLM inspection.`
    }
  };
  const update = draftUpdate({ work, prefix: `.${id}-publication-`, read: name => read(safeFile(work, name)),
    before: new Map(drafts.map(name => [`${name}.yaml`, before[name] as Buffer])),
    advice: 'Keep this attempt unchanged; use a new attempt ID after you resolve the cause.' });
  try {
    update.stage('discovery.yaml', Buffer.from(stringify(nextDiscovery)));
    update.stage('run.yaml', Buffer.from(stringify(nextRun)));
    update.place();
  } catch (error) {
    throw update.rollBack(error as Error);
  }
  console.log('Stage 2 drafts updated. Structure and evidence checks passed; semantic quality was not verified.');
  console.log('Keep every attempt file unchanged.');
}

try {
  finishAttempt();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
