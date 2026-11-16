// The default entry patterns of the Knip plugins that the dependencies of the
// workspace manifests turn on, from the plugin definitions of the installed Knip
// 6.44.1. The Stage 2 profile keeps every plugin turned off, so Knip never loads a
// settings file, which can be a script. Instead the profile copies the static
// `entry` and `production` patterns of each such plugin into the entry patterns of
// the workspace, in the form that Knip gives a production entry (a final `!`), and
// records their source. A pattern that names a settings file stays out, so the
// settings file stays a plain file, and a negation stays out, because in the entry
// patterns of a workspace it would also remove other entries.

// The fields of a plugin definition of Knip 6.44.1 that the selection reads. `enablers`
// holds dependency names and patterns, or a text when files turn the plugin on.
export interface KnipPlugin {
  name: string;
  enablers?: unknown;
  entry?: unknown;
  production?: unknown;
  config?: unknown;
  isRootOnly?: unknown;
}
// A package manifest of the snapshot: its path, the workspace of the entry plan whose
// manifest it is or null, and its parsed value.
export interface SnapshotManifest { path: string; workspace: string | null; value: Record<string, unknown> }
interface PluginSource { workspace: string; manifest: string; plugin: string; dependency: string }
// A copied pattern, as the profile holds it.
export interface CopiedPattern extends PluginSource { field: 'entry' | 'production'; pattern: string }
// A pattern of Knip that the profile does not hold, and why.
export interface PatternNotCopied extends CopiedPattern { reason: string }
// A plugin that a dependency turns on but that adds no pattern, and why.
export interface PluginNotCopied extends Omit<PluginSource, 'workspace'> { workspace: string | null; reason: string }
export interface PluginPatterns { copied: CopiedPattern[]; patternsNotCopied: PatternNotCopied[]; pluginsNotCopied: PluginNotCopied[] }

export const pluginReasons = {
  noStaticPatterns: 'Knip 6.44.1 gives this plugin no static entry or production patterns: its entries come from its ' +
    'settings file or from its own code, which this profile does not run.',
  everyPatternLeftOut: 'Each static pattern of this plugin names a settings file or is a negation, so the profile copies none.',
  rootOnly: 'Knip 6.44.1 uses this plugin only in the root workspace.',
  notWorkspace: 'The manifest is not the manifest of a workspace of the entry plan, so the profile has no entry patterns ' +
    'for its folder.',
  settingsFile: 'The pattern names a settings file, which stays a plain file and not an entry.',
  negation: 'The pattern is a negation. In the entry patterns of the workspace, it would also remove the entries of the ' +
    'plan and of the other plugins.',
  notRelative: 'The pattern is not a relative pattern in the workspace.',
};

const patternsOf = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null;
const dependencyFields = ['dependencies', 'devDependencies'];

// The dependencies and development dependencies of a manifest, as Knip reads them to turn plugins on.
function dependenciesOf(manifest: SnapshotManifest): string[] {
  const names = dependencyFields.flatMap(field => {
    const value = manifest.value[field];
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  });
  return [...new Set(names)].sort();
}

// The first dependency that an enabler of the plugin matches, by the order of the enablers.
function dependencyFor(plugin: KnipPlugin, names: string[]): string | undefined {
  if (!Array.isArray(plugin.enablers)) return undefined;
  for (const enabler of plugin.enablers as unknown[]) {
    const matches = (name: string): boolean => typeof enabler === 'string' ? name === enabler
      : enabler instanceof RegExp && new RegExp(enabler.source, enabler.flags.replace('g', '')).test(name);
    const found = names.find(matches);
    if (found !== undefined) return found;
  }
  return undefined;
}

// Whether a pattern names a settings file: a settings-file pattern (`config`) of a
// plugin of Knip, or a file name that holds `config` or that ends with `rc`, such
// as `tailwind.config.{js,ts}` or `.bumprc`. Some plugins of Knip 6.44.1 list their
// settings files as entry patterns.
function namesSettingsFile(pattern: string, settingsPatterns: Set<string>): boolean {
  const fileName = pattern.slice(pattern.lastIndexOf('/') + 1);
  return settingsPatterns.has(pattern) || /config/i.test(fileName) || /rc$/i.test(fileName.replace(/^\./, '').split('.')[0] ?? '');
}

