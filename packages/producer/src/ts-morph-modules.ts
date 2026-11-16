import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as TsMorph from 'ts-morph';
import { assert, type Fields, hash, object } from './record-checks.ts';
import type { ProjectTools } from './snapshot-project.ts';

// The ts-morph of the tool checkout, which divides a file by the symbol selectors
// of a baseline, with the SHA-256 of each module file that loading it read below
// the node_modules folder of the checkout: the module of ts-morph and each module
// that it loads, such as its TypeScript, by the path below node_modules. As Stage
// 5 start does, the pins leave out a module that a link places outside the
// checkout. Stage 5 start pins these files with its other parser modules
// (versions.modules in its handoff), and Stage 6 start pins them in its
// parserVersions. Before an action divides a file, it checks the module files
// against the pins of its start, so that a later ts-morph cannot change the
// division. The producer code record covers only packages/*/src.

/** Module files, each by its path below node_modules, with the SHA-256 of its bytes. */
export type ModuleDigests = Record<string, string>;
/** The versions of ts-morph and of its TypeScript, and its module files in path order. */
export interface TsMorphVersions { tsMorph: string; typescript: string; modules: ModuleDigests }

const nodeModules = fileURLToPath(new URL('../../../node_modules/', import.meta.url));
const require = createRequire(import.meta.url);

// The files of a loaded module and of each module that it loads, as the module
// loader records them, below the node_modules folder of the checkout.
function moduleFiles(entry: string): string[] {
  const files = new Set<string>();
  const pending = [require.cache[entry]];
  for (let loaded = pending.pop(); loaded !== undefined; loaded = pending.pop()) {
    if (files.has(loaded.filename)) continue;
    files.add(loaded.filename);
    pending.push(...loaded.children);
  }
  return [...files].filter(file => file.startsWith(nodeModules)).sort();
}

/** The ts-morph of the tool checkout that holds this module, and its versions. */
export function loadTsMorph(): { tools: ProjectTools; versions: TsMorphVersions } {
  const path = require.resolve('ts-morph');
  assert(path.startsWith(nodeModules + 'ts-morph/') && realpathSync(path) === path, 'Use the trusted installation of ts-morph.');
  const tools = require(path) as typeof TsMorph;
  const files = moduleFiles(path);
  const metadata = JSON.parse(readFileSync(join(nodeModules, 'ts-morph/package.json'), 'utf8')) as Fields;
  return { tools, versions: { tsMorph: String(metadata.version), typescript: tools.ts.version,
    modules: Object.fromEntries(files.map(file => [file.slice(nodeModules.length), hash(readFileSync(file))])) } };
}

/**
 * Refuses module files of ts-morph that the pins of `start`, such as Stage 5
 * start, do not name with the same SHA-256. The pins can also name other modules.
 */
export function checkPinnedModules(modules: ModuleDigests, pinned: unknown, start: string): void {
  assert(object(pinned), `The ${start} saved no pins of parser modules.`);
  for (const [path, sha256] of Object.entries(modules))
    assert(pinned[path] === sha256, `Trusted parser module changed since ${start}: ${path}`);
}
