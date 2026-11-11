import { createHash } from 'node:crypto';
import {
  closeSync, constants, copyFileSync, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, realpathSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const prefixes = ['src-tauri/target/', 'dist/', 'reports/', 'test-results/'];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const utc = () => new Date().toISOString();
const safe = name => typeof name === 'string' && name.length > 0 && !isAbsolute(name) &&
  !/[\\\u0000-\u001f\u007f]/.test(name) && name.split('/').every(part => part && part !== '.' && part !== '..');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const present = path => Boolean(lstatSync(path, { throwIfNoEntry: false }));
const canonicalDirectory = path => {
  assert(isAbsolute(path ?? '') && lstatSync(path).isDirectory() && realpathSync(path) === path,
    'Expected a canonical directory: ' + path);
  return path;
};
function read(path) {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + path);
  return readFileSync(path);
}
function fileDigest(path, expected) {
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
function omittedMetadata(root, file, index) {
  const path = join(root, file.path);
  try {
    if (realpathSync(dirname(path)) !== dirname(path)) return { index, path: file.path, status: 'noncanonical-parent' };
    const info = lstatSync(path);
    if (!info.isFile()) return { index, path: file.path, status: 'different-type' };
    if (realpathSync(path) !== path) return { index, path: file.path, status: 'noncanonical-path' };
    if (info.size !== file.bytes) return { index, path: file.path, status: 'different-size', actualBytes: info.size };
    return null;
  } catch (error) {
    return { index, path: file.path, status: error.code === 'ENOENT' ? 'missing' : 'unavailable',
      reason: error.code ?? error.message };
  }
}
function inventoryHelper(snapshotId) {
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

let evidence = null; let report = null; let resultWritten = false;
try {
  assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--check'),
    'Use no argument to capture, or --check for read-only verification.');
  const { CHOOM_PREVIOUS_WORK, CHOOM_WORK, CHOOM_TOOLS, CHOOM_RUN_ID, CHOOM_SNAPSHOT_ID } = process.env;
  const previous = canonicalDirectory(CHOOM_PREVIOUS_WORK);
  const tools = canonicalDirectory(CHOOM_TOOLS);
  assert(isAbsolute(CHOOM_WORK ?? '') && resolve(CHOOM_WORK) === CHOOM_WORK && !present(CHOOM_WORK),
    'CHOOM_WORK must be a new canonical absolute path.');
  canonicalDirectory(dirname(CHOOM_WORK));
  const work = CHOOM_WORK;
  const roots = [previous, work, tools];
  assert(roots.every((root, index) => roots.every((other, otherIndex) => index === otherIndex ||
    (root !== other && !root.startsWith(other + '/') && !other.startsWith(root + '/')))),
  'Keep the old run, new run, and trusted tools in separate, nonoverlapping directories.');
  assert(/^run-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(CHOOM_RUN_ID ?? '') &&
    /^snapshot-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(CHOOM_SNAPSHOT_ID ?? ''), 'Set new run and snapshot IDs.');
  const self = fileURLToPath(import.meta.url);
  assert(self === join(tools, 'docs/design/app-a/recover-capture.mjs'), 'Run the trusted recovery helper.');
  const helperBytes = read(self);
  const require = createRequire(join(tools, 'package.json'));
  for (const name of ['yaml', 'yaml/package.json', 'ts-morph', 'ts-morph/package.json']) {
    const modulePath = require.resolve(name);
    assert(modulePath.startsWith(join(tools, 'node_modules', name.split('/')[0]) + '/') &&
      realpathSync(modulePath) === modulePath, 'Use packages from the trusted tool checkout: ' + name);
  }
  const yamlPath = require.resolve('yaml');
  const { parse } = require(yamlPath);
  const parentRunBytes = read(join(previous, 'run.yaml'));
  const parent = parse(parentRunBytes.toString());
  assert(parent?.formatVersion === 1 && parent.mode === 'A' && parent.snapshot?.root === 'snapshot' &&
    typeof parent.artifacts === 'object' && parent.artifacts !== null && !Array.isArray(parent.artifacts),
  'Expected a recorded Mode A snapshot.');
  assert(parent.id !== CHOOM_RUN_ID && parent.snapshot.id !== CHOOM_SNAPSHOT_ID, 'Use new run and snapshot identities.');
  const artifacts = new Map();
  function verifyParent() {
    assert(read(join(previous, 'run.yaml')).equals(parentRunBytes), 'The previous run manifest changed.');
    for (const [id, record] of Object.entries(parent.artifacts)) {
      assert(safe(record?.path) && digest(record.sha256) &&
        !['run.yaml', 'discovery.yaml', 'baseline.yaml'].includes(record.path), 'Invalid parent artifact: ' + id);
      const bytes = read(join(previous, record.path));
      assert(hash(bytes) === record.sha256, 'Previous registered evidence changed: ' + id);
      artifacts.set(id, bytes);
    }
  }
  verifyParent();
  const inventoryRef = parent.snapshot.inventoryRef;
  assert(artifacts.has(inventoryRef), 'Missing registered parent inventory.');
  const inventoryBytes = artifacts.get(inventoryRef);
  const inventory = JSON.parse(inventoryBytes);
  assert(inventory.formatVersion === 1 && inventory.snapshotId === parent.snapshot.id && Array.isArray(inventory.files),
    'Parent inventory has the wrong snapshot identity.');
  const snapshot = canonicalDirectory(join(previous, 'snapshot'));
  const names = new Set(); const retained = []; const omitted = []; const differences = [];
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
  const exclusionPath = parent.snapshot.exclusions;
  assert(safe(exclusionPath), 'Invalid parent exclusions path.');
  const exclusionArtifact = Object.entries(parent.artifacts).find(([, record]) => record.path === exclusionPath);
  assert(exclusionArtifact, 'The previous exclusions must be registered.');
  const exclusions = artifacts.get(exclusionArtifact[0]);
  const cookbook = read(join(tools, 'docs/design/app-a/step-1-cookbook.md'));
  const settingsMatches = [...cookbook.toString().matchAll(/^cat > "\$CHOOM_WORK\/settings\.mjs" <<'JS'\n([\s\S]*?)^JS\n/gm)];
  assert(settingsMatches.length === 1, 'Expected one settings helper in the trusted Stage 1 cookbook.');
  const versions = { node: process.version, tsMorph: require('ts-morph/package.json').version,
    typescript: require('ts-morph').ts.version, yaml: require('yaml/package.json').version };
  const startedAt = utc();
  for (const file of retained) fileDigest(join(snapshot, file.path), file);
  verifyParent();
  const command = { args: process.argv, cwd: process.cwd(), environment: {
    CHOOM_PREVIOUS_WORK: previous, CHOOM_WORK: work, CHOOM_TOOLS: tools,
    CHOOM_RUN_ID, CHOOM_SNAPSHOT_ID,
  } };
  report = { formatVersion: 1, kind: 'recovery-capture', runRef: CHOOM_RUN_ID, snapshotRef: CHOOM_SNAPSHOT_ID,
    status: 'started', stage1Review: 'pending', startedAt, command, helperSha256: hash(helperBytes), toolVersions: versions,
    sourcePath: snapshot, work,
    parent: { runRef: parent.id, snapshotRef: parent.snapshot.id, work: previous, runSha256: hash(parentRunBytes),
      inventoryRef, inventoryPath: parent.artifacts[inventoryRef].path, inventorySha256: hash(inventoryBytes),
      registeredArtifactsVerified: artifacts.size, sourcePath: parent.snapshot.sourcePath ?? null,
      capturedAt: parent.snapshot.capturedAt ?? null, captureLimit: parent.snapshot.captureLimit ?? null },
    captureMethod: 'Independent copies of retained saved files, verified against the previous inventory before and after copying.',
    captureLimit: 'A selected projection of surviving saved inputs. It inherits the original capture limit; atomic capture is not proven.',
    rootExclusions: prefixes,
    retained: { files: retained.length, bytes: retained.reduce((sum, file) => sum + file.bytes, 0),
      preflightContentDigestsVerified: retained.length, copiedContentDigestsVerified: 0 },
    omitted: { files: omitted.length, parentInventoryIndexes: omitted,
      bytes: omitted.reduce((sum, index) => sum + inventory.files[index].bytes, 0),
      metadata: { checkedAt: utc(), matches: omitted.length - differences.length, differences,
        method: 'Path, type, and byte count only. Omitted file contents were not read or verified.' } },
    limits: ['The old run and its inventory remain unchanged. This is a new snapshot with a different capture scope.',
      'Generated source and contracts outside the four excluded root folders remain included.',
      'Omitted and unavailable input is not classified as unused.',
      'Previous Knip and LLM reports remain historical evidence, not results for the new snapshot.',
      'No live repository input, target code, executable target configuration, build, test, or package installation is used.'] };
  if (process.argv[2] === '--check') {
    console.log(JSON.stringify({ status: 'retained-inputs-verified', runRef: CHOOM_RUN_ID, snapshotRef: CHOOM_SNAPSHOT_ID,
      retained: report.retained, omittedFiles: omitted.length, omittedMetadataDifferences: differences,
      registeredArtifactsVerified: artifacts.size, writes: false, stage1Review: 'pending' }, null, 2));
  } else {
    mkdirSync(work); mkdirSync(join(work, 'snapshot')); mkdirSync(join(work, 'evidence'));
    evidence = join(work, 'evidence');
    const save = (name, bytes) => writeFileSync(join(work, name), bytes, { flag: 'wx' });
    const saveJson = (name, value) => save(name, JSON.stringify(value, null, 2) + '\n');
    saveJson('evidence/capture-recovery.started.json', report);
    save('evidence/parent-run.yaml', parentRunBytes); save('evidence/parent-inventory.json', inventoryBytes);
    save('evidence/cookbook.md', cookbook); save('evidence/recovery-capture.mjs', helperBytes);
    saveJson('evidence/tools.json', versions); saveJson('evidence/extra-configs.json', []);
    save('exclusions.txt', exclusions.toString().replace(/\n?$/, '\n') + prefixes.map(prefix => '/' + prefix).join('\n') + '\n');
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
        if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
      }
      return left.length - right.length;
    });
    const newInventory = { formatVersion: 1, snapshotId: CHOOM_SNAPSHOT_ID, files: retained };
    saveJson('evidence/inventory.json', newInventory);
    save('inventory.mjs', inventoryHelper(CHOOM_SNAPSHOT_ID));
    const capturedAt = utc(); report.capturedAt = capturedAt;
    save('evidence/captured-at.txt', capturedAt + '\n');
    save('evidence/scope-notes.md', '# Recovery capture scope\n\n' +
      `This new run (${CHOOM_RUN_ID}, ${CHOOM_SNAPSHOT_ID}) retains verified files from ${parent.id}, ${parent.snapshot.id}.\n` +
      'It does not recapture the live checkout. Every retained file matches its parent inventory digest.\n\n' +
      'The four excluded root folders are src-tauri/target/, dist/, reports/, and test-results/.\n' +
      'This omits captured build and run outputs. Generated source, contracts, and configuration outside those folders remain included.\n' +
      'Omission or unavailability does not establish unused code. The original exclusions still apply.\n' +
      'A declared dist packaging input is now outside capture scope; its contents and origin remain unavailable.\n\n' +
      `Original capture limit: ${parent.snapshot.captureLimit ?? 'No capture limit was recorded.'}\n` +
      'The new projection does not improve that original capture guarantee or prove an atomic source capture.\n\n' +
      'capture-recovery.json records the exact parent inventory, omitted records, and observed availability differences.\n' +
      'Previous Knip and LLM records remain historical evidence. They are not relabeled as results for this snapshot.\n' +
      'Stage 1 LLM review and the new working drafts are pending.\n');
    save('settings.mjs', settingsMatches[0][1]);
    const env = { ...process.env, CHOOM_WORK: work, CHOOM_TOOLS: tools };
    for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'BASH_ENV', 'ENV']) delete env[name];
    const settingsCommand = { args: [process.execPath, join(work, 'settings.mjs')], cwd: work,
      environment: { CHOOM_WORK: work, CHOOM_TOOLS: tools }, startedAt: utc(),
      timeoutMs: 60000, maxOutputBytes: 64 * 1024 * 1024 };
    const settings = spawnSync(process.execPath, [join(work, 'settings.mjs')], { env, cwd: work,
      timeout: settingsCommand.timeoutMs, maxBuffer: settingsCommand.maxOutputBytes });
    save('evidence/settings.stdout.txt', settings.stdout ?? Buffer.alloc(0));
    save('evidence/settings.stderr.txt', settings.stderr ?? Buffer.alloc(0));
    Object.assign(settingsCommand, { finishedAt: utc(), exitCode: settings.status, signal: settings.signal,
      error: settings.error ? { code: settings.error.code ?? null, message: settings.error.message } : null });
    saveJson('evidence/settings-command.json', settingsCommand);
    report.settings = settingsCommand;
    assert(!settings.error && settings.status === 0 && !settings.signal, 'Settings collection failed; preserve this new folder and its logs.');
    const parsedSettings = JSON.parse(settings.stdout);
    assert(parsedSettings.formatVersion === 1 && parsedSettings.snapshotId === CHOOM_SNAPSHOT_ID &&
      Array.isArray(parsedSettings.packages) && Array.isArray(parsedSettings.configs), 'Invalid settings output.');
    save('evidence/settings.json', settings.stdout);
    verifyParent();
    for (const file of retained) fileDigest(join(work, 'snapshot', file.path), file);
    report.status = 'completed'; report.finishedAt = utc();
    report.inventorySha256 = hash(read(join(work, 'evidence/inventory.json')));
    report.settingsSha256 = hash(settings.stdout);
    save('evidence/commands.md', '# Recovery capture commands\n\n```json\n' + JSON.stringify({ command,
      startedAt, finishedAt: report.finishedAt, status: report.status, settingsCommand }, null, 2) + '\n```\n');
    saveJson('evidence/capture-recovery.json', report); resultWritten = true;
    console.log(`Recovered ${CHOOM_SNAPSHOT_ID}: ${retained.length} files, ${report.retained.bytes} bytes; settings collected. Stage 1 review is pending.`);
  }
} catch (error) {
  if (evidence && report && !resultWritten) {
    report.status = 'failed'; report.finishedAt = utc(); report.reason = String(error.message ?? error).slice(0, 2000);
    writeFileSync(join(evidence, 'capture-recovery.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(join(evidence, 'commands.failed.md'), '# Failed recovery capture\n\n```json\n' +
      JSON.stringify({ command: report.command, startedAt: report.startedAt, finishedAt: report.finishedAt,
        status: report.status, reason: report.reason }, null, 2) + '\n```\n', { flag: 'wx' });
  }
  console.error(error.message);
  process.exitCode = 1;
}
