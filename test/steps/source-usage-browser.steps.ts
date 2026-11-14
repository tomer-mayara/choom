import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { fixtureItem, proposed } from "../support/baseline-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { enrichedBaseline } from "../support/interface-documentation-fixtures.ts";
import { invalidSourceUsage, sourceUsageBaseline } from "../support/source-usage-fixtures.ts";

interface SourceBrowserWorld extends World {
  page?: Page;
  sourceDirectory?: string;
  sourceCamera?: string;
  sourceNodes?: string[];
}
function page(world: SourceBrowserWorld): Page { assert.ok(world.page); return world.page; }
async function save(world: SourceBrowserWorld, data: unknown) {
  world.sourceDirectory ??= await mkdtemp(join(tmpdir(), "choom-source-usage-"));
  const path = join(world.sourceDirectory, "baseline.yaml");
  await writeFile(path, stringify(data, { aliasDuplicateObjects: false }));
  return path;
}
async function open(world: SourceBrowserWorld, data: unknown) {
  await page(world).setViewportSize({ width: 1280, height: 800 });
  const driver = new BaselineBrowserDriver(page(world));
  await driver.open();
  await driver.openBaseline(await save(world, data));
  await expect(page(world).getByText("Baseline ready.", { exact: true })).toBeVisible();
}

Given("a source-use baseline is open in the viewer", async function (this: SourceBrowserWorld) {
  await open(this, sourceUsageBaseline());
});
When("the user opens Original source-use data in Baseline details", async function (this: SourceBrowserWorld) {
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
  const disclosure = page(this).getByRole("dialog").locator("summary").filter({ hasText: "Original source-use data" });
  await expect(disclosure).toHaveCount(1, { timeout: 1500 });
  await disclosure.click();
});
Then("every saved source-use value is readable", async function (this: SourceBrowserWorld) {
  const record = page(this).getByRole("dialog").locator("details[data-section='original-source-usage'] pre");
  await expect(record).toBeVisible();
  assert.deepEqual(JSON.parse(await record.innerText()), sourceUsageBaseline().sourceUsage);
});
Then("no permission-based unknown-consumer message is shown", async function (this: SourceBrowserWorld) {
  await expect(page(this).getByText(/unknown owners or allowed consumers/)).toHaveCount(0, { timeout: 1500 });
});
Given("a source-use baseline permits Admin but records Checkout as its consumer", async function (this: SourceBrowserWorld) {
  const input = sourceUsageBaseline();
  input.components.push({ ...structuredClone(fixtureItem(input.components)), id: "admin", name: "Admin" });
  fixtureItem(input.interfaces).allowedConsumers = proposed(["admin"]);
  await open(this, input);
});
When("the user selects all source-use connections", async function (this: SourceBrowserWorld) {
  await page(this).getByRole("radio", { name: "All", exact: true }).check();
});
Then("no Admin permission arrow or permission legend is shown", async function (this: SourceBrowserWorld) {
  await expect(page(this).locator('path[data-interface-arc][data-consumer-id="admin"]')).toHaveCount(0, { timeout: 1500 });
  await expect(page(this).getByText("Arrow: consumer may use the owner's interface.", { exact: true })).toHaveCount(0, { timeout: 1500 });
});
Given("an interface example is open with connection choices recorded", async function (this: SourceBrowserWorld) {
  await open(this, enrichedBaseline());
  const browser = page(this);
  await browser.getByRole("radio", { name: "All", exact: true }).check();
  await browser.getByRole("checkbox", { name: "Show self-connections", exact: true }).check();
  await browser.getByRole("button", { name: "Billing, billing", exact: true }).click();
  await browser.getByRole("region", { name: "Owned interfaces" }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
  await browser.getByRole("tab", { name: "Example", exact: true }).click();
  await expect(browser.getByRole("group", { name: "Example", exact: true })).toContainText("createInvoice(order)");
  this.sourceCamera = await browser.locator(".react-flow__viewport").getAttribute("style") ?? "";
  this.sourceNodes = await browser.locator(".react-flow__node").allTextContents();
});
When(/^the user opens source-use replacement with (.+)$/, async function (this: SourceBrowserWorld, defect: string) {
  await new BaselineBrowserDriver(page(this)).openBaseline(await save(this, invalidSourceUsage(defect).input));
  await expect(page(this).getByRole("alert")).toBeVisible();
});
Then("the old drawing, legend, inspection, example, and connection choices remain", async function (this: SourceBrowserWorld) {
  const browser = page(this);
  await expect(browser.getByRole("dialog", { name: "Interface details", exact: true })).toBeVisible();
  await expect(browser.getByRole("tab", { name: "Example", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(browser.getByRole("group", { name: "Example", exact: true })).toContainText("createInvoice(order)");
  await expect(browser.getByRole("radio", { name: "All", exact: true })).toBeChecked();
  await expect(browser.getByRole("checkbox", { name: "Show self-connections", exact: true })).toBeChecked();
  await expect(browser.getByText("Arrow: consumer may use the owner's interface.", { exact: true })).toBeVisible();
  assert.deepEqual(await browser.locator(".react-flow__node").allTextContents(), this.sourceNodes);
  assert.equal(await browser.locator(".react-flow__viewport").getAttribute("style"), this.sourceCamera);
});
Then("the source-use replacement failure names the affected field", async function (this: SourceBrowserWorld) {
  await expect(page(this).getByRole("alert")).toContainText("sourceUsage");
});
After({ tags: "@br-11a and @browser" }, async function (this: SourceBrowserWorld) {
  if (this.sourceDirectory) await rm(this.sourceDirectory, { recursive: true, force: true });
});
