import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import {
  installedAnalysisResources, restoreInstalledConfig, setFailedConfig, setRunningConfig, waitForInstalledChild,
} from "../../support/import/installed-analysis.ts";
import { installFixtureDependencies } from "../../support/import/installed-fixture.ts";
import { expectFailure, loadRepository, showNamed } from "../../support/import/interactions.ts";
import { PackagedImportDriver } from "../../support/import/packaged-driver.ts";
import { driver, fixture, type ImportWorld } from "../../support/import/world.ts";

async function prepareAnalyzer(world: ImportWorld, mode: "running" | "failed"): Promise<void> {
  assert.ok(world.installedDriver instanceof PackagedImportDriver);
  const project = fixture(world);
  await installFixtureDependencies(project);
  project.import("src/components/panel.ts", "packages/core/model/entity.ts");
  project.import("src/lib/format.ts", "packages/core/model/entity.ts");
  if (mode === "running") setRunningConfig(project);
  else setFailedConfig(project);
}

async function startRunningAnalysis(world: ImportWorld): Promise<void> {
  await prepareAnalyzer(world, "running");
  await loadRepository(world);
  const marker = await waitForInstalledChild(fixture(world));
  await world.attach(JSON.stringify({ installedAnalyzerBeforeCancellation: marker }), "application/json");
  for (const action of ["Load Repo", "Open Diagram"] as const) {
    assert.equal(await driver(world).actionEnabled(action), false, "A running installed analysis must exclude another load");
  }
}

async function assertAnalysisRemoved(world: ImportWorld, child: boolean): Promise<void> {
  const observation = await installedAnalysisResources(fixture(world));
  await world.attach(JSON.stringify({ installedAnalysisCleanup: observation }), "application/json");
  assert.equal(observation.analyzerStopped, true, "The actual analyzer process must stop");
  assert.equal(observation.privateReportRemoved, true, "The actual private report must be removed");
  assert.equal(observation.cacheExists, false, "Analysis must not leave a persistent cache");
  if (child) assert.equal(observation.childStopped, true, "The actual analyzer child must stop");
  else assert.equal(observation.wroteReport, true, "The failed analyzer must have written its incomplete report before exiting");
}

async function cancelRunningAnalysis(world: ImportWorld): Promise<void> {
  await driver(world).cancel();
  await expect.poll(async () => (await driver(world).view()).statuses.join(" ")).toContain("Load cancelled");
  await assertAnalysisRemoved(world, true);
}

Given("installed Choom has no Node runtime available", { timeout: 60_000 }, async function (this: ImportWorld) {
  assert.ok(this.installedDriver instanceof PackagedImportDriver);
  await this.installedDriver.close();
  this.installedDriver = new PackagedImportDriver(this, "unavailable");
  this.importDriver = this.installedDriver;
  await this.installedDriver.open();
});

Then("the failure explains how to make Node available to Choom", async function (this: ImportWorld) {
  await expectFailure(this, "Select an absolute Node executable or make Node available on the desktop application PATH");
});

Given("an installed repository analysis is running with a child process", { timeout: 60_000 }, async function (this: ImportWorld) {
  await startRunningAnalysis(this);
});

When("I cancel the installed repository load", { timeout: 30_000 }, async function (this: ImportWorld) {
  await driver(this).cancel();
});

Then("the analyzer and its child have stopped and their private report is removed", { timeout: 30_000 }, async function (this: ImportWorld) {
  await assertAnalysisRemoved(this, true);
});

Given("an installed repository load was cancelled after its analyzer started", { timeout: 60_000 }, async function (this: ImportWorld) {
  await showNamed(this, "Previous");
  await startRunningAnalysis(this);
  await cancelRunningAnalysis(this);
});

Given("the repository analyzer configuration has been corrected", async function (this: ImportWorld) {
  await restoreInstalledConfig(fixture(this));
});

Given("the repository analyzer stops after writing an incomplete report", { timeout: 60_000 }, async function (this: ImportWorld) {
  await prepareAnalyzer(this, "failed");
});

Then("the failed analyzer has stopped and its incomplete report is removed", { timeout: 30_000 }, async function (this: ImportWorld) {
  await assertAnalysisRemoved(this, false);
});

Given("an installed repository load failed because its analyzer stopped", { timeout: 60_000 }, async function (this: ImportWorld) {
  await showNamed(this, "Previous");
  await prepareAnalyzer(this, "failed");
  await loadRepository(this);
  await expectFailure(this, "repository analysis");
  await assertAnalysisRemoved(this, false);
});

Given("a saved diagram has invalid UTF-8 bytes", async function (this: ImportWorld) {
  await writeFile(fixture(this).savedPath, Buffer.from([0xff, 0xfe, 0x00]));
});

Given("a saved diagram has an unsupported schema version", async function (this: ImportWorld) {
  fixture(this).document.name = "Invalid";
  fixture(this).document.schemaVersion = 2;
  await fixture(this).writeDocument();
});

When("I open the invalid saved diagram", { timeout: 30_000 }, async function (this: ImportWorld) {
  await driver(this).openDocument(fixture(this).savedPath);
});
