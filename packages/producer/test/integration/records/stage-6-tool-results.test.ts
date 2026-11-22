import { describe, expect, test } from "bun:test";
import { validateDiscoveryRecords } from "../../../src/stage-6-records.ts";
import { ToolGaps } from "../../../src/tool-gaps.ts";
import { recordInputs, type Records, snapshotRef } from "../../support/stage-6-records.ts";

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
