import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The Stage 4 graph helper. In the graph container it runs dependency-cruiser on
// the saved graph profile, one call for each context, with the tools of the graph
// image. --fixture runs the same code on a built-in fixture; CHOOM_GRAPH_TOOLS can
// give the fixture the tools of a local checkout. Stage 4 mounts only this file in
// the container, at /producer/stage-4-graph.mts, so it imports only Node built-ins
// and uses only TypeScript syntax that Node type stripping removes. The saved
// profile and the raw graph stay unchecked values until the checks below read them.
type Fields = Record<string, unknown>;
interface Alias { name: string; alias: string; onlyModule?: boolean }
interface Root { path: string; evidenceRefs: string[] }
interface SourceFile { path: string; sha256: string }
// The scan files of a compiler context whose compiled code is CommonJS, and the condition of their import() calls.
interface CompiledToCommonJS { files: string[]; dynamicImportCondition: string }
// A checked context of the graph profile: one pass over its scan files.
interface GraphContext {
  id: string; compilerSettingsRef: string | null; sourceFiles: string[]; compilerOptions: Fields; aliases: Alias[];
  conditionNames: string[]; moduleSystems: string[]; compiledToCommonJS?: CompiledToCommonJS; roots: Root[];
}
type PassKind = 'import' | 'require' | 'commonjs';
interface GraphProfile { formatVersion: 1; snapshotRef: string; attemptId: string; sourceFiles: SourceFile[]; contexts: GraphContext[] }
interface Transpiler { name: string; available: boolean; currentVersion: string }
interface CruiseResponse { exitCode: number; output: unknown }
type Cruise = (files: string[], options: Fields, resolveOptions: Fields, transpileOptions: Fields) => Promise<CruiseResponse>;
interface DependencyCruiser { cruise: Cruise; getAvailableTranspilers(): Transpiler[] }
interface ToolVersions { node: string; dependencyCruiser: string; typescript: string; enhancedResolve: string }
interface Tools { cruise: Cruise; versions: ToolVersions }
// A module and a dependency of the raw dependency-cruiser output. readEdges checks the unknown fields.
interface RawDependency {
  module: unknown; moduleSystem: string; protocol?: string; dependencyTypes: unknown; coreModule: unknown; couldNotResolve: unknown;
  resolved: unknown; followable: unknown; matchesDoNotFollow: unknown; preCompilationOnly?: unknown; dynamic?: unknown;
}
interface RawModule { source: string; dependencies: RawDependency[]; followable?: unknown }
interface RawGraph { modules: RawModule[] }
// The attempt and the context whose raw output readEdges reads, and the input folder.
interface EdgeSource { attemptId: string; contextIndex: number; baseDir: string }
type PackageLookup = (path: string) => Set<string>;
interface Target { to: string | null; targetKind: string }
interface Edge extends Target {
  id: string; from: string; specifier: string; dependencyTypes: string[]; preCompilationOnly: boolean | null; dynamic: boolean | null;
  evidenceRefs: string[];
}
interface Reachability {
  status: string; method: string; roots: string[]; reached: string[]; notReached: string[]; stoppedEdges: string[]; edgePolicy: string;
}
interface ContextResult {
  id: string; conditionNames: string[]; moduleSystems: string[]; compilerSettingsRef: string | null; scanFiles: string[]; roots: Root[];
  coverage: string; status: string; raw: unknown; edges: Edge[]; reachability: Reachability | null; limits: string[];
}
interface GraphResult {
  formatVersion: 1; snapshotRef: string; profileRef: string; status: string; coverage: string; toolVersions: ToolVersions;
  contexts: ContextResult[]; limits: string[];
}
interface FixtureApproval { status: string; toolVersions: ToolVersions; contextCount: number }

