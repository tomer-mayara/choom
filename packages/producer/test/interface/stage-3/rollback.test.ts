import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeScratch, removeScratch } from "../../support/commands.ts";
import { type DraftFault, draftFaultSettings, injectedRenameFailure } from "../../support/doubles/draft-faults.ts";
import { folderState } from "../../support/producer-record.ts";
import { finishStageThree, stageThreeAttempt, type StageThreeAttempt, stageTwoRun } from "../../support/stage-3-attempt.ts";

// The Stage 3 finalizer replaces discovery.yaml and then run.yaml, the publication
// marker, as one update. The fault double (support/doubles/draft-faults.ts) makes one
// rename of the finalizer process fail, or changes a draft as another writer would. A
// failed finalizer gives each replaced draft its bytes from before, removes its
// temporary files and names each file that it had to keep. Each case copies one run
// that finished Stage 2 through its commands.
const advice = "Keep this attempt unchanged; use a new attempt ID after you resolve the cause.";
let scratch = "";
let stageTwoWork = "";

beforeAll(() => {
  scratch = makeScratch();
  stageTwoWork = stageTwoRun(scratch);
});

afterAll(() => removeScratch(scratch));

function newAttempt(name: string): StageThreeAttempt {
  const folder = join(scratch, name);
  mkdirSync(folder);
  return stageThreeAttempt(stageTwoWork, folder);
}

// The files of the run folder outside the attempt, which keeps the evidence of the attempt.
const runFiles = (attempt: StageThreeAttempt): [string, string][] => folderState(attempt.work)
  .filter(([path]) => path !== `evidence/${attempt.id}` && !path.startsWith(`evidence/${attempt.id}/`));

describe("a failed Stage 3 finalizer", () => {
  test.each<[string, DraftFault]>([
    ["the rename of the new discovery", "discovery-rename"],
    ["the rename of the new run manifest, after discovery.yaml was replaced", "run-rename"],
  ])("gives the drafts their bytes from before and leaves no temporary file when %s fails", (_name, fault) => {
    const attempt = newAttempt(fault);
    const before = runFiles(attempt);
    const finish = finishStageThree(attempt, () => {}, [], [], draftFaultSettings([fault])).finish;
    expect({ status: finish?.status, stdout: finish?.stdout, stderr: finish?.stderr })
      .toEqual({ status: 1, stdout: "", stderr: `${injectedRenameFailure} ${advice}\n` });
    expect(runFiles(attempt)).toEqual(before);
  }, 60_000);

  // The check before the rename of the run manifest finds the change and stops the update.
  test("keeps a draft that another writer changed after the finalizer replaced it, and names it", () => {
    const attempt = newAttempt("discovery-change");
    const run = readFileSync(join(attempt.work, "run.yaml"));
    const finish = finishStageThree(attempt, () => {}, [], [], draftFaultSettings(["discovery-change"])).finish;
    expect({ status: finish?.status, stdout: finish?.stdout, stderr: finish?.stderr }).toEqual({ status: 1, stdout: "",
      stderr: `Published output changed: discovery.yaml ${advice} Inspect retained paths: discovery.yaml\n` });
    expect(readFileSync(join(attempt.work, "run.yaml"))).toEqual(run);
    expect(readFileSync(join(attempt.work, "discovery.yaml"), "utf8")).toEndWith("# changed\n");
    expect(readdirSync(attempt.work).filter((name) => name.startsWith("."))).toEqual([]);
  }, 60_000);
});
