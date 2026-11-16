import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { decodeBaselineYaml } from "../../../../../src/lib/baseline-yaml.ts";
import { decodeDiscoveryResultYaml } from "../../../../../src/lib/discovery-result-yaml.ts";
import { fixtureRecords, publishedFixture, rewriteStageFiveFiles, type StageSixFixture, stageFiveFiles, stageSix, stageSixFixture }
  from "../../support/stage-6-run.ts";

// The viewer opens the fixed records that Stage 6 saves for the Stage 6 producer
// fixture: the fixed baseline with its decoder, and the fixed discovery result
// with its codec, bound to the bytes of the saved baseline file. The producer, the
// baseline model and the viewer run together, so this is an integration suite.
let fixture: StageSixFixture;

beforeAll(async () => { fixture = await publishedFixture("s6-viewer"); }, 120_000);
afterAll(() => rmSync(fixture.root, { recursive: true, force: true }));

// The viewer outcome for the saved discovery result of a completed run, with its saved baseline file.
function openSavedDiscovery(run: StageSixFixture): { outcome: ReturnType<typeof decodeDiscoveryResultYaml>; sha256: string } {
  const baselineFile = readFileSync(join(run.work, fixtureRecords.baselinePath));
  const baseline = decodeBaselineYaml(baselineFile.toString("utf8"));
  if (baseline.status !== "success") throw new Error(`The viewer could not open the fixed baseline: ${baseline.message}`);
  const sha256 = createHash("sha256").update(baselineFile).digest("hex");
  return { outcome: decodeDiscoveryResultYaml(readFileSync(join(run.work, fixtureRecords.discoveryPath), "utf8"), baseline.baseline, sha256),
    sha256 };
}

test("the viewer opens the saved discovery result of a completed run with its saved baseline file", () => {
  const { outcome, sha256 } = openSavedDiscovery(fixture);
  expect(outcome).toMatchObject({ status: "success", result: { formatVersion: 2, kind: "architecture-discovery",
    runRef: fixtureRecords.runRef, baselineRef: fixtureRecords.baselineRef, baselineDigest: sha256 } });
  expect(outcome.status === "success" && [outcome.result.questions.length, outcome.result.gaps.length]).toEqual([0, 1]);
});

// A YAML alias in the working discovery makes two fields one list when Stage 6
// reads it. The saved fixed result has no alias, which the viewer refuses.
test("the viewer opens the saved discovery result of a run whose working discovery shares one list through a YAML alias", async () => {
  const run = await stageSixFixture();
  try {
    const shared = readFileSync(join(run.work, stageFiveFiles.discovery), "utf8")
      .replace("inspectedPaths: []\nquestions: []\n", "inspectedPaths: &none []\nquestions: *none\n");
    expect(shared).toContain("questions: *none\n");
    rewriteStageFiveFiles(run, { [stageFiveFiles.discovery]: shared, [stageFiveFiles.proposal]: shared });
    for (const args of [["start", run.review], ["finish"], ["verify"]])
      expect(stageSix(run.work, "s6-viewer", args)).toMatchObject({ status: 0, stderr: "" });
    expect(openSavedDiscovery(run).outcome).toMatchObject({ status: "success", result: { inspectedPaths: [], questions: [] } });
  } finally {
    rmSync(run.root, { recursive: true, force: true });
  }
}, 120_000);
