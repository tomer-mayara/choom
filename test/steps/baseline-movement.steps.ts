import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type JSHandle, type Locator, type Page } from "@playwright/test";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";

const expect = browserExpect.configure({ timeout: 2_000 });

interface Geometry { id: string; x: number; y: number; width: number; height: number }
interface Camera { x: number; y: number; zoom: number }
interface MovementWorld extends World {
  page?: Page;
  movementDirectory?: string;
  movementFile?: string;
  movementBytes?: Buffer;
  movementDriver?: BaselineBrowserDriver;
  movementInitial?: Geometry[];
  movementInitialCamera?: Camera;
  movementBefore?: Geometry[];
  movementCamera?: Camera;
  movementPointer?: { x: number; y: number };
  movementDelta?: { x: number; y: number };
  movementEntry?: Locator;
  movementHoldNext?: boolean;
  movementRelease?: () => void;
  movementCompleted?: number;
  movementOutsideFocus?: JSHandle<Element | null>;
}

function page(world: MovementWorld): Page {
  assert.ok(world.page, "The browser scenario must have a page.");
  return world.page;
}

function driver(world: MovementWorld): BaselineBrowserDriver {
  assert.ok(world.movementDriver, "The movement scenario must open the real viewer.");
  return world.movementDriver;
}

function header(world: MovementWorld, id: string): Locator {
  return page(world).locator(`.react-flow__node[data-id="${id}"]`).getByRole("button");
}

async function geometry(world: MovementWorld): Promise<Geometry[]> {
  return page(world).locator(".react-flow__node[data-id]").evaluateAll((nodes) => nodes.map((node) => {
    const element = node as HTMLElement;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    const round = (value: number) => Math.round(value * 1_000) / 1_000;
    return { id: element.dataset.id ?? "", x: round(matrix.e), y: round(matrix.f),
      width: element.offsetWidth, height: element.offsetHeight };
  }));
}

async function camera(world: MovementWorld): Promise<Camera> {
  return page(world).locator(".react-flow__viewport").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
    return { x: round(matrix.e), y: round(matrix.f), zoom: round(matrix.a) };
  });
}

function item(nodes: Geometry[] | undefined, id: string): Geometry {
  const result = nodes?.find((node) => node.id === id);
  assert.ok(result, `The rendered geometry must include ${id}.`);
  return result;
}

function near(actual: number, expected: number, reason: string): void {
  assert.ok(Math.abs(actual - expected) < 0.05, `${reason}: expected ${expected}, got ${actual}.`);
}

async function remember(world: MovementWorld): Promise<void> {
  world.movementBefore = await geometry(world);
  world.movementCamera = await camera(world);
}

