import { describe, expect, test } from "bun:test";
import { type SelectedHistory, ToolResults } from "../../../src/result-gaps.ts";
import { type RecordInputs, validateDiscoveryRecords } from "../../../src/stage-6-records.ts";
import { ToolGaps } from "../../../src/tool-gaps.ts";
import { candidatesRef, recordInputs, type Records, snapshotRef } from "../../support/stage-6-records.ts";

// The shared record validator of Stages 4, 5 and 6 and the tool results of the
// selected history. These cases were part of stage-6-records.test.ts; they have their
// own file because that suite reached the line limit of the linter. The records are
// the small in-memory copies of support/stage-6-records.ts.
type Change = (records: Records) => void;
const all = (...changes: Change[]): Change => (records) => changes.forEach((change) => change(records));
// Adds a gap with these evidence references to the discovery and to the selected entry analysis.
const withGap = (...evidence: string[]): Change => (records) => {
  for (const gaps of [records.discovery.gaps, records.entry.gaps]) gaps.push({ id: "gap-tool", kind: "tool-outcome",
    reason: "A tool did not run fully.", subjectRefs: [snapshotRef], evidenceRefs: [...evidence] });
};
// The refusal of a tool result that no gap cites. It has one form for every kind of tool result.
const uncited = (ref: string): Error => new Error(`The tool result ${ref} has no gap that cites it. Record a gap that cites ${ref}.`);

// P4: an analysis that did not run needs a gap that cites its result. The shared record
// checks see the Knip preflight and runs of the selected entry analysis, so Stages 4 to 6
// refuse a run whose Knip result did not run and no gap cites it. A gap cites one run: a
// gap that cites the other run, or only the whole receipts, does not cite it (GB-04d).
describe("validateDiscoveryRecords with a Knip result that did not run", () => {
  const unsupported: Change = (records) => { records.knip.preflight.status = "unsupported"; };
  const runs = (...statuses: string[]): Change => (records) => {
    records.knip.runs = statuses.map((status, index) => ({ mode: index === 0 ? "normal" : "production", status }));
  };

  test.each<[string, Change, string]>([
    ["an unsupported Knip profile", unsupported, "knip-preflight"],
    ["a skipped Knip mode", runs("completed", "skipped"), "knip-runs#/runs/1"],
    ["a failed Knip mode", runs("failed", "completed"), "knip-runs#/runs/0"],
    ["an unsupported profile whose gap cites only the Knip runs", all(unsupported, runs("skipped", "skipped"), withGap("knip-runs")),
      "knip-preflight"],
    ["a skipped Knip mode whose gap cites only the other run", all(runs("skipped", "skipped"), withGap("knip-runs#/runs/0")),
      "knip-runs#/runs/1"],
    ["a skipped Knip mode whose gap cites only the whole receipts", all(runs("completed", "skipped"), withGap("knip-runs")),
      "knip-runs#/runs/1"],
  ])("refuses %s without a gap that cites it", (_name, change, result) => {
    expect(() => validateDiscoveryRecords(recordInputs(change))).toThrow(uncited(result));
  });

  test("accepts results that did not run when a gap cites each of them, also with a JSON Pointer inside it", () => {
    const change = all(unsupported, runs("failed", "skipped"),
      withGap("knip-preflight#/status", "knip-runs#/runs/0", "knip-runs#/runs/1/status"));
    expect(validateDiscoveryRecords(recordInputs(change))).toMatchObject({ gaps: 2 });
  });

  // Stage 2 finish requires a copy of each required gap that ToolGaps gives from the Knip
  // records. These gaps cite the results that the shared record checks read.
  test("accepts the required gaps that ToolGaps gives from the Knip preflight and runs", () => {
    const requiredGaps: Change = (records) => {
      const gaps = new ToolGaps("s2-x-").fromKnipRuns({ snapshotRef, preflightRef: "knip-preflight", runs: records.knip.runs },
        "knip-runs", records.knip.preflight);
      for (const list of [records.discovery.gaps, records.entry.gaps]) list.push(...gaps);
    };
    const change = all(unsupported, runs("failed", "skipped"), requiredGaps);
    expect(validateDiscoveryRecords(recordInputs(change))).toMatchObject({ gaps: 4 });
  });
});

