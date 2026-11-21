import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { stringify } from "yaml";
import { InstalledBaselineDriver, waitFor } from "../support/baseline-viewer/installed-driver.ts";
import { systemEntryDetailsBaseline } from "../support/system-entry-details-fixtures.ts";

interface InstalledEntryWorld extends World {
  entryDirectory: string;
  entryDriver: InstalledBaselineDriver;
  entryBaselinePath: string;
}

Given("the system-entry details baseline is available to installed Choom", { timeout: 60_000 },
  async function (this: InstalledEntryWorld) {
    this.entryDirectory = await mkdtemp(join(tmpdir(), "choom-installed-entry-details-"));
    this.entryBaselinePath = join(this.entryDirectory, "baseline.yaml");
    await writeFile(this.entryBaselinePath, stringify(systemEntryDetailsBaseline(), { aliasDuplicateObjects: false }));
    this.entryDriver = new InstalledBaselineDriver(this);
    await this.entryDriver.open();
  });

When("the reader opens its baseline and Checkout component", { timeout: 60_000 },
  async function (this: InstalledEntryWorld) {
    const baseline = systemEntryDetailsBaseline();
    await this.entryDriver.openHistoricalInventory(this.entryBaselinePath);
    await this.entryDriver.expectBaseline(baseline.id, baseline.components.map(({ id, name }) => [id, name]));
    await this.entryDriver.clickControl('.react-flow__node[data-id="checkout"] button[aria-haspopup="dialog"]', "Checkout");
    await waitFor(async () => (await this.entryDriver.panel()).panelTitle === "Component details", "Checkout details must open");
  });

Then("all 21 saved entries and paths are in the installed component details", { timeout: 30_000 },
  async function (this: InstalledEntryWorld) {
    const panel = await this.entryDriver.panel();
    assert.ok(panel.panelText.includes("Startup (1)"));
    assert.ok(panel.panelText.includes("External (20)"));
    assert.ok(panel.panelText.includes("checkout/main.ts"));
    for (let index = 1; index <= 20; index++) {
      const number = String(index).padStart(2, "0");
      assert.ok(panel.panelText.includes(`HTTP POST /orders/${number}`));
      assert.ok(panel.panelText.includes(`checkout/routes/route-${number}.ts`));
    }
    await this.entryDriver.capture("system-entry-details");
  });

When("the reader follows the first external entry", { timeout: 30_000 },
  async function (this: InstalledEntryWorld) {
    await this.entryDriver.clickControl('button[data-record-id="system-entry:checkout-route-01"]', "Refund invoice entry link");
  });

Then("the installed interface selects Refund invoice", { timeout: 30_000 },
  async function (this: InstalledEntryWorld) {
    await waitFor(async () => (await this.entryDriver.panel()).panelTitle === "Interface details", "The interface must open");
    assert.equal(await this.entryDriver.selectedEntry(), "Refund invoice, refund-invoice");
  });

Then("Back restores Checkout and the entry link focus", { timeout: 30_000 },
  async function (this: InstalledEntryWorld) {
    await this.entryDriver.clickControl('button[aria-label="Back"]', "Back");
    await waitFor(async () => {
      const panel = await this.entryDriver.panel();
      return panel.panelTitle === "Component details" && panel.focusedRecord === "system-entry:checkout-route-01";
    }, "Back must restore the component and focused entry link");
  });

After({ tags: "@ep-06 and @packaged", timeout: 30_000 }, async function (this: InstalledEntryWorld) {
  try { await this.entryDriver?.close(); }
  finally { if (this.entryDirectory) await rm(this.entryDirectory, { recursive: true, force: true }); }
});
