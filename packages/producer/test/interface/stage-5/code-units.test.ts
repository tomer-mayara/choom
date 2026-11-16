import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { billingFile, billingPath, billingRestRanges, computePriceRanges, divideBilling }
  from "../../fixtures/stage-5-publication/divided-file.ts";
import { component, publishStageFive, type SourceRange, type StageFivePublication, stageFivePublication }
  from "../../fixtures/stage-5-publication/fixture.ts";
import { folderState } from "../../support/producer-record.ts";

// The Stage 4/5 publisher in Stage 5, as an operator runs it, with a version 5
// baseline in which Pricing names the symbol computePrice of billing.ts, which
// Billing owns by its path. The code mapping divides billing.ts into the unit of
// computePrice and the rest unit.
function withDividedFile(use: (fixture: StageFivePublication) => void, symbolRanges: SourceRange[] = computePriceRanges): void {
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
  });
  try {
    use(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function result(output: { status: number | null; stdout: string; stderr: string }): unknown {
  expect({ status: output.status, stderr: output.stderr }).toEqual({ status: 0, stderr: "" });
  return JSON.parse(output.stdout) as unknown;
}

describe("the Stage 4/5 publisher with a divided file in Stage 5", () => {
  test("checks, publishes and verifies the version 5 baseline and the code mapping of files and parts", () => {
    withDividedFile((fixture) => {
      expect(result(publishStageFive(fixture, "check")))
        .toMatchObject({ status: "stage5-review-verified", components: 4, mappedFiles: 3, unknownOwners: 0, writes: [] });
      expect(result(publishStageFive(fixture, "finish"))).toMatchObject({ status: "stage5-published" });
      const run = parse(readFileSync(join(fixture.work, "run.yaml"), "utf8")) as { progress: Record<string, string> };
      const discovery = parse(readFileSync(join(fixture.work, "discovery.yaml"), "utf8")) as { codeMappingRef: string };
      const baseline = parse(readFileSync(join(fixture.work, "baseline.yaml"), "utf8")) as { formatVersion: number };
      expect({ remainingCode: run.progress.remainingCode, codeMappingRef: discovery.codeMappingRef,
        formatVersion: baseline.formatVersion })
        .toEqual({ remainingCode: "complete", codeMappingRef: "s5-check-file@code-mapping.json", formatVersion: 5 });
      expect(result(publishStageFive(fixture, "verify"))).toMatchObject({ status: "stage5-publication-verified", writes: [] });
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
});
