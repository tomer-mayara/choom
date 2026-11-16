import type * as TsMorph from 'ts-morph';
import { divideFile, type SourceRange } from './code-units.ts';
import { assert } from './record-checks.ts';
import { type SourcePosition, sourcePosition } from './snapshot-exports.ts';
import { type Checking, symbolAt } from './snapshot-references.ts';
import { type FileSite, fileSites } from './stage-4-source-sites.ts';

// The dependencies of the parts of a divided file. The symbols divide the file as
// the symbol selectors do (divideFile): one part for each symbol and one rest part
// for all other text. A dependency is a loading site of the file, as Stage 4
// collect lists them: an import, a re-export, an import =, an import type, a dynamic
// import, and a require or require.resolve call. Each dependency is in one part or
// at file level: it is never left out and never in two places.
// - A site that binds local names belongs to the part that holds all the uses of
//   those names. Such a site is an import declaration, an import = with a module, or
//   a JavaScript require that the compiler reads as an import. The type checker finds
//   the uses: a use is a name that refers to the local symbol that the site binds,
//   so another declaration with the same name is not a use. The export of an
//   exported import = is a use where the declaration is. A type-only import follows
//   the same rule. A site with uses in several parts stays at file level with the
//   reason shared, and a site with no use with the reason unreferenced.
// - An import that binds no name, such as import './setup', loads its module for
//   its effects, and a site with a computed module name, such as import(name) or
//   require(name), can load any module. The query cannot tell which part needs them,
//   so they stay at file level with the reason not-resolved.
// - Any other site belongs to the part that holds it: a re-export, which is always
//   in the rest, and a dynamic import, require, require.resolve or import type with
//   a literal module name.
type Ts = typeof TsMorph.ts;
type Node = TsMorph.ts.Node;
type SourceFile = TsMorph.ts.SourceFile;
type Identifier = TsMorph.ts.Identifier;
export type PartName = { unitKind: 'symbol'; symbol: string } | { unitKind: 'rest' };
// A loading site of the file, its index in all the sites of the file, and the local names that it binds.
export interface Dependency extends FileSite { order: number; localNames: string[] }
export interface DividedPart { part: PartName; ranges: SourceRange[]; dependencies: Dependency[] }
export type FileReason = 'shared' | 'unreferenced' | 'not-resolved';
// A dependency at file level. usedIn lists the parts that use a shared dependency, in part order.
export interface FileDependency extends Dependency { reason: FileReason; usedIn?: PartName[] }
// The parts, the symbols in file order and then the rest, and the dependencies at file level, in source order.
export interface PartDependencies { parts: DividedPart[]; fileDependencies: FileDependency[] }
interface FileLevel { reason: FileReason; usedIn?: DividedPart[] }

const before = (first: SourcePosition, second: SourcePosition): boolean =>
  first.line < second.line || (first.line === second.line && first.column < second.column);

// The part whose ranges hold a position. The ranges of the parts cover the file with no gap and no overlap.
function partHolding(parts: DividedPart[], position: SourcePosition): DividedPart {
  const part = parts.find(({ ranges }) => ranges.some(([start, end]) => !before(position, start) && before(position, end)));
  assert(part, `No part of the file holds line ${position.line}, column ${position.column}.`);
  return part;
}

const exported = (ts: Ts, node: TsMorph.ts.ImportEqualsDeclaration): boolean =>
  (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);

// The local names that a site binds: the names of an import clause, the name of an
// import =, and the names that a JavaScript require binds when the compiler reads it as an import.
function boundNames({ ts, checker }: Checking, node: Node): Identifier[] {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    const named = clause?.namedBindings;
    const imported = named === undefined ? [] : ts.isNamespaceImport(named) ? [named.name] : named.elements.map(item => item.name);
    return [...clause?.name === undefined ? [] : [clause.name], ...imported];
  }
  if (ts.isImportEqualsDeclaration(node)) return [node.name];
  const declaration = node.parent;
  if (!ts.isCallExpression(node) || !ts.isVariableDeclaration(declaration) || declaration.initializer !== node) return [];
  const names = ts.isIdentifier(declaration.name) ? [declaration.name] : ts.isObjectBindingPattern(declaration.name)
    ? declaration.name.elements.flatMap(item => ts.isIdentifier(item.name) ? [item.name] : []) : [];
  return names.filter(name => (checker.getSymbolAtLocation(name)?.flags ?? 0) & ts.SymbolFlags.Alias);
}

