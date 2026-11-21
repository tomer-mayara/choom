import { describe, expect, test } from "bun:test";
import { type DiscoveryGap, ToolGaps } from "../../src/tool-gaps.ts";

// The required gaps of the Knip outcomes (DB5): an unsupported preflight, and each
// skipped or failed run. Their IDs start with the attempt ID.
type Json = Record<string, unknown>;

const knipGaps = new ToolGaps("s2-check-");
const receiptsRef = "s2-check-knip-runs";
const noManifest = "Workspace lacks a captured manifest: package.json";
const noImage = "No approved available tool image: CHOOM_KNIP_IMAGE must be an inspected sha256 image ID.";
const unsupported = { status: "unsupported", reasons: [noManifest] };
const eligible = { status: "eligible", reasons: [] };
const skipped = (mode: string, reasons: string[]): Json => ({ mode, status: "skipped", reasons, exitCode: null });
const completed = (mode: string): Json => ({ mode, status: "completed", exitCode: 1, signal: null, timedOut: false, errors: [],
  report: { valid: true, issueRecordCount: 0, error: null } });
const receipts = (runs: Json[]): Json => ({ formatVersion: 1, snapshotRef: "snapshot-check", preflightRef: "s2-check-preflight",
  runs });
const gap = (number: string, reason: string, evidence: string): DiscoveryGap => ({ id: `s2-check-knip-gap-${number}`,
  kind: "tool-outcome", subjectRefs: ["snapshot-check"], reason, evidenceRefs: [evidence] });

describe("ToolGaps.fromKnipRuns", () => {
  test("gives a gap for an unsupported preflight and one for each skipped run, with the reasons of each record", () => {
    const runs = [skipped("normal", [noManifest, noImage]), skipped("production", [noManifest, noImage])];
    expect(knipGaps.fromKnipRuns(receipts(runs), receiptsRef, unsupported)).toEqual([
      gap("001", `Knip preflight marked the profile unsupported. ${noManifest}.`, "s2-check-preflight"),
      gap("002", `The normal Knip run was skipped. ${noManifest}. ${noImage}`, "s2-check-knip-runs#/runs/0"),
      gap("003", `The production Knip run was skipped. ${noManifest}. ${noImage}`, "s2-check-knip-runs#/runs/1"),
    ]);
  });

  test("gives no gap for an eligible preflight and two completed runs", () => {
    expect(knipGaps.fromKnipRuns(receipts([completed("normal"), completed("production")]), receiptsRef, eligible)).toEqual([]);
  });

  test("numbers the gaps in order from 001, also when the first run completed", () => {
    const reason = "Production analysis was not selected: No production entry is known (inventory-001).";
    expect(knipGaps.fromKnipRuns(receipts([completed("normal"), skipped("production", [reason])]), receiptsRef, eligible))
      .toEqual([gap("001", `The production Knip run was skipped. ${reason}`, "s2-check-knip-runs#/runs/1")]);
  });

  test("gives a failed run the reasons that its record shows", () => {
    const timedOut = { ...completed("normal"), status: "failed", exitCode: null, signal: "SIGKILL", timedOut: true,
      report: { valid: false, issueRecordCount: null, error: "Unexpected end of JSON input" } };
    const broken = { ...completed("production"), status: "failed", exitCode: 125, errors: ["spawn: docker stopped"],
      report: { valid: false, issueRecordCount: null, error: "Expected a JSON object with an issues array." } };
    expect(knipGaps.fromKnipRuns(receipts([timedOut, broken]), receiptsRef, eligible)).toEqual([
      gap("001", "The normal Knip run failed. The run reached its time limit. The run stopped on the signal SIGKILL. " +
        "The report is not valid: Unexpected end of JSON input.", "s2-check-knip-runs#/runs/0"),
      gap("002", "The production Knip run failed. The run exited with code 125. spawn: docker stopped. " +
        "The report is not valid: Expected a JSON object with an issues array.", "s2-check-knip-runs#/runs/1"),
    ]);
  });

  // The discovery contract limits a gap reason to 16 KiB of UTF-8. The cited record keeps every reason.
  test("keeps a reason within 16 KiB and gives the number of the reasons that it leaves out", () => {
    const reasons = Array.from({ length: 400 }, (_, index) => `Workspace lacks a captured manifest: packages/p${index}/package.json`);
    const [preflightGap] = knipGaps.fromKnipRuns(receipts([completed("normal"), completed("production")]), receiptsRef,
      { status: "unsupported", reasons });
    const reason = String(preflightGap?.reason);
    const listed = reasons.filter((item) => reason.includes(`${item}.`)).length;
    expect(Buffer.byteLength(reason)).toBeLessThanOrEqual(16 * 1024);
    expect(listed).toBeGreaterThan(0);
    expect(reason.endsWith(` ${reasons.length - listed} more reasons are in s2-check-preflight.`)).toBe(true);
  });

  test.each([
    ["no snapshot ID", { ...receipts([]), snapshotRef: "" }],
    ["no preflight ID", { ...receipts([]), preflightRef: undefined }],
    ["no list of runs", { ...receipts([]), runs: {} }],
    ["a run without a mode", receipts([{ status: "skipped", reasons: [] }])],
  ])("refuses Knip receipts with %s", (_name, value) => {
    expect(() => knipGaps.fromKnipRuns(value, receiptsRef, eligible)).toThrow(new Error("Invalid Knip receipts: s2-check-knip-runs"));
  });
});
