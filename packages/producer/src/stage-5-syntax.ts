import type { ts as TypeScript } from 'ts-morph';
import { type Fields, sourceExtension } from './record-checks.ts';
import { openSyntaxReader, parseDiagnostics, type ProjectTools, syntaxParser } from './snapshot-project.ts';
import type { InventoryFile } from './stage-1-settings.ts';

// The syntax candidates that Stage 5 collect saves: module and class
// initialization, side-effect imports, and setup or registration calls in the
// JavaScript and TypeScript files of the saved graph scan scope, with the parser
// diagnostics, the skipped files and the omitted candidates. The snapshot project
// parses each file without compiler settings: the query reads syntax only.
type Ts = typeof TypeScript;
// A file of the saved graph scan scope and the graph contexts that list it.
export interface ScanFile { path: string; sha256: string; contextRefs: string[] }
// The parts of the checked Stage 5 state that the query reads.
export interface SyntaxState {
  header: Fields & { attemptId: string };
  graphRef: string;
  indexed: Map<string, InventoryFile>;
  // The folder of the saved snapshot, which the snapshot project reads.
  snapshotRoot: string;
  // The checked bytes of an indexed file of at most maxBytes.
  readIndexed(path: string, maxBytes: number): Buffer;
}
// ts-morph, with the TypeScript that the query uses, and the tool versions to record.
export interface SyntaxTools { tsMorph: ProjectTools; versions: { tsMorph: string; typescript: string } }
type RecordCandidate = (node: TypeScript.Node, kind: string, scope: string, details?: Fields) => void;
interface FileScan { ts: Ts; record: RecordCandidate }

export const syntaxLimits = { inputBytes: 2 * 1024 * 1024, perFile: 120, total: 2400, expressionChars: 400, diagnosticsPerFile: 50 };
const registrationNames = new Set([
  'addEventListener', 'afterAll', 'afterEach', 'After', 'AfterAll', 'AfterStep',
  'beforeAll', 'beforeEach', 'Before', 'BeforeAll', 'BeforeStep', 'defineParameterType',
  'Given', 'listen', 'on', 'once', 'register', 'registerCommand', 'setDefaultTimeout',
  'setDefinitionFunctionWrapper', 'setWorldConstructor', 'setup', 'subscribe', 'Then', 'use', 'When',
]);
const limits = [
  'Scope is the union of saved graph scan files. Context references show where each file was listed; no edges or traversals were merged.',
  'These are syntax candidates. No project, type, symbol, binding, module, or runtime effect analysis ran.',
  'Module-level candidates exclude nested function bodies. An initializer excerpt can still contain a function literal. Class static and instance-field syntax is labeled separately.',
  'Setup or registration candidates include nested calls with a matching spelling. Binding and execution remain unknown.',
  'Line ranges use CRLF, CR, and LF, like numbered excerpts. U+2028 and U+2029 do not increment the saved line numbers.',
  'Parser recovery can affect results. Omitted candidates, skipped files, and clipped expressions limit coverage.',
];

// The line of a position, counting only CRLF, CR and LF as line ends.
function physicalLineLookup(text: string): (position: number) => number {
  const starts = [0];
  for (const match of text.matchAll(/\r\n|\r|\n/g)) starts.push(match.index + match[0].length);
  return position => {
    const bounded = Math.min(position, Math.max(0, text.length - 1));
    let low = 0;
    let high = starts.length;
    while (high - low > 1) {
      const middle = (low + high) >>> 1;
      if ((starts[middle] as number) <= bounded) low = middle;
      else high = middle;
    }
    return low + 1;
  };
}

function callName(ts: Ts, node: TypeScript.CallExpression): string | undefined {
  const target = node.expression;
  if (ts.isIdentifier(target)) return target.text;
  if (ts.isPropertyAccessExpression(target)) return target.name.text;
  if (ts.isElementAccessExpression(target) && target.argumentExpression && ts.isStringLiteral(target.argumentExpression))
    return target.argumentExpression.text;
  return undefined;
}

// The computed name of a class member, which the class definition evaluates, or undefined.
function computedMemberName(ts: Ts, node: TypeScript.Node, lexicalScope: string): TypeScript.ComputedPropertyName | undefined {
  const { name } = node as TypeScript.Node & { name?: TypeScript.Node };
  return lexicalScope === 'class-definition-syntax' && name && ts.isComputedPropertyName(name) &&
    (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent)) ? name : undefined;
}

// A class: each extends expression is a candidate, and the members are class definition syntax.
function visitClass(scan: FileScan, node: TypeScript.ClassLikeDeclaration): void {
  const { ts, record } = scan;
  for (const clause of node.heritageClauses ?? [])
    if (clause.token === ts.SyntaxKind.ExtendsKeyword)
      for (const type of clause.types) record(type.expression, 'class-extends-expression', 'class-definition-syntax');
  ts.forEachChild(node, child => visit(scan, child, 'class-definition-syntax'));
}

// A field with an initializer: the initializer is a static or instance field candidate.
function visitField(scan: FileScan, node: TypeScript.PropertyDeclaration, initializer: TypeScript.Expression,
  computedName: TypeScript.Node | undefined, lexicalScope: string): void {
  const { ts, record } = scan;
  const isStatic = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false;
  const fieldScope = isStatic ? 'class-static-syntax' : 'instance-field-syntax';
  record(initializer, isStatic ? 'class-static-field-initializer' : 'instance-field-initializer', fieldScope);
  ts.forEachChild(node, child => visit(scan, child, child === computedName ? lexicalScope : fieldScope));
}

