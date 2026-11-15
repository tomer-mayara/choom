import { posix } from 'node:path';
import type * as TsMorph from 'ts-morph';
import { type FileSettings, fileSettings, settingsRef } from './compiler-settings.ts';
import { assert, type Fields } from './record-checks.ts';
import { openSnapshotProject, outsideReadsNote, type ProjectTools, type SnapshotProject, snapshotPath, virtualRoot }
  from './snapshot-project.ts';
import { findReferences, programFile, resolvesModuleName } from './snapshot-references.ts';
import type { SnapshotFiles } from './stage-1-settings.ts';
import type { SourceFile } from './stage-4-graph-profile.ts';
import { type FileSite, fileSites } from './stage-4-source-sites.ts';

// The record of the Stage 4 references action: the references to a symbol of one
// source file of the graph scope. The query searches the files of the import pass of
// the graph profile group that holds the file, with the compiler settings of that
// group, chosen by the rule of the Stage 3 exports action. The loading sites of the
// scope that the query does not follow are possible uses that it does not resolve: a
// site with a computed module name, a require call in a TypeScript file, and an
// import of a relative module name or a paths alias that the compiler settings do
// not resolve.
export interface ReferencesInput {
  attemptId: string; snapshotRef: unknown; path: string; symbol: string;
  // The indexed files of the saved snapshot and its folder, which the snapshot project reads.
  snapshot: SnapshotFiles;
  // The checked graph profile, the saved source sites, the registered settings record and their artifact IDs.
  profile: Fields; profileRef: string; sites: Fields; sitesRef: string; settings: Fields;
  // ts-morph from the trusted checkout, and the parser record that collect saved with the source sites.
  tsMorph: ProjectTools; parser: Fields;
}
// An unresolved loading site. siteRef is null when no saved site matches the site of the compiler syntax tree.
export interface UnresolvedSite {
  siteRef: string | null; path: unknown; lines: unknown; kind: unknown; expression: unknown; reason: string;
}

// The loading sites that can name a module by a computed value.
const loadingKinds = new Set(['dynamic-import', 'require-candidate', 'require-resolve-candidate', 'import-equals']);
// The loading sites whose module name the compiler resolves, with the require calls of JavaScript files.
const importKinds = new Set(['import', 're-export', 'import-equals', 'import-type', 'dynamic-import']);
// The type checker does not read a require call in a TypeScript file as an import.
const typeScriptFile = /\.(?:[cm]?ts|tsx)$/;
const sourceCode = /\.(?:[cm]?[jt]s|[jt]sx)$/;
// ./, ../ or /, and . or .. alone.
const relativeName = /^(?:\.\.?(?:\/|$)|\/)/;
const expressionLimit = 4096;
const computedName = 'The module name is computed. The query cannot tell which module the site names, so it can name ' +
  'the module of the symbol.';
const typeScriptRequire = 'TypeScript does not follow a require call in a TypeScript file. The call can load the module ' +
  'of the symbol.';
const unresolvedRelative = 'The compiler settings do not resolve this relative module name, so the query cannot tell ' +
  'whether it names the module of the symbol.';
const unresolvedAlias = 'The compiler settings do not resolve this paths alias, so the query cannot tell whether it ' +
  'names the module of the symbol.';
// The JavaScript files of the scope are part of the compiler program only with allowJs.
const queryOptions = { allowJs: true };
const checker = 'ts-morph snapshot project (TypeScript type checker)';

