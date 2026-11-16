import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { commitAll } from "../../packages/producer/test/support/git-repository.ts";
import { newStageOneRun, noSettingsTarget, stageOne, type StageOneRun, writeFiles }
  from "../../packages/producer/test/support/stage-1-run.ts";

// The scenarios capture a small target through the Stage 1 command line. The
// capture uses the rsync test double, and Git runs on a temporary repository.
interface GitGap { kind?: unknown; reason?: unknown }
interface GitIdentityRecord { status?: unknown; commit?: unknown; localChanges?: { changed?: unknown }; gaps?: GitGap[] }

interface GitIdentityWorld extends World {
  gitScratch?: string;
  gitRun?: StageOneRun;
  gitCommit?: string;
  captureCommand?: CommandResult;
}

const changedFile = "src/app.ts";

function currentRun(world: GitIdentityWorld): StageOneRun {
  assert.ok(world.gitRun, "Prepare a target first.");
  return world.gitRun;
}

function successfulCapture(world: GitIdentityWorld): CommandResult {
  const capture = world.captureCommand;
  assert.ok(capture, "Capture a snapshot first.");
  assert.equal(capture.status, 0, capture.stderr);
  return capture;
}

// The Git identity record that the capture saved with the snapshot.
function savedRecord(world: GitIdentityWorld): GitIdentityRecord {
  successfulCapture(world);
  const path = join(currentRun(world).work, "evidence/git-identity.json");
  assert.ok(existsSync(path), "The capture saved no Git identity record.");
  return JSON.parse(readFileSync(path, "utf8")) as GitIdentityRecord;
}

After({ tags: "@producer" }, function (this: GitIdentityWorld) {
  if (this.gitScratch) removeScratch(this.gitScratch);
});

Given("a target repository with one commit and one file changed after it", function (this: GitIdentityWorld) {
  this.gitScratch = makeScratch();
  this.gitRun = newStageOneRun(this.gitScratch, noSettingsTarget);
  this.gitCommit = commitAll(this.gitRun.target);
  writeFiles(this.gitRun.target, { [changedFile]: "export const message = 'Changed after the commit';\n" });
});

Given("a target folder that is not a Git repository", function (this: GitIdentityWorld) {
  this.gitScratch = makeScratch();
  this.gitRun = newStageOneRun(this.gitScratch, noSettingsTarget);
});

When("the operator captures a snapshot", function (this: GitIdentityWorld) {
  const run = currentRun(this);
  const start = stageOne(run, "start");
  assert.equal(start.status, 0, start.stderr);
  this.captureCommand = stageOne(run, "capture");
});

Then("the snapshot record names the commit", function (this: GitIdentityWorld) {
  const record = savedRecord(this);
  assert.equal(record.status, "available");
  assert.equal(record.commit, this.gitCommit);
});

Then("it lists the changed file", function (this: GitIdentityWorld) {
  assert.deepEqual(savedRecord(this).localChanges?.changed, [changedFile]);
});

Then("the snapshot is captured", function (this: GitIdentityWorld) {
  successfulCapture(this);
  const inventory = JSON.parse(readFileSync(join(currentRun(this).work, "evidence/inventory.json"), "utf8")) as
    { files: { path: string }[] };
  assert.deepEqual(inventory.files.map(({ path }) => path), Object.keys(noSettingsTarget).sort());
});

Then("a gap says that Git evidence is not available", function (this: GitIdentityWorld) {
  const gap = (savedRecord(this).gaps ?? []).find(({ kind }) => kind === "git-unavailable");
  assert.ok(gap, "The Git identity record has no gap for the missing Git evidence.");
  assert.match(String(gap.reason), /^Git evidence is not available\b/);
});
