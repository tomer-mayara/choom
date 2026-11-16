import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as tsMorph from "ts-morph";
import { partsNotes, type PartsInput, partsRecord } from "../../src/stage-5-parts.ts";
import { rangeIn } from "../support/source-ranges.ts";

// The record of the Stage 5 parts action, from the checked bytes of one file and
// the saved Stage 4 source sites. The saved sites hold a site of another file, the
// sites of billing.ts in source order, and a resource call that is not a dependency.
type Fields = Record<string, unknown>;
const billing = ["import { round } from './money';", "import { rate } from './rate';", "import './setup';", "",
  "export function computeInvoice(total: number): number {", "  return fetch('/rates').then(() => total * rate);", "}", "",
  "/** The price of a number of items. */", "export function computePrice(count: number): number {",
  "  return round(count * 2) + import(`./prices/${count}`).length;", "}", ""].join("\n");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const header = { formatVersion: 1, attemptId: "s5-check", runRef: "run-check", snapshotRef: "snapshot-check" };
const sitesRef = "s4-check-file@source-sites.json";
const site = (path: string, kind: string, specifier: string | null): Fields => ({ path, kind, specifier });
const savedSites = [site("cli.ts", "import", "./http"), site("billing.ts", "import", "./money"), site("billing.ts", "import", "./rate"),
  site("billing.ts", "import", "./setup"), site("billing.ts", "resource-call-candidate", null),
  site("billing.ts", "dynamic-import", null)];
const versions = { tsMorph: "28.0.0", typescript: tsMorph.ts.version };

function input(text: string, sites: Fields[] = savedSites, symbols = ["computePrice"], path = "billing.ts"): PartsInput {
  return { header, path, symbols, file: { bytes: Buffer.byteLength(text), sha256: sha256(text) },
    read: () => Buffer.from(text), sites: { sites }, sitesRef, tools: { tsMorph, versions } };
}

// A dependency of billing.ts as the record saves it. No site of billing.ts is type-only.
const dependency = (siteIndex: number | null, kind: string, specifier: string | null, expression: string,
  localNames: string[] = []): Fields => ({ siteRef: siteIndex === null ? null : `${sitesRef}#/sites/${siteIndex}`, kind, specifier,
  typeOnly: false, dynamic: kind === "dynamic-import", range: rangeIn(billing, expression), expression, truncated: false, localNames });

describe("the record of the Stage 5 parts action", () => {
  test("saves the parts with their ranges and each dependency with its saved site, range, expression and local names", () => {
    const priceText = "/** The price of a number of items. */\nexport function computePrice(count: number): number {\n" +
      "  return round(count * 2) + import(`./prices/${count}`).length;\n}";
    expect(partsRecord(input(billing))).toEqual({ ...header, path: "billing.ts", sha256: sha256(billing), symbols: ["computePrice"],
      sourceSitesRef: sitesRef, tool: { name: "ts-morph project of the saved file (TypeScript type checker)", ...versions },
      parts: [
        { unitKind: "symbol", symbol: "computePrice", ranges: [rangeIn(billing, priceText)],
          dependencies: [dependency(1, "import", "./money", "import { round } from './money';", ["round"])] },
        { unitKind: "rest", ranges: [[{ line: 1, column: 1 }, { line: 9, column: 1 }], [{ line: 12, column: 2 }, { line: 13, column: 1 }]],
          dependencies: [dependency(2, "import", "./rate", "import { rate } from './rate';", ["rate"])] },
      ],
      fileDependencies: [{ ...dependency(3, "import", "./setup", "import './setup';"), reason: "not-resolved" },
        { ...dependency(5, "dynamic-import", null, "import(`./prices/${count}`)"), reason: "not-resolved" }],
      notes: partsNotes });
  });

  test("names the parts that use a shared import, and keeps the symbols of the request once, in its order", () => {
    const shared = billing.replace("total * rate", "round(total) * rate");
    const record = partsRecord(input(shared, savedSites, ["computePrice", "computeInvoice", "computePrice"]));
    expect(record.symbols).toEqual(["computePrice", "computeInvoice"]);
    expect((record.fileDependencies as Fields[]).map(({ expression, reason, usedIn }) => ({ expression, reason, usedIn }))).toEqual([
      { expression: "import { round } from './money';", reason: "shared",
        usedIn: [{ unitKind: "symbol", symbol: "computeInvoice" }, { unitKind: "symbol", symbol: "computePrice" }] },
      { expression: "import './setup';", reason: "not-resolved", usedIn: undefined },
      { expression: "import(`./prices/${count}`)", reason: "not-resolved", usedIn: undefined },
    ]);
  });

  test("names no saved site when the saved sites of the file stop before a site or differ from it", () => {
    const sites = [savedSites[0], savedSites[1], site("billing.ts", "import", "./other")] as Fields[];
    const record = partsRecord(input(billing, sites));
    const siteRefs = [...(record.parts as Fields[]).flatMap((part) => part.dependencies as Fields[]),
      ...record.fileDependencies as Fields[]].map((item) => [item.specifier, item.siteRef]);
    expect(siteRefs).toEqual([["./money", `${sitesRef}#/sites/1`], ["./rate", null], ["./setup", null], [null, null]]);
  });

  test("clips an expression after 4096 characters and says so", () => {
    const long = `import(\`./${"x".repeat(5000)}\`)`;
    const text = `export function computePrice(): unknown {\n  return ${long};\n}\n`;
    const [part] = partsRecord(input(text, [])).parts as Fields[];
    expect((part?.dependencies as Fields[]).map(({ expression, truncated }) => [expression, truncated]))
      .toEqual([[long.slice(0, 4096), true]]);
  });

  test("refuses a file and a symbol that the symbol selectors cannot divide, with the messages of the record checks", () => {
    expect(() => partsRecord(input(billing, savedSites, ["computeTax"]))).toThrow(new Error("The symbol selector computeTax of " +
      "billing.ts matched nothing: the file has no top-level declaration with that name."));
    expect(() => partsRecord(input("# Notes\n", [], ["notes"], "notes.md")))
      .toThrow(new Error("The symbol selectors cannot divide notes.md: the file is not JavaScript or TypeScript."));
  });
});
