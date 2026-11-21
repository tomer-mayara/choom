import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { selectedBaselineText, pending } from "../support/baseline-workflow-fixtures.ts";
import type { LoadWorkflowSnapshot } from "../../src/architecture/workspace-view.ts";
import type { SelectedBaseline } from "../../src/architecture/load-workflow.ts";
import { boundaryBytes, boundaryFixture } from "../support/boundary-baseline.ts";
import { comparisonWorkflow } from "../support/comparison-workflow.ts";

interface PairWorld extends World {
  pair: ReturnType<typeof comparisonWorkflow>;
  prior: LoadWorkflowSnapshot["comparison"];
  outcome?: Awaited<ReturnType<PairWorld["pair"]["workflow"]["openComparison"]>>;
  reading?: ReturnType<typeof pending<Awaited<ReturnType<SelectedBaseline["read"]>>>>;
  opening?: ReturnType<PairWorld["pair"]["workflow"]["openComparison"]>;
}

Given("a current baseline and an earlier file with the same project key and local baseline ID", async function (this: PairWorld) {
  this.pair = comparisonWorkflow();
  assert.equal((await this.pair.workflow.openBaseline()).status, "success");
});

When("I select the earlier file to compare", async function (this: PairWorld) {
  assert.equal((await this.pair.workflow.openComparison()).status, "success");
});

Then("I see the two file identities, the direction and the evidence for the selected finding", function (this: PairWorld) {
  const { comparison, current } = this.pair.workflow.getSnapshot();
  assert.ok(comparison && current);
  assert.equal(current.baseline.id, comparison.before.baseline.id);
  const digest = (example: "before" | "after") => createHash("sha256").update(boundaryBytes(example)).digest("hex");
  assert.deepEqual([comparison.before.sha256, current.sha256], [digest("before"), digest("after")]);
  const finding = comparison.result.findings.find(finding => finding.change === "New violation");
  assert.ok(finding);
  assert.ok(finding.after?.accessIds.includes("history-loader-call"));
  assert.ok(finding.before?.coverageIds.includes("history-loader-rule"));
});

async function openPair(world: PairWorld): Promise<void> {
  world.pair = comparisonWorkflow();
  assert.equal((await world.pair.workflow.openBaseline()).status, "success");
  assert.equal((await world.pair.workflow.openComparison()).status, "success");
  world.prior = world.pair.workflow.getSnapshot().comparison;
  assert.ok(world.prior?.result.findings[0]);
}

Given("an open comparison with a selected finding", async function (this: PairWorld) {
  await openPair(this);
});

When("I choose a Before file for a different project", async function (this: PairWorld) {
  const before = boundaryFixture("before");
  before.boundaryReview.identity.projectKey = "Other project";
  this.pair.dependencies.selectEarlierBaseline = async () => selectedBaselineText(JSON.stringify(before));
  this.outcome = await this.pair.workflow.openComparison();
});

Then("I see a project mismatch and retain the valid pair and selection", function (this: PairWorld) {
  assert.partialDeepStrictEqual(this.outcome, { status: "failure", code: "project-mismatch" });
  assert.strictEqual(this.pair.workflow.getSnapshot().comparison, this.prior);
});

Given("an open comparison and a pending replacement Before file", async function (this: PairWorld) {
  await openPair(this);
  const started = pending<void>();
  const reading = pending<Awaited<ReturnType<SelectedBaseline["read"]>>>();
  this.reading = reading;
  this.pair.dependencies.selectEarlierBaseline = async () => ({ read: () => { started.resolve(); return reading.promise; } });
  this.opening = this.pair.workflow.openComparison();
  await started.promise;
});

When("I cancel the read and it finishes late", async function (this: PairWorld) {
  assert.equal((await this.pair.workflow.openBaseline()).status, "busy");
  await this.pair.workflow.cancel();
  this.outcome = await this.opening;
  this.reading?.resolve(await selectedBaselineText(boundaryBytes("after")).read(new AbortController().signal));
  await Promise.resolve();
});

Then("the original pair stays visible and Choom reports cancellation", function (this: PairWorld) {
  assert.equal(this.outcome?.status, "cancelled");
  const snapshot = this.pair.workflow.getSnapshot();
  assert.equal(snapshot.state.lastOutcome?.status, "cancelled");
  assert.strictEqual(snapshot.comparison, this.prior);
});
