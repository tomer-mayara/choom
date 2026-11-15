import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = '/repo';
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const compilerKeys = ['target', 'module', 'moduleResolution', 'jsx', 'verbatimModuleSyntax'];
const extensions = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.d.mts', '.d.cts',
  '.js', '.jsx', '.mjs', '.cjs', '.json'];
const limits = [
  'This graph describes saved source dependencies. Runtime execution and unused-file judgments are outside its coverage.',
  'The resolver uses the recorded conditions and simple saved aliases. Target configuration, plugins, builds, and tests remain unexecuted.',
  'Installed target dependencies are unavailable. Declared external imports without a saved target are unresolved.',
  'Bun and Node runtime resolution, bundler behavior, and type-specific package conditions are outside this profile.',
  'Built-in labels come from the analyzer runtime and dependency-cruiser. Their availability in the target runtime is unverified.',
  'Each pass retains its selected module systems. Traversal stays within that pass.',
  'The pinned graph can drop import kind and type-only labels from unresolved dependencies. It can collapse static and dynamic imports of the same specifier.',
  'Use saved syntax evidence for import sites and computed loading, including occurrences that the graph does not retain.',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const unique = values => new Set(values).size === values.length;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stringList = values => Array.isArray(values) && values.every(text) && unique(values);

function hasFields(value, required, optional = []) {
  return object(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function relativePath(path) {
  return text(path) && !isAbsolute(path) && !/[\\\u0000-\u001f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

function sourcePath(path) {
  return relativePath(path) && sourceExtension.test(path) && !/[!*?{}\[\]()]/.test(path);
}

function validAlias(entry) {
  return hasFields(entry, ['name', 'alias'], ['onlyModule']) &&
    typeof entry.name === 'string' && /^[A-Za-z0-9@._/-]+\*?$/.test(entry.name) &&
    typeof entry.alias === 'string' && entry.alias.startsWith('/repo/') &&
    posix.normalize(entry.alias) === entry.alias &&
    /^[A-Za-z0-9._/-]+\*?$/.test(entry.alias) &&
    entry.name.endsWith('*') === entry.alias.endsWith('*') &&
    (!Object.hasOwn(entry, 'onlyModule') || entry.onlyModule === !entry.name.endsWith('*'));
}

function validateContext(context, files) {
  assert(hasFields(context, ['id', 'compilerSettingsRef', 'sourceFiles', 'compilerOptions',
    'aliases', 'conditionNames', 'moduleSystems', 'roots']) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(context.id ?? '') &&
    (context.compilerSettingsRef === null || text(context.compilerSettingsRef)),
  'Invalid graph context.');
  assert(stringList(context.sourceFiles) && context.sourceFiles.length > 0 &&
    context.sourceFiles.every(path => files.has(path)),
  'Context scan files must be unique saved source paths: ' + context.id);
  assert(hasFields(context.compilerOptions, [], compilerKeys) &&
    Object.entries(context.compilerOptions).every(([key, value]) =>
      key === 'verbatimModuleSyntax' ? typeof value === 'boolean' : Number.isSafeInteger(value) && value >= 0),
  'Unsupported compiler options: ' + context.id);
  assert(Array.isArray(context.aliases) && context.aliases.every(validAlias) &&
    unique(context.aliases.map(entry => entry.name)),
  'Expected simple, unique aliases within /repo: ' + context.id);
  const commonJS = stringList(context.moduleSystems) && context.moduleSystems.length === 1 &&
    context.moduleSystems[0] === 'cjs';
  const esModules = stringList(context.moduleSystems) && context.moduleSystems.length === 2 &&
    context.moduleSystems.includes('es6') && context.moduleSystems.includes('tsd');
  assert((commonJS || esModules) && stringList(context.conditionNames) &&
    context.conditionNames.includes('default') &&
    context.conditionNames.includes(commonJS ? 'require' : 'import') &&
    !context.conditionNames.includes(commonJS ? 'import' : 'require') &&
    context.conditionNames.every(name => ['import', 'require', 'default', 'browser', 'node', 'bun'].includes(name)) &&
    context.conditionNames.filter(name => ['browser', 'node', 'bun'].includes(name)).length <= 1,
  'Use separate import and require conditions: ' + context.id);
  const scope = new Set(context.sourceFiles);
  assert(Array.isArray(context.roots) && context.roots.every(root =>
    hasFields(root, ['path', 'evidenceRefs']) && scope.has(root.path) &&
    stringList(root.evidenceRefs) && root.evidenceRefs.length > 0) &&
    unique(context.roots.map(root => root.path)),
  'Each traversal root needs a scan file and saved evidence: ' + context.id);
}

function validateProfile(profile) {
  assert(hasFields(profile, ['formatVersion', 'snapshotRef', 'attemptId', 'sourceFiles', 'contexts']) &&
    profile.formatVersion === 1 && text(profile.snapshotRef) &&
    /^s4-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.attemptId ?? ''),
  'Invalid graph profile.');
  assert(Array.isArray(profile.sourceFiles) && profile.sourceFiles.length > 0 &&
    profile.sourceFiles.every(file => hasFields(file, ['path', 'sha256']) && sourcePath(file.path) &&
      typeof file.sha256 === 'string' && /^[a-f0-9]{64}$/.test(file.sha256)) &&
    unique(profile.sourceFiles.map(file => file.path)),
  'Use unique saved JS/TS paths with digests. Glob characters in filenames are unsupported.');
  const files = new Set(profile.sourceFiles.map(file => file.path));
  assert(Array.isArray(profile.contexts) && profile.contexts.length > 0, 'Expected graph contexts.');
  for (const context of profile.contexts) validateContext(context, files);
  assert(unique(profile.contexts.map(context => context.id)), 'Context IDs must be unique.');
  for (const mode of ['import', 'require']) {
    const paths = profile.contexts.filter(context => context.conditionNames.includes(mode))
      .flatMap(context => context.sourceFiles);
    assert(new Set(paths).size === files.size,
      'Every saved scan file needs at least one ' + mode + ' context.');
  }
}

function readRegular(path) {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + path);
  return readFileSync(path);
}

function checkSources(baseDir, files) {
  for (const { path, sha256: digest } of files) {
    assert(sha256(readRegular(join(baseDir, path))) === digest, 'Saved source digest changed: ' + path);
  }
}

function checkOptionalTranspilers(toolRequire) {
  const optional = ['@babel/core', '@swc/core', 'coffeescript', 'coffee-script', 'livescript',
    'svelte/compiler', 'vue-template-compiler', '@vue/compiler-sfc'];
  for (const name of optional) {
    try {
      toolRequire.resolve(name);
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') continue;
      throw error;
    }
    throw new Error('Unexpected optional transpiler in the graph image: ' + name);
  }
}

async function loadTools(localRoot) {
  const root = localRoot || '/opt/choom-tools';
  assert(isAbsolute(root) && realpathSync(root) === root && root !== repo && !root.startsWith(repo + '/'),
    'Expected a canonical trusted tool directory.');
  const require = createRequire(join(root, 'package.json'));
  const dcRoot = join(root, 'node_modules/dependency-cruiser');
  const entry = join(dcRoot, 'src/main/index.mjs');
  const manifest = JSON.parse(readRegular(join(dcRoot, 'package.json')));
  const ts = require.resolve('typescript');
  assert(realpathSync(entry) === entry && realpathSync(ts).startsWith(root + '/node_modules/typescript/') &&
    manifest.name === 'dependency-cruiser' && manifest.version === '18.7.2',
  'Expected dependency-cruiser 18.7.2 and TypeScript in the trusted tool directory.');
  const toolRequire = createRequire(entry);
  if (!localRoot) checkOptionalTranspilers(toolRequire);
  const typescript = require(ts).version;
  const { cruise, getAvailableTranspilers } = await import(pathToFileURL(entry).href);
  const transpilers = getAvailableTranspilers();
  assert(typescript === '6.0.2' &&
    transpilers.some(item => item.name === 'typescript' && item.available && item.currentVersion === 'typescript@6.0.2'),
  'Dependency-cruiser must use TypeScript 6.0.2.');
  assert(localRoot || transpilers.every(item => !item.available || ['javascript', 'typescript'].includes(item.name)),
    'Only JavaScript and TypeScript transpilers may be available in the graph image.');
  const resolverManifest = realpathSync(toolRequire.resolve('enhanced-resolve/package.json'));
  assert(resolverManifest.startsWith(root + '/node_modules/'), 'Expected the resolver in the trusted tool directory.');
  const enhancedResolve = JSON.parse(readRegular(resolverManifest)).version;
  assert(enhancedResolve === '5.26.0', 'Expected enhanced-resolve 5.26.0.');
  return { cruise, versions: { node: process.versions.node, dependencyCruiser: manifest.version,
    typescript, enhancedResolve } };
}

function packageDependencies(baseDir) {
  const cache = new Map();
  function from(directory) {
    if (cache.has(directory)) return cache.get(directory);
    const path = join(baseDir, directory, 'package.json');
    let names;
    try {
      const pkg = JSON.parse(readRegular(path));
      const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
      names = new Set(fields.flatMap(key => object(pkg?.[key]) ? Object.keys(pkg[key]) : []));
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      names = error.code === 'ENOENT' && directory !== '.' ? from(dirname(directory)) : new Set();
    }
    cache.set(directory, names);
    return names;
  }
  return path => from(dirname(path));
}

function packageName(specifier) {
  return /^(?<name>@[\w.-]+\/[\w.-]+|[\w-][\w.-]*)(?:\/|$)/.exec(specifier)?.groups.name;
}

function normalizedTarget(dep, scope, declarations, baseDir) {
  if (dep.coreModule) return { to: null, targetKind: 'builtin' };
  if (dep.couldNotResolve) {
    const declared = declarations.has(packageName(dep.module));
    return { to: null, targetKind: declared ? 'external' : 'unresolved' };
  }
  assert(relativePath(dep.resolved), 'Resolver returned a target outside the saved view: ' + dep.resolved);
  const target = join(baseDir, dep.resolved);
  assert(realpathSync(target) === target && lstatSync(target).isFile(),
    'Resolver did not return a regular saved file: ' + dep.resolved);
  return { to: dep.resolved, targetKind: scope.has(dep.resolved) ? 'internal' : 'context-boundary' };
}

function readEdges(context, raw, baseDir, attemptId, contextIndex, declaredPackages) {
  assert(Array.isArray(raw.modules), 'Expected graph modules.');
  const scope = new Set(context.sourceFiles);
  const parsed = raw.modules.filter(module => !Object.hasOwn(module, 'followable'));
  assert(parsed.length === scope.size && unique(parsed.map(module => module.source)) &&
    parsed.every(module => scope.has(module.source) && Array.isArray(module.dependencies)),
  'Parsed graph sources differ from the context scan files.');
  assert(raw.modules.filter(module => Object.hasOwn(module, 'followable')).every(module =>
    module.followable === false && Array.isArray(module.dependencies) && module.dependencies.length === 0),
  'Expected unparsed targets to be dependency leaves.');
  return raw.modules.flatMap((module, moduleIndex) => {
    if (Object.hasOwn(module, 'followable')) return [];
    const packages = declaredPackages(module.source);
    return module.dependencies.flatMap((dep, dependencyIndex) => {
      if (!context.moduleSystems.includes(dep.moduleSystem)) return [];
      assert(text(dep.module) && Array.isArray(dep.dependencyTypes) && dep.dependencyTypes.every(text) &&
        typeof dep.coreModule === 'boolean' && typeof dep.couldNotResolve === 'boolean' &&
        dep.followable === false && dep.matchesDoNotFollow === true, 'Invalid raw dependency.');
      const specifier = dep.protocol && !dep.module.startsWith(dep.protocol) ? dep.protocol + dep.module : dep.module;
      return [{
        id: `${attemptId}-edge-${contextIndex + 1}-${moduleIndex + 1}-${dependencyIndex + 1}`,
        from: module.source,
        specifier,
        ...normalizedTarget(dep, scope, packages, baseDir),
        dependencyTypes: dep.dependencyTypes,
        preCompilationOnly: typeof dep.preCompilationOnly === 'boolean' ? dep.preCompilationOnly : null,
        dynamic: typeof dep.dynamic === 'boolean' ? dep.dynamic : null,
        evidenceRefs: [`${attemptId}-file@graph-results.json#/contexts/${contextIndex}/raw/modules/${moduleIndex}/dependencies/${dependencyIndex}`],
      }];
    });
  });
}

function reachability(context, edges) {
  const roots = context.roots.map(root => root.path);
  const reached = new Set(roots);
  const queue = [...roots];
  const stoppedEdges = [];
  const outgoing = new Map(context.sourceFiles.map(path => [path, []]));
  for (const edge of edges) outgoing.get(edge.from).push(edge);
  for (let i = 0; i < queue.length; i++) {
    for (const edge of outgoing.get(queue[i])) {
      if (edge.targetKind !== 'internal') {
        stoppedEdges.push(edge.id);
      } else if (!reached.has(edge.to)) {
        reached.add(edge.to);
        queue.push(edge.to);
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

async function collect(profile, tools, baseDir) {
  validateProfile(profile);
  assert(realpathSync(baseDir) === baseDir && lstatSync(baseDir).isDirectory(),
    'Expected a canonical input directory.');
  checkSources(baseDir, profile.sourceFiles);
  const declaredPackages = packageDependencies(baseDir);
  const contexts = [];
  for (const [index, context] of profile.contexts.entries()) {
    const scanFiles = [...context.sourceFiles].sort();
    const result = { id: context.id, conditionNames: context.conditionNames,
      moduleSystems: context.moduleSystems, compilerSettingsRef: context.compilerSettingsRef,
      scanFiles, roots: context.roots, coverage: 'partial' };
    let raw = null;
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
      const edges = readEdges(context, raw, baseDir, profile.attemptId, index, declaredPackages);
      const contextLimits = ['Traversal stops at resolved targets outside this context, built-ins, external packages, and unresolved targets.'];
      if (!context.roots.length) contextLimits.push('This pass has no recorded traversal roots.');
      contexts.push({ ...result, status: 'completed', raw, edges, reachability: reachability(context, edges),
        limits: contextLimits });
    } catch (error) {
      contexts.push({ ...result, status: 'failed', raw, edges: [], reachability: null,
        limits: ['The graph context failed: ' + error.message] });
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

async function fixture(tools) {
  const scratch = realpathSync(mkdtempSync('/tmp/choom-stage4-'));
  const baseDir = join(scratch, 'repo');
  const source = {
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
    'alias.ts': "export const value = 'alias';\n",
    'types.ts': 'export type Shape = { value: string };\n',
    'lazy.ts': 'export const value = true;\n',
    'import-mode.ts': "export const mode = 'import';\n",
    'require-mode.cjs': "exports.mode = 'require';\n",
    'orphan.ts': 'export const orphan = true;\n',
  };
  try {
    mkdirSync(baseDir);
    for (const [path, contents] of Object.entries(source)) writeFileSync(join(baseDir, path), contents);
    writeFileSync(join(scratch, 'outside.ts'), 'throw new Error("outside");\n');
    writeFileSync(join(baseDir, 'package.json'), JSON.stringify({
      name: 'stage-four-fixture', type: 'module', dependencies: { 'missing-package': '1.0.0' },
      imports: { '#mode': { import: './import-mode.ts', require: './require-mode.cjs' } },
    }));
    for (const path of ['.dependency-cruiser.cjs', 'babel.config.cjs', 'vite.config.mjs'])
      writeFileSync(join(baseDir, path), 'throw new Error("target config ran");\n');
    const sourceFiles = Object.entries(source).map(([path, contents]) => ({ path, sha256: sha256(contents) }));
    const context = {
      compilerSettingsRef: null, sourceFiles: sourceFiles.map(file => file.path),
      compilerOptions: { target: 10, module: 99, jsx: 4, verbatimModuleSyntax: true },
      aliases: [{ name: '@/*', alias: '/repo/*' }],
    };
    const profile = {
      formatVersion: 1, snapshotRef: 'fixture', attemptId: 's4-fixture', sourceFiles,
      contexts: [
        { ...context, id: 'fixture-import', conditionNames: ['import', 'default'],
          moduleSystems: ['es6', 'tsd'], roots: [{ path: 'main.ts', evidenceRefs: ['fixture'] }] },
        { ...context, id: 'fixture-require', conditionNames: ['require', 'default'],
          moduleSystems: ['cjs'], roots: [{ path: 'loader.cjs', evidenceRefs: ['fixture'] }] },
        { ...context, id: 'overlap-import', sourceFiles: ['alias.ts', 'types.ts'], conditionNames: ['import', 'default'],
          moduleSystems: ['es6', 'tsd'], roots: [] },
        { ...context, id: 'overlap-require', sourceFiles: ['alias.ts', 'types.ts'], conditionNames: ['require', 'default'],
          moduleSystems: ['cjs'], roots: [] },
      ],
    };
    const result = await collect(profile, tools, baseDir);
    assert(result.status === 'completed', JSON.stringify(result.contexts.map(item => item.limits)));
    const [imports, requires, overlap] = result.contexts;
    const lookup = specifier => imports.edges.find(edge => edge.specifier === specifier);
    assert(lookup('@/alias')?.to === 'alias.ts' && lookup('./types')?.preCompilationOnly &&
      lookup('./types').dependencyTypes.includes('type-only') && lookup('./lazy')?.dynamic &&
      lookup('./missing')?.targetKind === 'unresolved' && lookup('missing-package')?.targetKind === 'external' &&
      lookup(join(scratch, 'outside.ts'))?.targetKind === 'unresolved' &&
      lookup('node:path')?.targetKind === 'builtin' && lookup('#mode')?.to === 'import-mode.ts' &&
      requires.edges.some(edge => edge.specifier === '#mode' && edge.to === 'require-mode.cjs') &&
      imports.reachability.reached.includes('types.ts') && imports.reachability.notReached.includes('orphan.ts') &&
      overlap.reachability.reached.length === 0 && overlap.reachability.notReached.length === 2,
    'Fixture graph did not retain the expected dependencies and reachability.');
    return { status: 'approved', toolVersions: tools.versions, contextCount: result.contexts.length };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  const [argument, ...extra] = process.argv.slice(2);
  assert(extra.length === 0 && ['--fixture', '/control/graph-profile.json'].includes(argument),
    'Use /control/graph-profile.json or --fixture.');
  const isFixture = argument === '--fixture';
  const tools = await loadTools(isFixture ? process.env.CHOOM_GRAPH_TOOLS : undefined);
  const result = isFixture ? await fixture(tools) :
    await collect(JSON.parse(readRegular(argument)), tools, repo);
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
