import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type CDPSession, type Locator, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { baselineWithoutComponents } from "../support/baseline-relationship-fixtures.ts";

const expect = browserExpect.configure({ timeout: 2_000 });
interface Geometry { id: string; x: number; y: number; width: number; height: number }
interface Camera { x: number; y: number; zoom: number }
interface ResetWorld extends World {
  page?: Page;
  resetDirectory?: string;
  resetFile?: string;
  resetBytes?: Buffer;
  resetInitial?: Geometry[];
  resetManual?: Geometry[];
  resetCamera?: Camera;
  resetFirst?: { geometry: Geometry[]; camera: Camera };
  resetRecordLabel?: string;
  resetRecordId?: string;
  resetRecordScroll?: number;
  resetEmptyKind?: string;
  resetPointer?: { x: number; y: number; ending: string; touch?: CDPSession };
}

function page(world: ResetWorld): Page { assert.ok(world.page); return world.page; }
function header(world: ResetWorld, id: string): Locator {
  return page(world).locator(`.react-flow__node[data-id="${id}"]`).getByRole("button");
}
function node(nodes: Geometry[] | undefined, id: string): Geometry {
  const item = nodes?.find((entry) => entry.id === id);
  assert.ok(item, `Expected rendered component ${id}.`);
  return item;
}
async function geometry(world: ResetWorld): Promise<Geometry[]> {
  return page(world).locator(".react-flow__node[data-id]").evaluateAll((nodes) => nodes.map((item) => {
    const element = item as HTMLElement;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    const round = (value: number) => Math.round(value * 1000) / 1000;
    return { id: element.dataset.id ?? "", x: round(matrix.e), y: round(matrix.f),
      width: element.offsetWidth, height: element.offsetHeight };
  }).sort((a, b) => a.id.localeCompare(b.id)));
}
async function camera(world: ResetWorld): Promise<Camera> {
  return page(world).locator(".react-flow__viewport").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
    return { x: round(matrix.e), y: round(matrix.f), zoom: round(matrix.a) };
  });
}
async function paint(world: ResetWorld): Promise<void> {
  await page(world).evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function rememberRecordScroll(world: ResetWorld): Promise<void> {
  world.resetRecordScroll = await page(world).getByRole("dialog").getByLabel("Record content", { exact: true })
    .evaluate((element) => element.scrollTop);
}
async function allComponentsFit(world: ResetWorld): Promise<boolean> {
  return page(world).locator(".react-flow").evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    return [...canvas.querySelectorAll(".react-flow__node")].every((element) => {
      const item = element.getBoundingClientRect();
      return item.left >= bounds.left - 1 && item.top >= bounds.top - 1 && item.right <= bounds.right + 1 && item.bottom <= bounds.bottom + 1;
    });
  });
}
async function tabTo(world: ResetWorld, target: Locator): Promise<void> {
  for (let step = 0; step < 50; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page(world).keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
async function open(world: ResetWorld, empty?: string): Promise<void> {
  const browser = page(world);
  await browser.setViewportSize({ width: 1280, height: 800 });
  world.resetDirectory = await mkdtemp(join(tmpdir(), "choom-reset-"));
  world.resetFile = join(world.resetDirectory, "baseline.yaml");
  if (empty === "unowned records but no components") {
    await writeFile(world.resetFile, stringify(baselineWithoutComponents()));
  } else {
    await copyFile(new URL(`../fixtures/baseline-viewer/${empty ? "empty" : "full"}.yaml`, import.meta.url), world.resetFile);
  }
  world.resetBytes = await readFile(world.resetFile);
  const driver = new BaselineBrowserDriver(browser);
  await driver.open();
  await driver.openBaseline(world.resetFile);
  await expect(browser.getByText("Baseline ready.", { exact: true })).toBeVisible();
  await expect(browser.locator(".react-flow__node")).toHaveCount(empty ? 0 : 5);
  await paint(world);
  world.resetInitial = await geometry(world);
  if (!empty) await expect.poll(async () => (await camera(world)).zoom).toBe(1);
}
async function drag(world: ResetWorld, id: string, dx: number, dy: number): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const [bounds, canvas, view] = await Promise.all([
      header(world, id).boundingBox(), page(world).locator(".react-flow").boundingBox(), camera(world),
    ]);
    assert.ok(bounds && canvas);
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const end = { x: start.x + dx * view.zoom, y: start.y + dy * view.zoom };
    if (start.x > canvas.x && start.y > canvas.y && end.x < canvas.x + canvas.width - 4 && end.y < canvas.y + canvas.height - 4) {
      await page(world).mouse.move(start.x, start.y);
      await page(world).mouse.down();
      await page(world).mouse.move(end.x, end.y, { steps: 5 });
      await page(world).mouse.up();
      await paint(world);
      return;
    }
    await page(world).getByRole("button", { name: "Zoom Out", exact: true }).click();
    await paint(world);
  }
  assert.fail("The manual arrangement needs space for a real pointer drag.");
}
async function reset(world: ResetWorld, keyboard = false): Promise<void> {
  const control = page(world).getByRole("button", { name: "Reset layout", exact: true });
  // A missing control must fail an assertion, before Cucumber's step watchdog.
  await expect(control).toBeVisible();
  if (keyboard) {
    await tabTo(world, control);
    // Tab can scroll the panel while it crosses its controls. Compare the state
    // immediately before Reset, so the assertion measures Reset itself.
    await rememberRecordScroll(world);
    await page(world).keyboard.press("Enter");
  }
  else await control.click();
  await paint(world);
}

