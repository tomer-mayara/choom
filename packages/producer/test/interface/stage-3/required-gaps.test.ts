import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import contracts from "../../../../../cookbook/interfaces/generated/contracts.schema.json";
import { type CommandResult, makeScratch, removeScratch } from "../../support/commands.ts";
import type { JsonRecord } from "../../support/stage-2-attempt.ts";
import { finishStageThree, stageThree, stageThreeAttempt, type StageThreeAttempt, stageTwoRun } from "../../support/stage-3-attempt.ts";
import { stagedSnapshotRef } from "../../support/staged-run.ts";

// Stage 3 collect and each exports request save the gaps that their tool records
// require (DB5), and the receipt of the action names the file with its SHA-256. The
// snapshot has no package manifest, so Stage 2 skips Knip and the symbol mentions are
// skipped. src/invoice.ts names a declaration file that the snapshot does not hold.
// Each record conforms to its generated contract (cookbook/interfaces/producer-run-records.tsp).
const app = { path: "app.ts", text: "export const value = 1;\n" };
const invoice = { path: "src/invoice.ts", text: "/// <reference path=\"./env.d.ts\" />\nexport type Invoice = { id: string };\n" };
const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true })).compile({ $ref: "RequiredGaps.json" });
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
// The required gap of the skipped symbol mentions, and of the missing declaration file of the exports record of src/invoice.ts.
const mentionsGap = { id: "s3-check-symbol-mentions-gap-001", kind: "tool-outcome", subjectRefs: [stagedSnapshotRef],
  reason: "The symbol mentions are skipped: Knip did not run, so they cover no reported export or type. " +
    "The normal Knip run of s2-check-knip-runs was skipped. The production Knip run of s2-check-knip-runs was skipped.",
  evidenceRefs: ["s3-check-file@symbol-mentions.json"] };
const exportsGap = { id: "s3-check-exports-001-gap-001", kind: "missing-compiler-input", subjectRefs: ["src/invoice.ts", "src/env.d.ts"],
  reason: "src/invoice.ts names src/env.d.ts in a reference path directive, but the snapshot does not hold that file.",
  evidenceRefs: ["s3-check-file@exports-001.json#/gaps/0"] };

let scratch = "";
let stageTwoWork = "";

beforeAll(() => {
  scratch = makeScratch();
  stageTwoWork = stageTwoRun(scratch, [app, invoice]);
});

afterAll(() => removeScratch(scratch));

function newAttempt(name: string): StageThreeAttempt {
  const folder = join(scratch, name);
  mkdirSync(folder);
  return stageThreeAttempt(stageTwoWork, folder);
}

function succeeded(result: CommandResult): void {
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
}

// Runs start and collect of a new attempt.
function collected(name: string): StageThreeAttempt {
  const attempt = newAttempt(name);
  for (const action of ["start", "collect"]) succeeded(stageThree(attempt, ["stage-3", action]));
  return attempt;
}

const savedFile = (attempt: StageThreeAttempt, name: string): Buffer => readFileSync(join(attempt.folder, name));
const savedJson = (attempt: StageThreeAttempt, name: string): JsonRecord => JSON.parse(savedFile(attempt, name).toString("utf8")) as JsonRecord;

describe("the required gaps of Stage 3 collect", () => {
  test("collect saves the gap of the skipped symbol mentions, its receipt names the record, and the map proposes its ID", () => {
    const attempt = collected("collect");
    const record = savedJson(attempt, "required-gaps.json");
    expect(record).toEqual({ formatVersion: 1, gaps: [mentionsGap] });
    expect(structure(record)).toBe(true);
    const digest = sha256(savedFile(attempt, "required-gaps.json"));
    expect((savedJson(attempt, "operator-collect.json").digests as JsonRecord)["required-gaps.json"]).toBe(digest);
    expect((savedJson(attempt, "artifact-map.json").artifacts as JsonRecord)["s3-check-file@required-gaps.json"])
      .toEqual({ path: "evidence/s3-check/required-gaps.json", sha256: digest });
  }, 60_000);

  test("the review prompt lists the required gaps of collect and asks for their exact copy", () => {
    const attempt = collected("prompt");
    const prompt = savedFile(attempt, "review-prompt.md").toString("utf8");
    expect(prompt).toContain("The required gaps of collect are in\ns3-check-file@required-gaps.json:\n" +
      JSON.stringify({ formatVersion: 1, gaps: [mentionsGap] }, null, 2) + "\n");
    expect(prompt).toContain("Copy each required gap into gaps exactly");
    expect(prompt).not.toContain("{{");
  }, 60_000);
});

describe("the required gaps of a Stage 3 exports request", () => {
  test("an exports request saves one required gap for each gap of its record, and its receipt and message name the file", () => {
    const attempt = collected("exports");
    const result = stageThree(attempt, ["stage-3", "exports", invoice.path]);
    const [record, gaps] = ["exports-001.json", "exports-001.required-gaps.json"];
    expect(result).toEqual({ status: 0, stderr: "", stdout: `Saved s3-check-file@${record} at ${join(attempt.folder, record)} ` +
      `(SHA-256 ${sha256(savedFile(attempt, record))}). Listed 1 exports of src/invoice.ts and 1 gaps. Saved the required gaps as ` +
      `s3-check-file@${gaps} at ${join(attempt.folder, gaps)}; the entry analysis copies each one exactly.\n` });
    expect(savedJson(attempt, gaps)).toEqual({ formatVersion: 1, gaps: [exportsGap] });
    expect(structure(savedJson(attempt, gaps))).toBe(true);
    expect(savedJson(attempt, "operator-exports-001.json").digests)
      .toEqual({ [record]: sha256(savedFile(attempt, record)), [gaps]: sha256(savedFile(attempt, gaps)) });
  }, 60_000);

  test("the finalizer registers the required-gaps files of collect and of the exports request", () => {
    const attempt = newAttempt("published");
    const results = finishStageThree(attempt, () => {}, [], [invoice.path]);
    expect({ exports: results["exports-1"]?.status, finish: results.finish?.status, stderr: results.finish?.stderr })
      .toEqual({ exports: 0, finish: 0, stderr: "" });
    const run = parse(readFileSync(join(attempt.work, "run.yaml"), "utf8")) as { artifacts: Record<string, { path: string }> };
    for (const name of ["required-gaps.json", "exports-001.required-gaps.json"])
      expect(run.artifacts[`s3-check-file@${name}`]?.path).toBe(`evidence/s3-check/${name}`);
  }, 60_000);
});
