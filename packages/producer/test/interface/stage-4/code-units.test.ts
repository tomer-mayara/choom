import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { type FixtureBaseline, publishStageFour, stageFourPublication } from "../../fixtures/stage-4-publication/fixture.ts";
import { folderState } from "../../support/producer-record.ts";

// Stage 4 maps whole files. Stage 5 starts from that mapping and can divide a file
// by symbol selectors, so the Stage 4/5 publisher refuses a version 5 baseline and a
// mapping of files and parts in Stage 4, before it writes anything.
type Records = Record<string, Record<string, unknown>>;
const message = "Stage 4 maps whole files: use formatVersion 6 (1 to 4 for legacy runs) and a mapping with unitKind: file. " +
  "Stage 5 can divide a file by symbol selectors.\n";

// The Stage 4 units as units of a mapping of files and parts.
function filesAndParts(records: Records): void {
  const mapping = records["code-mapping.json"] as { scope: Record<string, unknown>; units: Record<string, unknown>[] };
  mapping.scope.unitKind = "file-or-part";
  mapping.units = mapping.units.map((unit) => ({ ...unit, unitKind: "file" }));
}

describe("the Stage 4/5 publisher in Stage 4", () => {
  test.each<[string, (baseline: FixtureBaseline) => void, (records: Records) => void]>([
    ["a version 5 baseline", (baseline) => { baseline.formatVersion = 5; }, () => {}],
    ["a code mapping of files and parts", () => {}, filesAndParts],
  ])("refuses %s in check and finish, and writes nothing", (_name, changeBaseline, changeRecords) => {
    const fixture = stageFourPublication(changeBaseline, [], undefined, changeRecords);
    try {
      const before = folderState(fixture.work);
      for (const action of ["check", "finish"] as const)
        expect({ action, ...publishStageFour(fixture, action) }).toEqual({ action, status: 1, stdout: "", stderr: message });
      expect(folderState(fixture.work)).toEqual(before);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 60_000);
});
