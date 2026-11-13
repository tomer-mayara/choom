import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { baselineExample, fixtureItem } from "../support/baseline-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { enrichedBaseline, excessiveDocumentation } from "../support/interface-documentation-fixtures.ts";

const expect = browserExpect.configure({ timeout: 2_000 });

interface DocumentationBrowserWorld extends World {
  page?: Page;
  documentationDirectory?: string;
  documentationCandidate?: unknown;
  documentationLimit?: string;
  documentationNodes?: string[];
  documentationCamera?: string;
}

function page(world: DocumentationBrowserWorld): Page {
  assert.ok(world.page);
  return world.page;
}

async function save(world: DocumentationBrowserWorld, value: unknown): Promise<string> {
  assert.ok(world.documentationDirectory);
  const path = join(world.documentationDirectory, "baseline.yaml");
  await writeFile(path, stringify(value));
  return path;
}

async function inspectInvoice(world: DocumentationBrowserWorld): Promise<void> {
  const browser = page(world);
  await browser.getByRole("button", { name: "Billing, billing", exact: true }).click();
  await browser.getByRole("region", { name: "Owned interfaces" }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
  await expect(browser.getByRole("dialog", { name: "Interface details", exact: true })).toBeVisible();
}

async function open(world: DocumentationBrowserWorld, enriched: boolean): Promise<void> {
  const browser = page(world);
  await browser.setViewportSize({ width: 1280, height: 800 });
  world.documentationDirectory = await mkdtemp(join(tmpdir(), "choom-documentation-"));
  const driver = new BaselineBrowserDriver(browser);
  await driver.open();
  await driver.openBaseline(await save(world, enriched ? enrichedBaseline() : baselineExample()));
  await expect(browser.getByText("Baseline ready.", { exact: true })).toBeVisible();
  await inspectInvoice(world);
  world.documentationNodes = await browser.locator(".react-flow__node").allTextContents();
  world.documentationCamera = await browser.locator(".react-flow__viewport").getAttribute("style") ?? "";
}

Given(/^a readable baseline is open and a documented candidate exceeds (.+)$/, async function (this: DocumentationBrowserWorld, limit: string) {
  await open(this, false);
  this.documentationLimit = limit;
  this.documentationCandidate = excessiveDocumentation(limit);
});
Given("a supported documented baseline is open for inspection", async function (this: DocumentationBrowserWorld) {
  await open(this, true);
});
When("the user opens the documented candidate", async function (this: DocumentationBrowserWorld) {
  await new BaselineBrowserDriver(page(this)).openBaseline(await save(this, this.documentationCandidate));
});
Then("the viewer names the exceeded documentation limit", async function (this: DocumentationBrowserWorld) {
  const expected: Record<string, RegExp> = {
    "entries per interface": /limit is 32 entries per interface/,
    "examples per entry": /limit is 8 examples per entry/,
    "descriptive text bytes": /limit is 8192 bytes/,
    "sample text bytes": /limit is 16384 bytes/,
    "total documentation bytes": /documentation limit is 2097152 UTF-8 bytes/,
  };
  assert.ok(this.documentationLimit);
  const message = expected[this.documentationLimit];
  assert.ok(message);
  await expect(page(this).getByRole("alert")).toContainText(message);
});
Then("the previous view and interface inspection remain open", async function (this: DocumentationBrowserWorld) {
  const browser = page(this);
  await expect(browser.getByRole("heading", { name: "baseline-example", exact: true })).toBeVisible();
  await expect(browser.getByRole("dialog", { name: "Interface details", exact: true })).toContainText("Invoice API");
  assert.deepEqual(await browser.locator(".react-flow__node").allTextContents(), this.documentationNodes);
  assert.equal(await browser.locator(".react-flow__viewport").getAttribute("style"), this.documentationCamera);
});
When("the user opens its interface's Original record disclosure", async function (this: DocumentationBrowserWorld) {
  await page(this).getByRole("dialog").locator("details[data-section='original-interface-record'] summary").click();
});
Then("all saved interface values and statement statuses are readable", async function (this: DocumentationBrowserWorld) {
  const record = page(this).getByRole("dialog").locator("details[data-section='original-interface-record'] pre");
  await expect(record).toBeVisible();
  assert.deepEqual(JSON.parse(await record.innerText()), fixtureItem(enrichedBaseline().interfaces));
});
When("the user opens a new documented baseline with the same IDs", async function (this: DocumentationBrowserWorld) {
  const replacement = enrichedBaseline();
  fixtureItem(replacement.components, 1).name = "Updated billing";
  fixtureItem(replacement.interfaces).documentation.summary.value = "Updated invoice contract.";
  await new BaselineBrowserDriver(page(this)).openBaseline(await save(this, replacement));
});
Then("the new values replace the view and close the old inspection", async function (this: DocumentationBrowserWorld) {
  await expect(page(this).getByRole("button", { name: "Updated billing, billing", exact: true })).toBeVisible();
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});
After({ tags: "@browser and @br-10a" }, async function (this: DocumentationBrowserWorld) {
  if (this.documentationDirectory) await rm(this.documentationDirectory, { recursive: true, force: true });
});
