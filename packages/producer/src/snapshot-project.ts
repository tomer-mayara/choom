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
// that the caller gives. A compiler input that the settings or a loaded file name
// and the snapshot does not hold is a gap, and the project opens without it.
export type ProjectTools = Pick<typeof TsMorph, 'InMemoryFileSystemHost' | 'Project' | 'ts'>;
// The compiler settings of the project: their reference in the Stage 1 settings
// record (null for none), the configuration file that names the compiler inputs, the
// files entries of that configuration as it writes them, and the parsed compiler options.
export interface ProjectSettings {
  ref: string | null; configPath: string | null; files: readonly string[]; compilerOptions: Record<string, unknown>;
}
// A request of the project for a path that the snapshot does not hold. The answer was "not found".
export interface OutsideRead { operation: 'read-file' | 'read-directory' | 'file-exists' | 'directory-exists'; path: string }
// A compiler input that the snapshot does not hold: a files entry or a types entry
// of the settings, or a reference path or reference types directive of a loaded
// file. It has the fields of a discovery gap without its ID and evidence, and
// `missing` names the missing file or type package.
export interface ProjectGap {
  kind: 'missing-compiler-input'; input: 'files' | 'types' | 'reference-path' | 'reference-types'; missing: string;
  subjectRefs: string[]; reason: string;
}
export interface SnapshotProject {
  readonly project: TsMorph.Project;
  // The TypeScript of ts-morph, which the project uses.
  readonly ts: ProjectTools['ts'];
  // Adds an indexed regular file of the snapshot to the project and returns it.
  sourceFile(path: string): TsMorph.SourceFile;
  outsideReads(): OutsideRead[];
  gaps(): ProjectGap[];
}

export const virtualRoot = '/repo';
// What the outsideReads of a record mean, in the words of the record.
export const outsideReadsNote = 'outsideReads lists each request of the project for a path that the snapshot does not hold: ' +
  'a file or folder read, or a check whether it exists. The answer was not found. The project reads only indexed snapshot ' +
  'files, checked against their inventory digests, and paths are as the project sees them below ' + virtualRoot + '.';
// The text of a source file is its saved bytes as UTF-8. A file that is not UTF-8 text stops the read.
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const readOnly = (): Error => new Error('The snapshot project is read-only.');
const standard = (path: string): string => posix.resolve(virtualRoot, path);
// The snapshot path of a project path, or the project path when it is outside the virtual root.
export const snapshotPath = (path: string): string =>
  path.startsWith(virtualRoot + '/') ? path.slice(virtualRoot.length + 1) : path;
// The file names that a reference path directive without an extension can name, as TypeScript tries them.
const referenceExtensions = ['.ts', '.tsx', '.d.ts'];
const missingFile = 'but the snapshot does not hold that file.';
const missingTypes = 'but the snapshot holds no declaration file for it.';
const openedWithout = 'The project opened without it.';

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

// Whether a type package resolves in the snapshot, as TypeScript resolves a types
// entry or a reference types directive of the containing file.
function typesResolve(project: TsMorph.Project, ts: ProjectTools['ts'], name: string, containingFile: string): boolean {
  const resolution = ts.resolveTypeReferenceDirective(name, containingFile, project.compilerOptions.get(),
    project.getModuleResolutionHost());
  return resolution.resolvedTypeReferenceDirective?.resolvedFileName !== undefined;
}

// The files entries and the types entries of the settings that the snapshot does not hold.
function settingsGaps(settings: ProjectSettings, files: SnapshotFileSystem, project: TsMorph.Project,
  ts: ProjectTools['ts']): ProjectGap[] {
  if (settings.configPath === null) return [];
  const folder = posix.dirname(settings.configPath);
  const config = snapshotPath(settings.configPath);
  const named = settings.ref === null ? config : `${config} (${settings.ref})`;
  const gaps: ProjectGap[] = [];
  for (const entry of settings.files) {
    const target = posix.resolve(folder, entry);
    if (files.indexed.has(target)) continue;
    const missing = snapshotPath(target);
    gaps.push({ kind: 'missing-compiler-input', input: 'files', missing, subjectRefs: [config, missing],
      reason: `${named} names ${missing} in its files list, ${missingFile} ${openedWithout}` });
  }
  const types = settings.compilerOptions.types;
  // TypeScript resolves the types entries from this file name in the configuration folder.
  const containingFile = posix.join(folder, '__inferred type names__.ts');
  for (const name of Array.isArray(types) ? types.filter(type => typeof type === 'string') : []) {
    if (typesResolve(project, ts, name, containingFile)) continue;
    gaps.push({ kind: 'missing-compiler-input', input: 'types', missing: name, subjectRefs: [config],
      reason: `${named} names the type package ${name} in its types list, ${missingTypes} ${openedWithout}` });
  }
  return gaps;
}

// The reference path and reference types directives of a loaded file that the snapshot does not hold, in source order.
function referenceGaps(file: TsMorph.SourceFile, files: SnapshotFileSystem, project: TsMorph.Project,
  ts: ProjectTools['ts']): ProjectGap[] {
  const virtual: string = file.getFilePath();
  const path = snapshotPath(virtual);
  const { referencedFiles, typeReferenceDirectives } = file.compilerNode;
  const directives = [...referencedFiles.map(reference => ({ reference, types: false })),
    ...typeReferenceDirectives.map(reference => ({ reference, types: true }))].sort((a, b) => a.reference.pos - b.reference.pos);
  return directives.flatMap(({ reference: { fileName }, types }): ProjectGap[] => {
    if (types) return typesResolve(project, ts, fileName, virtual) ? [] : [{ kind: 'missing-compiler-input',
      input: 'reference-types', missing: fileName, subjectRefs: [path],
      reason: `${path} names the type package ${fileName} in a reference types directive, ${missingTypes}` }];
    const target = posix.resolve(posix.dirname(virtual), fileName);
    const names = posix.extname(target) ? [target] : referenceExtensions.map(extension => target + extension);
    if (names.some(name => files.indexed.has(name))) return [];
    const missing = snapshotPath(target);
    return [{ kind: 'missing-compiler-input', input: 'reference-path', missing, subjectRefs: [path, missing],
      reason: `${path} names ${missing} in a reference path directive, ${missingFile}` }];
  });
}