async function waitForPaint(world: MovementWorld): Promise<void> {
  await page(world).evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function prepare(world: MovementWorld, controlled: boolean): Promise<void> {
  const browser = page(world);
  await browser.setViewportSize({ width: 1280, height: 800 });
  world.movementDirectory = await mkdtemp(join(tmpdir(), "choom-movement-"));
  world.movementFile = join(world.movementDirectory, "baseline.yaml");
  await copyFile(new URL("../fixtures/baseline-viewer/full.yaml", import.meta.url), world.movementFile);
  world.movementBytes = await readFile(world.movementFile);
  if (controlled) {
    world.movementCompleted = 0;
    await browser.exposeFunction("__choomLayoutControl", async (phase: string) => {
      if (phase === "before" && world.movementHoldNext) {
        world.movementHoldNext = false;
        await new Promise<void>((resolve) => { world.movementRelease = resolve; });
      }
      if (phase === "completed") world.movementCompleted = (world.movementCompleted ?? 0) + 1;
      return "continue";
    });
  }
  world.movementDriver = new BaselineBrowserDriver(browser);
  await driver(world).open(controlled);
}

async function openFile(world: MovementWorld, controlled = false): Promise<void> {
  await prepare(world, controlled);
  assert.ok(world.movementFile);
  await driver(world).openBaseline(world.movementFile);
  await expect(page(world).getByText("Baseline ready.", { exact: true })).toBeVisible();
  await expect(header(world, "workspace")).toBeVisible();
  await waitForPaint(world);
  await expect.poll(async () => (await camera(world)).zoom).toBe(1);
  world.movementInitial = await geometry(world);
  world.movementInitialCamera = await camera(world);
  await remember(world);
}

async function pressHeader(world: MovementWorld, id: string): Promise<void> {
  const bounds = await header(world, id).boundingBox();
  assert.ok(bounds, "The component header must be visible for a real mouse gesture.");
  world.movementPointer = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page(world).mouse.move(world.movementPointer.x, world.movementPointer.y);
  await page(world).mouse.down();
}

async function movePointer(world: MovementWorld, x: number, y: number): Promise<void> {
  assert.ok(world.movementPointer);
  const zoom = (await camera(world)).zoom;
  await page(world).mouse.move(world.movementPointer.x + x * zoom, world.movementPointer.y + y * zoom, { steps: 5 });
}

async function dragHeader(world: MovementWorld, id: string, x: number, y: number): Promise<void> {
  await pressHeader(world, id);
  await movePointer(world, x, y);
  await page(world).mouse.up();
}

async function makeRoomForDrag(world: MovementWorld, id: string, x: number, y: number): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bounds = await header(world, id).boundingBox();
    const canvas = await page(world).locator(".react-flow").boundingBox();
    const { zoom } = await camera(world);
    assert.ok(bounds && canvas);
    const endX = bounds.x + bounds.width / 2 + x * zoom;
    const endY = bounds.y + bounds.height / 2 + y * zoom;
    if (endX > canvas.x + 4 && endX < canvas.x + canvas.width - 4
      && endY > canvas.y + 4 && endY < canvas.y + canvas.height - 4) return;
    await page(world).getByRole("button", { name: "Zoom Out", exact: true }).click();
    await expect.poll(async () => (await camera(world)).zoom).toBeLessThan(zoom);
  }
  assert.fail("The browser needs enough visible canvas for the full component drag.");
}

async function inspectNativeShell(world: MovementWorld): Promise<void> {
  await header(world, "native-shell").click();
  await expect(page(world).getByRole("dialog").getByRole("heading", { name: "Native shell", exact: true })).toBeVisible();
}

async function growChild(world: MovementWorld, finish: boolean): Promise<void> {
  await remember(world);
  const child = item(world.movementBefore, "architecture-model");
  const parent = item(world.movementBefore, "workspace");
  const delta = { x: parent.x + parent.width + 40 - child.x, y: parent.y + parent.height + 40 - child.y };
  await makeRoomForDrag(world, child.id, delta.x, delta.y);
  await remember(world);
  await pressHeader(world, child.id);
  await movePointer(world, delta.x, delta.y);
  if (finish) await page(world).mouse.up();
}

async function unusedParentPoint(world: MovementWorld): Promise<{ x: number; y: number }> {
  const point = await page(world).evaluate(() => {
    const parent = document.querySelector('.react-flow__node[data-id="workspace"]');
    const canvas = document.querySelector(".react-flow");
    if (!parent || !canvas) return null;
    const parentBounds = parent.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    const headerBounds = parent.querySelector("button")?.getBoundingClientRect();
    if (!headerBounds) return null;
    const candidates = [
      { x: parentBounds.left + 8, y: headerBounds.bottom + 8 },
      { x: parentBounds.right - 8, y: parentBounds.bottom - 8 },
      { x: parentBounds.left + 8, y: parentBounds.bottom - 8 },
    ];
    return candidates.find(({ x, y }) => x > canvasBounds.left && x < canvasBounds.right
      && y > canvasBounds.top && y < canvasBounds.bottom
      && !document.elementFromPoint(x, y)?.closest("button")) ?? null;
  });
  assert.ok(point, "The pan gesture needs visible group space outside every component header.");
  return point;
}

async function panGroup(world: MovementWorld): Promise<void> {
  const point = await unusedParentPoint(world);
  await page(world).mouse.move(point.x, point.y);
  await page(world).mouse.down();
  await page(world).mouse.move(point.x + 35, point.y + 25, { steps: 5 });
  await page(world).mouse.up();
}

async function replacementPath(world: MovementWorld): Promise<string> {
  assert.ok(world.movementDirectory && world.movementBytes);
  const path = join(world.movementDirectory, "replacement.yaml");
  const bytes = world.movementBytes.toString("utf8").replace("name: Choom", "name: Replacement Choom");
  assert.notEqual(bytes, world.movementBytes.toString("utf8"));
  await writeFile(path, bytes);
  return path;
}