// What each record covers and what it does not, in the words of the record.
export const referencesNotes = [
  'The references come from the TypeScript type checker of the snapshot project. A reference shows that the code names the ' +
    'symbol. References do not prove all calls, data flows or mutations, and a reference does not show that the code runs.',
  'The scope is the import pass of the Stage 4 graph profile group that holds the file (scope.graphContextRef). Files ' +
    'outside the scope are not searched. The compiler can read other indexed snapshot files to resolve imports, but the ' +
    'query does not search them.',
  'The compiler settings are chosen as for the Stage 4 graph groups and the Stage 3 exports action: the first fully ' +
    'parsed configuration of ' + settingsRef + ' that selects the file (otherContextRefs names the others), else the named ' +
    'Choom parsing profile, else no settings. queryOptions names what the query adds to them: allowJs, so that the ' +
    'JavaScript files of the scope are part of the compiler program. Each file of the scope gets the module format that ' +
    'the compiler gives it, from its extension and, under Node16 and NodeNext, from the type of its nearest package.json, ' +
    'and its imports resolve in that format.',
  'The symbol is an export name of the file (default for the default export, export= for export =), else the name of a ' +
    'top-level declaration of the file. An import is not a declaration of the file. Each alias is followed to the ' +
    'declaration that it names, and declarations lists that declaration. A declaration is not a reference.',
  'The query follows renamed imports and exports, export * from, namespace imports, default imports, import =, the ' +
    'JavaScript require calls that the compiler resolves, and the local names that a destructuring of a module object ' +
    'binds, such as const { createInvoice } = await import(\'./invoice\'). It does not follow a require call in a ' +
    'TypeScript file or an import that the compiler settings do not resolve (unresolved lists them, an import only with a ' +
    'relative module name or a paths alias), or JSDoc types.',
  'kind is import for an import, import = or JavaScript require that binds a local name to the symbol; re-export for an ' +
    'export list entry, export default, export = or export * from that exports it; type for a use in a type; call for a ' +
    'call, new expression, tagged template, decorator or JSX element that it starts; and value for any other use, such ' +
    'as a destructuring that takes it, whose range is the property name. The closing tag of a JSX element is not listed.',
  'localName is the name that the site uses for the symbol: the local name that an import or a destructuring binds, the ' +
    'export name of a re-export, or the name expression of another use, such as billing.createInvoice.',
  'unresolved lists each loading site of source-sites.json in the scope that can load the module of the symbol and that ' +
    'the query does not follow, with its reason: a dynamic import, require, require.resolve or import = site with a ' +
    'computed module name (a null specifier); a require call with a literal module name in a TypeScript file (.ts, ' +
    '.tsx, .mts or .cts); and an import, export from, import =, import type, literal dynamic import or JavaScript ' +
    'require call whose relative module name (./, ../ or /) or paths alias the compiler settings do not resolve to a ' +
    'file. A paths alias is a module name that matches a key of the paths option, as TypeScript matches it; a key * ' +
    'alone matches every package name, so it does not make an alias. The checker follows a literal require call in a ' +
    'JavaScript file, a require.resolve call with a literal name loads nothing, a bare package name that matches no ' +
    'paths key names an external package, which the snapshot does not hold, and a snapshot file that is not source ' +
    'code, such as ./theme.css, cannot hold the symbol, so none of them is listed. siteRef is null when no ' +
    'saved site matches, such as after the site limit of collect; then lines and expression come from the compiler ' +
    'syntax tree. completeness is partial when unresolved has an entry, and complete-within-scope otherwise. Neither ' +
    'value covers the files outside the scope or the other uses that the query does not follow.',
  'A range starts at the first character of the site and ends after its last character: the name, the import or export ' +
    'entry, or the export * from statement. Lines and columns start at 1 and count UTF-16 code units. A byte order mark ' +
    'is not counted.',
  'gaps lists each compiler input that the snapshot does not hold: a files entry of the configuration itself (not one ' +
    'that comes from an extended configuration), a types entry, and a reference path or reference types directive of a ' +
    'file of the scope.',
  outsideReadsNote,
];

// Why the query does not follow a loading site, or undefined for a site that it follows or that loads nothing.
// `unresolvedImport` is the reason when the compiler settings do not resolve the module name of the site.
function unresolvedReason({ path, kind, specifier }: Fields, unresolvedImport: string | undefined): string | undefined {
  if (loadingKinds.has(kind as string) && specifier === null) return computedName;
  if (kind === 'require-candidate' && typeScriptFile.test(path as string)) return typeScriptRequire;
  return unresolvedImport;
}

