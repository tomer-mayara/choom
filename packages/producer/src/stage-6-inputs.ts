import { lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import type * as Yaml from 'yaml';
import { type Artifact, assert, type Fields, hash, json, object, text } from './record-checks.ts';
import { checkIndexedFile, directory, file, fileNames, type IndexedFile, maxArtifactBytes, safe } from './stage-6-files.ts';
import type { RunRecord } from './stage-6-records.ts';

// The checked inputs of the Stage 6 helper: the trusted YAML package of the tool
// checkout, the registered artifacts of the run, each checked by digest, and the
// indexed snapshot files. Saved JSON and YAML stay unchecked values until the
// checks read them.
export const draftNames = ['run.yaml', 'baseline.yaml', 'discovery.yaml'];
const maxRegistryBytes = 256 * 1024 * 1024;

// The Node version, the YAML package version and the digest of each file of the
// package, which start saves and every later action compares.
export interface ParserVersions { node: string; yaml: unknown; files: Record<string, string> }
export type TrustedYaml = typeof Yaml & { versions: ParserVersions };
export interface SnapshotIdentity { path: string; dev: number; ino: number }
export interface CheckedInventory {
  inventory: Fields;
  snapshot: SnapshotIdentity;
  inventorySha256: string;
  // The bytes of an indexed source file of at most `limit` bytes, checked by digest.
  readSource(path: string, limit: number): Buffer;
}

export const plainId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

// The YAML package of the tool checkout, with its versions. With `pinned`, the
// versions must be the versions that start saved.
export function loadYaml(tools: string, pinned?: unknown): TrustedYaml {
  const root = directory(join(tools, 'node_modules/yaml'));
  const metadata = json(file(root, 'package.json')) as Fields;
  assert(!Object.keys(metadata.dependencies ?? {}).length && !Object.keys(metadata.optionalDependencies ?? {}).length,
    'This profile needs a self-contained trusted YAML package.');
  const files = Object.fromEntries(fileNames(root).map(name => [name, hash(file(root, name))]));
  const versions = { node: process.version, yaml: metadata.version, files };
  if (pinned !== undefined) assert(same(versions, pinned), 'Trusted YAML package or Node changed since start.');
  const require = createRequire(join(tools, 'package.json'));
  const path = require.resolve('yaml');
  assert(path.startsWith(root + '/') && realpathSync(path) === path && Object.hasOwn(files, path.slice(root.length + 1)),
    'Use the pinned YAML entry from the trusted checkout.');
  return { ...(require(path) as typeof Yaml), versions };
}

// The registered artifacts of the run, each read and checked by digest. Without
// `permitFinal`, no artifact can be a file of the Stage 6 attempt `id`.
export function readRegistry(work: string, id: string, run: Fields, permitFinal = false): Map<string, Artifact> {
  assert(object(run.artifacts), 'Missing artifact registry.');
  const paths = new Set<string>();
  const artifacts = new Map<string, Artifact>();
  let total = 0;
  for (const [ref, entry] of Object.entries(run.artifacts)) {
    const record = entry as Fields | null | undefined;
    assert(text(ref) && safe(record?.path) && digest((record as Fields).sha256) && !draftNames.includes(record.path) &&
      !paths.has(record.path) && (permitFinal || !record.path.startsWith('evidence/' + id + '/')), 'Invalid or duplicate artifact: ' + ref);
    const bytes = file(work, record.path, Math.min(maxArtifactBytes, maxRegistryBytes - total));
    total += bytes.length;
    assert(hash(bytes) === record.sha256, 'Registered artifact changed: ' + ref);
    artifacts.set(ref, { ...record, bytes } as Artifact);
    paths.add(record.path);
  }
  return artifacts;
}

// The selected inventory and every snapshot file that it indexes, checked by size and digest.
export function verifyInventory(work: string, run: RunRecord, artifacts: Map<string, Artifact>): CheckedInventory {
  const inventoryArtifact = artifacts.get(run.snapshot.inventoryRef);
  assert(inventoryArtifact, 'Missing selected inventory.');
  const inventory = json(inventoryArtifact.bytes) as Fields;
  assert(inventory.formatVersion === 1 && inventory.snapshotId === run.snapshot.id && Array.isArray(inventory.files),
    'Invalid selected inventory.');
  const snapshot = directory(join(work, 'snapshot'));
  const indexed = new Map<string, IndexedFile>();
  for (const entry of inventory.files) {
    const record = entry as IndexedFile & Fields;
    assert(safe(record?.path) && record.kind === 'file' && !indexed.has(record.path) &&
      Number.isSafeInteger(record.bytes) && record.bytes >= 0 && digest(record.sha256),
    'Expected unique regular inventory records.');
    indexed.set(record.path, record);
    checkIndexedFile(snapshot, record);
  }
  const { dev, ino } = lstatSync(snapshot);
  return { inventory, snapshot: { path: snapshot, dev, ino }, inventorySha256: inventoryArtifact.sha256,
    readSource(path, limit) {
      assert(indexed.has(path), 'Source is outside the inventory: ' + path);
      const bytes = file(snapshot, path, limit);
      assert(hash(bytes) === (indexed.get(path) as IndexedFile).sha256, 'Changed reviewed source: ' + path);
      return bytes;
    } };
}
