import { createHash } from 'node:crypto';
import {
  type Stats, closeSync, constants, copyFileSync, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, realpathSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Recovery helper for a damaged earlier capture. It copies the retained files of
// an earlier run into a new run and collects their settings. Saved JSON and YAML
// stay unchecked values until the checks below read them.
interface InventoryRecord { path: string; kind: string; bytes: number; sha256: string }
interface Difference { index: number; path: string; status: string; actualBytes?: number; reason?: string }
interface RecoveryInputs { previous: string; tools: string; work: string; runId: string; snapshotId: string }
interface Retained { snapshot: string; retained: InventoryRecord[]; omitted: number[]; differences: Difference[] }
interface ParentRun {
  parent: { formatVersion: unknown; mode: unknown; id: string; snapshot: { root: unknown; id: string; inventoryRef: string;
    exclusions: unknown; sourcePath?: string; capturedAt?: string; captureLimit?: string };
    artifacts: Record<string, { path: string; sha256: string }> };
  runBytes: Buffer; artifacts: Map<string, Buffer>; verify: () => void;
}
interface RecoveryReport {
  status: string; command: unknown; startedAt: string; finishedAt?: string; reason?: string; capturedAt?: string;
  settings?: unknown; inventorySha256?: string; settingsSha256?: string;
  retained: { files: number; bytes: number; preflightContentDigestsVerified: number; copiedContentDigestsVerified: number };
  [key: string]: unknown;
}
interface Recovery {
  inputs: RecoveryInputs; parent: ParentRun; files: Retained; inventoryBytes: Buffer; exclusions: Buffer;
  cookbook: Buffer; settings: string; helperBytes: Buffer; versions: unknown; command: unknown; startedAt: string;
  report: RecoveryReport;
}

const prefixes = ['src-tauri/target/', 'dist/', 'reports/', 'test-results/'];
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const utc = (): string => new Date().toISOString();
const safe = (name: unknown): name is string => typeof name === 'string' && name.length > 0 && !isAbsolute(name) &&
  !/[\\\u0000-\u001f\u007f]/.test(name) && name.split('/').every(part => part && part !== '.' && part !== '..');
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const present = (path: string): boolean => Boolean(lstatSync(path, { throwIfNoEntry: false }));
const canonicalDirectory = (path: string | undefined): string => {
  assert(isAbsolute(path ?? '') && lstatSync(path ?? '').isDirectory() && realpathSync(path ?? '') === path,
    'Expected a canonical directory: ' + path);
  return path;
};
function read(path: string): Buffer {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + path);
  return readFileSync(path);
}
function fileDigest(path: string, expected: InventoryRecord): Stats {
  assert(realpathSync(dirname(path)) === dirname(path), 'Snapshot parent is not canonical: ' + path);
  const listed = lstatSync(path);
  assert(listed.isFile() && realpathSync(path) === path && listed.size === expected.bytes,
    'Retained snapshot file has the wrong type, path, or byte count: ' + expected.path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    assert(before.isFile() && before.dev === listed.dev && before.ino === listed.ino,
      'Retained snapshot file changed before reading: ' + expected.path);
    const checksum = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes = 0;
    for (let length; (length = readSync(fd, buffer, 0, buffer.length, null)) > 0;) {
      checksum.update(buffer.subarray(0, length)); bytes += length;
    }
    const after = fstatSync(fd); const current = lstatSync(path);
    assert(after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs &&
      current.dev === before.dev && current.ino === before.ino && realpathSync(path) === path &&
      bytes === expected.bytes && checksum.digest('hex') === expected.sha256,
    'Retained snapshot content differs from the saved inventory: ' + expected.path);
    return after;
  } finally { closeSync(fd); }
}
function omittedMetadata(root: string, file: InventoryRecord, index: number): Difference | null {
  const path = join(root, file.path);
  try {
    if (realpathSync(dirname(path)) !== dirname(path)) return { index, path: file.path, status: 'noncanonical-parent' };
    const info = lstatSync(path);
    if (!info.isFile()) return { index, path: file.path, status: 'different-type' };
    if (realpathSync(path) !== path) return { index, path: file.path, status: 'noncanonical-path' };
    if (info.size !== file.bytes) return { index, path: file.path, status: 'different-size', actualBytes: info.size };
    return null;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException;
    return { index, path: file.path, status: failure.code === 'ENOENT' ? 'missing' : 'unavailable',
      reason: failure.code ?? failure.message };
  }
}
function inventoryHelper(snapshotId: string): string {
  return `import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root = join(process.env.CHOOM_WORK, 'snapshot');
const files = [];
function visit(relative = '') {
  for (const name of readdirSync(join(root, relative)).sort()) {
    const path = relative ? relative + '/' + name : name;
    const absolute = join(root, path);
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) { if (!name.startsWith('.')) visit(path); }
    else if (stat.isFile()) {
      const contents = readFileSync(absolute);
      files.push({ path, kind: 'file', bytes: contents.length,
        sha256: createHash('sha256').update(contents).digest('hex') });
    } else throw new Error('Unsupported snapshot item: ' + path);
  }
}
visit();
console.log(JSON.stringify({ formatVersion: 1, snapshotId: ${JSON.stringify(snapshotId)}, files }, null, 2));
`;
}

