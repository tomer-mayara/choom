import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { architectureDocumentFixture } from "../support/document-fixtures.ts";

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

function savedDiagram(name = "Atlas", additionalFilePairs = 0) {
  const document = architectureDocumentFixture(name);
  document.analysis.scopeNotes = ["Only reported files are counted."];
  document.components.push({ id: "tools", name: "Tools", parent: ".", reportedFiles: 1 });
  document.relationships.push({
    id: "imports:packages%2Fcore:tools", kind: "imports", source: "packages/core", target: "tools",
    evidence: [{ sourceFile: "packages/core/extra.ts", targetFile: "tools/task.ts", variants: [{ dynamic: true }] }],
  });
  const workspaceImport = document.relationships[0];
  assert.ok(workspaceImport);
  for (let index = 0; index < additionalFilePairs; index += 1) {
    workspaceImport.evidence.push({
      sourceFile: `src/extended-file-${index}.ts`, targetFile: "packages/core/model/entity.ts", variants: [{}],
    });
  }
  return { name: `${name}.choom.yaml`, mimeType: "application/yaml", buffer: Buffer.from(stringify(document)) };
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
  await browserPage.goto(process.env.CHOOM_BASE_URL ?? "http://127.0.0.1:1420");
  const chooser = browserPage.waitForEvent("filechooser");
  await browserPage.getByRole("button", { name: "Open Diagram", exact: true }).click();
  await (await chooser).setFiles(savedDiagram());
  await expect(browserPage.locator(".react-flow__node[data-id]")).toHaveCount(4);
  await expect(browserPage.getByRole("heading", { name: "Atlas", exact: true })).toBeVisible();
});

Then("the diagram fills the workspace below compact actions", async function (this: DiagramWorkspaceWorld) {
  const browserPage = page(this);
  const actions = browserPage.getByRole("navigation", { name: "Workspace actions" });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button", { name: "Open Diagram" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Export Diagram" })).toBeEnabled();
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

When("the user requests the recorded analysis", async function (this: DiagramWorkspaceWorld) {
  await page(this).getByRole("button", { name: "Recorded analysis", exact: true }).click();
});

Then("the recorded analyzer, inputs, and scope are visible", async function (this: DiagramWorkspaceWorld) {
  const dialog = page(this).getByRole("dialog", { name: "Recorded analysis", exact: true });
  await expect(dialog).toBeVisible();
  const analysis = architectureDocumentFixture().analysis;
  await expect(dialog).toContainText(`${analysis.enforcer} ${analysis.version}`);
  await expect(dialog).toContainText(analysis.config);
  for (const input of analysis.inputs) await expect(dialog).toContainText(input);
  await expect(dialog).toContainText("Only reported files are counted.");
});

When("the user inspects component {string}", async function (this: DiagramWorkspaceWorld, id: string) {
  this.initialZoom = (await readDiagramViewport(this)).zoom;
  await component(this, id).dblclick();
});

Then("the component details identify {string} with parent {string} and {int} reported files", async function (this: DiagramWorkspaceWorld, name: string, parent: string, count: number) {
  const dialog = page(this).getByRole("dialog", { name: "Component details", exact: true });
  await expect(dialog).toBeVisible();
  const declaration = dialog.getByRole("region", { name: "Declared components", exact: true });
  await expect(declaration).toContainText(name);
  await expect(declaration).toContainText(parent);
  await expect(declaration).toContainText(`${count} files reported`);
});

Then("its imports show the recorded workspace file pairs and flags", async function (this: DiagramWorkspaceWorld) {
  const imports = page(this).getByRole("dialog", { name: "Component details", exact: true }).getByRole("region", { name: "Imports", exact: true });
  await expect(imports).toBeVisible();
  const relationship = imports.locator("details").filter({ hasText: "src → packages/core" });
  await relationship.locator("summary").click();
  for (const text of ["src/components/panel.ts", "src/lib/format.ts", "packages/core/model/entity.ts", "Type only: Unknown", "Type only: Yes"]) {
    await expect(relationship).toContainText(text);
  }
  await expect(relationship.locator("ul").first()).toBeVisible();
});