async function holdReplacement(world: MovementWorld, path?: string): Promise<void> {
  world.movementHoldNext = true;
  world.movementRelease = undefined;
  await driver(world).openBaseline(path ?? await replacementPath(world));
  await expect.poll(() => Boolean(world.movementRelease)).toBe(true);
}

Given("the reviewed baseline is open for component movement", async function (this: MovementWorld) {
  await openFile(this);
});

When("the user drags Workspace to another position", async function (this: MovementWorld) {
  await remember(this);
  this.movementDelta = { x: 35, y: 25 };
  await dragHeader(this, "workspace", 35, 25);
});

Then("Workspace and its children move together", async function (this: MovementWorld) {
  assert.ok(this.movementDelta);
  const after = await geometry(this);
  for (const id of ["workspace", "architecture-model", "desktop-adapter"]) {
    const beforeNode = item(this.movementBefore, id);
    const afterNode = item(after, id);
    near(afterNode.x - beforeNode.x, this.movementDelta.x, `${id} horizontal movement`);
    near(afterNode.y - beforeNode.y, this.movementDelta.y, `${id} vertical movement`);
  }
});

Then("Native shell keeps its position", async function (this: MovementWorld) {
  const before = item(this.movementBefore, "native-shell");
  const after = item(await geometry(this), "native-shell");
  near(after.x, before.x, "Unrelated component x");
  near(after.y, before.y, "Unrelated component y");
});

Then("the saved movement baseline file is unchanged", async function (this: MovementWorld) {
  assert.ok(this.movementFile && this.movementBytes);
  assert.deepEqual(await readFile(this.movementFile), this.movementBytes);
});

When("the user moves Architecture model beyond Workspace's right and bottom boundaries", async function (this: MovementWorld) {
  await growChild(this, true);
});

Then("Workspace and Choom contain the moved child", async function (this: MovementWorld) {
  const after = await geometry(this);
  const child = item(after, "architecture-model");
  for (const id of ["workspace", "choom"]) {
    const parent = item(after, id);
    assert.ok(child.x + child.width <= parent.x + parent.width + 0.05, `${id} must contain the child's right edge.`);
    assert.ok(child.y + child.height <= parent.y + parent.height + 0.05, `${id} must contain the child's bottom edge.`);
  }
  assert.ok(item(after, "workspace").width > item(this.movementBefore, "workspace").width);
  assert.ok(item(after, "workspace").height > item(this.movementBefore, "workspace").height);
});

Then("the other component positions and recorded parent are unchanged", async function (this: MovementWorld) {
  const after = await geometry(this);
  for (const id of ["choom", "workspace", "desktop-adapter", "native-shell"]) {
    near(item(after, id).x, item(this.movementBefore, id).x, `${id} origin x`);
    near(item(after, id).y, item(this.movementBefore, id).y, `${id} origin y`);
  }
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
  await page(this).getByRole("dialog").getByRole("region", { name: "Components", exact: true })
    .getByRole("button", { name: "Architecture model, architecture-model", exact: true }).click();
  await page(this).getByRole("dialog").getByText("Recorded details", { exact: true }).click();
  await expect(page(this).getByRole("dialog").getByRole("group", { name: "Parent", exact: true })).toContainText("workspace");
});

When("the user moves Architecture model beyond Workspace's left and top boundaries", async function (this: MovementWorld) {
  await remember(this);
  const child = item(this.movementBefore, "architecture-model");
  const parent = item(this.movementBefore, "workspace");
  const x = parent.x - child.x - 80;
  const y = parent.y - child.y - 80;
  await makeRoomForDrag(this, child.id, x, y);
  await remember(this);
  await dragHeader(this, child.id, x, y);
});

Then("Architecture model stops below the Workspace header and inside its left boundary", async function (this: MovementWorld) {
  const after = await geometry(this);
  const child = item(after, "architecture-model");
  const parent = item(after, "workspace");
  const height = await header(this, "workspace").evaluate((node) => (node as HTMLElement).offsetHeight);
  near(child.x, parent.x, "Clamped child left edge");
  near(child.y, parent.y + height, "Clamped child top edge");
});