// The failure record needs the evidence folder and the report that a capture started.
let evidence = null as string | null; let report = null as RecoveryReport | null; let resultWritten = false;

function recoveryInputs(): RecoveryInputs {
  assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--check'),
    'Use no argument to capture, or --check for read-only verification.');
  const { CHOOM_PREVIOUS_WORK, CHOOM_WORK, CHOOM_TOOLS, CHOOM_RUN_ID, CHOOM_SNAPSHOT_ID } = process.env;
  const previous = canonicalDirectory(CHOOM_PREVIOUS_WORK);
  const tools = canonicalDirectory(CHOOM_TOOLS);
  assert(isAbsolute(CHOOM_WORK ?? '') && resolve(CHOOM_WORK ?? '') === CHOOM_WORK && !present(CHOOM_WORK),
    'CHOOM_WORK must be a new canonical absolute path.');
  canonicalDirectory(dirname(CHOOM_WORK));
  const work = CHOOM_WORK;
  const roots = [previous, work, tools];
  assert(roots.every((root, index) => roots.every((other, otherIndex) => index === otherIndex ||
    (root !== other && !root.startsWith(other + '/') && !other.startsWith(root + '/')))),
  'Keep the old run, new run, and trusted tools in separate, nonoverlapping directories.');
  assert(/^run-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(CHOOM_RUN_ID ?? '') &&
    /^snapshot-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(CHOOM_SNAPSHOT_ID ?? ''), 'Set new run and snapshot IDs.');
  return { previous, tools, work, runId: CHOOM_RUN_ID ?? '', snapshotId: CHOOM_SNAPSHOT_ID ?? '' };
}

function trustedRequire(tools: string): NodeJS.Require {
  const require = createRequire(join(tools, 'package.json'));
  for (const name of ['yaml', 'yaml/package.json', 'ts-morph', 'ts-morph/package.json']) {
    const modulePath = require.resolve(name);
    assert(modulePath.startsWith(join(tools, 'node_modules', name.split('/')[0] ?? '') + '/') &&
      realpathSync(modulePath) === modulePath, 'Use packages from the trusted tool checkout: ' + name);
  }
  return require;
}

function parentRun({ previous, runId, snapshotId }: RecoveryInputs, parse: (text: string) => ParentRun['parent']): ParentRun {
  const runBytes = read(join(previous, 'run.yaml'));
  const parent = parse(runBytes.toString());
  assert(parent?.formatVersion === 1 && parent.mode === 'A' && parent.snapshot?.root === 'snapshot' &&
    typeof parent.artifacts === 'object' && parent.artifacts !== null && !Array.isArray(parent.artifacts),
  'Expected a recorded Mode A snapshot.');
  assert(parent.id !== runId && parent.snapshot.id !== snapshotId, 'Use new run and snapshot identities.');
  const artifacts = new Map<string, Buffer>();
  function verify(): void {
    assert(read(join(previous, 'run.yaml')).equals(runBytes), 'The previous run manifest changed.');
    for (const [id, record] of Object.entries(parent.artifacts)) {
      assert(safe(record?.path) && digest(record.sha256) &&
        !['run.yaml', 'discovery.yaml', 'baseline.yaml'].includes(record.path), 'Invalid parent artifact: ' + id);
      const bytes = read(join(previous, record.path));
      assert(hash(bytes) === record.sha256, 'Previous registered evidence changed: ' + id);
      artifacts.set(id, bytes);
    }
  }
  verify();
  return { parent, runBytes, artifacts, verify };
}

