import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { RunCoverage } from "../../../src/generated/contracts.ts";
import { makeScratch, removeScratch } from "../../support/commands.ts";
import { folderState } from "../../support/producer-record.ts";
import type { JsonRecord } from "../../support/stage-2-attempt.ts";
import { finishStageThree, repeatedStageTwoRun, stageThree, stageThreeAttempt, type StageThreeAttempt, type StageThreePacket,
  stageTwoRun } from "../../support/stage-3-attempt.ts";
import { subjectForms } from "../../support/subject-forms.ts";

// The Stage 3 finalizer checks the saved attempt and its LLM packet before it
// changes the drafts. Each case copies one run that finished Stage 2 through its
// commands, then runs Stage 3 start, collect, save-review and the finalizer.
interface FinishCase { name: string; change: (packet: StageThreePacket) => void; message: string }

const record = (value: unknown): JsonRecord => value as JsonRecord;
const firstPriority = (packet: StageThreePacket): JsonRecord =>
  record((packet.analysis.inspectionPriorities as unknown[])[0]);
// The required gap of the symbol mentions, which collect saved in required-gaps.json.
const mentionsGapId = "s3-check-symbol-mentions-gap-001";
const mentionsGap = (packet: StageThreePacket): JsonRecord =>
  record((packet.analysis.gaps as JsonRecord[]).find((gap) => gap.id === mentionsGapId));
