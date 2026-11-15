import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { makeScratch, removeScratch } from "../../support/commands.ts";
import { analysisPacket, candidate, entryAnalysis, finishAttempt, priorQuestion, runAttempt, savedJson, stageOneRun,
  stageTwo, stageTwoAttempt, type JsonRecord, type StageTwoAttempt } from "../../support/stage-2-attempt.ts";

// Finish checks the complete attempt before it changes either draft. The
// prepared attempt has no package manifest, so preflight skips Knip. Each case
// restores the same prepared run folder at the same path, then saves its packet.
interface FinishCase { name: string; change: (analysis: JsonRecord) => JsonRecord; message: string }

const id = "s2-check";
const app = { path: "app.ts", text: "export const value = 1;\n" };
const source = { id: `${id}-source-excerpt-001`, snapshotRef: "snapshot-check", path: "app.ts",
  sha256: createHash("sha256").update(app.text).digest("hex"), lines: [1, 1] };
const question = (questionId: string): JsonRecord => ({ id: questionId, subjectRefs: ["app.ts"], text: "Is app.ts used?",
  evidenceRefs: ["inventory-001"] });

const cases: FinishCase[] = [
  { name: "an earlier discovery question is removed", change: (analysis) => ({ ...analysis, questions: [] }),
    message: "Removed or changed prior record: s1-question-001" },
  { name: "an earlier discovery question is changed",
    change: (analysis) => ({ ...analysis, questions: [{ ...priorQuestion, text: "Changed." }] }),
    message: "Removed or changed prior record: s1-question-001" },
  { name: "a new question does not use the attempt ID",
    change: (analysis) => ({ ...analysis, questions: [priorQuestion, question("other-question-001")] }),
    message: "New record needs this attempt's ID: other-question-001" },
  { name: "a reviewed source has no saved excerpt",
    change: (analysis) => ({ ...analysis, reviewedFiles: [{ ...source, id: `${id}-source-other` }] }),
    message: `Copy the exact saved excerpt source ID and range: ${id}-source-other` },
  { name: "a gap cites unknown evidence",
    change: (analysis) => ({ ...analysis, gaps: [{ id: `${id}-gap-001`, kind: "tool-outcome", subjectRefs: ["app.ts"],
      reason: "Knip did not run.", evidenceRefs: ["missing-artifact"] }] }),
    message: "Unknown evidence reference: missing-artifact" },
  { name: "a candidate names a path outside the inventory",
    change: (analysis) => ({ ...analysis, candidates: [{ ...candidate(id), path: "missing.ts" }] }),
    message: `Invalid or duplicate candidate: ${id}-candidate-001` },
  { name: "a new record uses an artifact ID",
    change: (analysis) => ({ ...analysis, questions: [priorQuestion, question(`${id}-knip-runs`)] }),
    message: `Colliding final-analysis ID: ${id}-knip-runs` },
];

let scratch = "";
let attempt: StageTwoAttempt;

beforeAll(() => {
  scratch = makeScratch();
  const work = join(scratch, "run");
  stageOneRun(work, [app]);
  attempt = stageTwoAttempt(work, id);
  for (const [action, result] of Object.entries(runAttempt(attempt, scratch))) expect({ action, status: result.status })
    .toEqual({ action, status: 0 });
  const excerpt = stageTwo(attempt, "excerpt", ["app.ts", "1", "1", "Check the entry module."]);
  expect(excerpt.stdout).toBe(`Saved ${id}-file@excerpt-001.json. Source record: ${source.id}\n`);
  cpSync(work, join(scratch, "prepared"), { recursive: true });
});

afterAll(() => removeScratch(scratch));

function restoredAttempt(): StageTwoAttempt {
  rmSync(attempt.work, { recursive: true, force: true });
  cpSync(join(scratch, "prepared"), attempt.work, { recursive: true });
  rmSync(join(scratch, `${id}-review`), { recursive: true, force: true });
  return attempt;
}

function drafts(prepared: StageTwoAttempt): string[] {
  return ["run.yaml", "discovery.yaml", "baseline.yaml"].map((name) => readFileSync(join(prepared.work, name), "utf8"));
}

describe("Stage 2 finish checks", () => {
  test("publishes an analysis that cites a saved excerpt", () => {
    const prepared = restoredAttempt();
    const results = finishAttempt(prepared, scratch, entryAnalysis(id, { reviewedFiles: [source] }));
    expect(results.finish?.status).toBe(0);
    const discovery = parse(readFileSync(join(prepared.work, "discovery.yaml"), "utf8")) as JsonRecord;
    expect(discovery.entryAnalysisRef).toBe(`${id}-entry-analysis`);
  });

  test.each(cases)("refuses an analysis in which $name and leaves the drafts unchanged", ({ change, message }) => {
    const prepared = restoredAttempt();
    const before = drafts(prepared);
    const results = finishAttempt(prepared, scratch, change(entryAnalysis(id)));
    expect(results["save-review"]?.status).toBe(0);
    expect({ status: results.finish?.status, stdout: results.finish?.stdout, stderr: results.finish?.stderr })
      .toEqual({ status: 1, stdout: "", stderr: message + "\n" });
    expect(drafts(prepared)).toEqual(before);
  });

  // The design rule "Do not save hidden reasoning": save-review checks the LLM part of the packet.
  test.each([
    ["the response holds a reasoning block", "llm/analysis-response.md",
      (text: string) => "<thinking>\nKnip did not run.\n</thinking>\n\n" + text,
      "llm/analysis-response.md contains a hidden reasoning block. Save only the visible response."],
    ["the call record does not say that hidden reasoning was not saved", "llm/analysis-call.yaml",
      (text: string) => text.replace("hiddenReasoning: not-saved\n", ""), "Record hiddenReasoning: not-saved in llm/analysis-call.yaml."],
  ])("save-review refuses a packet in which %s and saves no packet file", (_name, file, change, message) => {
    const prepared = restoredAttempt();
    const review = analysisPacket(join(scratch, `${id}-review`), id, entryAnalysis(id));
    writeFileSync(join(review, file), change(readFileSync(join(review, file), "utf8")));
    const result = stageTwo(prepared, "save-review", [review]);
    expect({ status: result.status, error: savedJson(prepared, "operator-save-review.json").error })
      .toEqual({ status: 1, error: message });
    expect(existsSync(join(prepared.folder, "entry-analysis.yaml"))).toBe(false);
  });

  test("refuses to finish before the analysis packet is saved", () => {
    const prepared = restoredAttempt();
    analysisPacket(join(scratch, `${id}-review`), id, entryAnalysis(id));
    const finish = stageTwo(prepared, "finish");
    expect(finish.status).toBe(1);
    expect(finish.stderr).toContain(`ENOENT: no such file or directory, lstat '${join(prepared.folder, "operator-save-review.json")}'`);
  });
});