function retainedFiles(previous: string, inventory: { files: InventoryRecord[] }): Retained {
  const snapshot = canonicalDirectory(join(previous, 'snapshot'));
  const names = new Set(); const retained: InventoryRecord[] = []; const omitted: number[] = []; const differences: Difference[] = [];
  for (const [index, file] of inventory.files.entries()) {
    assert(safe(file?.path) && !names.has(file.path) && file.kind === 'file' &&
      Number.isSafeInteger(file.bytes) && file.bytes >= 0 && digest(file.sha256) &&
      file.path.split('/').slice(0, -1).every(part => !part.startsWith('.')),
    'Expected unique regular-file inventory records outside hidden directories.');
    names.add(file.path);
    if (prefixes.some(prefix => file.path.startsWith(prefix))) {
      omitted.push(index);
      const difference = omittedMetadata(snapshot, file, index);
      if (difference) differences.push(difference);
    } else retained.push({ path: file.path, kind: 'file', bytes: file.bytes, sha256: file.sha256 });
  }
  assert(retained.length > 0, 'The recovery scope contains no files.');
  return { snapshot, retained, omitted, differences };
}

function settingsCollector(tools: string): { cookbook: Buffer; settings: string } {
  const cookbook = read(join(tools, 'docs/design/app-a/step-1-cookbook.md'));
  const settingsMatches = [...cookbook.toString().matchAll(/^cat > "\$CHOOM_WORK\/settings\.mjs" <<'JS'\n([\s\S]*?)^JS\n/gm)];
  assert(settingsMatches.length === 1, 'Expected one settings helper in the trusted Stage 1 cookbook.');
  return { cookbook, settings: settingsMatches[0]?.[1] ?? '' };
}

function recoveryReport(recovery: Omit<Recovery, 'report'>, inventory: { files: InventoryRecord[] }): RecoveryReport {
  const { inputs, parent: { parent, runBytes, artifacts }, files: { snapshot, retained, omitted, differences } } = recovery;
  const inventoryRef = parent.snapshot.inventoryRef;
  return { formatVersion: 1, kind: 'recovery-capture', runRef: inputs.runId, snapshotRef: inputs.snapshotId,
    status: 'started', stage1Review: 'pending', startedAt: recovery.startedAt, command: recovery.command,
    helperSha256: hash(recovery.helperBytes), toolVersions: recovery.versions, sourcePath: snapshot, work: inputs.work,
    parent: { runRef: parent.id, snapshotRef: parent.snapshot.id, work: inputs.previous, runSha256: hash(runBytes),
      inventoryRef, inventoryPath: parent.artifacts[inventoryRef]?.path, inventorySha256: hash(recovery.inventoryBytes),
      registeredArtifactsVerified: artifacts.size, sourcePath: parent.snapshot.sourcePath ?? null,
      capturedAt: parent.snapshot.capturedAt ?? null, captureLimit: parent.snapshot.captureLimit ?? null },
    captureMethod: 'Independent copies of retained saved files, verified against the previous inventory before and after copying.',
    captureLimit: 'A selected projection of surviving saved inputs. It inherits the original capture limit; atomic capture is not proven.',
    rootExclusions: prefixes,
    retained: { files: retained.length, bytes: retained.reduce((sum, file) => sum + file.bytes, 0),
      preflightContentDigestsVerified: retained.length, copiedContentDigestsVerified: 0 },
    omitted: { files: omitted.length, parentInventoryIndexes: omitted,
      bytes: omitted.reduce((sum, index) => sum + (inventory.files[index]?.bytes ?? 0), 0),
      metadata: { checkedAt: utc(), matches: omitted.length - differences.length, differences,
        method: 'Path, type, and byte count only. Omitted file contents were not read or verified.' } },
    limits: ['The old run and its inventory remain unchanged. This is a new snapshot with a different capture scope.',
      'Generated source and contracts outside the four excluded root folders remain included.',
      'Omitted and unavailable input is not classified as unused.',
      'Previous Knip and LLM reports remain historical evidence, not results for the new snapshot.',
      'No live repository input, target code, executable target configuration, build, test, or package installation is used.'] };
}

