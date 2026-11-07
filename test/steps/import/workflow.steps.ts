import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Given, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { stringify } from "yaml";
import { BrowserImportDriver } from "../../support/import/browser-driver.ts";
import { actualDocument, expectFailure, exportCurrent, loadRepository, openSaved, showNamed, startExport } from "../../support/import/interactions.ts";
import { driver, fixture, type ImportWorld } from "../../support/import/world.ts";

Given("I have not loaded a repository", async function (this: ImportWorld) { await driver(this).open(); });
Given("I use Choom with only a keyboard", function (this: ImportWorld) { this.keyboardImport = true; });

Given("{string} is my selected repository", async function (this: ImportWorld, name: string) {
  await fixture(this).materialize();
  this.selectedRepository = fixture(this).root;
  fixture(this).facts.selectedName = name;
  await driver(this).selectRepository(this.selectedRepository);
});

When("I cancel choosing another repository", async function (this: ImportWorld) { await driver(this).selectRepository(null); });

for (const pattern of ["I load the repository", "I load the selected directory", "I load the repository again", "I load that repository", "I load that repository in installed Choom"]) {
  When(pattern, { timeout: 30_000 }, async function (this: ImportWorld) { await loadRepository(this); });
}

When("I retry the repository load", { timeout: 30_000 }, async function (this: ImportWorld) { await loadRepository(this, "retry"); });

for (const pattern of ["I open the document", "I open that document", "I open the document in the browser", "I open the file"]) {
  When(pattern, { timeout: 30_000 }, async function (this: ImportWorld) { await openSaved(this); });
}

When("I reopen that export", { timeout: 30_000 }, async function (this: ImportWorld) {
  await openSaved(this);
  const exported = await exportCurrent(this);
  this.actualDocument = undefined;
  await driver(this).openDocument(exported);
  this.exportedPath = undefined;
});

Given("the component declarations and reported imports have not changed", { timeout: 30_000 }, async function (this: ImportWorld) {
  fixture(this).import("src/components/panel.ts", "packages/core/model/entity.ts");
  await loadRepository(this);
  this.previousDocument = structuredClone(await actualDocument(this));
  this.exportedPath = undefined;
});

Given("a previous diagram has no import from {string} to {string}", { timeout: 30_000 }, async function (this: ImportWorld, source: string, target: string) {
  fixture(this).document.relationships = [];
  fixture(this).facts.sourceComponent = source;
  fixture(this).facts.targetComponent = target;
  await openSaved(this, "Previous");
});

Given("{string} is displayed", { timeout: 30_000 }, async function (this: ImportWorld, name: string) { await showNamed(this, name); });

Given("the destination contains a diagram named {string}", async function (this: ImportWorld, name: string) {
  const document = { ...fixture(this).document, name };
  await writeFile(fixture(this).destination, stringify(document));
  fixture(this).facts.originalDestination = await readFile(fixture(this).destination, "utf8");
});

Given("I am exporting the diagram named {string}", { timeout: 30_000 }, async function (this: ImportWorld, name: string) {
  await showNamed(this, name);
  fixture(this).facts.exportName = name;
});

Given("I approve replacing it with the current diagram named {string}", { timeout: 30_000 }, async function (this: ImportWorld, name: string) {
  await showNamed(this, name);
  fixture(this).facts.replaceApproved = true;
  fixture(this).controls.require("save-replacement-approved");
});

When("I decline to replace the existing file", { timeout: 30_000 }, async function (this: ImportWorld) {
  assert.ok(await driver(this).actionEnabled("Export Diagram"));
  const browser = driver(this);
  assert.ok(browser instanceof BrowserImportDriver);
  await browser.cancelExport();
});

When("the export fails before replacement", { timeout: 30_000 }, async function (this: ImportWorld) {
  fixture(this).facts.storageFailure = "export-before-replace";
  fixture(this).controls.require("export-write-failed");
  await fixture(this).materialize();
  startExport(this);
  await expectFailure(this, "export");
});

Given("an export of {string} is in progress", { timeout: 30_000 }, async function (this: ImportWorld, name: string) {
  await showNamed(this, name);
  assert.ok(await driver(this).actionEnabled("Export Diagram"));
  const browser = driver(this);
  assert.ok(browser instanceof BrowserImportDriver);
  browser.holdNextExport();
  startExport(this);
  await expect.poll(() => fixture(this).controls.wasObserved("export-save-held")).toBe(true);
  assert.equal(this.exportSettled, false);
});

Given("{string} becomes the current diagram", { timeout: 30_000 }, async function (this: ImportWorld, name: string) {
  assert.equal(this.exportSettled, false);
  await showNamed(this, name);
  assert.equal(this.exportSettled, false, "The original export must still be pending after the new diagram finishes loading");
});