Given("the reviewed baseline is open for layout controls", { timeout: 30_000 }, async function (this: ResetWorld) { await open(this); });
Given(/^a baseline with (four empty collections|unowned records but no components) is open for layout controls$/, { timeout: 30_000 }, async function (this: ResetWorld, records: string) {
  this.resetEmptyKind = records;
  await open(this, records);
});
Given("its manual arrangement has grown bounds and an owned record open", { timeout: 30_000 }, async function (this: ResetWorld) {
  await drag(this, "workspace", 35, 25);
  const before = await geometry(this);
  const child = node(before, "architecture-model");
  const parent = node(before, "workspace");
  await drag(this, child.id, parent.x + parent.width + 40 - child.x, parent.y + parent.height + 40 - child.y);
  const browser = page(this);
  await browser.getByRole("button", { name: "Baseline details", exact: true }).click();
  await browser.getByRole("dialog").getByRole("region", { name: "Components", exact: true })
    .getByRole("button", { name: "Workspace, workspace", exact: true }).click();
  const entry = browser.getByRole("dialog").getByRole("region", { name: "Owned interfaces" }).getByRole("button").last();
  this.resetRecordLabel = await entry.getAttribute("aria-label") ?? undefined;
  await entry.click();
  this.resetRecordId = await browser.getByRole("dialog").getByRole("group", { name: "Interface ID", exact: true }).locator("p").nth(1).textContent() ?? undefined;
  const content = browser.getByRole("dialog").getByLabel("Record content", { exact: true });
  await content.hover();
  await browser.mouse.wheel(0, 180);
  await paint(this);
  await rememberRecordScroll(this);
  this.resetManual = await geometry(this);
  this.resetCamera = await camera(this);
  assert.notDeepEqual(this.resetManual, this.resetInitial);
  assert.ok(node(this.resetManual, "workspace").width > node(this.resetInitial, "workspace").width);
  assert.ok(node(this.resetManual, "workspace").height > node(this.resetInitial, "workspace").height);
});

