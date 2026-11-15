import { describe, expect, test } from "bun:test";
import { type UnresolvedSite, unresolvedSites } from "../../src/stage-4-references.ts";

// The loading sites of the saved source sites that the Stage 4 references action
// lists as possible uses that it does not resolve, each with its reason.
type Site = Record<string, unknown>;
type Row = [path: string, kind: string, specifier: string | null, expression: string];
const sitesRef = "s4-check-file@source-sites.json";
const computedName = "The module name is computed. The query cannot tell which module the site names, so it can name " +
  "the module of the symbol.";
const typeScriptRequire = "TypeScript does not follow a require call in a TypeScript file. The call can load the module " +
  "of the symbol.";

function site(index: number, [path, kind, specifier, expression]: Row): Site {
  return { id: `s4-check-site-${index + 1}`, path, sha256: "0".repeat(64), lines: [index + 1, index + 1], kind, specifier,
    typeOnly: false, dynamic: kind === "dynamic-import", expression, truncated: false };
}

// The unresolved entries of the sites of the rows, in the scope of each path that a listed row names.
function listedFrom(rows: Row[], scope: string[]): { sites: Site[]; listed: (index: number, reason: string) => UnresolvedSite;
  found: UnresolvedSite[] } {
  const sites = rows.map((row, index) => site(index, row));
  const listed = (index: number, reason: string): UnresolvedSite => {
    const { path, lines, kind, expression } = sites[index] ?? {};
    return { siteRef: `${sitesRef}#/sites/${index}`, path, lines, kind, expression, reason };
  };
  return { sites, listed, found: unresolvedSites({ sites }, new Set(scope), sitesRef) };
}

describe("unresolvedSites", () => {
  // Changed on purpose: a require call with a literal name in a TypeScript file is listed too, and each entry has a reason.
  test("lists each loading site of the scope whose module name is computed, and each require call of a TypeScript file", () => {
    const { listed, found } = listedFrom([
      ["src/load.ts", "dynamic-import", null, "import(name)"],
      ["src/load.ts", "dynamic-import", "./invoice", "import('./invoice')"],
      ["src/load.ts", "require-candidate", null, "require(name)"],
      ["src/load.ts", "require-candidate", "./invoice", "require('./invoice')"],
      ["src/load.ts", "require-resolve-candidate", null, "require.resolve(name)"],
      ["src/load.ts", "import-equals", null, "import legacy = require(name);"],
      ["src/load.ts", "resource-call-candidate", null, "fetch(url)"],
      ["src/load.ts", "import", "./invoice", "import './invoice';"],
      ["other/load.ts", "dynamic-import", null, "import(other)"],
      ["other/load.ts", "require-candidate", "./invoice", "require('./invoice')"],
    ], ["src/load.ts"]);
    expect(found).toEqual([listed(0, computedName), listed(2, computedName), listed(3, typeScriptRequire),
      listed(4, computedName), listed(5, computedName)]);
  });

  test("lists a require call with a literal name in each kind of TypeScript file, and not in a JavaScript file", () => {
    const paths = ["a.ts", "b.tsx", "c.mts", "d.cts", "e.d.ts", "f.js", "g.jsx", "h.mjs", "i.cjs"];
    const { listed, found } = listedFrom(paths.map((path) => [path, "require-candidate", "./invoice", "require('./invoice')"]), paths);
    expect(found).toEqual([0, 1, 2, 3, 4].map((index) => listed(index, typeScriptRequire)));
  });

  test("lists nothing for a literal dynamic import or a literal require.resolve call, which the query follows or which loads nothing", () => {
    expect(listedFrom([["src/load.ts", "dynamic-import", "./invoice", "import('./invoice')"],
      ["src/load.ts", "require-resolve-candidate", "./worker.js", "require.resolve('./worker.js')"]], ["src/load.ts"]).found)
      .toEqual([]);
  });
});
