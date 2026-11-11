import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Locator, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import {
  baselineDetailsExample, baselineWithOnlyRules, baselineWithUnknownDetails,
  finalPolicyLine, recordedAcceptanceRef, recordedEvidenceRef, recordedMarkup,
} from "../support/baseline-detail-fixtures.ts";
import { reviewedBaseline } from "../support/baseline-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";

const expect = browserExpect.configure({ timeout: 2_000 });

interface BaselineDetailsWorld extends World {
  page?: Page;
  pageErrors: string[];
  detailDirectory?: string;
  detailBaseline?: Baseline;
  detailOpener?: Locator;
  detailKind?: string;
  detailZoom?: number;
  detailUrl?: string;
  recordRequests?: string[];
  recordDialogs?: string[];
}

function page(world: BaselineDetailsWorld): Page {
  assert.ok(world.page, "The browser hook must supply a real page.");
  return world.page;
}

async function saveBaseline(world: BaselineDetailsWorld, baseline: Baseline): Promise<string> {
  assert.ok(world.detailDirectory);
  assert.equal(baselineSchema.safeParse(baseline).success, true,
    "The detail fixture must satisfy the baseline domain contract.");
  const yaml = stringify(baseline, { aliasDuplicateObjects: false });
  assert.equal(decodeBaselineYaml(yaml).status, "success",
    "The detail fixture must pass the actual YAML decoder.");
  const path = join(world.detailDirectory, `${baseline.id}.yaml`);
  await writeFile(path, yaml);
  return path;
}

async function openFixture(world: BaselineDetailsWorld, baseline: Baseline): Promise<void> {
  const browserPage = page(world);
  world.detailDirectory = await mkdtemp(join(tmpdir(), "choom-baseline-details-"));
  world.detailBaseline = baseline;
  world.recordRequests = [];
  world.recordDialogs = [];
  await browserPage.route("https://baseline.invalid/**", async (route) => {
    world.recordRequests?.push(route.request().url());
    await route.abort();
  });
  browserPage.on("dialog", (dialog) => {
    world.recordDialogs?.push(dialog.message());
    void dialog.dismiss();
  });
  await browserPage.setViewportSize({ width: 1280, height: 800 });
  const viewer = new BaselineBrowserDriver(browserPage);
  await viewer.open();
  world.detailUrl = browserPage.url();
  await viewer.openBaseline(await saveBaseline(world, baseline));
  await expect(browserPage.getByRole("heading", { name: baseline.id, exact: true })).toBeVisible();
}

async function tabTo(browserPage: Page, control: Locator): Promise<void> {
  await expect(control).toHaveCount(1);
  for (let step = 0; step < 100; step += 1) {
    if (await control.evaluate((element) => element === document.activeElement)) break;
    await browserPage.keyboard.press("Tab");
  }
  await expect(control).toBeFocused();
  await expect(control).toBeInViewport();
}

async function zoom(browserPage: Page): Promise<number> {
  return browserPage.locator(".react-flow__viewport").evaluate((element) => (
    new DOMMatrixReadOnly(getComputedStyle(element).transform).a
  ));
}

async function openRules(world: BaselineDetailsWorld): Promise<void> {
  const browserPage = page(world);
  await tabTo(browserPage, browserPage.getByRole("button", { name: "Rules", exact: true }));
  await browserPage.keyboard.press("Enter");
  await expect(browserPage.getByRole("dialog", { name: "Rules", exact: true })).toBeVisible();
}

