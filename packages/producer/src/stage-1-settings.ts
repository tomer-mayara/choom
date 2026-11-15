import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve, posix } from 'node:path';

// The Stage 1 settings collector. The Stage 1 settings action runs it in the tool
// checkout; the recovery capture runs a settings.mts copy in its new run. It reads
// package manifests and compiler settings through a snapshot-backed file system
// and prints the settings record. It runs no target code.
interface InventoryFile { path: string; kind: string; bytes: number; sha256: string }
interface Diagnostic { code?: number; message: string }
interface ConfigRecord {
  path: string; status: string; diagnostics: Diagnostic[]; declared?: unknown; compilerOptions?: unknown;
  fileNames?: string[]; references?: string[];
}
interface DirectoryEntry { name: string; isFile: boolean; isDirectory: boolean }

// The settings action and the recovery capture always set both folders.
const work = process.env.CHOOM_WORK as string;
const require = createRequire(resolve(process.env.CHOOM_TOOLS as string, 'package.json'));
const { InMemoryFileSystemHost, ts } = require('ts-morph');
const inventory = JSON.parse(readFileSync(join(work, 'evidence/inventory.json'), 'utf8'));
const snapshotRoot = realpathSync(join(work, 'snapshot'));
const maxConfigFileBytes = 8 * 1024 * 1024;
const memory = new InMemoryFileSystemHost();
const indexed = new Map<string, InventoryFile>();
const contentReads = new Map<string, { path: string; bytes: number; sha256: string }>();
let snapshotFailure: Error | undefined;
function failSnapshot(message: string): never {
  snapshotFailure = new Error(`Snapshot integrity check failed: ${message}`);
  throw snapshotFailure;
}
for (const file of (inventory.files as InventoryFile[]).filter(file => file.kind === 'file')) {
  if (!file.path || posix.isAbsolute(file.path) || file.path.includes('\\') ||
      file.path.split('/').some(part => !part || part === '.' || part === '..'))
    throw new Error(`Invalid inventory path: ${file.path}`);
  const virtualPath = `/repo/${file.path}`;
  if (indexed.has(virtualPath)) throw new Error(`Duplicate inventory path: ${file.path}`);
  indexed.set(virtualPath, file);
  memory.writeFileSync(virtualPath, '');
}

// Reads a saved snapshot file for the compiler and checks it against the inventory.
function readSnapshotFile(file: InventoryFile, encoding: BufferEncoding): string {
  const absolute = join(snapshotRoot, file.path);
  try {
    const stat = lstatSync(absolute);
    if (!stat.isFile() || realpathSync(absolute) !== absolute || stat.size !== file.bytes)
      failSnapshot(file.path);
  } catch (error) {
    if (snapshotFailure) throw snapshotFailure;
    failSnapshot(`${file.path}: ${(error as Error).message}`);
  }
  if (file.bytes > maxConfigFileBytes)
    throw new Error(`Configuration input exceeds ${maxConfigFileBytes} bytes: ${file.path}`);
  let bytes: Buffer;
  try { bytes = readFileSync(absolute); }
  catch (error) { failSnapshot(`${file.path}: ${(error as Error).message}`); }
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256)
    failSnapshot(file.path);
  contentReads.set(file.path, { path: file.path, bytes: file.bytes, sha256: file.sha256 });
  return bytes.toString(encoding);
}

const readMissing = memory.readFileSync.bind(memory);
memory.readFileSync = (path: string, encoding: BufferEncoding = 'utf8'): string => {
  const file = indexed.get(posix.resolve('/', path));
  if (!file) return readMissing(path, encoding);
  return readSnapshotFile(file, encoding);
};
const packages: { path: string; data?: unknown; error?: string }[] = [];
for (const [virtualPath, file] of indexed) {
  if (posix.basename(file.path) !== 'package.json') continue;
  try { packages.push({ path: file.path, data: JSON.parse(memory.readFileSync(virtualPath)) }); }
  catch (error) {
    if (snapshotFailure) throw snapshotFailure;
    packages.push({ path: file.path, error: (error as Error).message });
  }
}
const configHost = {
  useCaseSensitiveFileNames: true,
  fileExists: (path: string) => memory.fileExistsSync(path),
  readFile: (path: string) => { try { return memory.readFileSync(path); }
    catch { if (snapshotFailure) throw snapshotFailure; return undefined; } },
  readDirectory: (root: string, extensions: unknown, excludes: unknown, includes: unknown, depth: unknown) => ts.matchFiles(
    root, extensions, excludes, includes, true, '/repo', depth,
    (path: string) => {
      if (!memory.directoryExistsSync(path)) return { files: [], directories: [] };
      const entries: DirectoryEntry[] = memory.readDirSync(path);
      return { files: entries.filter(entry => entry.isFile).map(entry => posix.basename(entry.name)),
        directories: entries.filter(entry => entry.isDirectory).map(entry => posix.basename(entry.name)) };
    }, (path: string) => path),
};

// Parses one configuration with its inherited settings and returns its project references.
function parseConfig(record: ConfigRecord): string[] {
  const parsed = ts.parseConfigFileTextToJson(record.path, memory.readFileSync(record.path));
  if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  record.declared = structuredClone(parsed.config);
  const result = ts.parseJsonConfigFileContent(parsed.config, configHost, posix.dirname(record.path), undefined, record.path);
  if (snapshotFailure) throw snapshotFailure;
  record.compilerOptions = result.options;
  record.diagnostics = result.errors.map((error: { code: number; messageText: unknown }) => ({ code: error.code,
    message: ts.flattenDiagnosticMessageText(error.messageText, '\n') }));
  record.fileNames = (result.fileNames as string[]).filter(name => indexed.has(name)).map(name => name.slice('/repo/'.length));
  record.status = result.errors.length ? 'partial' : 'parsed';
  const references: string[] = (result.projectReferences ?? []).map((reference: unknown) => ts.resolveProjectReferencePath(reference));
  record.references = references;
  return references;
}

const pending = [...indexed.keys()].filter(path => /\/(tsconfig|jsconfig)[^/]*\.json$/.test(path));
const extras: string[] = JSON.parse(readFileSync(join(work, 'evidence/extra-configs.json'), 'utf8'));
for (const path of extras) pending.push(posix.resolve('/repo', path));
const seen = new Set<string>();
const configs: ConfigRecord[] = [];
while (pending.length) {
  const path = pending.shift() as string;
  if (seen.has(path)) continue;
  seen.add(path);
  const record: ConfigRecord = { path, status: 'partial', diagnostics: [] };
  try {
    pending.push(...parseConfig(record));
  } catch (error) {
    if (snapshotFailure) throw snapshotFailure;
    record.status = 'unavailable';
    record.diagnostics.push({ message: (error as Error).message });
  }
  configs.push(record);
}
if (snapshotFailure) throw snapshotFailure;
console.log(JSON.stringify({ formatVersion: 1, snapshotId: inventory.snapshotId,
  virtualRoot: '/repo', limits: { maxConfigFileBytes }, packages, configs,
  contentReads: [...contentReads.values()],
  contentReadScope: 'Only requested settings and package manifests were read and verified. Other inventory contents were not revalidated.'
}, null, 2));