// GB-04d: the tool results of the selected history whose outcome needs a gap (DB5). Each
// stage gives the required gap of each result with its own class, and the evidence
// reference of that gap is the tool result.
const stageThree = "s3-x";
const stageThreeAnalysis = `${stageThree}-entry-analysis`;
const mentionsRef = `${stageThree}-file@symbol-mentions.json`;
// A compiler input that a tool record names and the snapshot does not hold.
const missingTypes = { kind: "missing-compiler-input", input: "types", missing: "node", subjectRefs: ["cli.ts"],
  reason: "The compiler settings name the types node, but the snapshot does not hold them." };
// The symbol mentions of a Stage 3 attempt are partial: the production Knip run was skipped.
const partialMentions = (attempt: string): [string, unknown] => [`evidence/${attempt}/symbol-mentions.json`, { snapshotRef,
  knipRunsRef: "knip-runs", status: "partial", reports: [{ mode: "normal", status: "completed" }, { mode: "production", status: "skipped" }] }];
const entryAnalysisOf = (attempt: string): [string, unknown] => [`evidence/${attempt}/entry-analysis.yaml`, { formatVersion: 1,
  kind: "entry-analysis", snapshotRef, llmReview: "recorded", reviewedFiles: [], questions: [], gaps: [] }];
// An older Stage 3 attempt, whose symbol mentions are partial, is outside the selected history.
const olderAttempt: Change = (records) => {
  records.saved["s3-old-entry-analysis"] = entryAnalysisOf("s3-old");
  records.saved["s3-old-file@symbol-mentions.json"] = partialMentions("s3-old");
};

// The settings record lists two gaps, and the Git identity record one.
const stageOneOutcomes: Change = (records) => {
  records.saved["settings-001"] = ["evidence/settings.json", { gaps: [
    { kind: "no-project-settings", subjectRefs: [snapshotRef], reason: "No project settings were found." },
    { kind: "missing-input", subjectRefs: ["tsconfig.base.json"], reason: "The base settings are not in the snapshot." }] }];
  records.saved["git-identity-001"] = ["evidence/git-identity.json", { gaps: [
    { kind: "git-unavailable", subjectRefs: [snapshotRef], reason: "The target folder is not a Git work tree." }] }];
};
// The preflight marks the Knip profile unsupported, the normal run failed and the production run was skipped.
const knipOutcomes: Change = (records) => {
  records.knip.preflight.status = "unsupported";
  records.knip.runs = [{ mode: "normal", status: "failed" }, { mode: "production", status: "skipped" }];
};
// The selected entry analysis names the entry analysis of a Stage 3 attempt as the earlier one. Its symbol
// mentions are partial, and its exports record lists a gap.
const stageThreeOutcomes: Change = (records) => {
  records.entry.previousEntryAnalysisRef = stageThreeAnalysis;
  records.mapping.scope.historicalEntryAnalysisRefs = [stageThreeAnalysis];
  records.saved[stageThreeAnalysis] = entryAnalysisOf(stageThree);
  records.saved[mentionsRef] = partialMentions(stageThree);
  records.saved[`${stageThree}-file@exports-001.json`] = [`evidence/${stageThree}/exports-001.json`, { formatVersion: 1, gaps: [missingTypes] }];
  olderAttempt(records);
};
// The behavior entry candidates list a gap and are partial, and the resource access candidates are partial.
const stageFourOutcomes: Change = (records) => {
  records.entry.behaviorEntryCandidatesRef = candidatesRef;
  Object.assign(records.candidates, { status: "partial", omittedCandidates: 1, gaps: [missingTypes] });
  Object.assign(records.resourceCandidates, { status: "partial", omittedCandidates: 2 });
};
const outcomes = all(stageOneOutcomes, knipOutcomes, stageThreeOutcomes, stageFourOutcomes);

// The selected history of the in-memory records, as the shared record checks read it.
function selectedHistory(inputs: RecordInputs): SelectedHistory {
  const document = (id: unknown): unknown => JSON.parse(String(inputs.artifacts.get(String(id))?.bytes));
  const discovery = inputs.discovery as Records["discovery"];
  const entry = document(discovery.entryAnalysisRef) as { previousEntryAnalysisRef?: string };
  return { artifacts: inputs.artifacts, document, discovery, historyRefs: entry.previousEntryAnalysisRef === undefined ? [] :
    [entry.previousEntryAnalysisRef] };
}
const toolResults = (change: Change): ToolResults => new ToolResults(selectedHistory(recordInputs(change)));
const listed = (change: Change): string[][] => toolResults(change).list().map(({ ref, gap }) => [ref, gap.id]);

