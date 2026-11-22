import { describe, expect, test } from "bun:test";
import { type DiscoveryGap, ToolGaps } from "../../src/tool-gaps.ts";

// The required gaps of the Stage 3 tool records (DB5): the symbol mentions that
// collect saves, and the exports record of each exports request. Their IDs start
// with the attempt ID.
type Json = Record<string, unknown>;

const attemptGaps = new ToolGaps("s3-check-");
const mentionsRef = "s3-check-file@symbol-mentions.json";
const knipRunsRef = "s2-check-knip-runs";
const report = (mode: string, status: string): Json => ({ mode, status, exitCode: status === "skipped" ? null : 1,
  reportRef: status === "skipped" ? null : `s2-check-file@knip-${mode}.stdout.txt` });
const mentions = (status: string, reports: readonly Json[]): Json => ({ formatVersion: 1, snapshotRef: "snapshot-check", knipRunsRef,
  status, reports, maxMentionsPerTarget: 250, targets: [] });
const mentionsGap = (reason: string): DiscoveryGap => ({ id: "s3-check-symbol-mentions-gap-001", kind: "tool-outcome",
  subjectRefs: ["snapshot-check"], reason, evidenceRefs: [mentionsRef] });

describe("ToolGaps.fromSymbolMentions", () => {
  test.each([
    { status: "partial", reports: [report("normal", "completed"), report("production", "skipped")],
      reason: "The symbol mentions are partial: they cover only the exports and types that the completed Knip runs reported. " +
        "The production Knip run of s2-check-knip-runs was skipped." },
    { status: "unavailable", reports: [report("normal", "failed"), report("production", "skipped")],
      reason: "The symbol mentions are unavailable: no Knip run completed, so they cover no reported export or type. " +
        "The normal Knip run of s2-check-knip-runs failed. The production Knip run of s2-check-knip-runs was skipped." },
    { status: "skipped", reports: [report("normal", "skipped"), report("production", "skipped")],
      reason: "The symbol mentions are skipped: Knip did not run, so they cover no reported export or type. " +
        "The normal Knip run of s2-check-knip-runs was skipped. The production Knip run of s2-check-knip-runs was skipped." },
  ])("gives one gap for $status symbol mentions, with each Knip run that did not complete", ({ status, reports, reason }) => {
    expect(attemptGaps.fromSymbolMentions(mentions(status, reports), mentionsRef)).toEqual([mentionsGap(reason)]);
  });

  test("gives no gap for completed symbol mentions", () => {
    const reports = [report("normal", "completed"), report("production", "completed")];
    expect(attemptGaps.fromSymbolMentions(mentions("completed", reports), mentionsRef)).toEqual([]);
  });

  const reports = [report("normal", "skipped"), report("production", "skipped")];
  test.each([
    ["no snapshot ID", { ...mentions("skipped", reports), snapshotRef: "" }],
    ["no Knip runs ID", { ...mentions("skipped", reports), knipRunsRef: undefined }],
    ["an unknown status", mentions("failed", reports)],
    ["no list of reports", { ...mentions("skipped", reports), reports: {} }],
    ["a report without a mode", mentions("skipped", [{ status: "skipped" }])],
    ["a report with an unknown status", mentions("skipped", [report("normal", "partial")])],
    ["a value that is not a record", null],
  ])("refuses symbol mentions with %s", (_name, value) => {
    expect(() => attemptGaps.fromSymbolMentions(value, mentionsRef)).toThrow(new Error(`Invalid symbol mentions: ${mentionsRef}`));
  });
});