// The loading sites of the scope that can load the module of the symbol and that the query does not follow,
// as possible uses that it does not resolve. `imports` gives the reason for each saved site, by its index, whose
// relative module name or paths alias the compiler settings do not resolve.
export function unresolvedSites(sites: Fields, scope: ReadonlySet<string>, sitesRef: string,
  imports: ReadonlyMap<number, string> = new Map()): UnresolvedSite[] {
  return (sites.sites as Fields[]).flatMap((site, index) => {
    const { path, lines, kind, expression } = site;
    const reason = scope.has(path as string) ? unresolvedReason(site, imports.get(index)) : undefined;
    return reason === undefined ? [] : [{ siteRef: sitesRef + '#/sites/' + index, path, lines, kind, expression, reason }];
  });
}

// The key of the paths option that a non-relative module name matches, as TypeScript matches it: a key without *
// that equals the name, else the key with one * whose prefix and suffix the name has, with the longest prefix. A key
// * alone matches every package name, so it does not make a name an alias.
export function pathsAliasKey(paths: Readonly<Fields>, name: string): string | undefined {
  if (!name.includes('*') && Object.hasOwn(paths, name)) return name;
  let best: string | undefined;
  for (const key of Object.keys(paths)) {
    const [prefix = '', suffix, extra] = key.split('*');
    if (suffix === undefined || extra !== undefined || key === '*' || name.length < prefix.length + suffix.length ||
      !name.startsWith(prefix) || !name.endsWith(suffix)) continue;
    if (best === undefined || prefix.length > best.indexOf('*')) best = key;
  }
  return best;
}

// The snapshot paths that a paths alias names: each target of its key, with the part of the name that the * matched,
// from the base folder of the paths option.
function aliasTargets(options: Readonly<Fields>, key: string, name: string): string[] {
  const star = key.indexOf('*');
  const part = star < 0 ? '' : name.slice(star, name.length - (key.length - star - 1));
  const base = String(options.baseUrl ?? options.pathsBasePath ?? virtualRoot);
  const targets = (options.paths as Fields)[key];
  return (Array.isArray(targets) ? targets : []).filter(target => typeof target === 'string')
    .map(target => snapshotPath(posix.resolve(base, star < 0 ? target : target.replace('*', part))));
}

// The module name of a loading site: the module specifier of a declaration, or the literal of an import type or a call.
function moduleNameOf(ts: typeof TsMorph.ts, node: TsMorph.ts.Node): TsMorph.ts.StringLiteralLike | undefined {
  const name = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
    : ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression
      : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal
        : ts.isCallExpression(node) ? node.arguments[0] : undefined;
  return name !== undefined && ts.isStringLiteralLike(name) ? name : undefined;
}

// The reason to list a site of a file when the compiler settings do not resolve its module name: a relative module
// name, or a paths alias, that can name source code. Otherwise undefined: a bare package name, a require call of a
// TypeScript file, which has its own reason, and a name of a snapshot file that is not source code, such as ./theme.css.
function localNameReason(path: string, [kind, specifier]: FileSite['site'], inventory: ReadonlySet<string>,
  options: Readonly<Fields>): string | undefined {
  if (specifier === null || !(importKinds.has(kind) || (kind === 'require-candidate' && !typeScriptFile.test(path))))
    return undefined;
  const dataFile = (named: string): boolean => inventory.has(named) && !sourceCode.test(named);
  if (relativeName.test(specifier))
    return dataFile(snapshotPath(posix.resolve(posix.dirname(virtualRoot + '/' + path), specifier))) ? undefined : unresolvedRelative;
  const key = pathsAliasKey((options.paths ?? {}) as Fields, specifier);
  return key === undefined || aliasTargets(options, key, specifier).some(dataFile) ? undefined : unresolvedAlias;
}

// The line of each end of a node, as the compiler syntax tree counts lines.
function nodeLines(source: TsMorph.ts.SourceFile, node: TsMorph.ts.Node): [number, number] {
  const line = (position: number): number => source.getLineAndCharacterOfPosition(position).line + 1;
  return [line(node.getStart(source)), line(Math.max(node.getStart(source), node.end - 1))];
}

