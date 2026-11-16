import { assert, type Fields, object, text } from './record-checks.ts';
import type { Picomatch } from './stage-4-graph-profile.ts';

// The behavior entry candidates that the Knip plugin patterns of the Stage 2 profile
// give. Stage 2 copied the default entry patterns of the Knip plugins that the
// dependencies turn on into the entry patterns of the workspaces, and recorded each
// copied pattern in its preflight record (pluginEntryPatterns). Knip's JSON report
// lists issues, not entries, so Stage 4 collect matches each copied pattern against
// the indexed files itself: a file that a pattern selects is a candidate with
// `found: knip-plugin-pattern`, next to the candidates of the Choom syntax rules.

// The copied patterns of the registered Stage 2 preflight record, and the workspaces of the profile.
export interface PluginPatternSource { preflightRef: string; patterns: Fields[]; workspaces: string[] }
interface IndexedFile { path: string; kind: string; sha256: string }

const sourceKeys = ['workspace', 'manifest', 'plugin', 'dependency', 'field', 'pattern'];

function registered(artifacts: ReadonlyMap<string, Buffer>, ref: unknown): Fields | undefined {
  const bytes = typeof ref === 'string' ? artifacts.get(ref) : undefined;
  const value: unknown = bytes === undefined ? undefined : JSON.parse(bytes.toString('utf8'));
  return object(value) ? value : undefined;
}

// The copied patterns that the Knip receipts of the selected entry analysis name, checked as collect reads them.
export function registeredPluginPatterns(artifacts: ReadonlyMap<string, Buffer>, knipRunsRef: unknown): PluginPatternSource {
  const runs = registered(artifacts, knipRunsRef);
  const preflight = registered(artifacts, runs?.preflightRef);
  const profile = registered(artifacts, runs?.profileRef);
  assert(preflight && object(profile?.workspaces), 'The Knip receipts ' + knipRunsRef +
    ' do not name a registered profile and its preflight record.');
  const workspaces = Object.keys(profile.workspaces as Fields);
  const patterns = preflight.pluginEntryPatterns;
  assert(Array.isArray(patterns) && patterns.every(item => object(item) && sourceKeys.every(key => text(item[key])) &&
    workspaces.includes(item.workspace as string) && ['entry', 'production'].includes(item.field as string)),
  'The Knip preflight record ' + runs?.preflightRef + ' has no valid list of copied plugin patterns (pluginEntryPatterns).');
  return { preflightRef: runs?.preflightRef as string, patterns: patterns as Fields[], workspaces };
}

// Each indexed regular file that a copied pattern selects, in the folder of its
// workspace, by the order of the patterns and then of the paths. A pattern matches the
// path in the folder of its workspace with picomatch and dot files, as Knip globs, and
// without the final `!` of a production pattern. A file of another workspace of the
// profile inside that folder is left to the patterns of that workspace.
export function pluginPatternCandidates(source: PluginPatternSource, files: readonly IndexedFile[], picomatch: Picomatch,
  roleOf: (path: string) => { role: string; roleRef: string | null }): Fields[] {
  const regular = files.filter(file => file.kind === 'file').sort((left, right) => left.path < right.path ? -1 : 1);
  return source.patterns.flatMap((copied, index) => {
    const workspace = copied.workspace as string;
    const folder = workspace === '.' ? '' : workspace + '/';
    const inner = source.workspaces.filter(dir => dir !== workspace && dir !== '.' && (dir + '/').startsWith(folder));
    const selects = picomatch((copied.pattern as string).replace(/!$/, ''), { dot: true });
    return regular.filter(file => file.path.startsWith(folder) && !inner.some(dir => file.path.startsWith(dir + '/')) &&
      selects(file.path.slice(folder.length)))
      .map(file => ({ found: 'knip-plugin-pattern', ...roleOf(file.path), path: file.path, sha256: file.sha256,
        ...Object.fromEntries(sourceKeys.map(key => [key, copied[key]])),
        patternRef: source.preflightRef + '#/pluginEntryPatterns/' + index }));
  });
}
