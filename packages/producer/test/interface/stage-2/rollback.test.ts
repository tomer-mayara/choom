import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { makeScratch, removeScratch } from "../../support/commands.ts";
import { type DraftFault, draftFaultSettings, injectedRenameFailure } from "../../support/doubles/draft-faults.ts";
import { folderState } from "../../support/producer-record.ts";
import { analysisPacket, entryAnalysis, runAttempt, stageOneRun, stageTwo, stageTwoAttempt, type StageTwoAttempt }
  from "../../support/stage-2-attempt.ts";

// Stage 2 finish replaces discovery.yaml and then run.yaml, the publication marker,
// as one update. The fault double (support/doubles/draft-faults.ts) makes one rename
// of the finish process fail, or changes a draft as another writer would. A failed
// finish gives each replaced draft its bytes from before, removes its temporary files
// and names each file that it had to keep. Each case restores the same prepared run
// folder, whose attempt saved its analysis packet.
const id = "s2-check";
const advice = "Keep this attempt unchanged; use a new attempt ID after you resolve the cause.";
let scratch = "";
let attempt: StageTwoAttempt;

beforeAll(() => {
  scratch = makeScratch();
  const work = join(scratch, "run");
  stageOneRun(work, [{ path: "app.ts", text: "export const value = 1;\n" }]);
  attempt = stageTwoAttempt(work, id);
  for (const [action, result] of Object.entries(runAttempt(attempt, scratch)))
    expect({ action, status: result.status }).toEqual({ action, status: 0 });
  expect(stageTwo(attempt, "save-review", [analysisPacket(join(scratch, "review"), id, entryAnalysis(attempt))]).status).toBe(0);
  cpSync(work, join(scratch, "prepared"), { recursive: true });
});

afterAll(() => removeScratch(scratch));

function preparedAttempt(): StageTwoAttempt {
  rmSync(attempt.work, { recursive: true, force: true });
  cpSync(join(scratch, "prepared"), attempt.work, { recursive: true });
  return attempt;
}

// The files of the run folder outside the attempt, which keeps the saved recipe of the finish.
const runFiles = (prepared: StageTwoAttempt): [string, string][] =>
  folderState(prepared.work).filter(([path]) => !path.startsWith(`evidence/${id}/`));

describe("a failed Stage 2 finish", () => {
  test.each<[string, DraftFault]>([
    ["the rename of the new discovery", "discovery-rename"],
    ["the rename of the new run manifest, after discovery.yaml was replaced", "run-rename"],
  ])("gives the drafts their bytes from before and leaves no temporary file when %s fails", (_name, fault) => {
    const prepared = preparedAttempt();
    const before = runFiles(prepared);
    expect(stageTwo(prepared, "finish", [], draftFaultSettings([fault])))
      .toEqual({ status: 1, stdout: "", stderr: `${injectedRenameFailure} ${advice}\n` });
    expect(runFiles(prepared)).toEqual(before);
  });

  // The check before the rename of the run manifest finds the change and stops the update.
  test("keeps a draft that another writer changed after finish replaced it, and names it", () => {
    const prepared = preparedAttempt();
    const run = readFileSync(join(prepared.work, "run.yaml"));
    expect(stageTwo(prepared, "finish", [], draftFaultSettings(["discovery-change"]))).toEqual({ status: 1,
      stdout: "", stderr: `Published output changed: discovery.yaml ${advice} Inspect retained paths: discovery.yaml\n` });
    expect(readFileSync(join(prepared.work, "run.yaml"))).toEqual(run);
    expect(readFileSync(join(prepared.work, "discovery.yaml"), "utf8")).toEndWith("# changed\n");
    expect(readdirSync(prepared.work).filter((name) => name.startsWith("."))).toEqual([]);
  });
});
