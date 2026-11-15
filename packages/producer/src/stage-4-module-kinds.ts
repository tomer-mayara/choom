import { posix } from 'node:path';

// The module kind of the code that runs for a saved source file. It decides the
// condition that the Stage 4 graph resolves the file's import syntax with.
// TypeScript that compiles to CommonJS turns its import statements into require
// calls. JavaScript, and TypeScript whose compiled code keeps the syntax as
// written, keep the rule of the syntax: import syntax with the import condition and
// require calls with the require condition. A file of unknown kind keeps that rule too.
export type ModuleKind = 'module' | 'commonjs' | 'syntax' | 'unknown';
export type KindRule = 'extension' | 'compiler-module' | 'package-type' | 'syntax' | 'unknown';
// The compiler module setting of a compiler context and its reference in the settings record.
export interface CompilerModule { value: number; ref: string }
// The nearest indexed package.json above a file with the value of its type field,
// or why it cannot be read. Null: no indexed package.json is above the file.
export type NearestPackage = { path: string; type: unknown } | { path: string; unreadable: string } | null;
// The kind, the rule that decided it, and the compiler setting or package.json that the rule used.
export interface EmittedKind {
  kind: ModuleKind; decidedBy: KindRule; setting: string | null; packageJson: string | null; reason: string | null;
}
// The files of a compiler context whose compiled code is CommonJS, and the condition
// of their import() calls: require with module CommonJS, which compiles them into
// require calls, and import with any other setting, which keeps them.
export interface CompiledToCommonJS { files: string[]; dynamicImportCondition: 'import' | 'require' }
// The module kind of each file of a compiler context that its syntax does not decide.
export interface ContextKinds { compiled: CompiledToCommonJS | null; records: (EmittedKind & { path: string })[] }

// The ModuleKind values of TypeScript.
const commonJSModule = 1;
const esModuleOutput = new Set([5, 6, 7, 99]);
const packageTypeOutput = new Set([100, 101, 102, 199]);
const preserveModule = 200;
const unresolvedOutput: Record<number, string> = { 0: 'None', 2: 'AMD', 3: 'UMD', 4: 'System' };

function decided(kind: ModuleKind, decidedBy: KindRule, more: Partial<EmittedKind> = {}): EmittedKind {
  return { kind, decidedBy, setting: null, packageJson: null, reason: null, ...more };
}

function packageKind(found: NearestPackage, setting: string): EmittedKind {
  if (found === null) return decided('commonjs', 'package-type', { setting,
    reason: 'No indexed package.json is above the file, so Node runs its compiled code as CommonJS.' });
  const packageJson = found.path;
  if ('unreadable' in found) return decided('unknown', 'unknown', { setting, packageJson, reason: `${packageJson} ${found.unreadable}.` });
  if (found.type === undefined || found.type === 'commonjs') return decided('commonjs', 'package-type', { setting, packageJson });
  if (found.type === 'module') return decided('module', 'package-type', { setting, packageJson });
  return decided('unknown', 'unknown', { setting, packageJson,
    reason: `The type of ${packageJson} is not module or commonjs: ${JSON.stringify(found.type)}.` });
}

// .mts and .cts decide by their extension, as Node does for the compiled .mjs and
// .cjs files. For .ts and .tsx the compiler module setting decides, or with Node16
// to NodeNext the type of the nearest package.json. nearestPackage is read only then.
export function emittedKind(path: string, compilerModule: CompilerModule | null,
  nearestPackage: (path: string) => NearestPackage): EmittedKind {
  if (path.endsWith('.mts')) return decided('module', 'extension');
  if (path.endsWith('.cts')) return decided('commonjs', 'extension');
  if (!/\.tsx?$/.test(path) || compilerModule === null || compilerModule.value === preserveModule) return decided('syntax', 'syntax');
  const setting = compilerModule.ref;
  if (compilerModule.value === commonJSModule) return decided('commonjs', 'compiler-module', { setting });
  if (esModuleOutput.has(compilerModule.value)) return decided('module', 'compiler-module', { setting });
  if (packageTypeOutput.has(compilerModule.value)) return packageKind(nearestPackage(path), setting);
  const name = unresolvedOutput[compilerModule.value] ?? String(compilerModule.value);
  return decided('unknown', 'unknown', { setting,
    reason: `The compiler module setting ${name} gives code that the graph does not resolve by module kind.` });
}

// The module kinds of the files of one compiler context of the graph profile. Its
// module setting comes from the options of the context and the reference of its
// compiler settings in the settings record (null for the configuration-free fallback).
export function contextKinds(paths: string[], options: Record<string, unknown>, ref: string | null,
  nearestPackage: (path: string) => NearestPackage): ContextKinds {
  const compilerModule = typeof options.module === 'number' && ref !== null
    ? { value: options.module, ref: ref + '/compilerOptions/module' } : null;
  const kinds = paths.map(path => ({ path, ...emittedKind(path, compilerModule, nearestPackage) }));
  const files = kinds.filter(({ kind }) => kind === 'commonjs').map(({ path }) => path);
  const dynamicImportCondition = compilerModule?.value === commonJSModule ? 'require' : 'import';
  return { compiled: files.length ? { files, dynamicImportCondition } : null, records: kinds.filter(({ kind }) => kind !== 'syntax') };
}

function readPackage(path: string, bytes: Buffer): NearestPackage {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { path, unreadable: 'is not valid JSON' };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { path, unreadable: 'is not a JSON object' };
  return { path, type: (value as Record<string, unknown>).type };
}

// The nearest package.json above each file, from the indexed snapshot files only,
// as Node looks for it. read gives the checked bytes of an indexed file; each
// package.json is read once.
export function packageLookup(indexed: { has(path: string): boolean }, read: (path: string) => Buffer):
  (path: string) => NearestPackage {
  const found = new Map<string, NearestPackage>();
  function nearest(directory: string): NearestPackage {
    if (found.has(directory)) return found.get(directory) as NearestPackage;
    const path = directory === '.' ? 'package.json' : directory + '/package.json';
    const result = indexed.has(path) ? readPackage(path, read(path)) : directory === '.' ? null : nearest(posix.dirname(directory));
    found.set(directory, result);
    return result;
  }
  return path => nearest(posix.dirname(path));
}