function prepareRecovery(): Recovery {
  const inputs = recoveryInputs();
  const self = fileURLToPath(import.meta.url);
  assert(self === join(inputs.tools, 'packages/producer/src/recover-capture.ts'), 'Run the trusted recovery helper.');
  const helperBytes = read(self);
  const require = trustedRequire(inputs.tools);
  const yamlPath = require.resolve('yaml');
  const { parse } = require(yamlPath);
  const parent = parentRun(inputs, parse);
  const inventoryRef = parent.parent.snapshot.inventoryRef;
  assert(parent.artifacts.has(inventoryRef), 'Missing registered parent inventory.');
  const inventoryBytes = parent.artifacts.get(inventoryRef) as Buffer;
  const inventory = JSON.parse(inventoryBytes.toString());
  assert(inventory.formatVersion === 1 && inventory.snapshotId === parent.parent.snapshot.id && Array.isArray(inventory.files),
    'Parent inventory has the wrong snapshot identity.');
  const files = retainedFiles(inputs.previous, inventory);
  const exclusionPath = parent.parent.snapshot.exclusions;
  assert(safe(exclusionPath), 'Invalid parent exclusions path.');
  const exclusionArtifact = Object.entries(parent.parent.artifacts).find(([, record]) => record.path === exclusionPath);
  assert(exclusionArtifact, 'The previous exclusions must be registered.');
  const exclusions = parent.artifacts.get(exclusionArtifact[0]) as Buffer;
  const { cookbook, settings } = settingsCollector(inputs.tools);
  const versions = { node: process.version, tsMorph: require('ts-morph/package.json').version,
    typescript: require('ts-morph').ts.version, yaml: require('yaml/package.json').version };
  const startedAt = utc();
  for (const file of files.retained) fileDigest(join(files.snapshot, file.path), file);
  parent.verify();
  const command = { args: process.argv, cwd: process.cwd(), environment: {
    CHOOM_PREVIOUS_WORK: inputs.previous, CHOOM_WORK: inputs.work, CHOOM_TOOLS: inputs.tools,
    CHOOM_RUN_ID: inputs.runId, CHOOM_SNAPSHOT_ID: inputs.snapshotId,
  } };
  const recovery = { inputs, parent, files, inventoryBytes, exclusions, cookbook, settings, helperBytes, versions, command, startedAt };
  report = recoveryReport(recovery, inventory);
  return { ...recovery, report };
}

function copyRetained({ inputs: { work }, files: { snapshot, retained }, report }: Recovery): void {
  for (const file of retained) {
    const source = join(snapshot, file.path); const destination = join(work, 'snapshot', file.path);
    fileDigest(source, file);
    mkdirSync(dirname(destination), { recursive: true });
    canonicalDirectory(dirname(destination));
    copyFileSync(source, destination, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
    const copied = fileDigest(destination, file); const original = fileDigest(source, file);
    assert(copied.nlink === 1 && !(copied.dev === original.dev && copied.ino === original.ino),
      'The recovered file must be an independent copy: ' + file.path);
    report.retained.copiedContentDigestsVerified++;
  }
  retained.sort((a, b) => {
    const left = a.path.split('/'); const right = b.path.split('/');
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      if (left[index] !== right[index]) return (left[index] ?? '') < (right[index] ?? '') ? -1 : 1;
    }
    return left.length - right.length;
  });
}

function scopeNotes({ inputs, parent: { parent } }: Recovery): string {
  return '# Recovery capture scope\n\n' +
    `This new run (${inputs.runId}, ${inputs.snapshotId}) retains verified files from ${parent.id}, ${parent.snapshot.id}.\n` +
    'It does not recapture the live checkout. Every retained file matches its parent inventory digest.\n\n' +
    'The four excluded root folders are src-tauri/target/, dist/, reports/, and test-results/.\n' +
    'This omits captured build and run outputs. Generated source, contracts, and configuration outside those folders remain included.\n' +
    'Omission or unavailability does not establish unused code. The original exclusions still apply.\n' +
    'A declared dist packaging input is now outside capture scope; its contents and origin remain unavailable.\n\n' +
    `Original capture limit: ${parent.snapshot.captureLimit ?? 'No capture limit was recorded.'}\n` +
    'The new projection does not improve that original capture guarantee or prove an atomic source capture.\n\n' +
    'capture-recovery.json records the exact parent inventory, omitted records, and observed availability differences.\n' +
    'Previous Knip and LLM records remain historical evidence. They are not relabeled as results for this snapshot.\n' +
    'Stage 1 LLM review and the new working drafts are pending.\n';
}

