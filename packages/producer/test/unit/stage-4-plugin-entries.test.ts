import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { Picomatch } from "../../src/stage-4-graph-profile.ts";
import { pluginPatternCandidates, type PluginPatternSource, registeredPluginPatterns }
  from "../../src/stage-4-plugin-entries.ts";

// Stage 4 collect lists the files that the Knip plugin patterns of the Stage 2
// profile select, next to the candidates of the Choom syntax rules.
type Json = Record<string, unknown>;

const picomatch = createRequire(import.meta.url)("picomatch") as Picomatch;
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const file = (path: string) => ({ path, kind: "file", bytes: 1, sha256: sha256(path) });
const unknownRole = () => ({ role: "unknown", roleRef: null });
const copied = (workspace: string, plugin: string, field: string, pattern: string): Json =>
  ({ workspace, manifest: workspace === "." ? "package.json" : workspace + "/package.json", plugin, dependency: plugin, field, pattern });
const candidate = (path: string, index: number, pattern: Json, role: Json = unknownRole()): Json => ({ found: "knip-plugin-pattern",
  ...role, path, sha256: sha256(path), ...pattern, patternRef: "s2-x-preflight#/pluginEntryPatterns/" + index });

describe("pluginPatternCandidates", () => {
  test("lists each indexed file that a copied pattern selects in the folder of its workspace, with dot files", () => {
    const next = copied(".", "next", "production", "app/**/page.tsx!");
    const vitest = copied(".", "vitest", "entry", "**/*.test.ts");
    const source: PluginPatternSource = { preflightRef: "s2-x-preflight", patterns: [next, vitest], workspaces: ["."] };
    const files = ["src/a.test.ts", "app/page.tsx", "app/page.css", "app/admin/page.tsx", ".hidden/b.test.ts", "README.md"]
      .map(file);
    expect(pluginPatternCandidates(source, [...files, { ...file("link.test.ts"), kind: "symlink" }], picomatch, unknownRole))
      .toEqual([candidate("app/admin/page.tsx", 0, next), candidate("app/page.tsx", 0, next),
        candidate(".hidden/b.test.ts", 1, vitest), candidate("src/a.test.ts", 1, vitest)]);
  });

  test("a file of a workspace inside the workspace of a pattern is left to the patterns of that workspace", () => {
    const vitest = copied(".", "vitest", "entry", "**/*.test.ts");
    const next = copied("packages/web", "next", "production", "app/**/page.tsx!");
    const source: PluginPatternSource = { preflightRef: "s2-x-preflight", patterns: [vitest, next],
      workspaces: [".", "packages/web"] };
    const files = ["a.test.ts", "packages/web/b.test.ts", "packages/web/app/page.tsx", "packages/webapp/c.test.ts",
      "app/page.tsx"].map(file);
    expect(pluginPatternCandidates(source, files, picomatch, unknownRole)).toEqual([candidate("a.test.ts", 0, vitest),
      candidate("packages/webapp/c.test.ts", 0, vitest), candidate("packages/web/app/page.tsx", 1, next)]);
  });

  test("a candidate gets the role that the role rule of the record gives its file", () => {
    const vitest = copied(".", "vitest", "entry", "**/*.test.ts");
    const testRole = { role: "test", roleRef: "review-001#/roles/0" };
    const roleOf = (path: string) => path.startsWith("test/") ? testRole : unknownRole();
    expect(pluginPatternCandidates({ preflightRef: "s2-x-preflight", patterns: [vitest], workspaces: ["."] },
      [file("test/a.test.ts")], picomatch, roleOf)).toEqual([candidate("test/a.test.ts", 0, vitest, testRole)]);
  });
});

describe("registeredPluginPatterns", () => {
  const next = copied(".", "next", "production", "app/**/page.tsx!");
  const artifacts = (preflight: unknown, runs: Json = { preflightRef: "s2-x-preflight", profileRef: "s2-x-knip-profile" }) =>
    new Map(Object.entries({ "s2-x-knip-runs": runs, "s2-x-preflight": preflight,
      "s2-x-knip-profile": { workspaces: { ".": { entry: [] }, web: { entry: [] } } } })
      .map(([ref, value]) => [ref, Buffer.from(JSON.stringify(value))]));

  test("reads the copied patterns of the Stage 2 profile that the Knip receipts of the entry analysis name", () => {
    expect(registeredPluginPatterns(artifacts({ pluginEntryPatterns: [next] }), "s2-x-knip-runs"))
      .toEqual({ preflightRef: "s2-x-preflight", patterns: [next], workspaces: [".", "web"] });
  });

  test.each<[string, Map<string, Buffer>, string]>([
    ["a profile record without the list of copied patterns", artifacts({ formatVersion: 1 }),
      "The Knip preflight record s2-x-preflight has no valid list of copied plugin patterns (pluginEntryPatterns)."],
    ["a copied pattern of a workspace that the profile does not have", artifacts({ pluginEntryPatterns: [{ ...next, workspace: "api" }] }),
      "The Knip preflight record s2-x-preflight has no valid list of copied plugin patterns (pluginEntryPatterns)."],
    ["a copied pattern without its plugin", artifacts({ pluginEntryPatterns: [{ ...next, plugin: 1 }] }),
      "The Knip preflight record s2-x-preflight has no valid list of copied plugin patterns (pluginEntryPatterns)."],
    ["Knip receipts that name no registered profile record", artifacts({ pluginEntryPatterns: [] }, { preflightRef: "other" }),
      "The Knip receipts s2-x-knip-runs do not name a registered profile and its preflight record."],
  ])("refuses %s", (_name, saved, message) => {
    expect(() => registeredPluginPatterns(saved, "s2-x-knip-runs")).toThrow(message);
  });
});