Then("unrelated import evidence is absent", async function (this: DiagramWorkspaceWorld) {
  const dialog = page(this).getByRole("dialog", { name: "Component details", exact: true });
  await expect(dialog).not.toContainText("packages/core/extra.ts");
  await expect(dialog).not.toContainText("tools/task.ts");
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

When("the user requests findings", async function (this: DiagramWorkspaceWorld) {
  await page(this).getByRole("button", { name: "Findings", exact: true }).click();
});

Then("the reported finding exposes its subject roles, paths, and metrics", async function (this: DiagramWorkspaceWorld) {
  const dialog = page(this).getByRole("dialog", { name: "Findings", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.locator("summary").click();
  for (const text of ["Source folder: src/components", "Target folder: packages/core/model", "Cycle", "Via", "__proto__"]) {
    await expect(dialog).toContainText(text);
  }
  await expect(dialog.getByRole("list", { name: "Cycle" })).toBeVisible();
});

When("a replacement diagram finishes while component details are open", async function (this: DiagramWorkspaceWorld) {
  const chooser = page(this).waitForEvent("filechooser");
  await page(this).getByRole("button", { name: "Open Diagram", exact: true }).click();
  const selection = await chooser;
  await component(this, "src").dblclick();
  await expect(page(this).getByRole("dialog", { name: "Component details", exact: true })).toBeVisible();
  await selection.setFiles(savedDiagram("Replacement"));
});

Then("the replacement diagram is shown with all details closed", async function (this: DiagramWorkspaceWorld) {
  await expect(page(this).getByRole("heading", { name: "Replacement", exact: true })).toBeVisible();
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});

When("the diagram workspace uses a small window", async function (this: DiagramWorkspaceWorld) {
  await page(this).setViewportSize({ width: 640, height: 480 });
});

Then("the diagram and document actions fit without page scrolling", async function (this: DiagramWorkspaceWorld) {
  const browserPage = page(this);
  for (const name of ["Open Diagram", "Export Diagram"]) {
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

Given("the diagram includes many import file pairs", async function (this: DiagramWorkspaceWorld) {
  const chooser = page(this).waitForEvent("filechooser");
  await page(this).getByRole("button", { name: "Open Diagram", exact: true }).click();
  await (await chooser).setFiles(savedDiagram("Extensive", 80));
  await expect(page(this).getByRole("heading", { name: "Extensive", exact: true })).toBeVisible();
});

Then("every import file pair can be reached without scrolling the page", async function (this: DiagramWorkspaceWorld) {
  const dialog = page(this).getByRole("dialog", { name: "Component details", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("region", { name: "Imports", exact: true }).locator("summary").click();
  const lastPair = dialog.getByText("src/extended-file-79.ts", { exact: true });
  await lastPair.scrollIntoViewIfNeeded();
  await expect(lastPair).toBeInViewport();
  const bounds = await dialog.boundingBox();
  assert.ok(bounds);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(640);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(480);
  const pageBounds = await page(this).evaluate(() => ({
    scroll: window.scrollY,
    overflow: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(pageBounds.scroll).toBe(0);
  expect(pageBounds.overflow).toBeLessThanOrEqual(1);
});

When("the diagram workspace is {int} pixels wide and {int} pixels tall", async function (this: DiagramWorkspaceWorld, width: number, height: number) {
  await page(this).setViewportSize({ width, height });
});

Given("the recorded analysis is open", async function (this: DiagramWorkspaceWorld) {
  await page(this).getByRole("button", { name: "Recorded analysis", exact: true }).click();
  await expect(page(this).getByRole("dialog", { name: "Recorded analysis", exact: true })).toBeVisible();
});

When("the user returns to the canvas outside the analysis", async function (this: DiagramWorkspaceWorld) {
  const bounds = await page(this).getByRole("dialog", { name: "Recorded analysis", exact: true }).boundingBox();
  assert.ok(bounds);
  expect(bounds.x).toBeGreaterThan(0);
  await page(this).mouse.click(bounds.x / 2, bounds.y + bounds.height / 2);
});

Then("analysis is closed and its control has focus", async function (this: DiagramWorkspaceWorld) {
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
  await expect(page(this).getByRole("button", { name: "Recorded analysis", exact: true })).toBeFocused();
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
  await expect(dialog.getByRole("region", { name: "Declared components", exact: true })).toContainText(name);
});

Then("keyboard navigation preserves the current diagram view", async function (this: DiagramWorkspaceWorld) {
  const { transform } = await readDiagramViewport(this);
  expect(transform).toBe(this.initialTransform);
});