function collectSettings(recovery: Recovery, save: (name: string, bytes: string | Buffer) => void): { stdout: Buffer; command: unknown } {
  const { inputs: { work, tools, snapshotId }, report } = recovery;
  save('settings.mjs', recovery.settings);
  const env: NodeJS.ProcessEnv = { ...process.env, CHOOM_WORK: work, CHOOM_TOOLS: tools };
  for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'BASH_ENV', 'ENV']) delete env[name];
  const settingsCommand = { args: [process.execPath, join(work, 'settings.mjs')], cwd: work,
    environment: { CHOOM_WORK: work, CHOOM_TOOLS: tools }, startedAt: utc(),
    timeoutMs: 60000, maxOutputBytes: 64 * 1024 * 1024 };
  const settings = spawnSync(process.execPath, [join(work, 'settings.mjs')], { env, cwd: work,
    timeout: settingsCommand.timeoutMs, maxBuffer: settingsCommand.maxOutputBytes });
  save('evidence/settings.stdout.txt', settings.stdout ?? Buffer.alloc(0));
  save('evidence/settings.stderr.txt', settings.stderr ?? Buffer.alloc(0));
  const failure = settings.error as NodeJS.ErrnoException | undefined;
  Object.assign(settingsCommand, { finishedAt: utc(), exitCode: settings.status, signal: settings.signal,
    error: failure ? { code: failure.code ?? null, message: failure.message } : null });
  save('evidence/settings-command.json', JSON.stringify(settingsCommand, null, 2) + '\n');
  report.settings = settingsCommand;
  assert(!settings.error && settings.status === 0 && !settings.signal, 'Settings collection failed; preserve this new folder and its logs.');
  const parsedSettings = JSON.parse(settings.stdout.toString());
  assert(parsedSettings.formatVersion === 1 && parsedSettings.snapshotId === snapshotId &&
    Array.isArray(parsedSettings.packages) && Array.isArray(parsedSettings.configs), 'Invalid settings output.');
  save('evidence/settings.json', settings.stdout);
  return { stdout: settings.stdout, command: settingsCommand };
}

function capture(recovery: Recovery): void {
  const { inputs: { work, snapshotId }, parent, files: { retained }, report } = recovery;
  mkdirSync(work); mkdirSync(join(work, 'snapshot')); mkdirSync(join(work, 'evidence'));
  evidence = join(work, 'evidence');
  const save = (name: string, bytes: string | Buffer): void => writeFileSync(join(work, name), bytes, { flag: 'wx' });
  const saveJson = (name: string, value: unknown): void => save(name, JSON.stringify(value, null, 2) + '\n');
  saveJson('evidence/capture-recovery.started.json', report);
  save('evidence/parent-run.yaml', parent.runBytes); save('evidence/parent-inventory.json', recovery.inventoryBytes);
  save('evidence/cookbook.md', recovery.cookbook); save('evidence/recovery-capture.mts', recovery.helperBytes);
  saveJson('evidence/tools.json', recovery.versions); saveJson('evidence/extra-configs.json', []);
  save('exclusions.txt', recovery.exclusions.toString().replace(/\n?$/, '\n') + prefixes.map(prefix => '/' + prefix).join('\n') + '\n');
  copyRetained(recovery);
  saveJson('evidence/inventory.json', { formatVersion: 1, snapshotId, files: retained });
  save('inventory.mjs', inventoryHelper(snapshotId));
  const capturedAt = utc(); report.capturedAt = capturedAt;
  save('evidence/captured-at.txt', capturedAt + '\n');
  save('evidence/scope-notes.md', scopeNotes(recovery));
  const settings = collectSettings(recovery, save);
  parent.verify();
  for (const file of retained) fileDigest(join(work, 'snapshot', file.path), file);
  report.status = 'completed'; report.finishedAt = utc();
  report.inventorySha256 = hash(read(join(work, 'evidence/inventory.json')));
  report.settingsSha256 = hash(settings.stdout);
  save('evidence/commands.md', '# Recovery capture commands\n\n```json\n' + JSON.stringify({ command: recovery.command,
    startedAt: recovery.startedAt, finishedAt: report.finishedAt, status: report.status, settingsCommand: settings.command }, null, 2) + '\n```\n');
  saveJson('evidence/capture-recovery.json', report); resultWritten = true;
  console.log(`Recovered ${snapshotId}: ${retained.length} files, ${report.retained.bytes} bytes; settings collected. Stage 1 review is pending.`);
}

try {
  const recovery = prepareRecovery();
  if (process.argv[2] === '--check') {
    const { inputs, parent, files } = recovery;
    console.log(JSON.stringify({ status: 'retained-inputs-verified', runRef: inputs.runId, snapshotRef: inputs.snapshotId,
      retained: recovery.report.retained, omittedFiles: files.omitted.length, omittedMetadataDifferences: files.differences,
      registeredArtifactsVerified: parent.artifacts.size, writes: false, stage1Review: 'pending' }, null, 2));
  } else capture(recovery);
} catch (error) {
  const failure = error as Error;
  if (evidence && report && !resultWritten) {
    report.status = 'failed'; report.finishedAt = utc(); report.reason = String(failure.message ?? failure).slice(0, 2000);
    writeFileSync(join(evidence, 'capture-recovery.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(join(evidence, 'commands.failed.md'), '# Failed recovery capture\n\n```json\n' +
      JSON.stringify({ command: report.command, startedAt: report.startedAt, finishedAt: report.finishedAt,
        status: report.status, reason: report.reason }, null, 2) + '\n```\n', { flag: 'wx' });
  }
  console.error(failure.message);
  process.exitCode = 1;
}
