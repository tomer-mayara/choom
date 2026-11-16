import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { toolsRoot, withScratch } from "../../support/commands.ts";

// Decision D15 of the Step 1 report says that a Knip plugin set to `{ config: [] }`
// uses only its default file-name patterns and never loads a settings file. These
// cases run the Knip 6.44.1 of the tool checkout with the arguments of the Stage 2
// runner, on small projects in a temporary folder. Each probe settings file writes
// a marker file next to itself when it runs. The cases record what Knip does: the
// default entries are added and the settings file at its default path is not
// loaded, but a settings file that a package script or a second plugin names is
// loaded.
type Files = Record<string, string>;
interface KnipResult { status: number | null; ran: string[]; unused: string[] }
interface KnipIssue { file: string; files: unknown[] }

const knip = join(toolsRoot, "node_modules/knip");
const { pluginNames } = await import(pathToFileURL(join(knip, "dist/types/PluginNames.js")).href) as { pluginNames: string[] };

const esmProbe = (marker: string, rest: string): string => 'import { writeFileSync } from "node:fs";\n' +
  `writeFileSync(new URL("./${marker}", import.meta.url), "ran");\n${rest}`;
const cjsProbe = (marker: string): string =>
  `require("node:fs").writeFileSync(require("node:path").join(__dirname, "${marker}"), "ran");\nmodule.exports = {};\n`;
const manifest = (fields: Record<string, unknown>): string => JSON.stringify({ name: "probe", private: true, ...fields });

// A Vite app: index.html names its start file, and a test file has a Vitest name.
// Only the settings file names src/only-in-settings.ts.
const viteApp: Files = {
  "package.json": manifest({ type: "module", devDependencies: { vite: "8.0.0", vitest: "3.0.0" } }),
  "index.html": '<!doctype html>\n<script type="module" src="/src/main.ts"></script>\n',
  "vite.config.js": esmProbe("vite-config.ran", 'export default { build: { rollupOptions: { input: "src/only-in-settings.ts" } } };\n'),
  "src/main.ts": 'import { value } from "./used.ts";\nconsole.log(value);\n',
  "src/used.ts": "export const value = 1;\n",
  "src/app.test.ts": 'import { value } from "./used.ts";\nconsole.log(value);\n',
  "src/only-in-settings.ts": "console.log(1);\n",
};

// Runs Knip with every plugin set to false except the given plugins.
function runKnip(scratch: string, files: Files, plugins: Record<string, unknown>): KnipResult {
  const root = join(scratch, "project");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const profile = join(scratch, "knip.json");
  writeFileSync(profile, JSON.stringify({ ...Object.fromEntries(pluginNames.map((name) => [name, false])), ...plugins,
    preprocessor: [], workspaces: { ".": { entry: [], project: ["**/*.{js,ts}"] } } }));
  const run = spawnSync("node", [join(knip, "bin/knip.js"), "--config", profile, "--reporter", "json", "--no-progress",
    "--no-gitignore"], { cwd: root, encoding: "utf8", timeout: 60_000,
    env: { PATH: process.env.PATH ?? "", KNIP_DISABLE_RAW_TRANSFER: "1" } });
  if (run.error) throw run.error;
  const { issues } = JSON.parse(run.stdout) as { issues: KnipIssue[] };
  return { status: run.status,
    ran: readdirSync(root, { recursive: true }).map(String).filter((name) => name.endsWith(".ran")).sort(),
    unused: issues.filter((issue) => issue.files.length > 0).map((issue) => issue.file).sort() };
}

describe("Knip 6.44.1 plugins set to config: [] (decision D15)", () => {
  test("with every plugin off, the start file and the test file are unused and no settings file runs", () => {
    withScratch((scratch) => {
      expect(runKnip(scratch, viteApp, {})).toEqual({ status: 1, ran: [],
        unused: ["src/app.test.ts", "src/main.ts", "src/only-in-settings.ts", "src/used.ts", "vite.config.js"] });
    });
  }, 60_000);

  test("a plugin set to config: [] adds its default entries and does not load its settings file", () => {
    withScratch((scratch) => {
      // Vite takes src/main.ts from index.html and Vitest takes the test file from its
      // file-name pattern. The entry that only the settings file names stays unused.
      expect(runKnip(scratch, viteApp, { vite: { config: [] }, vitest: { config: [] } })).toEqual({ status: 1, ran: [],
        unused: ["src/only-in-settings.ts", "vite.config.js"] });
    });
  }, 60_000);

  test("the probe settings file runs when the plugin may load its settings file", () => {
    withScratch((scratch) => {
      expect(runKnip(scratch, viteApp, { vite: true, vitest: true })).toEqual({ status: 1, ran: ["vite-config.ran"],
        unused: [] });
    });
  }, 60_000);

  test("a plugin set to config: [] still loads a settings file that a package script names", () => {
    withScratch((scratch) => {
      const files = { ...viteApp, "vite.custom.config.js": esmProbe("vite-custom-config.ran", "export default {};\n"),
        "package.json": manifest({ type: "module", devDependencies: { vite: "8.0.0" },
          scripts: { build: "vite build --config vite.custom.config.js" } }) };
      expect(runKnip(scratch, files, { vite: { config: [] } }).ran).toEqual(["vite-custom-config.ran"]);
      // With every plugin off, Knip does not load the file that the script names.
      expect(runKnip(join(scratch, "off"), files, {}).ran).toEqual([]);
    });
  }, 60_000);

  test("Next.js set to config: [] still loads the settings file of the folder that next build names", () => {
    withScratch((scratch) => {
      const files = { "package.json": manifest({ dependencies: { next: "16.0.0" }, scripts: { build: "next build web" } }),
        "next.config.js": cjsProbe("next-root-config.ran"), "web/next.config.js": cjsProbe("next-config.ran") };
      expect(runKnip(scratch, files, { next: { config: [] } }).ran).toEqual(["web/next-config.ran"]);
    });
  }, 60_000);

  test("Babel set to config: [] still loads the settings file that the Expo plugin names", () => {
    withScratch((scratch) => {
      const files = { "package.json": manifest({ dependencies: { expo: "50.0.0", "@babel/core": "7.0.0" } }),
        "babel.config.js": cjsProbe("babel-config.ran") };
      expect(runKnip(scratch, files, { expo: { config: [] }, babel: { config: [] } }).ran).toEqual(["babel-config.ran"]);
      // With Babel off, the file that Expo names is not loaded.
      expect(runKnip(join(scratch, "off"), files, { expo: { config: [] } }).ran).toEqual([]);
    });
  }, 60_000);
});
