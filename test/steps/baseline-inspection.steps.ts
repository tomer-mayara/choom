import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { reviewedBaseline } from "../support/baseline-fixtures.ts";
import { baselineWithoutComponents } from "../support/baseline-relationship-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";

const expect = browserExpect.configure({ timeout: 2_000 });

interface InspectionWorld extends World {
  page?: Page;
  inspectionDirectory?: string;
  inspectionCamera?: number[];
  inspectionPositions?: string[];
  inspectionRow?: string;
  inspectionScroll?: number;
}

function page(world: InspectionWorld): Page {
  assert.ok(world.page, "The browser scenario must have a page.");
  return world.page;
}

async function camera(browser: Page): Promise<number[]> {
  return browser.locator(".react-flow__viewport").evaluate((node) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return [matrix.a, matrix.e, matrix.f];
  });
}

async function openFixture(world: InspectionWorld, full: boolean): Promise<void> {
  const browser = page(world);
  await browser.setViewportSize({ width: 1280, height: 800 });
  world.inspectionDirectory = await mkdtemp(join(tmpdir(), "choom-inspection-"));
  const file = join(world.inspectionDirectory, "baseline.yaml");
  await writeFile(file, stringify(full ? reviewedBaseline("full") : baselineWithoutComponents()));
  const driver = new BaselineBrowserDriver(browser);
  await driver.open();
  await driver.openBaseline(file);
  await expect(browser.getByText("Baseline ready.", { exact: true })).toBeVisible();
  if (full) await expect(browser.locator(".react-flow__node").first()).toBeVisible();
  else await expect(browser.getByText("No components modeled", { exact: true })).toBeVisible();
}

async function selectWorkspace(world: InspectionWorld): Promise<void> {
  const browser = page(world);
  world.inspectionCamera = await camera(browser);
  world.inspectionPositions = await browser.locator(".react-flow__node").evaluateAll((nodes) =>
    nodes.map((node) => `${node.getAttribute("data-id")}: ${(node as HTMLElement).style.transform}`));
  await browser.getByRole("button", { name: "Workspace, workspace", exact: true }).click();
  await expect(browser.getByRole("dialog", { name: "Component details" })).toBeVisible();
}

Given("the reviewed baseline is open for side-panel inspection", async function (this: InspectionWorld) {
  await openFixture(this, true);
});
Given("a baseline without components is open for side-panel inspection", async function (this: InspectionWorld) {
  await openFixture(this, false);
});
When("the user selects Workspace once", async function (this: InspectionWorld) { await selectWorkspace(this); });
Given("Workspace is selected in the side panel", async function (this: InspectionWorld) { await selectWorkspace(this); });

Then("the side panel lists the five interfaces owned by Workspace", async function (this: InspectionWorld) {
  const panel = page(this).getByRole("dialog", { name: "Component details" });
  await expect(panel.getByRole("region", { name: "Owned interfaces" }).getByRole("button")).toHaveCount(5);
  await expect(panel).toHaveAttribute("aria-modal", "false");
});
Then("inspection preserves the diagram camera", async function (this: InspectionWorld) {
  assert.ok(this.inspectionCamera);
  await expect.poll(() => camera(page(this))).toEqual(this.inspectionCamera);
});
Then("inspection preserves the diagram camera and positions", async function (this: InspectionWorld) {
  assert.ok(this.inspectionCamera && this.inspectionPositions);
  const browser = page(this);
  await expect.poll(() => camera(browser)).toEqual(this.inspectionCamera);
  const positions = await browser.locator(".react-flow__node").evaluateAll((nodes) =>
    nodes.map((node) => `${node.getAttribute("data-id")}: ${(node as HTMLElement).style.transform}`));
  assert.deepEqual(positions, this.inspectionPositions);
});

When("the user selects Native shell on the drawing", async function (this: InspectionWorld) {
  await page(this).getByRole("dialog").getByRole("heading", { name: "Component details", exact: true }).focus();
  this.inspectionCamera = await camera(page(this));
  await page(this).getByRole("button", { name: "Native shell, native-shell", exact: true }).click();
});
Then("the side panel shows Native shell and its owned interfaces", async function (this: InspectionWorld) {
  const panel = page(this).getByRole("dialog", { name: "Component details" });
  await expect(panel.getByRole("heading", { name: "Native shell", exact: true })).toBeVisible();
  await expect(panel.getByRole("region", { name: "Owned interfaces" }).getByRole("button")).toHaveCount(1);
  await expect(page(this).getByRole("button", { name: "Native shell, native-shell", exact: true })).toBeFocused();
  await expect.poll(() => camera(page(this))).toEqual(this.inspectionCamera);
});
Then("the canvas remains available for pan and zoom", async function (this: InspectionWorld) {
  const browser = page(this);
  const before = await camera(browser);
  await browser.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect.poll(async () => (await camera(browser))[0]).toBeGreaterThan(before[0] ?? 0);
  const zoomed = await camera(browser);
  const canvas = await browser.getByLabel("Architecture diagram", { exact: true }).boundingBox();
  assert.ok(canvas);
  await browser.mouse.move(canvas.x + 60, canvas.y + 20);
  await browser.mouse.down();
  await browser.mouse.move(canvas.x + 110, canvas.y + 60, { steps: 5 });
  await browser.mouse.up();
  await expect.poll(async () => (await camera(browser))[1]).not.toBe(zoomed[1]);
  await expect(browser.getByRole("dialog")).toBeVisible();
});

