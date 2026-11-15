import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as TsMorph from 'ts-morph';
import type * as ParsingProfiles from './parsing-profile.ts';

// The Stage 1 settings collector. The Stage 1 settings action runs it in the tool
// checkout; the recovery capture runs a settings.mts copy in its new run. It reads
// package manifests and compiler settings through a snapshot-backed file system
// and prints the settings record. It runs no target code. Without project
// settings, the record names the Choom parsing profile and a gap. The copy cannot
// import other producer files, so the collector is one file and loads ts-morph and
// the parsing profile from the tool checkout. readProjectSettings is the collector
// without its process input and output.
export interface InventoryFile { path: string; kind: string; bytes: number; sha256: string }
interface Diagnostic { code?: number; message: string }
interface ConfigRecord {
  path: string; status: string; diagnostics: Diagnostic[]; declared?: unknown; compilerOptions?: unknown;
  fileNames?: string[]; references?: string[];
}
interface PackageRecord { path: string; data?: unknown; error?: string }
interface ContentRead { path: string; bytes: number; sha256: string }
// The saved snapshot of a run: its inventory, the folder of its files, and the
// extra compiler settings that the operator named, as snapshot paths.
export interface SnapshotInput { inventory: { snapshotId: string; files: InventoryFile[] }; snapshotRoot: string; extraConfigs: string[] }
// The parts of ts-morph that the collector uses: a file system in memory and the TypeScript compiler API.
export type SettingsTools = Pick<typeof TsMorph, 'InMemoryFileSystemHost' | 'ts'>;
type ParsingProfile = ParsingProfiles.ParsingProfile;
// The trusted code and data that the collector uses, from the tool checkout.
export interface CollectorTools { tsMorph: SettingsTools; parsingProfile: ParsingProfile }
// A settings gap has the fields of a discovery gap except its ID and evidence:
// the Stage 1 review gives each gap an ID and cites the settings record.
export interface SettingsGap { kind: string; subjectRefs: string[]; reason: string }
export interface SettingsRecord {
  formatVersion: number; snapshotId: string; virtualRoot: string; limits: { maxConfigFileBytes: number };
  packages: PackageRecord[]; configs: ConfigRecord[]; parsingProfile: ParsingProfile | null; gaps: SettingsGap[];
  contentReads: ContentRead[]; contentReadScope: string;
}
type MemoryHost = InstanceType<SettingsTools['InMemoryFileSystemHost']>;
type ParseConfigHost = TsMorph.ts.ParseConfigHost;
interface FileSystemEntries { files: string[]; directories: string[] }
// ts.matchFiles is internal to TypeScript. The host uses it as TypeScript's own system host does.
type MatchFiles = (...args: [path: string, extensions: readonly string[] | undefined, excludes: readonly string[] | undefined,
  includes: readonly string[] | undefined, useCaseSensitiveFileNames: boolean, currentDirectory: string,
  depth: number | undefined, getFileSystemEntries: (path: string) => FileSystemEntries, realpath: (path: string) => string]) => string[];

const maxConfigFileBytes = 8 * 1024 * 1024;
const configFile = /\/(tsconfig|jsconfig)[^/]*\.json$/;

// The snapshot as the compiler reads it: an in-memory file system with one entry
// for each inventory file. A content read checks the saved file against the inventory.
class SnapshotFileSystem {
  readonly memory: MemoryHost;
  readonly indexed = new Map<string, InventoryFile>();
  readonly contentReads = new Map<string, ContentRead>();
  private readonly snapshotRoot: string;
  // TypeScript can catch an error of a host read, so the collector also checks this failure after each parse.
  private snapshotFailure: Error | undefined;

  constructor(snapshot: SnapshotInput, tools: SettingsTools) {
    this.snapshotRoot = snapshot.snapshotRoot;
    this.memory = new tools.InMemoryFileSystemHost();
    for (const file of snapshot.inventory.files.filter(file => file.kind === 'file')) {
      if (!file.path || posix.isAbsolute(file.path) || file.path.includes('\\') ||
          file.path.split('/').some(part => !part || part === '.' || part === '..'))
        throw new Error(`Invalid inventory path: ${file.path}`);
      const virtualPath = `/repo/${file.path}`;
      if (this.indexed.has(virtualPath)) throw new Error(`Duplicate inventory path: ${file.path}`);
      this.indexed.set(virtualPath, file);
      this.memory.writeFileSync(virtualPath, '');
    }
  }

