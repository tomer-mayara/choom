import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { faultSettings, injectedLockRemovalFailure, injectedRenameFailure, type StageSixFault }
  from "../../support/doubles/stage-6-faults.ts";
import { folderState } from "../../support/producer-record.ts";
import { fixtureRecords, jsonText, publishedResult, type StageSixFixture, stageSix, stageSixCommandRecord, stageSixFixture, startedFixture }
  from "../../support/stage-6-run.ts";

// A Stage 6 start or finish that fails after it wrote files, and what it keeps.
// The fault double (support/doubles/stage-6-faults.ts) makes one file operation of
// the helper process fail, or changes a file as another writer would. A failed
// publication restores the working drafts, removes the files and folders that it
// still owns, keeps a failure receipt, and names each path that it had to keep. A
// failed attempt cannot continue.
type Json = Record<string, unknown>;

const id = "s6-rollback";
const finishReceipts = ["operator-finish.started.json", "operator-finish.json"];
const attemptPath = (run: StageSixFixture, name: string): string => join(run.work, "evidence", id, name);
const savedJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8")) as Json;
const lockPath = (run: StageSixFixture): string => join(run.work, ".stage-6-publish.lock");
const isTime = (value: unknown): boolean => typeof value === "string" && Number.isFinite(Date.parse(value));

function finishWith(run: StageSixFixture, faults: StageSixFault[]): ReturnType<typeof stageSix> {
  return stageSix(run.work, id, ["finish"], faultSettings(faults));
}

// The receipt of the failed finish, after the check of its time.
function expectFailedFinishReceipt(run: StageSixFixture, reason: string, leftovers: string[]): void {
  const path = attemptPath(run, "operator-finish.failed.json");
  const { finishedAt } = savedJson(path);
  expect(isTime(finishedAt)).toBe(true);
  expect(readFileSync(path, "utf8")).toBe(jsonText({ formatVersion: 1, attemptId: id, action: "finish", status: "failed",
    command: stageSixCommandRecord(run.work, id, ["finish"]), finishedAt, reason, leftovers }));
}

function expectNoContinuation(run: StageSixFixture): void {
  for (const action of ["check", "finish", "verify"])
    expect(stageSix(run.work, id, [action])).toEqual({ status: 1, stdout: "", stderr: "Unexpected attempt file set.\n" });
}

describe("a failed Stage 6 finish", () => {
  test.each<[string, StageSixFault]>([
    ["the rename of the staged discovery", "discovery-rename"],
    ["the rename of the staged run manifest, after the working discovery was replaced", "run-rename"],
  ])("restores the drafts and removes the files and folders that it wrote when %s fails", async (_name, fault) => {
    const run = await startedFixture(id);
    try {
      const before = folderState(run.work);
      expect(finishWith(run, [fault])).toEqual({ status: 1, stdout: "",
        stderr: `Stage 6 publication stopped: ${injectedRenameFailure}.\n` });
      // Only the attempt gains files: the two finish receipts and the failure receipt.
      const failedFiles = [...finishReceipts, "operator-finish.failed.json"].map((name) => `evidence/${id}/${name}`);
      expect(folderState(run.work).filter(([path]) => !failedFiles.includes(path))).toEqual(before);
      expect(failedFiles.every((path) => existsSync(join(run.work, path)))).toBe(true);
      expectFailedFinishReceipt(run, injectedRenameFailure, []);
      expectNoContinuation(run);
    } finally { rmSync(run.root, { recursive: true, force: true }); }
  }, 60_000);

  test("keeps a fixed record that another writer changed, and names each path that it keeps", async () => {
    const run = await startedFixture(id);
    try {
      const baseline = join(run.work, fixtureRecords.baselinePath);
      const draft = readFileSync(join(run.work, "baseline.yaml"), "utf8");
      const drafts = ["run.yaml", "discovery.yaml"].map((name) => readFileSync(join(run.work, name)));
      const retained = [baseline, join(run.work, "baselines/fixture-baseline"), join(run.work, "baselines")];
      const reason = `Fixed record changed during publication: ${baseline}`;
      expect(finishWith(run, ["baseline-change"])).toEqual({ status: 1, stdout: "",
        stderr: `Stage 6 publication stopped: ${reason}. Check retained paths: ${retained.join(", ")}.\n` });
      expect(["run.yaml", "discovery.yaml"].map((name) => readFileSync(join(run.work, name)))).toEqual(drafts);
      expect(readFileSync(baseline, "utf8")).toBe(draft + "# changed\n");
      expect(readdirSync(join(run.work, "baselines"))).toEqual(["fixture-baseline"]);
      expect(existsSync(join(run.work, "runs"))).toBe(false);
      expect(readdirSync(run.work).filter((name) => name.startsWith(".stage-6-"))).toEqual([]);
      expectFailedFinishReceipt(run, reason, retained);
      expectNoContinuation(run);
    } finally { rmSync(run.root, { recursive: true, force: true }); }
  }, 60_000);

  test("adds a pending lock cleanup to the reason of the failure", async () => {
    const run = await startedFixture(id);
    try {
      expect(finishWith(run, ["run-rename", "lock-removal"])).toEqual({ status: 1, stdout: "",
        stderr: `Stage 6 publication stopped: ${injectedRenameFailure}. ` +
          `Publication lock cleanup pending at ${lockPath(run)}: ${injectedLockRemovalFailure}\n` });
      expect(existsSync(lockPath(run))).toBe(true);
      expectFailedFinishReceipt(run, injectedRenameFailure, []);
    } finally { rmSync(run.root, { recursive: true, force: true }); }
  }, 60_000);
});