function leftOutReason(pattern: string, settingsPatterns: Set<string>): string | null {
  if (pattern.startsWith('!')) return pluginReasons.negation;
  if (!pattern || pattern.startsWith('/') || pattern.includes('..') || /[\\\0]/.test(pattern)) return pluginReasons.notRelative;
  return namesSettingsFile(pattern, settingsPatterns) ? pluginReasons.settingsFile : null;
}

// The manifests that decide the plugins of a workspace: its own manifest, then the
// manifests of the workspaces that hold it, nearest first. Knip also uses a plugin
// of a workspace in the workspaces inside it.
function decidingManifests(workspace: string, manifests: SnapshotManifest[]): SnapshotManifest[] {
  const holds = (outer: string): boolean => outer === workspace || outer === '.' || workspace.startsWith(outer + '/');
  return manifests.filter(manifest => manifest.workspace !== null && holds(manifest.workspace))
    .sort((left, right) => (right.workspace as string).length - (left.workspace as string).length);
}

// Copies the patterns of one plugin of one workspace, or records why it copies none.
function copyPlugin(found: PluginPatterns, source: PluginSource, plugin: KnipPlugin, settingsPatterns: Set<string>): void {
  const lists = [['entry', patternsOf(plugin.entry)], ['production', patternsOf(plugin.production)]] as const;
  if (lists.every(([, patterns]) => !patterns?.length)) {
    found.pluginsNotCopied.push({ ...source, reason: pluginReasons.noStaticPatterns });
    return;
  }
  let copied = false;
  for (const [field, patterns] of lists) for (const pattern of patterns ?? []) {
    const reason = leftOutReason(pattern, settingsPatterns);
    if (reason !== null) found.patternsNotCopied.push({ ...source, field, pattern, reason });
    else {
      found.copied.push({ ...source, field, pattern: field === 'production' ? pattern + '!' : pattern });
      copied = true;
    }
  }
  if (!copied) found.pluginsNotCopied.push({ ...source, reason: pluginReasons.everyPatternLeftOut });
}

export function pluginEntryPatterns(manifests: readonly SnapshotManifest[], knipPlugins: readonly KnipPlugin[]): PluginPatterns {
  const found: PluginPatterns = { copied: [], patternsNotCopied: [], pluginsNotCopied: [] };
  const settingsPatterns = new Set(knipPlugins.flatMap(plugin => patternsOf(plugin.config) ?? []));
  const workspaceManifests = manifests.filter(manifest => manifest.workspace !== null);
  for (const own of workspaceManifests) {
    const workspace = own.workspace as string;
    const deciding = decidingManifests(workspace, workspaceManifests).map(manifest => ({ manifest, names: dependenciesOf(manifest) }));
    for (const plugin of knipPlugins) {
      const decided = deciding.map(({ manifest, names }) => ({ manifest, dependency: dependencyFor(plugin, names) }))
        .find(({ dependency }) => dependency !== undefined);
      if (decided === undefined) continue;
      const source = { workspace, manifest: decided.manifest.path, plugin: plugin.name, dependency: decided.dependency as string };
      if (plugin.isRootOnly === true && workspace !== '.') {
        if (decided.manifest === own) found.pluginsNotCopied.push({ ...source, reason: pluginReasons.rootOnly });
        continue;
      }
      copyPlugin(found, source, plugin, settingsPatterns);
    }
  }
  for (const manifest of manifests.filter(item => item.workspace === null)) {
    const names = dependenciesOf(manifest);
    for (const plugin of knipPlugins) {
      const dependency = dependencyFor(plugin, names);
      if (dependency !== undefined) found.pluginsNotCopied.push({ workspace: null, manifest: manifest.path, plugin: plugin.name,
        dependency, reason: pluginReasons.notWorkspace });
    }
  }
  return found;
}
