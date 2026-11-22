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

// The gaps of an exports record (snapshot-project.ts) are the compiler inputs that the
// snapshot does not hold. A required gap keeps the subjects of the record, which can
// name the missing file (DB1, detail b).
describe("ToolGaps.fromExports", () => {
  const exportsRef = "s3-check-file@exports-001.json";
  const missingFile = { kind: "missing-compiler-input", input: "reference-path", missing: "src/env.d.ts",
    subjectRefs: ["src/invoice.ts", "src/env.d.ts"],
    reason: "src/invoice.ts names src/env.d.ts in a reference path directive, but the snapshot does not hold that file." };
  const missingTypes = { kind: "missing-compiler-input", input: "types", missing: "node", subjectRefs: ["tsconfig.json"],
    reason: "tsconfig.json (settings-001#/configs/0) names the type package node in its types list, but the snapshot holds " +
      "no declaration file for it. The project opened without it." };
  const record = { formatVersion: 1, attemptId: "s3-check", status: "completed", path: "src/invoice.ts", exports: [],
    gaps: [missingFile, missingTypes] };

  test("gives one gap for each gap of the record, with its kind, subjects and reason, and cites its place in the record", () => {
    expect(attemptGaps.fromExports("exports-001", record, exportsRef)).toEqual([
      { id: "s3-check-exports-001-gap-001", kind: "missing-compiler-input", subjectRefs: ["src/invoice.ts", "src/env.d.ts"],
        reason: missingFile.reason, evidenceRefs: [`${exportsRef}#/gaps/0`] },
      { id: "s3-check-exports-001-gap-002", kind: "missing-compiler-input", subjectRefs: ["tsconfig.json"],
        reason: missingTypes.reason, evidenceRefs: [`${exportsRef}#/gaps/1`] },
    ]);
  });

  test("gives no gap for a record without gaps", () => {
    expect(attemptGaps.fromExports("exports-002", { ...record, gaps: [] }, "s3-check-file@exports-002.json")).toEqual([]);
  });

  test.each([
    ["no list of gaps", { ...record, gaps: undefined }],
    ["a value that is not a record", []],
  ])("refuses an exports record with %s", (_name, value) => {
    expect(() => attemptGaps.fromExports("exports-001", value, exportsRef)).toThrow(new Error(`Invalid exports record: ${exportsRef}`));
  });

  test("refuses a gap of the record without a subject", () => {
    expect(() => attemptGaps.fromExports("exports-001", { ...record, gaps: [{ ...missingFile, subjectRefs: [] }] }, exportsRef))
      .toThrow(new Error(`Invalid gap in the tool record: ${exportsRef}#/gaps/0`));
  });
});
