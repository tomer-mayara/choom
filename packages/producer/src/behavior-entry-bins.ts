import { posix } from 'node:path';
import type * as TsMorph from 'ts-morph';
import type { EntryCandidate, SourceSite } from './behavior-entry-calls.ts';
import type { SettingsGap } from './behavior-entry-settings.ts';
import { located, type Named } from './call-rules.ts';
import type { BehaviorEntryPackageBinRule } from './generated/contracts.ts';
import { sourceLimit } from './record-candidates.ts';
import { type Fields, object } from './record-checks.ts';
import type { SourcePosition } from './snapshot-exports.ts';
import { parseDiagnostics, type ProjectTools, virtualRoot } from './snapshot-project.ts';
import { type InventoryFile, SnapshotFileSystem, type SnapshotFiles } from './stage-1-settings.ts';

// The package-bin rules of the behavior entry rules on the saved snapshot. A rule reads
// the bin field of each package.json of the snapshot outside the node_modules folders,
// as JSON text; nothing runs. It reads only a file that JSON.parse accepts, as npm does,
// and takes the ranges from the syntax tree of TypeScript. The field is one path, for
// the command of the package name; an array of paths, each for the command of its
// basename; or an object whose keys are command names and whose values are paths. Each
// path is a candidate at its value. Its name is the command as npm installs it: the last
// part of the key, of the package name or of the path in an array, so without a scope.
// Each other value is a gap, and so is an array with an element that is not a path.
// The handler of a candidate is the whole file that the command runs, only with evidence:
// the snapshot holds the bin file (snapshot-file), or a fully parsed configuration of the
// settings record compiles a source file of the snapshot that it selects to the bin file,
// from its rootDir to its outDir (compiler-output). Otherwise the handler is null with a reason.
type Ts = typeof TsMorph.ts;
type Node = TsMorph.ts.Node;
type JsonObject = TsMorph.ts.ObjectLiteralExpression;
export type BinEvidence = { kind: 'snapshot-file'; binFile: string } |
  { kind: 'compiler-output'; binFile: string; compilerSettingsRef: string; outDir: string; rootDir: string };
// A file that a command runs: the whole file, with the evidence that links it.
export interface LinkedFile extends SourceSite { evidence: BinEvidence }
export interface BinCandidate extends Omit<EntryCandidate, 'handler'> { handler: LinkedFile | null }
export interface BinFindings { candidates: BinCandidate[]; gaps: SettingsGap[] }
// The saved snapshot as the rules read it: the indexed files, their checked bytes and the settings record.
// sourceLimit is the largest handler file, in bytes, that the shared record checks read (record-candidates.ts).
export interface BinSnapshot {
  ts: Ts;
  files: ReadonlySet<string>;
  read(path: string): Buffer;
  settings: Fields; settingsRef: string;
  sourceLimit: number;
}
type Linked = Pick<BinCandidate, 'handler' | 'handlerReason'>;

// The text of a saved file is UTF-8. A byte order mark is not counted, as in the ranges of the records.
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
// The source files that TypeScript compiles to an output file, by the extension of the output.
const sourceExtensions: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'], '.jsx': ['.tsx', '.jsx'], '.mjs': ['.mts', '.mjs'], '.cjs': ['.cts', '.cjs'],
};
const reasons = {
  notJson: 'The file is not a valid JSON object, so the rule cannot read its bin field.',
  notPaths: 'The bin field is not a path, an array of paths or an object of paths, so npm installs no command from it.',
  notPathElement: 'An element of the bin array is not a path. npm stops with an error when it reads such a field, so it ' +
    'installs no command from it.',
  notPath: 'The value of the command is not a path, so npm installs no command for it.',
  noPackageName: 'The bin field is one path and the package has no name, so npm installs no command for it.',
  noName: 'The command name is empty when npm keeps only its last part, so npm installs no command for it.',
  noFile: 'The path names no file when npm keeps it in the folder of the package, so npm installs no command for it.',
};

// The snapshot of the rules, with the checked reader of its indexed files.
export function binSnapshot(snapshot: SnapshotFiles, tools: ProjectTools, settings: Fields, settingsRef: string): BinSnapshot {
  const fileSystem = new SnapshotFileSystem(snapshot, tools);
  const files = new Set(snapshot.files.filter(file => file.kind === 'file').map(file => file.path));
  return { ts: tools.ts, files, settings, settingsRef, sourceLimit,
    read: path => fileSystem.readSnapshotBytes(fileSystem.indexed.get(virtualRoot + '/' + path) as InventoryFile) };
}

