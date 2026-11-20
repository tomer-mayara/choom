import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import type { Baseline } from "@choom/baseline-model/contracts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import { selectDuplicationReport } from "../support/duplication-browser.ts";
import { duplicationV4Fixture } from "../support/duplication-v4-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { markedSystemEntryPointsBaseline, systemEntryReviewLimit } from "../support/system-entry-points-fixtures.ts";

interface EntryMarkerWorld extends World {
  page?: Page;
  entryDirectory?: string;
}

function page(world: EntryMarkerWorld) { assert.ok(world.page); return world.page; }

async function open(world: EntryMarkerWorld, baseline: Baseline, width = 1280) {
  const browser = page(world);
  world.entryDirectory = await mkdtemp(join(tmpdir(), "choom-entry-markers-"));
  const path = join(world.entryDirectory, "baseline.yaml");
  const bytes = stringify(baseline, { aliasDuplicateObjects: false });
  await writeFile(path, bytes);
  await browser.setViewportSize({ width, height: width === 320 ? 640 : 800 });
  const driver = new BaselineBrowserDriver(browser);
  await driver.open();
  await driver.openHistoricalInventory(path);
  await expect(browser.getByText("Baseline ready.", { exact: true })).toBeVisible();
  return { directory: world.entryDirectory, bytes };
}

Given("the version 4 file recording one Startup and three External entries is open at {int} pixels",
  async function (this: EntryMarkerWorld, width: number) {
    await open(this, markedSystemEntryPointsBaseline(), width);
  });

Given(/^a baseline whose system-entry assessment is (.+)$/, async function (this: EntryMarkerWorld, state: string) {
  const { systemEntryPoints, ...baseline } = markedSystemEntryPointsBaseline();
  if (state === "not recorded") await open(this, baseline);
  else if (state === "empty in its stated scope") {
    await open(this, { ...baseline, systemEntryPoints: { ...systemEntryPoints, entries: [] } });
  } else {
    assert.equal(state, "recorded with limits");
    await open(this, { ...baseline, systemEntryPoints: { ...systemEntryPoints, limitations: [systemEntryReviewLimit] } });
  }
});

When(/^the reader views (Selected|All) connections$/, async function (this: EntryMarkerWorld, mode: string) {
  await page(this).getByRole("radio", { name: mode, exact: true }).check();
});

Then("the direct owners show Startup 1 and External 3", async function (this: EntryMarkerWorld) {
  for (const [name, badge] of [["Checkout, checkout", "Startup 1"], ["Billing, billing", "External 3"]] as const) {
    const header = page(this).getByRole("button", { name, exact: true });
    await expect(header.getByText(badge, { exact: true })).toBeVisible({ timeout: 1500 });
    await expect(header).toHaveAccessibleDescription(new RegExp(badge));
  }
});

Then("the parent group shows no inherited marker", async function (this: EntryMarkerWorld) {
  const parent = page(this).getByRole("button", { name: "Commerce, commerce", exact: true });
  await expect(parent).not.toContainText(/Startup|External/);
});

Then("the marked component can be inspected by keyboard after Fit view", async function (this: EntryMarkerWorld) {
  const browser = page(this);
  await browser.getByRole("button", { name: "Fit View", exact: true }).click();
  const header = browser.getByRole("button", { name: "Billing, billing", exact: true });
  await header.focus();
  await expect(header.getByText("External 3", { exact: true })).toBeInViewport();
  await header.press("Enter");
  await expect(browser.getByRole("dialog", { name: "Component details" }).getByRole("heading", { name: "Billing" })).toBeVisible();
  await browser.keyboard.press("Escape");
  await expect(header).toBeFocused();
});

