import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given } from "@cucumber/cucumber";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { type JsonRecord, stageTwoSnapshot } from "../../packages/producer/test/support/stage-2-attempt.ts";
import { saveStageThreeReview, stageThree, stageThreeAttempt, type StageThreeAttempt, stageThreeRequiredGaps, type StageTwoKnip,
  stageTwoRun } from "../../packages/producer/test/support/stage-3-attempt.ts";
import type { SnapshotFile } from "../../packages/producer/test/support/staged-run.ts";
import { pathWithDoubles } from "../../packages/producer/test/support/tool-doubles.ts";
import { readyToFinish, runFilesOutsideAttempt } from "./producer-stage-finish.steps.ts";
import type { LeftOutGapWorld } from "./producer-tool-gaps.steps.ts";

// The required gaps of the Stage 3 tool records, through the producer command line.
// Each scenario finishes Stage 2 on a new run, and then runs Stage 3 start, collect
// and its requests on a copy of that run. With a package manifest in the snapshot,
// Knip runs in the Docker double of the test support (doubles/docker.py). Without
// one, Stage 2 skips Knip. producer-stage-finish.steps.ts runs the finalizer, and
// producer-tool-gaps.steps.ts checks the refusal.
interface StageThreeGapsWorld extends LeftOutGapWorld {
  stageThreeGapsScratch?: string;
  stageThreeGapsAttempt?: StageThreeAttempt;
}

const app = { path: "app.ts", text: "export const value = 1;\n" };
// A source file that names a declaration file that the snapshot does not hold.
const invoice = { path: "src/invoice.ts", text: "/// <reference path=\"./env.d.ts\" />\nexport type Invoice = { id: string };\n" };
// The file of each tool record in the attempt, by the words of the scenario.
const toolRecords: Record<string, string> = { "symbol mentions": "symbol-mentions.json", "exports record": "exports-001.json" };

After({ tags: "@producer" }, function (this: StageThreeGapsWorld) {
  if (this.stageThreeGapsScratch) removeScratch(this.stageThreeGapsScratch);
});

function succeeded(action: string, result: CommandResult): void {
  assert.equal(result.status, 0, `${action}: ${result.stderr}`);
}

function currentAttempt(world: StageThreeGapsWorld): StageThreeAttempt {
  assert.ok(world.stageThreeGapsAttempt, "Prepare a Stage 3 attempt first.");
  return world.stageThreeGapsAttempt;
}

function savedJson(attempt: StageThreeAttempt, name: string): JsonRecord {
  return JSON.parse(readFileSync(join(attempt.folder, name), "utf8")) as JsonRecord;
}

// The settings of the Stage 2 actions that run Knip in the Docker double. The double approves the tool image.
function dockerDouble(scratch: string, settings: Record<string, string> = {}): Record<string, string> {
  return { PATH: pathWithDoubles(scratch), DOCKER_DOUBLE_LOG: join(scratch, "docker.log"), ...settings };
}

// Finishes Stage 2 on a new run of the snapshot with the Knip settings, and runs
// start and collect of a new Stage 3 attempt on a copy of the run.
function collectedAttempt(world: StageThreeGapsWorld, snapshot: SnapshotFile[],
  knip: (scratch: string) => StageTwoKnip = () => ({})): StageThreeAttempt {
  const scratch = makeScratch();
  world.stageThreeGapsScratch = scratch;
  const stageTwoWork = stageTwoRun(scratch, snapshot, knip(scratch));
  mkdirSync(join(scratch, "stage-3"));
  const attempt = stageThreeAttempt(stageTwoWork, join(scratch, "stage-3"), "s3-gaps");
  for (const action of ["start", "collect"]) succeeded(action, stageThree(attempt, ["stage-3", action]));
  world.stageThreeGapsAttempt = attempt;
  return attempt;
}

// The plan selects no production analysis, so the normal Knip run completes and the production run is skipped.
Given("a Stage 3 attempt whose symbol mentions is partial", function (this: StageThreeGapsWorld) {
  const attempt = collectedAttempt(this, stageTwoSnapshot, (scratch) => ({ env: dockerDouble(scratch),
    plan: { runProduction: false, productionReason: "No production entry is known (inventory-001)." } }));
  assert.equal(savedJson(attempt, "symbol-mentions.json").status, "partial");
});

// The Docker double prints a Knip report that is not JSON, so both Knip runs fail.
Given("a Stage 3 attempt whose symbol mentions is unavailable", function (this: StageThreeGapsWorld) {
  const attempt = collectedAttempt(this, stageTwoSnapshot, (scratch) => ({ env: dockerDouble(scratch, { DOCKER_DOUBLE_KNIP: "invalid" }) }));
  assert.equal(savedJson(attempt, "symbol-mentions.json").status, "unavailable");
});

// src/invoice.ts names env.d.ts in a reference path directive. The snapshot has no
// package manifest, so Stage 2 skips Knip, and the symbol mentions are skipped too.
Given("a Stage 3 attempt whose exports record is missing a declaration file that it names", function (this: StageThreeGapsWorld) {
  const attempt = collectedAttempt(this, [app, invoice]);
  succeeded("exports", stageThree(attempt, ["stage-3", "exports", invoice.path]));
  const gaps = savedJson(attempt, "exports-001.json").gaps as JsonRecord[];
  assert.deepEqual(gaps.map(({ input, missing }) => ({ input, missing })), [{ input: "reference-path", missing: "src/env.d.ts" }]);
});

// The review copies every other required gap of the attempt.
Given(/^a Stage 3 review that leaves out the required gap of the (symbol mentions|exports record)$/,
  function (this: StageThreeGapsWorld, record: string) {
    const attempt = currentAttempt(this);
    const ref = `${attempt.id}-file@${String(toolRecords[record])}`;
    const gap = stageThreeRequiredGaps(attempt).find((item) =>
      (item.evidenceRefs as string[]).some((evidence) => evidence.split("#")[0] === ref));
    assert.ok(gap, `No required gap of the attempt cites ${ref}.`);
    this.leftOutGap = gap.id as string;
    succeeded("save-review", saveStageThreeReview(attempt, (packet) => {
      packet.analysis.gaps = (packet.analysis.gaps as JsonRecord[]).filter((item) => item.id !== gap.id);
    }));
    readyToFinish(this, { stage: 3, finish: () => stageThree(attempt, ["stage-3-finish"]),
      published: () => runFilesOutsideAttempt(attempt.work, attempt.id) });
  });
