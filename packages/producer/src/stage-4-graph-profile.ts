import { isAbsolute, posix } from 'node:path';
import { namedParsingProfile, type ParsingProfile } from './parsing-profile.ts';
import { assert, type Fields, text } from './record-checks.ts';
import { type ContextKinds, contextKinds, packageLookup } from './stage-4-module-kinds.ts';

// The graph profile that Stage 4 start saves before the graph runs. It puts the
// saved Stage 3 source scope into compiler contexts, gives each context its passes
// by the module kinds of its files, takes the traversal roots from the retained
// entry patterns, and notes the choices, the module kinds and their limits. A
// snapshot without project settings uses the Choom parsing profile that the
// settings record names. Saved JSON stays an unchecked value until the checks
// below read it.
export interface IndexedFile { path: string; kind: unknown; sha256: string; bytes?: unknown }
export interface SourceFile { path: string; sha256: string }
interface Alias { name: string; alias: string }
interface ConfigurationLimit { configRef: string; reason: string }
// A compiler context: its name, the files that it selects, the reference of its
// settings (null for the fallback), the options that the parser gets, the path
// aliases, and for a configuration its entry in the settings record.
export interface CompilerContext {
  name: string; files: SourceFile[]; ref: string | null; options: Fields; aliases: Alias[]; config: Fields | null;
}
export interface CompilerContexts {
  groups: CompilerContext[]; configurationLimits: ConfigurationLimit[]; parsingProfile: ParsingProfile | null;
}
type Matcher = (path: string) => boolean;
export type Picomatch = (pattern: string, options: { dot: boolean }) => Matcher;
interface Pattern { excluded: boolean; match: Matcher; ref: string }
interface Workspace { dir: string; entry: string[] }

// The facts of the Stage 4 handoff that the profile and its notes name.
export interface ProfileFacts { snapshotRef: string; settingsRef: string; planRef: string; loadingRef: string }
export interface ProfileInputs {
  attemptId: string;
  settings: Fields;
  plan: Fields;
  loading: Fields;
  indexed: Map<string, IndexedFile>;
  facts: ProfileFacts;
  // Loads picomatch from the trusted tool checkout.
  loadPicomatch: () => Picomatch;
  // Gives the checked bytes of an indexed snapshot file. The module kinds read package.json files with it.
  readIndexed: (path: string) => Buffer;
}
export interface GraphProfile { graph: Fields; notes: Fields }

const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const compilerKeys = ['target', 'module', 'moduleResolution', 'jsx', 'verbatimModuleSyntax'];
const contextLimit = 'Each parsed compiler file selection is a separate context. Overlapping selections stay separate; remaining source uses a named configuration-free fallback.';
const limits = ['Scan files come from all indexed regular JavaScript and TypeScript files in the Stage 3 source query.',
  "Explicit traversal roots use the retained entry patterns in each saved workspace; they are not Knip's complete effective roots.",
  contextLimit,
  'Import and require are separate, platform-neutral passes. A third, CommonJS pass reads the import syntax of TypeScript whose compiled code is CommonJS with the require condition. Browser, Node, Bun, custom, and type-specific package conditions remain outside this profile.',
  'Compiler inclusion does not claim production use, execution, or ownership. Referenced project contexts are not merged.',
  'Only target, module, moduleResolution, jsx, and verbatimModuleSyntax are passed to the parser.',
  'Recorded single-target path aliases approximate source resolution; omitted alias forms remain gaps and TypeScript paths do not establish runtime rewriting.',
  'Ambient declarations, package dependencies, non-JS/TS source and cross-context traversal remain limited.',
  'The module kind of a file comes from its extension, the compiler module setting and the type of the nearest indexed package.json. createRequire in ES modules, conditions in typesVersions, bundler resolution, and TypeScript that a bundler compiles instead of tsc remain outside this rule.'];
// The conditions and module systems of each kind of pass.
const passes = {
  import: { conditionNames: ['import', 'default'], moduleSystems: ['es6', 'tsd'] },
  require: { conditionNames: ['require', 'default'], moduleSystems: ['cjs'] },
  commonjs: { conditionNames: ['require', 'default'], moduleSystems: ['es6', 'tsd', 'cjs'] },
};

