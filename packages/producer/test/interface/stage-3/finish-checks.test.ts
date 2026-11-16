import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { makeScratch, removeScratch } from "../../support/commands.ts";
import { folderState } from "../../support/producer-record.ts";
import type { JsonRecord } from "../../support/stage-2-attempt.ts";
import { finishStageThree, stageThree, stageThreeAttempt, type StageThreeAttempt, type StageThreePacket, stageTwoRun }
  from "../../support/stage-3-attempt.ts";

// The Stage 3 finalizer checks the saved attempt and its LLM packet before it
// changes the drafts. Each case copies one run that finished Stage 2 through its
// commands, then runs Stage 3 start, collect, save-review and the finalizer.
interface FinishCase { name: string; change: (packet: StageThreePacket) => void; message: string }

const record = (value: unknown): JsonRecord => value as JsonRecord;
const firstPriority = (packet: StageThreePacket): JsonRecord =>
  record((packet.analysis.inspectionPriorities as unknown[])[0]);

const cases: FinishCase[] = [
  { name: "the call record has no model", change: (packet) => { delete packet.call.model; },
    message: "Missing LLM call metadata; use unknown for unexposed settings." },
  { name: "the response does not contain the entry analysis", change: (packet) => { packet.response = "No analysis.\n"; },
    message: "Keep the complete prompt and response, including the exact entry-analysis YAML." },
  { name: "the call record does not say that hidden reasoning was not saved",
    change: (packet) => { delete packet.call.hiddenReasoning; }, message: "Record hiddenReasoning: not-saved in llm/analysis-call.yaml." },
  { name: "the response holds a reasoning block",
    change: (packet) => { packet.response = "<reasoning>\nKnip was skipped.\n</reasoning>\n\n" + stringify(packet.analysis); },
    message: "llm/analysis-response.md contains a hidden reasoning block. Save only the visible response." },
  { name: "the review scope names another run", change: (packet) => { packet.scope.runRef = "run-other"; },
    message: "Missing or invalid LLM review scope." },
  { name: "the analysis has an extra field", change: (packet) => { packet.analysis.extra = true; },
    message: "Invalid Stage 3 entry analysis fields." },
  { name: "the Knip assessment asks for a new Knip run",
    change: (packet) => { record(packet.analysis.knipAssessment).action = "rerun-required"; },
    message: "Knip rerun required. Save a new controlled Knip attempt and prepare a new Stage 3 attempt." },
  { name: "an earlier question is removed", change: (packet) => { packet.analysis.questions = []; },
    message: "Removed or changed prior questions: s1-question-001" },
  { name: "the analysis has no inspection priorities", change: (packet) => { packet.analysis.inspectionPriorities = []; },
    message: "Missing inspection priorities." },
  { name: "an inspection priority cites unknown evidence",
    change: (packet) => { firstPriority(packet).evidenceRefs = ["missing"]; }, message: "Unknown evidence: missing" },
];

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

function folderText(attempt: StageThreeAttempt, name: string): string {
  return readFileSync(join(attempt.work, name), "utf8");
}

function draftState(attempt: StageThreeAttempt): [string, string][] {
  return folderState(attempt.work).filter(([path]) => ["run.yaml", "discovery.yaml", "baseline.yaml"].includes(path));
}

