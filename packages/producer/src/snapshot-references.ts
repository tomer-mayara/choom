import type * as TsMorph from 'ts-morph';
import { assert } from './record-checks.ts';
import { nodeRange, type SourcePosition, topLevelNames } from './snapshot-exports.ts';
import { type SnapshotProject, snapshotPath, virtualRoot } from './snapshot-project.ts';

// The references to one symbol of a source file of the snapshot project, from the
// TypeScript type checker. The symbol is an export name of the file (default for
// the default export), else the name of a top-level declaration of the file. Each
// alias is followed to the declaration that it names: a renamed import or export,
// export * from, a namespace import, a default import and a JavaScript require that
// the compiler resolves. The local names that a destructuring of a module object
// binds are followed too. The query searches the files that the project holds; the
// compiler can read other indexed files to resolve imports, but they are not searched.
// Each reference is one site outside the declarations of the symbol:
// - import: an import, import = or JavaScript require that binds a local name to it;
// - re-export: an export list entry, export default, export = or export * from that exports it;
// - type: a use in a type; call: a call, new, tagged template, decorator or JSX element
//   that it starts; value: any other use, such as a destructuring that takes it.
// localName is the name that the site uses: the local name of an import or a
// destructuring, the export name of a re-export, or the name expression of another
// use, such as billing.createInvoice.
type Ts = typeof TsMorph.ts;
type Node = TsMorph.ts.Node;
type SourceFile = TsMorph.ts.SourceFile;
type TsSymbol = TsMorph.ts.Symbol;
export type ReferenceKind = 'call' | 'type' | 'import' | 're-export' | 'value';
export type SourceRange = [SourcePosition, SourcePosition];
export interface SymbolReference { path: string; range: SourceRange; kind: ReferenceKind; localName: string }
export interface SymbolDeclaration { path: string; range: SourceRange }
export interface SymbolReferences { declarations: SymbolDeclaration[]; references: SymbolReference[] }
// The checker and the declared symbol that the query compares each name with. A
// destructuring that takes the symbol from a module object binds a local name: the
// query keeps the binding element and the declared symbol of that local name.
interface Query {
  ts: Ts; checker: TsMorph.ts.TypeChecker; target: TsSymbol;
  destructured: Set<Node>; bindings: Set<TsSymbol>;
}
export type Checking = Pick<Query, 'ts' | 'checker'>;
// A site: the node whose range the record saves, its kind and the local name.
interface Site { node: Node; kind: ReferenceKind; localName: string }

// The declared symbol that a symbol names after its aliases, or undefined when an alias names nothing.
export function declared({ ts, checker }: Checking, symbol: TsSymbol | undefined): TsSymbol | undefined {
  if (symbol === undefined) return undefined;
  const resolved = checker.getExportSymbolOfSymbol(symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  return resolved.declarations?.length ? resolved : undefined;
}

// The symbol that the query looks for: the export of the file with that name, else its top-level declaration.
function targetSymbol(query: Checking, source: SourceFile, path: string, name: string): TsSymbol {
  const { ts, checker } = query;
  const module = checker.getSymbolAtLocation(source);
  const exported = module === undefined ? undefined
    : checker.getExportsOfModule(module).find(item => item.name === name) ?? module.exports?.get(ts.escapeLeadingUnderscores(name));
  const symbol = exported ?? topLevelNames(ts, source).filter(node => node.text === name)
    .map(node => checker.getSymbolAtLocation(node)).find(item => item !== undefined);
  assert(symbol, `No top-level declaration or export named ${name} in ${path}.`);
  const target = declared(query, symbol);
  assert(target !== undefined && (target.declarations ?? []).every(item => item.getSourceFile().fileName.startsWith(virtualRoot + '/')),
    `The export ${name} of ${path} does not name a declaration in the snapshot.`);
  return target;
}

// Whether a symbol names the symbol of the query, or a local name that a destructuring binds to it.
function refersToTarget(query: Query, symbol: TsSymbol | undefined): boolean {
  const resolved = declared(query, symbol);
  return resolved !== undefined && (resolved === query.target || query.bindings.has(resolved));
}

// Keeps each element of an object binding pattern of the file that takes the symbol
// from a module object, such as const { createInvoice } = await import('./invoice'),
// and the local name that it binds. A JavaScript require that binds an alias is an import.
function collectDestructurings(query: Query, source: SourceFile): void {
  const { ts, checker } = query;
  const visit = (node: Node): void => {
    if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && ts.isIdentifier(node.name)) {
      const local = checker.getSymbolAtLocation(node.name);
      const property = node.propertyName ?? node.name;
      const name = ts.isIdentifier(property) || ts.isStringLiteral(property) ? property.text : undefined;
      const taken = name === undefined ? undefined : checker.getPropertyOfType(checker.getTypeAtLocation(node.parent), name);
      const bound = declared(query, local);
      if (bound !== undefined && !((local?.flags ?? 0) & ts.SymbolFlags.Alias) && declared(query, taken) === query.target) {
        query.destructured.add(node);
        query.bindings.add(bound);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// The symbol that a name refers to. A shorthand property and an export list entry
// without a module refer to their local value. For a name that an import binds,
// it is the local symbol of the import, not the declaration that the import names.
export function symbolAt({ ts, checker }: Checking, name: Node): TsSymbol | undefined {
  const parent = name.parent;
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === name) return checker.getShorthandAssignmentValueSymbol(parent);
  if (ts.isExportSpecifier(parent) && parent.parent.parent.moduleSpecifier === undefined)
    return checker.getExportSpecifierLocalTargetSymbol(parent);
  return checker.getSymbolAtLocation(name);
}

// The whole name expression that ends with a name: billing.createInvoice for createInvoice.
function nameExpression(ts: Ts, name: Node): Node {
  let current = name;
  for (let parent = current.parent; ; parent = current.parent) {
    if ((ts.isPropertyAccessExpression(parent) && parent.name === current) ||
      (ts.isElementAccessExpression(parent) && parent.argumentExpression === current) ||
      (ts.isQualifiedName(parent) && parent.right === current)) current = parent;
    else return current;
  }
}

// A name, a member of a name or a qualified name, with no call or other expression in it.
function namePath(ts: Ts, node: Node): boolean {
  if (ts.isIdentifier(node)) return true;
  if (ts.isPropertyAccessExpression(node)) return namePath(ts, node.expression);
  if (ts.isElementAccessExpression(node)) return ts.isStringLiteral(node.argumentExpression) && namePath(ts, node.expression);
  return ts.isQualifiedName(node) && namePath(ts, node.left);
}

// The expression that a call would start, through parentheses and type assertions.
function outerExpression(ts: Ts, expression: Node): Node {
  let current = expression;
  for (let parent = current.parent; (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) ||
    ts.isSatisfiesExpression(parent) || ts.isNonNullExpression(parent) || ts.isTypeAssertionExpression(parent)) &&
    parent.expression === current; parent = current.parent) current = parent;
  return current;
}

function starts(ts: Ts, expression: Node): boolean {
  const callee = outerExpression(ts, expression);
  const parent = callee.parent;
  return ((ts.isCallExpression(parent) || ts.isNewExpression(parent) || ts.isDecorator(parent)) && parent.expression === callee) ||
    (ts.isTaggedTemplateExpression(parent) && parent.tag === callee) ||
    ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) && parent.tagName === expression);
}

