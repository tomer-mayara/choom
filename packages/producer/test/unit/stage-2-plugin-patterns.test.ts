import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type KnipPlugin, pluginEntryPatterns, pluginReasons, type SnapshotManifest }
  from "../../src/stage-2-plugin-patterns.ts";
import { toolsRoot } from "../support/commands.ts";

// The plugins of these cases follow the shape of the plugin definitions of Knip
// 6.44.1: enablers, static entry and production patterns, and settings-file patterns.
const next: KnipPlugin = { name: "next", enablers: ["next"], config: ["next.config.{js,ts}"],
  production: ["app/**/page.{js,tsx}", "pages/**/*.tsx"] };
const vitest: KnipPlugin = { name: "vitest", enablers: ["vitest"], entry: ["**/*.test.ts"], config: ["vitest.config.ts"] };
const vite: KnipPlugin = { name: "vite", enablers: ["vite", "vitest"], config: ["vite.config.{js,ts}"] };
const storybook: KnipPlugin = { name: "storybook", enablers: [/^@storybook\//], entry: ["**/*.stories.tsx"] };
const files: KnipPlugin = { name: "github-actions", enablers: "This plugin is enabled when a workflow file is found.",
  entry: [".github/workflows/*.yml"] };
const changesets: KnipPlugin = { name: "changesets", enablers: ["@changesets/cli"], entry: [".changeset/*.md"], isRootOnly: true };

const manifest = (path: string, workspace: string | null, value: Record<string, unknown>): SnapshotManifest =>
  ({ path, workspace, value });
const root = (value: Record<string, unknown>): SnapshotManifest => manifest("package.json", ".", value);
const source = (plugin: string, dependency: string, workspace = ".", path = "package.json") =>
  ({ workspace, manifest: path, plugin, dependency });

describe("pluginEntryPatterns", () => {
  test("copies the entry and production patterns of the plugins that a workspace manifest turns on", () => {
    const found = pluginEntryPatterns([root({ dependencies: { next: "16.0.0" }, devDependencies: { vitest: "3.0.0" } })],
      [next, vitest]);
    expect(found).toEqual({
      copied: [
        { ...source("next", "next"), field: "production", pattern: "app/**/page.{js,tsx}!" },
        { ...source("next", "next"), field: "production", pattern: "pages/**/*.tsx!" },
        { ...source("vitest", "vitest"), field: "entry", pattern: "**/*.test.ts" },
      ],
      patternsNotCopied: [], pluginsNotCopied: [] });
  });

  test("a dependency or a development dependency matches an enabler name or pattern; other dependency fields do not", () => {
    const value = { devDependencies: { "@storybook/react": "9.0.0" }, peerDependencies: { next: "16.0.0" },
      optionalDependencies: { vitest: "3.0.0" } };
    expect(pluginEntryPatterns([root(value)], [next, vitest, storybook]).copied).toEqual([
      { ...source("storybook", "@storybook/react"), field: "entry", pattern: "**/*.stories.tsx" }]);
    // The first enabler that a dependency matches names the dependency.
    expect(pluginEntryPatterns([root({ dependencies: { vitest: "3.0.0", vite: "8.0.0" } })], [vite]).pluginsNotCopied)
      .toEqual([{ ...source("vite", "vite"), reason: pluginReasons.noStaticPatterns }]);
  });

  test("a plugin that files turn on, or that has no static patterns, adds nothing", () => {
    expect(pluginEntryPatterns([root({ devDependencies: { vite: "8.0.0", "github-actions": "1.0.0" } })], [vite, files]))
      .toEqual({ copied: [], patternsNotCopied: [],
        pluginsNotCopied: [{ ...source("vite", "vite"), reason: pluginReasons.noStaticPatterns }] });
  });

  test("a pattern that names a settings file and a negation are not copied", () => {
    const tailwind: KnipPlugin = { name: "tailwind", enablers: ["tailwindcss"], entry: ["tailwind.config.{js,ts}"] };
    const astro: KnipPlugin = { name: "astro", enablers: ["astro"], entry: ["src/content/config.ts"],
      production: ["src/pages/**/*.ts", "!src/pages/**/_*"] };
    const svelte: KnipPlugin = { name: "svelte", enablers: ["svelte"], entry: ["svelte.config.js", "vite.config.{js,ts}"] };
    const bumpp: KnipPlugin = { name: "bumpp", enablers: ["bumpp"], entry: [".bumprc", "package.json"] };
    const value = { devDependencies: { astro: "5.0.0", bumpp: "10.0.0", svelte: "5.0.0", tailwindcss: "4.0.0" } };
    const found = pluginEntryPatterns([root(value)], [astro, bumpp, svelte, tailwind, vite,
      { name: "jest", enablers: ["jest"], config: ["package.json"] }]);
    const notCopied = (plugin: string, dependency: string, field: "entry" | "production", pattern: string, reason: string) =>
      ({ ...source(plugin, dependency), field, pattern, reason });
    expect(found.copied).toEqual([{ ...source("astro", "astro"), field: "production", pattern: "src/pages/**/*.ts!" }]);
    expect(found.patternsNotCopied).toEqual([
      notCopied("astro", "astro", "entry", "src/content/config.ts", pluginReasons.settingsFile),
      notCopied("astro", "astro", "production", "!src/pages/**/_*", pluginReasons.negation),
      notCopied("bumpp", "bumpp", "entry", ".bumprc", pluginReasons.settingsFile),
      notCopied("bumpp", "bumpp", "entry", "package.json", pluginReasons.settingsFile),
      notCopied("svelte", "svelte", "entry", "svelte.config.js", pluginReasons.settingsFile),
      notCopied("svelte", "svelte", "entry", "vite.config.{js,ts}", pluginReasons.settingsFile),
      notCopied("tailwind", "tailwindcss", "entry", "tailwind.config.{js,ts}", pluginReasons.settingsFile),
    ]);
    expect(found.pluginsNotCopied).toEqual(["bumpp", "svelte", "tailwind"].map((plugin) =>
      ({ ...source(plugin, plugin === "tailwind" ? "tailwindcss" : plugin), reason: pluginReasons.everyPatternLeftOut })));
  });

  test("a workspace also gets the plugins that the manifests of the workspaces that hold it turn on, as Knip does", () => {
    const manifests = [root({ devDependencies: { vitest: "3.0.0", "@changesets/cli": "2.0.0" } }),
      manifest("packages/web/package.json", "packages/web", { dependencies: { next: "16.0.0", "@changesets/cli": "2.0.0" } }),
      manifest("packages/api/package.json", "packages/api", {})];
    const found = pluginEntryPatterns(manifests, [changesets, next, vitest]);
    expect(found.copied).toEqual([
      { ...source("changesets", "@changesets/cli"), field: "entry", pattern: ".changeset/*.md" },
      { ...source("vitest", "vitest"), field: "entry", pattern: "**/*.test.ts" },
      { ...source("next", "next", "packages/web", "packages/web/package.json"), field: "production", pattern: "app/**/page.{js,tsx}!" },
      { ...source("next", "next", "packages/web", "packages/web/package.json"), field: "production", pattern: "pages/**/*.tsx!" },
      { ...source("vitest", "vitest", "packages/web"), field: "entry", pattern: "**/*.test.ts" },
      { ...source("vitest", "vitest", "packages/api"), field: "entry", pattern: "**/*.test.ts" },
    ]);
    // Knip uses a root-only plugin only in the root workspace, also when a manifest of another workspace names it.
    expect(found.pluginsNotCopied).toEqual([{ ...source("changesets", "@changesets/cli", "packages/web",
      "packages/web/package.json"), reason: pluginReasons.rootOnly }]);
  });

  test("a manifest that is not a workspace of the plan adds no pattern, and its plugins are recorded", () => {
    const found = pluginEntryPatterns([root({}), manifest("fixtures/app/package.json", null, { dependencies: { next: "16.0.0" } })],
      [next]);
    expect(found).toEqual({ copied: [], patternsNotCopied: [], pluginsNotCopied: [{ workspace: null,
      manifest: "fixtures/app/package.json", plugin: "next", dependency: "next", reason: pluginReasons.notWorkspace }] });
  });

  test("the plugins of the installed Knip 6.44.1: Next.js pages are copied, and Vite and Svelte add nothing", async () => {
    const knip = join(toolsRoot, "node_modules/knip/dist");
    const { pluginNames } = await import(pathToFileURL(join(knip, "types/PluginNames.js")).href) as { pluginNames: string[] };
    const { Plugins } = await import(pathToFileURL(join(knip, "plugins/index.js")).href) as
      { Plugins: Record<string, Omit<KnipPlugin, "name">> };
    const plugins = pluginNames.map((name) => ({ ...Plugins[name], name }));
    const found = pluginEntryPatterns([root({ dependencies: { next: "16.0.0", svelte: "5.0.0", vite: "8.0.0" } })], plugins);
    // Knip 6.44.1 also turns on its PostCSS and Vercel OG plugins for the next package.
    expect(found.copied.filter(({ plugin }) => plugin === "next").map(({ field, pattern }) => ({ field, pattern }))).toEqual(
      (Plugins.next?.production as string[]).map((pattern) => ({ field: "production", pattern: pattern + "!" })));
    expect(found.pluginsNotCopied.map(({ plugin, reason }) => ({ plugin, reason }))).toEqual([
      { plugin: "postcss", reason: pluginReasons.noStaticPatterns }, { plugin: "svelte", reason: pluginReasons.everyPatternLeftOut },
      { plugin: "vite", reason: pluginReasons.noStaticPatterns }]);
  });
});
