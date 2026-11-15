import { lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve } from 'node:path';

// Stage 2 start runs this module in the tool checkout, after the driver checked
// the producer code record of the run. It checks the saved Stage 1 inputs and
// saves checkpoints of the three drafts. A registered artifact that points to a
// working draft moves to its checkpoint, with the same ID, bytes and digest.
// Saved YAML stays unchecked until read here.
interface Registered { path: string; from: string; sha256: string }
interface RegistrationChange { id: string; from: string; to: string; sha256: string }

const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE2, CHOOM_STAGE2_ID } = process.env;
if (![CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE2, CHOOM_STAGE2_ID].every(value => value?.trim()))
  throw new Error('Set all four CHOOM variables.');
const id = CHOOM_STAGE2_ID as string;
const work = realpathSync(CHOOM_WORK as string);
const attempt = realpathSync(CHOOM_STAGE2 as string);
if (!/^s2-[a-z0-9-]+$/.test(id) || attempt !== join(work, 'evidence', id) ||
    resolve(CHOOM_STAGE2 as string) !== resolve(CHOOM_WORK as string, 'evidence', id) || !lstatSync(attempt).isDirectory())
  throw new Error('Use a new s2-... ID and its matching evidence directory.');
const require = createRequire(resolve(CHOOM_TOOLS as string, 'package.json'));
const { parse, stringify } = require('yaml');
const yaml = require('yaml/package.json').version;
const knip = JSON.parse(readFileSync(resolve(CHOOM_TOOLS as string, 'node_modules/knip/package.json')).toString()).version;
if (knip !== '6.44.1') throw new Error('Expected the saved Knip 6.44.1 installation.');

const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
function readSaved(path: string): Buffer {
  if (!lstatSync(path).isFile() || realpathSync(path) !== path)
    throw new Error(`Expected a regular saved file: ${path}`);
  return readFileSync(path);
}
function readRegistered(artifactId: string, path: string, sha256: string): Buffer {
  const bytes = readSaved(path);
  if (hash(bytes) !== sha256.toLowerCase())
    throw new Error(`Missing or changed registered artifact: ${artifactId}`);
  return bytes;
}
const runPath = join(work, 'run.yaml');
const checkpoints = new Map(['baseline', 'discovery'].map(name =>
  [join(work, `${name}.yaml`), join(attempt, `${name}.before.yaml`)]));
const drafts = new Map([runPath, ...checkpoints.keys()].map(path => [path, readSaved(path)]));
const draft = (path: string): Buffer => drafts.get(path) as Buffer;
const run = parse(draft(runPath).toString());
const discovery = parse(draft(join(work, 'discovery.yaml')).toString());
const baseline = parse(draft(join(work, 'baseline.yaml')).toString());
if (run?.formatVersion !== 1 || run.status !== 'in-progress' || run.progress?.inventory !== 'complete' ||
    !run.artifacts || typeof run.artifacts !== 'object' || Array.isArray(run.artifacts) ||
    run.snapshot?.root !== 'snapshot' || discovery?.formatVersion !== 1 ||
    discovery.kind !== 'architecture-discovery' || discovery.runRef !== run.id ||
    baseline?.formatVersion !== 1 || baseline.parentId !== null || !baseline.id ||
    ['components', 'interfaces', 'resources', 'rules'].some(key =>
      !Array.isArray(baseline[key]) || baseline[key].length) ||
    ['baselineRef', 'overview', 'inspectedPaths', 'codeMappingRef', 'dependenciesRef', 'resourceAccessRef']
      .some(key => Object.hasOwn(discovery, key)))
  throw new Error('Expected completed stage 1 and an empty baseline before stage 3.');

