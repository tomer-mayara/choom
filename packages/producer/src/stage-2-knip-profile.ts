import { readFileSync, writeFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type KnipPlugin, pluginEntryPatterns, type SnapshotManifest } from './stage-2-plugin-patterns.ts';

// The Stage 2 prepare action runs this module in the tool checkout, after the
// driver checked the producer code record of the run. It checks the entry plan,
// writes the fixed profile for Knip 6.44.1 with every plugin turned off and the
// default entry patterns of the plugins that the dependencies turn on, and writes
// the preflight decision.
// Saved JSON and YAML stay unchecked values until the checks below read them.
interface InventoryFile { path: string; kind: string; bytes: number; sha256: string }
interface Workspace { dir: string; entry: unknown; project: unknown }

const work = realpathSync(process.env.CHOOM_WORK as string);
const attempt = realpathSync(process.env.CHOOM_STAGE2 as string);
const require = createRequire(resolve(process.env.CHOOM_TOOLS as string, 'package.json'));
const { parse } = require('yaml');
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const run = parse(readFileSync(join(work, 'run.yaml'), 'utf8'));
const discovery = parse(readFileSync(join(work, 'discovery.yaml'), 'utf8'));
const baseline = parse(readFileSync(join(work, 'baseline.yaml'), 'utf8'));
function artifact(id: string): Buffer {
  const record = run.artifacts[id];
  if (!record || !record.sha256) throw new Error(`Missing artifact or digest: ${id}`);
  const path = realpathSync(resolve(work, record.path));
  if (!path.startsWith(work + '/')) throw new Error(`Artifact outside working folder: ${id}`);
  const bytes = readFileSync(path);
  if (hash(bytes) !== record.sha256) throw new Error(`Artifact changed: ${id}`);
  return bytes;
}
const inventory = JSON.parse(artifact(run.snapshot.inventoryRef).toString());
if (run.status !== 'in-progress' || discovery.runRef !== run.id ||
    inventory.snapshotId !== run.snapshot.id || run.progress?.inventory !== 'complete' ||
    ['components', 'interfaces', 'resources', 'rules'].some(key => !Array.isArray(baseline[key]) || baseline[key].length))
  throw new Error('Expected the completed step-1 handoff and an empty draft baseline.');
const planBytes = readFileSync(join(attempt, 'entry-plan.json'));
const plan = JSON.parse(planBytes.toString());
if (plan.formatVersion !== 1 || plan.snapshotRef !== run.snapshot.id ||
    typeof plan.runProduction !== 'boolean' || typeof plan.productionReason !== 'string' ||
    !Array.isArray(plan.workspaces) || !Array.isArray(plan.candidates) ||
    !Array.isArray(plan.questions) || !Array.isArray(plan.gaps))
  throw new Error('Invalid entry-plan structure. Ask the LLM to correct it.');
const cleanPath = (value: unknown): value is string => typeof value === 'string' && value.length > 0 &&
  !value.startsWith('/') && !value.includes('..') && !/[\\\0]/.test(value);
const projectPattern = (value: unknown): boolean => {
  if (!cleanPath(value)) return false;
  if (value.startsWith('!')) return true;
  const match = value.replace(/!$/, '').match(/\.([a-z]+|\{[a-z,]+\})$/);
  return !!match && (match[1] ?? '').replace(/[{}]/g, '').split(',').every(ext =>
    ['js', 'jsx', 'cjs', 'mjs', 'ts', 'tsx', 'cts', 'mts'].includes(ext));
};
const files = new Map<string, InventoryFile>((inventory.files as InventoryFile[]).map(file => [file.path, file]));
const workspaces: Record<string, { entry: unknown; project: unknown }> = Object.create(null);
const reasons: string[] = [];
for (const workspace of plan.workspaces as Workspace[]) {
  if (!(workspace.dir === '.' || (cleanPath(workspace.dir) && posix.normalize(workspace.dir) === workspace.dir && !/[!*?{}[\]]/.test(workspace.dir))) || workspaces[workspace.dir] ||
      !Array.isArray(workspace.entry) || !workspace.entry.every(cleanPath) ||
      !Array.isArray(workspace.project) || !workspace.project.length || !workspace.project.every(projectPattern))
    throw new Error('Invalid workspace or patterns. Ask the LLM to correct the plan.');
  const manifest = workspace.dir === '.' ? 'package.json' : `${workspace.dir}/package.json`;
  if (files.get(manifest)?.kind !== 'file') reasons.push(`Workspace lacks a captured manifest: ${manifest}`);
  workspaces[workspace.dir] = { entry: workspace.entry, project: workspace.project };
}
if (!workspaces['.']) throw new Error('The plan must account for the root workspace.');
if ((inventory.files as InventoryFile[]).some(file => file.kind === 'symlink')) reasons.push('Snapshot contains symbolic links; this profile does not follow them.');
function savedData(file: InventoryFile): string {
  const path = resolve(work, 'snapshot', file.path);
  if (!path.startsWith(join(work, 'snapshot') + '/') || realpathSync(path) !== path)
    throw new Error(`Input path changed: ${file.path}`);
  const bytes = readFileSync(path);
  if (hash(bytes) !== file.sha256) throw new Error(`Snapshot changed: ${file.path}`);
  return bytes.toString('utf8');
}
// The package manifests that parse, with the workspace of the plan whose manifest each is.
const manifests: SnapshotManifest[] = [];
const workspaceOf = new Map(Object.keys(workspaces).map(dir => [dir === '.' ? 'package.json' : `${dir}/package.json`, dir]));
// A manifest setting that this profile does not load makes the profile unsupported.
function manifestReasons(file: InventoryFile): string[] {
  if (statSync(resolve(work, 'snapshot', file.path)).size > 2 * 1024 * 1024)
    return [`Preflight input exceeds 2 MiB: ${file.path}`];
  const contents = savedData(file);
  const found: string[] = [];
  try {
    const value = file.path.endsWith('.json') ? JSON.parse(contents) : parse(contents);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a mapping');
    if (posix.basename(file.path) === 'package.json')
      manifests.push({ path: file.path, workspace: workspaceOf.get(file.path) ?? null, value });
    if (posix.basename(file.path) === 'package.json' && Object.hasOwn(value, 'knip'))
      found.push(`${file.path} contains knip configuration, which this profile does not load.`);
    if (posix.basename(file.path) === 'pnpm-workspace.yaml' && Object.hasOwn(value, 'include'))
      found.push(`${file.path} contains includes, which this profile does not load.`);
  } catch (error) { found.push(`${file.path}: ${(error as Error).message}`); }
  return found;
}
for (const file of inventory.files as InventoryFile[]) {
  if (file.kind !== 'file') continue;
  if (!['package.json', 'pnpm-workspace.yaml'].includes(posix.basename(file.path))) continue;
  reasons.push(...manifestReasons(file));
}
const knipRoot = realpathSync(resolve(process.env.CHOOM_TOOLS as string, 'node_modules/knip'));
if (JSON.parse(readFileSync(join(knipRoot, 'package.json')).toString()).version !== '6.44.1')
  throw new Error('This profile requires Knip 6.44.1.');
