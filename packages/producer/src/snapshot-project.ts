import { posix } from 'node:path';
import type * as TsMorph from 'ts-morph';
import { assert } from './record-checks.ts';
import { SnapshotFileSystem, type SnapshotFiles } from './stage-1-settings.ts';

// The ts-morph project of a saved snapshot. It runs on the in-memory file system
// of the Stage 1 settings collector, which holds only the indexed regular files of
// the snapshot below the virtual root /repo. A file read checks the saved bytes
// against the inventory size and digest. Any other path is not found: the project
// never reads the disk outside the indexed files, and it records each request for
// a path that the snapshot does not hold. The project uses the compiler settings
// that the caller gives.
export type ProjectTools = Pick<typeof TsMorph, 'InMemoryFileSystemHost' | 'Project' | 'ts'>;
// The compiler settings of the project: their reference in the Stage 1 settings
// record (null for none), the configuration file that names the compiler inputs, the
// files entries of that configuration as it writes them, and the parsed compiler options.
export interface ProjectSettings {
  ref: string | null; configPath: string | null; files: readonly string[]; compilerOptions: Record<string, unknown>;
}
// A request of the project for a path that the snapshot does not hold. The answer was "not found".
export interface OutsideRead { operation: 'read-file' | 'read-directory' | 'file-exists' | 'directory-exists'; path: string }
export interface SnapshotProject {
  readonly project: TsMorph.Project;
  // Adds an indexed regular file of the snapshot to the project and returns it.
  sourceFile(path: string): TsMorph.SourceFile;
  outsideReads(): OutsideRead[];
}

export const virtualRoot = '/repo';
// The text of a source file is its saved bytes as UTF-8. A file that is not UTF-8 text stops the read.
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const readOnly = (): Error => new Error('The snapshot project is read-only.');
const standard = (path: string): string => posix.resolve(virtualRoot, path);

// The file system host of the project: the indexed files of the snapshot, read only.
// The in-memory file system holds only the indexed files, so it answers "not found"
// for any other path, with the errors that ts-morph expects.
class SnapshotHost implements TsMorph.FileSystemHost {
  readonly outside = new Map<string, OutsideRead>();
  private readonly files: SnapshotFileSystem;
  // TypeScript can catch an error of a host read, so the project checks this failure after each operation.
  private failure: unknown;

  constructor(files: SnapshotFileSystem) {
    this.files = files;
  }

  private outsideRead(operation: OutsideRead['operation'], path: string): void {
    const key = operation + ' ' + path;
    if (!this.outside.has(key)) this.outside.set(key, { operation, path });
  }

  // Throws the first failed read of an indexed file, if there was one.
  check(): void {
    this.files.checkSnapshot();
    if (this.failure !== undefined) throw this.failure;
  }

  isCaseSensitive(): boolean { return true; }
  getCurrentDirectory(): string { return virtualRoot; }
  realpathSync(path: string): string { return path; }

  fileExistsSync(path: string): boolean {
    const found = this.files.indexed.has(standard(path));
    if (!found) this.outsideRead('file-exists', standard(path));
    return found;
  }

  fileExists(path: string): Promise<boolean> { return Promise.resolve(this.fileExistsSync(path)); }

  directoryExistsSync(path: string): boolean {
    const found = this.files.memory.directoryExistsSync(standard(path));
    if (!found) this.outsideRead('directory-exists', standard(path));
    return found;
  }

  directoryExists(path: string): Promise<boolean> { return Promise.resolve(this.directoryExistsSync(path)); }

  readFileSync(path: string): string {
    const file = this.files.indexed.get(standard(path));
    if (file === undefined) {
      this.outsideRead('read-file', standard(path));
      return this.files.memory.readFileSync(standard(path));
    }
    try {
      return utf8.decode(this.files.readSnapshotBytes(file));
    } catch (error) {
      this.failure ??= error;
      throw error;
    }
  }

  readFile(path: string): Promise<string> {
    try {
      return Promise.resolve(this.readFileSync(path));
    } catch (error) {
      return Promise.reject(error as Error);
    }
  }

  readDirSync(path: string): TsMorph.RuntimeDirEntry[] {
    if (!this.files.memory.directoryExistsSync(standard(path))) this.outsideRead('read-directory', standard(path));
    return this.files.memory.readDirSync(standard(path));
  }

  globSync(patterns: readonly string[]): string[] { return this.files.memory.globSync(patterns); }
  glob(patterns: readonly string[]): Promise<string[]> { return Promise.resolve(this.globSync(patterns)); }
  writeFileSync(): void { throw readOnly(); }
  writeFile(): Promise<void> { return Promise.reject(readOnly()); }
  mkdirSync(): void { throw readOnly(); }
  mkdir(): Promise<void> { return Promise.reject(readOnly()); }
  deleteSync(): void { throw readOnly(); }
  delete(): Promise<void> { return Promise.reject(readOnly()); }
  moveSync(): void { throw readOnly(); }
  move(): Promise<void> { return Promise.reject(readOnly()); }
  copySync(): void { throw readOnly(); }
  copy(): Promise<void> { return Promise.reject(readOnly()); }
}

// Opens the project of the saved snapshot with the compiler settings. The project
// adds no file until the caller asks for one.
export function openSnapshotProject(snapshot: SnapshotFiles, settings: ProjectSettings, tools: ProjectTools): SnapshotProject {
  const files = new SnapshotFileSystem(snapshot, tools);
  const host = new SnapshotHost(files);
  const project = new tools.Project({ fileSystem: host, compilerOptions: settings.compilerOptions as TsMorph.CompilerOptions });
  function sourceFile(path: string): TsMorph.SourceFile {
    const virtual = posix.join(virtualRoot, path);
    assert(virtual === virtualRoot + '/' + path && files.indexed.has(virtual), 'Path is outside the indexed regular files: ' + path);
    const file = project.addSourceFileAtPath(virtual);
    host.check();
    return file;
  }
  return { project, sourceFile, outsideReads: () => [...host.outside.values()] };
}
