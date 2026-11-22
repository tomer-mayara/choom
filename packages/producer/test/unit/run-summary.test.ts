import { describe, expect, test } from "bun:test";
import { RunSummary, type SummaryRecords } from "../../src/run-summary.ts";

// The summary of a run in run.yaml (DB4): the file count of the selected inventory,
// the selected review and code mapping, the record counts of the questions and gaps,
// and the stages that are pending. Every input is a plain value from a saved record,
// so RunSummary has no other component to replace with a mock.
const file = (path: string, kind = "file") => ({ path, kind, bytes: 1, sha256: "a".repeat(64) });
const question = (id: string) => ({ id, subjectRefs: ["app.ts"], text: "Which command starts it?", evidenceRefs: ["e"] });
const gap = (id: string, subject = "app.ts") =>
  ({ id, kind: "entry", subjectRefs: [subject], reason: "The start path is unknown.", evidenceRefs: ["e"] });
// The progress of a run after each stage, as the publisher of that stage writes it.
const progressAfter: Record<string, string>[] = [
  { inventory: "complete", baselineRecovery: "pending" },
  { inventory: "complete", baselineRecovery: "pending", entryAnalysis: "complete", inspectionPriorities: "pending" },
  { inventory: "complete", baselineRecovery: "pending", entryAnalysis: "complete", inspectionPriorities: "complete" },
  { inventory: "complete", entryAnalysis: "complete", inspectionPriorities: "complete", baselineRecovery: "pending",
    componentRecovery: "complete" },
  { inventory: "complete", entryAnalysis: "complete", inspectionPriorities: "complete", baselineRecovery: "pending",
    componentRecovery: "complete", remainingCode: "complete" },
  { inventory: "complete", entryAnalysis: "complete", inspectionPriorities: "complete", componentRecovery: "complete",
    remainingCode: "complete", baselineRecovery: "complete" },
];
const afterStage = (stage: number): Record<string, string> => progressAfter[stage - 1] ?? {};

function records(change: Partial<SummaryRecords> = {}): SummaryRecords {
  return { progress: afterStage(1), inventory: { files: [file("app.ts"), file("cli.ts"), file("http.ts")] },
    reviewRef: "review-001", issuesRef: "discovery-001", issues: { questions: [question("q-1")], gaps: [gap("g-1"), gap("g-2", "g-1")] },
    ...change };
}

describe("RunSummary", () => {
  test("makes the summary of a run after Stage 1 from its progress and its selected records", () => {
    expect(new RunSummary(records()).coverage()).toEqual({
      inventoried: "3 regular files in the selected capture scope.",
      inspected: "review-001#/reviewedFiles lists the source ranges that the selected review read. Earlier reviews keep " +
        "their own ranges. Tool reads are not LLM inspection.",
      recorded: "discovery-001 records 1 question and 2 gaps, with history and linked notes.",
      pending: "Stages 2, 3, 4, 5 and 6 are pending.",
    });
  });

  test("names the selected code mapping when there is one", () => {
    const summary = new RunSummary(records({ progress: afterStage(4), reviewRef: "s4-001-entry-analysis",
      codeMappingRef: "s4-001-file@code-mapping.json", issuesRef: "s4-001-file@discovery.proposed.yaml" })).coverage();
    expect(summary).toMatchObject({
      inspected: "s4-001-entry-analysis#/reviewedFiles lists the source ranges that the selected review read. Earlier " +
        "reviews keep their own ranges. s4-001-file@code-mapping.json maps each code unit to its owner and says whether a " +
        "review read it. Tool reads are not LLM inspection.",
      recorded: "s4-001-file@discovery.proposed.yaml records 1 question and 2 gaps, with history and linked notes.",
      pending: "Stages 5 and 6 are pending.",
    });
  });

  test("counts only the regular files of the inventory, and gives one file, question or gap in the singular", () => {
    const summary = new RunSummary(records({ inventory: { files: [file("app.ts"), file("link.ts", "symlink")] },
      issues: { questions: [], gaps: [gap("g-1")] } })).coverage();
    expect([summary.inventoried, summary.recorded]).toEqual(["1 regular file in the selected capture scope.",
      "discovery-001 records 0 questions and 1 gap, with history and linked notes."]);
  });

  test("says that the last stage is pending, and then that no stage is pending", () => {
    expect([5, 6].map((stage) => new RunSummary(records({ progress: afterStage(stage) })).coverage().pending))
      .toEqual(["Stage 6 is pending.", "No stage is pending."]);
  });

  test.each([
    ["the inventory has no file list", { inventory: {} }, "Missing inventory file list."],
    ["the questions are not a list", { issues: { questions: 1, gaps: [] } }, "Missing question list."],
    ["the gaps are not a list", { issues: { questions: [] } }, "Missing gap list."],
  ])("refuses records in which %s", (_name, change, message) => {
    expect(() => new RunSummary(records(change)).coverage()).toThrow(new Error(message));
  });
});

// The summary replaces the summary of the earlier stage, so no text can keep a claim
// that a completed stage made obsolete.
describe("the texts of RunSummary", () => {
  test.each([1, 2, 3, 4, 5, 6])("name only the stages after Stage %i as pending, and call no count unresolved", (stage) => {
    const summary = new RunSummary(records({ progress: afterStage(stage) })).coverage();
    const pending = [...summary.pending.matchAll(/[0-9]+/g)].map(([number]) => Number(number));
    expect(pending).toEqual([1, 2, 3, 4, 5, 6].filter((later) => later > stage));
    expect(Object.values(summary).join("\n")).not.toMatch(/unresolved|not yet recovered/i);
  });

  test("names as pending a stage whose progress is pending or missing, also before a completed stage", () => {
    const progress = { inventory: "complete", entryAnalysis: "complete", inspectionPriorities: "pending", baselineRecovery: "complete" };
    expect(new RunSummary(records({ progress })).coverage().pending).toBe("Stages 3, 4 and 5 are pending.");
  });
});
