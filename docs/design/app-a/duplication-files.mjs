import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { decodeBaselineYaml } from '../../../src/lib/baseline-yaml.ts';
import { readYamlData } from '../../../src/lib/architecture-yaml/parse.ts';
import { runLayout } from './run-layout.mjs';

export const toolRoot = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const assert = (condition, message) => { if (!condition) throw new Error(message); };
export const now = () => new Date().toISOString();
export const safePath = path => typeof path === 'string' && path.length <= 4096 &&
  !isAbsolute(path) && !/^[a-z]:/i.test(path) && !/[\\\u0000-\u001f\u007f]/.test(path) &&
  path.split('/').every(part => part && part !== '.' && part !== '..');
export const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function toolIdentity() {
  const folder = join(toolRoot, 'docs/design/app-a');
  const helpers = Object.fromEntries(readdirSync(folder).filter(name => /^duplication-.*\.mjs$/.test(name)).sort()
    .map(name => [name, hash(savedFile(folder, name))]));
  // Pin whole schema/parser folders so new sibling dependencies are included.
  const sharedPaths = ['package.json', 'docs/design/app-a/run-layout.mjs',
    'src/lib/baseline-yaml.ts', 'src/lib/interface-duplication-yaml.ts', 'src/lib/generated/contracts.ts',
    ...listFiles(toolRoot, 'src/domain'), ...listFiles(toolRoot, 'src/lib/architecture-yaml')].sort();
  const sharedSources = Object.fromEntries(sharedPaths.map(path => [path, hash(savedFile(toolRoot, path))]));
  return { node: process.version, bun: process.versions.bun ?? null,
    lockSha256: hash(savedFile(toolRoot, 'bun.lock')), helpers, sharedSources };
}

export function canonicalDirectory(path) {
  assert(isAbsolute(path ?? ''), 'Use an absolute directory.');
  const canonical = realpathSync(path);
  assert(lstatSync(canonical).isDirectory(), 'Expected a directory.');
  return canonical;
}

export function savedFile(root, name, limit = 16 * 1024 * 1024) {
  assert(safePath(name), 'Unsafe saved path: ' + name);
  const path = join(root, name);
  const listed = lstatSync(path);
  assert(listed.isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + name);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    assert(before.isFile() && before.ino === listed.ino && before.dev === listed.dev && before.size <= limit,
      'Changed or excessive saved file: ' + name);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const current = lstatSync(path);
    assert(bytes.length <= limit && after.size === before.size && after.mtimeMs === before.mtimeMs &&
      after.ctimeMs === before.ctimeMs && current.ino === before.ino && current.dev === before.dev &&
      realpathSync(path) === path, 'Saved file changed while reading: ' + name);
    return bytes;
  } finally { closeSync(fd); }
}

export function listFiles(root, prefix = '') {
  return readdirSync(join(root, prefix)).sort().flatMap(name => {
    const path = prefix ? prefix + '/' + name : name;
    assert(safePath(path), 'Unsafe snapshot path.');
    const absolute = join(root, path);
    const info = lstatSync(absolute);
    assert(realpathSync(absolute) === absolute && (info.isFile() || info.isDirectory()), 'Unsupported snapshot entry: ' + path);
    return info.isDirectory() ? listFiles(root, path) : [path];
  });
}

function registeredFile(work, run, ref) {
  const artifact = run.artifacts?.[ref];
  assert(artifact && isDigest(artifact.sha256), 'Missing registered artifact: ' + ref);
  const bytes = savedFile(work, artifact.path);
  assert(hash(bytes) === artifact.sha256, 'Registered artifact digest changed: ' + ref);
  return { bytes, artifact };
}