const artifacts: Record<string, { path: string; sha256: string }> = { ...run.artifacts };
const registeredFiles = new Map<string, Registered>();
const registrationChanges: RegistrationChange[] = [];
for (const [artifactId, record] of Object.entries<{ path: unknown; sha256: unknown }>(run.artifacts)) {
  if (typeof record?.path !== 'string' || !record.path || isAbsolute(record.path) ||
      typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.sha256))
    throw new Error(`Invalid registered artifact: ${artifactId}`);
  const path = realpathSync(resolve(work, record.path));
  if (path === runPath) throw new Error(`Mutable run.yaml is registered as evidence: ${artifactId}`);
  const checkpoint = checkpoints.get(path);
  if (!path.startsWith(work + '/') || (!checkpoint && relative(work, path) !== record.path) ||
      record.path.includes('\\'))
    throw new Error(`Invalid registered path: ${artifactId}`);
  const bytes = readRegistered(artifactId, path, record.sha256);
  registeredFiles.set(artifactId, { path, from: record.path, sha256: record.sha256 });
  if (checkpoint) {
    if (!bytes.equals(draft(path))) throw new Error(`Draft changed: ${record.path}`);
    const to = relative(work, checkpoint);
    artifacts[artifactId] = { ...record, path: to } as { path: string; sha256: string };
    registrationChanges.push({ id: artifactId, from: record.path, to, sha256: record.sha256 });
  }
}

// The saved inventory helper must print the registered inventory exactly.
function checkedInventory(): Buffer {
  const inventoryFile = registeredFiles.get(run.snapshot.inventoryRef);
  if (!inventoryFile) throw new Error('Missing registered snapshot inventory.');
  const inventoryBytes = readRegistered(run.snapshot.inventoryRef, inventoryFile.path, inventoryFile.sha256);
  const inventory = JSON.parse(inventoryBytes.toString());
  if (inventory?.snapshotId !== run.snapshot.id || !Array.isArray(inventory.files))
    throw new Error('Invalid snapshot inventory.');
  const snapshot = join(work, 'snapshot');
  if (!lstatSync(snapshot).isDirectory() || realpathSync(snapshot) !== snapshot)
    throw new Error('Invalid snapshot root.');
  const inventoryHelper = join(work, 'inventory.mjs');
  if (![...registeredFiles.values()].some(file => file.path === inventoryHelper))
    throw new Error('The saved inventory helper must have a registered digest.');
  const check = spawnSync(process.execPath, [inventoryHelper], {
    env: { ...process.env, CHOOM_WORK: work }, maxBuffer: 128 * 1024 * 1024, timeout: 60000
  });
  if (check.error || check.status !== 0 || !check.stdout?.equals(inventoryBytes))
    throw new Error('Saved inventory check failed. Restore the snapshot or start a new stage-1 run.');
  return inventoryBytes;
}
checkedInventory();

const originalRun = draft(runPath);
const finalRun = registrationChanges.length ? Buffer.from(stringify({ ...run, artifacts })) : originalRun;
const nextRunPath = join(work, `.${id}-prepare-run.next.yaml`);
const handoffPath = join(attempt, 'handoff.json');
const outputs = new Map<string, Buffer>([
  [join(attempt, 'run.input.yaml'), originalRun],
  ...[...checkpoints].map(([path, checkpoint]): [string, Buffer] => [checkpoint, draft(path)]),
  [join(attempt, 'run.before.yaml'), finalRun]
]);
const handoff = JSON.stringify({
  formatVersion: 1, snapshotRef: run.snapshot.id, checkedAt: new Date().toISOString(),
  inventoryRef: run.snapshot.inventoryRef, registeredArtifacts: Object.keys(run.artifacts),
  node: process.version, yaml, knip, status: 'verified',
  registrationChanges, originalRunSha256: hash(originalRun), finalRunSha256: hash(finalRun)
}, null, 2);

function verifyInputs(): void {
  for (const [path, bytes] of drafts) {
    if (!bytes.equals(readSaved(path))) throw new Error(`Draft changed during preparation: ${path}`);
  }
  for (const [artifactId, { path, from, sha256 }] of registeredFiles) {
    if (realpathSync(resolve(work, from)) !== path)
      throw new Error(`Registered path changed during preparation: ${artifactId}`);
    readRegistered(artifactId, path, sha256);
  }
}
for (const path of [...outputs.keys(), nextRunPath, handoffPath]) {
  if (lstatSync(path, { throwIfNoEntry: false }))
    throw new Error(`Preparation output already exists: ${path}. Use a new attempt.`);
}
verifyInputs();
for (const [path, bytes] of outputs) writeFileSync(path, bytes, { flag: 'wx' });
if (registrationChanges.length) {
  writeFileSync(nextRunPath, finalRun, { flag: 'wx' });
  verifyInputs();
  renameSync(nextRunPath, runPath);
}
writeFileSync(handoffPath, handoff, { flag: 'wx' });
console.log(`Saved inputs verified and checkpoints saved. Preserved ${registrationChanges.length} draft registrations.`);