// Whether a name expression is in a type. A class extends clause names a value.
function inType(ts: Ts, holder: Node): boolean {
  if (!ts.isTypeNode(holder)) return false;
  if (!ts.isExpressionWithTypeArguments(holder)) return true;
  const clause = holder.parent;
  return ts.isHeritageClause(clause) && !(clause.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(clause.parent));
}

// The import or export site of a name, or undefined for any other use.
function bindingSite({ ts, checker }: Query, expression: Node, holder: Node): Site | undefined {
  const text = (node: { text: string }): string => node.text;
  if (ts.isImportSpecifier(holder)) return { node: holder, kind: 'import', localName: text(holder.name) };
  if (ts.isExportSpecifier(holder)) return { node: holder, kind: 're-export', localName: text(holder.name) };
  if (ts.isImportClause(holder) && ts.isIdentifier(expression)) return { node: expression, kind: 'import', localName: expression.text };
  if (ts.isImportEqualsDeclaration(holder)) return { node: holder.name, kind: 'import', localName: holder.name.text };
  if (ts.isExportAssignment(holder)) return { node: expression, kind: 're-export', localName: holder.isExportEquals ? 'export=' : 'default' };
  // A JavaScript require that the compiler reads as an import binds an alias.
  const bound = ts.isBindingElement(holder) || ts.isVariableDeclaration(holder) ? holder.name : undefined;
  if (bound !== undefined && ts.isIdentifier(bound) && ((checker.getSymbolAtLocation(bound)?.flags ?? 0) & ts.SymbolFlags.Alias))
    return { node: ts.isBindingElement(holder) ? holder : bound, kind: 'import', localName: bound.text };
  return undefined;
}

// The site of a name that refers to the symbol, or undefined for a name that a site does not use.
function siteOf(query: Query, source: SourceFile, name: Node & { text: string }): Site | undefined {
  const { ts } = query;
  const expression = nameExpression(ts, name);
  const holder = expression.parent;
  // The closing tag of a JSX element repeats the name of its opening tag.
  if (ts.isJsxClosingElement(holder)) return undefined;
  const binding = bindingSite(query, expression, holder);
  if (binding !== undefined) return binding;
  const localName = namePath(ts, expression) ? expression.getText(source) : name.text;
  if (inType(ts, holder)) return { node: expression, kind: 'type', localName };
  return { node: expression, kind: starts(ts, expression) ? 'call' : 'value', localName };
}

