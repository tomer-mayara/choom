import { describe, expect, test } from "bun:test";
import { type SelectedHistory, ToolResults } from "../../../src/result-gaps.ts";
import { type RecordInputs, validateDiscoveryRecords } from "../../../src/stage-6-records.ts";
import { ToolGaps } from "../../../src/tool-gaps.ts";
import { candidatesRef, recordInputs, type Records, snapshotRef } from "../../support/stage-6-records.ts";

// The shared record validator of Stages 4, 5 and 6 and the tool results of the
// selected history. These cases were part of stage-6-records.test.ts; they have their
// own file because that suite reached the line limit of the linter. The records are
// the small in-memory copies of support/stage-6-records.ts.

// P4: an analysis that did not run needs a gap that cites its record. The shared record
// checks see the Knip preflight and runs of the selected entry analysis, so Stages 4 to 6
// refuse a run whose Knip result did not run and no gap cites it.
describe("validateDiscoveryRecords with a Knip result that did not run", () => {
  const unsupported = (records: Records): void => { records.knip.preflight.status = "unsupported"; };
  const runs = (...statuses: string[]) => (records: Records): void => {
    records.knip.runs = statuses.map((status, index) => ({ mode: index === 0 ? "normal" : "production", status }));
  };
  const withGap = (...evidence: string[]) => (records: Records): void => {
    for (const gaps of [records.discovery.gaps, records.entry.gaps]) gaps.push({ id: "gap-knip", kind: "tool-outcome",
      reason: "Knip did not run.", subjectRefs: [snapshotRef], evidenceRefs: [...evidence] });
  };
  const all = (...changes: ((records: Records) => void)[]) => (records: Records): void => changes.forEach((change) => change(records));

  test.each<[string, (records: Records) => void, string]>([
    ["an unsupported Knip profile", unsupported,
      "The Knip preflight knip-preflight marks the profile unsupported. Record a gap that cites knip-preflight."],
    ["a skipped Knip mode", runs("completed", "skipped"),
      "The production Knip run in knip-runs has the status skipped. Record a gap that cites knip-runs."],
    ["a failed Knip mode", runs("failed", "completed"),
      "The normal Knip run in knip-runs has the status failed. Record a gap that cites knip-runs."],
    ["an unsupported profile whose gap cites only the Knip runs", all(unsupported, runs("skipped", "skipped"), withGap("knip-runs")),
      "The Knip preflight knip-preflight marks the profile unsupported. Record a gap that cites knip-preflight."],
  ])("refuses %s without a gap that cites its record", (_name, change, message) => {
    expect(() => validateDiscoveryRecords(recordInputs(change))).toThrow(new Error(message));
  });

  test("accepts results that did not run when a gap cites each record, also with a JSON Pointer", () => {
    const change = all(unsupported, runs("failed", "skipped"), withGap("knip-preflight#/status", "knip-runs#/runs/0"));
    expect(validateDiscoveryRecords(recordInputs(change))).toMatchObject({ gaps: 2 });
  });

  // Stage 2 finish requires a copy of each required gap that ToolGaps gives from the Knip
  // records. These gaps cite the records that the shared record checks read.
  test("accepts the required gaps that ToolGaps gives from the Knip preflight and runs", () => {
    const requiredGaps = (records: Records): void => {
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
// A compiler input that a tool record names and the snapshot does not hold.
const missingTypes = { kind: "missing-compiler-input", input: "types", missing: "node", subjectRefs: ["cli.ts"],
  reason: "The compiler settings name the types node, but the snapshot does not hold them." };
// The symbol mentions of a Stage 3 attempt are partial: the production Knip run was skipped.
const partialMentions = (attempt: string): [string, unknown] => [`evidence/${attempt}/symbol-mentions.json`, { snapshotRef,
  knipRunsRef: "knip-runs", status: "partial", reports: [{ mode: "normal", status: "completed" }, { mode: "production", status: "skipped" }] }];
const entryAnalysisOf = (attempt: string): [string, unknown] => [`evidence/${attempt}/entry-analysis.yaml`, { formatVersion: 1,
  kind: "entry-analysis", snapshotRef, llmReview: "recorded", reviewedFiles: [], questions: [], gaps: [] }];

// The settings record lists two gaps, and the Git identity record one.
const stageOneOutcomes = (records: Records): void => {
  records.saved["settings-001"] = ["evidence/settings.json", { gaps: [
    { kind: "no-project-settings", subjectRefs: [snapshotRef], reason: "No project settings were found." },
    { kind: "missing-input", subjectRefs: ["tsconfig.base.json"], reason: "The base settings are not in the snapshot." }] }];
  records.saved["git-identity-001"] = ["evidence/git-identity.json", { gaps: [
    { kind: "git-unavailable", subjectRefs: [snapshotRef], reason: "The target folder is not a Git work tree." }] }];
};
// The preflight marks the Knip profile unsupported, the normal run failed and the production run was skipped.
const knipOutcomes = (records: Records): void => {
  records.knip.preflight.status = "unsupported";
  records.knip.runs = [{ mode: "normal", status: "failed" }, { mode: "production", status: "skipped" }];
};
// The selected entry analysis names the entry analysis of a Stage 3 attempt as the earlier one. Its symbol
// mentions are partial, and its exports record lists a gap. An older Stage 3 attempt is outside the selected history.
const stageThreeOutcomes = (records: Records): void => {
  records.entry.previousEntryAnalysisRef = stageThreeAnalysis;
  records.mapping.scope.historicalEntryAnalysisRefs = [stageThreeAnalysis];
  records.saved[stageThreeAnalysis] = entryAnalysisOf(stageThree);
  records.saved[`${stageThree}-file@symbol-mentions.json`] = partialMentions(stageThree);
  records.saved[`${stageThree}-file@exports-001.json`] = [`evidence/${stageThree}/exports-001.json`, { formatVersion: 1, gaps: [missingTypes] }];
  records.saved["s3-old-entry-analysis"] = entryAnalysisOf("s3-old");
  records.saved["s3-old-file@symbol-mentions.json"] = partialMentions("s3-old");
};
// The behavior entry candidates list a gap and are partial, and the resource access candidates are partial.
const stageFourOutcomes = (records: Records): void => {
  records.entry.behaviorEntryCandidatesRef = candidatesRef;
  Object.assign(records.candidates, { status: "partial", omittedCandidates: 1, gaps: [missingTypes] });
  Object.assign(records.resourceCandidates, { status: "partial", omittedCandidates: 2 });
};
const outcomes = [stageOneOutcomes, knipOutcomes, stageThreeOutcomes, stageFourOutcomes];

// The selected history of the in-memory records, as the shared record checks read it.
function selectedHistory(inputs: RecordInputs): SelectedHistory {
  const document = (id: unknown): unknown => JSON.parse(String(inputs.artifacts.get(String(id))?.bytes));
  const discovery = inputs.discovery as Records["discovery"];
  const entry = document(discovery.entryAnalysisRef) as { previousEntryAnalysisRef?: string };
  return { artifacts: inputs.artifacts, document, discovery, historyRefs: entry.previousEntryAnalysisRef === undefined ? [] :
    [entry.previousEntryAnalysisRef] };
}
const listed = (change: (records: Records) => void): string[][] =>
  new ToolResults(selectedHistory(recordInputs(change))).list().map(({ ref, gap }) => [ref, gap.id]);

const stageOneResults = [["settings-001#/gaps/0", "s1-settings-gap-001"], ["settings-001#/gaps/1", "s1-settings-gap-002"],
  ["git-identity-001#/gaps/0", "s1-git-identity-gap-001"]];
// The Knip receipts of a Stage 2 attempt are <attempt>-knip-runs. These receipts are knip-runs, so the IDs have no attempt.
const knipResults = [["knip-preflight", "knip-gap-001"], ["knip-runs#/runs/0", "knip-gap-002"], ["knip-runs#/runs/1", "knip-gap-003"]];
const stageThreeResults = [[`${stageThree}-file@symbol-mentions.json`, `${stageThree}-symbol-mentions-gap-001`],
  [`${stageThree}-file@exports-001.json#/gaps/0`, `${stageThree}-exports-001-gap-001`]];
const stageFourResults = [[`${candidatesRef}#/gaps/0`, "s4-x-behavior-entry-gap-001"], [`${candidatesRef}#/status`, "s4-x-behavior-entry-gap-002"],
  ["s4-x-file@resource-access-candidates.json#/status", "s4-x-resource-access-gap-001"]];

describe("ToolResults of the selected history", () => {
  test.each<[string, (records: Records) => void, string[][]]>([
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
    expect(listed((records) => outcomes.forEach((change) => change(records))))
      .toEqual([...stageOneResults, ...knipResults, ...stageThreeResults, ...stageFourResults]);
  });

  test("lists no tool result when each tool completed and no tool record lists a gap", () => {
    expect(listed(() => {})).toEqual([]);
  });
});