export function safePath(path: unknown): path is string {
  return text(path) && !isAbsolute(path) && !/[\\\u0000-\u001f\u007f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

function savedSourceFiles(plan: Fields, loading: Fields): SourceFile[] {
  const workspaces = plan.workspaces as Workspace[];
  assert(Array.isArray(workspaces) && workspaces.some(workspace => workspace.dir === '.') &&
    workspaces.every(workspace => (workspace.dir === '.' || safePath(workspace.dir)) &&
      Array.isArray(workspace.entry) && workspace.entry.every(text)), 'Invalid saved workspace entry patterns.');
  const sourceFiles = (loading.scope as SourceFile[]).map(({ path, sha256 }) => ({ path, sha256 }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert(sourceFiles.length && sourceFiles.every(file => sourceExtension.test(file.path) && !/[!*?{}[\]()]/.test(file.path)),
    'This profile needs saved JS/TS source with no glob characters in its filenames.');
  return sourceFiles;
}

// The options of a compiler context that the parser gets: the parsed values of
// the compiler keys. Each is an enum value of the pinned TypeScript, or a boolean.
function parserOptions(compilerOptions: unknown, path: unknown): Fields {
  const parsed = (compilerOptions ?? {}) as Fields;
  const options = Object.fromEntries(compilerKeys.filter(key => Object.hasOwn(parsed, key)).map(key => [key, parsed[key]]));
  assert(Object.entries(options).every(([key, value]) => key === 'verbatimModuleSyntax'
    ? typeof value === 'boolean' : Number.isSafeInteger(value) && (value as number) >= 0), 'Unsupported compiler option values: ' + path);
  return options;
}

// The recorded single-target path aliases of a context. Other forms are omitted with a limit.
function pathAliases(compilerOptions: Fields | undefined, ref: string, configurationLimits: ConfigurationLimit[]): Alias[] {
  const aliases: Alias[] = [];
  const paths = (compilerOptions?.paths ?? {}) as Fields;
  const base = compilerOptions?.baseUrl ?? compilerOptions?.pathsBasePath;
  for (const [name, targets] of Object.entries(paths)) {
    const target = Array.isArray(targets) && targets.length === 1 && text(targets[0]) && text(base)
      ? posix.resolve(base, targets[0]) : null;
    if (!/^[A-Za-z0-9@._/-]+\*?$/.test(name) || !target?.startsWith('/repo/') ||
      !/^[A-Za-z0-9._/-]+\*?$/.test(target) || name.endsWith('*') !== target.endsWith('*')) {
      configurationLimits.push({ configRef: ref, reason: 'Alias is outside the supported single-target form and was omitted: ' + name });
      continue;
    }
    aliases.push({ name, alias: target });
  }
  if (compilerOptions?.baseUrl)
    configurationLimits.push({ configRef: ref, reason: 'baseUrl-only bare imports are not resolved; only the recorded explicit path aliases are approximated.' });
  return aliases;
}

// One group for each fully parsed compiler file selection that selects saved source.
function compilerGroups(settings: Fields, sourceFiles: SourceFile[], settingsRef: string):
  { groups: CompilerContext[]; configurationLimits: ConfigurationLimit[] } {
  const configurationLimits: ConfigurationLimit[] = [];
  const groups: CompilerContext[] = [];
  for (const [index, config] of ((settings.configs ?? []) as Fields[]).entries()) {
    const ref = settingsRef + '#/configs/' + index;
    if (config.status !== 'parsed' || !Array.isArray(config.fileNames)) {
      configurationLimits.push({ configRef: ref, reason: 'No fully parsed saved file selection; affected files use another supported context or the fallback.' });
      continue;
    }
    const configured = new Set((config.fileNames as string[]).map(path => path.startsWith('/repo/') ? path.slice(6) : path));
    const files = sourceFiles.filter(file => configured.has(file.path));
    if (!files.length) {
      configurationLimits.push({ configRef: ref, reason: 'This compiler context selects no indexed JS/TS scan files.' });
      continue;
    }
    const options = parserOptions(config.compilerOptions, config.path);
    const aliases = pathAliases(config.compilerOptions as Fields | undefined, ref, configurationLimits);
    groups.push({ name: 'compiler-' + (index + 1), files, ref, options, aliases, config });
  }
  return { groups, configurationLimits };
}

// The group of the source that no parsed compiler selection covers. With a named
// parsing profile, it uses the profile's options; otherwise it is a
// configuration-free fallback.
function remainingGroup(files: SourceFile[], profile: ParsingProfile | null, settingsRef: string): CompilerContext {
  if (profile === null) return { name: 'fallback', files, ref: null, options: {}, aliases: [], config: null };
  return { name: profile.id, files, ref: settingsRef + '#/parsingProfile',
    options: parserOptions(profile.compilerOptions, profile.id), aliases: [], config: null };
}

// The compiler contexts of saved source files: one group for each fully parsed
// compiler selection that selects some of them, in record order, then one group
// for the files that no parsed selection covers. That group uses the named Choom
// parsing profile when the settings record names it; otherwise it is the
// configuration-free fallback. A file can be in several groups. compiler-settings.ts
// applies the same rule to one file for the Stage 3 exports and Stage 4 references actions.
export function compilerContexts(settings: Fields, sourceFiles: SourceFile[], settingsRef: string): CompilerContexts {
  const parsingProfile = namedParsingProfile(settings);
  const { groups, configurationLimits } = compilerGroups(settings, sourceFiles, settingsRef);
  const covered = new Set(groups.flatMap(group => group.files.map(file => file.path)));
  const remaining = sourceFiles.filter(file => !covered.has(file.path));
  if (remaining.length) groups.push(remainingGroup(remaining, parsingProfile, settingsRef));
  return { groups, configurationLimits, parsingProfile };
}

function profileLimits(profile: ParsingProfile | null, settingsRef: string): string[] {
  if (profile === null) return limits;
  return limits.map(limit => limit !== contextLimit ? limit : 'The snapshot has no project settings, so its source uses the ' +
    `named Choom parsing profile ${profile.id}. ${settingsRef}#/parsingProfile records its options and assumptions.`);
}

// The saved entry patterns of each workspace, as matchers with their plan references.
function entrySelectors(plan: Fields, planRef: string, picomatch: Picomatch): { dir: string; patterns: Pattern[] }[] {
  return (plan.workspaces as Workspace[]).map((workspace, workspaceIndex) => ({
    dir: workspace.dir,
    patterns: workspace.entry.map((pattern, index) => {
      const source = pattern.replace(/!$/, '');
      const excluded = source.startsWith('!');
      assert(source.length > (excluded ? 1 : 0), 'Empty entry pattern.');
      return { excluded, match: picomatch(excluded ? source.slice(1) : source, { dot: true }),
        ref: planRef + '#/workspaces/' + workspaceIndex + '/entry/' + index };
    }),
  }));
}

function rootEvidence(selectors: { dir: string; patterns: Pattern[] }[], path: string): string[] {
  return [...new Set(selectors.flatMap(({ dir, patterns }) => {
    if (dir !== '.' && !path.startsWith(dir + '/')) return [];
    const relative = dir === '.' ? path : path.slice(dir.length + 1);
    if (patterns.some(pattern => pattern.excluded && pattern.match(relative))) return [];
    return patterns.filter(pattern => !pattern.excluded && pattern.match(relative)).map(pattern => pattern.ref);
  }))];
}

// The passes of each compiler context: an import pass and a require pass over its
// files, and a CommonJS pass when some of its files compile to CommonJS. The import
// pass and the CommonJS pass name those files.
function graphContexts(groups: (ContextKinds & { group: CompilerContext })[], selectors: { dir: string; patterns: Pattern[] }[]): Fields[] {
  return groups.flatMap(({ group, compiled }) => {
    const roots = group.files.flatMap(file => {
      const evidenceRefs = rootEvidence(selectors, file.path);
      return evidenceRefs.length ? [{ path: file.path, evidenceRefs }] : [];
    });
    const kinds = compiled ? (['import', 'require', 'commonjs'] as const) : (['import', 'require'] as const);
    return kinds.map(kind => ({
      id: group.name + '-' + kind, compilerSettingsRef: group.ref,
      sourceFiles: group.files.map(file => file.path), compilerOptions: group.options, aliases: group.aliases, ...passes[kind],
      ...(compiled && kind !== 'require' ? { compiledToCommonJS: compiled } : {}), roots,
    }));
  });
}

export function graphProfile({ attemptId, settings, plan, loading, indexed, facts, loadPicomatch, readIndexed }: ProfileInputs): GraphProfile {
  // The profile check comes before the scope check.
  const parsingProfile = namedParsingProfile(settings);
  const sourceFiles = savedSourceFiles(plan, loading);
  const selected = new Set(sourceFiles.map(file => file.path));
  const { groups, configurationLimits } = compilerContexts(settings, sourceFiles, facts.settingsRef);
  const nearestPackage = packageLookup(indexed, readIndexed);
  const kinds = groups.map(group =>
    ({ group, ...contextKinds(group.files.map(file => file.path), group.options, group.ref, nearestPackage) }));
  const contexts = graphContexts(kinds, entrySelectors(plan, facts.planRef, loadPicomatch()));
  const outsideScope = [...indexed.values()].filter(file => sourceExtension.test(file.path) && !selected.has(file.path));
  return {
    graph: { formatVersion: 1, snapshotRef: facts.snapshotRef, attemptId, sourceFiles, contexts },
    notes: { formatVersion: 1, snapshotRef: facts.snapshotRef, scopeRef: facts.loadingRef + '#/scope',
      settingsRef: facts.settingsRef, planRef: facts.planRef,
      groups: groups.map(group => ({ name: group.name, files: group.files.length, compilerSettingsRef: group.ref })),
      configurationLimits,
      moduleKinds: kinds.flatMap(({ group, records }) => records.map(record => ({ group: group.name, ...record }))),
      outsideScope: outsideScope.map(({ path, sha256 }) => ({ path, sha256, status: 'unassessed' })),
      limits: profileLimits(parsingProfile, facts.settingsRef) },
  };
}
