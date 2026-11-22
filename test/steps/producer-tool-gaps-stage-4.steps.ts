import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { After, Given } from "@cucumber/cucumber";
import { collectedStageFour, type ExtraFile, type StageFourAttempt, type StageFourPublication, writeStageFourPacket }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import type { LeftOutGapWorld } from "./producer-tool-gaps.steps.ts";

// The required gaps of the Stage 4 candidate records, through the producer command
// line. The Stage 4 publication fixture prepares a run after Stage 3 and runs Stage 4
// start and collect, and then writes a review packet that copies each required gap of
// collect. producer-recovery.steps.ts publishes the draft, checks that a refused draft
// changes no file of the run, and removes the run folder. producer-tool-gaps.steps.ts
// checks the refusal.
interface StageFourGapsWorld extends LeftOutGapWorld {
  stageFourCollection?: StageFourAttempt;
  stageFourRun?: StageFourPublication;
}
type Json = Record<string, unknown>;

// The Vite settings of a web app with two pages. The build input names the main page
// with a string literal, and the admin page with a template that the code completes,
// so the settings rule of the Vite input cannot read that value without running the file.
const settingsFile: ExtraFile = { path: "web/vite.config.ts", text: ["import { defineConfig } from 'vite';", "",
  "const pages = ['admin'];", "", "export default defineConfig({",
  "  build: { rollupOptions: { input: { main: 'index.html', admin: `${pages[0]}/index.html` } } },", "});", ""].join("\n") };

// A JSON file that the Stage 4 attempt saved.
const attemptJson = (attempt: StageFourAttempt, name: string): Json =>
  JSON.parse(readFileSync(join(attempt.attempt, name), "utf8")) as Json;

function currentCollection(world: StageFourGapsWorld): StageFourAttempt {
  assert.ok(world.stageFourCollection, "Collect the Stage 4 source evidence first.");
  return world.stageFourCollection;
}

After({ tags: "@producer" }, function (this: StageFourGapsWorld) {
  if (this.stageFourCollection) rmSync(this.stageFourCollection.root, { recursive: true, force: true });
});

Given("a Stage 4 collection whose behavior entry candidates record a settings value that is not a literal",
  { timeout: 120_000 }, function (this: StageFourGapsWorld) {
    this.stageFourCollection = collectedStageFour([settingsFile]);
    const record = attemptJson(this.stageFourCollection, "behavior-entry-candidates.json");
    assert.deepEqual((record.gaps as Json[]).map(({ kind, path, expression }) => ({ kind, path, expression })),
      [{ kind: "unknown-settings-value", path: settingsFile.path, expression: "`${pages[0]}/index.html`" }]);
  });

// The review copies every other required gap into the entry analysis and the discovery.
Given("a Stage 4 review that leaves out the required gap of that value", function (this: StageFourGapsWorld) {
  const collection = currentCollection(this);
  const value = `${String(attemptJson(collection, "behavior-entry-candidates.json").attemptId)}-file@behavior-entry-candidates.json#/gaps/0`;
  const gap = (attemptJson(collection, "required-gaps.json").gaps as Json[])
    .find(({ evidenceRefs }) => isDeepStrictEqual(evidenceRefs, [value]));
  assert.ok(gap, `No required gap cites the settings value ${value}.`);
  const leftOut = gap.id as string;
  this.leftOutGap = leftOut;
  this.stageFourRun = writeStageFourPacket(collection, [settingsFile], undefined, (records) => {
    for (const name of ["entry-analysis.yaml", "discovery.proposed.yaml"]) {
      const reviewed = records[name] as { gaps: Json[] };
      reviewed.gaps = reviewed.gaps.filter(({ id }) => id !== leftOut);
    }
  });
});
