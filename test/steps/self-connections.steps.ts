import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { selfConnectionBaseline } from "../support/connection-scope-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { unobscuredArcPoint } from "../support/interface-pointer.ts";

interface SelfWorld extends World {
  page?: Page;
  selfDirectory?: string;
  selfFile?: string;
  selfBytes?: string;
  selfCamera?: string | null;
  selfPositions?: string[];
  selfPanel?: string | null;
  selfPress?: { x: number; y: number };
}

const billing = ["invoice-api:checkout:billing", "invoice-api:reporting:billing", "checkout-status:billing:checkout"] as const;
const billingWithSelf = [billing[0], billing[1], "invoice-api:billing:billing", billing[2], "health:billing:billing"];
const all = [...billing, "identity-api:reporting:identity"];
const allWithSelf = [...billingWithSelf.slice(0, 4), "identity-api:reporting:identity", "health:billing:billing"];
const healthLoopName = "Health, health; consumer Billing, billing; owner Billing, billing";

function page(world: SelfWorld) { assert.ok(world.page); return world.page; }
function choice(world: SelfWorld) { return page(world).getByRole("checkbox", { name: "Show self-connections", exact: true }); }
function healthLoop(world: SelfWorld) {
  return page(world).getByRole("button", { name: healthLoopName, exact: true });
}

async function arcSet(world: SelfWorld, expected: readonly string[]) {
  for (const selector of ["path[data-interface-arc]", "button[data-interface-label]"]) {
    await expect.poll(() => page(world).locator(selector).evaluateAll((elements) => elements.map((element) =>
      ["interface-id", "consumer-id", "owner-id"].map((key) => element.getAttribute(`data-${key}`)).join(":"))), { timeout: 1500 }).toEqual(expected);
  }
}

async function remember(world: SelfWorld) {
  world.selfCamera = await page(world).locator(".react-flow__viewport").getAttribute("style");
  world.selfPositions = await page(world).locator(".react-flow__node").evaluateAll((elements) => elements.map((element) => (element as HTMLElement).style.transform));
  world.selfPanel = await page(world).getByRole("dialog").count() ? await page(world).getByRole("dialog").textContent() : null;
}

async function open(world: SelfWorld, select = false, self = false, mode = "Selected") {
  const browser = page(world);
  await browser.setViewportSize({ width: 1280, height: 800 });
  world.selfDirectory = await mkdtemp(join(tmpdir(), "choom-self-connections-"));
  world.selfFile = join(world.selfDirectory, "baseline.yaml");
  world.selfBytes = stringify(selfConnectionBaseline(), { aliasDuplicateObjects: false });
  await writeFile(world.selfFile, world.selfBytes);
  const viewer = new BaselineBrowserDriver(browser);
  await viewer.open();
  await viewer.openBaseline(world.selfFile);
  await expect(browser.getByRole("heading", { name: "self-connections", exact: true })).toBeVisible();
  if (select) await browser.getByRole("button", { name: "Billing, billing", exact: true }).click();
  if (mode === "All") await browser.getByRole("radio", { name: "All", exact: true }).check();
  if (self) await choice(world).check();
  await browser.mouse.move(8, 8);
  await remember(world);
}

async function fit(world: SelfWorld) {
  await page(world).getByRole("button", { name: "Fit View", exact: true }).click();
  await page(world).evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await remember(world);
}

async function selectHealth(world: SelfWorld) {
  const point = await unobscuredArcPoint(page(world).locator('path[data-interface-arc][data-interface-id="health"]'));
  await page(world).mouse.click(point.x, point.y);
}

async function holdAndHideHealth(world: SelfWorld) {
  world.selfPress = await unobscuredArcPoint(page(world).locator('path[data-interface-arc][data-interface-id="health"]'));
  await page(world).mouse.move(world.selfPress.x, world.selfPress.y);
  await page(world).mouse.down();
  await choice(world).focus();
  await page(world).keyboard.press("Space");
}

async function restoreAndReleaseHealth(world: SelfWorld) {
  assert.ok(world.selfPress);
  await page(world).keyboard.press("Space");
  await expect(page(world).locator('path[data-interface-arc][data-interface-id="health"]')).toHaveCount(1);
  await page(world).mouse.move(world.selfPress.x, world.selfPress.y);
  await page(world).mouse.up();
}

