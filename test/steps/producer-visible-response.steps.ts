import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { folderState } from "../../packages/producer/test/support/producer-record.ts";
import { capturedStageOneRun, reviewPacket, stageOne, type StageOneRun, writeReview }
  from "../../packages/producer/test/support/stage-1-run.ts";

// The scenarios finish Stage 1, the first stage that saves an LLM call record.
// The run is captured from a small target with the rsync test double.
interface SavedRun { artifacts: Record<string, { path: string; sha256: string }> }

interface VisibleResponseWorld extends World {
  responseScratch?: string;
  responseRun?: StageOneRun;
  responseReview?: string;
  runBeforeFinish?: [string, string][];
  finishCommand?: CommandResult;
}

const reasoningBlock = "<thinking>\nThe settings name a base file that the snapshot does not hold, so I add a gap.\n</thinking>\n\n";
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

// Writes a complete Stage 1 review packet whose call record says that hidden
// reasoning was not saved. `change` edits the saved response text.
function preparedReview(world: VisibleResponseWorld, change: (response: string) => string = (response) => response): void {
  world.responseScratch = makeScratch();
  const { run, excerpt } = capturedStageOneRun(world.responseScratch);
  const packet = reviewPacket(excerpt);
  packet.call.hiddenReasoning = "not-saved";
  const review = writeReview(run, packet);
  const response = join(review, "llm-response.md");
  writeFileSync(response, change(readFileSync(response, "utf8")));
  world.responseRun = run;
  world.responseReview = review;
}

function currentRun(world: VisibleResponseWorld): StageOneRun {
  assert.ok(world.responseRun, "Prepare a Stage 1 review packet first.");
  return world.responseRun;
}

function lastFinish(world: VisibleResponseWorld): CommandResult {
  assert.ok(world.finishCommand, "Finish the stage first.");
  return world.finishCommand;
}

After({ tags: "@producer" }, function (this: VisibleResponseWorld) {
  if (this.responseScratch) removeScratch(this.responseScratch);
});

Given("an LLM call record whose saved response contains a reasoning block", function (this: VisibleResponseWorld) {
  preparedReview(this, (response) => reasoningBlock + response);
});

Given("an LLM call record whose saved response has only the visible answer", function (this: VisibleResponseWorld) {
  preparedReview(this);
});

When("the operator finishes the stage", function (this: VisibleResponseWorld) {
  const run = currentRun(this);
  assert.ok(this.responseReview, "Prepare a Stage 1 review packet first.");
  this.runBeforeFinish = folderState(run.work);
  this.finishCommand = stageOne(run, "finish", this.responseReview);
});

Then("the stage is not published", function (this: VisibleResponseWorld) {
  const finish = lastFinish(this);
  assert.equal(finish.status, 1, finish.stdout);
  assert.equal(existsSync(join(currentRun(this).work, "run.yaml")), false);
  assert.deepEqual(folderState(currentRun(this).work), this.runBeforeFinish);
});

Then("the operator is told to save only the visible response", function (this: VisibleResponseWorld) {
  assert.equal(lastFinish(this).stderr, "llm-response.md contains a hidden reasoning block. Save only the visible response.\n");
});

Then("the stage is published", function (this: VisibleResponseWorld) {
  const finish = lastFinish(this);
  assert.equal(finish.status, 0, finish.stderr);
  assert.equal(finish.stdout, "Stage 1 saved. Run verify, then continue to Stage 2.\n");
  const verify = stageOne(currentRun(this), "verify");
  assert.equal(verify.status, 0, verify.stderr);
});

Then("the call record says that hidden reasoning was not saved", function (this: VisibleResponseWorld) {
  const work = currentRun(this).work;
  const run = parse(readFileSync(join(work, "run.yaml"), "utf8")) as SavedRun;
  const saved = Object.values(run.artifacts).find((artifact) => artifact.path === "evidence/llm-call.yaml");
  assert.ok(saved, "The run registers the saved call record.");
  const bytes = readFileSync(join(work, saved.path));
  assert.equal(saved.sha256, sha256(bytes));
  assert.equal((parse(bytes.toString("utf8")) as Record<string, unknown>).hiddenReasoning, "not-saved");
});