// The names that export * from re-exports as the symbol, when the file exports them.
function starSites({ ts, checker, target }: Query, source: SourceFile, statement: TsMorph.ts.ExportDeclaration): Site[] {
  const query = { ts, checker };
  const from = statement.moduleSpecifier === undefined ? undefined : checker.getSymbolAtLocation(statement.moduleSpecifier);
  const own = checker.getSymbolAtLocation(source);
  if (statement.exportClause !== undefined || from === undefined || own === undefined) return [];
  return checker.getExportsOfModule(from).filter(item => item.name !== 'default' && declared(query, item) === target &&
    declared(query, checker.tryGetMemberInModuleExports(item.name, own)) === target)
    .map(item => ({ node: statement, kind: 're-export', localName: item.name }));
}

// The sites of a file that use the symbol, in source order. The two names of an
// import or export entry such as createInvoice as ci give one site. A destructuring
// that takes the symbol is a value site at the property name, and localName is the
// local name that it binds.
function sitesIn(query: Query, source: SourceFile): Site[] {
  const { ts, target, destructured } = query;
  const declarationNames = new Set((target.declarations ?? []).map(item => ts.getNameOfDeclaration(item)));
  const sites = new Map<string, Site>();
  const add = (site: Site): void => {
    const key = site.node.getStart(source) + ':' + site.node.end + ':' + site.localName;
    if (!sites.has(key)) sites.set(key, site);
  };
  const visit = (node: Node): void => {
    if (ts.isExportDeclaration(node)) starSites(query, source, node).forEach(add);
    if (ts.isBindingElement(node) && destructured.has(node))
      add({ node: node.propertyName ?? node.name, kind: 'value', localName: (node.name as TsMorph.ts.Identifier).text });
    const name = ts.isIdentifier(node) || (ts.isStringLiteral(node) && ts.isElementAccessExpression(node.parent)) ? node : undefined;
    if (name !== undefined && !declarationNames.has(name) && !destructured.has(name.parent) && refersToTarget(query, symbolAt(query, name))) {
      const site = siteOf(query, source, name);
      if (site !== undefined) add(site);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...sites.values()].sort((a, b) => a.node.getStart(source) - b.node.getStart(source));
}

// The compiler program of the files that the project holds. The compiler gives each
// file the module format of its extension, and under Node16 and NodeNext of the type
// of its nearest package.json, and resolves its imports in that format. ts-morph leaves
// the format unset, which the compiler reads as CommonJS, so the query sets it before
// the program exists. A file that the compiler reads only to resolve an import has no format.
export function referenceProgram({ ts, project }: SnapshotProject): TsMorph.ts.Program {
  const options = project.compilerOptions.get();
  const packageFiles = ts.createModuleResolutionCache(virtualRoot, name => name, options).getPackageJsonInfoCache();
  for (const file of project.getSourceFiles()) {
    const source = file.compilerNode;
    source.impliedNodeFormat ??= ts.getImpliedNodeFormatForFile(source.fileName, packageFiles, project.getModuleResolutionHost(),
      options);
  }
  return project.getProgram().compilerObject;
}

// The syntax tree of a file that the project holds, as the program of the query reads it.
export function programFile(snapshot: SnapshotProject, path: string): SourceFile {
  const source = referenceProgram(snapshot).getSourceFile(virtualRoot + '/' + path);
  assert(source, 'The program of the query does not hold ' + path + '.');
  return source;
}

// Whether the compiler settings resolve a module name of a file of the program to a
// file, in the resolution mode of its use, as the program does.
export function resolvesModuleName(snapshot: SnapshotProject, name: TsMorph.ts.StringLiteralLike): boolean {
  const program = referenceProgram(snapshot);
  const source = name.getSourceFile();
  return snapshot.ts.resolveModuleName(name.text, source.fileName, program.getCompilerOptions(),
    snapshot.project.getModuleResolutionHost(), undefined, undefined, program.getModeForUsageLocation(source, name))
    .resolvedModule !== undefined;
}

// The declarations of the symbol named in the file at path, and its references in
// the files that the project holds, by path and then in source order.
export function findReferences(snapshot: SnapshotProject, path: string, symbol: string): SymbolReferences {
  const { ts } = snapshot;
  const file = snapshot.sourceFile(path).getFilePath();
  const searched = snapshot.project.getSourceFiles().map(item => item.getFilePath() as string).sort();
  const program = referenceProgram(snapshot);
  const checker = program.getTypeChecker();
  const target = targetSymbol({ ts, checker }, program.getSourceFile(file) as SourceFile, path, symbol);
  const query: Query = { ts, checker, target, destructured: new Set(), bindings: new Set() };
  const declarations = (target.declarations ?? []).map(item =>
    ({ path: snapshotPath(item.getSourceFile().fileName), range: nodeRange(item.getSourceFile(), item) }));
  const sources = searched.map(name => program.getSourceFile(name) as SourceFile);
  // A local name can be used before its destructuring in the file, or in another file.
  for (const source of sources) collectDestructurings(query, source);
  const references = sources.flatMap(source => sitesIn(query, source).map(({ node, kind, localName }) =>
    ({ path: snapshotPath(source.fileName), range: nodeRange(source, node), kind, localName })));
  return { declarations, references };
}
