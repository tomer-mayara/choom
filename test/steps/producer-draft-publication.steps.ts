import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { draftFaultSettings } from "../../packages/producer/test/support/doubles/draft-faults.ts";
import { reviewStageThree, stageThree, stageThreeAttempt, stageTwoRun }
  from "../../packages/producer/test/support/stage-3-attempt.ts";

// The publication of the working drafts of a stage, through the command line. The
// attempt of the run saved its review packet, so the finish action of the stage
// publishes it. The fault double (support/doubles/draft-faults.ts) can stop the
// publication after a chosen number of renames.
interface ReadyRun {
  stage: number;
  work: string;
  // Runs the finish action of the stage with the added settings.
  finish(settings: Record<string, string>): CommandResult;
}
interface DraftPublicationWorld extends World {
  draftScratch?: string;
  draftRun?: ReadyRun;
  draftFaults?: Record<string, string>;
  draftsBefore?: string[];
  draftFinish?: CommandResult;
}

// The run manifest and the discovery draft, which a publication replaces.
const publishedDrafts = ["run.yaml", "discovery.yaml"];
const advice = "Keep this attempt unchanged; use a new attempt ID after you resolve the cause.";

// A run that finished Stage 2, with a Stage 3 attempt that saved its review packet.
function stageThreeRun(scratch: string): ReadyRun {
  const folder = join(scratch, "stage-3");
  mkdirSync(folder);
  const attempt = stageThreeAttempt(stageTwoRun(scratch), folder);
  for (const [action, result] of Object.entries(reviewStageThree(attempt)))
    assert.equal(result.status, 0, `Stage 3 ${action}: ${result.stderr}`);
  return { stage: 3, work: attempt.work,
    finish: (settings) => stageThree(attempt, ["stage-3-finish"], settings) };
}

const readyRuns = new Map<number, (scratch: string) => ReadyRun>([[3, stageThreeRun]]);

function readyRun(world: DraftPublicationWorld, stage: number): ReadyRun {
  assert.equal(world.draftRun?.stage, stage, `Prepare a run that is ready for Stage ${stage} to publish first.`);
  return world.draftRun as ReadyRun;
}

function drafts(run: ReadyRun): string[] {
  return publishedDrafts.map((name) => readFileSync(join(run.work, name), "utf8"));
}

After({ tags: "@producer" }, function (this: DraftPublicationWorld) {
  if (this.draftScratch) removeScratch(this.draftScratch);
});

Given("a run that is ready for Stage {int} to publish", function (this: DraftPublicationWorld, stage: number) {
  const prepare = readyRuns.get(stage);
  assert.ok(prepare, `No ready run for Stage ${stage}.`);
  this.draftScratch = makeScratch();
  this.draftRun = prepare(this.draftScratch);
});

Given("a fault that stops the publication after its first rename", function (this: DraftPublicationWorld) {
  this.draftFaults = draftFaultSettings(["stop-after-rename-1"]);
});

When("the operator finishes Stage {int}", function (this: DraftPublicationWorld, stage: number) {
  const run = readyRun(this, stage);
  this.draftsBefore = drafts(run);
  this.draftFinish = run.finish(this.draftFaults ?? {});
});

Then("the Stage {int} result is not published", function (this: DraftPublicationWorld, stage: number) {
  readyRun(this, stage);
  const finish = this.draftFinish;
  assert.ok(finish, `Finish Stage ${stage} first.`);
  assert.deepEqual({ status: finish.status, stdout: finish.stdout }, { status: 1, stdout: "" });
  assert.ok(finish.stderr.includes(advice), finish.stderr);
});

Then("the run manifest and the discovery draft are the same as before", function (this: DraftPublicationWorld) {
  const run = this.draftRun;
  assert.ok(run && this.draftsBefore, "Finish the stage first.");
  assert.deepEqual(drafts(run), this.draftsBefore);
});