async function openRecord(world: BaselineDetailsWorld, kind: string, key = "Enter"): Promise<void> {
  const browserPage = page(world);
  if (await browserPage.locator(".react-flow__viewport").count() > 0) world.detailZoom = await zoom(browserPage);
  world.detailKind = kind;
  if (kind === "rule") {
    await openRules(world);
    world.detailOpener = browserPage.getByRole("dialog").locator("summary").filter({ hasText: "Only approved consumers" });
  } else {
    const names: Record<string, string> = {
      "parent component": "Order system, order-system", "leaf component": "Order service, order-service",
      interface: "Order API, order-api", resource: "Order ledger, order-ledger", baseline: "Baseline details",
    };
    const name = names[kind];
    assert.ok(name, `Unknown record kind: ${kind}`);
    world.detailOpener = browserPage.getByRole("button", { name, exact: true });
  }
  await tabTo(browserPage, world.detailOpener);
  await browserPage.keyboard.press(key === "Space" ? " " : key);
  await expect(browserPage.getByRole("dialog")).toBeVisible();
  if (kind === "parent component" || kind === "leaf component") {
    await browserPage.getByRole("dialog").getByText("Recorded details", { exact: true }).click();
  }
}

Given("a rich baseline is open for record inspection", { timeout: 30_000 }, async function (this: BaselineDetailsWorld) {
  await openFixture(this, baselineDetailsExample());
});

Given("an unknown-value baseline is open for record inspection", { timeout: 30_000 }, async function (this: BaselineDetailsWorld) {
  await openFixture(this, baselineWithUnknownDetails());
});

Given("the first baseline is open for record inspection", { timeout: 30_000 }, async function (this: BaselineDetailsWorld) {
  await openFixture(this, baselineSchema.parse(reviewedBaseline("empty")));
});

Given("a rules-only baseline is open for record inspection", { timeout: 30_000 }, async function (this: BaselineDetailsWorld) {
  await openFixture(this, baselineWithOnlyRules());
});

Given("the reviewed baseline is open for rule inspection", { timeout: 30_000 }, async function (this: BaselineDetailsWorld) {
  await openFixture(this, baselineSchema.parse(reviewedBaseline("full")));
});

When("the user opens the baseline details with a keyboard", async function (this: BaselineDetailsWorld) {
  await openRecord(this, "baseline");
});

When(/^the user opens the (.+) record with "(Enter|Space)"$/, async function (this: BaselineDetailsWorld, kind: string, key: string) {
  await openRecord(this, kind, key);
});

Given(/^the (.+) record is open with a keyboard$/, async function (this: BaselineDetailsWorld, kind: string) {
  await openRecord(this, kind);
});

When("the user opens the Rules list with a keyboard", async function (this: BaselineDetailsWorld) {
  await openRules(this);
});

Then("the format, baseline ID, and parent baseline ID are readable", async function (this: BaselineDetailsWorld) {
  const panel = page(this).getByRole("dialog");
  for (const value of ["Format version", "1", "Baseline ID", "baseline-details", "Parent baseline ID", "baseline-before-details"]) {
    await expect(panel).toContainText(value);
  }
});

Then("its parent baseline field identifies that it has no parent", async function (this: BaselineDetailsWorld) {
  const field = page(this).getByRole("dialog").getByRole("group", { name: "Parent baseline ID", exact: true });
  await expect(field).toContainText("No parent baseline (null)");
  await expect(field).not.toContainText("Unknown");
});

Then(/^all recorded (.+) fields are readable$/, async function (this: BaselineDetailsWorld, kind: string) {
  const expected: Record<string, string[]> = {
    "parent component": [
      "Order system", "Component ID", "order-system", "Purpose", "Manage orders.", "Keep each decision traceable.",
      "Membership", "orders/**", "shared/types.ts", "Excluded paths", "orders/generated/**",
      "Grouping reason", "Orders share one release boundary.", "Parent", "Not recorded",
    ],
    "leaf component": [
      "Order service", "Component ID", "order-service", "Purpose", "Submit an order after approval.",
      "Membership", "orders/service.ts", "Excluded paths", "[]", "Grouping reason", "Approval rules change together.",
      "Parent", "order-system",
    ],
    interface: [
      "Order API", "Interface ID", "order-api", "Owner", "order-service", "Public access", "submitOrder", "readOrder",
      "Allowed consumers", "order-system", "Promises", "Behavior", "Submit one approved order.",
      "Data", "Return the recorded order ID.", "Errors", "Reject an expired approval.",
      "Lifecycle", "Keep an order until retention ends.",
    ],
    resource: [
      "Order ledger", "Resource ID", "order-ledger", "Identity", recordedMarkup,
      "Owner", "order-service", "Access rules", "Policy 0:", finalPolicyLine,
    ],
    rule: [
      "Only approved consumers", "Rule ID", "approved-consumers", "Subject", "{}", "Expected", '"relation"',
      '"consumers"', '"limit": 0', '"required": false', '"unknown": null', '"__proto__"', "Recorded own key",
      '"empty": []', "Check", "A recorded check is data", "echo recorded-command", "file:///unavailable-check.ts",
    ],
  };
  const values = expected[kind];
  assert.ok(values, `Unknown record kind: ${kind}`);
  const panel = page(this).getByRole("dialog");
  for (const value of [...values, "Proposed", "Accepted (recorded)", "Evidence not loaded"]) {
    await expect(panel).toContainText(value);
  }
});

