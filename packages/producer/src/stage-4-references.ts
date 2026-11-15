import { type FileSettings, fileSettings, settingsRef } from './compiler-settings.ts';
import { assert, type Fields } from './record-checks.ts';
import { openSnapshotProject, outsideReadsNote, type ProjectTools, virtualRoot } from './snapshot-project.ts';
import { findReferences } from './snapshot-references.ts';
import type { SnapshotFiles } from './stage-1-settings.ts';
import type { SourceFile } from './stage-4-graph-profile.ts';

// The record of the Stage 4 references action: the references to a symbol of one
// source file of the graph scope. The query searches the files of the import pass of
// the graph profile group that holds the file, with the compiler settings of that
// group, chosen by the rule of the Stage 3 exports action. The loading sites of the
// scope with a computed module name are possible uses that the query does not resolve.
export interface ReferencesInput {
  attemptId: string; snapshotRef: unknown; path: string; symbol: string;
  // The indexed files of the saved snapshot and its folder, which the snapshot project reads.
  snapshot: SnapshotFiles;
  // The checked graph profile, the saved source sites, the registered settings record and their artifact IDs.
  profile: Fields; profileRef: string; sites: Fields; sitesRef: string; settings: Fields;
  // ts-morph from the trusted checkout, and the parser record that collect saved with the source sites.
  tsMorph: ProjectTools; parser: Fields;
}
export interface UnresolvedSite { siteRef: string; path: unknown; lines: unknown; kind: unknown; expression: unknown }

// The loading sites that can name a module by a computed value.
const loadingKinds = new Set(['dynamic-import', 'require-candidate', 'require-resolve-candidate', 'import-equals']);
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
    'JavaScript files of the scope are part of the compiler program.',
  'The symbol is an export name of the file (default for the default export, export= for export =), else the name of a ' +
    'top-level declaration of the file. An import is not a declaration of the file. Each alias is followed to the ' +
    'declaration that it names, and declarations lists that declaration. A declaration is not a reference.',
  'The query follows renamed imports and exports, export * from, namespace imports, default imports, import = and the ' +
    'JavaScript require calls that the compiler resolves. It does not follow a require call in a TypeScript file, an ' +
    'import that the compiler settings do not resolve, the local names that a destructured dynamic import binds in a ' +
    'TypeScript file, or JSDoc types.',
  'kind is import for an import, import = or JavaScript require that binds a local name to the symbol; re-export for an ' +
    'export list entry, export default, export = or export * from that exports it; type for a use in a type; call for a ' +
    'call, new expression, tagged template, decorator or JSX element that it starts; and value for any other use. The ' +
    'closing tag of a JSX element is not listed.',
  'localName is the name that the site uses for the symbol: the local name that an import binds, the export name of a ' +
    're-export, or the name expression of another use, such as billing.createInvoice.',
  'unresolved lists each loading site of source-sites.json in the scope whose module name is computed: a dynamic import, ' +
    'require, require.resolve or import = site with a null specifier. Such a site can load the module of the symbol, so ' +
    'the references can be incomplete. completeness is partial when unresolved has an entry, and complete-within-scope ' +
    'otherwise. Neither value covers the files outside the scope or the uses that the query does not follow.',
  'A range starts at the first character of the site and ends after its last character: the name, the import or export ' +
    'entry, or the export * from statement. Lines and columns start at 1 and count UTF-16 code units. A byte order mark ' +
    'is not counted.',
  'gaps lists each compiler input that the snapshot does not hold: a files entry of the configuration itself (not one ' +
    'that comes from an extended configuration), a types entry, and a reference path or reference types directive of a ' +
    'file of the scope.',
  outsideReadsNote,
];

// The loading sites of the scope whose module name is computed, as possible uses that the query does not resolve.
export function unresolvedSites(sites: Fields, scope: ReadonlySet<string>, sitesRef: string): UnresolvedSite[] {
  return (sites.sites as Fields[]).flatMap(({ path, lines, kind, specifier, expression }, index) =>
    scope.has(path as string) && loadingKinds.has(kind as string) && specifier === null
      ? [{ siteRef: sitesRef + '#/sites/' + index, path, lines, kind, expression }] : []);
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
  const unresolved = unresolvedSites(input.sites, new Set(scope), input.sitesRef);
  return {
    formatVersion: 1, attemptId, snapshotRef: input.snapshotRef, status: 'completed', path, sha256: file.sha256, symbol,
    settingsRef, compilerSettingsRef: settings.ref, compilerSettings: settings.record, queryOptions,
    scope: { graphContext: pass.id, graphContextRef: input.profileRef + '#/contexts/' + index, files: scope },
    tool: { ...input.parser, name: checker }, virtualRoot,
    completeness: unresolved.length ? 'partial' : 'complete-within-scope',
    declarations, references, unresolved, gaps: project.gaps(), outsideReads: project.outsideReads(), notes: referencesNotes,
  };
}
