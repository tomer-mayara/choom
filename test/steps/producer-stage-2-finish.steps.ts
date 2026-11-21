import assert from "node:assert/strict";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { draftFaultSettings } from "../../packages/producer/test/support/doubles/draft-faults.ts";
import { folderState } from "../../packages/producer/test/support/producer-record.ts";
import { analysisPacket, entryAnalysis, type JsonRecord, runAttempt, stageOneRun, stageTwo, stageTwoAttempt,
  type StageTwoAttempt } from "../../packages/producer/test/support/stage-2-attempt.ts";

// Stage 2 finish on a small run, through the command line. The snapshot holds no
// package manifest, so preflight marks the Knip profile unsupported, and no Knip
// mode runs. A fault double can make a rename of the finish process fail.
interface StageTwoWorld extends World {
  stageTwoScratch?: string;
  stageTwoAttempt?: StageTwoAttempt;
  stageTwoFinish?: CommandResult;
  // The settings of the finish command, such as a fault double, and the run folder outside the attempt before it.
  finishSettings?: Record<string, string>;
  runFilesBefore?: [string, string][];
}

const app = { path: "app.ts", text: "export const value = 1;\n" };
const attemptId = "s2-check";

function currentAttempt(world: StageTwoWorld): StageTwoAttempt {
  assert.ok(world.stageTwoAttempt, "Prepare a Stage 2 attempt first.");
  return world.stageTwoAttempt;
}

function lastFinish(world: StageTwoWorld): CommandResult {
  assert.ok(world.stageTwoFinish, "Publish the Stage 2 attempt first.");
  return world.stageTwoFinish;
}

After({ tags: "@producer" }, function (this: StageTwoWorld) {
  if (this.stageTwoScratch) removeScratch(this.stageTwoScratch);
});

// Runs start, plan, prepare, toolchain and run of a new Stage 2 attempt.
function preparedAttempt(world: StageTwoWorld): StageTwoAttempt {
  const scratch = makeScratch();
  world.stageTwoScratch = scratch;
  const work = join(scratch, "run");
  stageOneRun(work, [app]);
  const attempt = stageTwoAttempt(work, attemptId);
  for (const [action, result] of Object.entries(runAttempt(attempt, scratch))) assert.equal(result.status, 0, `${action}: ${result.stderr}`);
  world.stageTwoAttempt = attempt;
  return attempt;
}

// Saves the review packet with the entry analysis.
function saveReview(world: StageTwoWorld, analysis: JsonRecord): void {
  const attempt = currentAttempt(world);
  const review = analysisPacket(join(world.stageTwoScratch ?? "", "review"), attempt.id, analysis);
  const saved = stageTwo(attempt, "save-review", [review]);
  assert.equal(saved.status, 0, saved.stderr);
}

// The files of the run folder outside the attempt, which keeps the records of each action.
function runFiles(attempt: StageTwoAttempt): [string, string][] {
  return folderState(attempt.work).filter(([path]) => !path.startsWith(`evidence/${attempt.id}/`));
}

// The default entry analysis copies the required gaps of the Knip outcomes.
Given("a Stage 2 attempt that is ready to publish", function (this: StageTwoWorld) {
  saveReview(this, entryAnalysis(preparedAttempt(this)));
});

Given("the replacement of the run manifest fails", function (this: StageTwoWorld) {
  this.finishSettings = draftFaultSettings(["run-rename"]);
});

When("the operator publishes the Stage 2 attempt", function (this: StageTwoWorld) {
  const attempt = currentAttempt(this);
  this.runFilesBefore = runFiles(attempt);
  this.stageTwoFinish = stageTwo(attempt, "finish", [], this.finishSettings ?? {});
});

Then("the publication is refused and the run folder outside the attempt is as it was", function (this: StageTwoWorld) {
  const finish = lastFinish(this);
  assert.equal(finish.status, 1, finish.stdout);
  assert.deepEqual(runFiles(currentAttempt(this)), this.runFilesBefore);
});

Then("the operator is told to keep the attempt and use a new attempt ID", function (this: StageTwoWorld) {
  assert.match(lastFinish(this).stderr, /Keep this attempt unchanged; use a new attempt ID after you resolve the cause\./);
});
