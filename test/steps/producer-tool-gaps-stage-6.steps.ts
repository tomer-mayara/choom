import assert from "node:assert/strict";
import type { SpawnSyncReturns } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { rewriteStageFiveFiles, type StageSixFixture, stageSixFixture }
  from "../../packages/producer/test/support/stage-6-run.ts";

// The completion check of the tool results, through the producer command line. The
// shared record checks of Stages 4 to 6 list the tool results of the selected history,
// and each result whose outcome needs a gap must have a gap that cites it. The run is
// the Stage 6 producer fixture (fixtures/entry-points/producer.mjs).
// producer-recovery.steps.ts saves the result, checks that nothing changed, and removes
// the run folder after the scenario.
interface ToolResultWorld extends World {
  producerRun?: StageSixFixture;
  saveCommands?: SpawnSyncReturns<string>[];
  // The evidence reference of the tool result that no gap cites.
  uncitedToolResult?: string;
}

// The Knip receipts of the fixture. The selected entry analysis names them as knipRunsRef.
const receiptsRef = "knip-runs";
const receiptsPath = "evidence/knip-runs.json";

// The normal Knip run completes and the production run is skipped, as when the plan
// selects no production analysis. Only the runs of the receipts change, so their input
// digests stay correct. run.yaml and the readiness review get the new SHA-256.
Given("a reviewed Stage 5 draft whose selected history has a skipped Knip run and no gap that cites it",
  async function (this: ToolResultWorld) {
    const run = await stageSixFixture();
    this.producerRun = run;
    const receipts = JSON.parse(readFileSync(join(run.work, receiptsPath), "utf8")) as Record<string, unknown>;
    receipts.runs = [{ mode: "normal", status: "completed" },
      { mode: "production", status: "skipped", reasons: ["The plan selected no production analysis."] }];
    rewriteStageFiveFiles(run, { [receiptsPath]: JSON.stringify(receipts) });
    const { gaps } = parse(readFileSync(join(run.work, "discovery.yaml"), "utf8")) as { gaps: { evidenceRefs: string[] }[] };
    assert.ok(gaps.every(({ evidenceRefs }) => evidenceRefs.every((ref) => !ref.startsWith(receiptsRef))),
      "A gap of the draft cites the Knip receipts.");
    this.uncitedToolResult = `${receiptsRef}#/runs/1`;
  });

// The refusal names the tool result by its evidence reference, in the one form of every kind of tool result.
Then("the operator is told which tool result has no gap", function (this: ToolResultWorld) {
  assert.ok(this.uncitedToolResult, "Prepare a tool result without a gap first.");
  const stderr = this.saveCommands?.[0]?.stderr ?? "";
  assert.ok(stderr.includes(`The tool result ${this.uncitedToolResult} has no gap that cites it.`), stderr);
});
