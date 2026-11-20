import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { systemEntryDetailsBaseline } from "../support/system-entry-details-fixtures.ts";

interface EntryDetailsWorld extends World { page?: Page; entryDetailsDirectory?: string }
function page(world: EntryDetailsWorld): Page { assert.ok(world.page); return world.page; }
function panel(world: EntryDetailsWorld) { return page(world).getByRole("dialog"); }

Given("the system-entry details baseline is open at {int} pixels", async function (this: EntryDetailsWorld, width: number) {
  const browser = page(this);
  this.entryDetailsDirectory = await mkdtemp(join(tmpdir(), "choom-entry-details-"));
  const path = join(this.entryDetailsDirectory, "baseline.yaml");
  await writeFile(path, stringify(systemEntryDetailsBaseline(), { aliasDuplicateObjects: false }));
  await browser.setViewportSize({ width, height: 640 });
  const driver = new BaselineBrowserDriver(browser);
  await driver.open();
  await driver.openHistoricalInventory(path);
  await expect(browser.getByText("Baseline ready.", { exact: true })).toBeVisible();
});

When("the reader opens Checkout component details", async function (this: EntryDetailsWorld) {
  await page(this).getByRole("button", { name: "Checkout, checkout", exact: true }).click();
  await expect(panel(this)).toHaveAccessibleName("Component details");
});

Then("the Startup and External groups contain all 21 entries in saved order", async function (this: EntryDetailsWorld) {
  const groups = panel(this).getByRole("region", { name: "System entry points" });
  await expect(groups.getByRole("heading", { name: "Startup (1)" })).toBeVisible();
  await expect(groups.getByRole("heading", { name: "External (20)" })).toBeVisible();
  const rows = groups.locator("li[data-system-entry-id]");
  await expect(rows).toHaveCount(21);
  assert.deepEqual(await rows.evaluateAll((items) => items.map((item) => item.getAttribute("data-system-entry-id"))), [
    "checkout-cli", ...Array.from({ length: 20 }, (_, index) => `checkout-route-${String(index + 1).padStart(2, "0")}`),
  ]);
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last()).toBeInViewport();
  const content = panel(this).getByLabel("Record content");
  assert.equal(await content.evaluate((element) => element.scrollWidth <= element.clientWidth), true,
    "The entry list must fit inside the inspector at this viewport width.");
});

Then("each entry shows its saved path and evidence", async function (this: EntryDetailsWorld) {
  const rows = panel(this).locator("li[data-system-entry-id]");
  await expect(rows.first()).toContainText("checkout/main.ts");
  await expect(rows.first()).toContainText("reviewed-cli-start");
  for (let index = 1; index <= 20; index++) {
    const number = String(index).padStart(2, "0");
    await expect(rows.nth(index)).toContainText(`HTTP POST /orders/${number}`);
    await expect(rows.nth(index)).toContainText(`checkout/routes/route-${number}.ts`);
    await expect(rows.nth(index)).toContainText(`reviewed-route-${number}`);
  }
});

Then("the first external entry shows its saved source range", async function (this: EntryDetailsWorld) {
  await expect(panel(this).locator('[data-system-entry-id="checkout-route-01"]')).toContainText("Lines 3–14");
});

When("the reader follows the first external entry by keyboard", async function (this: EntryDetailsWorld) {
  const link = panel(this).getByRole("button", { name: "Open Refund invoice in Invoice API" });
  await link.focus();
  await link.press("Enter");
});

Then("Refund invoice is selected under Interface entries for Billing", async function (this: EntryDetailsWorld) {
  const details = panel(this);
  await expect(details).toHaveAccessibleName("Interface details");
  await expect(details.getByRole("group", { name: "Provider" })).toContainText("Billing");
  const entries = details.getByRole("region", { name: "Interface entries" });
  await expect(entries.getByRole("button", { name: "Refund invoice, refund-invoice" })).toHaveAttribute("aria-pressed", "true");
  await expect(details.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
});

When("the reader goes Back", async function (this: EntryDetailsWorld) {
  await panel(this).getByRole("button", { name: "Back" }).click();
});

Then("Checkout component details and the selected entry regain focus", async function (this: EntryDetailsWorld) {
  const details = panel(this);
  await expect(details).toHaveAccessibleName("Component details");
  await expect(details.getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "Open Refund invoice in Invoice API" })).toBeFocused();
});

Then("the unlinked third external entry has no navigation control", async function (this: EntryDetailsWorld) {
  const row = panel(this).locator('[data-system-entry-id="checkout-route-03"]');
  await expect(row).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
  await expect(row.getByRole("link")).toHaveCount(0);
});

When("the reader follows the second external entry", async function (this: EntryDetailsWorld) {
  await panel(this).getByRole("button", { name: "Open Invoice API overview" }).click();
});

Then("the Invoice API overview opens", async function (this: EntryDetailsWorld) {
  const details = panel(this);
  await expect(details).toHaveAccessibleName("Interface details");
  await expect(details.getByRole("heading", { name: "Invoice API", exact: true })).toBeVisible();
  await expect(details.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
});

After({ tags: "@ep-06 and @browser" }, async function (this: EntryDetailsWorld) {
  if (this.entryDetailsDirectory) await rm(this.entryDetailsDirectory, { recursive: true, force: true });
});