  private failSnapshot(message: string): never {
    this.snapshotFailure = new Error(`Snapshot integrity check failed: ${message}`);
    throw this.snapshotFailure;
  }

  // Throws the snapshot failure, if there was one.
  checkSnapshot(): void {
    if (this.snapshotFailure) throw this.snapshotFailure;
  }

  // Reads a saved snapshot file for the compiler and checks it against the inventory.
  private readSnapshotFile(file: InventoryFile, encoding: BufferEncoding): string {
    const absolute = join(this.snapshotRoot, file.path);
    try {
      const stat = lstatSync(absolute);
      if (!stat.isFile() || realpathSync(absolute) !== absolute || stat.size !== file.bytes)
        this.failSnapshot(file.path);
    } catch (error) {
      this.checkSnapshot();
      this.failSnapshot(`${file.path}: ${(error as Error).message}`);
    }
    if (file.bytes > maxConfigFileBytes)
      throw new Error(`Configuration input exceeds ${maxConfigFileBytes} bytes: ${file.path}`);
    let bytes: Buffer;
    try { bytes = readFileSync(absolute); }
    catch (error) { this.failSnapshot(`${file.path}: ${(error as Error).message}`); }
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256)
      this.failSnapshot(file.path);
    this.contentReads.set(file.path, { path: file.path, bytes: file.bytes, sha256: file.sha256 });
    return bytes.toString(encoding);
  }

  // Reads a file as text: an inventory file from the snapshot; another path fails as missing.
  readText(path: string, encoding: BufferEncoding = 'utf8'): string {
    const file = this.indexed.get(posix.resolve('/', path));
    if (!file) return this.memory.readFileSync(path, encoding);
    return this.readSnapshotFile(file, encoding);
  }

  configHost(ts: SettingsTools['ts']): ParseConfigHost {
    const matchFiles = (ts as unknown as { matchFiles: MatchFiles }).matchFiles;
    return {
      useCaseSensitiveFileNames: true,
      fileExists: (path: string) => this.memory.fileExistsSync(path),
      readFile: (path: string) => { try { return this.readText(path); }
        catch { this.checkSnapshot(); return undefined; } },
      readDirectory: (root, extensions, excludes, includes, depth) => matchFiles(
        root, extensions, excludes, includes, true, '/repo', depth,
        (path: string) => {
          if (!this.memory.directoryExistsSync(path)) return { files: [], directories: [] };
          const entries = this.memory.readDirSync(path);
          return { files: entries.filter(entry => entry.isFile).map(entry => posix.basename(entry.name)),
            directories: entries.filter(entry => entry.isDirectory).map(entry => posix.basename(entry.name)) };
        }, (path: string) => path),
    };
  }
}

function readPackages(snapshot: SnapshotFileSystem): PackageRecord[] {
  const packages: PackageRecord[] = [];
  for (const [virtualPath, file] of snapshot.indexed) {
    if (posix.basename(file.path) !== 'package.json') continue;
    try { packages.push({ path: file.path, data: JSON.parse(snapshot.readText(virtualPath)) }); }
    catch (error) {
      snapshot.checkSnapshot();
      packages.push({ path: file.path, error: (error as Error).message });
    }
  }
  return packages;
}

// Parses one configuration with its inherited settings and returns its project references.
function parseConfig(snapshot: SnapshotFileSystem, ts: SettingsTools['ts'], record: ConfigRecord): string[] {
  const parsed = ts.parseConfigFileTextToJson(record.path, snapshot.readText(record.path));
  if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  record.declared = structuredClone(parsed.config);
  const result = ts.parseJsonConfigFileContent(parsed.config, snapshot.configHost(ts), posix.dirname(record.path), undefined,
    record.path);
  snapshot.checkSnapshot();
  record.compilerOptions = result.options;
  record.diagnostics = result.errors.map(error => ({ code: error.code,
    message: ts.flattenDiagnosticMessageText(error.messageText, '\n') }));
  record.fileNames = result.fileNames.filter(name => snapshot.indexed.has(name)).map(name => name.slice('/repo/'.length));
  record.status = result.errors.length ? 'partial' : 'parsed';
  const references = (result.projectReferences ?? []).map(reference => ts.resolveProjectReferencePath(reference));
  record.references = references;
  return references;
}

