import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import type { Baseline } from "@choom/baseline-model/contracts";
import { boundaryFile } from "../support/boundary-baseline.ts";
import { excludedTargetBaseline } from "../support/boundary-view-fixtures.ts";
import { systemEntryPointsBaseline } from "../support/system-entry-points-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";

interface ScopeWorld extends World {
  page: Page;
  scopeFixture: string;
  scopeDirectory?: string;
}

const scopeSwitch = (page: Page) => page.getByRole("switch", { name: "Show non-production", exact: true });
const card = (page: Page, id: string) => page.locator(`button[data-component-id="${id}"]`);

async function prepare(world: ScopeWorld, baseline: Baseline) {
  world.scopeDirectory = await mkdtemp(join(tmpdir(), "choom-scope-"));
  world.scopeFixture = join(world.scopeDirectory, "baseline.yaml");
  await writeFile(world.scopeFixture, stringify(baseline, { aliasDuplicateObjects: false }));
}

After({ tags: "@cr005 and @browser" }, async function (this: ScopeWorld) {
  if (this.scopeDirectory) await rm(this.scopeDirectory, { recursive: true, force: true });
});

async function open(world: ScopeWorld) {
  const driver = new BaselineBrowserDriver(world.page);
  await driver.open();
  await driver.openBaseline(world.scopeFixture);
  await expect(world.page.getByText("Baseline ready.", { exact: true })).toBeVisible();
}

Given("a production collector calls GlobalConfigLoader.load and its allowlist is unknown", function (this: ScopeWorld) {
  this.scopeFixture = boundaryFile("before");
});
When("I open the baseline", async function (this: ScopeWorld) { await open(this); });
Then("the Configuration card names GlobalConfigLoader.load", async function (this: ScopeWorld) {
  await expect(card(this.page, "configuration")).toContainText("GlobalConfigLoader.load");
});
Then("selecting it shows the collector as caller and the allowed-consumer policy as unknown", async function (this: ScopeWorld) {
  await card(this.page, "configuration").click();
  const provides = this.page.getByRole("region", { name: "Provides", exact: true });
  await expect(provides).toContainText("Collector");
  await expect(provides).toContainText("Permitted callers unknown");
});

Then("Show more opens the remaining Configuration operation with the keyboard", async function (this: ScopeWorld) {
  await this.page.getByRole("button", { name: "Close details", exact: true }).click();
  const more = this.page.locator('.react-flow__node[data-id="configuration"]').getByRole("button", { name: "Show more (1)", exact: true });
  await more.focus(); await this.page.keyboard.press("Enter");
  await expect(this.page.getByRole("region", { name: "Provides", exact: true })).toContainText("GlobalConfig");
  await expect(this.page.getByRole("region", { name: "Provides", exact: true }).locator("article")).toHaveCount(2);
});

Given("the new baseline contains a production port and an in-memory test adapter", function (this: ScopeWorld) {
  this.scopeFixture = boundaryFile("after");
});
When("I open the file and turn on Show non-production", async function (this: ScopeWorld) {
  await open(this);
  await expect(scopeSwitch(this.page)).not.toBeChecked();
  await expect(card(this.page, "test-adapter")).toHaveCount(0);
  await scopeSwitch(this.page).focus();
  await this.page.keyboard.press("Space");
});
Then("the adapter first appears after opt-in with the visible and accessible label Test component", async function (this: ScopeWorld) {
  await expect(card(this.page, "test-adapter")).toContainText("Test component");
  await expect(card(this.page, "test-adapter")).toHaveAccessibleName(/Test component/);
});
Then("its uses appear as test uses", async function (this: ScopeWorld) {
  await card(this.page, "test-adapter").click();
  await expect(this.page.getByRole("region", { name: "Uses", exact: true })).toContainText("Test");
});
Given("a selected test fixture with all connections and an evidence panel open", async function (this: ScopeWorld) {
  this.scopeFixture = boundaryFile("after");
  await open(this);
  await scopeSwitch(this.page).check();
  await this.page.getByRole("radio", { name: "All", exact: true }).check();
  await this.page.getByRole("button", { name: "Baseline details", exact: true }).click();
  await this.page.getByRole("region", { name: "Components", exact: true }).getByRole("button", { name: /In-memory adapter.*Test component/ }).click();
  await this.page.getByRole("dialog").locator("summary").filter({ hasText: /^Evidence$/ }).click();
});
When("I return to Production", async function (this: ScopeWorld) { await scopeSwitch(this.page).uncheck(); });
Then("its node, edge, text, counts and history entry disappear and focus returns to a visible control", async function (this: ScopeWorld) {
  await expect(card(this.page, "test-adapter")).toHaveCount(0);
  await expect(this.page.locator("[data-consumer-id=test-adapter], [data-owner-id=test-adapter]")).toHaveCount(0);
  await expect(this.page.locator("body")).not.toContainText("In-memory adapter");
  await expect(scopeSwitch(this.page)).toBeFocused();
  await expect(this.page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
});
Given("a production caller with a proven forbidden dependency on a test helper", async function (this: ScopeWorld) {
  await prepare(this, excludedTargetBaseline());
});
When("I open its finding in Production", async function (this: ScopeWorld) {
  await open(this);
  await card(this.page, "history").click();
  await this.page.getByText("Production code reaches an excluded target", { exact: true }).click();
});
Then("I see the caller and a safe rule description", async function (this: ScopeWorld) {
  const findings = this.page.getByRole("region", { name: "Boundary findings" });
  await expect(findings).toContainText("Local Codex history");
  await expect(findings).toContainText("restricted boundary");
  await expect(findings).toContainText("lines 3");
  await expect(this.page.locator("body")).not.toContainText(/In-memory adapter|test\/adapter/);
});
Then("opt-in reveals the helper, the raw import and its test label", async function (this: ScopeWorld) {
  await scopeSwitch(this.page).check();
  const uses = this.page.getByRole("region", { name: "Uses" });
  await expect(uses).toContainText("In-memory adapter");
  await expect(uses).toContainText("../test/adapter");
  await expect(uses).toContainText("Test");
});
Given("a valid v4 baseline with unclassified components", async function (this: ScopeWorld) {
  await prepare(this, systemEntryPointsBaseline());
});
When("I open the file", async function (this: ScopeWorld) { await open(this); });
Then("I see Production scope unavailable and can opt in to its original inventory under Scope unknown", async function (this: ScopeWorld) {
  await expect(this.page.getByText("Production scope unavailable", { exact: true })).toBeVisible();
  await expect(this.page.locator("button[data-component-id]")).toHaveCount(0);
  await scopeSwitch(this.page).check();
  await expect(this.page.getByText("Scope unknown", { exact: true }).first()).toBeVisible();
  assert.ok(await this.page.locator("button[data-component-id]").count() > 0);
});