// Opens the project of the saved snapshot with the compiler settings. The project
// adds no file until the caller asks for one.
export function openSnapshotProject(snapshot: SnapshotFiles, settings: ProjectSettings, tools: ProjectTools): SnapshotProject {
  const files = new SnapshotFileSystem(snapshot, tools);
  const host = new SnapshotHost(files);
  const project = new tools.Project({ fileSystem: host, compilerOptions: settings.compilerOptions as TsMorph.CompilerOptions });
  const gaps = settingsGaps(settings, files, project, tools.ts);
  host.check();
  const loaded = new Set<string>();
  function sourceFile(path: string): TsMorph.SourceFile {
    const virtual = posix.join(virtualRoot, path);
    assert(virtual === virtualRoot + '/' + path && files.indexed.has(virtual), 'Path is outside the indexed regular files: ' + path);
    const file = project.addSourceFileAtPath(virtual);
    host.check();
    if (!loaded.has(virtual)) gaps.push(...referenceGaps(file, files, project, tools.ts));
    loaded.add(virtual);
    return file;
  }
  return { project, ts: tools.ts, sourceFile, outsideReads: () => [...host.outside.values()], gaps: () => [...gaps] };
}

// A project that reads syntax only: without compiler settings, TypeScript parses
// each file at the latest language level.
const syntaxOnly: ProjectSettings = { ref: null, configPath: null, files: [], compilerOptions: {} };

// The parser of the syntax reader, as the records of the source queries name it.
export const syntaxParser = 'ts-morph snapshot project (TypeScript parser, Latest)';

// Parses one indexed regular file of the snapshot and gives its syntax tree to read.
export type SyntaxReader =<Result>(path: string, read: (source: TsMorph.ts.SourceFile) => Result) => Result;

// Opens a project without compiler settings on the saved snapshot. Each file is
// parsed when it is read and forgotten after, so the project holds at most one
// file. The source queries of Stages 3, 4 and 5 read their files with it.
export function openSyntaxReader(snapshot: SnapshotFiles, tools: ProjectTools): SyntaxReader {
  const { sourceFile } = openSnapshotProject(snapshot, syntaxOnly, tools);
  return (path, read) => {
    const file = sourceFile(path);
    try {
      return read(file.compilerNode);
    } finally {
      file.forget();
    }
  };
}

// The syntax tree of one snapshot file and the type checker of a program that holds only that file.
export interface CheckedText { source: TsMorph.ts.SourceFile; checker: TsMorph.ts.TypeChecker }

// The compiler options of a program of one file: a JavaScript file is part of the
// program, and the program loads no library file. They do not change the parse.
const oneFileProgram: TsMorph.CompilerOptions = { allowJs: true, noLib: true };

// A project that holds one snapshot file alone: its saved bytes as UTF-8 text,
// below the virtual root, on a file system in memory that holds no other file.
// Bytes that are not UTF-8 text stop the parse.
function oneFileProject(path: string, bytes: Buffer, tools: ProjectTools, compilerOptions: TsMorph.CompilerOptions): TsMorph.SourceFile {
  const virtual = posix.join(virtualRoot, path);
  const memory = new tools.InMemoryFileSystemHost();
  memory.writeFileSync(virtual, utf8.decode(bytes));
  return new tools.Project({ fileSystem: memory, compilerOptions }).addSourceFileAtPath(virtual);
}

// Parses the saved bytes of one snapshot file as the syntax reader parses the file:
// as UTF-8 text, without compiler settings, below the virtual root. The shared record
// checks use it: they read the bytes and check them against the inventory themselves.
// Bytes that are not UTF-8 text stop the parse.
export function parseSnapshotText(path: string, bytes: Buffer, tools: ProjectTools): TsMorph.ts.SourceFile {
  return oneFileProject(path, bytes, tools, syntaxOnly.compilerOptions as TsMorph.CompilerOptions).compilerNode;
}

// Parses the saved bytes of one snapshot file as parseSnapshotText does, and binds the
// names of that file with the type checker of a program that holds only that file.
// The checker finds which declaration of the file each name uses. It reads no other
// file, so it resolves no import. The caller reads and checks the bytes.
export function checkSnapshotText(path: string, bytes: Buffer, tools: ProjectTools): CheckedText {
  const file = oneFileProject(path, bytes, tools, oneFileProgram);
  const program = file.getProject().getProgram().compilerObject;
  const source = program.getSourceFile(file.getFilePath());
  assert(source, 'The program of the file does not hold ' + path + '.');
  return { source, checker: program.getTypeChecker() };
}

// The parser diagnostics of a parsed file. TypeScript keeps them in an internal field.
export function parseDiagnostics(source: TsMorph.ts.SourceFile): TsMorph.ts.Diagnostic[] {
  return (source as TsMorph.ts.SourceFile & { parseDiagnostics?: TsMorph.ts.Diagnostic[] }).parseDiagnostics ?? [];
}
