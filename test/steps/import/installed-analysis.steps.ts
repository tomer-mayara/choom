import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import {
  type AnalysisObservation,
  prepareInstalledAnalysis, reportFacts, restoreInstalledConfig, runInstalledAnalysis,
  setFailedConfig, setRunningConfig, updateInstalledSource, withInstalledRepository,
} from "../../support/import/installed-analysis.ts";
import { fixture, type ImportWorld } from "../../support/import/world.ts";

interface InstalledAnalysisWorld extends ImportWorld {
  firstAnalysis?: AnalysisObservation;
  secondAnalysis?: AnalysisObservation;
}

Given("an installed analysis repository has a local dependency-cruiser 18.7.2 installation",
  { timeout: 60_000 }, async function (this: InstalledAnalysisWorld) {
    await prepareInstalledAnalysis(fixture(this));
  });

Given("the real analyzer exits unsuccessfully after writing report bytes", function (this: InstalledAnalysisWorld) {
  setFailedConfig(fixture(this));
});

Given("the real analyzer starts a child process and waits", function (this: InstalledAnalysisWorld) {
  setRunningConfig(fixture(this));
});

When("the installed application analyzes the repository before and after a source import changes",
  { timeout: 60_000 }, async function (this: InstalledAnalysisWorld) {
    await withInstalledRepository(this, async (session) => {
      this.firstAnalysis = await runInstalledAnalysis(session);
      await updateInstalledSource(session.project);
      this.secondAnalysis = await runInstalledAnalysis(session);
    });
  });

When("the installed application analyzes the repository through native operations",
  { timeout: 60_000 }, async function (this: InstalledAnalysisWorld) {
    this.firstAnalysis = await withInstalledRepository(this, runInstalledAnalysis);
  });

When("the installed application cancels the analysis after the child process starts",
  { timeout: 60_000 }, async function (this: InstalledAnalysisWorld) {
    await withInstalledRepository(this, async (session) => {
      this.firstAnalysis = await runInstalledAnalysis(session, true);
      await restoreInstalledConfig(session.project);
      this.secondAnalysis = await runInstalledAnalysis(session);
    });
  });

Then("the second completed report includes the new import and its error finding", function (this: InstalledAnalysisWorld) {
  assert.ok(this.secondAnalysis);
  const report = reportFacts(this.secondAnalysis);
  assert.equal(report.importsTarget, true);
  assert.equal(report.ruleFinding, true);
});

Then("the first completed report has neither the import nor the finding", function (this: InstalledAnalysisWorld) {
  assert.ok(this.firstAnalysis);
  const report = reportFacts(this.firstAnalysis);
  assert.equal(report.importsTarget, false);
  assert.equal(report.ruleFinding, false);
});

Then("both analyses remove their private report files without using a persistent cache", function (this: InstalledAnalysisWorld) {
  for (const analysis of [this.firstAnalysis, this.secondAnalysis]) {
    assert.ok(analysis);
    assert.equal(analysis.privateReportRemoved, true);
    assert.equal(analysis.cacheExists, false);
    assert.equal(reportFacts(analysis).cacheDisabled, true);
  }
});

Then("the native analysis fails without returning a report", function (this: InstalledAnalysisWorld) {
  assert.ok(this.firstAnalysis);
  assert.equal(this.firstAnalysis.wroteReport, true);
  const { outcome } = this.firstAnalysis;
  assert.equal(outcome.status, "failure");
  assert.equal(outcome.code, "execution-failed");
  assert.equal(Object.hasOwn(outcome, "reportJson"), false);
});

Then("the failed analysis removes its private report file", function (this: InstalledAnalysisWorld) {
  assert.equal(this.firstAnalysis?.privateReportRemoved, true);
});

Then("the native analysis ends as cancelled after removing its child process and private report file",
  function (this: InstalledAnalysisWorld) {
    assert.ok(this.firstAnalysis);
    const { ready, cancellation, outcome, analyzerStopped, childStopped, privateReportRemoved } = this.firstAnalysis;
    assert.equal(ready, true, "Cancellation must start after the real child writes its readiness marker");
    assert.equal(cancellation?.status, "success");
    assert.equal(outcome.status, "cancelled");
    assert.equal(Object.hasOwn(outcome, "reportJson"), false);
    assert.equal(analyzerStopped, true);
    assert.equal(childStopped, true);
    assert.equal(privateReportRemoved, true);
  });

Then("the installed application can run another analysis in the same repository session", function (this: InstalledAnalysisWorld) {
  assert.ok(this.secondAnalysis);
  assert.equal(this.secondAnalysis.outcome.status, "completed");
  assert.equal(this.secondAnalysis.privateReportRemoved, true);
});