When("the export finishes", { timeout: 30_000 }, async function (this: ImportWorld) {
  assert.equal(this.exportSettled, false);
  const browser = driver(this);
  assert.ok(browser instanceof BrowserImportDriver);
  browser.releaseExport();
  assert.ok(this.exportOperation);
  const outcome = await this.exportOperation;
  assert.equal(outcome.status, "fulfilled");
  if (outcome.status === "fulfilled") this.exportedPath = outcome.value;
  this.actualDocument = undefined;
});

When("I export its diagram", { timeout: 30_000 }, async function (this: ImportWorld) {
  await loadRepository(this);
  await exportCurrent(this);
});

Given(/^(a repository analysis|a repository load|a saved diagram load|cancellation of a load) is in progress$/, { timeout: 30_000 }, async function (this: ImportWorld, operation: string) {
  fixture(this).facts.holdOperation = operation;
  const event: Record<string, string> = {
    "a repository analysis": "analysis-held", "a repository load": "repository-load-held",
    "a saved diagram load": "saved-load-held", "cancellation of a load": "cancellation-cleanup-held",
  };
  const required = event[operation];
  assert.ok(required);
  fixture(this).controls.require(required);
  if (operation === "a saved diagram load") await openSaved(this);
  else await loadRepository(this);
  if (operation === "cancellation of a load") await driver(this).cancel();
  await expect.poll(async () => (await driver(this).view()).statuses.join(" ")).not.toBe("");
});

When("I cancel the load", async function (this: ImportWorld) {
  fixture(this).controls.require("cancellation-cleanup-completed");
  await driver(this).cancel();
});

When(/^I request (another repository load|a repository load|a saved diagram load|another saved diagram load)$/, async function (this: ImportWorld, operation: string) {
  this.requestedAction = operation.includes("repository") ? "Load Repo" : "Open Diagram";
  await driver(this).open();
});

Given("analysis for {string} has completed but its diagram is not yet ready", { timeout: 30_000 }, async function (this: ImportWorld, name: string) {
  fixture(this).facts.holdOperation = "layout";
  fixture(this).facts.nextName = name;
  fixture(this).rootManifest().name = name;
  fixture(this).controls.require("analysis-completed-before-layout");
  fixture(this).controls.require("layout-held");
  await loadRepository(this);
});

Given("the load of {string} was cancelled", { timeout: 30_000 }, async function (this: ImportWorld, name: string) {
  fixture(this).facts.holdOperation = name;
  fixture(this).rootManifest().name = name;
  fixture(this).controls.require("cancelled-operation-held");
  fixture(this).controls.require("cancellation-cleanup-completed");
  await loadRepository(this);
  await driver(this).cancel();
});

Given("{string} has since finished loading", { timeout: 30_000 }, async function (this: ImportWorld, name: string) { await showNamed(this, name); });

When("a result from {string} becomes available", async function (this: ImportWorld, name: string) {
  fixture(this).facts.releasedOperation = name;
  fixture(this).controls.require("late-result-delivered");
  const browser = driver(this);
  assert.ok(browser instanceof BrowserImportDriver);
  await browser.releaseLateResult();
});

Given(/^the new load cannot (save its repository analysis|read its saved document|decode its saved document|arrange its component cards)$/, function (this: ImportWorld, operation: string) {
  fixture(this).facts.storageFailure = operation;
  fixture(this).document.name = "Next";
  if (operation === "decode its saved document") fixture(this).document.schemaVersion = 2;
  else fixture(this).controls.require(`${operation}-failure-delivered`);
});

When("I load the new diagram", { timeout: 30_000 }, async function (this: ImportWorld) {
  if (fixture(this).facts.storageFailure === "save its repository analysis") await loadRepository(this);
  else await openSaved(this);
});

When("the repository load finishes", { timeout: 30_000 }, async function (this: ImportWorld) { await loadRepository(this); });

Given("my repository load failed because its root manifest was missing", { timeout: 30_000 }, async function (this: ImportWorld) {
  fixture(this).absentFiles.add("component.yaml");
  await loadRepository(this);
  await expectFailure(this, "manifest");
});

Given("the root manifest now declares only components {string}, {string}, and {string}", function (this: ImportWorld, root: string, workspace: string, core: string) {
  fixture(this).absentFiles.delete("component.yaml");
  fixture(this).declare([root, workspace, core]);
});

Given("access to the selected repository is denied", async function (this: ImportWorld) {
  fixture(this).facts.permissionDenied = true;
  fixture(this).controls.require("repository-read-denied");
});

Given("an export cleanup failure has blocked new loads", { timeout: 30_000 }, async function (this: ImportWorld) {
  fixture(this).facts.storageFailure = "export-cleanup";
  fixture(this).controls.require("export-cleanup-failed");
  startExport(this);
  await expectFailure(this, "cleanup");
  assert.equal(await driver(this).actionEnabled("Load Repo"), false);
  assert.equal(await driver(this).actionEnabled("Open Diagram"), false);
});

When("I retry document cleanup", async function (this: ImportWorld) {
  fixture(this).controls.require("export-cleanup-recovered");
  const browser = driver(this);
  assert.ok(browser instanceof BrowserImportDriver);
  await browser.retryCleanup();
});