const copyEach = "Copy each gap of s3-check-file@required-gaps.json exactly.";
// GB-01b: adds a new gap of the attempt. The Stage 3 packet has the required gap of the skipped symbol mentions.
const addGap = (packet: StageThreePacket, subjectRefs: string[], evidenceRefs = ["s3-check-file@loading-search.json"]): void => {
  packet.analysis.gaps = [...packet.analysis.gaps as unknown[], { id: "s3-check-gap-002", kind: "missing-input", subjectRefs,
    reason: "The review names what it did not find.", evidenceRefs }];
};

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
  { name: "an inspection priority cites a JSON Pointer that is not a path",
    change: (packet) => { firstPriority(packet).evidenceRefs = ["s3-check-file@artifact-map.json#artifacts"]; },
    message: "Invalid JSON Pointer: s3-check-file@artifact-map.json#artifacts" },
  { name: "an inspection priority cites a missing key",
    change: (packet) => { firstPriority(packet).evidenceRefs = ["s3-check-file@artifact-map.json#/missing"]; },
    message: "Unresolved JSON Pointer: s3-check-file@artifact-map.json#/missing" },
  { name: "a new question has 101 subject references", change: (packet) => {
    packet.analysis.questions = [...packet.analysis.questions as unknown[], { id: "s3-check-question-001",
      subjectRefs: Array.from({ length: 101 }, (_, index) => `file-${index}.ts`), text: "Which files load plugins?",
      evidenceRefs: ["s3-check-file@loading-search.json"] }];
  }, message: "The questions and gaps do not match the discovery contract of the viewer. The discovery result exceeds a limit " +
    "at questions.1.subjectRefs: The limit is 100 subject references for each question or gap." },
  { name: "an inspection priority cites a JSON Pointer into a file that is not JSON or YAML",
    change: (packet) => { firstPriority(packet).evidenceRefs = ["s3-check-file@operator-start.stdout.txt#/0"]; },
    message: "Only a .json, .yaml or .yml file can take a JSON Pointer: s3-check-file@operator-start.stdout.txt#/0" },
  // P4 (DB5): Stage 2 skipped Knip, so the symbol mentions are skipped. The analysis copies their required gap exactly.
  { name: "the analysis leaves out the required gap of the skipped symbol mentions", change: (packet) => {
    packet.analysis.gaps = (packet.analysis.gaps as JsonRecord[]).filter((gap) => gap.id !== mentionsGapId);
  }, message: `The entry analysis leaves out the required gap ${mentionsGapId}. ${copyEach}` },
  { name: "the analysis changes the reason of the required gap of the symbol mentions", change: (packet) => {
    mentionsGap(packet).reason = "Knip did not run in Stage 2.";
  }, message: `The entry analysis changes the required gap ${mentionsGapId}. ${copyEach}` },
  { name: "a new gap has an ID that is reserved for the required gaps of the symbol mentions", change: (packet) => {
    packet.analysis.gaps = [...packet.analysis.gaps as unknown[], { id: "s3-check-symbol-mentions-gap-002", kind: "deferral",
      subjectRefs: ["app.ts"], reason: "Not reviewed.", evidenceRefs: ["s3-check-file@symbol-mentions.json"] }];
  }, message: "The ID s3-check-symbol-mentions-gap-002 is reserved for the required gaps of s3-check-file@required-gaps.json. " +
    "Use a different ID." },
  // GB-01b: each subject of a new question or gap, and of each inspection priority, names something that the run holds.
  { name: "a new gap names a file that is not in the snapshot", change: (packet) => addGap(packet, ["app.ts", "src/no-such-file.ts"]),
    message: `The subject src/no-such-file.ts of the gap s3-check-gap-002 names nothing. ${subjectForms}` },
  { name: "a new gap names a candidate of no entry analysis", change: (packet) => addGap(packet, ["s3-check-candidate-001"]),
    message: `The subject s3-check-candidate-001 of the gap s3-check-gap-002 names nothing. ${subjectForms}` },
  { name: "an inspection priority names nothing", change: (packet) => { firstPriority(packet).subjectRefs = ["app.ts", "nothing-here"]; },
    message: `The subject nothing-here of the inspection priority s3-check-priority-001 names nothing. ${subjectForms}` },
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

  // DB4: the run after Stage 2 has 1 file, 1 question and the 3 gaps of the skipped Knip
  // run, and the analysis adds the gap of the skipped symbol mentions. verify makes the
  // summary again, so it refuses a run.yaml with another count of the gaps. The unchanged
  // manifest, written again, is accepted.
  test("publishes the summary of the run, and verify makes the same summary", () => {
    const attempt = newAttempt("summary");
    expect(finishStageThree(attempt).finish?.status).toBe(0);
    const manifest = parse(folderText(attempt, "run.yaml")) as { coverage: RunCoverage };
    expect(manifest.coverage).toEqual({
      inventoried: "1 regular file in the selected capture scope.",
      inspected: "s3-check-entry-analysis#/reviewedFiles lists the source ranges that the selected review read. Earlier " +
        "reviews keep their own ranges. Tool reads are not LLM inspection.",
      recorded: "s3-check-entry-analysis records 1 question and 4 gaps, with history and linked notes." });
    expect(stageThree(attempt, ["stage-3-finish", "verify"])).toMatchObject({ status: 0, stderr: "" });
    writeFileSync(join(attempt.work, "run.yaml"), stringify(manifest));
    expect(stageThree(attempt, ["stage-3-finish", "verify"])).toMatchObject({ status: 0, stderr: "" });
    const recorded = manifest.coverage.recorded.replace("and 4 gaps", "and 3 gaps");
    expect(recorded).not.toBe(manifest.coverage.recorded);
    writeFileSync(join(attempt.work, "run.yaml"), stringify({ ...manifest, coverage: { ...manifest.coverage, recorded } }));
    const refused = stageThree(attempt, ["stage-3-finish", "verify"]);
    expect({ status: refused.status, stdout: refused.stdout, stderr: refused.stderr }).toEqual({ status: 1, stdout: "",
      stderr: "run.yaml differs from this attempt's published Stage 3 state. Do not use verify after later publication.\n" });
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

  // GB-01b: before Stage 4 adds baseline items, a subject names a file of the snapshot,
  // the snapshot ID, a question or gap, or an entry candidate of this analysis or of an
  // entry analysis that the run registers. Here the analysis retires the Stage 2
  // candidate with a note that names it.
  test("publishes a packet whose note and inspection priority name a retired candidate, a question, a gap and a file", () => {
    const attempt = newAttempt("subjects");
    const results = finishStageThree(attempt, (packet) => {
      packet.analysis.candidates = [];
      addGap(packet, ["s2-check-candidate-001"], ["s2-check-entry-analysis#/candidates/0"]);
      firstPriority(packet).subjectRefs = ["app.ts", "s2-check-candidate-001", "s1-question-001", mentionsGapId,
        "snapshot-check"];
    });
    expect({ status: results.finish?.status, stderr: results.finish?.stderr }).toEqual({ status: 0, stderr: "" });
  }, 60_000);

  // DB1: after a fresh Stage 2 attempt, no selected entry analysis names the candidates of
  // the earlier attempt, but run.yaml still registers its entry analysis. So a new note can
  // name such a candidate.
  test("publishes a packet whose new gap names a candidate of an earlier Stage 2 attempt", () => {
    const folder = join(scratch, "repeated-stage-2");
    const attempt = stageThreeAttempt(repeatedStageTwoRun(folder, "s2-first"), folder);
    const results = finishStageThree(attempt, (packet) => addGap(packet, ["s2-first-candidate-001"],
      ["s2-first-entry-analysis#/candidates/0"]));
    expect({ status: results.finish?.status, stderr: results.finish?.stderr }).toEqual({ status: 0, stderr: "" });
  }, 120_000);

  // Any saved file can be cited whole, with an empty JSON Pointer, as Stages 1 and 2 accept it.
  test("publishes a packet that cites a whole saved text file", () => {
    const attempt = newAttempt("whole-text-file");
    const results = finishStageThree(attempt, (packet) => {
      firstPriority(packet).evidenceRefs = [`${attempt.id}-file@operator-start.stdout.txt#`];
    });
    expect({ status: results.finish?.status, stderr: results.finish?.stderr }).toEqual({ status: 0, stderr: "" });
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

// The finalizer registers every attempt file. So each one must be a file that a
// producer action saved: a phase receipt, a file that the receipt names, or the
// command log. The finalizer refuses any other file and names it.
const strayFileMessage = "Unexpected attempt file that no producer action saved: notes.md. " +
  "Do not write into the attempt; use a fresh attempt.";

describe("Stage 3 finish with an attempt file that no action saved", () => {
  test("refuses the attempt, names the file, and leaves the drafts unchanged", () => {
    const attempt = newAttempt("stray-file");
    const before = draftState(attempt);
    const results = finishStageThree(attempt, () => writeFileSync(join(attempt.folder, "notes.md"), "# Notes\n"));
    expect({ status: results.finish?.status, stdout: results.finish?.stdout, stderr: results.finish?.stderr })
      .toEqual({ status: 1, stdout: "", stderr: strayFileMessage + "\n" });
    expect(draftState(attempt)).toEqual(before);
  }, 60_000);

  test("verify refuses a file that someone added to the published attempt, and names it", () => {
    const attempt = newAttempt("stray-file-after-publication");
    expect(finishStageThree(attempt).finish?.status).toBe(0);
    writeFileSync(join(attempt.folder, "notes.md"), "# Notes\n");
    const verify = stageThree(attempt, ["stage-3-finish", "verify"]);
    expect({ status: verify.status, stdout: verify.stdout, stderr: verify.stderr })
      .toEqual({ status: 1, stdout: "", stderr: strayFileMessage + "\n" });
  }, 60_000);

  // The cookbook says to keep the failed receipt of a request and to request again in
  // the same attempt. A failed request saved its receipt and logs, and no record.
  test("publishes an attempt with failed requests, and registers their receipts", () => {
    const attempt = newAttempt("failed-requests");
    const results = finishStageThree(attempt, () => {
      expect(stageThree(attempt, ["stage-3", "excerpt", "missing.ts", "1", "1"]).status).toBe(1);
    }, [["two\nlines"]], ["missing.ts"]);
    expect({ search: results["text-search-1"]?.status, exports: results["exports-1"]?.status, finish: results.finish?.status,
      stderr: results.finish?.stderr }).toEqual({ search: 1, exports: 1, finish: 0, stderr: "" });
    const run = parse(folderText(attempt, "run.yaml")) as { artifacts: Record<string, { path: string }> };
    for (const name of ["operator-excerpt-001.json", "operator-text-search-001.stderr.txt", "operator-exports-001.started.json"])
      expect(run.artifacts[`${attempt.id}-file@${name}`]?.path).toBe(`evidence/${attempt.id}/${name}`);
    expect(stageThree(attempt, ["stage-3-finish", "verify"]).status).toBe(0);
  }, 60_000);
});
