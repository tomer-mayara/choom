import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { Then, When, type World } from "@cucumber/cucumber";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";
import { folderState } from "../../packages/producer/test/support/producer-record.ts";

// The finish action of Stage 1, 2 or 3, through the command line. Several features
// use the steps "the operator finishes Stage N" and "the Stage N result is not
// published", and a step text can have one definition only. So each feature prepares
// its run in a Given and gives the finish action to readyToFinish. The When and the
// Then of this file then serve each feature.
export interface StageFinish {
  stage: number;
  // Runs the finish action of the stage.
  finish(): CommandResult;
  // The state that a publication changes, such as the run folder outside the attempt.
  // A refused finish must leave it as it was.
  published(): unknown;
}
export interface StageFinishWorld extends World {
  stageFinish?: StageFinish;
  publishedBefore?: unknown;
  stageFinishResult?: CommandResult;
}

// The files of the run folder outside the attempt folder, evidence/<attempt ID>. The
// attempt folder keeps the records of each action, also of a refused finish.
export function runFilesOutsideAttempt(work: string, attemptId: string): [string, string][] {
  return folderState(work).filter(([path]) => path !== `evidence/${attemptId}` && !path.startsWith(`evidence/${attemptId}/`));
}

// A Given calls this when its run is ready for the finish action of the stage.
export function readyToFinish(world: StageFinishWorld, finish: StageFinish): void {
  world.stageFinish = finish;
}

// The result of the finish action of the scenario.
export function finishResult(world: StageFinishWorld): CommandResult {
  assert.ok(world.stageFinishResult, "Finish the stage first.");
  return world.stageFinishResult;
}

function prepared(world: StageFinishWorld, stage: number): StageFinish {
  assert.equal(world.stageFinish?.stage, stage, `Prepare a run that is ready to finish Stage ${stage} first.`);
  return world.stageFinish as StageFinish;
}

When("the operator finishes Stage {int}", function (this: StageFinishWorld, stage: number) {
  const ready = prepared(this, stage);
  this.publishedBefore = ready.published();
  this.stageFinishResult = ready.finish();
});

Then("the Stage {int} result is not published", function (this: StageFinishWorld, stage: number) {
  const ready = prepared(this, stage);
  const finish = finishResult(this);
  assert.equal(finish.status, 1, finish.stdout);
  assert.ok(isDeepStrictEqual(ready.published(), this.publishedBefore),
    `The refused Stage ${stage} finish changed the published state of the run.`);
});
