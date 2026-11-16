import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { ExtraFile } from "../../fixtures/stage-4-publication/fixture.ts";
import { collectedAttempt } from "../../support/collected-attempt.ts";

// Stage 4 collect lists the files that the Knip plugin patterns of the registered
// Stage 2 profile select, next to the candidates of the Choom syntax rules, each with
// its source. The fixture run has a Stage 1 review whose role record makes the test
// folder a test folder, and its Stage 2 preflight record holds two copied patterns.
type Json = Record<string, unknown>;

const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const copied = (plugin: string, field: string, pattern: string): Json =>
  ({ workspace: ".", manifest: "package.json", plugin, dependency: plugin, field, pattern });
const patterns = [copied("next", "production", "{,src/}app/**/{layout,page,route,template}.{js,jsx,ts,tsx}!"),
  copied("vitest", "entry", "**/*.{bench,test,test-d,spec,spec-d}.?(c|m)[jt]s?(x)")];
const page: ExtraFile = { path: "app/page.tsx", text: "export default function Page() {\n  return null;\n}\n" };
const pageTest: ExtraFile = { path: "test/page.test.ts", text: "export const checked = true;\n" };
// A Vite settings file names its entry: the settings rule finds it, and no plugin pattern does.
const settings: ExtraFile = { path: "web/vite.config.ts",
  text: "export default {\n  build: { rollupOptions: { input: 'web/main.ts' } },\n};\n" };
const main: ExtraFile = { path: "web/main.ts", text: "console.log('main');\n" };

const collected = collectedAttempt([page, pageTest, settings, main], patterns);

describe("the Knip plugin pattern candidates of Stage 4 collect", () => {
  test("collect lists each file that a copied pattern selects, after the syntax-rule candidates, with its source", () => {
    const record = collected.saved("behavior-entry-candidates.json");
    const candidates = record.candidates as Json[];
    expect(candidates.filter(({ found }) => found === "syntax-rule").map(({ ruleId, path, name }) => ({ ruleId, path, name })))
      .toEqual([{ ruleId: "vite-build-rollup-options-input", path: settings.path, name: main.path }]);
    expect(candidates.filter(({ found }) => found === "knip-plugin-pattern")).toEqual([
      { found: "knip-plugin-pattern", role: "unknown", roleRef: null, path: page.path, sha256: sha256(page.text), ...patterns[0],
        patternRef: "s2-check-knip-preflight#/pluginEntryPatterns/0" },
      { found: "knip-plugin-pattern", role: "test", roleRef: "review-001#/roles/0", path: pageTest.path,
        sha256: sha256(pageTest.text), ...patterns[1], patternRef: "s2-check-knip-preflight#/pluginEntryPatterns/1" },
    ]);
    expect(candidates.map(({ found }) => found)).toEqual(["syntax-rule", "knip-plugin-pattern", "knip-plugin-pattern"]);
    expect(record).toMatchObject({ status: "completed", omittedCandidates: 0 });
  });
});
