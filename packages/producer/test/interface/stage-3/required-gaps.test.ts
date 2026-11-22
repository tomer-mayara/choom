import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

  test("the finalizer publishes the copied required gaps and registers the required-gaps files of collect and of the request", () => {
    const attempt = newAttempt("published");
    const results = finishStageThree(attempt, () => {}, [], [invoice.path]);
    expect({ exports: results["exports-1"]?.status, finish: results.finish?.status, stderr: results.finish?.stderr })
      .toEqual({ exports: 0, finish: 0, stderr: "" });
    const run = parse(readFileSync(join(attempt.work, "run.yaml"), "utf8")) as { artifacts: Record<string, { path: string }> };
    for (const name of ["required-gaps.json", "exports-001.required-gaps.json"])
      expect(run.artifacts[`s3-check-file@${name}`]?.path).toBe(`evidence/s3-check/${name}`);
    const discovery = parse(readFileSync(join(attempt.work, "discovery.yaml"), "utf8")) as { gaps: JsonRecord[] };
    expect(discovery.gaps).toEqual(expect.arrayContaining([mentionsGap, exportsGap]));
    expect(stageThree(attempt, ["stage-3-finish", "verify"]).status).toBe(0);
  }, 60_000);
});

// The finalizer gives the required gaps again from the saved tool records, and refuses
// an analysis that leaves out or changes one, or that gives another gap a reserved ID.
describe("the Stage 3 finalizer and the required gaps of an exports request", () => {
  const copyEach = "Copy each gap of s3-check-file@exports-001.required-gaps.json exactly.";
  const ownGap = { id: "s3-check-exports-001-gap-002", kind: "deferral", subjectRefs: ["src/invoice.ts"], reason: "Not reviewed.",
    evidenceRefs: ["s3-check-file@exports-001.json"] };
  test.each([
    { name: "leaves out the required gap of the exports record", message: `The entry analysis leaves out the required gap ${exportsGap.id}. ${copyEach}`,
      change: (gaps: JsonRecord[]): JsonRecord[] => gaps.filter((gap) => gap.id !== exportsGap.id) },
    { name: "keeps only the subjects of the snapshot in the required gap", message: `The entry analysis changes the required gap ${exportsGap.id}. ${copyEach}`,
      change: (gaps: JsonRecord[]): JsonRecord[] => gaps.map((gap) => gap.id === exportsGap.id ? { ...gap, subjectRefs: ["src/invoice.ts"] } : gap) },
    // The copy check gives its message before the subject check reads the changed gap, whose
    // subject is a declaration file that the snapshot does not have.
    { name: "cites the whole exports record in the required gap", message: `The entry analysis changes the required gap ${exportsGap.id}. ${copyEach}`,
      change: (gaps: JsonRecord[]): JsonRecord[] => gaps.map((gap) => gap.id === exportsGap.id ? { ...gap, evidenceRefs: ["s3-check-file@exports-001.json"] } : gap) },
    { name: "gives another gap an ID that is reserved for the required gaps of the exports record",
      message: `The ID ${ownGap.id} is reserved for the required gaps of s3-check-file@exports-001.required-gaps.json. Use a different ID.`,
      change: (gaps: JsonRecord[]): JsonRecord[] => [...gaps, ownGap] },
  ])("refuses an analysis that $name, and leaves the drafts unchanged", ({ name, message, change }) => {
    const attempt = newAttempt(name.replaceAll(" ", "-"));
    const drafts = (): string[] => ["run.yaml", "discovery.yaml"].map((file) => readFileSync(join(attempt.work, file), "utf8"));
    const before = drafts();
    const results = finishStageThree(attempt, (packet) => { packet.analysis.gaps = change(packet.analysis.gaps as JsonRecord[]); },
      [], [invoice.path]);
    expect({ save: results["save-review"]?.status, status: results.finish?.status, stderr: results.finish?.stderr })
      .toEqual({ save: 0, status: 1, stderr: message + "\n" });
    expect(drafts()).toEqual(before);
  }, 60_000);

  // The finalizer gives the required gaps again from the saved exports record. Here the
  // required-gaps file of the request leaves out the gap, and its receipt names the new digest.
  test("refuses required gaps that differ from the gaps of the exports record, and leaves the drafts unchanged", () => {
    const attempt = newAttempt("changed-required-gaps");
    const before = readFileSync(join(attempt.work, "discovery.yaml"), "utf8");
    const results = finishStageThree(attempt, () => {
      const text = JSON.stringify({ formatVersion: 1, gaps: [] }, null, 2) + "\n";
      writeFileSync(join(attempt.folder, "exports-001.required-gaps.json"), text);
      const receipt = savedJson(attempt, "operator-exports-001.json");
      writeFileSync(join(attempt.folder, "operator-exports-001.json"), JSON.stringify({ ...receipt,
        digests: { ...receipt.digests as JsonRecord, "exports-001.required-gaps.json": sha256(Buffer.from(text)) } }));
    }, [], [invoice.path]);
    expect({ status: results.finish?.status, stderr: results.finish?.stderr }).toEqual({ status: 1,
      stderr: "The required gaps in s3-check-file@exports-001.required-gaps.json differ from the gaps that " +
        "s3-check-file@exports-001.json gives. Use a new attempt.\n" });
    expect(readFileSync(join(attempt.work, "discovery.yaml"), "utf8")).toBe(before);
  }, 60_000);
});