Given("the layout-control window is {int} pixels wide and {int} pixels tall", async function (this: ResetWorld, width: number, height: number) {
  await page(this).setViewportSize({ width, height });
  await paint(this);
  await rememberRecordScroll(this);
});
Given("part of the manual arrangement is outside the canvas", async function (this: ResetWorld) {
  for (let attempt = 0; attempt < 8 && await allComponentsFit(this); attempt += 1) {
    await page(this).getByRole("button", { name: "Zoom In", exact: true }).click();
    await paint(this);
  }
  assert.equal(await allComponentsFit(this), false, "Fit must include components that start outside the canvas.");
});
Given("a keyboard component move has announced its position", async function (this: ResetWorld) {
  await tabTo(this, header(this, "workspace"));
  await page(this).keyboard.press("ArrowRight");
  await expect(page(this).getByLabel("Component position", { exact: true })).toContainText("Workspace: position");
});
When("the user resets the layout", async function (this: ResetWorld) { await reset(this); });
When("the user resets the layout twice", async function (this: ResetWorld) {
  await reset(this);
  this.resetFirst = { geometry: await geometry(this), camera: await camera(this) };
  await reset(this);
});
When("the user fits the current arrangement with the keyboard", async function (this: ResetWorld) {
  const fit = page(this).getByRole("button", { name: "Fit View", exact: true });
  await tabTo(this, fit);
  await rememberRecordScroll(this);
  await page(this).keyboard.press("Enter");
  await paint(this);
});
When("the layout-control window is resized", async function (this: ResetWorld) {
  await page(this).setViewportSize({ width: 1100, height: 720 });
  await paint(this);
});
When("the user opens its baseline catalog", async function (this: ResetWorld) {
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
});

Then("the prepared positions and bounds return at the normal starting view", async function (this: ResetWorld) {
  await expect.poll(() => geometry(this)).toEqual(this.resetInitial);
  await expect.poll(async () => (await camera(this)).zoom).toBe(1);
  const canvas = await page(this).locator(".react-flow").boundingBox();
  const root = await page(this).locator('.react-flow__node[data-id="choom"]').boundingBox();
  assert.ok(canvas && root);
  const fits = root.width + 48 <= canvas.width && root.height + 48 <= canvas.height;
  assert.ok(Math.abs(root.x - canvas.x - (fits ? (canvas.width - root.width) / 2 : 24)) < 1);
  assert.ok(Math.abs(root.y - canvas.y - (fits ? (canvas.height - root.height) / 2 : 24)) < 1);
});
Then("the inspected record and its scroll position stay unchanged", async function (this: ResetWorld) {
  const panel = page(this).getByRole("dialog", { name: "Interface details", exact: true });
  await expect(panel).toBeVisible();
  assert.ok(this.resetRecordId);
  await expect(panel.getByRole("group", { name: "Interface ID", exact: true })).toContainText(this.resetRecordId);
  await expect(header(this, "workspace")).toHaveAttribute("aria-pressed", "true");
  assert.equal(await panel.getByLabel("Record content", { exact: true }).evaluate((element) => element.scrollTop), this.resetRecordScroll);
});
Then("Back still returns through Workspace to the baseline catalog", async function (this: ResetWorld) {
  assert.ok(this.resetRecordLabel);
  await page(this).getByRole("button", { name: "Back", exact: true }).click();
  const component = page(this).getByRole("dialog", { name: "Component details", exact: true });
  await expect(component.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: this.resetRecordLabel, exact: true })).toBeFocused();
  await page(this).getByRole("button", { name: "Back", exact: true }).click();
  await expect(page(this).getByRole("dialog", { name: "Baseline details", exact: true })
    .getByRole("button", { name: "Workspace, workspace", exact: true })).toBeFocused();
});
Then("all components fit in the current canvas beside or above the panel", async function (this: ResetWorld) {
  await expect.poll(() => allComponentsFit(this)).toBe(true);
});
Then("the manual component positions and bounds stay unchanged", async function (this: ResetWorld) { assert.deepEqual(await geometry(this), this.resetManual); });
Then("the layout-control camera stays unchanged", async function (this: ResetWorld) { assert.deepEqual(await camera(this), this.resetCamera); });
Then("Fit view remains available", async function (this: ResetWorld) { await expect(page(this).getByRole("button", { name: "Fit View", exact: true })).toBeEnabled(); });
Then("both resets produce the same geometry and camera", async function (this: ResetWorld) {
  assert.deepEqual({ geometry: await geometry(this), camera: await camera(this) }, this.resetFirst);
});
Then("Reset is announced without the old movement coordinates", async function (this: ResetWorld) {
  await expect(page(this).getByLabel("Component position", { exact: true })).toHaveText("Layout reset.");
});
Then("layout controls leave the selected file unchanged", async function (this: ResetWorld) {
  assert.ok(this.resetFile && this.resetBytes);
  assert.deepEqual(await readFile(this.resetFile), this.resetBytes);
});
Then("Fit view and Reset layout are unavailable", async function (this: ResetWorld) {
  await expect(page(this).getByRole("button", { name: "Fit View", exact: true })).toHaveCount(0);
  await expect(page(this).getByRole("button", { name: "Reset layout", exact: true })).toHaveCount(0);
});
Then("the saved record lists remain usable", async function (this: ResetWorld) {
  const panel = page(this).getByRole("dialog", { name: "Baseline details", exact: true });
  const count = this.resetEmptyKind === "four empty collections" ? 0 : 1;
  await expect(panel.getByRole("region", { name: "Components", exact: true }).getByRole("button")).toHaveCount(0);
  for (const name of ["Interfaces", "Resources"]) {
    await expect(panel.getByRole("region", { name, exact: true }).getByRole("button")).toHaveCount(count);
  }
  if (count) {
    await panel.getByRole("region", { name: "Resources", exact: true }).getByRole("button").click();
    await expect(page(this).getByRole("dialog", { name: "Resource details", exact: true }).getByRole("group", { name: "Owner", exact: true })).toContainText("Unknown (null)");
  }
});