// The parts that use the names of each site that binds names, from one walk over the names of the file.
function partsUsing(checking: Checking, source: SourceFile, bound: Map<Dependency, Identifier[]>,
  partAt: (node: Node) => DividedPart): Map<Dependency, Set<DividedPart>> {
  const { ts, checker } = checking;
  const owners = new Map<TsMorph.ts.Symbol, Dependency>();
  const declarations = new Set<Node>();
  const uses = new Map<Dependency, Set<DividedPart>>();
  for (const [dependency, names] of bound) {
    uses.set(dependency, new Set(ts.isImportEqualsDeclaration(dependency.node) && exported(ts, dependency.node)
      ? [partAt(dependency.node)] : []));
    for (const name of names) {
      declarations.add(name);
      const symbol = checker.getSymbolAtLocation(name);
      if (symbol !== undefined) owners.set(symbol, dependency);
    }
  }
  const texts = new Set([...bound.values()].flat().map(name => name.text));
  const visit = (node: Node): void => {
    // Only a name with the text of a bound name can refer to its symbol. The checker decides whether it does.
    if (ts.isIdentifier(node) && texts.has(node.text) && !declarations.has(node)) {
      const symbol = symbolAt(checking, node);
      const dependency = symbol === undefined ? undefined : owners.get(symbol);
      if (dependency !== undefined) uses.get(dependency)?.add(partAt(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return uses;
}

// The part of a dependency, or the reason that it stays at file level. used is
// undefined for a site that binds no name.
function placement(dependency: Dependency, used: Set<DividedPart> | undefined, parts: DividedPart[],
  partAt: (node: Node) => DividedPart): DividedPart | FileLevel {
  const [kind, specifier] = dependency.site;
  if (used === undefined) return kind === 'import' || specifier === null ? { reason: 'not-resolved' } : partAt(dependency.node);
  if (used.size === 0) return { reason: 'unreferenced' };
  return used.size === 1 ? [...used][0] as DividedPart : { reason: 'shared', usedIn: parts.filter(part => used.has(part)) };
}

// Divides a parsed file by the named top-level symbols, as divideFile does, and
// places each loading site of the file in a part or at file level.
export function partDependencies(checking: Checking, source: SourceFile, symbols: readonly string[]): PartDependencies {
  const { ts } = checking;
  const division = divideFile(ts, source, symbols);
  const parts: DividedPart[] = division.symbols.map(({ symbol, ranges }) =>
    ({ part: { unitKind: 'symbol', symbol }, ranges, dependencies: [] }));
  if (division.rest.length > 0) parts.push({ part: { unitKind: 'rest' }, ranges: division.rest, dependencies: [] });
  const partAt = (node: Node): DividedPart => partHolding(parts, sourcePosition(source, node.getStart(source)));
  const sites = fileSites(ts, source).map((site, order) => ({ ...site, order, localNames: [] as string[] }))
    .filter(({ site: [kind] }) => kind !== 'resource-call-candidate');
  const bound = new Map<Dependency, Identifier[]>();
  for (const dependency of sites) {
    const names = boundNames(checking, dependency.node);
    dependency.localNames = names.map(name => name.text);
    if (names.length > 0) bound.set(dependency, names);
  }
  const uses = partsUsing(checking, source, bound, partAt);
  const fileDependencies: FileDependency[] = [];
  for (const dependency of sites) {
    const place = placement(dependency, uses.get(dependency), parts, partAt);
    if ('part' in place) place.dependencies.push(dependency);
    else fileDependencies.push({ ...dependency, reason: place.reason,
      ...place.usedIn === undefined ? {} : { usedIn: place.usedIn.map(({ part }) => part) } });
  }
  return { parts, fileDependencies };
}