Then("the enclosing group origins stay fixed", async function (this: MovementWorld) {
  const after = await geometry(this);
  for (const id of ["workspace", "choom"]) {
    near(item(after, id).x, item(this.movementBefore, id).x, `${id} fixed x`);
    near(item(after, id).y, item(this.movementBefore, id).y, `${id} fixed y`);
  }
});

When("the user moves Workspace one step right with an arrow key", async function (this: MovementWorld) {
  await header(this, "workspace").focus();
  await remember(this);
  await page(this).keyboard.press("ArrowRight");
});

Then("Workspace and its descendants move ten diagram units to the right", async function (this: MovementWorld) {
  const after = await geometry(this);
  for (const id of ["workspace", "architecture-model", "desktop-adapter"]) {
    near(item(after, id).x - item(this.movementBefore, id).x, 10, `${id} keyboard step`);
    near(item(after, id).y, item(this.movementBefore, id).y, `${id} keyboard y`);
  }
});
Then("keyboard focus remains on Workspace", async function (this: MovementWorld) {
  await expect(header(this, "workspace")).toBeFocused();
});
Then("keyboard movement does not open inspection", async function (this: MovementWorld) {
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});

Given("component headers are wider than the zoomed canvas", async function (this: MovementWorld) {
  const browser = page(this);
  for (let step = 0; step < 6 && (await camera(this)).zoom < 2; step += 1) {
    await browser.getByRole("button", { name: "Zoom In", exact: true }).click();
  }
  await expect.poll(async () => (await camera(this)).zoom).toBe(2);
  await browser.setViewportSize({ width: 320, height: 640 });
  this.movementCamera = await camera(this);
});
When("the user reaches Workspace with the keyboard", async function (this: MovementWorld) {
  const browser = page(this);
  await browser.getByRole("button", { name: "Baseline details", exact: true }).focus();
  for (let step = 0; step < 40; step += 1) {
    await browser.keyboard.press("Tab");
    if (await header(this, "workspace").evaluate((node) => node === document.activeElement)) break;
  }
  await expect(header(this, "workspace")).toBeFocused();
});
Then("its name and leading focus edge stay visible at the same zoom", async function (this: MovementWorld) {
  const browser = page(this);
  const bounds = await header(this, "workspace").boundingBox();
  const canvas = await browser.locator(".react-flow").boundingBox();
  assert.ok(bounds && canvas && this.movementCamera);
  assert.ok(bounds.width > canvas.width, "The focused header must really exceed the canvas width.");
  assert.ok(bounds.x >= canvas.x && bounds.x < canvas.x + 12, "The leading name and focus edge must remain visible.");
  assert.ok(bounds.y >= canvas.y && bounds.y < canvas.y + canvas.height);
  assert.equal((await camera(this)).zoom, this.movementCamera.zoom);
});

Given("keyboard focus is on an owned-interface entry in Workspace inspection", async function (this: MovementWorld) {
  await header(this, "workspace").click();
  this.movementEntry = page(this).getByRole("dialog").getByRole("region", { name: "Owned interfaces" }).getByRole("button").first();
  await this.movementEntry.focus();
  await remember(this);
});
When("the user presses an arrow key in the inspection panel", async function (this: MovementWorld) {
  await page(this).keyboard.press("ArrowRight");
});
Then("the component geometry is unchanged", async function (this: MovementWorld) {
  assert.deepEqual(await geometry(this), this.movementBefore);
});
Then("focus remains on that panel entry", async function (this: MovementWorld) {
  assert.ok(this.movementEntry);
  await expect(this.movementEntry).toBeFocused();
});

