import assert from "node:assert/strict";
import { access, realpath, rm } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { Given, When } from "@cucumber/cucumber";
import { chromium } from "@playwright/test";
import { BrowserImportDriver } from "../../support/import/browser-driver.ts";
import { PackagedImportDriver } from "../../support/import/packaged-driver.ts";
import { quoted } from "../../support/import/fixtures.ts";
import { installFixtureDependencies } from "../../support/import/installed-fixture.ts";
import { expectComponents, exportCurrent, loadRepository, showNamed } from "../../support/import/interactions.ts";
import { driver, fixture, type ImportWorld } from "../../support/import/world.ts";

Given("Choom is installed independently of its development checkout", { timeout: 60_000 }, async function (this: ImportWorld) {
  await driver(this).open();
});

Given(/^a repository has supported local tools and only declared components (".+")$/,
  { timeout: 60_000 }, async function (this: ImportWorld, list: string) {
    fixture(this).declare(quoted(list));
    await installFixtureDependencies(fixture(this));
  });

Given("{string} and {string} import {string}", function (this: ImportWorld, first: string, second: string, target: string) {
  fixture(this).import(first, target);
  fixture(this).import(second, target);
});

Given(/^installed Choom exported only components (".+")$/,
  { timeout: 60_000 }, async function (this: ImportWorld, list: string) {
    fixture(this).declare(quoted(list));
    fixture(this).facts.installedExportBeforeOpen = true;
    await installFixtureDependencies(fixture(this));
  });

Given("their import evidence is {string} and {string} to {string}", function (this: ImportWorld, first: string, second: string, target: string) {
  fixture(this).import(first, target);
  fixture(this).import(second, target);
});

Given("the source repository and analyzer tools are unavailable to the viewer", function (this: ImportWorld) {
  fixture(this).controls.require("source-free-viewer");
});

When(/^I open that export in (the browser|installed desktop Choom)$/, { timeout: 60_000 }, async function (this: ImportWorld, viewer: string) {
  assert.ok(this.installedDriver);
  this.importDriver = this.installedDriver;
  await loadRepository(this);
  await expectComponents(this, fixture(this).declarations);
  const exported = await exportCurrent(this);
  const sourceRoot = await realpath(fixture(this).root);
  const ownedDirectory = await realpath(fixture(this).directory);
  const sourceLocation = relative(ownedDirectory, sourceRoot);
  assert.ok(sourceLocation && sourceLocation !== ".." && !sourceLocation.startsWith(`..${sep}`) && !isAbsolute(sourceLocation));
  const exportLocation = relative(sourceRoot, await realpath(exported));
  assert.ok(exportLocation === ".." || exportLocation.startsWith(`..${sep}`) || isAbsolute(exportLocation), "The completed export must be outside the source repository");
  await rm(sourceRoot, { recursive: true });
  await assert.rejects(access(sourceRoot), { code: "ENOENT" });
  assert.ok(this.installedDriver instanceof PackagedImportDriver);
  await this.installedDriver.close();
  this.installedDriver = undefined;
  if (viewer === "the browser") {
    const endpoint = process.env.CHOOM_PACKAGED_BROWSER_ENDPOINT;
    assert.ok(endpoint, "The packaged runner must supply its owned Chromium server endpoint");
    this.viewerBrowser = await chromium.connect(endpoint);
    this.page = await this.viewerBrowser.newPage();
    this.desktopImport = false;
    this.importDriver = new BrowserImportDriver(this);
  } else {
    this.installedDriver = new PackagedImportDriver(this, "unavailable");
    this.importDriver = this.installedDriver;
  }
  await driver(this).openDocument(exported);
  if (viewer === "the browser") {
    assert.ok(this.page);
    assert.equal(await this.page.evaluate(() => "__TAURI_INTERNALS__" in window), false,
      "The production browser viewer must have no native analyzer boundary");
  }
  fixture(this).controls.observe("source-free-viewer", viewer === "the browser"
    ? "The production browser viewer opened the export after the source repository and its local analyzer were removed; the page has no native analyzer access"
    : "A fresh installed process opened the export after the source repository and local analyzer were removed, with its PATH verified as an empty owned directory");
  this.actualDocument = undefined;
  this.exportedPath = undefined;
});

Given("installed Choom displays {string}", { timeout: 60_000 }, async function (this: ImportWorld, name: string) {
  await showNamed(this, name);
});