describe("Stage 3 finish checks", () => {
  test.each(cases.map((item, index) => ({ ...item, index })))(
    "refuses a packet in which $name and leaves the drafts unchanged", ({ change, message, index }) => {
      const attempt = newAttempt(`case-${index}`);
      const before = draftState(attempt);
      const results = finishStageThree(attempt, change);
      for (const action of ["start", "collect", "save-review"])
        expect({ action, status: results[action]?.status }).toEqual({ action, status: 0 });
      expect({ status: results.finish?.status, stdout: results.finish?.stdout, stderr: results.finish?.stderr })
        .toEqual({ status: 1, stdout: "", stderr: message + "\n" });
      expect(draftState(attempt)).toEqual(before);
    }, 60_000);

  test("publishes a complete packet, verifies it, and refuses to publish it again", () => {
    const attempt = newAttempt("published");
    const results = finishStageThree(attempt);
    expect({ status: results.finish?.status, stdout: results.finish?.stdout, stderr: results.finish?.stderr }).toEqual({
      status: 0, stderr: "", stdout: "Stage 3 drafts updated. Structure and evidence checks passed. " +
        "Review the analysis for meaning.\nKeep all registered attempt files unchanged.\n" });
    const run = parse(folderText(attempt, "run.yaml")) as { progress: Record<string, string> };
    expect(run.progress).toMatchObject({ entryAnalysis: "complete", inspectionPriorities: "complete", baselineRecovery: "pending" });
    const discovery = parse(folderText(attempt, "discovery.yaml")) as JsonRecord;
    expect(discovery.entryAnalysisRef).toBe(`${attempt.id}-entry-analysis`);
    const verify = stageThree(attempt, ["stage-3-finish", "verify"]);
    expect({ status: verify.status, stderr: verify.stderr }).toEqual({ status: 0, stderr: "" });
    expect(JSON.parse(verify.stdout)).toMatchObject({ action: "verify", status: "verified", attemptId: attempt.id,
      entryAnalysisRef: `${attempt.id}-entry-analysis`, checked: { currentReviewedRanges: 1 }, writes: [] });
    const again = stageThree(attempt, ["stage-3-finish"]);
    expect({ status: again.status, stderr: again.stderr }).toEqual({ status: 1, stderr: "run.yaml changed after checkpointing.\n" });
  }, 60_000);

  // run.yaml registers the files of a published attempt as evidence. Each later action
  // refuses the attempt before it saves a receipt or adds to the command log.
  test("refuses each action on the published attempt, changes no file of the run, and still verifies", () => {
    const attempt = newAttempt("published-actions");
    expect(finishStageThree(attempt).finish?.status).toBe(0);
    const before = folderState(attempt.work);
    for (const args of [["excerpt", "app.ts", "1", "1"], ["text-search", "value"], ["exports", "app.ts"], ["collect"],
      ["save-review", attempt.review]]) {
      const result = stageThree(attempt, ["stage-3", ...args]);
      expect({ args, status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({ args, status: 1,
        stdout: "", stderr: `Attempt ${attempt.id} is published: run.yaml registers its files, so they must stay unchanged. ` +
          "Check it with stage-3-finish verify.\n" });
    }
    expect(folderState(attempt.work)).toEqual(before);
    expect(stageThree(attempt, ["stage-3-finish", "verify"]).status).toBe(0);
  }, 60_000);

  test("publishes a packet that cites a text-search record, and registers the record and the raw ripgrep output", () => {
    const attempt = newAttempt("text-search");
    const cited = `${attempt.id}-file@text-search-001.json#/matches/0`;
    const results = finishStageThree(attempt, (packet) => {
      firstPriority(packet).evidenceRefs = [cited];
    }, [["value"]]);
    expect({ search: results["text-search-1"]?.status, finish: results.finish?.status, stderr: results.finish?.stderr })
      .toEqual({ search: 0, finish: 0, stderr: "" });
    const run = parse(folderText(attempt, "run.yaml")) as { artifacts: Record<string, { path: string }> };
    for (const name of ["text-search-001.json", "text-search-001.stdout.jsonl", "text-search-001.stderr.txt"])
      expect(run.artifacts[`${attempt.id}-file@${name}`]?.path).toBe(`evidence/${attempt.id}/${name}`);
    const verify = stageThree(attempt, ["stage-3-finish", "verify"]);
    expect({ status: verify.status, stderr: verify.stderr }).toEqual({ status: 0, stderr: "" });
  }, 60_000);

  test("publishes a packet that cites an exports record, and registers the record", () => {
    const attempt = newAttempt("exports");
    const results = finishStageThree(attempt, (packet) => {
      firstPriority(packet).evidenceRefs = [`${attempt.id}-file@exports-001.json#/exports/0`];
    }, [], ["app.ts"]);
    expect({ exports: results["exports-1"]?.status, finish: results.finish?.status, stderr: results.finish?.stderr })
      .toEqual({ exports: 0, finish: 0, stderr: "" });
    const run = parse(folderText(attempt, "run.yaml")) as { artifacts: Record<string, { path: string }> };
    expect(run.artifacts[`${attempt.id}-file@exports-001.json`]?.path).toBe(`evidence/${attempt.id}/exports-001.json`);
    const verify = stageThree(attempt, ["stage-3-finish", "verify"]);
    expect({ status: verify.status, stderr: verify.stderr }).toEqual({ status: 0, stderr: "" });
  }, 60_000);

  test("refuses an exports record that changed after the request, and leaves the drafts unchanged", () => {
    const attempt = newAttempt("changed-exports");
    const before = draftState(attempt);
    const results = finishStageThree(attempt, () => {
      appendFileSync(join(attempt.folder, "exports-001.json"), "\n");
    }, [], ["app.ts"]);
    expect({ exports: results["exports-1"]?.status, status: results.finish?.status, stderr: results.finish?.stderr })
      .toEqual({ exports: 0, status: 1, stderr: "The exports-001 receipt is incomplete, failed, or changed. Use a new attempt.\n" });
    expect(draftState(attempt)).toEqual(before);
  }, 60_000);

  test("refuses a text-search record that changed after the search, and leaves the drafts unchanged", () => {
    const attempt = newAttempt("changed-search");
    const before = draftState(attempt);
    const results = finishStageThree(attempt, () => {
      appendFileSync(join(attempt.folder, "text-search-001.json"), "\n");
    }, [["value"]]);
    expect({ search: results["text-search-1"]?.status, status: results.finish?.status, stderr: results.finish?.stderr })
      .toEqual({ search: 0, status: 1, stderr: "The text-search-001 receipt is incomplete, failed, or changed. Use a new attempt.\n" });
    expect(draftState(attempt)).toEqual(before);
  }, 60_000);
});
