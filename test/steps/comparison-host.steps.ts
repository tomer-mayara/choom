import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { InstalledBaselineDriver, waitFor } from "../support/baseline-viewer/installed-driver.ts";

const action = "Compare with earlier baseline";
const panel = '[aria-label="Isolation comparison"]';
type Example = "before" | "after" | "indirect" | "unresolved";
const file = (name: Example) => fileURLToPath(new URL(`../fixtures/baseline-viewer/published-boundary-${name}.yaml`, import.meta.url));
const digest = async (name: Example) => createHash("sha256").update(await readFile(file(name))).digest("hex");

interface HostWorld extends World {
  page?: Page;
  installedBaselineDriver?: InstalledBaselineDriver;
  sides: Map<Example, string>;
  observations: string[];
}

async function text(world: HostWorld): Promise<string> {
  if (world.page) return world.page.locator(panel).textContent().then(value => value ?? "");
  assert.ok(world.installedBaselineDriver);
  return (await world.installedBaselineDriver.view()).comparison;
}

async function earlier(world: HostWorld, name: Example | null): Promise<void> {
  if (world.page) {
    const chooser = world.page.waitForEvent("filechooser");
    await world.page.getByRole("button", { name: action, exact: true }).click();
    await (await chooser).setFiles(name ? file(name) : []);
  } else {
    assert.ok(world.installedBaselineDriver);
    await world.installedBaselineDriver.selectFile(action, name ? file(name) : null);
  }
}

async function open(world: HostWorld): Promise<void> {
  world.sides = new Map(await Promise.all((["after", "before", "indirect", "unresolved"] as const)
    .map(async example => [example, await digest(example)] as const)));
  if (world.page) {
    const driver = new BaselineBrowserDriver(world.page);
    await driver.open();
    await driver.openBaseline(file("after"));
    await expect(world.page.getByRole("status").filter({ hasText: "Baseline ready." })).toBeVisible();
  } else {
    const driver = new InstalledBaselineDriver(world);
    world.installedBaselineDriver = driver;
    await driver.open();
    await driver.openBaseline(file("after"));
    await waitFor(async () => (await driver.view()).statuses.includes("Baseline ready."), "The installed After file did not open.");
  }
}

Given("the browser opens the fixed After file for comparison", { timeout: 45_000 }, async function (this: HostWorld) { await open(this); });
Given("the installed viewer opens the fixed After file for comparison", { timeout: 60_000 }, async function (this: HostWorld) { await open(this); });

When("the reader compares the complete, indirect and unresolved Before files", { timeout: 120_000 }, async function (this: HostWorld) {
  this.observations = [];
  for (const [name, label] of [["before", "New violation"], ["indirect", "Existing violation"], ["unresolved", "Comparison limited"]] as const) {
    await earlier(this, name);
    const expected = this.sides.get(name);
    assert.ok(expected);
    if (this.page) {
      const view = this.page.locator(panel);
      await expect(view).toContainText(expected);
      await view.getByRole("button", { name: new RegExp(label + ".*History receives configuration from its caller") }).click();
    } else {
      const driver = this.installedBaselineDriver;
      assert.ok(driver);
      await waitFor(async () => (await text(this)).includes(expected), "The installed Before identity did not change.");
      await driver.clickControl(`//section[@aria-label='Isolation comparison']//button[contains(.,'${label}') and contains(.,'History receives configuration from its caller')]`, label);
    }
    await waitFor(async () => (await text(this)).includes("After evidence"), "The selected finding did not expose its evidence.");
    this.observations.push(await text(this));
  }
});

Then("the results show the new, existing and first-observed dependency with evidence", async function (this: HostWorld) {
  const [added, existing, limited] = this.observations;
  assert.ok(added && existing && limited);
  assert.match(added, /New violation/); assert.match(added, /Complete search/);
  assert.match(added, /Call/i); assert.match(added, /Before evidence/);
  assert.match(existing, /Existing violation/); assert.match(limited, /First observed/i);
  for (const copy of this.observations) { assert.match(copy, /Before → After/); assert.ok(copy.includes(await digest("after"))); }
  await this.attach(JSON.stringify({ files: Object.fromEntries(this.sides), findings: this.observations }), "application/json");
});

Then("cancelling a replacement preserves the last pair and closing keeps After", { timeout: 60_000 }, async function (this: HostWorld) {
  await earlier(this, null);
  if (this.page) {
    await expect(this.page.getByRole("status").filter({ hasText: "Comparison load cancelled." })).toBeVisible();
    assert.equal(await text(this), this.observations.at(-1));
    await this.page.getByRole("button", { name: "Close comparison" }).click();
    await expect(this.page.locator(panel)).toHaveCount(0);
    await expect(this.page.getByRole("button", { name: action })).toBeEnabled();
  } else {
    const driver = this.installedBaselineDriver;
    assert.ok(driver);
    await waitFor(async () => (await driver.view()).statuses.includes("Comparison load cancelled."), "The installed viewer did not report dismissal.");
    assert.equal(await text(this), this.observations.at(-1));
    await driver.clickControl("//button[normalize-space(.)='Close comparison']", "Close comparison");
    await waitFor(async () => !(await driver.view()).comparison && (await driver.view()).buttons.includes(action), "Close must retain After.");
  }
  for (const [name, original] of this.sides) assert.equal(await digest(name), original);
});
