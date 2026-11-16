import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { decodeBaselineYaml } from "../../../../../src/lib/baseline-yaml.ts";
import { decodeDiscoveryResultYaml } from "../../../../../src/lib/discovery-result-yaml.ts";
import { fixtureRecords, publishedFixture, type StageSixFixture } from "../../support/stage-6-run.ts";

// The viewer opens the fixed records that Stage 6 saves for the Stage 6 producer
// fixture: the fixed baseline with its decoder, and the fixed discovery result
// with its codec, bound to the bytes of the saved baseline file. The producer, the
// baseline model and the viewer run together, so this is an integration suite.
let fixture: StageSixFixture;

beforeAll(async () => { fixture = await publishedFixture("s6-viewer"); }, 120_000);
afterAll(() => rmSync(fixture.root, { recursive: true, force: true }));

test("the viewer opens the saved discovery result of a completed run with its saved baseline file", () => {
  const baselineFile = readFileSync(join(fixture.work, fixtureRecords.baselinePath));
  const baseline = decodeBaselineYaml(baselineFile.toString("utf8"));
  if (baseline.status !== "success") throw new Error(`The viewer could not open the fixed baseline: ${baseline.message}`);
  const sha256 = createHash("sha256").update(baselineFile).digest("hex");
  const outcome = decodeDiscoveryResultYaml(readFileSync(join(fixture.work, fixtureRecords.discoveryPath), "utf8"), baseline.baseline, sha256);
  expect(outcome).toMatchObject({ status: "success", result: { formatVersion: 2, kind: "architecture-discovery",
    runRef: fixtureRecords.runRef, baselineRef: fixtureRecords.baselineRef, baselineDigest: sha256 } });
  expect(outcome.status === "success" && [outcome.result.questions.length, outcome.result.gaps.length]).toEqual([0, 1]);
});
