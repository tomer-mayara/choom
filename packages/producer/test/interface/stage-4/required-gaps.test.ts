import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../../../cookbook/interfaces/generated/contracts.schema.json";
import { type ExtraFile, publishStageFour, stageFourPublication, type StageFourPublication, writeStageFourPacket }
  from "../../fixtures/stage-4-publication/fixture.ts";
import { collectedAttempt } from "../../support/collected-attempt.ts";
import type { CommandResult } from "../../support/commands.ts";
import { folderState } from "../../support/producer-record.ts";
import { rangeIn } from "../../support/source-ranges.ts";

// Stage 4 collect saves the gaps that its candidate records require (DB5) in
// required-gaps.json, its receipt names the file with its SHA-256, and the review
// prompt lists the gaps. Here the Vite settings name a page with a value that only
// the code knows, so the behavior entry candidates list a settings gap. src/app.ts
// names a declaration file that the snapshot does not hold, so both candidate records
// list that compiler input. The record conforms to its generated contract
// (cookbook/interfaces/producer-run-records.tsp).
type Json = Record<string, unknown>;

const id = "s4-check";
const viteFile: ExtraFile = { path: "vite.config.mts", text: "import { defineConfig } from 'vite';\n\n" +
  "export default defineConfig({ build: { rollupOptions: { input: ['index.html', process.env.ADMIN_PAGE] } } });\n" };
const appFile: ExtraFile = { path: "src/app.ts", text: "/// <reference path=\"./env.d.ts\" />\nexport const app = 1;\n" };
const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true })).compile({ $ref: "RequiredGaps.json" });
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const collected = collectedAttempt([appFile, viteFile]);

const [valueStart] = rangeIn(String(viteFile.text), "process.env.ADMIN_PAGE");
const missingFile = "src/app.ts names src/env.d.ts in a reference path directive, but the snapshot does not hold that file.";
const inputGap = (gapId: string, evidence: string): Json => ({ id: `${id}-${gapId}`, kind: "missing-compiler-input",
  subjectRefs: ["src/app.ts", "src/env.d.ts"], reason: missingFile, evidenceRefs: [`${id}-file@${evidence}`] });
const requiredGaps = [
  { id: `${id}-behavior-entry-gap-001`, kind: "unknown-settings-value", subjectRefs: [viteFile.path],
    reason: "The behavior entry rule vite-build-rollup-options-input (version 1) cannot read the value at line " +
      `${valueStart.line}, column ${valueStart.column} of ${viteFile.path}. The value at the property path is not a string ` +
      "literal, so it is known only at run time.", evidenceRefs: [`${id}-file@behavior-entry-candidates.json#/gaps/0`] },
  inputGap("behavior-entry-gap-002", "behavior-entry-candidates.json#/gaps/1"),
  inputGap("resource-access-gap-001", "resource-access-candidates.json#/gaps/0"),
];
const attemptFile = (name: string): Buffer => readFileSync(join(collected.attempt().attempt, name));

describe("the required gaps of Stage 4 collect", () => {
  test("collect saves a gap for each gap of the candidate records, and its receipt names the record", () => {
    expect(collected.saved("required-gaps.json")).toEqual({ formatVersion: 1, gaps: requiredGaps });
    expect(structure(collected.saved("required-gaps.json"))).toBe(true);
    expect((collected.saved("operator-collect.json").digests as Json)["required-gaps.json"])
      .toBe(sha256(attemptFile("required-gaps.json")));
  });

  test("the review prompt lists the required gaps and asks for their exact copy", () => {
    const prompt = attemptFile("review-prompt.md").toString("utf8");
    expect(prompt).toContain(`Required gaps (${id}-file@required-gaps.json): `);
    expect(prompt).toContain("\n```json\n" + JSON.stringify(requiredGaps, null, 2) + "\n```\n");
    expect(prompt).toContain("Copy each gap below into the gaps of entry-analysis.yaml and discovery.proposed.yaml exactly");
    expect(prompt).toContain(`an ID that starts with ${id}-behavior-entry-gap- or ${id}-resource-access-gap-.`);
  });
});

// The Stage 4/5 publisher refuses a packet that leaves out or changes a required gap,
// or that gives another question or gap a reserved ID. The packets of the fixture copy
// each required gap. check writes nothing, so each test writes its own packet for the
// attempt above.
type Records = Record<string, Record<string, unknown>>;
const copyAdvice = `Copy each gap of ${id}-file@required-gaps.json exactly.`;
const extraFiles = [appFile, viteFile];

