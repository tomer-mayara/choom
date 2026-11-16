import type * as TsMorph from 'ts-morph';
import { assert, hash, sourceExtension } from './record-checks.ts';
import { type SourcePosition, sourcePosition, topLevelNames } from './snapshot-exports.ts';
import { parseDiagnostics, snapshotPath } from './snapshot-project.ts';

// The code units that symbol selectors make of one source file. A code unit is a
// file or a recorded part of a file. divideFile finds the parts in the syntax tree
// of the file and runs no code:
// - Each named symbol is one unit. Its ranges hold each top-level declaration of the
//   name, with the comments directly above it, with no blank line between, and the
//   comments after it on its last line. Declarations of the name that follow each
//   other, such as the overloads of a function, share one range.
// - An anonymous default export (export default function () {}, export default
//   class {} or export default with a value) is the symbol default. A named default
//   export is the symbol of its name.
// - All other text is the rest: module setup such as imports, the other statements,
//   comments and white space.
// The ranges cover the text that the parser read, with no gap and no overlap. They
// use 1-based lines and columns, from the first character to the position after the
// last one, and a byte order mark is not counted.
type Ts = typeof TsMorph.ts;
type SourceFile = TsMorph.ts.SourceFile;
type Statement = TsMorph.ts.Statement;
export type SourceRange = [SourcePosition, SourcePosition];
export interface SymbolPart { symbol: string; ranges: SourceRange[] }
// The parts of a file, the symbols in file order. The rest is empty when the symbols hold all text.
export interface FileDivision { symbols: SymbolPart[]; rest: SourceRange[] }
// The path selectors of a component membership.
export interface PathSelectors { paths?: readonly string[]; excludePaths?: readonly string[] }
export interface RestOwner { owner: unknown; reason?: 'no-path-owner' }
// The inventory record of a saved file: its size in bytes and its SHA-256 digest.
export interface SavedFile { bytes: number; sha256: string }
// The start offset and the end offset of a part of the text.
type Span = [number, number];

// The input limit of the Stage 5 syntax query.
const sourceLimit = 2 * 1024 * 1024;
const anonymousDefaultName = 'default';

// The saved bytes of a file that symbols divide. The file must be JavaScript or
// TypeScript, at most 2 MiB and UTF-8 text, and the bytes that `read` gives must
// have the inventory digest. The record checks and the Stage 5 parts action refuse
// the same files with the same messages.
export function dividedFileBytes(path: string, file: SavedFile, read: (path: string, limit: number) => Buffer): Buffer {
  const cannot = (reason: string): string => `The symbol selectors cannot divide ${path}: ${reason}`;
  assert(sourceExtension.test(path), cannot('the file is not JavaScript or TypeScript.'));
  assert(file.bytes <= sourceLimit, cannot('the file is larger than 2 MiB.'));
  const bytes = read(path, sourceLimit);
  assert(hash(bytes) === file.sha256, 'Changed source file: ' + path);
  assert(Buffer.from(bytes.toString('utf8')).equals(bytes), cannot('the file is not UTF-8 text.'));
  return bytes;
}

const lineBreaks =(text: string): number => text.match(/\r\n|[\r\n\u2028\u2029]/g)?.length ?? 0;

// The top-level statement that holds a node.
function topStatement(source: SourceFile, node: TsMorph.ts.Node): Statement {
  let current = node;
  while (current.parent !== source) current = current.parent;
  return current as Statement;
}

function anonymousDefault(ts: Ts, statement: Statement): boolean {
  if (ts.isExportAssignment(statement)) return !statement.isExportEquals;
  if (!ts.isFunctionDeclaration(statement) && !ts.isClassDeclaration(statement)) return false;
  return statement.name === undefined &&
    (ts.getModifiers(statement) ?? []).some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);
}

// The names that each top-level statement declares. An import names a declaration of
// another file, so it declares no name here.
function declaredNames(ts: Ts, source: SourceFile): Map<Statement, string[]> {
  const names = new Map<Statement, string[]>();
  for (const name of topLevelNames(ts, source)) {
    const statement = topStatement(source, name);
    names.set(statement, [...names.get(statement) ?? [], name.text]);
  }
  for (const statement of source.statements)
    if (anonymousDefault(ts, statement)) names.set(statement, [anonymousDefaultName]);
  return names;
}