Given("Native shell inspection is open before movement", async function (this: MovementWorld) {
  await inspectNativeShell(this);
});
Given("Native shell inspection is open during a drag that grows Workspace", async function (this: MovementWorld) {
  await inspectNativeShell(this);
  await growChild(this, false);
  await expect.poll(async () => item(await geometry(this), "workspace").width)
    .toBeGreaterThan(item(this.movementBefore, "workspace").width);
});
When("the active movement is cancelled by {word}", async function (this: MovementWorld, cause: string) {
  assert.equal(cause, "Escape");
  await page(this).keyboard.press("Escape");
});
When("the active movement is cancelled by window interruption", async function (this: MovementWorld) {
  await page(this).evaluate(() => window.dispatchEvent(new Event("blur")));
});
Then("the positions and bounds from before that drag are restored", async function (this: MovementWorld) {
  await expect.poll(() => geometry(this)).toEqual(this.movementBefore);
});
Then("Native shell inspection stays open", async function (this: MovementWorld) {
  await expect(page(this).getByRole("dialog").getByRole("heading", { name: "Native shell", exact: true })).toBeVisible();
});
Then("later movement and release from that drag change nothing", async function (this: MovementWorld) {
  await movePointer(this, 70, 55);
  await page(this).mouse.up();
  assert.deepEqual(await geometry(this), this.movementBefore);
  await expect(page(this).getByRole("dialog").getByRole("heading", { name: "Native shell", exact: true })).toBeVisible();
});
Then("component dragging keeps the camera unchanged", async function (this: MovementWorld) {
  assert.deepEqual(await camera(this), this.movementCamera);
});

When("the user drags unused space inside Workspace", async function (this: MovementWorld) {
  await remember(this);
  await panGroup(this);
});
Then("the camera pans while all component geometry stays unchanged", async function (this: MovementWorld) {
  assert.deepEqual(await geometry(this), this.movementBefore);
  assert.notDeepEqual(await camera(this), this.movementCamera);
});

Given("the component overview has a manual arrangement and camera position", async function (this: MovementWorld) {
  await openFile(this, true);
  await dragHeader(this, "workspace", 35, 25);
  await inspectNativeShell(this);
  await panGroup(this);
  await remember(this);
  assert.notDeepEqual(this.movementBefore, this.movementInitial, "The scenario needs an actual manual arrangement.");
});

When(/^the arranged overview experiences (another component inspection|panel navigation|a window resize|baseline validation failure|baseline load cancellation)$/, async function (this: MovementWorld, event: string) {
  const browser = page(this);
  if (event === "another component inspection") {
    await header(this, "workspace").click();
  } else if (event === "panel navigation") {
    await browser.getByRole("dialog").getByRole("region", { name: "Owned interfaces" }).getByRole("button").first().click();
    await browser.getByRole("button", { name: "Back", exact: true }).click();
  } else if (event === "a window resize") {
    await browser.setViewportSize({ width: 1100, height: 720 });
  } else if (event === "baseline validation failure") {
    assert.ok(this.movementDirectory);
    const path = join(this.movementDirectory, "invalid.yaml");
    await writeFile(path, "formatVersion: 1\nid: invalid\n");
    await driver(this).openBaseline(path);
    await expect(browser.getByRole("alert")).toContainText("validation");
  } else {
    await holdReplacement(this);
    await browser.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(browser.getByText("Load cancelled.", { exact: true })).toBeVisible();
    const completed = this.movementCompleted ?? 0;
    this.movementRelease?.();
    await expect.poll(() => this.movementCompleted).toBe(completed + 1);
  }
});

Then("its manual component geometry and camera are retained", async function (this: MovementWorld) {
  assert.deepEqual(await geometry(this), this.movementBefore);
  assert.deepEqual(await camera(this), this.movementCamera);
});
Then(/^inspection remains available after (another component inspection|panel navigation|a window resize|baseline validation failure|baseline load cancellation)$/, async function (this: MovementWorld, event: string) {
  const name = event === "another component inspection" ? "Workspace" : "Native shell";
  await expect(page(this).getByRole("dialog").getByRole("heading", { name, exact: true })).toBeVisible();
});

