import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../../../cookbook/interfaces/generated/contracts.schema.json";
import { withScratch } from "../../support/commands.ts";
import { type JsonRecord, runAttempt, savedJson, stageOneRun, stageTwo, stageTwoAttempt } from "../../support/stage-2-attempt.ts";
import { stagedSnapshotRef } from "../../support/staged-run.ts";

// The run action saves the gaps that the Knip outcomes require (DB5) in
// required-gaps.json, and its receipt names the file with its SHA-256. The snapshot
// holds no package manifest, so preflight marks the Knip profile unsupported and both
// Knip modes are skipped. The record conforms to its generated contract
// (cookbook/interfaces/producer-run-records.tsp).
const id = "s2-check";
const app = { path: "app.ts", text: "export const value = 1;\n" };
const noManifest = "Workspace lacks a captured manifest: package.json";
const noImage = "No approved available tool image: CHOOM_KNIP_IMAGE must be an inspected sha256 image ID.";
const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true })).compile({ $ref: "RequiredGaps.json" });
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const gap = (number: string, reason: string, evidence: string): JsonRecord => ({ id: `${id}-knip-gap-${number}`,
  kind: "tool-outcome", subjectRefs: [stagedSnapshotRef], reason, evidenceRefs: [evidence] });
const record = { formatVersion: 1, gaps: [
  gap("001", `Knip preflight marked the profile unsupported. ${noManifest}.`, `${id}-preflight`),
  gap("002", `The normal Knip run was skipped. ${noManifest}. ${noImage}`, `${id}-knip-runs#/runs/0`),
  gap("003", `The production Knip run was skipped. ${noManifest}. ${noImage}`, `${id}-knip-runs#/runs/1`)] };

describe("the required gaps of a Stage 2 Knip run", () => {
  test("run saves a gap for the unsupported preflight and for each skipped run, and its receipt names the record", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work, [app]);
      const attempt = stageTwoAttempt(work, id);
      for (const [action, result] of Object.entries(runAttempt(attempt, scratch)))
        expect({ action, status: result.status, stderr: result.stderr }).toEqual({ action, status: 0, stderr: "" });
      expect(savedJson(attempt, "required-gaps.json")).toEqual(record);
      expect(structure(savedJson(attempt, "required-gaps.json"))).toBe(true);
      expect((savedJson(attempt, "operator-run.json").digests as JsonRecord)["required-gaps.json"])
        .toBe(sha256(readFileSync(join(attempt.folder, "required-gaps.json"))));
    });
  }, 30_000);

  // Stage 2 has no generated review prompt: the operator fills the prompt of the cookbook that start saved.
  test("the analysis prompt of the saved cookbook asks for the required gaps and their exact copy", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work, [app]);
      const attempt = stageTwoAttempt(work, id);
      expect(stageTwo(attempt, "start").status).toBe(0);
      const cookbook = readFileSync(join(attempt.folder, "cookbook.md"), "utf8");
      const prompt = cookbook.slice(cookbook.indexOf("Complete Choom Appendix A, stage 2"));
      expect(prompt).toContain("Required gaps (<attempt>-required-gaps):\n<PASTE THE COMPLETE required-gaps.json>\n");
      expect(prompt).toContain("Copy each gap of required-gaps.json into gaps exactly");
    });
  });
});

describe("the contract of the required-gaps record", () => {
  test("accepts a record without gaps", () => {
    expect(structure({ formatVersion: 1, gaps: [] })).toBe(true);
  });

  test.each([
    ["another format version", { ...record, formatVersion: 2 }],
    ["another field", { ...record, toolRecordRefs: [`${id}-knip-runs`] }],
    ["a gap without evidence", { ...record, gaps: [{ ...gap("001", "Knip did not run.", `${id}-preflight`), evidenceRefs: [] }] }],
    ["a gap with another field", { ...record, gaps: [{ ...gap("001", "Knip did not run.", `${id}-preflight`), note: "Copy it." }] }],
  ])("refuses a record with %s", (_name, value) => {
    expect(structure(value)).toBe(false);
  });
});