const { pluginNames }: { pluginNames: string[] } = await import(pathToFileURL(join(knipRoot, 'dist/types/PluginNames.js')).href);
// The plugin definitions of the installed Knip give the enablers and the default patterns.
const { Plugins }: { Plugins: Record<string, Omit<KnipPlugin, 'name'>> } =
  await import(pathToFileURL(join(knipRoot, 'dist/plugins/index.js')).href);
// The manifests of the plan workspaces come first, in the order of the plan, then the others.
const planDirs = Object.keys(workspaces);
const planOrder = (manifest: SnapshotManifest): number =>
  manifest.workspace === null ? planDirs.length : planDirs.indexOf(manifest.workspace);
const plugins = pluginEntryPatterns(manifests.sort((left, right) => planOrder(left) - planOrder(right)),
  pluginNames.map(name => ({ ...Plugins[name], name })));
for (const { workspace, pattern } of plugins.copied) {
  const current = workspaces[workspace];
  const entry = current?.entry as string[];
  if (current && !entry.includes(pattern)) workspaces[workspace] = { entry: [...entry, pattern], project: current.project };
}
const profile = { ...Object.fromEntries(pluginNames.map(name => [name, false])), preprocessor: [], workspaces };
const profileBytes = JSON.stringify(profile, null, 2);
writeFileSync(join(attempt, 'knip-profile.json'), profileBytes, { flag: 'wx' });
writeFileSync(join(attempt, 'preflight.json'), JSON.stringify({
  formatVersion: 1, snapshotRef: run.snapshot.id, knipVersion: '6.44.1',
  planSha256: hash(planBytes), profileSha256: hash(profileBytes),
  inventory: { ref: run.snapshot.inventoryRef, ...run.artifacts[run.snapshot.inventoryRef] },
  status: reasons.length ? 'unsupported' : 'eligible', reasons,
  environment: { KNIP_DISABLE_RAW_TRANSFER: '1' },
  disabledPlugins: pluginNames,
  pluginEntryPatterns: plugins.copied, pluginPatternsNotCopied: plugins.patternsNotCopied,
  pluginsNotCopied: plugins.pluginsNotCopied,
  approvedCoreParsers: ['JS/TS', 'MDX', 'Sass/SCSS', 'Less', 'Stylus', 'TSRX'],
  limits: ['Every Knip plugin is turned off, so Knip loads no settings file of the target.',
    'For each plugin that a dependency or a development dependency of a workspace manifest turns on, or of the manifest ' +
    'of a workspace that holds it, the profile copies the default entry and production patterns of the plugin from Knip ' +
    '6.44.1 into the entry patterns of the workspace (pluginEntryPatterns). A pattern that looks like a settings file by ' +
    'its name and a negation are not copied (pluginPatternsNotCopied). A plugin without static patterns adds nothing ' +
    '(pluginsNotCopied).',
    'The settings-file test reads only names: a settings-file pattern (config) of a plugin, or a file name that holds ' +
    'config or whose first part ends with rc. So the profile copies some settings files, such as ' +
    '.dependency-cruiser.{js,cjs,mjs,json}, vercel.{js,mjs,cjs,ts,mts} and dangerfile.{js,cjs,mjs,ts}, and it does not ' +
    'copy the Mastra pattern of the config, instructions, memory and workspace files of an agent.',
    'A plugin that Knip 6.44.1 turns on without a dependency of its enablers adds nothing: node, which is on in every ' +
    'workspace, tsx, whose definition names no enablers, and the plugins that files or manifest fields turn on, such as ' +
    'bun, github-actions, pnpm and yarn. pluginsNotCopied records each of them once, with a null workspace, manifest and ' +
    'dependency.',
    'Only these file-name patterns come from the plugins. The profile runs no plugin code, so it loses the entries that ' +
    'this code finds: the resolve steps of the plugins, such as the start files that the Vite plugin reads from index.html, ' +
    'the readers of .vue, .svelte and .astro files, and the syntax visitors of the plugins. A settings file that changes ' +
    'the entries of its tool is not read.',
    'Missing dependencies remain missing.',
    'Explicit workspaces and entries do not replace metadata-discovered workspaces or roots.',
    'Knip reports issues, not its complete root set or reachability.']
}, null, 2), { flag: 'wx' });
console.log(reasons.length ? 'Knip unsupported for this profile; continue with explicit gaps.' : 'Profile prepared.');
