import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../../../cookbook/interfaces/generated/contracts.schema.json";
import type { ExtraFile } from "../../fixtures/stage-4-publication/fixture.ts";
import { collectedAttempt } from "../../support/collected-attempt.ts";
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