// The conventional tsconfig*.json and jsconfig*.json files, the extra settings
// that the operator named, and the projects that they reference.
function readConfigs(snapshot: SnapshotFileSystem, ts: SettingsTools['ts'], extraConfigs: string[]): ConfigRecord[] {
  const pending = [...snapshot.indexed.keys()].filter(path => configFile.test(path));
  for (const path of extraConfigs) pending.push(posix.resolve('/repo', path));
  const seen = new Set<string>();
  const configs: ConfigRecord[] = [];
  while (pending.length) {
    const path = pending.shift() as string;
    if (seen.has(path)) continue;
    seen.add(path);
    const record: ConfigRecord = { path, status: 'partial', diagnostics: [] };
    try {
      pending.push(...parseConfig(snapshot, ts, record));
    } catch (error) {
      snapshot.checkSnapshot();
      record.status = 'unavailable';
      record.diagnostics.push({ message: (error as Error).message });
    }
    configs.push(record);
  }
  return configs;
}

// The gap of a snapshot without project settings.
export function noProjectSettingsGap(snapshotId: string, profile: ParsingProfile): SettingsGap {
  return { kind: 'no-project-settings', subjectRefs: [snapshotId], reason: 'No project settings were found. ' +
    'The snapshot has no tsconfig*.json or jsconfig*.json file, and the operator named no extra compiler settings. ' +
    `The source is parsed with the named Choom parsing profile ${profile.id}. ` +
    'Its options are Choom assumptions, not settings of the project.' };
}

export function readProjectSettings(input: SnapshotInput, { tsMorph, parsingProfile }: CollectorTools): SettingsRecord {
  const snapshot = new SnapshotFileSystem(input, tsMorph);
  const packages = readPackages(snapshot);
  const configs = readConfigs(snapshot, tsMorph.ts, input.extraConfigs);
  snapshot.checkSnapshot();
  const { snapshotId } = input.inventory;
  // Any configuration, also one that does not parse, is project settings: the profile is only for none.
  const profile = configs.length ? null : structuredClone(parsingProfile);
  return { formatVersion: 2, snapshotId,
    virtualRoot: '/repo', limits: { maxConfigFileBytes }, packages, configs,
    parsingProfile: profile, gaps: profile ? [noProjectSettingsGap(snapshotId, profile)] : [],
    contentReads: [...snapshot.contentReads.values()],
    contentReadScope: 'Only requested settings and package manifests were read and verified. Other inventory contents were not revalidated.' };
}

// Collects the settings of the run in CHOOM_WORK and prints the settings record.
async function collectSettings(): Promise<void> {
  // The settings action and the recovery capture always set both folders.
  const work = process.env.CHOOM_WORK as string;
  const tools = process.env.CHOOM_TOOLS as string;
  const require = createRequire(resolve(tools, 'package.json'));
  const tsMorph = require('ts-morph') as SettingsTools;
  const profiles = await import(pathToFileURL(resolve(tools, 'packages/producer/src/parsing-profile.ts')).href) as
    typeof ParsingProfiles;
  const inventory = JSON.parse(readFileSync(join(work, 'evidence/inventory.json'), 'utf8'));
  const snapshotRoot = realpathSync(join(work, 'snapshot'));
  const extraConfigs: string[] = JSON.parse(readFileSync(join(work, 'evidence/extra-configs.json'), 'utf8'));
  const settings = readProjectSettings({ inventory, snapshotRoot, extraConfigs },
    { tsMorph, parsingProfile: profiles.choomDefaultProfile });
  console.log(JSON.stringify(settings, null, 2));
}

if (import.meta.main) await collectSettings();
