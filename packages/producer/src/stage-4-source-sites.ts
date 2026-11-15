import type { ts as TypeScript } from 'ts-morph';
import type { Fields } from './record-checks.ts';
import { openSyntaxReader, parseDiagnostics, type ProjectTools } from './snapshot-project.ts';
import type { SnapshotFiles } from './stage-1-settings.ts';

// The source sites that Stage 4 collect saves: the import and re-export syntax,
// the dynamic imports, the require calls and the candidate resource calls of each
// JavaScript and TypeScript file of the graph profile scope, with the parser
// diagnostics. The snapshot project parses each file without compiler settings:
// the query reads syntax only.
type Ts = typeof TypeScript;
export interface SourceFile { path: string; sha256: string }
export interface SiteInputs {
  attemptId: string;
  snapshotRef: unknown;
  sourceFiles: SourceFile[];
  // The indexed files of the saved snapshot and its folder, which the snapshot project reads.
  snapshot: SnapshotFiles;
  // Checks an indexed source file before the project reads it. A changed file or a
  // file that is not UTF-8 text stops the query with the message of the check.
  check(path: string): void;
  // ts-morph, with the TypeScript that the query uses.
  tsMorph: ProjectTools;
  // The record of the parser and its tool versions.
  parser: Fields;
}
// The kind of a site, its literal specifier or null, and its type-only and dynamic flags.
type Site = [kind: string, specifier: string | null, typeOnly: boolean | null, dynamic: boolean | null];

const siteLimit = 10000;
const expressionLimit = 4096;
const resourceCalls = new Set(['fetch', 'invoke', 'readFile', 'readFileSync', 'writeFile', 'writeFileSync',
  'appendFile', 'appendFileSync', 'open', 'openSync', 'mkdir', 'mkdirSync', 'rm', 'unlink',
  'readTextFile', 'writeTextFile', 'readDir', 'getItem', 'setItem', 'removeItem', 'query',
  'execute', 'connect', 'send', 'publish', 'subscribe']);
const limits = ['Source syntax only; no bindings, type checking, alias resolution, or runtime execution.',
  'Named import and export specifiers can each be type-only even when the whole statement is not; inspect the saved expression.',
  'Call names can be shadowed. Resource calls are candidates, not proven resource access or ownership.',
  'Site and excerpt line numbers use CRLF, CR, and LF. U+2028 and U+2029 do not increment saved line numbers.',
  'Diagnostic start and length are UTF-16 offsets in the text that the parser read, which leaves out a byte order mark at the start of a file.',
  'The query covers only the recorded JavaScript and TypeScript scope. Rust, excluded inputs, and other loading mechanisms remain outside it.',
  'At most 10000 sites and 4096 expression code units per site are saved. Truncation is explicit.',
  'Tool reads are not LLM source inspections.'];

// The line of a position, counting only CRLF, CR and LF as line ends.
function lineLookup(text: string): (position: number) => number {
  const lineStarts = [0];
  for (const match of text.matchAll(/\r\n|\r|\n/g)) lineStarts.push(match.index + match[0].length);
  return position => {
    let low = 0; let high = lineStarts.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if ((lineStarts[middle] as number) <= position) low = middle;
      else high = middle;
    }
    return low + 1;
  };
}

const literal = (ts: Ts, value: TypeScript.Node | undefined): string | null =>
  value && ts.isStringLiteral(value) ? value.text : null;

// The site of an import, re-export or import-equals declaration or an import type, or undefined.
function declarationSite(ts: Ts, node: TypeScript.Node): Site | undefined {
  if (ts.isImportDeclaration(node))
    return ['import', literal(ts, node.moduleSpecifier), Boolean(node.importClause?.isTypeOnly), false];
  if (ts.isExportDeclaration(node) && node.moduleSpecifier)
    return ['re-export', literal(ts, node.moduleSpecifier), node.isTypeOnly, false];
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
    return ['import-equals', literal(ts, node.moduleReference.expression), node.isTypeOnly, false];
  if (ts.isImportTypeNode(node))
    return ['import-type', literal(ts, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined), true, false];
  return undefined;
}

// The site of a dynamic import, a require or require.resolve call or a candidate resource call, or undefined.
function callSite(ts: Ts, node: TypeScript.CallExpression, source: TypeScript.SourceFile): Site | undefined {
  const callee = node.expression;
  const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
  const value = node.arguments[0];
  const specifier = value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) ? value.text : null;
  if (callee.kind === ts.SyntaxKind.ImportKeyword) return ['dynamic-import', specifier, false, true];
  if (ts.isIdentifier(callee) && name === 'require') return ['require-candidate', specifier, false, false];
  if (ts.isPropertyAccessExpression(callee) && callee.expression.getText(source) === 'require' && name === 'resolve')
    return ['require-resolve-candidate', specifier, null, false];
  if (resourceCalls.has(name as string)) return ['resource-call-candidate', null, null, null];
  return undefined;
}

// Parses each file of the scope once with the snapshot project, after its check, and
// saves its sites and its parser diagnostics. Lines come from the text that the parser read.
export function sourceSites({ attemptId, snapshotRef, sourceFiles, snapshot, check, tsMorph, parser }: SiteInputs): Fields {
  const { ts } = tsMorph;
  const parse = openSyntaxReader(snapshot, tsMorph);
  const sites: Fields[] = []; const diagnostics: Fields[] = []; let omittedSites = 0;
  for (const file of sourceFiles) {
    check(file.path);
    parse(file.path, source => {
      const lineAt = lineLookup(source.text);
      for (const diagnostic of parseDiagnostics(source))
        diagnostics.push({ path: file.path, code: diagnostic.code, start: diagnostic.start ?? null, length: diagnostic.length ?? null,
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') });
      const record = (node: TypeScript.Node, [kind, specifier, typeOnly, dynamic]: Site): void => {
        if (sites.length >= siteLimit) { omittedSites++; return; }
        const expression = node.getText(source);
        sites.push({ id: attemptId + '-site-' + (sites.length + 1), path: file.path, sha256: file.sha256,
          lines: [lineAt(node.getStart(source)), lineAt(Math.max(node.getStart(source), node.end - 1))],
          kind, specifier, typeOnly, dynamic, expression: expression.slice(0, expressionLimit), truncated: expression.length > expressionLimit });
      };
      const visit = (node: TypeScript.Node): void => {
        const site = declarationSite(ts, node) ?? (ts.isCallExpression(node) ? callSite(ts, node, source) : undefined);
        if (site) record(node, site);
        ts.forEachChild(node, visit);
      };
      visit(source);
    });
  }
  return { formatVersion: 1, snapshotRef, status: omittedSites || diagnostics.length ? 'partial' : 'completed',
    scope: sourceFiles, parser, sites, diagnostics, omittedSites, limits };
}
