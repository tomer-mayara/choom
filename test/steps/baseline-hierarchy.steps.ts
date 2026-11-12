import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import { baselineAtComponentLimits, baselineOverDisplayLimit, baselineWithComponents } from "../support/baseline-layout-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";

interface BaselineHierarchyWorld extends World {
  page?: Page;
  hierarchyDirectory?: string;
  hierarchyPath?: string;
  hierarchyBaselineId?: string;
  hierarchyViewer?: BaselineBrowserDriver;
}

async function openViewer(world: BaselineHierarchyWorld): Promise<void> {
  assert.ok(world.page, "The browser hook must supply a real page.");
  await world.page.setViewportSize({ width: 1280, height: 800 });
  world.hierarchyDirectory = await mkdtemp(join(tmpdir(), "choom-baseline-hierarchy-"));
  world.hierarchyViewer = new BaselineBrowserDriver(world.page);
  await world.hierarchyViewer.open();
}

async function prepareBaseline(world: BaselineHierarchyWorld, baseline: Baseline): Promise<void> {
  assert.ok(world.hierarchyDirectory);
  assert.equal(baselineSchema.safeParse(baseline).success, true,
    "A display-limit fixture must satisfy the baseline domain contract.");
  const text = stringify(baseline, { aliasDuplicateObjects: false });
  const decoded = decodeBaselineYaml(text);
  assert.equal(decoded.status, "success",
    `A display-limit fixture must pass the real YAML decoder: ${JSON.stringify(decoded)}`);
  world.hierarchyPath = join(world.hierarchyDirectory, `${baseline.id}.yaml`);
  world.hierarchyBaselineId = baseline.id;
  await writeFile(world.hierarchyPath, text);
}

Given("the reviewed five-component baseline is ready to open", async function (this: BaselineHierarchyWorld) {
  await openViewer(this);
  assert.ok(this.hierarchyDirectory);
  this.hierarchyPath = join(this.hierarchyDirectory, "baseline.yaml");
  await copyFile(new URL("../fixtures/baseline-viewer/full.yaml", import.meta.url), this.hierarchyPath);
  const decoded = decodeBaselineYaml(await readFile(this.hierarchyPath, "utf8"));
  assert.equal(decoded.status, "success");
  this.hierarchyBaselineId = "baseline-002";
});

Given("the Previous baseline is displayed", { timeout: 30_000 }, async function (this: BaselineHierarchyWorld) {
  await openViewer(this);
  const previous = baselineWithComponents(1);
  previous.id = "previous";
  await prepareBaseline(this, previous);
  assert.ok(this.hierarchyViewer && this.hierarchyPath && this.page);
  await this.hierarchyViewer.openBaseline(this.hierarchyPath);
  await expect(this.page.getByRole("heading", { name: "previous", exact: true })).toBeVisible();
});

Given(/^the next baseline exceeds the (.+) display limit$/, async function (this: BaselineHierarchyWorld, limit: string) {
  await prepareBaseline(this, baselineOverDisplayLimit(limit));
});

Given("a baseline with 500 components and 16 levels is ready in a {int} by {int} window", async function (this: BaselineHierarchyWorld, width: number, height: number) {
  await openViewer(this);
  assert.ok(this.page);
  await this.page.setViewportSize({ width, height });
  await prepareBaseline(this, baselineAtComponentLimits());
});

Given("a baseline at the component limits is open", { timeout: 30_000 }, async function (this: BaselineHierarchyWorld) {
  await openViewer(this);
  await prepareBaseline(this, baselineAtComponentLimits());
  assert.ok(this.hierarchyViewer && this.hierarchyPath && this.page);
  await this.hierarchyViewer.openBaseline(this.hierarchyPath);
  await expect(this.page.locator(".react-flow__node[data-id]")).toHaveCount(500);
});

Given("its large parent header is outside the diagram after panning", { timeout: 30_000 }, async function (this: BaselineHierarchyWorld) {
  assert.ok(this.page);
  const page = this.page;
  const diagram = page.getByLabel("Architecture diagram", { exact: true });
  for (let step = 0; step < 30; step += 1) {
    const zoom = await page.locator(".react-flow__viewport").evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).a);
    if (zoom >= 1) break;
    await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  }
  const canvas = await diagram.boundingBox();
  const parent = await page.locator('.react-flow__node[data-id="component-0"]').boundingBox();
  assert.ok(canvas && parent);
  assert.ok(parent.height > canvas.height, "This group must be larger than the visible canvas.");
  const start = await page.locator(".react-flow__pane").evaluate((pane) => {
    const bounds = pane.getBoundingClientRect();
    for (let y = bounds.y + 24; y < bounds.bottom - 24; y += 24) {
      for (let x = bounds.x + 24; x < bounds.right - 24; x += 24) {
        if (document.elementFromPoint(x, y) === pane) return { x, y };
      }
    }
    throw new Error("The diagram must have space for panning.");
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 1000, start.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Component 0, component-0", exact: true })).not.toBeInViewport();
  await page.getByRole("button", { name: "Open Baseline", exact: true }).focus();
});

When("the user opens the prepared hierarchy baseline", async function (this: BaselineHierarchyWorld) {
  assert.ok(this.hierarchyViewer && this.hierarchyPath);
  await this.hierarchyViewer.openBaseline(this.hierarchyPath);
});

When("the user fits the hierarchy after zooming in", async function (this: BaselineHierarchyWorld) {
  assert.ok(this.page);
  await this.page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await this.page.getByRole("button", { name: "Fit View", exact: true }).click();
});