export function completedInputs(path) {
  const work = canonicalDirectory(path);
  const runBytes = savedFile(work, 'run.yaml');
  const run = readYamlData(runBytes.toString('utf8'));
  assert(run.status === 'completed' && run.progress?.baselineRecovery === 'complete', 'Use a completed Step 1 run.');
  const selected = registeredFile(work, run, run.baselineRef);
  const decoded = decodeBaselineYaml(selected.bytes.toString('utf8'));
  assert(decoded.status === 'success', 'The selected baseline is invalid.');
  const inventoryFile = registeredFile(work, run, run.snapshot?.inventoryRef);
  const inventory = JSON.parse(inventoryFile.bytes);
  assert(inventory.formatVersion === 1 && inventory.snapshotId === run.snapshot.id && Array.isArray(inventory.files),
    'Invalid snapshot inventory.');
  assert(run.snapshot.root === 'snapshot', 'Unsupported snapshot root.');
  const snapshot = canonicalDirectory(join(work, 'snapshot'));
  const indexed = new Set();
  for (const file of inventory.files) {
    assert(file.kind === 'file' && safePath(file.path) && !indexed.has(file.path) && isDigest(file.sha256), 'Invalid inventory entry.');
    indexed.add(file.path);
    const bytes = savedFile(snapshot, file.path, 128 * 1024 * 1024);
    assert(bytes.length === file.bytes && hash(bytes) === file.sha256, 'Snapshot digest changed: ' + file.path);
  }
  assert(JSON.stringify([...indexed].sort()) === JSON.stringify(listFiles(snapshot).sort()), 'Snapshot file set changed.');
  return { work, run, runSha256: hash(runBytes), baseline: decoded.baseline, baselineBytes: selected.bytes,
    inventory, inventoryBytes: inventoryFile.bytes, inventorySha256: hash(inventoryFile.bytes), snapshot };
}

export function prepareOutput(path, work) {
  assert(isAbsolute(path ?? ''), 'Use an absolute assessment output path.');
  const parent = canonicalDirectory(dirname(path));
  const output = join(parent, path.slice(dirname(path).length + 1));
  const offset = relative(work, output);
  assert(offset === '..' || offset.startsWith('..' + sep) || isAbsolute(offset), 'Keep assessment output outside the completed run.');
  runLayout(output, toolRoot);
  mkdirSync(output, { mode: 0o700 });
  mkdirSync(join(output, 'evidence'));
  return output;
}

export function register(output, manifest, name, value, ref = name) {
  assert(safePath(name) && !Object.hasOwn(manifest.artifacts, ref), 'Duplicate or unsafe artifact.');
  const bytes = typeof value === 'string' || Buffer.isBuffer(value) ? Buffer.from(value) : encode(value);
  mkdirSync(dirname(join(output, name)), { recursive: true });
  writeFileSync(join(output, name), bytes, { flag: 'wx' });
  manifest.artifacts[ref] = { path: name, sha256: hash(bytes) };
  return ref;
}

export function saveManifest(output, manifest) {
  const next = join(output, 'assessment.next.yaml');
  writeFileSync(next, stringify(manifest), { flag: 'wx' });
  renameSync(next, join(output, 'assessment.yaml'));
}

export function readAssessment(path) {
  const output = canonicalDirectory(path);
  const manifest = readYamlData(savedFile(output, 'assessment.yaml').toString('utf8'));
  assert(manifest.formatVersion === 1 && manifest.kind === 'duplication-assessment', 'Invalid assessment manifest.');
  assert(JSON.stringify(manifest.tools) === JSON.stringify(toolIdentity()), 'Trusted producer tools or runtime changed; start a new assessment.');
  for (const [ref] of Object.entries(manifest.artifacts)) registeredFile(output, manifest, ref);
  const inputs = completedInputs(manifest.source.work);
  assert(inputs.runSha256 === manifest.source.runSha256, 'The completed run manifest changed.');
  assert(hash(inputs.baselineBytes) === manifest.baseline.sha256 && inputs.inventorySha256 === manifest.snapshot.inventorySha256,
    'The assessment bindings changed.');
  return { output, manifest, inputs };
}