Given("an interface from Workspace is being inspected", async function (this: InspectionWorld) {
  await page(this).setViewportSize({ width: 1280, height: 480 });
  await selectWorkspace(this);
  const panel = page(this).getByRole("dialog");
  const row = panel.getByRole("region", { name: "Owned interfaces" }).getByRole("button").last();
  this.inspectionRow = await row.getAttribute("aria-label") ?? undefined;
  await row.focus();
  this.inspectionScroll = await panel.getByLabel("Record content", { exact: true }).evaluate((node) => node.scrollTop);
  assert.ok(this.inspectionScroll > 0, "The originating list must be scrolled to exercise restoration.");
  await row.press("Enter");
  await expect(page(this).getByRole("dialog", { name: "Interface details" })).toBeVisible();
});
When("the user returns to Workspace in the panel", async function (this: InspectionWorld) {
  await page(this).getByRole("button", { name: "Back", exact: true }).click();
});
Then("the originating interface entry regains focus and its list position", async function (this: InspectionWorld) {
  assert.ok(this.inspectionRow);
  const panel = page(this).getByRole("dialog", { name: "Component details" });
  await expect(panel.getByRole("button", { name: this.inspectionRow, exact: true })).toBeFocused();
  assert.equal(await panel.getByLabel("Record content", { exact: true }).evaluate((node) => node.scrollTop), this.inspectionScroll);
});

When("the user selects its resource from Baseline details", async function (this: InspectionWorld) {
  const browser = page(this);
  await browser.getByRole("button", { name: "Baseline details", exact: true }).click();
  await browser.getByRole("dialog").getByRole("region", { name: "Resources", exact: true }).getByRole("button").click();
});
Then("the resource's recorded details and unknown owner are available", async function (this: InspectionWorld) {
  const panel = page(this).getByRole("dialog", { name: "Resource details" });
  await expect(panel.getByRole("group", { name: "Owner", exact: true })).toContainText("Unknown (null)");
  await expect(panel.getByRole("group", { name: "Resource ID", exact: true })).toContainText("invoice-store");
  await expect(panel.getByRole("group", { name: "Access rules", exact: true })).toBeVisible();
});

When("the user activates Workspace with the keyboard", async function (this: InspectionWorld) {
  const control = page(this).getByRole("button", { name: "Workspace, workspace", exact: true });
  await control.focus();
  await control.press("Enter");
});
Then("keyboard focus enters the component side panel", async function (this: InspectionWorld) {
  const panel = page(this).getByRole("dialog", { name: "Component details" });
  await expect(panel).toBeVisible();
  assert.equal(await panel.evaluate((node) => node.contains(document.activeElement)), true);
});
Then("the canvas remains reachable without closing the panel", async function (this: InspectionWorld) {
  const browser = page(this);
  for (let index = 0; index < 90; index += 1) {
    await browser.keyboard.press("Tab");
    if (await browser.locator(".react-flow").evaluate((node) => node.contains(document.activeElement))) break;
  }
  assert.equal(await browser.locator(".react-flow").evaluate((node) => node.contains(document.activeElement)), true);
  await expect(browser.getByRole("dialog")).toBeVisible();
});
Given("Workspace is selected while Native shell has keyboard focus", async function (this: InspectionWorld) {
  await selectWorkspace(this);
  await page(this).getByRole("button", { name: "Native shell, native-shell", exact: true }).focus();
});
When("the user closes side-panel inspection with Escape", async function (this: InspectionWorld) {
  await page(this).keyboard.press("Escape");
});
Then("the panel closes and Native shell keeps keyboard focus", async function (this: InspectionWorld) {
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
  await expect(page(this).getByRole("button", { name: "Native shell, native-shell", exact: true })).toBeFocused();
});
When("the inspection window is resized", async function (this: InspectionWorld) {
  this.inspectionCamera = await camera(page(this));
  await page(this).setViewportSize({ width: 1100, height: 720 });
});
When("the user inspects Workspace in a narrow window", async function (this: InspectionWorld) {
  await page(this).setViewportSize({ width: 320, height: 640 });
  await page(this).getByRole("button", { name: "Workspace, workspace", exact: true }).focus();
  await page(this).keyboard.press("Enter");
});
Then("the panel is below the usable canvas without horizontal page scrolling", async function (this: InspectionWorld) {
  const browser = page(this);
  const canvas = await browser.getByLabel("Architecture diagram", { exact: true }).boundingBox();
  const panel = await browser.getByRole("dialog").boundingBox();
  assert.ok(canvas && panel);
  assert.ok(canvas.height >= 100 && panel.height >= 100);
  assert.ok(panel.y >= canvas.y + canvas.height - 1);
  assert.equal(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
});

After({ tags: "@br-01" }, async function (this: InspectionWorld) {
  if (this.inspectionDirectory) await rm(this.inspectionDirectory, { recursive: true, force: true });
});