// Where the part of a statement starts: at the comments directly above it, or at the statement.
function partStart(ts: Ts, source: SourceFile, statement: Statement): number {
  let start = statement.getStart(source);
  for (const comment of [...ts.getLeadingCommentRanges(source.text, statement.pos) ?? []].reverse()) {
    if (lineBreaks(source.text.slice(comment.end, start)) > 1) break;
    start = comment.pos;
  }
  return start;
}

// Where the part of a statement ends: after the comments on its last line, or at its end.
function partEnd(ts: Ts, source: SourceFile, statement: Statement): number {
  return ts.getTrailingCommentRanges(source.text, statement.end)?.at(-1)?.end ?? statement.end;
}

// The spans of one symbol: one span for each run of statements that declare it and follow each other.
function symbolSpans(ts: Ts, source: SourceFile, declared: Map<Statement, string[]>, symbol: string): Span[] {
  const path = snapshotPath(source.fileName);
  const spans: Span[] = [];
  let previous = -2;
  source.statements.forEach((statement, index) => {
    const names = declared.get(statement) ?? [];
    if (!names.includes(symbol)) return;
    assert(names.length === 1, `The symbol selector ${symbol} of ${path} names a declaration with several names: ` +
      `${names.join(', ')}. A symbol needs a declaration of one name.`);
    const last = spans.at(-1);
    if (last !== undefined && index === previous + 1) last[1] = partEnd(ts, source, statement);
    else spans.push([partStart(ts, source, statement), partEnd(ts, source, statement)]);
    previous = index;
  });
  assert(spans.length > 0, `The symbol selector ${symbol} of ${path} matched nothing: ` +
    'the file has no top-level declaration with that name.');
  return spans;
}

// The text that no symbol holds: the spans before, between and after the symbol spans.
function restSpans(length: number, symbolSpans: readonly Span[]): Span[] {
  const rest: Span[] = [];
  let cursor = 0;
  for (const [start, end] of [...symbolSpans].sort((first, second) => first[0] - second[0])) {
    if (start > cursor) rest.push([cursor, start]);
    cursor = end;
  }
  if (cursor < length) rest.push([cursor, length]);
  return rest;
}

// Divides a parsed source file by the named top-level symbols. A file with syntax
// errors, a name that is not a top-level declaration of the file and a declaration
// with several names stop the division, with a message that names the file.
export function divideFile(ts: Ts, source: SourceFile, symbolNames: readonly string[]): FileDivision {
  assert(parseDiagnostics(source).length === 0,
    `The symbol selectors cannot divide ${snapshotPath(source.fileName)}: the file has syntax errors.`);
  const declared = declaredNames(ts, source);
  const parts = [...new Set(symbolNames)].map(symbol => ({ symbol, spans: symbolSpans(ts, source, declared, symbol) }))
    .sort((first, second) => (first.spans[0] as Span)[0] - (second.spans[0] as Span)[0]);
  const range = ([start, end]: Span): SourceRange => [sourcePosition(source, start), sourcePosition(source, end)];
  return { symbols: parts.map(({ symbol, spans }) => ({ symbol, ranges: spans.map(range) })),
    rest: restSpans(source.text.length, parts.flatMap(part => part.spans)).map(range) };
}

const selects = (path: string, selector: string): boolean =>
  selector.endsWith('/**') ? path.startsWith(selector.slice(0, -2)) : path === selector;

// The components whose path selectors select a file: an exact path or a subtree
// that ends in /**, less the excluded paths.
export function pathOwners(path: string, memberships: ReadonlyMap<unknown, PathSelectors>): unknown[] {
  return [...memberships].filter(([, { paths = [], excludePaths = [] }]) => paths.some(selector => selects(path, selector)) &&
    !excludePaths.some(selector => selects(path, selector))).map(([id]) => id);
}

// The owner of the rest of a divided file: the one component whose path selectors
// select the file, or null with the reason no-path-owner.
export function restOwner(path: string, memberships: ReadonlyMap<unknown, PathSelectors>): RestOwner {
  const owners = pathOwners(path, memberships);
  assert(owners.length < 2, 'Mapping and direct membership differ: ' + path);
  return owners.length === 1 ? { owner: owners[0] } : { owner: null, reason: 'no-path-owner' };
}
