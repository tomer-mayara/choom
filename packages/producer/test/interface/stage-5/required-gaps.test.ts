import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import type { ExtraFile } from "../../fixtures/stage-4-publication/fixture.ts";
import { publishStageFive, stageFiveCollection, type StageFiveCollection, type StageFiveChanges, writeStageFivePacket }
  from "../../fixtures/stage-5-publication/fixture.ts";
import type { CommandResult } from "../../support/commands.ts";

// Stage 5 keeps the questions and gaps of Stage 4, so it keeps the required gaps of the
// Stage 4 candidate records too (DB5). The Stage 4/5 publisher refuses a Stage 5 packet
// that leaves one out, or that gives another question or gap an ID that Stage 4
// reserved for them. Here the Vite settings of the snapshot name the input of the
// build with a template that the code completes, so the behavior entry candidates of
// Stage 4 list one settings gap. The published Stage 4 packet copies its required gap,
// and the Stage 5 packet of the fixture starts from the published Stage 4 records.
type Json = Record<string, unknown>;
type Records = Parameters<NonNullable<StageFiveChanges["records"]>>[0];

const settingsFile: ExtraFile = { path: "site/vite.config.js",
  text: "const page = 'home';\nexport default { build: { rollupOptions: { input: [`${page}.html`] } } };\n" };
const requiredGap = "s4-check-behavior-entry-gap-001";
let collection: StageFiveCollection;

beforeAll(() => {
  collection = stageFiveCollection([settingsFile]);
}, 120_000);

afterAll(() => rmSync(collection.root, { recursive: true, force: true }));

// Writes the Stage 5 packet with the change of its records, and checks it.
function checkedPacket(records: (records: Records) => void = () => {}): CommandResult {
  return publishStageFive(writeStageFivePacket(collection, { records }), "check");
}

// Changes the gaps of the entry analysis and of the discovery in the same way.
const changeGaps = (change: (gaps: Json[]) => Json[]) => (records: Records): void => {
  for (const name of ["entry-analysis.yaml", "discovery.proposed.yaml"]) {
    const record = records[name] as { gaps: Json[] };
    record.gaps = change(record.gaps);
  }
};

describe("the Stage 4/5 publisher with a Stage 5 packet and the required gaps of Stage 4", () => {
  test("checks a Stage 5 packet that keeps the required gap of Stage 4", () => {
    const result = checkedPacket();
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
    // The gap that Stage 1 gave from the settings record, the gap of the Stage 3 fixture and the required gap of Stage 4.
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "stage5-review-verified", gaps: 3 });
  }, 60_000);

  test("refuses a Stage 5 packet that leaves out the required gap of Stage 4", () => {
    expect(checkedPacket(changeGaps((gaps) => gaps.filter(({ id }) => id !== requiredGap)))).toEqual({ status: 1, stdout: "",
      stderr: `The entry analysis leaves out the required gap ${requiredGap}. Copy each gap of s4-check-file@required-gaps.json exactly.\n` });
  }, 60_000);

  test("refuses a Stage 5 gap with an ID that Stage 4 reserved for the required gaps", () => {
    const added = (gaps: Json[]): Json[] => [...gaps, { id: "s4-check-behavior-entry-gap-002", kind: "deferred",
      subjectRefs: [settingsFile.path], reason: "The other inputs of the build are not reviewed.", evidenceRefs: ["launch-settings"] }];
    expect(checkedPacket(changeGaps(added))).toEqual({ status: 1, stdout: "", stderr: "The ID s4-check-behavior-entry-gap-002 is " +
      "reserved for the required gaps of s4-check-file@required-gaps.json. Use a different ID.\n" });
  }, 60_000);
});