Then("all 500 components fit inside the diagram", { timeout: 30_000 }, async function (this: BaselineHierarchyWorld) {
  assert.ok(this.page);
  await expect(this.page.locator(".react-flow__node[data-id]")).toHaveCount(500);
  await expect.poll(() => this.page?.evaluate(() => {
    const canvas = document.querySelector('[aria-label="Architecture diagram"]')?.getBoundingClientRect();
    const nodes = [...document.querySelectorAll(".react-flow__node[data-id]")];
    return canvas !== undefined && nodes.length === 500 && nodes.every((node) => {
      const item = node.getBoundingClientRect();
      return [item.x, item.y, item.width, item.height].every(Number.isFinite)
        && item.width > 0 && item.height > 0 && item.x >= canvas.x - 1 && item.y >= canvas.y - 1
        && item.right <= canvas.right + 1 && item.bottom <= canvas.bottom + 1;
    });
  }), { message: "Every prepared component must fit in the available canvas." }).toBe(true);
});

Then("the hierarchy starts at 100 percent with its first root header visible", { timeout: 30_000 }, async function (this: BaselineHierarchyWorld) {
  assert.ok(this.page);
  const page = this.page;
  await expect(page.locator(".react-flow__node")).toHaveCount(500);
  await expect.poll(() => page.locator(".react-flow__viewport").evaluate((node) =>
    new DOMMatrixReadOnly(getComputedStyle(node).transform).a)).toBe(1);
  await expect(page.getByRole("button", { name: "Component 0, component-0", exact: true })).toBeInViewport({ ratio: 0.999 });
});

async function assertContained(page: Page, parentId: string, childIds: string[]): Promise<void> {
  await expect(page.getByRole("heading", { name: "baseline-002", exact: true })).toBeVisible();
  const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
  await expect(parentNode).toBeVisible();
  await expect.poll(() => page.evaluate(({ parentId, childIds }) => {
    const parentNode = document.querySelector(`.react-flow__node[data-id="${parentId}"]`);
    const parent = parentNode?.getBoundingClientRect();
    const header = parentNode?.querySelector("button")?.getBoundingClientRect();
    if (!parent || !header) return false;
    return childIds.every((childId) => {
      const child = document.querySelector(`.react-flow__node[data-id="${childId}"]`)?.getBoundingClientRect();
      return child !== undefined && child.x >= parent.x - 1 && child.y >= header.y + header.height - 1
        && child.right <= parent.right + 1 && child.bottom <= parent.bottom + 1;
    });
  }, { parentId, childIds }), {
    message: `The children must appear inside ${parentId}, below its inspection control.`,
  }).toBe(true);
}

Then("Workspace and Native shell appear inside Choom", async function (this: BaselineHierarchyWorld) {
  assert.ok(this.page);
  await assertContained(this.page, "choom", ["workspace", "native-shell"]);
});

Then("Architecture model and Platform adapter appear inside Workspace", async function (this: BaselineHierarchyWorld) {
  assert.ok(this.page);
  await assertContained(this.page, "workspace", ["architecture-model", "desktop-adapter"]);
});

Then("each component name and inspection control is reachable", { timeout: 30_000 }, async function (this: BaselineHierarchyWorld) {
  assert.ok(this.page);
  const page = this.page;
  const components = new Map([
    ["choom", "Choom"], ["workspace", "Workspace"], ["native-shell", "Native shell"],
    ["architecture-model", "Architecture model"], ["desktop-adapter", "Platform adapter"],
  ]);
  for (let step = 0; step < 30 && components.size > 0; step += 1) {
    await page.keyboard.press("Tab");
    for (const [id, name] of components) {
      const button = page.getByRole("button", { name: `${name}, ${id}`, exact: true });
      if (!(await button.evaluate((element) => element === document.activeElement))) continue;
      // Leave room for fractional-pixel rounding in the browser intersection ratio.
      await expect(button).toBeInViewport({ ratio: 0.999 });
      await expect(button).toContainText(name);
      await page.keyboard.press("Enter");
      const panel = page.getByRole("dialog", { name: "Component details" });
      await expect(panel.getByRole("heading", { name, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(button).toBeFocused();
      components.delete(id);
      break;
    }
  }
  assert.deepEqual([...components.values()], [], "Every component, including each parent, must be inspectable with the keyboard.");
});

Then("Previous remains displayed with a size-limit message", { timeout: 30_000 }, async function (this: BaselineHierarchyWorld) {
  assert.ok(this.page && this.hierarchyBaselineId);
  const page = this.page;
  const nextId = this.hierarchyBaselineId;
  await expect.poll(async () => await page.getByRole("alert").count() > 0
    || await page.getByRole("heading", { name: nextId, exact: true }).count() > 0).toBe(true);
  await expect(page.getByRole("button", { name: "Open Baseline", exact: true })).toBeEnabled();
  const messages = await page.getByRole("alert").allTextContents();
  assert.ok(messages.some((message) => message.includes("Too large to display")),
    `The viewer must report the display limit. Actual alerts: ${JSON.stringify(messages)}`);
  await expect(page.getByRole("heading", { name: "previous", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: nextId, exact: true })).toHaveCount(0);
});

After({ tags: "@bv-04 or @br-02" }, async function (this: BaselineHierarchyWorld) {
  if (this.hierarchyDirectory) await rm(this.hierarchyDirectory, { recursive: true, force: true });
});
