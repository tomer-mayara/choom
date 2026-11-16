import { describe, expect, test } from "bun:test";
import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { billingFile, billingPath, billingRestRanges, computePriceRanges, divideBilling }
  from "../../fixtures/stage-5-publication/divided-file.ts";
import { component, publishStageFive, type SourceRange, type StageFivePublication, stageFivePublication }
  from "../../fixtures/stage-5-publication/fixture.ts";
import { type CommandResult, makeScratch, removeScratch } from "../../support/commands.ts";
import { folderState } from "../../support/producer-record.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";

// The Stage 4/5 publisher in Stage 5, as an operator runs it, with a version 5
// baseline in which Pricing names the symbol computePrice of billing.ts, which
// Billing owns by its path. The code mapping divides billing.ts into the unit of
// computePrice and the rest unit. `tools` is the tool checkout of every action.
function withDividedFile(use: (fixture: StageFivePublication) => void, symbolRanges: SourceRange[] = computePriceRanges,
  tools?: string): void {
  const fixture = stageFivePublication([billingFile], {
    baseline(baseline) {
      baseline.formatVersion = 5;
      baseline.components.push(component("billing", { paths: [billingPath] }),
        component("pricing", { paths: [], symbols: [{ path: billingPath, symbol: "computePrice" }] }));
    },
    mapping(mapping, baseline) {
      divideBilling(mapping, baseline, [{ symbol: "computePrice", owner: "pricing", ranges: symbolRanges }],
        { owner: "billing", ranges: billingRestRanges });
    },
  }, tools);
  try {
    use(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// The JSON output of a publisher action that succeeded.
const published = ({ status, stdout, stderr }: CommandResult): unknown => {
  expect({ status, stderr }).toEqual({ status: 0, stderr: "" });
  return JSON.parse(stdout) as unknown;
};

describe("the Stage 4/5 publisher with a divided file in Stage 5", () => {
  test("checks, publishes and verifies the version 5 baseline and the code mapping of files and parts", () => {
    withDividedFile((fixture) => {
      expect(published(publishStageFive(fixture, "check")))
        .toMatchObject({ status: "stage5-review-verified", components: 4, mappedFiles: 3, unknownOwners: 0, writes: [] });
      expect(published(publishStageFive(fixture, "finish"))).toMatchObject({ status: "stage5-published" });
      const run = parse(readFileSync(join(fixture.work, "run.yaml"), "utf8")) as { progress: Record<string, string> };
      const discovery = parse(readFileSync(join(fixture.work, "discovery.yaml"), "utf8")) as { codeMappingRef: string };
      const baseline = parse(readFileSync(join(fixture.work, "baseline.yaml"), "utf8")) as { formatVersion: number };
      expect({ remainingCode: run.progress.remainingCode, codeMappingRef: discovery.codeMappingRef,
        formatVersion: baseline.formatVersion })
        .toEqual({ remainingCode: "complete", codeMappingRef: "s5-check-file@code-mapping.json", formatVersion: 5 });
      expect(published(publishStageFive(fixture, "verify"))).toMatchObject({ status: "stage5-publication-verified", writes: [] });
    });
  }, 60_000);

  test("refuses units whose ranges differ from the syntax tree, gives the units of the file, and writes nothing", () => {
    withDividedFile((fixture) => {
      const before = folderState(fixture.work);
      const units = [{ unitKind: "symbol", symbol: "computePrice", owner: "pricing", ranges: computePriceRanges },
        { unitKind: "rest", owner: "billing", ranges: billingRestRanges }];
      expect(publishStageFive(fixture, "check")).toEqual({ status: 1, stdout: "", stderr: "The code units of billing.ts differ " +
        `from the units that its symbol selectors give in the saved snapshot. The units must be: ${JSON.stringify(units)}\n` });
      expect(folderState(fixture.work)).toEqual(before);
    }, [[{ line: 8, column: 1 }, { line: 10, column: 2 }]]);
  }, 60_000);

  // Stage 5 start pins the module files of ts-morph and of its TypeScript in its
  // handoff. The publisher divides a file only with those files.
  test("refuses to divide a file after the TypeScript of ts-morph changed since Stage 5 start, and writes nothing", () => {
    const scratch = makeScratch();
    try {
      withDividedFile((fixture) => {
        const file = "@ts-morph/common/dist/typescript.js";
        appendFileSync(join(fixture.tools, "node_modules", file), "\n// A later change.\n");
        const before = folderState(fixture.work);
        expect(publishStageFive(fixture, "check")).toEqual({ status: 1, stdout: "",
          stderr: `Trusted parser module changed since Stage 5 start: ${file}\n` });
        expect(folderState(fixture.work)).toEqual(before);
      }, computePriceRanges, copyToolCheckout(scratch));
    } finally {
      removeScratch(scratch);
    }
  }, 120_000);
});