// Changes the gaps of the entry analysis and of the discovery in the same way, as the two lists must be the same.
const changeGaps = (change: (gaps: Json[]) => Json[]) => (records: Records): void => {
  for (const name of ["entry-analysis.yaml", "discovery.proposed.yaml"]) {
    const record = records[name] as { gaps: Json[] };
    record.gaps = change(record.gaps);
  }
};
const reservedQuestion = (records: Records): void => {
  for (const name of ["entry-analysis.yaml", "discovery.proposed.yaml"]) Object.assign(records[name] ?? {}, { questions: [
    { id: `${id}-resource-access-gap-002`, subjectRefs: ["src/app.ts"], text: "Which file declares the environment?",
      evidenceRefs: ["launch-settings"] }] });
};

function checkedPacket(changeRecords?: (records: Records) => void): CommandResult {
  return publishStageFour(writeStageFourPacket(collected.attempt(), extraFiles, undefined, changeRecords), "check");
}

function withPublication(use: (fixture: StageFourPublication) => void): void {
  const fixture = stageFourPublication(undefined, extraFiles);
  try {
    use(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

describe("the Stage 4/5 publisher with the required gaps of collect", () => {
  // The subjects of a missing compiler input name src/env.d.ts, which the snapshot does not hold (DB1, detail b).
  test("checks a packet that copies each required gap, also a gap that names a file that the snapshot does not hold", () => {
    const result = checkedPacket();
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
    // The gap of the Stage 3 fixture and the three required gaps.
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "stage4-review-verified", gaps: 4 });
  }, 60_000);

  test.each([
    ["leaves out a required gap", changeGaps((gaps) => gaps.filter((gap) => gap.id !== `${id}-behavior-entry-gap-002`)),
      `The entry analysis leaves out the required gap ${id}-behavior-entry-gap-002. ${copyAdvice}`],
    ["changes a required gap", changeGaps((gaps) => gaps.map((gap) =>
      gap.id === `${id}-resource-access-gap-001` ? { ...gap, reason: "The environment file is missing." } : gap)),
    `The entry analysis changes the required gap ${id}-resource-access-gap-001. ${copyAdvice}`],
    ["gives a question a reserved ID", reservedQuestion,
      `The ID ${id}-resource-access-gap-002 is reserved for the required gaps of ${id}-file@required-gaps.json. Use a different ID.`],
  ])("refuses a packet that %s, and writes nothing", (_name, change, message) => {
    const before = folderState(collected.attempt().work);
    expect(checkedPacket(change)).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
    expect(folderState(collected.attempt().work)).toEqual(before);
  }, 60_000);

  test("publishes a packet that copies each required gap, and verify checks the gaps again", () => {
    withPublication((fixture) => {
      expect(JSON.parse(publishStageFour(fixture, "finish").stdout)).toMatchObject({ status: "stage4-published", gaps: 4 });
      const verified = publishStageFour(fixture, "verify");
      expect({ status: verified.status, stderr: verified.stderr }).toEqual({ status: 0, stderr: "" });
    });
  }, 60_000);

  // A required-gaps.json whose receipt digest was changed with it, so that only the comparison with the candidate records finds it.
  test("refuses a required-gaps.json that differs from the gaps that the candidate records give", () => {
    withPublication((fixture) => {
      const read = (name: string): Json => JSON.parse(readFileSync(join(fixture.attempt, name), "utf8")) as Json;
      const saved = read("required-gaps.json");
      const text = JSON.stringify({ ...saved, gaps: (saved.gaps as Json[]).slice(1) }, null, 2) + "\n";
      writeFileSync(join(fixture.attempt, "required-gaps.json"), text);
      const receipt = read("operator-collect.json");
      writeFileSync(join(fixture.attempt, "operator-collect.json"), JSON.stringify({ ...receipt,
        digests: { ...receipt.digests as Json, "required-gaps.json": sha256(Buffer.from(text)) } }, null, 2) + "\n");
      expect(publishStageFour(fixture, "check")).toEqual({ status: 1, stdout: "", stderr: `The required gaps in ${id}-file@` +
        "required-gaps.json differ from the gaps that the candidate records give. Use a new attempt.\n" });
    });
  }, 60_000);
});
