import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import type { IsolationComparison, IsolationInput } from "@choom/baseline-model/contracts";
import { fixtureItem, comparisonInput, exceptionInput, historyTestInput, movedSiteInput, replacementInput, routeInput } from "../support/isolation-baselines.ts";

interface ComparisonWorld extends World {
  beforeFile: IsolationInput;
  afterFile: IsolationInput;
  comparison: IsolationComparison;
}

Given("History uses Configuration and the complete Before check found no path from History to Loader", function (this: ComparisonWorld) {
  this.beforeFile = comparisonInput("before");
});
When("After proves a direct import under the same rule and a call to the loader", async function (this: ComparisonWorld) {
  this.afterFile = comparisonInput("after");
  const { compareIsolation } = await import("../../packages/baseline-model/src/isolation-comparison.ts");
  this.comparison = compareIsolation(this.beforeFile, this.afterFile);
});
Then("one New violation shows the new path, call site and Before scope", function (this: ComparisonWorld) {
  const findings = this.comparison.findings.filter((finding) => finding.change === "New violation");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.after?.targetUnitId, "loader");
  assert.deepEqual(findings[0]?.after?.accessIds, ["history-loader-call", "history-loader-import"]);
  assert.deepEqual(findings[0]?.before?.coverageIds, ["history-loader-rule"]);
});

Given("a complete Before check found no such outside access", function () { /* The example supplies the rule and access kind. */ });
When(/^After records the new (.+) under (.+)$/, async function (this: ComparisonWorld, access: string, policy: string) {
  this.beforeFile = routeInput("before", access, policy);
  this.afterFile = routeInput("after", access, policy);
  const { compareIsolation } = await import("../../packages/baseline-model/src/isolation-comparison.ts");
  this.comparison = compareIsolation(this.beforeFile, this.afterFile);
});
Then(/^the finding identifies the actual target and says (.+)$/, function (this: ComparisonWorld, result: string) {
  assert.ok(this.comparison.findings.some((finding) => finding.change === result && finding.after?.callerUnitId === "history"
    && finding.after.targetUnitId === "loader" && finding.after.accessIds.some((id) => id.startsWith("history-loader-"))));
});

Given("Before proves a forbidden access and After fully covers the same check", function (this: ComparisonWorld) {
  this.beforeFile = routeInput("after", "deep import of a public operation", "an active public-path rule");
});
When("After proves the forbidden route is gone and records the permitted route", async function (this: ComparisonWorld) {
  this.afterFile = replacementInput();
  const { compareIsolation } = await import("../../packages/baseline-model/src/isolation-comparison.ts");
  this.comparison = compareIsolation(this.beforeFile, this.afterFile);
});
Then("the former access is a Resolved violation with evidence from both sides", function (this: ComparisonWorld) {
  const fixed = this.comparison.findings.find((f) => f.change === "Resolved violation");
  assert.ok(fixed?.before?.accessIds.length && fixed.after?.coverageIds.length);
  assert.ok(this.comparison.findings.some((f) => f.change === "Interface use changed" && f.after?.accessIds.length));
});

Given("Before and After identify the same forbidden crossing", function (this: ComparisonWorld) {
  this.beforeFile = comparisonInput("after", ({ boundaryReview: review }) => {
    review.accesses = review.accesses.filter((access) => access.id !== "history-loader-call");
  });
});
When("the original site moves and a second site is added", async function (this: ComparisonWorld) {
  this.afterFile = movedSiteInput(this.beforeFile.sha256);
  const { compareIsolation } = await import("../../packages/baseline-model/src/isolation-comparison.ts");
  this.comparison = compareIsolation(this.beforeFile, this.afterFile);
});
Then("one Existing violation lists both After sites and the Before site", function (this: ComparisonWorld) {
  const existing = this.comparison.findings.filter((f) => f.change === "Existing violation");
  assert.equal(existing.length, 1);
  assert.equal(existing[0]?.before?.accessIds.length, 1);
  assert.equal(existing[0]?.after?.accessIds.length, 2);
});

Given("an unchanged access and a new accepted exception naming its rule", function (this: ComparisonWorld) {
  this.beforeFile = comparisonInput("after");
  this.afterFile = exceptionInput();
});
When("I compare the two reviews", async function (this: ComparisonWorld) {
  const { compareIsolation } = await import("../../packages/baseline-model/src/isolation-comparison.ts");
  this.comparison = compareIsolation(this.beforeFile, this.afterFile);
});
Then("I see Policy or ownership changed and the exception", function (this: ComparisonWorld) {
  assert.ok(this.comparison.findings.some((f) => f.change === "Policy or ownership changed" && f.reason.includes("exception")));
  assert.ok(!this.comparison.findings.some((f) => f.change === "Resolved violation"));
});

Given("both scans have the same gap in Before and After coverage and After shows a forbidden call", function (this: ComparisonWorld) {
  this.afterFile = comparisonInput("partial");
  this.beforeFile = comparisonInput("before", ({ boundaryReview: review }) => {
    const check = fixtureItem(review.checks[0]);
    check.result = "unknown";
    if (this.afterFile.baseline.formatVersion === 6) check.coverage = structuredClone(fixtureItem(this.afterFile.baseline.boundaryReview.checks[0]).coverage);
  });
});
When("I compare the snapshots", async function (this: ComparisonWorld) {
  const { compareIsolation } = await import("../../packages/baseline-model/src/isolation-comparison.ts");
  this.comparison = compareIsolation(this.beforeFile, this.afterFile);
});
Then("the call is visible as first observed with Comparison limited", function (this: ComparisonWorld) {
  assert.ok(this.comparison.findings.some((f) => f.change === "Comparison limited" && f.reason.includes("First observed")
    && f.after?.accessIds.includes("history-loader-call")));
});
Then("the result does not claim a new violation or an all-clear", function (this: ComparisonWorld) {
  assert.ok(!this.comparison.complete && !this.comparison.findings.some((f) => f.change === "New violation"));
});

Given("a production caller becomes test-only and the member access is unchanged", function (this: ComparisonWorld) {
  this.beforeFile = comparisonInput("after");
  this.afterFile = historyTestInput();
});
When("I compare the files in Production", async function (this: ComparisonWorld) {
  const { compareIsolation } = await import("../../packages/baseline-model/src/isolation-comparison.ts");
  this.comparison = compareIsolation(this.beforeFile, this.afterFile);
});
Then("I see Left production scope on the Before side without a resolved-violation claim", function (this: ComparisonWorld) {
  assert.ok(this.comparison.findings.some((f) => f.change === "Left production scope" && f.before?.callerUnitId === "history"));
  assert.ok(!this.comparison.findings.some((f) => f.change === "Resolved violation"));
});
