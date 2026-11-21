import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { stringify } from "yaml";
import { makeScratch, removeScratch, runCli } from "../../packages/producer/test/support/commands.ts";
import {
  decisionFileYaml, llmCallRecord, smallRunBaselinePath, writeSmallCompletedRun,
} from "../../packages/producer/test/support/completed-run.ts";
import { baselineCodec } from "../../src/lib/baseline-yaml.ts";
import { boundaryFixture } from "../support/boundary-baseline.ts";

interface DecisionWorld extends World {
  boundaryScratch?: string;
  original: string;
  decision: string;
  work: string;
  versionPath: string;
}

After({ tags: "@a1-3" }, function (this: DecisionWorld) {
  if (this.boundaryScratch) removeScratch(this.boundaryScratch);
});

Given("a reviewed baseline and a valid decision that changes a boundary policy", function (this: DecisionWorld) {
  this.boundaryScratch = makeScratch();
  this.work = join(this.boundaryScratch, "run");
  mkdirSync(this.work);
  const baseline = { ...boundaryFixture(), id: "baseline-check" };
  this.original = stringify(baseline);
  writeSmallCompletedRun(this.work, [
    { path: smallRunBaselinePath, text: this.original },
    { path: "evidence/llm-call.yaml", text: llmCallRecord("Fixture reviewer") },
  ]);
  this.decision = join(this.boundaryScratch, "policy.yaml");
  const run = { root: this.boundaryScratch, work: this.work, baselineId: baseline.id, baselinePath: smallRunBaselinePath };
  writeFileSync(this.decision, decisionFileYaml(run, [{ action: "correct", itemId: "config-api", field: "allowedConsumers",
    oldValue: null, newValue: ["collector"] }]));
});

When("the producer makes the next baseline for that snapshot", function (this: DecisionWorld) {
  const decide = runCli(["baseline", "decide", "--run", this.work, this.decision]);
  assert.equal(decide.status, 0, decide.stderr);
  const next = runCli(["baseline", "next", "--run", this.work, "--decisions", "decisions-001"]);
  assert.equal(next.status, 0, next.stderr);
  this.versionPath = join(this.work, (JSON.parse(next.stdout) as { path: string }).path);
});

Then("the new review says Needs refresh and its old verdict cannot support a diff", function (this: DecisionWorld) {
  const result = baselineCodec.decode(readFileSync(this.versionPath, "utf8"));
  assert.equal(result.status, "success", JSON.stringify(result));
  assert.equal(result.baseline.formatVersion, 6);
  assert.equal(result.baseline.boundaryReview.status, "needs-refresh");
  assert.deepEqual(result.baseline.boundaryReview.checks, boundaryFixture().boundaryReview.checks);
  assert.deepEqual(result.baseline.interfaces[0]?.allowedConsumers.value, ["collector"]);
});

Then("the original baseline still opens with its original evidence", function (this: DecisionWorld) {
  const bytes = readFileSync(join(this.work, smallRunBaselinePath), "utf8");
  assert.equal(bytes, this.original);
  const result = baselineCodec.decode(bytes);
  assert.equal(result.status, "success");
  assert.equal(result.baseline.formatVersion, 6);
  assert.equal(result.baseline.boundaryReview.status, "current");
  assert.deepEqual(result.baseline.boundaryReview.sourceNotes, boundaryFixture().boundaryReview.sourceNotes);
});
