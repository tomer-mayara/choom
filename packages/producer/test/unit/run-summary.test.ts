import { describe, expect, test } from "bun:test";
import { RunSummary, type SummaryRecords } from "../../src/run-summary.ts";

// The summary of a run in run.yaml (DB4): the file count of the selected inventory,
// the selected review and code mapping, and the record counts of the questions and
// gaps. The state of each stage is in `progress`, not in the summary. Every input is
// a plain value from a saved record, so RunSummary has no other component to replace
// with a mock.
const file = (path: string, kind = "file") => ({ path, kind, bytes: 1, sha256: "a".repeat(64) });
const question = (id: string) => ({ id, subjectRefs: ["app.ts"], text: "Which command starts it?", evidenceRefs: ["e"] });
const gap = (id: string, subject = "app.ts") =>
  ({ id, kind: "entry", subjectRefs: [subject], reason: "The start path is unknown.", evidenceRefs: ["e"] });

function records(change: Partial<SummaryRecords> = {}): SummaryRecords {
  return { inventory: { files: [file("app.ts"), file("cli.ts"), file("http.ts")] },
    reviewRef: "review-001", issuesRef: "discovery-001", issues: { questions: [question("q-1")], gaps: [gap("g-1"), gap("g-2", "g-1")] },
    ...change };
}

describe("RunSummary", () => {
  test("makes the summary of a run from its selected records", () => {
    expect(new RunSummary(records()).coverage()).toEqual({
      inventoried: "3 regular files in the selected capture scope.",
      inspected: "review-001#/reviewedFiles lists the source ranges that the selected review read. Earlier reviews keep " +
        "their own ranges. Tool reads are not LLM inspection.",
      recorded: "discovery-001 records 1 question and 2 gaps, with history and linked notes.",
    });
  });

  test("names the selected code mapping when there is one", () => {
    const summary = new RunSummary(records({ reviewRef: "s4-001-entry-analysis",
      codeMappingRef: "s4-001-file@code-mapping.json", issuesRef: "s4-001-file@discovery.proposed.yaml" })).coverage();
    expect(summary).toEqual({
      inventoried: "3 regular files in the selected capture scope.",
      inspected: "s4-001-entry-analysis#/reviewedFiles lists the source ranges that the selected review read. Earlier " +
        "reviews keep their own ranges. s4-001-file@code-mapping.json maps each code unit to its owner and says whether a " +
        "review read it. Tool reads are not LLM inspection.",
      recorded: "s4-001-file@discovery.proposed.yaml records 1 question and 2 gaps, with history and linked notes.",
    });
  });

  test("counts only the regular files of the inventory, and gives one file, question or gap in the singular", () => {
    const summary = new RunSummary(records({ inventory: { files: [file("app.ts"), file("link.ts", "symlink")] },
      issues: { questions: [], gaps: [gap("g-1")] } })).coverage();
    expect([summary.inventoried, summary.recorded]).toEqual(["1 regular file in the selected capture scope.",
      "discovery-001 records 0 questions and 1 gap, with history and linked notes."]);
  });

  test.each([
    ["the inventory has no file list", { inventory: {} }, "Missing inventory file list."],
    ["the questions are not a list", { issues: { questions: 1, gaps: [] } }, "Missing question list."],
    ["the gaps are not a list", { issues: { questions: [] } }, "Missing gap list."],
  ])("refuses records in which %s", (_name, change, message) => {
    expect(() => new RunSummary(records(change)).coverage()).toThrow(new Error(message));
  });
});

// The summary has three fields. `progress` is the one place for the state of each stage,
// so no text of the summary names a stage as pending, and none keeps a claim that a
// completed stage made obsolete.
describe("the texts of RunSummary", () => {
  test.each([
    ["after Stage 1", records()],
    ["with a selected code mapping", records({ reviewRef: "s4-001-entry-analysis", codeMappingRef: "s4-001-file@code-mapping.json",
      issuesRef: "s4-001-file@discovery.proposed.yaml" })],
  ])("have the fields inventoried, inspected and recorded only, and name no pending stage (%s)", (_name, input) => {
    const summary = new RunSummary(input).coverage();
    expect(Object.keys(summary)).toEqual(["inventoried", "inspected", "recorded"]);
    expect(Object.values(summary).join("\n")).not.toMatch(/pending|\bstages? [0-9]|unresolved|not yet recovered/i);
  });
});