// The imports of the scope whose relative module name or paths alias the compiler settings do not resolve: the
// reason for each of their saved sites, by index, which the same walk of the syntax tree finds in the same order, and
// an entry for each import that no saved site matches, such as one after the site limit of collect.
function unresolvedImports(project: SnapshotProject, scope: readonly string[], sites: Fields[],
  inventory: ReadonlySet<string>): { reasons: Map<number, string>; unmatched: UnresolvedSite[] } {
  const options = project.project.compilerOptions.get() as Fields;
  const saved = new Map<unknown, number[]>();
  sites.forEach((site, index) => { const list = saved.get(site.path) ?? []; list.push(index); saved.set(site.path, list); });
  const reasons = new Map<number, string>(); const unmatched: UnresolvedSite[] = [];
  for (const path of scope) {
    const source = programFile(project, path);
    fileSites(project.ts, source).forEach(({ node, site }, order) => {
      const name = moduleNameOf(project.ts, node);
      const reason = name === undefined ? undefined : localNameReason(path, site, inventory, options);
      if (name === undefined || reason === undefined || resolvesModuleName(project, name)) return;
      const index = saved.get(path)?.[order];
      const match = index === undefined ? undefined : sites[index];
      if (index !== undefined && match?.kind === site[0] && match.specifier === site[1]) { reasons.set(index, reason); return; }
      unmatched.push({ siteRef: null, path, lines: nodeLines(source, node), kind: site[0],
        expression: node.getText(source).slice(0, expressionLimit), reason });
    });
  }
  return { reasons, unmatched };
}

// The source file of the graph scope that the operator named.
function scopeFile(profile: Fields, path: string): SourceFile {
  const file = (profile.sourceFiles as SourceFile[]).find(item => item.path === path);
  assert(file, 'Path is not a JavaScript or TypeScript file of the graph scope: ' + path);
  return file;
}

// The import pass of the graph profile group that holds the file, and its index in the profile.
function importPass(profile: Fields, settings: FileSettings, path: string): { index: number; pass: Fields } {
  const contexts = profile.contexts as Fields[];
  const index = contexts.findIndex(context => context.id === settings.group + '-import');
  const pass = contexts[index];
  assert(pass !== undefined && pass.compilerSettingsRef === settings.ref && (pass.sourceFiles as string[]).includes(path),
    'The graph profile has no import pass of the group ' + settings.group + ' that holds ' + path + '.');
  return { index, pass };
}

export function referencesRecord(input: ReferencesInput): Fields {
  const { attemptId, path, symbol, profile } = input;
  const file = scopeFile(profile, path);
  const settings = fileSettings(input.settings, file);
  const { index, pass } = importPass(profile, settings, path);
  const scope = pass.sourceFiles as string[];
  const project = openSnapshotProject(input.snapshot, { ...settings.project,
    compilerOptions: { ...settings.project.compilerOptions, ...queryOptions } }, input.tsMorph);
  for (const scopePath of scope) project.sourceFile(scopePath);
  const { declarations, references } = findReferences(project, path, symbol);
  const inventory = new Set(input.snapshot.files.filter(item => item.kind === 'file').map(item => item.path));
  const imports = unresolvedImports(project, scope, input.sites.sites as Fields[], inventory);
  const unresolved = [...unresolvedSites(input.sites, new Set(scope), input.sitesRef, imports.reasons), ...imports.unmatched];
  return {
    formatVersion: 1, attemptId, snapshotRef: input.snapshotRef, status: 'completed', path, sha256: file.sha256, symbol,
    settingsRef, compilerSettingsRef: settings.ref, compilerSettings: settings.record, queryOptions,
    scope: { graphContext: pass.id, graphContextRef: input.profileRef + '#/contexts/' + index, files: scope },
    tool: { ...input.parser, name: checker }, virtualRoot,
    completeness: unresolved.length ? 'partial' : 'complete-within-scope',
    declarations, references, unresolved, gaps: project.gaps(), outsideReads: project.outsideReads(), notes: referencesNotes,
  };
}