const repo = '/repo';
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const compilerKeys = ['target', 'module', 'moduleResolution', 'jsx', 'verbatimModuleSyntax'];
const extensions = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.d.mts', '.d.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const limits = [
  'This graph describes saved source dependencies. Runtime execution and unused-file judgments are outside its coverage.',
  'The resolver uses the recorded conditions and simple saved aliases. Target configuration, plugins, builds, and tests remain unexecuted.',
  'Installed target dependencies are unavailable. Declared external imports without a saved target are unresolved.',
  'Bun and Node runtime resolution, bundler behavior, and type-specific package conditions are outside this profile.',
  'Built-in labels come from the analyzer runtime and dependency-cruiser. Their availability in the target runtime is unverified.',
  'Each pass retains its selected module systems. Traversal stays within that pass. A CommonJS pass resolves the import syntax of TypeScript whose compiled code is CommonJS with the require condition.',
  'The module kinds do not cover createRequire in ES modules, conditions in typesVersions, bundler resolution, or TypeScript that a bundler compiles instead of tsc.',
  'The pinned graph can drop import kind and type-only labels from unresolved dependencies. It can collapse static and dynamic imports of the same specifier.',
  'Use saved syntax evidence for import sites and computed loading, including occurrences that the graph does not retain.',
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const object = (value: unknown): value is Fields => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const unique = (values: readonly unknown[]): boolean => new Set(values).size === values.length;
const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const stringList = (values: unknown): values is string[] => Array.isArray(values) && values.every(text) && unique(values);

function hasFields(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Fields {
  return object(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function relativePath(path: unknown): path is string {
  return text(path) && !isAbsolute(path) && !/[\\\u0000-\u001f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

function sourcePath(path: unknown): path is string {
  return relativePath(path) && sourceExtension.test(path) && !/[!*?{}\[\]()]/.test(path);
}

function validAlias(entry: unknown): entry is Alias {
  return hasFields(entry, ['name', 'alias'], ['onlyModule']) &&
    typeof entry.name === 'string' && /^[A-Za-z0-9@._/-]+\*?$/.test(entry.name) &&
    typeof entry.alias === 'string' && entry.alias.startsWith('/repo/') &&
    posix.normalize(entry.alias) === entry.alias &&
    /^[A-Za-z0-9._/-]+\*?$/.test(entry.alias) &&
    entry.name.endsWith('*') === entry.alias.endsWith('*') &&
    (!Object.hasOwn(entry, 'onlyModule') || entry.onlyModule === !entry.name.endsWith('*'));
}

// The kind of a pass, by the module systems that it reads: ES modules and TypeScript
// references with the import condition, CommonJS with the require condition, or all
// three with the require condition for the files whose compiled code is CommonJS.
const passKinds = new Map<string, PassKind>([['es6,tsd', 'import'], ['cjs', 'require'], ['cjs,es6,tsd', 'commonjs']]);
const kindOf = (context: GraphContext): PassKind => passKinds.get([...context.moduleSystems].sort().join()) as PassKind;

// Each pass has default and at most one platform condition.
function checkPassConditions(context: Fields, id: string): PassKind {
  const kind = stringList(context.moduleSystems) ? passKinds.get([...context.moduleSystems].sort().join()) : undefined;
  const condition = kind === 'import' ? 'import' : 'require';
  assert(kind !== undefined && stringList(context.conditionNames) &&
    context.conditionNames.includes('default') && context.conditionNames.includes(condition) &&
    !context.conditionNames.includes(condition === 'import' ? 'require' : 'import') &&
    context.conditionNames.every(name => ['import', 'require', 'default', 'browser', 'node', 'bun'].includes(name)) &&
    context.conditionNames.filter(name => ['browser', 'node', 'bun'].includes(name)).length <= 1,
  'Use separate import and require conditions: ' + id);
  return kind;
}

// An import pass can name the files whose compiled code is CommonJS, a CommonJS pass
// must name them, and a require pass does not.
function checkCompiledToCommonJS(context: Fields, kind: PassKind, id: string): void {
  const compiled = context.compiledToCommonJS;
  assert(compiled !== undefined || kind !== 'commonjs', 'A CommonJS pass needs the files whose compiled code is CommonJS: ' + id);
  const scope = new Set(context.sourceFiles as string[]);
  assert(compiled === undefined || (kind !== 'require' && hasFields(compiled, ['files', 'dynamicImportCondition']) &&
    stringList(compiled.files) && compiled.files.length > 0 && compiled.files.every(path => scope.has(path)) &&
    ['import', 'require'].includes(compiled.dynamicImportCondition as string)),
  'Invalid files whose compiled code is CommonJS: ' + id);
}

export function validateContext(context: unknown, files: ReadonlySet<string>): asserts context is GraphContext {
  assert(hasFields(context, ['id', 'compilerSettingsRef', 'sourceFiles', 'compilerOptions',
    'aliases', 'conditionNames', 'moduleSystems', 'roots'], ['compiledToCommonJS']) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(context.id ?? '')) &&
    (context.compilerSettingsRef === null || text(context.compilerSettingsRef)),
  'Invalid graph context.');
  const id = String(context.id);
  assert(stringList(context.sourceFiles) && context.sourceFiles.length > 0 &&
    context.sourceFiles.every(path => files.has(path)),
  'Context scan files must be unique saved source paths: ' + id);
  assert(hasFields(context.compilerOptions, [], compilerKeys) &&
    Object.entries(context.compilerOptions).every(([key, value]) =>
      key === 'verbatimModuleSyntax' ? typeof value === 'boolean' : Number.isSafeInteger(value) && (value as number) >= 0),
  'Unsupported compiler options: ' + id);
  assert(Array.isArray(context.aliases) && context.aliases.every(validAlias) &&
    unique(context.aliases.map(entry => entry.name)),
  'Expected simple, unique aliases within /repo: ' + id);
  checkCompiledToCommonJS(context, checkPassConditions(context, id), id);
  const scope = new Set(context.sourceFiles);
  assert(Array.isArray(context.roots) && context.roots.every(root =>
    hasFields(root, ['path', 'evidenceRefs']) && scope.has(root.path as string) &&
    stringList(root.evidenceRefs) && root.evidenceRefs.length > 0) &&
    unique(context.roots.map(root => root.path)),
  'Each traversal root needs a scan file and saved evidence: ' + id);
}

function savedSourceFile(file: unknown): file is SourceFile {
  return hasFields(file, ['path', 'sha256']) && sourcePath(file.path) &&
    typeof file.sha256 === 'string' && /^[a-f0-9]{64}$/.test(file.sha256);
}

export function validateProfile(profile: unknown): asserts profile is GraphProfile {
  assert(hasFields(profile, ['formatVersion', 'snapshotRef', 'attemptId', 'sourceFiles', 'contexts']) &&
    profile.formatVersion === 1 && text(profile.snapshotRef) &&
    /^s4-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(profile.attemptId ?? '')),
  'Invalid graph profile.');
  const { sourceFiles, contexts } = profile;
  assert(Array.isArray(sourceFiles) && sourceFiles.length > 0 && sourceFiles.every(savedSourceFile) &&
    unique(sourceFiles.map(file => file.path)),
  'Use unique saved JS/TS paths with digests. Glob characters in filenames are unsupported.');
  const files = new Set(sourceFiles.map(file => file.path));
  assert(Array.isArray(contexts) && contexts.length > 0, 'Expected graph contexts.');
  for (const context of contexts) validateContext(context, files);
  const checked = contexts as GraphContext[];
  assert(unique(checked.map(context => context.id)), 'Context IDs must be unique.');
  for (const mode of ['import', 'require']) {
    const paths = checked.filter(context => context.conditionNames.includes(mode))
      .flatMap(context => context.sourceFiles);
    assert(new Set(paths).size === files.size,
      'Every saved scan file needs at least one ' + mode + ' context.');
  }
  const named = (kind: PassKind): string => checked.filter(context => context.compiledToCommonJS && kindOf(context) === kind)
    .map(context => JSON.stringify([context.sourceFiles, context.compiledToCommonJS])).sort().join('\n');
  assert(named('import') === named('commonjs'),
    'The import passes and the CommonJS passes must name the same files whose compiled code is CommonJS.');
}

function readRegular(path: string): Buffer {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + path);
  return readFileSync(path);
}

function checkSources(baseDir: string, files: SourceFile[]): void {
  for (const { path, sha256: digest } of files) {
    assert(sha256(readRegular(join(baseDir, path))) === digest, 'Saved source digest changed: ' + path);
  }
}

function checkOptionalTranspilers(toolRequire: NodeJS.Require): void {
  const optional = ['@babel/core', '@swc/core', 'coffeescript', 'coffee-script', 'livescript',
    'svelte/compiler', 'vue-template-compiler', '@vue/compiler-sfc'];
  for (const name of optional) {
    try {
      toolRequire.resolve(name);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') continue;
      throw error;
    }
    throw new Error('Unexpected optional transpiler in the graph image: ' + name);
  }
}

export async function loadTools(localRoot: string | undefined): Promise<Tools> {
  const root = localRoot || '/opt/choom-tools';
  assert(isAbsolute(root) && realpathSync(root) === root && root !== repo && !root.startsWith(repo + '/'),
    'Expected a canonical trusted tool directory.');
  const require = createRequire(join(root, 'package.json'));
  const dcRoot = join(root, 'node_modules/dependency-cruiser');
  const entry = join(dcRoot, 'src/main/index.mjs');
  const manifest = JSON.parse(readRegular(join(dcRoot, 'package.json')).toString()) as Fields;
  const ts = require.resolve('typescript');
  assert(realpathSync(entry) === entry && realpathSync(ts).startsWith(root + '/node_modules/typescript/') &&
    manifest.name === 'dependency-cruiser' && manifest.version === '18.7.2',
  'Expected dependency-cruiser 18.7.2 and TypeScript in the trusted tool directory.');
  const toolRequire = createRequire(entry);
  if (!localRoot) checkOptionalTranspilers(toolRequire);
  const typescript = (require(ts) as Fields).version;
  const { cruise, getAvailableTranspilers } = (await import(pathToFileURL(entry).href)) as DependencyCruiser;
  const transpilers = getAvailableTranspilers();
  assert(typescript === '6.0.2' &&
    transpilers.some(item => item.name === 'typescript' && item.available && item.currentVersion === 'typescript@6.0.2'),
  'Dependency-cruiser must use TypeScript 6.0.2.');
  assert(localRoot || transpilers.every(item => !item.available || ['javascript', 'typescript'].includes(item.name)),
    'Only JavaScript and TypeScript transpilers may be available in the graph image.');
  const resolverManifest = realpathSync(toolRequire.resolve('enhanced-resolve/package.json'));
  assert(resolverManifest.startsWith(root + '/node_modules/'), 'Expected the resolver in the trusted tool directory.');
  const enhancedResolve = (JSON.parse(readRegular(resolverManifest).toString()) as Fields).version;
  assert(enhancedResolve === '5.26.0', 'Expected enhanced-resolve 5.26.0.');
  return { cruise, versions: { node: process.versions.node, dependencyCruiser: manifest.version,
    typescript, enhancedResolve } };
}

function packageDependencies(baseDir: string): PackageLookup {
  const cache = new Map<string, Set<string>>();
  function from(directory: string): Set<string> {
    if (cache.has(directory)) return cache.get(directory) as Set<string>;
    const path = join(baseDir, directory, 'package.json');
    let names: Set<string>;
    try {
      const pkg: unknown = JSON.parse(readRegular(path).toString());
      const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
      names = new Set(fields.flatMap(key => {
        const declared = (pkg as Fields | null | undefined)?.[key];
        return object(declared) ? Object.keys(declared) : [];
      }));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      names = code === 'ENOENT' && directory !== '.' ? from(dirname(directory)) : new Set();
    }
    cache.set(directory, names);
    return names;
  }
  return path => from(dirname(path));
}

function packageName(specifier: string): string | undefined {
  return /^(?<name>@[\w.-]+\/[\w.-]+|[\w-][\w.-]*)(?:\/|$)/.exec(specifier)?.groups?.name;
}

function normalizedTarget(dep: RawDependency, scope: ReadonlySet<string>, declarations: ReadonlySet<string>,
  baseDir: string): Target {
  if (dep.coreModule) return { to: null, targetKind: 'builtin' };
  if (dep.couldNotResolve) {
    const name = packageName(dep.module as string);
    const declared = name !== undefined && declarations.has(name);
    return { to: null, targetKind: declared ? 'external' : 'unresolved' };
  }
  assert(relativePath(dep.resolved), 'Resolver returned a target outside the saved view: ' + String(dep.resolved));
  const target = join(baseDir, dep.resolved);
  assert(realpathSync(target) === target && lstatSync(target).isFile(),
    'Resolver did not return a regular saved file: ' + dep.resolved);
  return { to: dep.resolved, targetKind: scope.has(dep.resolved) ? 'internal' : 'context-boundary' };
}

// Whether a pass keeps a dependency of a scan file. A file whose compiled code is
// CommonJS loads its import syntax with require, so its CommonJS pass keeps those
// dependencies. It leaves the require calls to the require pass, and an import() that
// keeps the import condition to the import pass. Other files keep today's passes.
function dependencyFilter(context: GraphContext): (from: string, dep: RawDependency) => boolean {
  const kind = kindOf(context);
  const compiled = new Set(context.compiledToCommonJS?.files);
  const dynamicImport = context.compiledToCommonJS?.dynamicImportCondition === 'import';
  return (from, dep) => {
    if (kind === 'require' || !compiled.has(from)) return kind !== 'commonjs';
    const importCondition = dep.dynamic === true && dynamicImport;
    return kind === 'import' ? importCondition : dep.moduleSystem !== 'cjs' && !importCondition;
  };
}

function readEdges(context: GraphContext, raw: RawGraph, source: EdgeSource, declaredPackages: PackageLookup): Edge[] {
  assert(Array.isArray(raw.modules), 'Expected graph modules.');
  const keeps = dependencyFilter(context);
  const commonJSPass = kindOf(context) === 'commonjs';
  const scope = new Set(context.sourceFiles);
  const parsed = raw.modules.filter(module => !Object.hasOwn(module, 'followable'));
  assert(parsed.length === scope.size && unique(parsed.map(module => module.source)) &&
    parsed.every(module => scope.has(module.source) && Array.isArray(module.dependencies)),
  'Parsed graph sources differ from the context scan files.');
  assert(raw.modules.filter(module => Object.hasOwn(module, 'followable')).every(module =>
    module.followable === false && Array.isArray(module.dependencies) && module.dependencies.length === 0),
  'Expected unparsed targets to be dependency leaves.');
  const { attemptId, contextIndex, baseDir } = source;
  return raw.modules.flatMap((module, moduleIndex) => {
    if (Object.hasOwn(module, 'followable')) return [];
    const packages = declaredPackages(module.source);
    return module.dependencies.flatMap((dep, dependencyIndex) => {
      if (!context.moduleSystems.includes(dep.moduleSystem) || !keeps(module.source, dep)) return [];
      assert(text(dep.module) && Array.isArray(dep.dependencyTypes) && dep.dependencyTypes.every(text) &&
        typeof dep.coreModule === 'boolean' && typeof dep.couldNotResolve === 'boolean' &&
        dep.followable === false && dep.matchesDoNotFollow === true, 'Invalid raw dependency.');
      const specifier = dep.protocol && !dep.module.startsWith(dep.protocol) ? dep.protocol + dep.module : dep.module;
      // TypeScript compiles an import() that the CommonJS pass keeps into a require call,
      // which dependency-cruiser does not match with the import(). The compiled code keeps it.
      const compiledCall = commonJSPass && dep.dynamic === true;
      return [{
        id: `${attemptId}-edge-${contextIndex + 1}-${moduleIndex + 1}-${dependencyIndex + 1}`,
        from: module.source,
        specifier,
        ...normalizedTarget(dep, scope, packages, baseDir),
        dependencyTypes: compiledCall ? dep.dependencyTypes.filter(type => type !== 'pre-compilation-only') : dep.dependencyTypes,
        preCompilationOnly: compiledCall ? false : typeof dep.preCompilationOnly === 'boolean' ? dep.preCompilationOnly : null,
        dynamic: typeof dep.dynamic === 'boolean' ? dep.dynamic : null,
        evidenceRefs: [`${attemptId}-file@graph-results.json#/contexts/${contextIndex}/raw/modules/${moduleIndex}/dependencies/${dependencyIndex}`],
      }];
    });
  });
}

// What a pass keeps of the files whose compiled code is CommonJS. Stage 4 start gives
// their import() calls the import condition only with module Node16 to NodeNext or
// Preserve, with which TypeScript keeps the calls.
function compiledLimits(context: GraphContext): string[] {
  const dynamicImport = context.compiledToCommonJS?.dynamicImportCondition;
  if (dynamicImport === undefined) return [];
  if (kindOf(context) === 'import') return [dynamicImport === 'import'
    ? 'This pass keeps only the import() calls of the files whose compiled code is CommonJS, which TypeScript keeps with module Node16 to NodeNext or Preserve. The CommonJS pass keeps their other imports.'
    : 'This pass keeps no import of the files whose compiled code is CommonJS. The CommonJS pass keeps them.'];
  return ['This pass keeps only the imports of the files whose compiled code is CommonJS, with the require condition. ' +
    (dynamicImport === 'import' ? 'TypeScript keeps their import() calls with module Node16 to NodeNext or Preserve, so the import pass keeps them with the import condition. '
      : 'TypeScript compiles their import() calls into require calls, so these imports are not pre-compilation-only. ') +
    'It reads their require calls only to find the imports that the compiled code keeps; the require pass keeps the require calls.'];
}

function reachability(context: GraphContext, edges: Edge[]): Reachability {
  const roots = context.roots.map(root => root.path);
  const reached = new Set(roots);
  const queue = [...roots];
  const stoppedEdges: string[] = [];
  const outgoing = new Map(context.sourceFiles.map((path): [string, Edge[]] => [path, []]));
  for (const edge of edges) (outgoing.get(edge.from) as Edge[]).push(edge);
  for (let i = 0; i < queue.length; i++) {
    for (const edge of outgoing.get(queue[i] as string) as Edge[]) {
      // An internal edge always has a target in the context.
      const target = edge.to as string;
      if (edge.targetKind !== 'internal') {
        stoppedEdges.push(edge.id);
      } else if (!reached.has(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  }
  return {
    status: 'completed-with-limits',
    method: 'breadth-first traversal of retained internal source edges',
    roots,
    reached: [...reached].sort(),
    notReached: context.sourceFiles.filter(path => !reached.has(path)).sort(),
    stoppedEdges: stoppedEdges.sort(),
    edgePolicy: 'includes type-only, re-export, and literal-dynamic source dependencies; not runtime execution',
  };
}

export async function collect(profile: unknown, tools: Tools, baseDir: string): Promise<GraphResult> {
  validateProfile(profile);
  assert(realpathSync(baseDir) === baseDir && lstatSync(baseDir).isDirectory(),
    'Expected a canonical input directory.');
  checkSources(baseDir, profile.sourceFiles);
  const declaredPackages = packageDependencies(baseDir);
  const contexts: ContextResult[] = [];
  for (const [index, context] of profile.contexts.entries()) {
    const scanFiles = [...context.sourceFiles].sort();
    const result = { id: context.id, conditionNames: context.conditionNames,
      moduleSystems: context.moduleSystems, compilerSettingsRef: context.compilerSettingsRef,
      scanFiles, roots: context.roots, coverage: 'partial' };
    let raw: unknown = null;
    try {
      const alias = context.aliases.map(entry => ({
        ...entry,
        alias: baseDir + entry.alias.slice(repo.length),
        onlyModule: entry.onlyModule ?? !entry.name.endsWith('*'),
      }));
      const response = await tools.cruise(scanFiles, {
        baseDir, outputType: 'json', validate: false, cache: false, parser: 'tsc',
        tsPreCompilationDeps: 'specify', doNotFollow: '^', moduleSystems: context.moduleSystems,
      }, {
        exportsFields: ['exports'], importsFields: ['imports'], conditionNames: context.conditionNames,
        mainFields: ['main'], extensions, restrictions: [baseDir], modules: [], alias, plugins: [],
        pnpApi: null,
      }, { tsConfig: { options: context.compilerOptions } });
      assert(response.exitCode === 0 && typeof response.output === 'string', 'The graph reporter failed.');
      raw = JSON.parse(response.output);
      const edges = readEdges(context, raw as RawGraph, { attemptId: profile.attemptId, contextIndex: index, baseDir },
        declaredPackages);
      const contextLimits = ['Traversal stops at resolved targets outside this context, built-ins, external packages, and unresolved targets.'];
      if (!context.roots.length) contextLimits.push('This pass has no recorded traversal roots.');
      contextLimits.push(...compiledLimits(context));
      contexts.push({ ...result, status: 'completed', raw, edges, reachability: reachability(context, edges),
        limits: contextLimits });
    } catch (error) {
      contexts.push({ ...result, status: 'failed', raw, edges: [], reachability: null,
        limits: ['The graph context failed: ' + (error as Error).message] });
    }
  }
  checkSources(baseDir, profile.sourceFiles);
  return {
    formatVersion: 1,
    snapshotRef: profile.snapshotRef,
    profileRef: profile.attemptId + '-file@graph-profile.json',
    status: contexts.every(context => context.status === 'completed') ? 'completed' : 'partial',
    coverage: 'partial',
    toolVersions: tools.versions,
    contexts,
    limits,
  };
}

// The fixture source: an alias, a type-only import, a conditional package import,
// a missing file and package, a file outside the input, a built-in and a dynamic import.
function fixtureSource(scratch: string): Record<string, string> {
  return {
    'main.ts': `import { value } from '@/alias';
import type { Shape } from './types';
import { mode } from '#mode';
import './missing';
import 'missing-package';
import ${JSON.stringify(join(scratch, 'outside.ts'))};
import 'node:path';
void import('./lazy');
export const result: Shape = { value: value + mode };
`,
    'loader.cjs': "module.exports = require('#mode');\n",
    'legacy.cts': "import { mode } from '#mode';\nexport const legacy = mode;\n",
    'alias.ts': "export const value = 'alias';\n",
    'types.ts': 'export type Shape = { value: string };\n',
    'lazy.ts': 'export const value = true;\n',
    'import-mode.ts': "export const mode = 'import';\n",
    'require-mode.cjs': "exports.mode = 'require';\n",
    'orphan.ts': 'export const orphan = true;\n',
  };
}

// Writes the fixture input, a file outside it, its package manifest and target
// configuration files that throw if anything runs them.
function writeFixture(scratch: string, baseDir: string, source: Record<string, string>): void {
  mkdirSync(baseDir);
  for (const [path, contents] of Object.entries(source)) writeFileSync(join(baseDir, path), contents);
  writeFileSync(join(scratch, 'outside.ts'), 'throw new Error("outside");\n');
  writeFileSync(join(baseDir, 'package.json'), JSON.stringify({
    name: 'stage-four-fixture', type: 'module', dependencies: { 'missing-package': '1.0.0' },
    imports: { '#mode': { import: './import-mode.ts', require: './require-mode.cjs' } },
  }));
  for (const path of ['.dependency-cruiser.cjs', 'babel.config.cjs', 'vite.config.mjs'])
    writeFileSync(join(baseDir, path), 'throw new Error("target config ran");\n');
}

// An import, a require and a CommonJS pass over every fixture file, and two overlapping
// passes over two files. legacy.cts compiles to CommonJS, and with module ESNext
// TypeScript compiles an import() call of it into a require call.
function fixtureProfile(source: Record<string, string>): GraphProfile {
  const sourceFiles = Object.entries(source).map(([path, contents]) => ({ path, sha256: sha256(contents) }));
  const context = {
    compilerSettingsRef: null, sourceFiles: sourceFiles.map(file => file.path),
    compilerOptions: { target: 10, module: 99, jsx: 4, verbatimModuleSyntax: true },
    aliases: [{ name: '@/*', alias: '/repo/*' }],
  };
  const compiledToCommonJS = { files: ['legacy.cts'], dynamicImportCondition: 'require' };
  return {
    formatVersion: 1, snapshotRef: 'fixture', attemptId: 's4-fixture', sourceFiles,
    contexts: [
      { ...context, id: 'fixture-import', conditionNames: ['import', 'default'], compiledToCommonJS,
        moduleSystems: ['es6', 'tsd'], roots: [{ path: 'main.ts', evidenceRefs: ['fixture'] }] },
      { ...context, id: 'fixture-require', conditionNames: ['require', 'default'],
        moduleSystems: ['cjs'], roots: [{ path: 'loader.cjs', evidenceRefs: ['fixture'] }] },
      { ...context, id: 'overlap-import', sourceFiles: ['alias.ts', 'types.ts'], conditionNames: ['import', 'default'],
        moduleSystems: ['es6', 'tsd'], roots: [] },
      { ...context, id: 'overlap-require', sourceFiles: ['alias.ts', 'types.ts'], conditionNames: ['require', 'default'],
        moduleSystems: ['cjs'], roots: [] },
      { ...context, id: 'fixture-commonjs', conditionNames: ['require', 'default'], moduleSystems: ['es6', 'tsd', 'cjs'],
        compiledToCommonJS, roots: [] },
    ],
  };
}

// legacy.cts compiles to CommonJS: the CommonJS pass, not the import pass, keeps its one import, with the require target.
const compiledFixture = (imports: ContextResult, commonJS: ContextResult): boolean => !imports.edges.some(edge => edge.from === 'legacy.cts') &&
  commonJS.edges.length === 1 && commonJS.edges.every(edge => edge.from === 'legacy.cts' && edge.to === 'require-mode.cjs' && edge.preCompilationOnly === false);

function checkFixture(result: GraphResult, scratch: string): void {
  assert(result.status === 'completed', JSON.stringify(result.contexts.map(item => item.limits)));
  // A completed graph has the five contexts of the fixture profile, each with its reachability.
  const [imports, requires, overlap, , commonJS] = result.contexts as [ContextResult, ContextResult, ContextResult, unknown, ContextResult];
  const lookup = (specifier: string): Edge | undefined => imports.edges.find(edge => edge.specifier === specifier);
  const traversal = (context: ContextResult): Reachability => context.reachability as Reachability;
  assert(lookup('@/alias')?.to === 'alias.ts' && lookup('./types')?.preCompilationOnly &&
    lookup('./types')?.dependencyTypes.includes('type-only') && lookup('./lazy')?.dynamic &&
    lookup('./missing')?.targetKind === 'unresolved' && lookup('missing-package')?.targetKind === 'external' &&
    lookup(join(scratch, 'outside.ts'))?.targetKind === 'unresolved' &&
    lookup('node:path')?.targetKind === 'builtin' && lookup('#mode')?.to === 'import-mode.ts' &&
    requires.edges.some(edge => edge.specifier === '#mode' && edge.to === 'require-mode.cjs') && compiledFixture(imports, commonJS) &&
    traversal(imports).reached.includes('types.ts') && traversal(imports).notReached.includes('orphan.ts') &&
    traversal(overlap).reached.length === 0 && traversal(overlap).notReached.length === 2,
  'Fixture graph did not retain the expected dependencies and reachability.');
}

async function fixture(tools: Tools): Promise<FixtureApproval> {
  const scratch = realpathSync(mkdtempSync('/tmp/choom-stage4-'));
  const baseDir = join(scratch, 'repo');
  const source = fixtureSource(scratch);
  try {
    writeFixture(scratch, baseDir, source);
    const result = await collect(fixtureProfile(source), tools, baseDir);
    checkFixture(result, scratch);
    return { status: 'approved', toolVersions: tools.versions, contextCount: result.contexts.length };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// The command line starts only when Node runs this file. A test can import the
// functions above without starting it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [argument, ...extra] = process.argv.slice(2);
    assert(extra.length === 0 && argument !== undefined && ['--fixture', '/control/graph-profile.json'].includes(argument),
      'Use /control/graph-profile.json or --fixture.');
    const isFixture = argument === '--fixture';
    const tools = await loadTools(isFixture ? process.env.CHOOM_GRAPH_TOOLS : undefined);
    const result = isFixture ? await fixture(tools) :
      await collect(JSON.parse(readRegular(argument).toString()), tools, repo);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stderr.write((error as Error).message + '\n');
    process.exitCode = 1;
  }
}