Given(/^a component pointer cycle is held at (a short press|an active drag) before (release|cancellation)$/, async function (this: ResetWorld, phase: string, ending: string) {
  await page(this).getByRole("button", { name: "Fit View", exact: true }).click();
  await paint(this);
  const bounds = await header(this, "workspace").boundingBox();
  assert.ok(bounds);
  const pointer = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, ending,
    touch: ending === "cancellation" ? await page(this).context().newCDPSession(page(this)) : undefined };
  this.resetPointer = pointer;
  const x = pointer.x + (phase === "an active drag" ? 35 : 1);
  const y = pointer.y + (phase === "an active drag" ? 25 : 1);
  if (pointer.touch) {
    await pointer.touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pointer.x, y: pointer.y, id: 1 }] });
    await pointer.touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
  } else {
    await page(this).mouse.move(pointer.x, pointer.y);
    await page(this).mouse.down();
    await page(this).mouse.move(x, y, { steps: 3 });
  }
  await paint(this);
  if (phase === "an active drag") assert.notDeepEqual(await geometry(this), this.resetManual);
  else assert.deepEqual(await geometry(this), this.resetManual);
});
When("the user activates Reset layout with the keyboard during that pointer cycle", async function (this: ResetWorld) { await reset(this, true); });
Then(/^later pointer movement and (release|cancellation) cannot change the reset view$/, async function (this: ResetWorld, ending: string) {
  const pointer = this.resetPointer;
  assert.ok(pointer && pointer.ending === ending);
  const before = { geometry: await geometry(this), camera: await camera(this) };
  if (pointer.touch) {
    await pointer.touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pointer.x + 20, y: pointer.y + 10, id: 1 }] });
    await pointer.touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  } else {
    await page(this).mouse.move(pointer.x + 20, pointer.y + 10, { steps: 3 });
    await page(this).mouse.up();
  }
  await paint(this);
  assert.deepEqual({ geometry: await geometry(this), camera: await camera(this) }, before);
});

After({ tags: "@br-04" }, async function (this: ResetWorld) {
  if (this.resetPointer?.touch && this.page && !this.page.isClosed()) await this.resetPointer.touch.detach();
  if (this.resetDirectory) await rm(this.resetDirectory, { recursive: true, force: true });
});
