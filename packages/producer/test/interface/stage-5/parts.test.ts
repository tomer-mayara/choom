import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ts } from "ts-morph";
import { partsNotes } from "../../../src/stage-5-parts.ts";
import type { ExtraFile } from "../../fixtures/stage-4-publication/fixture.ts";
import { billingFile, billingPath, billingRestRanges, billingText, computePriceRanges, divideBilling }
  from "../../fixtures/stage-5-publication/divided-file.ts";
import { component, publishStageFive, runStageFive, type SourceRange, type StageFiveCollection, stageFiveCollection,
  writeStageFivePacket } from "../../fixtures/stage-5-publication/fixture.ts";
import { type CommandResult, toolsRoot } from "../../support/commands.ts";
import { rangeIn } from "../../support/source-ranges.ts";

// The Stage 5 parts action after collect, on a run after a published Stage 4 review
// whose snapshot holds billing.ts, as an operator runs it: the record that a request
// saves, its receipt, its refusals, and the Stage 4/5 publisher, which checks the
// receipt of each parts request. The review of the fixture divides billing.ts with
// the ranges of the record and cites the record as the evidence of the units.
type Json = Record<string, unknown>;
interface Part { unitKind: string; symbol?: string; ranges: SourceRange[] }

const id = "s5-check";
const sourceSitesRef = "s4-check-file@source-sites.json";
const header = { formatVersion: 1, attemptId: id, runRef: "run-check", snapshotRef: "snapshot-check" };
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const packageVersion = (name: string): unknown =>
  (JSON.parse(readFileSync(join(toolsRoot, "node_modules", name, "package.json"), "utf8")) as Json).version;
const notes: ExtraFile = { path: "notes.md", text: "# Notes\n" };
const broken: ExtraFile = { path: "broken.ts", text: "export const = 1;\n" };
const importRate = "import { rate } from './rate';";

let fixture: StageFiveCollection;
const requests: CommandResult[] = [];
let withoutSymbol: CommandResult;
const saved = (name: string): Json => JSON.parse(readFileSync(join(fixture.stageFive, name), "utf8")) as Json;

beforeAll(() => {
  fixture = stageFiveCollection([billingFile, notes, broken]);
  for (const args of [[billingPath, "computePrice"], [billingPath, "computeTax"], ["missing.ts", "computePrice"], ["notes.md", "notes"],
    ["broken.ts", "value"]]) requests.push(runStageFive(fixture, ["parts", ...args]));
  withoutSymbol = runStageFive(fixture, ["parts", billingPath]);
}, 120_000);

afterAll(() => rmSync(fixture.root, { recursive: true, force: true }));

describe("Stage 5 parts", () => {
  test("saves the parts of the file with their ranges and the dependencies at both levels, as a numbered request", () => {
    const name = "parts-001.json";
    expect(requests[0]).toEqual({ status: 0, stderr: "", stdout: `Saved ${id}-file@${name} at ${join(fixture.stageFive, name)} ` +
      `(SHA-256 ${sha256(readFileSync(join(fixture.stageFive, name)))}).\n` });
    expect(saved("operator-parts-001.json")).toMatchObject({ phase: "parts-001", action: "parts", status: "completed", exitCode: 0,
      digests: { [name]: sha256(readFileSync(join(fixture.stageFive, name))) } });
    const sites = (JSON.parse(readFileSync(join(fixture.work, "evidence/s4-check/source-sites.json"), "utf8")) as { sites: Json[] }).sites;
    const siteIndex = sites.findIndex((site) => site.path === billingPath && site.specifier === "./rate");
    expect(saved(name)).toEqual({ ...header, path: billingPath, sha256: sha256(billingText), symbols: ["computePrice"], sourceSitesRef,
      tool: { name: "ts-morph project of the saved file (TypeScript type checker)", tsMorph: packageVersion("ts-morph"),
        typescript: ts.version },
      parts: [{ unitKind: "symbol", symbol: "computePrice", ranges: computePriceRanges, dependencies: [] },
        { unitKind: "rest", ranges: billingRestRanges, dependencies: [{ siteRef: `${sourceSitesRef}#/sites/${siteIndex}`, kind: "import",
          specifier: "./rate", typeOnly: false, dynamic: false, range: rangeIn(billingText, importRate), expression: importRate,
          truncated: false, localNames: ["rate"] }] }],
      fileDependencies: [], notes: partsNotes });
  });

  test.each([
    [2, "The symbol selector computeTax of billing.ts matched nothing: the file has no top-level declaration with that name."],
    [3, "File is outside the inventory: missing.ts"],
    [4, "The symbol selectors cannot divide notes.md: the file is not JavaScript or TypeScript."],
    [5, "The symbol selectors cannot divide broken.ts: the file has syntax errors."],
  ])("refuses request %d with a failed receipt and no saved record: %s", (number, message) => {
    const phase = `parts-${String(number).padStart(3, "0")}`;
    expect(requests[number - 1]).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
    expect(saved(`operator-${phase}.json`)).toMatchObject({ phase, status: "failed", exitCode: 1, digests: {} });
    expect(existsSync(join(fixture.stageFive, `${phase}.json`))).toBe(false);
  });

  test("refuses a request without a symbol before it saves a receipt", () => {
    expect({ status: withoutSymbol.status, stdout: withoutSymbol.stdout }).toEqual({ status: 1, stdout: "" });
    expect(withoutSymbol.stderr).toContain("Use start, collect, excerpt PATH FIRST LAST, or parts PATH SYMBOL [SYMBOL ...].");
    expect(existsSync(join(fixture.stageFive, "operator-parts-006.started.json"))).toBe(false);
  });
});

describe("the Stage 4/5 publisher with Stage 5 parts requests", () => {
  test("accepts a divided file with the ranges of the parts record, whose units cite the record", () => {
    const [price, rest] = saved("parts-001.json").parts as Part[];
    const packet = writeStageFivePacket(fixture, {
      baseline(baseline) {
        baseline.formatVersion = 5;
        baseline.components.push(component("billing", { paths: [billingPath] }),
          component("pricing", { paths: [], symbols: [{ path: billingPath, symbol: "computePrice" }] }));
      },
      mapping(mapping, baseline) {
        divideBilling(mapping, baseline, [{ symbol: "computePrice", owner: "pricing", ranges: price?.ranges ?? [] }],
          { owner: "billing", ranges: rest?.ranges ?? [] });
        for (const unit of mapping.units.filter((item) => item.path === billingPath))
          unit.evidenceRefs = [`${id}-file@parts-001.json#/parts/${unit.unitKind === "symbol" ? 0 : 1}`];
      },
    });
    const check = publishStageFive(packet, "check");
    expect({ status: check.status, stderr: check.stderr }).toEqual({ status: 0, stderr: "" });
    expect(JSON.parse(check.stdout) as Json).toMatchObject({ status: "stage5-review-verified", mappedFiles: 5 });
  }, 60_000);

  test("refuses the attempt after a parts record changed", () => {
    writeFileSync(join(fixture.stageFive, "parts-001.json"), readFileSync(join(fixture.stageFive, "parts-001.json"), "utf8") + "\n");
    const packet = { ...fixture, reviewFive: join(fixture.root, "review-5") };
    expect(publishStageFive(packet, "check")).toEqual({ status: 1, stdout: "", stderr: "Collection output changed: parts-001.json\n" });
  }, 60_000);
});
