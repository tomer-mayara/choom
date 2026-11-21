import assert from "node:assert/strict";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { folderState } from "../../packages/producer/test/support/producer-record.ts";
import { analysisPacket, entryAnalysis, entryPlan, type JsonRecord, planPacket, requiredGaps, savedJson, stageOneRun,
  stageTwo, stageTwoAttempt, type StageTwoAttempt } from "../../packages/producer/test/support/stage-2-attempt.ts";

// The required gaps of the tool results, through the producer command line. The
// Stage 2 snapshot holds no package manifest, so preflight marks the Knip profile
// unsupported and both Knip modes are skipped. No Docker engine is needed.
interface ToolGapsWorld extends World {
  toolGapsScratch?: string;
  toolGapsAttempt?: StageTwoAttempt;
  // The ID of the required gap that the review leaves out.
  leftOutGap?: string;
  // The result of the publishing action, and the run folder outside the attempt before it.
  publication?: CommandResult;
  runFilesBefore?: [string, string][];
}

const app = { path: "app.ts", text: "export const value = 1;\n" };
const noManifest = "Workspace lacks a captured manifest: package.json";

After({ tags: "@producer" }, function (this: ToolGapsWorld) {
  if (this.toolGapsScratch) removeScratch(this.toolGapsScratch);
});

function currentAttempt(world: ToolGapsWorld): StageTwoAttempt {
  assert.ok(world.toolGapsAttempt, "Prepare a Stage 2 attempt first.");
  return world.toolGapsAttempt;
}

function succeeded(action: string, result: CommandResult): void {
  assert.equal(result.status, 0, `${action}: ${result.stderr}`);
}

// Saves a Stage 1 run whose snapshot holds only app.ts, and runs start, plan, prepare
// and toolchain of a new Stage 2 attempt.
function preparedAttempt(world: ToolGapsWorld): StageTwoAttempt {
  const scratch = makeScratch();
  world.toolGapsScratch = scratch;
  const work = join(scratch, "run");
  stageOneRun(work, [app]);
  const attempt = stageTwoAttempt(work, "s2-gaps");
  succeeded("start", stageTwo(attempt, "start"));
  succeeded("plan", stageTwo(attempt, "plan", [planPacket(join(scratch, "plan"), attempt.id, entryPlan(attempt.id))]));
  for (const action of ["prepare", "toolchain"]) succeeded(action, stageTwo(attempt, action));
  world.toolGapsAttempt = attempt;
  return attempt;
}

// The Knip records of the attempt that a required gap can cite, by evidence reference:
// the preflight that the Knip receipts name, and each run of the receipts.
function knipRecords(attempt: StageTwoAttempt): Map<string, JsonRecord> {
  const receipts = savedJson(attempt, "knip-runs.json");
  const runs = (receipts.runs as JsonRecord[]).map((run, index): [string, JsonRecord] =>
    [`${attempt.id}-knip-runs#/runs/${index}`, run]);
  return new Map([[receipts.preflightRef as string, savedJson(attempt, "preflight.json")], ...runs]);
}

// The evidence references of the skipped Knip runs of the attempt.
function skippedRuns(attempt: StageTwoAttempt): string[] {
  return [...knipRecords(attempt)].flatMap(([ref, record]) => ref.includes("#/runs/") && record.status === "skipped" ? [ref] : []);
}

// The files of the run folder outside the attempt, which keeps the records of each action.
function runFiles(attempt: StageTwoAttempt): [string, string][] {
  return folderState(attempt.work).filter(([path]) => !path.startsWith(`evidence/${attempt.id}/`));
}

Given("a Stage 2 attempt in which Knip is skipped because the snapshot has no package manifest", function (this: ToolGapsWorld) {
  const preflight = savedJson(preparedAttempt(this), "preflight.json");
  assert.deepEqual({ status: preflight.status, reasons: preflight.reasons }, { status: "unsupported", reasons: [noManifest] });
});

When("the operator runs Knip for the attempt", function (this: ToolGapsWorld) {
  succeeded("run", stageTwo(currentAttempt(this), "run"));
});

Then("the attempt lists one required gap for each skipped Knip run", function (this: ToolGapsWorld) {
  const attempt = currentAttempt(this);
  const skipped = skippedRuns(attempt);
  assert.equal(skipped.length, 2, "Both Knip modes must be skipped.");
  const gaps = requiredGaps(attempt);
  for (const ref of skipped)
    assert.equal(gaps.filter((gap) => isDeepStrictEqual(gap.evidenceRefs, [ref])).length, 1, `One required gap must cite ${ref}.`);
});

Then("each required gap cites its Knip run record and gives the reason of the skip", function (this: ToolGapsWorld) {
  const attempt = currentAttempt(this);
  const records = knipRecords(attempt);
  for (const gap of requiredGaps(attempt)) {
    const [ref, ...others] = gap.evidenceRefs as string[];
    const record = records.get(ref ?? "");
    assert.ok(record && others.length === 0, `${String(gap.id)} must cite one Knip record of the attempt: ${String(gap.evidenceRefs)}`);
    for (const reason of record.reasons as string[])
      assert.ok((gap.reason as string).includes(reason), `${String(gap.id)} does not give the reason "${reason}" of ${ref}.`);
  }
});

Given("a Stage 2 attempt with a required gap for a skipped Knip run", function (this: ToolGapsWorld) {
  const attempt = preparedAttempt(this);
  succeeded("run", stageTwo(attempt, "run"));
  const [skipped] = skippedRuns(attempt);
  const gap = requiredGaps(attempt).find((item) => isDeepStrictEqual(item.evidenceRefs, [skipped]));
  assert.ok(gap, `No required gap cites the skipped Knip run ${String(skipped)}.`);
  this.leftOutGap = gap.id as string;
});

// The review copies every other required gap.
Given("a Stage 2 review that leaves out that gap", function (this: ToolGapsWorld) {
  const attempt = currentAttempt(this);
  const gaps = requiredGaps(attempt).filter((gap) => gap.id !== this.leftOutGap);
  const review = analysisPacket(join(this.toolGapsScratch ?? "", "review"), attempt.id, entryAnalysis(attempt.id, { gaps }));
  succeeded("save-review", stageTwo(attempt, "save-review", [review]));
});

When("the operator finishes Stage 2", function (this: ToolGapsWorld) {
  const attempt = currentAttempt(this);
  this.runFilesBefore = runFiles(attempt);
  this.publication = stageTwo(attempt, "finish");
});

Then("the Stage 2 result is not published", function (this: ToolGapsWorld) {
  const attempt = currentAttempt(this);
  assert.ok(this.publication, "Finish Stage 2 first.");
  assert.equal(this.publication.status, 1, this.publication.stdout);
  assert.deepEqual(runFiles(attempt), this.runFilesBefore);
});

Then("the operator is told which required tool gap is missing", function (this: ToolGapsWorld) {
  assert.ok(this.publication && this.leftOutGap, "Leave out a required gap and publish first.");
  assert.ok(this.publication.stderr.includes(`leaves out the required gap ${this.leftOutGap}.`), this.publication.stderr);
});
