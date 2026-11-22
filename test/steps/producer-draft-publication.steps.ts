import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then } from "@cucumber/cucumber";
import { stageFourPublication, type StageFourPublication }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { draftFaultSettings } from "../../packages/producer/test/support/doubles/draft-faults.ts";
import { analysisPacket, entryAnalysis, runAttempt, stageOneRun, stageTwo, stageTwoAttempt }
  from "../../packages/producer/test/support/stage-2-attempt.ts";
import { reviewStageThree, stageThree, stageThreeAttempt, stageTwoRun }
  from "../../packages/producer/test/support/stage-3-attempt.ts";
import { finishResult, readyToFinish, runFilesOutsideAttempt, type StageFinishWorld } from "./producer-stage-finish.steps.ts";

// The publication of the working drafts of a stage, through the command line. The
// attempt of the run saved its review packet, so the finish action of the stage
// publishes it. The fault double (support/doubles/draft-faults.ts) can stop the
// publication after a chosen number of renames. producer-stage-finish.steps.ts runs
// the finish action of Stage 2 or 3. A Stage 4 draft uses the Stage 4
// publication fixture; producer-recovery.steps.ts publishes it, checks that nothing
// changed, and removes the run folder after the scenario.
interface ReadyRun {
  stage: number;
  work: string;
  attemptId: string;
  // Runs the finish action of the stage with the added settings.
  finish(settings: Record<string, string>): CommandResult;
}
interface DraftPublicationWorld extends StageFinishWorld {
  draftScratch?: string;
  draftRun?: ReadyRun;
  draftFaults?: Record<string, string>;
  draftsBefore?: string[];
  stageFourRun?: StageFourPublication;
  publishCommand?: CommandResult;
}

// The run manifest and the discovery draft, which a publication replaces.
const publishedDrafts = ["run.yaml", "discovery.yaml"];
const advice = "Keep this attempt unchanged; use a new attempt ID after you resolve the cause.";
// A file that the operator saved in the attempt folder. No phase wrote it.
const strayFile = "notes.md";

// A run after Stage 1, with a Stage 2 attempt that saved its review packet. The
// snapshot holds no package manifest, so Knip is skipped, and the entry analysis
// copies the required gaps that the run action saved for the Knip records.
function readyForStageTwo(scratch: string): ReadyRun {
  const work = join(scratch, "run");
  stageOneRun(work, [{ path: "app.ts", text: "export const value = 1;\n" }]);
  const attempt = stageTwoAttempt(work, "s2-check");
  const completed = (results: Record<string, CommandResult>): void => {
    for (const [action, result] of Object.entries(results)) assert.equal(result.status, 0, `Stage 2 ${action}: ${result.stderr}`);
  };
  completed(runAttempt(attempt, scratch));
  const review = analysisPacket(join(scratch, "review"), attempt.id, entryAnalysis(attempt));
  completed({ "save-review": stageTwo(attempt, "save-review", [review]) });
  return { stage: 2, work, attemptId: attempt.id, finish: (settings) => stageTwo(attempt, "finish", [], settings) };
}

// A run that finished Stage 2, with a Stage 3 attempt that saved its review packet.
function readyForStageThree(scratch: string): ReadyRun {
  const folder = join(scratch, "stage-3");
  mkdirSync(folder);
  const attempt = stageThreeAttempt(stageTwoRun(scratch), folder);
  for (const [action, result] of Object.entries(reviewStageThree(attempt)))
    assert.equal(result.status, 0, `Stage 3 ${action}: ${result.stderr}`);
  return { stage: 3, work: attempt.work, attemptId: attempt.id,
    finish: (settings) => stageThree(attempt, ["stage-3-finish"], settings) };
}

const readyRuns = new Map<number, (scratch: string) => ReadyRun>([[2, readyForStageTwo], [3, readyForStageThree]]);

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
  const run = prepare(this.draftScratch);
  this.draftRun = run;
  this.draftsBefore = drafts(run);
  // A later Given can add a fault, so the finish action reads the faults when it runs.
  readyToFinish(this, { stage, finish: () => run.finish(this.draftFaults ?? {}),
    published: () => runFilesOutsideAttempt(run.work, run.attemptId) });
});

Given("a fault that stops the publication after its first rename", function (this: DraftPublicationWorld) {
  this.draftFaults = draftFaultSettings(["stop-after-rename-1"]);
});

// The failed update restored the drafts, and tells the operator what to do next.
Then("the run manifest and the discovery draft are the same as before", function (this: DraftPublicationWorld) {
  const run = this.draftRun;
  assert.ok(run && this.draftsBefore, "Prepare the run first.");
  const finish = finishResult(this);
  assert.equal(finish.stdout, "");
  assert.ok(finish.stderr.includes(advice), finish.stderr);
  assert.deepEqual(drafts(run), this.draftsBefore);
});

Given("a Stage 4 attempt folder with a file that no phase wrote", function (this: DraftPublicationWorld) {
  const run = stageFourPublication();
  this.stageFourRun = run;
  writeFileSync(join(run.attempt, strayFile), "# Notes\n");
});

Then("the operator is told which attempt file no phase wrote", function (this: DraftPublicationWorld) {
  const message = this.publishCommand?.stderr ?? "";
  assert.ok(message.includes(`Unexpected attempt file that no producer action saved: ${strayFile}.`), message);
});
