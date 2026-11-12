import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { baselineExample } from "../support/baseline-fixtures.ts";

interface DiagramWorkspaceWorld extends World {
  page?: Page;
  initialCanvas?: { width: number; height: number };
  initialZoom?: number;
  initialTransform?: string;
}

function page(world: DiagramWorkspaceWorld): Page {
  assert.ok(world.page, "The browser scenario must open a page.");
  return world.page;
}

function savedDiagram(id = "baseline-example") {
  const baseline = baselineExample();
  baseline.id = id;
  return { name: `${id}.yaml`, mimeType: "application/yaml", buffer: Buffer.from(stringify(baseline)) };
}

function component(world: DiagramWorkspaceWorld, id: string) {
  return page(world).locator(".react-flow__node[data-id]").filter({ has: page(world).locator("code", { hasText: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) });
}

function readDiagramViewport(world: DiagramWorkspaceWorld): Promise<{ transform: string; zoom: number }> {
  return page(world).locator(".react-flow__viewport").evaluate((node) => {
    const transform = getComputedStyle(node).transform;
    return { transform, zoom: new DOMMatrixReadOnly(transform).a };
  });
}

Given("a saved architecture is open in the diagram workspace", { timeout: 30_000 }, async function (this: DiagramWorkspaceWorld) {
  const browserPage = page(this);
  await browserPage.setViewportSize({ width: 1280, height: 800 });
  await browserPage.goto(process.env.CHOOM_BASE_URL ?? (() => { throw new Error("Missing production preview URL"); })());
  const chooser = browserPage.waitForEvent("filechooser");
  await browserPage.getByRole("button", { name: "Open Baseline", exact: true }).click();
  await (await chooser).setFiles(savedDiagram());
  await expect(browserPage.locator(".react-flow__node[data-id]")).toHaveCount(4);
  await expect(browserPage.getByRole("heading", { name: "baseline-example", exact: true })).toBeVisible();
});

Then("the diagram fills the workspace below compact actions", async function (this: DiagramWorkspaceWorld) {
  const browserPage = page(this);
  const actions = browserPage.getByRole("navigation", { name: "Workspace actions" });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button", { name: "Open Baseline" })).toBeVisible();
  await expect(browserPage.getByRole("heading", { name: "Architecture starts here." })).toHaveCount(0);
  const canvas = await browserPage.getByLabel("Architecture diagram", { exact: true }).boundingBox();
  assert.ok(canvas);
  expect(canvas.x).toBeLessThanOrEqual(16);
  expect(canvas.y).toBeLessThanOrEqual(150);
  expect(canvas.width).toBeGreaterThanOrEqual(1248);
  expect(canvas.height).toBeGreaterThanOrEqual(640);
  expect(canvas.y + canvas.height).toBeGreaterThanOrEqual(784);
});

Then("analysis and component details are closed", async function (this: DiagramWorkspaceWorld) {
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
  for (const name of ["Recorded analysis", "Declared components", "Imports", "Findings"]) {
    await expect(page(this).getByRole("region", { name, exact: true })).toHaveCount(0);
  }
});

When("the diagram workspace window becomes larger", async function (this: DiagramWorkspaceWorld) {
  const canvas = await page(this).getByLabel("Architecture diagram", { exact: true }).boundingBox();
  assert.ok(canvas);
  this.initialCanvas = canvas;
  await page(this).setViewportSize({ width: 1600, height: 1000 });
});

Then("the diagram grows in width and height without page scrolling", async function (this: DiagramWorkspaceWorld) {
  const initial = this.initialCanvas;
  assert.ok(initial);
  await expect.poll(async () => {
    const box = await page(this).getByLabel("Architecture diagram", { exact: true }).boundingBox();
    return box ? box.width - initial.width : 0;
  }).toBeGreaterThanOrEqual(300);
  await expect.poll(async () => {
    const box = await page(this).getByLabel("Architecture diagram", { exact: true }).boundingBox();
    return box ? box.height - initial.height : 0;
  }).toBeGreaterThanOrEqual(180);
  const overflow = await page(this).evaluate(() => ({
    width: document.documentElement.scrollWidth - window.innerWidth,
    height: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.width).toBeLessThanOrEqual(1);
  expect(overflow.height).toBeLessThanOrEqual(1);
});

When("the user inspects component {string}", async function (this: DiagramWorkspaceWorld, id: string) {
  this.initialZoom = (await readDiagramViewport(this)).zoom;
  await component(this, id).getByRole("button").click();
});

Then("the component details identify {string} and purpose {string}", async function (this: DiagramWorkspaceWorld, name: string, purpose: string) {
  const dialog = page(this).getByRole("dialog", { name: "Component details", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name, exact: true })).toBeVisible();
  await dialog.getByText("Recorded details", { exact: true }).click();
  await expect(dialog.getByRole("group", { name: "Purpose", exact: true }).getByText(purpose, { exact: true })).toBeVisible();
});

When("the user activates component {string} with {string}", async function (this: DiagramWorkspaceWorld, id: string, key: string) {
  const button = component(this, id).getByRole("button");
  for (let tabs = 0; tabs < 100; tabs += 1) {
    await page(this).keyboard.press("Tab");
    if (await button.evaluate((node) => node === document.activeElement)) break;
  }
  await expect(button).toBeFocused();
  await page(this).keyboard.press(key === "Space" ? " " : key);
});

Given("component {string} is being inspected with a keyboard", async function (this: DiagramWorkspaceWorld, id: string) {
  const button = component(this, id).getByRole("button");
  await button.focus();
  await page(this).keyboard.press("Enter");
  await expect(page(this).getByRole("dialog", { name: "Component details", exact: true })).toBeVisible();
});

When("the user dismisses component details", async function (this: DiagramWorkspaceWorld) {
  await page(this).keyboard.press("Escape");
});

Then("component details are closed and component {string} has focus", async function (this: DiagramWorkspaceWorld, id: string) {
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
  await expect(component(this, id).getByRole("button")).toBeFocused();
});

When("a replacement diagram finishes while component details are open", async function (this: DiagramWorkspaceWorld) {
  const chooser = page(this).waitForEvent("filechooser");
  await page(this).getByRole("button", { name: "Open Baseline", exact: true }).click();
  const selection = await chooser;
  await component(this, "checkout").getByRole("button").click();
  await expect(page(this).getByRole("dialog", { name: "Component details", exact: true })).toBeVisible();
  await selection.setFiles(savedDiagram("replacement"));
});

Then("the replacement diagram is shown with all details closed", async function (this: DiagramWorkspaceWorld) {
  await expect(page(this).getByRole("heading", { name: "replacement", exact: true })).toBeVisible();
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});

Then("the diagram and document actions fit without page scrolling", async function (this: DiagramWorkspaceWorld) {
  const browserPage = page(this);
  for (const name of ["Open Baseline"]) {
    await expect(browserPage.getByRole("button", { name, exact: true })).toBeInViewport();
  }
  const canvas = await browserPage.getByLabel("Architecture diagram", { exact: true }).boundingBox();
  assert.ok(canvas);
  const viewport = browserPage.viewportSize();
  assert.ok(viewport);
  expect(canvas.width).toBeGreaterThanOrEqual(viewport.width - 32);
  expect(canvas.height).toBeGreaterThanOrEqual(viewport.height - 200);
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(viewport.height);
  const overflow = await browserPage.evaluate(() => ({
    width: document.documentElement.scrollWidth - window.innerWidth,
    height: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.width).toBeLessThanOrEqual(1);
  expect(overflow.height).toBeLessThanOrEqual(1);
});

Then("inspecting the component preserves the diagram zoom", async function (this: DiagramWorkspaceWorld) {
  const zoom = (await readDiagramViewport(this)).zoom;
  expect(zoom).toBe(this.initialZoom);
});

When("the diagram workspace is {int} pixels wide and {int} pixels tall", async function (this: DiagramWorkspaceWorld, width: number, height: number) {
  await page(this).setViewportSize({ width, height });
});

Given("component {string} is outside the visible diagram after panning", async function (this: DiagramWorkspaceWorld, id: string) {
  const browserPage = page(this);
  const canvas = await browserPage.getByLabel("Architecture diagram", { exact: true }).boundingBox();
  assert.ok(canvas);
  await browserPage.mouse.move(canvas.x + 80, canvas.y + 24);
  await browserPage.mouse.down();
  await browserPage.mouse.move(canvas.x + 1080, canvas.y + 24, { steps: 12 });
  await browserPage.mouse.up();
  await expect(component(this, id).getByRole("button")).not.toBeInViewport();
});

When("the user tabs to component {string}", async function (this: DiagramWorkspaceWorld, id: string) {
  const browserPage = page(this);
  const viewport = await readDiagramViewport(this);
  this.initialTransform = viewport.transform;
  this.initialZoom = viewport.zoom;
  const button = component(this, id).getByRole("button");
  for (let tabs = 0; tabs < 100; tabs += 1) {
    await browserPage.keyboard.press("Tab");
    if (await button.evaluate((node) => node === document.activeElement)) break;
  }
  await expect(button).toBeFocused();
});

Then("focused component {string} is fully visible in the diagram", async function (this: DiagramWorkspaceWorld, id: string) {
  const canvas = await page(this).getByLabel("Architecture diagram", { exact: true }).boundingBox();
  assert.ok(canvas);
  const button = component(this, id).getByRole("button");
  await expect.poll(async () => {
    const bounds = await button.boundingBox();
    return bounds !== null && bounds.x >= canvas.x - 1 && bounds.y >= canvas.y - 1
      && bounds.x + bounds.width <= canvas.x + canvas.width + 1
      && bounds.y + bounds.height <= canvas.y + canvas.height + 1;
  }, { timeout: 2_000, message: "Keyboard focus must reveal the whole component within the canvas" }).toBe(true);
  await expect(button).toBeFocused();
});

Then("keyboard navigation preserves the diagram zoom", async function (this: DiagramWorkspaceWorld) {
  const zoom = (await readDiagramViewport(this)).zoom;
  expect(zoom).toBe(this.initialZoom);
});

Then("the focused component opens details for {string}", async function (this: DiagramWorkspaceWorld, name: string) {
  await page(this).keyboard.press("Enter");
  const dialog = page(this).getByRole("dialog", { name: "Component details", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(name);
});

Then("keyboard navigation preserves the current diagram view", async function (this: DiagramWorkspaceWorld) {
  const { transform } = await readDiagramViewport(this);
  expect(transform).toBe(this.initialTransform);
});