describe("a Stage 6 publication with a lock that it could not remove", () => {
  test("reports the pending lock cleanup with its result, and verify refuses the run until the lock is gone", async () => {
    const run = await startedFixture(id);
    try {
      const finished = finishWith(run, ["lock-removal"]);
      expect(finished).toEqual({ status: 0, stderr: "", stdout: jsonText({ ...publishedResult(id), lockCleanup: "pending",
        warning: `Publication lock cleanup pending at ${lockPath(run)}: ${injectedLockRemovalFailure}` }) });
      expect(stageSix(run.work, id, ["verify"])).toEqual({ status: 1, stdout: "",
        stderr: `Publication lock remains. Check ${lockPath(run)}\n` });
      rmdirSync(lockPath(run));
      expect(stageSix(run.work, id, ["verify"]).status).toBe(0);
    } finally { rmSync(run.root, { recursive: true, force: true }); }
  }, 60_000);
});

describe("a failed Stage 6 start", () => {
  test("keeps its partial attempt with a failure receipt when a working draft changes during the start", async () => {
    const run = await stageSixFixture();
    try {
      const reason = "Working draft changed: run.yaml";
      expect(stageSix(run.work, id, ["start", run.review], faultSettings(["draft-change"])))
        .toEqual({ status: 1, stdout: "", stderr: reason + "\n" });
      const path = attemptPath(run, "operator-start.failed.json");
      const { startedAt, finishedAt } = savedJson(path);
      expect([isTime(startedAt), isTime(finishedAt)]).toEqual([true, true]);
      expect(readFileSync(path, "utf8")).toBe(jsonText({ formatVersion: 1, attemptId: id, action: "start", status: "failed",
        command: stageSixCommandRecord(run.work, id, ["start", run.review]), startedAt, finishedAt, reason }));
      // The start saved all its files, its receipt among them, before the last check of the drafts.
      expect(readdirSync(join(run.work, "evidence", id)).sort()).toEqual(["baseline.before.yaml", "baseline.candidate.yaml",
        "commands.md", "discovery.before.yaml", "discovery.candidate.yaml", "handoff.json", "llm", "operator-start.failed.json",
        "operator-start.json", "readiness.yaml", "review-scope.json", "run.before.yaml", "step-6-cookbook.md", "validation.json"]);
      expect(stageSix(run.work, id, ["check"])).toEqual({ status: 1, stdout: "", stderr: "Unexpected attempt file set.\n" });
    } finally { rmSync(run.root, { recursive: true, force: true }); }
  }, 60_000);
});
