import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { entryQuery } from "../../src/behavior-entry-calls.ts";
import { type SettingsFindings, type SettingsGap, settingsCandidates, settingsRules } from "../../src/behavior-entry-settings.ts";
import type { BehaviorEntrySettingsLiteralRule } from "../../src/generated/contracts.ts";
import type { Picomatch } from "../../src/stage-4-graph-profile.ts";
import { withScratch } from "../support/commands.ts";
import { type Files, projectOf } from "../support/snapshot-files.ts";
import { rangeIn } from "../support/source-ranges.ts";

// settingsCandidates on a saved snapshot: the literal values at the property path of
// the settings object of a file that matches the glob of a settings-literal rule. The
// snapshot project reads the file; nothing runs it. These rules are test data, not the
// rules of the pinned list: behavior-entry-rule-samples.test.ts checks those.
const picomatch = createRequire(import.meta.url)("picomatch") as Picomatch;
const viteInput: BehaviorEntrySettingsLiteralRule = { id: "vite-build-input", version: 1, library: "vite",
  entryKind: "frontend-entry", kind: "settings-literal", fileGlob: "**/vite.config.{js,ts}", propertyPath: "build.rollupOptions.input" };
const nextEntry: BehaviorEntrySettingsLiteralRule = { ...viteInput, id: "next-entry", library: "next", fileGlob: "next.config.{js,mjs}",
  propertyPath: "entry" };
const configPath = "web/vite.config.ts";
const reasons = {
  computedValue: "The value at the property path is not a string literal, so it is known only at run time.",
  computedObject: "The settings object or an object on the property path is not an object literal, so the rule cannot read " +
    "the property path without running the file.",
  dynamicProperty: "An object on the property path has a spread or a computed property name, so the value can come from code " +
    "that runs.",
  noSettings: "The file has no export default, export = or module.exports assignment, so the rule cannot find its settings object.",
};

function findingsIn(files: Files, path = configPath, rules = [viteInput]): SettingsFindings {
  return withScratch((scratch) => settingsCandidates(entryQuery(projectOf(scratch, files)), path, settingsRules(rules, picomatch)));
}

// The range and the text of the part of a file that « and » mark, or of the whole text without marks.
function site(text: string, at: string) {
  return { range: rangeIn(text, at), expression: at.includes("«") ? at.slice(at.indexOf("«") + 1, at.indexOf("»")) : at,
    truncated: false };
}
const candidate = (text: string, at: string, name: string, rule = viteInput) => ({ ruleId: rule.id, ruleVersion: 1,
  entryKind: "frontend-entry", ...site(text, at), name, nameReason: null, handler: null,
  handlerReason: "A settings-literal rule finds a settings entry, which has no handler." });
const gap = (text: string, at: string, reason: string): SettingsGap => ({ kind: "unknown-settings-value",
  ruleId: "vite-build-input", ruleVersion: 1, entryKind: "frontend-entry", ...site(text, at), reason });
const vite = (value: string): string => "import { defineConfig } from 'vite';\n\n" +
  `export default defineConfig({\n  plugins: [],\n  build: { outDir: 'dist', rollupOptions: { input: ${value} } },\n});\n`;

describe("settingsCandidates reads the literal value at the property path", () => {
  test("a string literal, without running the file", () => {
    const text = "throw new Error('The file ran.');\n" + vite("'src/main.ts'");
    expect(findingsIn({ [configPath]: text })).toEqual({ candidates: [candidate(text, "input: «'src/main.ts'»", "src/main.ts")],
      gaps: [] });
  });

  test("each string of an array and each string property of an object, and a gap for each other value", () => {
    const array = "const page = 'page.html';\n" + vite("['index.html', `admin.html`, page]");
    expect(findingsIn({ [configPath]: array })).toEqual({ candidates: [candidate(array, "[«'index.html'»", "index.html"),
      candidate(array, "«`admin.html`»", "admin.html")], gaps: [gap(array, "`admin.html`, «page»]", reasons.computedValue)] });
    const object = "const pages = {};\n" + vite("{ main: 'index.html', ...pages }");
    expect(findingsIn({ [configPath]: object })).toEqual({ candidates: [candidate(object, "main: «'index.html'»", "index.html")],
      gaps: [gap(object, "«...pages»", reasons.dynamicProperty)] });
  });

  test("module.exports of an object that a const declaration of the file holds", () => {
    const text = "const config = {\n  entry: './pages/index.js',\n};\n\nmodule.exports = config;\n";
    expect(findingsIn({ "next.config.js": text }, "next.config.js", [nextEntry]))
      .toEqual({ candidates: [candidate(text, "«'./pages/index.js'»", "./pages/index.js", nextEntry)], gaps: [] });
  });

  test("nothing for a file that the glob does not match, or for a settings object without the property path", () => {
    expect(findingsIn({ "web/vite.config.mjs": vite("'src/main.ts'") }, "web/vite.config.mjs")).toEqual({ candidates: [], gaps: [] });
    expect(findingsIn({ [configPath]: "export default { build: { outDir: 'dist' } };\n" })).toEqual({ candidates: [], gaps: [] });
  });
});

describe("settingsCandidates makes a gap with a reason for a value that is not a literal", () => {
  test.each([
    ["a computed value", vite("resolve(__dirname, 'index.html')"), "input: «resolve(__dirname, 'index.html')»", reasons.computedValue],
    ["a settings object that a function makes", "export default defineConfig(({ mode }) => ({ build: {} }));\n",
      "defineConfig(«({ mode }) => ({ build: {} })»)", reasons.computedObject],
    ["an object on the path that a call makes", "export default { build: { rollupOptions: options() } };\n",
      "rollupOptions: «options()»", reasons.computedObject],
    ["a spread after the property", "export default { build: { rollupOptions: { input: 'a.html' } }, ...overrides };\n",
      "default «{ build: { rollupOptions: { input: 'a.html' } }, ...overrides }»", reasons.dynamicProperty],
    ["a computed property name", "export default { build: { rollupOptions: { [name]: 'x' } } };\n",
      "rollupOptions: «{ [name]: 'x' }»", reasons.dynamicProperty],
  ])("%s", (_name, text, at, reason) => {
    expect(findingsIn({ [configPath]: text })).toEqual({ candidates: [], gaps: [gap(text, at, reason)] });
  });

  test("a file without a settings export", () => {
    const text = "export const build = { rollupOptions: { input: 'a.html' } };\n";
    expect(findingsIn({ [configPath]: text })).toEqual({ candidates: [], gaps: [gap(text, text, reasons.noSettings)] });
  });
});