// The module-level candidates of a node: a side-effect import, a variable initializer or an expression statement.
function moduleLevelCandidates({ ts, record }: FileScan, node: TypeScript.Node, lexicalScope: string): void {
  if (ts.isImportDeclaration(node) && !node.importClause)
    record(node, 'side-effect-import', lexicalScope);
  if (ts.isVariableDeclaration(node) && node.initializer)
    record(node.initializer, 'module-variable-initializer', lexicalScope);
  if (ts.isExpressionStatement(node))
    record(node.expression, 'module-expression', lexicalScope);
}

function visit(scan: FileScan, node: TypeScript.Node, lexicalScope: string): void {
  const { ts, record } = scan;
  const computedName = computedMemberName(ts, node, lexicalScope);
  if (computedName) record(computedName.expression, 'class-computed-name', 'class-definition-syntax');
  if (ts.isFunctionLike(node)) {
    ts.forEachChild(node, child => visit(scan, child, child === computedName ? lexicalScope : 'nested-function-syntax'));
    return;
  }
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) { visitClass(scan, node); return; }
  if (ts.isClassStaticBlockDeclaration(node)) {
    record(node, 'class-static-block', 'class-static-syntax');
    ts.forEachChild(node, child => visit(scan, child, 'class-static-syntax'));
    return;
  }
  if (ts.isPropertyDeclaration(node) && node.initializer) {
    visitField(scan, node, node.initializer, computedName, lexicalScope);
    return;
  }
  if (lexicalScope === 'module-level-syntax') moduleLevelCandidates(scan, node, lexicalScope);
  if (ts.isCallExpression(node)) {
    const name = callName(ts, node);
    if (registrationNames.has(name as string)) record(node, 'setup-or-registration-call', lexicalScope, { name, binding: 'unknown' });
  }
  ts.forEachChild(node, child => visit(scan, child, lexicalScope));
}

// The candidates of one file, at most perFile of them, with the omitted candidates by kind.
function inspect(ts: Ts, found: { candidates: Fields[]; omissions: Fields[] }, attemptId: string,
  file: ScanFile, source: TypeScript.SourceFile): void {
  const lineAt = physicalLineLookup(source.text);
  let kept = 0;
  const omitted: Record<string, number> = {};
  const record: RecordCandidate = (node, kind, scope, details = {}) => {
    if (kept >= syntaxLimits.perFile || found.candidates.length >= syntaxLimits.total) {
      omitted[kind] = (omitted[kind] ?? 0) + 1;
      return;
    }
    kept++;
    const start = node.getStart(source);
    const end = node.getEnd();
    found.candidates.push({
      id: attemptId + '-syntax-' + (found.candidates.length + 1), path: file.path, sha256: file.sha256, kind, scope,
      lines: [lineAt(start), lineAt(Math.max(start, end - 1))],
      expression: source.text.slice(start, Math.min(end, start + syntaxLimits.expressionChars)),
      truncated: end - start > syntaxLimits.expressionChars, ...details,
    });
  };
  visit({ ts, record }, source, 'module-level-syntax');
  if (Object.keys(omitted).length) found.omissions.push({ path: file.path, candidatesByKind: omitted });
}

// The parser diagnostics of one file, at most diagnosticsPerFile of them.
function fileDiagnostics(ts: Ts, file: ScanFile, source: TypeScript.SourceFile): { saved: Fields[]; count: number } {
  const lineAt = physicalLineLookup(source.text);
  const parserDiagnostics = parseDiagnostics(source);
  const saved = parserDiagnostics.slice(0, syntaxLimits.diagnosticsPerFile).map(diagnostic => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    return { path: file.path, code: diagnostic.code, line: diagnostic.start === undefined ? null : lineAt(diagnostic.start),
      message: message.slice(0, 500), messageTruncated: message.length > 500 };
  });
  return { saved, count: parserDiagnostics.length };
}

// Parses each file of the saved scan scope once with the snapshot project. A file
// that is not JavaScript or TypeScript, is over the input byte limit or is not UTF-8
// text is skipped with a reason; these checks read the file before the project does.
// Lines come from the text that the parser read.
export function syntaxCandidates(state: SyntaxState, scope: { syntaxScope: ScanFile[] }, { tsMorph, versions }: SyntaxTools): Fields {
  const { ts } = tsMorph;
  const parse = openSyntaxReader({ files: [...state.indexed.values()], snapshotRoot: state.snapshotRoot }, tsMorph);
  const found = { candidates: [] as Fields[], omissions: [] as Fields[] };
  const diagnostics: Fields[] = [];
  const scanned: Fields[] = [];
  const skipped: Fields[] = [];
  for (const file of scope.syntaxScope) {
    if (!sourceExtension.test(file.path)) { skipped.push({ path: file.path, reason: 'not-js-ts' }); continue; }
    if ((state.indexed.get(file.path) as InventoryFile).bytes > syntaxLimits.inputBytes) {
      skipped.push({ path: file.path, reason: 'input-byte-limit' });
      continue;
    }
    const bytes = state.readIndexed(file.path, syntaxLimits.inputBytes);
    const value = bytes.toString('utf8');
    if (!Buffer.from(value).equals(bytes)) { skipped.push({ path: file.path, reason: 'invalid-utf8' }); continue; }
    parse(file.path, source => {
      const { saved, count } = fileDiagnostics(ts, file, source);
      diagnostics.push(...saved);
      scanned.push({ ...file, parserDiagnostics: count, omittedDiagnostics: Math.max(0, count - syntaxLimits.diagnosticsPerFile) });
      inspect(ts, found, state.header.attemptId, file, source);
    });
  }
  return { ...state.header, graphRef: state.graphRef,
    parser: { name: syntaxParser, tsMorph: versions.tsMorph, typescript: versions.typescript }, scope: scanned, skipped,
    candidates: found.candidates, diagnostics, omissions: found.omissions, limits };
}
