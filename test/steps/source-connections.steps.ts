import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { sourceConnectionBaseline } from "../support/source-connection-fixtures.ts";

interface ConnectionWorld extends World {
  page?: Page;
  sourceConnectionDirectory?: string;
  sourceConnectionDriver?: BaselineBrowserDriver;
  sourceConnectionPositions?: string[];
  sourceConnectionPath?: string | null;
}

function page(world: ConnectionWorld) { assert.ok(world.page); return world.page; }
const curves = (world: ConnectionWorld) => page(world).locator("path[data-interface-arc]");
const panel = (world: ConnectionWorld) => page(world).getByRole("dialog", { name: "Interface details", exact: true });
const positions = (world: ConnectionWorld) => page(world).locator(".react-flow__node").evaluateAll((nodes) =>
  nodes.map((node) => (node as HTMLElement).style.transform));

async function replace(world: ConnectionWorld, example: string) {
  assert.ok(world.sourceConnectionDirectory && world.sourceConnectionDriver);
  const baseline = sourceConnectionBaseline(example);
  const file = join(world.sourceConnectionDirectory, `${example.replaceAll(" ", "-")}.yaml`);
  await writeFile(file, stringify(baseline, { aliasDuplicateObjects: false }));
  await world.sourceConnectionDriver.openBaseline(file);
  await expect(page(world).getByText("Baseline ready.", { exact: true })).toBeVisible();
  await expect(page(world).locator(".react-flow__node")).toHaveCount(baseline.components.length);
}

Given("the {string} source connection baseline is open", async function (this: ConnectionWorld, example: string) {
  this.sourceConnectionDirectory = await mkdtemp(join(tmpdir(), "choom-source-connections-"));
  this.sourceConnectionDriver = new BaselineBrowserDriver(page(this));
  await this.sourceConnectionDriver.open();
  await replace(this, example);
  this.sourceConnectionPositions = await positions(this);
});
When("the user replaces it with the {string} source connection baseline", async function (this: ConnectionWorld, example: string) {
  await replace(this, example);
  await expect(page(this).getByRole("radio", { name: "Selected", exact: true })).toBeChecked();
  await expect(page(this).getByRole("checkbox", { name: "Show self-connections", exact: true })).not.toBeChecked();
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});
When(/^the user selects source (?:consumer|provider) (Checkout|Billing)$/, async function (this: ConnectionWorld, name: string) {
  await page(this).getByRole("button", { name: `${name}, ${name.toLowerCase()}`, exact: true }).click();
});
When("the user shows all source connections", async function (this: ConnectionWorld) {
  await page(this).getByRole("radio", { name: "All", exact: true }).check();
});
When("the user enables source self connections", async function (this: ConnectionWorld) {
  await page(this).getByRole("checkbox", { name: "Show self-connections", exact: true }).check();
});
When("the user inspects the source Invoice API", async function (this: ConnectionWorld) {
  const button = page(this).locator('[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="checkout"]');
  await button.focus();
  await page(this).keyboard.press("Enter");
  await expect(panel(this).getByRole("heading", { name: "Invoice API", exact: true })).toBeVisible();
});
When("an invalid source baseline replacement is opened", async function (this: ConnectionWorld) {
  assert.ok(this.sourceConnectionDirectory && this.sourceConnectionDriver);
  const file = join(this.sourceConnectionDirectory, "invalid.yaml");
  await writeFile(file, "formatVersion: 3\ninvalid: true\n");
  await this.sourceConnectionDriver.openBaseline(file);
  await expect(page(this).getByRole("button", { name: "Retry", exact: true })).toBeVisible();
});
When("the user moves Billing and fits the source drawing", async function (this: ConnectionWorld) {
  this.sourceConnectionPath = await curves(this).first().getAttribute("d");
  const header = page(this).getByRole("button", { name: "Billing, billing", exact: true });
  await header.focus();
  await page(this).keyboard.press("ArrowRight");
  await page(this).getByRole("button", { name: "Fit View", exact: true }).click();
});
Then("the source drawing has {int} arrows", async function (this: ConnectionWorld, count: number) {
  await expect(curves(this)).toHaveCount(count, { timeout: 1500 });
  await expect(page(this).locator("button[data-interface-label]")).toHaveCount(count, { timeout: 1500 });
});
Then("its invoice arrow points from Checkout to Billing with a complete accessible name", async function (this: ConnectionWorld) {
  await expect(curves(this)).toHaveAttribute("data-consumer-id", "checkout");
  await expect(curves(this)).toHaveAttribute("data-owner-id", "billing");
  await expect(page(this).locator("button[data-interface-label]")).toHaveAccessibleName(
    "Invoice API, invoice-api; consumer Checkout, checkout; owner Billing, billing");
});
Then("the source legend explains saved use and excluded references", async function (this: ConnectionWorld) {
  await expect(page(this).getByText("Arrow: component uses the interface in saved source.", { exact: true })).toBeVisible();
  await expect(page(this).getByText("The canvas shows application and tooling value references. Type and test references stay in details. Source use does not prove runtime execution.", { exact: true })).toBeVisible();
  await expect(page(this).getByText(/unknown owners or allowed consumers/)).toHaveCount(0);
});
Then("the legacy connection legend still describes permission", async function (this: ConnectionWorld) {
  await expect(page(this).getByText("Arrow: consumer may use the owner's interface.", { exact: true })).toBeVisible();
  await expect(page(this).getByText("Arrow: component uses the interface in saved source.", { exact: true })).toHaveCount(0);
});
Then("Access rule still names Admin as permitted", async function (this: ConnectionWorld) {
  const rule = panel(this).locator('details[data-section="interface-access-rule"]');
  await rule.locator("summary").click();
  await expect(rule).toContainText("Permitted components:");
  await expect(rule).toContainText("Admin");
});
Then("source connection choices have not moved components", async function (this: ConnectionWorld) {
  assert.deepEqual(await positions(this), this.sourceConnectionPositions);
});
Then("the source arrows remain attached to their moved provider", async function (this: ConnectionWorld) {
  assert.notDeepEqual(await positions(this), this.sourceConnectionPositions);
  assert.notEqual(await curves(this).first().getAttribute("d"), this.sourceConnectionPath);
  await expect(curves(this)).toHaveCount(2);
  for (const curve of await curves(this).all()) await expect(curve).toHaveAttribute("data-owner-id", "billing");
});
Then("the source Invoice API details stay open", async function (this: ConnectionWorld) {
  await expect(panel(this).getByRole("heading", { name: "Invoice API", exact: true })).toBeVisible();
});
After({ tags: "@br-11b" }, async function (this: ConnectionWorld) {
  if (this.sourceConnectionDirectory) await rm(this.sourceConnectionDirectory, { recursive: true, force: true });
});