Given("a narrow plot shows a component with one Startup, twenty External entries, and a duplicate finding",
  async function (this: EntryMarkerWorld) {
    const baseline = markedSystemEntryPointsBaseline(20);
    fixtureItem(baseline.systemEntryPoints.entries).componentId = "billing";
    fixtureItem(baseline.components, 2).name = "Subscription and Customer Billing";
    const fixture = duplicationV4Fixture();
    const { directory, bytes } = await open(this, { ...baseline, interfaces: fixture.baseline.interfaces }, 320);
    fixture.report.baseline.sha256 = createHash("sha256").update(bytes).digest("hex");
    const reportPath = join(directory, "report.yaml");
    await writeFile(reportPath, JSON.stringify(fixture.report));
    const browser = page(this);
    await browser.getByRole("button", { name: "Duplicates", exact: true }).click();
    await selectDuplicationReport(browser, reportPath);
    await expect(browser.getByRole("button", { name: "Remove report", exact: true })).toBeVisible();
    await browser.getByRole("button", { name: "Close details", exact: true }).click();
    await browser.getByRole("button", { name: "Fit View", exact: true }).click();
  });

Then("the full two-line name, both entry counts, and duplication marker fit in the component header",
  async function (this: EntryMarkerWorld) {
    const name = "Subscription and Customer Billing";
    const header = page(this).getByRole("button", { name: `${name}, billing`, exact: true });
    await expect(header).toHaveAccessibleDescription(/Startup 1.*External 20/);
    const bounds = await header.boundingBox();
    assert.ok(bounds);
    for (const text of [name, "Startup 1", "External 20", "1 possible duplicate"]) {
      const content = header.getByText(text, { exact: true });
      await expect(content).toBeInViewport({ ratio: 0.95 });
      const contentBounds = await content.boundingBox();
      assert.ok(contentBounds && contentBounds.x >= bounds.x && contentBounds.y >= bounds.y
        && contentBounds.x + contentBounds.width <= bounds.x + bounds.width
        && contentBounds.y + contentBounds.height <= bounds.y + bounds.height, `${text} must fit inside the header.`);
    }
    assert.equal(await header.getByText(name, { exact: true }).evaluate((element) => element.scrollHeight <= element.clientHeight), true);
  });

Then("the plot legend explains the two markers, their saved scope, and connection arrows", async function (this: EntryMarkerWorld) {
  const browser = page(this);
  const legend = browser.getByRole("region", { name: "System entry point legend" });
  await expect(legend).toContainText("Startup starts a program.", { timeout: 1500 });
  await expect(legend).toContainText("External calls a running program.");
  await expect(legend).toContainText("Markers cover the saved review scope.");
  await expect(browser.getByText("Arrow: component uses the interface in saved source.", { exact: true })).toBeVisible();
});

Then(/^the plot says (.+)$/, async function (this: EntryMarkerWorld, message: string) {
  await expect(page(this).getByText(message, { exact: true })).toBeVisible({ timeout: 1500 });
});

When("the reader opens Baseline details for the entry assessment", async function (this: EntryMarkerWorld) {
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
});

Then("the saved scope, limits, and scope evidence are readable", async function (this: EntryMarkerWorld) {
  const panel = page(this).getByRole("dialog", { name: "Baseline details" });
  const saved = markedSystemEntryPointsBaseline().systemEntryPoints;
  for (const fact of [saved.scope, systemEntryReviewLimit, ...saved.evidenceRefs]) {
    await expect(panel.getByText(fact, { exact: true })).toBeVisible({ timeout: 1500 });
  }
});

const narrowEvidenceReference = "x".repeat(4 * 1024);

Given("the narrow plot opens an assessment citing a full-length evidence reference", async function (this: EntryMarkerWorld) {
  const baseline = markedSystemEntryPointsBaseline();
  baseline.systemEntryPoints.evidenceRefs = [narrowEvidenceReference];
  await open(this, baseline, 320);
});

Then("the full reference stays within the Baseline details panel", async function (this: EntryMarkerWorld) {
  const panel = page(this).getByRole("dialog", { name: "Baseline details" });
  await expect(panel.getByText(narrowEvidenceReference, { exact: true })).toBeAttached();
  const content = panel.getByLabel("Record content", { exact: true });
  assert.equal(await content.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
});

After({ tags: "@ep-05" }, async function (this: EntryMarkerWorld) {
  if (this.entryDirectory) await rm(this.entryDirectory, { recursive: true, force: true });
});