Given("the example has a manual arrangement and open inspection", async function (this: MovementWorld) {
  await prepare(this, true);
  await page(this).getByRole("button", { name: "Explore example", exact: true }).click();
  await expect(header(this, "workspace")).toBeVisible();
  await page(this).getByRole("radio", { name: "All", exact: true }).check();
  await page(this).getByRole("checkbox", { name: "Show self-connections", exact: true }).check();
  await waitForPaint(this);
  await expect.poll(async () => (await camera(this)).zoom).toBe(1);
  this.movementInitial = await geometry(this);
  this.movementInitialCamera = await camera(this);
  await dragHeader(this, "workspace", 35, 25);
  await header(this, "workspace").click();
  await remember(this);
  assert.notDeepEqual(this.movementBefore, this.movementInitial);
});
Then("the example's component details remain available", async function (this: MovementWorld) {
  await expect(page(this).getByRole("heading", { name: "example-baseline", exact: true })).toBeVisible();
  await expect(page(this).getByRole("dialog").getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await expect(page(this).getByRole("radio", { name: "All", exact: true })).toBeChecked();
  await expect(page(this).getByRole("checkbox", { name: "Show self-connections", exact: true })).toBeChecked();
});
When("the user closes and reopens the example", async function (this: MovementWorld) {
  await page(this).getByRole("button", { name: "Close example", exact: true }).click();
  await page(this).getByRole("button", { name: "Explore example", exact: true }).click();
});
Then("the example has its initial geometry and no old inspection", async function (this: MovementWorld) {
  await expect.poll(() => geometry(this)).toEqual(this.movementInitial);
  await expect(page(this).locator('[role="dialog"], path[data-interface-arc]')).toHaveCount(0);
  await expect(page(this).getByRole("radio", { name: "Selected", exact: true })).toBeChecked();
  await expect(page(this).getByRole("checkbox", { name: "Show self-connections", exact: true })).not.toBeChecked();
});

When(/^the user opens (the same movement baseline|another baseline with reused IDs) successfully$/, async function (this: MovementWorld, file: string) {
  assert.ok(this.movementFile);
  await holdReplacement(this, file === "the same movement baseline" ? this.movementFile : await replacementPath(this));
  this.movementOutsideFocus = await page(this).evaluateHandle(() => document.activeElement);
  assert.equal(await this.movementOutsideFocus.evaluate((element) =>
    Boolean(element?.closest('[aria-labelledby="current-diagram-heading"]'))), false);
  this.movementRelease?.();
  await expect(page(this).getByText("Baseline ready.", { exact: true })).toBeVisible();
  if (file !== "the same movement baseline") await expect(header(this, "choom")).toContainText("Replacement Choom");
});
Then("the file's prepared geometry and starting camera replace the manual view", async function (this: MovementWorld) {
  await expect.poll(() => geometry(this)).toEqual(this.movementInitial);
  await expect.poll(() => camera(this)).toEqual(this.movementInitialCamera);
});
Then("the old inspection is closed", async function (this: MovementWorld) {
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});
Then("focus stays on the same element outside the replaced view", async function (this: MovementWorld) {
  assert.ok(this.movementOutsideFocus);
  assert.equal(await this.movementOutsideFocus.evaluate((element) => element === document.activeElement), true);
});

Given("a replacement baseline with reused IDs is waiting to finish layout", async function (this: MovementWorld) {
  await openFile(this, true);
  await inspectNativeShell(this);
  await holdReplacement(this);
  await page(this).getByRole("dialog").getByRole("heading", { name: "Component details", exact: true }).focus();
});
Given(/^the user has pressed Workspace (before|after) the drag threshold$/, async function (this: MovementWorld, stage: string) {
  await pressHeader(this, "workspace");
  if (stage === "after") {
    await movePointer(this, 35, 25);
    assert.notDeepEqual(await geometry(this), this.movementInitial, "The old view must really be dragging before replacement.");
  }
});
When("the replacement baseline becomes current", async function (this: MovementWorld) {
  assert.ok(this.movementRelease);
  this.movementRelease();
  await expect(header(this, "choom")).toContainText("Replacement Choom");
});
When("the old pointer cycle moves and releases", async function (this: MovementWorld) {
  await movePointer(this, 70, 55);
  await page(this).mouse.up();
});
Then("the replacement keeps its prepared geometry and starting camera", async function (this: MovementWorld) {
  await expect.poll(() => geometry(this)).toEqual(this.movementInitial);
  await expect.poll(() => camera(this)).toEqual(this.movementInitialCamera);
});
Then("focus is on the replacement baseline heading", async function (this: MovementWorld) {
  await expect(page(this).getByRole("heading", { name: "baseline-002", exact: true })).toBeFocused();
});

After({ tags: "@br-03 and @browser" }, async function (this: MovementWorld) {
  this.movementRelease?.();
  if (this.page && !this.page.isClosed()) await this.page.mouse.up();
  if (this.movementDirectory) await rm(this.movementDirectory, { recursive: true, force: true });
});