// The package.json files of the snapshot outside the node_modules folders, in their order.
export const packageFiles = (paths: readonly string[]): string[] =>
  paths.filter(path => posix.basename(path) === 'package.json' && !path.split('/').includes('node_modules'));

// The text of saved bytes without a byte order mark, or undefined when they are not UTF-8 text.
function textOf(bytes: Buffer): string | undefined {
  try { return utf8.decode(bytes); } catch { return undefined; }
}

// Whether JSON.parse accepts the text, as npm, Stage 1 and Stage 2 read a package.json. The JSON
// parser of TypeScript also takes comments, trailing commas, single quotes and names without quotes.
function strictJson(text: string): boolean {
  try { JSON.parse(text); return true; } catch { return false; }
}

// The last property of an object for each key, in the order of its first property, as JSON.parse keeps them.
function properties(ts: Ts, value: JsonObject): Map<string, Node> {
  const found = new Map<string, Node>();
  for (const item of value.properties)
    if (ts.isPropertyAssignment(item) && ts.isStringLiteral(item.name)) found.set(item.name.text, item.initializer);
  return found;
}

// The snapshot path of a path of the settings record, which can start at the virtual root:
// '.' for the root, or undefined outside the snapshot.
function snapshotRelative(path: unknown): string | undefined {
  if (typeof path !== 'string') return undefined;
  const resolved = posix.resolve(virtualRoot, path);
  return resolved === virtualRoot ? '.' : resolved.startsWith(virtualRoot + '/') ? resolved.slice(virtualRoot.length + 1) : undefined;
}

// The path of a file in a folder of the snapshot, or undefined when the folder does not hold it.
const inside = (folder: string, path: string): string | undefined =>
  folder === '.' ? path : path.startsWith(folder + '/') ? path.slice(folder.length + 1) : undefined;

// The first fully parsed configuration that compiles a source file of the snapshot that it selects to the bin file:
// the source file has the path of the bin file in outDir, in rootDir, with a source extension of its extension.
function compilerSource(snapshot: BinSnapshot, binFile: string): { path: string; evidence: BinEvidence } | undefined {
  const extension = posix.extname(binFile);
  const extensions = Object.hasOwn(sourceExtensions, extension) ? sourceExtensions[extension] as string[] : [];
  const configs = Array.isArray(snapshot.settings.configs) ? snapshot.settings.configs as unknown[] : [];
  for (const [index, config] of configs.entries()) {
    const { status, compilerOptions, fileNames } = object(config) ? config : {};
    const options = object(compilerOptions) ? compilerOptions : {};
    const outDir = snapshotRelative(options.outDir);
    const rootDir = snapshotRelative(options.rootDir);
    if (status !== 'parsed' || !Array.isArray(fileNames) || outDir === undefined || rootDir === undefined) continue;
    const output = inside(outDir, binFile);
    const selected = new Set(fileNames.map(snapshotRelative));
    const stem = output === undefined ? undefined : posix.join(rootDir, output.slice(0, output.length - extension.length));
    const path = stem === undefined ? undefined
      : extensions.map(source => stem + source).find(source => selected.has(source) && snapshot.files.has(source));
    if (path !== undefined) return { path, evidence: { kind: 'compiler-output', binFile,
      compilerSettingsRef: snapshot.settingsRef + '#/configs/' + index, outDir, rootDir } };
  }
  return undefined;
}

// The position after the last character of a text. Lines end at CRLF, CR, LF, U+2028 and
// U+2029, as TypeScript and the record checks count them, and columns count UTF-16 code units.
function endOf(text: string): SourcePosition {
  const ends = [...text.matchAll(/\r\n|\r|\n|\u2028|\u2029/g)];
  const last = ends.at(-1);
  return { line: ends.length + 1, column: text.length - (last === undefined ? 0 : last.index + last[0].length) + 1 };
}

// The whole file, from its first character to the position after its last character.
// A larger file than the record checks read gives no range, so that the publisher can check the record.
function wholeFile(snapshot: BinSnapshot, path: string, evidence: BinEvidence): Linked {
  const bytes = snapshot.read(path);
  if (bytes.length > snapshot.sourceLimit) return { handler: null, handlerReason: 'The handler file ' + path +
    ' is larger than ' + snapshot.sourceLimit + ' bytes, the largest file that the record checks read, so the record gives ' +
    'no range for it.' };
  const text = textOf(bytes);
  if (text === undefined) return { handler: null, handlerReason: 'The snapshot holds the bin file ' + path +
    ', but it is not UTF-8 text, so the record gives no range for it.' };
  return { handler: { path, range: [{ line: 1, column: 1 }, endOf(text)], evidence }, handlerReason: null };
}

