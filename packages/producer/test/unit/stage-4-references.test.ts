import { describe, expect, test } from "bun:test";
import { type UnresolvedSite, unresolvedSites } from "../../src/stage-4-references.ts";

// The loading sites of the saved source sites that the Stage 4 references action
// lists as possible uses that it does not resolve.
type Site = Record<string, unknown>;
const sitesRef = "s4-check-file@source-sites.json";

function site(index: number, [path, kind, specifier, expression]: [string, string, string | null, string]): Site {
  return { id: `s4-check-site-${index + 1}`, path, sha256: "0".repeat(64), lines: [index + 1, index + 1], kind, specifier,
    typeOnly: false, dynamic: kind === "dynamic-import", expression, truncated: false };
}

describe("unresolvedSites", () => {
  test("lists each loading site of the scope whose module name is computed, with its file, lines, kind and expression", () => {
    const rows: [string, string, string | null, string][] = [
      ["src/load.ts", "dynamic-import", null, "import(name)"],
      ["src/load.ts", "dynamic-import", "./invoice", "import('./invoice')"],
      ["src/load.ts", "require-candidate", null, "require(name)"],
      ["src/load.ts", "require-candidate", "./invoice", "require('./invoice')"],
      ["src/load.ts", "require-resolve-candidate", null, "require.resolve(name)"],
      ["src/load.ts", "import-equals", null, "import legacy = require(name);"],
      ["src/load.ts", "resource-call-candidate", null, "fetch(url)"],
      ["src/load.ts", "import", "./invoice", "import './invoice';"],
      ["other/load.ts", "dynamic-import", null, "import(other)"],
    ];
    const sites = rows.map((row, index) => site(index, row));
    const listed = (index: number): UnresolvedSite => {
      const { path, lines, kind, expression } = sites[index] ?? {};
      return { siteRef: `${sitesRef}#/sites/${index}`, path, lines, kind, expression };
    };
    expect(unresolvedSites({ sites }, new Set(["src/load.ts"]), sitesRef)).toEqual([0, 2, 4, 5].map(listed));
  });

  test("lists nothing when the scope has no computed loading site", () => {
    expect(unresolvedSites({ sites: [site(0, ["src/load.ts", "dynamic-import", "./invoice", "import('./invoice')"])] },
      new Set(["src/load.ts"]), sitesRef)).toEqual([]);
  });
});