Then("opening the record keeps the diagram zoom", async function (this: BaselineDetailsWorld) {
  assert.equal(await zoom(page(this)), this.detailZoom);
});

Then("its proposed and accepted statements keep their recorded references", async function (this: BaselineDetailsWorld) {
  const panel = page(this).getByRole("dialog");
  for (const text of ["Proposed", "Accepted (recorded)", "missing-evidence#/items/0", "missing-evidence#/items/7", recordedEvidenceRef, recordedAcceptanceRef]) {
    await expect(panel).toContainText(text);
  }
});

Then("evidence is marked not loaded without a pass or fail result", async function (this: BaselineDetailsWorld) {
  const panel = page(this).getByRole("dialog");
  await expect(panel.getByText("Evidence not loaded", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText(/^(Passed|Failed|Verified|Valid|Pass|Fail)$/i)).toHaveCount(0);
});

Then("recorded references and checks have not opened or run anything", async function (this: BaselineDetailsWorld) {
  const browserPage = page(this);
  await expect(browserPage.getByRole("dialog").locator("a[href], img, iframe, script")).toHaveCount(0);
  assert.deepEqual(this.recordRequests, [], "Recorded URLs must not load a network resource.");
  assert.deepEqual(this.recordDialogs, [], "Recorded text must not execute browser code.");
  assert.deepEqual(this.pageErrors, [], "A recorded expression must not run.");
  assert.equal(browserPage.url(), this.detailUrl, "Recorded references must not navigate away from Choom.");
});

Then("the recorded markup is shown as text", async function (this: BaselineDetailsWorld) {
  await expect(page(this).getByRole("dialog").getByText(recordedMarkup, { exact: true })).toBeVisible();
});

Then(/^the (.+) record identifies its unknown and missing fields$/, async function (this: BaselineDetailsWorld, kind: string) {
  const fields: Record<string, string[]> = {
    "parent component": ["Parent", "Excluded paths", "Not recorded"],
    interface: ["Owner", "Public access", "Allowed consumers", "Promises"],
    resource: ["Identity", "Owner", "Access rules"],
    rule: ["Subject", "{}", "Expected", "Check"],
  };
  const expected = fields[kind];
  assert.ok(expected);
  const panel = page(this).getByRole("dialog");
  for (const field of [...expected, "Unknown (null)"]) await expect(panel).toContainText(field);
});

Then("empty exclusions are shown as an empty list", async function (this: BaselineDetailsWorld) {
  const panel = page(this).getByRole("dialog");
  await expect(panel).toContainText("Excluded paths");
  await expect(panel.getByText("[]", { exact: true })).toBeVisible();
  await expect(panel.getByText("Not recorded", { exact: true })).toHaveCount(0);
});

async function assertEveryRule(world: BaselineDetailsWorld): Promise<void> {
  assert.ok(world.detailBaseline);
  const browserPage = page(world);
  const panel = browserPage.getByRole("dialog", { name: "Rules", exact: true });
  const rows = panel.locator("summary");
  await expect(rows).toHaveCount(world.detailBaseline.rules.length);
  for (const rule of world.detailBaseline.rules) {
    const row = rows.filter({ hasText: rule.name });
    await expect(row).toBeVisible();
    await expect(row).toContainText(rule.id);
  }
  await tabTo(browserPage, rows.last());
  await browserPage.keyboard.press("Enter");
  for (const field of ["Subject", "Expected", "Check", "Evidence not loaded"]) await expect(panel).toContainText(field);
}

Then("all 21 reviewed rules are available for inspection", async function (this: BaselineDetailsWorld) {
  assert.equal(this.detailBaseline?.rules.length, 21);
  await assertEveryRule(this);
});

Then("every rule in the baseline is available for inspection", async function (this: BaselineDetailsWorld) {
  await assertEveryRule(this);
});

When("the user closes the current record with Escape", async function (this: BaselineDetailsWorld) {
  await page(this).keyboard.press("Escape");
});

Then(/^focus returns to the (.+) inspection control$/, async function (this: BaselineDetailsWorld, kind: string) {
  assert.ok(this.detailOpener);
  assert.equal(kind, this.detailKind);
  await expect(this.detailOpener).toBeFocused();
  if (kind === "rule") {
    await expect(page(this).getByRole("dialog", { name: "Rules", exact: true })).toBeVisible();
    await expect(this.detailOpener.locator("..")).toHaveJSProperty("open", false);
  } else {
    await expect(page(this).getByRole("dialog")).toHaveCount(0);
  }
});

When("the user closes the rule and then the Rules list with Escape", async function (this: BaselineDetailsWorld) {
  assert.ok(this.detailOpener);
  await page(this).keyboard.press("Escape");
  await expect(this.detailOpener).toBeFocused();
  await page(this).keyboard.press("Escape");
});

Then("the Rules list is closed and its opener has focus", async function (this: BaselineDetailsWorld) {
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
  await expect(page(this).getByRole("button", { name: "Rules", exact: true })).toBeFocused();
});

When("the user reads to the end of the resource access rules", async function (this: BaselineDetailsWorld) {
  await openRecord(this, "resource");
  const panel = page(this).getByRole("dialog");
  await expect(panel).toContainText(finalPolicyLine);
  const bounds = await panel.boundingBox();
  assert.ok(bounds);
  await page(this).mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page(this).mouse.wheel(0, 50_000);
});

Then("the full record can be read inside the details panel", async function (this: BaselineDetailsWorld) {
  const browserPage = page(this);
  await expect.poll(() => browserPage.getByRole("dialog").evaluate((panel) => (
    Array.from(panel.querySelectorAll<HTMLElement>("*")).some((element) => (
      ["auto", "scroll"].includes(getComputedStyle(element).overflowY)
      && element.scrollTop > 0
      && element.scrollHeight - element.scrollTop - element.clientHeight <= 1
      && element.scrollWidth <= element.clientWidth + 1
    ))
  ))).toBe(true);
  const overflow = await browserPage.evaluate(() => ({
    width: document.documentElement.scrollWidth - innerWidth,
    height: document.documentElement.scrollHeight - innerHeight,
  }));
  assert.ok(overflow.width <= 1 && overflow.height <= 1, "Long details must not make the page scroll.");
});

When("a replacement baseline finishes while a rule is being inspected", async function (this: BaselineDetailsWorld) {
  const browserPage = page(this);
  const chooser = browserPage.waitForEvent("filechooser");
  await browserPage.getByRole("button", { name: "Open Baseline", exact: true }).click();
  const selection = await chooser;
  await openRecord(this, "rule");
  const replacement = baselineDetailsExample();
  replacement.id = "baseline-after-details";
  await selection.setFiles(await saveBaseline(this, replacement));
});

Then("the replacement baseline is visible with all details closed", async function (this: BaselineDetailsWorld) {
  await expect(page(this).getByRole("heading", { name: "baseline-after-details", exact: true })).toBeVisible();
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});

After({ tags: "@bv-06" }, async function (this: BaselineDetailsWorld) {
  if (this.detailDirectory) await rm(this.detailDirectory, { recursive: true, force: true });
});