const stageOneResults = [["settings-001#/gaps/0", "s1-settings-gap-001"], ["settings-001#/gaps/1", "s1-settings-gap-002"],
  ["git-identity-001#/gaps/0", "s1-git-identity-gap-001"]];
// The Knip receipts of a Stage 2 attempt are <attempt>-knip-runs. These receipts are knip-runs, so the IDs have no attempt.
const knipResults = [["knip-preflight", "knip-gap-001"], ["knip-runs#/runs/0", "knip-gap-002"], ["knip-runs#/runs/1", "knip-gap-003"]];
const stageThreeResults = [[mentionsRef, `${stageThree}-symbol-mentions-gap-001`],
  [`${stageThree}-file@exports-001.json#/gaps/0`, `${stageThree}-exports-001-gap-001`]];
const stageFourResults = [[`${candidatesRef}#/gaps/0`, "s4-x-behavior-entry-gap-001"], [`${candidatesRef}#/status`, "s4-x-behavior-entry-gap-002"],
  ["s4-x-file@resource-access-candidates.json#/status", "s4-x-resource-access-gap-001"]];

// GB-04d step 1.
describe("ToolResults of the selected history", () => {
  test.each<[string, Change, string[][]]>([
    ["each gap that a Stage 1 settings or Git identity record lists", stageOneOutcomes, stageOneResults],
    ["an unsupported Knip preflight and each Knip run that failed or was skipped", knipOutcomes, knipResults],
    ["the partial symbol mentions and each gap of an exports record of a Stage 3 attempt of the selected history",
      stageThreeOutcomes, stageThreeResults],
    ["each gap and the partial status of the Stage 4 candidate records that the selected records name", stageFourOutcomes,
      stageFourResults],
  ])("lists %s, with the required gap that its stage gives", (_name, change, results) => {
    expect(listed(change)).toEqual(results);
  });

  test("lists the tool results in the order of the stages", () => {
    expect(listed(outcomes)).toEqual([...stageOneResults, ...knipResults, ...stageThreeResults, ...stageFourResults]);
  });

  test("lists no tool result when each tool completed and no tool record lists a gap", () => {
    expect(listed(() => {})).toEqual([]);
  });
});

// GB-04d steps 2 and 3: each tool result of the selected history whose outcome needs a gap
// has a gap whose evidence cites it, in the shared record checks of Stages 4 to 6.
describe("validateDiscoveryRecords with the tool results of Stages 1, 3 and 4", () => {
  test.each<[string, Change, string]>([
    ["a gap that the Stage 1 settings record lists", stageOneOutcomes, "settings-001#/gaps/0"],
    ["a gap that the Stage 1 Git identity record lists", all(stageOneOutcomes, withGap("settings-001#/gaps/0", "settings-001#/gaps/1")),
      "git-identity-001#/gaps/0"],
    ["partial symbol mentions of a Stage 3 attempt of the selected history", stageThreeOutcomes, mentionsRef],
    ["a gap that an exports record of that attempt lists", all(stageThreeOutcomes, withGap(mentionsRef)),
      `${stageThree}-file@exports-001.json#/gaps/0`],
    ["a gap that the behavior entry candidates list", stageFourOutcomes, `${candidatesRef}#/gaps/0`],
    ["partial behavior entry candidates", all(stageFourOutcomes, withGap(`${candidatesRef}#/gaps/0`)), `${candidatesRef}#/status`],
    ["partial resource access candidates", all(stageFourOutcomes, withGap(`${candidatesRef}#/gaps/0`, `${candidatesRef}#/status`)),
      "s4-x-file@resource-access-candidates.json#/status"],
  ])("refuses %s without a gap that cites it", (_name, change, result) => {
    expect(() => validateDiscoveryRecords(recordInputs(change))).toThrow(uncited(result));
  });

  test("accepts the tool results of every stage when the discovery keeps the required gap of each", () => {
    const required = toolResults(outcomes).list().map(({ gap }) => gap);
    const keepRequired: Change = (records) => {
      for (const gaps of [records.discovery.gaps, records.entry.gaps]) gaps.push(...structuredClone(required));
    };
    expect(validateDiscoveryRecords(recordInputs(all(outcomes, keepRequired)))).toMatchObject({ gaps: 1 + required.length });
  });

  // Its gaps stay in the discovery as history, but its tool results are not selected.
  test("does not require a gap for a tool result of a Stage 3 attempt outside the selected history", () => {
    expect(validateDiscoveryRecords(recordInputs(olderAttempt))).toMatchObject({ gaps: 1 });
  });
});
