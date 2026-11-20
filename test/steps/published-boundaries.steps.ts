import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { InstalledBaselineDriver } from "../support/baseline-viewer/installed-driver.ts";

const path = fileURLToPath(new URL("../fixtures/baseline-viewer/published-boundary-after.yaml", import.meta.url));
const hash = async () => createHash("sha256").update(await readFile(path)).digest("hex");

interface PublishedWorld extends World {
  page?: Page;
  installedBaselineDriver?: InstalledBaselineDriver;
  boundaryDigest: string;
}

Given("the browser has the published Stage 6 boundary baseline", async function (this: PublishedWorld) {
  assert.ok(this.page);
  this.boundaryDigest = await hash();
  await new BaselineBrowserDriver(this.page).open();
});
Given("the installed viewer has the published Stage 6 boundary baseline", { timeout: 60_000 }, async function (this: PublishedWorld) {
  this.boundaryDigest = await hash();
  this.installedBaselineDriver = new InstalledBaselineDriver(this);
  await this.installedBaselineDriver.open();
});
When("the reader selects that fixed file", { timeout: 60_000 }, async function (this: PublishedWorld) {
  if (this.page) await new BaselineBrowserDriver(this.page).openBaseline(path);
  else { assert.ok(this.installedBaselineDriver); await this.installedBaselineDriver.openBaseline(path); }
});
Then("Configuration shows its loader operation and Local collector as a caller", async function (this: PublishedWorld) {
  if (this.page) {
    const configuration = this.page.locator('button[data-component-id="configuration"]');
    await expect(configuration).toContainText("GlobalConfigLoader.load");
    await configuration.click();
    await expect(this.page.getByRole("region", { name: "Provides", exact: true })).toContainText("Local collector");
  } else {
    const driver = this.installedBaselineDriver;
    assert.ok(driver);
    await expect.poll(async () => (await driver.view()).nodes.find(({ id }) => id === "configuration")?.text).toContain("GlobalConfigLoader.load");
    await driver.clickControl('button[data-component-id="configuration"]', "Configuration");
    await expect.poll(async () => (await driver.panel()).panelText).toContain("Local collector");
  }
});
Then("the test adapter appears only after opt-in with its Test component label", async function (this: PublishedWorld) {
  if (this.page) {
    const adapter = this.page.locator('button[data-component-id="test"]');
    await expect(adapter).toHaveCount(0);
    await this.page.getByRole("switch", { name: "Show non-production" }).check();
    await expect(adapter).toContainText("Test component");
    await expect(adapter).toHaveAccessibleName(/Test component/);
  } else {
    const driver = this.installedBaselineDriver;
    assert.ok(driver);
    assert.equal((await driver.view()).nodes.some(({ id }) => id === "test"), false);
    await driver.clickControl("#production-scope-switch", "Show non-production");
    await expect.poll(async () => (await driver.view()).nodes.find(({ id }) => id === "test")?.text).toContain("Test component");
    await driver.clickControl('button[data-component-id="test"][aria-label*="Test component"]', "Test component");
    await expect.poll(async () => (await driver.panel()).panelText).toContain("Test component");
  }
});
Then("the published boundary file keeps its original digest", async function (this: PublishedWorld) {
  assert.equal(await hash(), this.boundaryDigest);
  await this.attach(JSON.stringify({ file: "published-boundary-after.yaml", sha256: this.boundaryDigest }), "application/json");
});