Given("the extended self-connection baseline is open", async function (this: SelfWorld) { await open(this); });
Given("Billing is selected with self-connections hidden", async function (this: SelfWorld) { await open(this, true); });
Given("Billing is selected with self-connections shown", async function (this: SelfWorld) { await open(this, true, true); });
Given("the extended drawing is in All mode with self-connections hidden", async function (this: SelfWorld) {
  await open(this, false, false, "All");
  await arcSet(this, all);
});
Given(/^the extended drawing is in (Selected|All) mode with self-connections shown$/, async function (this: SelfWorld, mode: string) { await open(this, true, true, mode); });
Given("the extended drawing fits in its canvas", async function (this: SelfWorld) { await fit(this); });
Given("Billing's Selected panel was closed with self-connections shown", async function (this: SelfWorld) {
  await open(this, true, true);
  await page(this).getByRole("button", { name: "Close details", exact: true }).click();
  await arcSet(this, []);
  await expect(choice(this)).toBeChecked();
});
Given(/^Health is inspected from its self-loop in (Selected|All) mode$/, async function (this: SelfWorld, mode: string) {
  await open(this, true, true, mode);
  await fit(this);
  await selectHealth(this);
  await expect(page(this).getByRole("dialog").getByRole("heading", { name: "Health", exact: true })).toBeVisible();
});
Given("the inspected Health self-loop is hidden", async function (this: SelfWorld) {
  await choice(this).uncheck();
  await expect(healthLoop(this)).toHaveCount(0);
});
Given("a held Health loop press was removed by hiding self-connections", async function (this: SelfWorld) {
  await open(this, true, true);
  await fit(this);
  await holdAndHideHealth(this);
  await arcSet(this, billing);
});
Given("the restored Health loop has rejected its old press", async function (this: SelfWorld) {
  await open(this, true, true);
  await fit(this);
  await holdAndHideHealth(this);
  await arcSet(this, billing);
  await restoreAndReleaseHealth(this);
  await expect(page(this).getByRole("dialog", { name: "Component details", exact: true }).getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
  await arcSet(this, billingWithSelf);
});
Given("Health is open from its self-loop in All mode after hiding and showing it again", async function (this: SelfWorld) {
  await open(this, false, true, "All");
  await healthLoop(this).focus();
  await page(this).keyboard.press("Enter");
  const heading = page(this).getByRole("dialog", { name: "Interface details", exact: true }).getByRole("heading", { name: "Health", exact: true });
  await expect(heading).toBeVisible();
  await choice(this).uncheck();
  await expect(healthLoop(this)).toHaveCount(0);
  await choice(this).check();
  await expect(healthLoop(this)).toHaveCount(1);
  await expect(heading).toBeVisible();
});
When("the user selects Billing in the extended drawing", async function (this: SelfWorld) { await page(this).getByRole("button", { name: "Billing, billing", exact: true }).click(); });
When("the user opens Invoice API from Billing's owned-interface list", async function (this: SelfWorld) {
  await page(this).getByRole("region", { name: "Owned interfaces", exact: true }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
});
When("the user opens Health through Baseline details", async function (this: SelfWorld) {
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
  await page(this).getByRole("dialog").getByRole("button", { name: "Health, health", exact: true }).click();
});
When("the user enables Show self-connections", async function (this: SelfWorld) { await remember(this); await choice(this).check(); });
When("the user disables Show self-connections", async function (this: SelfWorld) { await remember(this); await choice(this).uncheck(); });
When(/^the user changes the extended drawing to (All|Selected)$/, async function (this: SelfWorld, mode: string) { await page(this).getByRole("radio", { name: mode, exact: true }).check(); });
When("the user closes the extended component panel", async function (this: SelfWorld) { await page(this).getByRole("button", { name: "Close details", exact: true }).click(); });
When("the user selects the Health self-loop", async function (this: SelfWorld) { await selectHealth(this); });
When("the user closes Health from inside its panel", async function (this: SelfWorld) {
  await page(this).getByRole("dialog").getByRole("heading", { name: "Interface details", exact: true }).focus();
  await page(this).keyboard.press("Escape");
});
When("the user holds the Health loop and disables self-connections with the keyboard", async function (this: SelfWorld) {
  await holdAndHideHealth(this);
});
When("the user enables self-connections and releases the old loop press", async function (this: SelfWorld) {
  await restoreAndReleaseHealth(this);
});

Then("Billing's three non-self arcs are the only shown arcs", async function (this: SelfWorld) { await arcSet(this, billing); });
Then("Billing's three non-self arcs and two self-loops are shown", async function (this: SelfWorld) { await arcSet(this, billingWithSelf); });
Then("exactly six recorded arcs are shown", async function (this: SelfWorld) { await arcSet(this, allWithSelf); });
Then("Show self-connections is off", async function (this: SelfWorld) { await expect(choice(this)).toBeVisible(); await expect(choice(this)).not.toBeChecked(); });
Then("Show self-connections stays on", async function (this: SelfWorld) { await expect(choice(this)).toBeChecked(); });
Then("the self-connection choice keeps focus", async function (this: SelfWorld) { await expect(choice(this)).toBeFocused(); });
Then("Billing still shows two owned interfaces", async function (this: SelfWorld) { await expect(page(this).getByRole("button", { name: "Billing, billing", exact: true })).toHaveText("Billing2 interfaces"); });
Then("Invoice API records Billing as owner and Checkout, Reporting, and Billing as consumers", async function (this: SelfWorld) {
  const panel = page(this).getByRole("dialog", { name: "Interface details", exact: true });
  await panel.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(panel.getByRole("group", { name: "Owner", exact: true })).toContainText("billing");
  const consumers = panel.getByRole("group", { name: "Allowed consumers", exact: true });
  for (const id of ["checkout", "reporting", "billing"]) await expect(consumers).toContainText(id);
});
Then("Health records Billing as both owner and consumer", async function (this: SelfWorld) {
  const panel = page(this).getByRole("dialog", { name: "Interface details", exact: true });
  await panel.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Health", exact: true })).toBeVisible();
  await expect(panel.getByRole("group", { name: "Owner", exact: true })).toContainText("billing");
  await expect(panel.getByRole("group", { name: "Allowed consumers", exact: true })).toContainText("billing");
});
Then("the extended baseline has no unknown-interface note", async function (this: SelfWorld) { await expect(page(this).getByText(/unknown owners or allowed consumers/)).toHaveCount(0); });
Then("no arc or arc keyboard control is shown", async function (this: SelfWorld) { await arcSet(this, []); });
Then("the view says No connections shown", async function (this: SelfWorld) { await expect(page(this).getByText("No connections shown.", { exact: true })).toBeVisible(); });
Then("self-connection filtering preserves the camera, positions, and panel", async function (this: SelfWorld) {
  assert.equal(await page(this).locator(".react-flow__viewport").getAttribute("style"), this.selfCamera);
  assert.deepEqual(await page(this).locator(".react-flow__node").evaluateAll((elements) => elements.map((element) => (element as HTMLElement).style.transform)), this.selfPositions);
  assert.equal(await page(this).getByRole("dialog").count() ? await page(this).getByRole("dialog").textContent() : null, this.selfPanel);
});
Then("focus returns to Billing's header for the hidden loop", async function (this: SelfWorld) { await expect(page(this).getByRole("button", { name: "Billing, billing", exact: true })).toBeFocused(); });
Then("the panel closes and focus returns to the restored Health self-loop", async function (this: SelfWorld) {
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
  assert.equal(await page(this).evaluate(() => document.activeElement?.getAttribute("aria-label")), healthLoopName);
});
Then("Billing's component details are still open", async function (this: SelfWorld) { await expect(page(this).getByRole("dialog", { name: "Component details", exact: true }).getByRole("heading", { name: "Billing", exact: true })).toBeVisible(); });

After({ tags: "@br-08c" }, async function (this: SelfWorld) {
  try { if (this.selfFile && this.selfBytes) assert.equal(await readFile(this.selfFile, "utf8"), this.selfBytes); }
  finally { if (this.selfDirectory) await rm(this.selfDirectory, { recursive: true, force: true }); }
});