// The file that the command of a path runs, only with evidence. npm keeps the path in the folder of the package.
function linkOf(snapshot: BinSnapshot, folder: string, value: string): Linked {
  const target = posix.join('/', value.replace(/\\/g, '/')).slice(1);
  if (target === '') return { handler: null, handlerReason: reasons.noFile };
  const binFile = posix.join(folder, target);
  if (snapshot.files.has(binFile)) return wholeFile(snapshot, binFile, { kind: 'snapshot-file', binFile });
  const compiled = compilerSource(snapshot, binFile);
  if (compiled !== undefined) return wholeFile(snapshot, compiled.path, compiled.evidence);
  return { handler: null, handlerReason: 'The snapshot does not hold the bin file ' + binFile + ', and no fully parsed ' +
    'configuration of ' + snapshot.settingsRef + ' with outDir and rootDir compiles a source file of the snapshot to it.' };
}

// The name of a command as npm installs it: the last part of the key, after \ and : become /.
function commandName(key: string | undefined, missing: string): Named {
  if (key === undefined) return { name: null, nameReason: missing };
  const name = posix.join('/', posix.basename(key.replace(/[\\:]/g, '/'))).slice(1);
  return name === '' ? { name: null, nameReason: reasons.noName } : { name, nameReason: null };
}

// Why npm installs no command from the whole bin field, or undefined when npm reads the field.
// npm takes one path, an array of paths or an object; it stops with an error on an array
// with an element that is not a string.
function fieldReason(ts: Ts, bin: Node): string | undefined {
  if (ts.isArrayLiteralExpression(bin)) return bin.elements.every(element => ts.isStringLiteral(element)) ? undefined
    : reasons.notPathElement;
  return ts.isStringLiteral(bin) || ts.isObjectLiteralExpression(bin) ? undefined : reasons.notPaths;
}

// The commands of a bin field, each with its name and its value: one path, for the command
// of the package name; each path of an array, for the command of the basename of the path
// with its extension, as npm names it; or the values of an object by command name.
function commandsOf(ts: Ts, bin: Node, packageName: Node | undefined): [Named, Node][] {
  if (ts.isStringLiteral(bin))
    return [[commandName(packageName !== undefined && ts.isStringLiteral(packageName) ? packageName.text : undefined,
      reasons.noPackageName), bin]];
  if (ts.isArrayLiteralExpression(bin)) return bin.elements.filter(element => ts.isStringLiteral(element))
    .map(element => [commandName(posix.basename(element.text), reasons.noName), element]);
  return ts.isObjectLiteralExpression(bin) ? [...properties(ts, bin)].map(([key, value]) => [commandName(key, reasons.noName), value])
    : [];
}

// The candidates and the gaps of the package-bin rules in one package.json of the snapshot.
// A file that is not UTF-8 text gives neither: a gap has a range in the saved text.
export function binCandidates(snapshot: BinSnapshot, path: string, rules: readonly BehaviorEntryPackageBinRule[]): BinFindings {
  const { ts } = snapshot;
  const findings: BinFindings = { candidates: [], gaps: [] };
  const text = rules.length ? textOf(snapshot.read(path)) : undefined;
  if (text === undefined) return findings;
  const source = ts.parseJsonText(path, text);
  const root = source.statements[0]?.expression;
  const parsed = strictJson(text) && parseDiagnostics(source).length === 0;
  const fields = parsed && root !== undefined && ts.isObjectLiteralExpression(root) ? properties(ts, root) : undefined;
  const bin = fields?.get('bin');
  const binReason = bin === undefined ? undefined : fieldReason(ts, bin);
  const commands = bin === undefined || binReason !== undefined ? [] : commandsOf(ts, bin, fields?.get('name'));
  for (const rule of rules) {
    const identity = { ruleId: rule.id, ruleVersion: rule.version, entryKind: rule.entryKind };
    const gap = (node: Node, reason: string): SettingsGap => ({ kind: 'unknown-settings-value', ...identity,
      ...located(source, node), reason });
    if (fields === undefined) findings.gaps.push(gap(parsed && root !== undefined ? root : source, reasons.notJson));
    else if (bin !== undefined && binReason !== undefined) findings.gaps.push(gap(bin, binReason));
    for (const [name, value] of commands) {
      if (ts.isStringLiteral(value)) findings.candidates.push({ ...identity, ...located(source, value), ...name,
        ...linkOf(snapshot, posix.dirname(path), value.text) });
      else findings.gaps.push(gap(value, reasons.notPath));
    }
  }
  return findings;
}
