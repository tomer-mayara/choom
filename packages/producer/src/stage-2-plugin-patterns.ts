// The default entry patterns of the Knip plugins that the dependencies of the
// workspace manifests turn on, from the plugin definitions of the installed Knip
// 6.44.1. The Stage 2 profile keeps every plugin turned off, so Knip never loads a
// settings file, which can be a script. Instead the profile copies the static
// `entry` and `production` patterns of each such plugin into the entry patterns of
// the workspace, in the form that Knip gives a production entry (a final `!`), and
// records their source. A pattern that looks like a settings file by its name stays
// out, so such a file stays a plain file, and a negation stays out, because in the
// entry patterns of a workspace it would also remove other entries. The settings-file
// test reads only names, so it has known misses (see namesSettingsFile). A plugin that
// Knip turns on without a dependency of its enablers, such as node or yarn, adds no
// pattern; the profile records it once.

// The fields of a plugin definition of Knip 6.44.1 that the selection reads. `enablers`
// holds dependency names and patterns, or a text when files turn the plugin on.
// `isEnabled` is the function with which Knip turns the plugin on; the selection does
// not call it.
export interface KnipPlugin {
  name: string;
  enablers?: unknown;
  isEnabled?: unknown;
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
// A plugin that adds no pattern, and why: a plugin that a dependency turns on, or with a
// null workspace, manifest and dependency, a plugin that Knip turns on without one.
export interface PluginNotCopied {
  workspace: string | null; manifest: string | null; plugin: string; dependency: string | null; reason: string;
}
export interface PluginPatterns { copied: CopiedPattern[]; patternsNotCopied: PatternNotCopied[]; pluginsNotCopied: PluginNotCopied[] }

export const pluginReasons = {
  noStaticPatterns: 'Knip 6.44.1 gives this plugin no static entry or production patterns: its entries come from its ' +
    'settings file or from its own code, which this profile does not run.',
  everyPatternLeftOut: 'Each static pattern of this plugin looks like a settings file by its name or is a negation, so the ' +
    'profile copies none.',
  rootOnly: 'Knip 6.44.1 uses this plugin only in the root workspace.',
  notWorkspace: 'The manifest is not the manifest of a workspace of the entry plan, so the profile has no entry patterns ' +
    'for its folder.',
  settingsFile: 'The pattern looks like a settings file by its name: it is a settings-file pattern (config) of a plugin, or ' +
    'its file name holds config or its first part ends with rc. Such a file stays a plain file, not an entry.',
  negation: 'The pattern is a negation. In the entry patterns of the workspace, it would also remove the entries of the ' +
    'plan and of the other plugins.',
  notRelative: 'The pattern is not a relative pattern in the workspace.',
  alwaysOn: 'Knip 6.44.1 turns this plugin on in every workspace, not by a dependency. The profile copies the patterns of a ' +
    'plugin only when a dependency turns it on, so it copies none of the patterns of this plugin.',
  turnedOnByFiles: 'Knip 6.44.1 turns this plugin on when it finds a file or a manifest field that the plugin names, not by ' +
    'a dependency. The profile copies the patterns of a plugin only when a dependency turns it on, so it copies none of the ' +
    'patterns of this plugin.',
  noEnablers: 'The definition of this plugin in Knip 6.44.1 names no enablers, so only its code decides when the plugin is ' +
    'on. The profile does not run plugin code, so it copies none of the patterns of this plugin.',
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

// Why the profile copies no pattern of a plugin that Knip 6.44.1 turns on without a
// dependency of an enablers list, or null for another plugin. An enablers text names the
// files or the manifest fields that turn the plugin on. An isEnabled without a parameter
// reads nothing of the workspace, so the plugin is on in every workspace, as node is.
// Another isEnabled without enablers decides in code, as for tsx. A plugin without
// isEnabled only reads the arguments of commands, and Knip never turns it on.
function notByDependency(plugin: KnipPlugin): string | null {
  if (Array.isArray(plugin.enablers) || typeof plugin.isEnabled !== 'function') return null;
  if (typeof plugin.enablers === 'string') return pluginReasons.turnedOnByFiles;
  return plugin.isEnabled.length === 0 ? pluginReasons.alwaysOn : pluginReasons.noEnablers;
}

// Whether a pattern looks like a settings file by its name: a settings-file pattern
// (`config`) of a plugin of Knip, or a file name that holds `config` or whose first
// part ends with `rc`, such as `tailwind.config.{js,ts}` or `.bumprc`. Some plugins of
// Knip 6.44.1 list their settings files as entry patterns, and Knip marks only the
// `config` patterns as settings files. So this test of names has known misses, which
// the Stage 2 cookbook lists: it is false for settings files such as
// `vercel.{js,mjs,cjs,ts,mts}` and `dangerfile.{js,cjs,mjs,ts}`, and true for the Mastra
// agent pattern of the `config`, `instructions`, `memory` and `workspace` files.
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
  // No manifest decides these plugins, so each has one record for all the workspaces.
  for (const plugin of knipPlugins) {
    const reason = notByDependency(plugin);
    if (reason !== null) found.pluginsNotCopied.push({ workspace: null, manifest: null, plugin: plugin.name, dependency: null,
      reason });
  }
  return found;
}
