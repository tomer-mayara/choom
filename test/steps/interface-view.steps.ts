import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type ElementHandle, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { interfaceViewBaseline } from "../support/interface-view-fixtures.ts";
import { clippedInterfaceShapes, observeInterfaceView, type InterfaceViewObservation } from "../support/interface-view-observer.ts";

interface InterfaceViewWorld extends World {
  page?: Page;
  viewDirectory?: string;
  viewFile?: string;
  viewBytes?: string;
  viewBefore?: InterfaceViewObservation;
  viewInitial?: InterfaceViewObservation;
  viewZooms?: number[];
  viewHeldLabel?: ElementHandle<SVGElement | HTMLElement>;
  viewDriver?: BaselineBrowserDriver;
  viewHoldNext?: boolean;
  viewRelease?: () => void;
  viewCompleted?: number;
  viewPointer?: { x: number; y: number };
}

function page(world: InterfaceViewWorld) { assert.ok(world.page); return world.page; }
async function observe(world: InterfaceViewWorld) { return page(world).evaluate(observeInterfaceView); }
async function paint(world: InterfaceViewWorld) {
  await page(world).evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function openView(world: InterfaceViewWorld, width: number, height: number, options: { nested?: boolean; longName?: boolean; controlled?: boolean } = {}) {
  const browser = page(world);
  await browser.setViewportSize({ width, height });
  const baseline = interfaceViewBaseline(options.nested, options.longName);
  world.viewBytes = stringify(baseline, { aliasDuplicateObjects: false });
  assert.equal(decodeBaselineYaml(world.viewBytes).status, "success");
  world.viewDirectory = await mkdtemp(join(tmpdir(), "choom-interface-view-"));
  world.viewFile = join(world.viewDirectory, "baseline.yaml");
  await writeFile(world.viewFile, world.viewBytes);
  if (options.controlled) await browser.exposeFunction("__choomLayoutControl", async (phase: string) => {
    if (phase === "before" && world.viewHoldNext) {
      world.viewHoldNext = false;
      await new Promise<void>((resolve) => { world.viewRelease = resolve; });
    }
    if (phase === "completed") world.viewCompleted = (world.viewCompleted ?? 0) + 1;
    return "continue";
  });
  world.viewDriver = new BaselineBrowserDriver(browser);
  await world.viewDriver.open(options.controlled);
  await world.viewDriver.openBaseline(world.viewFile);
  await expect(browser.getByRole("heading", { name: baseline.id, exact: true })).toBeVisible();
  await browser.getByRole("radio", { name: "All", exact: true }).check();
  await expect(browser.locator("path[data-interface-arc]")).toHaveCount(2);
  await paint(world);
  world.viewInitial = await observe(world);
}

Given("an interface drawing with a self-loop is open at {int} by {int}", async function (this: InterfaceViewWorld, width: number, height: number) {
  await openView(this, width, height);
});

Given("a nested consumer and its interface arcs are open", async function (this: InterfaceViewWorld) {
  await openView(this, 1280, 800, { nested: true });
});

Given("an interface drawing with a long name is open with enlarged text", async function (this: InterfaceViewWorld) {
  await openView(this, 320, 640, { longName: true });
  await page(this).addStyleTag({ content: "html { font-size: 20px; }" });
});

Given("an interface drawing is open with controlled file completion", async function (this: InterfaceViewWorld) {
  await openView(this, 1280, 800, { controlled: true });
});

Given("its interface details are open", async function (this: InterfaceViewWorld) {
  const browser = page(this);
  await browser.getByRole("button", { name: "Baseline details", exact: true }).click();
  await browser.getByRole("region", { name: "Interfaces", exact: true }).getByRole("button", { name: /, invoice-api$/ }).click();
  await expect(browser.getByRole("dialog", { name: "Interface details", exact: true })).toBeVisible();
  await paint(this);
  this.viewBefore = await observe(this);
  assert.ok(this.viewBefore.paths.every(({ stroke }) => stroke === 3), "The inspected interface must exercise its highlighted stroke and arrow size.");
});

Given("its components have been spread beyond one-percent fitting in a narrow window", async function (this: InterfaceViewWorld) {
  const browser = page(this);
  const zoomOut = browser.getByRole("button", { name: "Zoom Out", exact: true });
  for (let step = 0; step < 40 && await zoomOut.isEnabled(); step += 1) await zoomOut.click();
  const before = await observe(this);
  assert.ok(before.camera.zoom <= 0.01);
  const billing = await browser.getByRole("button", { name: "Billing, billing", exact: true }).boundingBox();
  assert.ok(billing);
  const start = { x: billing.x + billing.width / 2, y: billing.y + billing.height / 2 };
  await browser.mouse.move(start.x, start.y);
  await browser.mouse.down();
  await browser.mouse.move(start.x + 400, start.y, { steps: 3 });
  await browser.mouse.up();
  await browser.setViewportSize({ width: 320, height: 640 });
  await paint(this);
  this.viewBefore = await observe(this);
  const coordinates = this.viewBefore.nodes.map(({ x, width }) => [x, x + width]);
  const extent = Math.max(...coordinates.flat()) - Math.min(...coordinates.flat());
  assert.ok(extent * 0.01 > this.viewBefore.canvas.width, "The actual manual spread must exceed the 1% floor.");
});

When("the user fits the complete interface drawing", async function (this: InterfaceViewWorld) {
  this.viewBefore = await observe(this);
  await page(this).getByRole("button", { name: "Fit View", exact: true }).click();
  await paint(this);
});

Then("components, curves, arrowheads, and labels fit in the actual canvas", async function (this: InterfaceViewWorld) {
  const result = await observe(this);
  assert.ok(result.camera.zoom > 0 && Number.isFinite(result.camera.zoom));
  assert.deepEqual(clippedInterfaceShapes(result), [], "Fit must contain painted curves, arrowheads, and label boxes as well as components.");
});

Then("Fit uses a positive finite zoom below one percent", async function (this: InterfaceViewWorld) {
  const { zoom } = (await observe(this)).camera;
  assert.ok(zoom > 0 && zoom < 0.01 && Number.isFinite(zoom), `Expected a positive zoom below 0.01; received ${zoom}.`);
});

When("the user reopens the original interface file and zooms out", async function (this: InterfaceViewWorld) {
  assert.ok(this.viewDriver && this.viewFile);
  await this.viewDriver.openBaseline(this.viewFile);
  await expect(page(this).getByText("Baseline ready.", { exact: true })).toBeVisible();
  await paint(this);
  const initial = (await observe(this)).camera.zoom;
  const out = page(this).getByRole("button", { name: "Zoom Out", exact: true });
  for (let step = 0; step < 40 && await out.isEnabled(); step += 1) await out.click();
  this.viewZooms = [initial, (await observe(this)).camera.zoom];
});

Then("the new view starts at one hundred percent and stops at the normal minimum", async function (this: InterfaceViewWorld) {
  assert.deepEqual(this.viewZooms, [1, 0.01]);
  await expect(page(this).getByRole("button", { name: "Zoom Out", exact: true })).toBeDisabled();
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});

Then("interface geometry, inspected details, and selected bytes are unchanged", async function (this: InterfaceViewWorld) {
  assert.ok(this.viewBefore && this.viewFile && this.viewBytes);
  const after = await observe(this);
  assert.deepEqual(after.nodes, this.viewBefore.nodes);
  assert.deepEqual(after.paths, this.viewBefore.paths);
  assert.equal(after.panel, this.viewBefore.panel);
  assert.equal(await readFile(this.viewFile, "utf8"), this.viewBytes);
});

When("the user fits the complete interface drawing and uses its zoom controls", async function (this: InterfaceViewWorld) {
  this.viewBefore = await observe(this);
  const browser = page(this);
  await browser.getByRole("button", { name: "Fit View", exact: true }).click();
  await paint(this);
  const fitted = (await observe(this)).camera.zoom;
  assert.ok(fitted < 0.01);
  const out = browser.getByRole("button", { name: "Zoom Out", exact: true });
  if (await out.isEnabled()) { await out.click(); await paint(this); assert.ok((await observe(this)).camera.zoom < fitted); }
  else await expect(out).toBeDisabled();
  const minimum = (await observe(this)).camera.zoom;
  await browser.getByRole("button", { name: "Zoom In", exact: true }).click();
  await paint(this);
  const enlarged = (await observe(this)).camera.zoom;
  await expect(out).toBeEnabled();
  await out.click();
  await paint(this);
  this.viewZooms = [minimum, enlarged, (await observe(this)).camera.zoom];
});

Then("enabled zoom controls change the scale and Zoom Out stops at its minimum", async function (this: InterfaceViewWorld) {
  assert.ok(this.viewZooms);
  const [minimum = 0, enlarged = 0, reduced = 0] = this.viewZooms;
  assert.ok(minimum > 0 && enlarged > minimum && reduced < enlarged && reduced > 0);
  const out = page(this).getByRole("button", { name: "Zoom Out", exact: true });
  for (let step = 0; step < 4 && await out.isEnabled(); step += 1) { await out.click(); await paint(this); }
  await expect(out).toBeDisabled();
  await expect(page(this).getByRole("button", { name: "Zoom In", exact: true })).toBeEnabled();
});

When("the user holds an arc label, resets the layout, and releases the label", async function (this: InterfaceViewWorld) {
  const browser = page(this);
  await browser.getByRole("button", { name: "Fit View", exact: true }).click();
  await paint(this);
  const label = browser.locator('[data-interface-label][data-consumer-id="billing"]');
  const element = await label.elementHandle();
  assert.ok(element);
  this.viewHeldLabel = element;
  const box = await label.boundingBox();
  assert.ok(box);
  await browser.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await browser.mouse.down();
  await browser.getByRole("button", { name: "Reset layout", exact: true }).focus();
  await browser.keyboard.press("Enter");
  await paint(this);
  const afterReset = await label.boundingBox();
  assert.ok(afterReset);
  await browser.mouse.move(afterReset.x + afterReset.width / 2, afterReset.y + afterReset.height / 2);
  await browser.mouse.up();
});

Then("Reset retains the interface details and Back path without replacing the label", async function (this: InterfaceViewWorld) {
  const browser = page(this);
  await expect(browser.getByRole("dialog", { name: "Interface details", exact: true })).toBeVisible();
  await expect(browser.getByRole("button", { name: "Back", exact: true })).toBeVisible({ timeout: 1000 });
  assert.ok(this.viewHeldLabel);
  assert.equal(await this.viewHeldLabel.evaluate((element) => element === document.querySelector('[data-interface-label][data-consumer-id="billing"]')), true);
  assert.equal((await observe(this)).camera.zoom, 1);
});

async function fit(world: InterfaceViewWorld) {
  await page(world).getByRole("button", { name: "Fit View", exact: true }).click();
  await paint(world);
}

async function press(world: InterfaceViewWorld, selector: string) {
  const box = await page(world).locator(selector).boundingBox();
  assert.ok(box);
  world.viewPointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page(world).mouse.move(world.viewPointer.x, world.viewPointer.y);
  await page(world).mouse.down();
}

async function move(world: InterfaceViewWorld, x: number, y: number) {
  assert.ok(world.viewPointer);
  const { zoom } = (await observe(world)).camera;
  await page(world).mouse.move(world.viewPointer.x + x * zoom, world.viewPointer.y + y * zoom, { steps: 3 });
  await paint(world);
}

When("the user drags the consumer's parent inside the canvas", async function (this: InterfaceViewWorld) {
  await fit(this);
  this.viewBefore = await observe(this);
  await press(this, '.react-flow__node[data-id="commerce"] button');
  await move(this, 30, 20);
  await page(this).mouse.up();
  await paint(this);
});

Then("the child and its arc endpoint follow the parent without changing inspection or camera", async function (this: InterfaceViewWorld) {
  assert.ok(this.viewBefore);
  const after = await observe(this);
  for (const id of ["commerce", "checkout"]) {
    const beforeNode: InterfaceViewObservation["nodes"][number] | undefined = this.viewBefore.nodes.find((node) => node.id === id);
    const afterNode = after.nodes.find((node) => node.id === id);
    assert.ok(beforeNode && afterNode);
    assert.ok(Math.abs(afterNode.x - beforeNode.x - 30) < 0.1);
    assert.ok(Math.abs(afterNode.y - beforeNode.y - 20) < 0.1);
  }
  const endpoint = (view: InterfaceViewObservation) => view.paths.find(({ id }) => id.includes('"checkout"'))?.d?.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/)?.slice(1).map(Number);
  const beforePoint = endpoint(this.viewBefore);
  const afterPoint = endpoint(after);
  assert.ok(beforePoint && afterPoint);
  assert.ok(Math.abs((afterPoint[0] ?? 0) - (beforePoint[0] ?? 0) - 30) < 0.1);
  assert.ok(Math.abs((afterPoint[1] ?? 0) - (beforePoint[1] ?? 0) - 20) < 0.1);
  assert.equal(after.panel, this.viewBefore.panel);
  assert.deepEqual(after.camera, this.viewBefore.camera);
});

When("the user grows the parent by dragging its child and cancels with Escape", async function (this: InterfaceViewWorld) {
  await fit(this);
  this.viewBefore = await observe(this);
  await press(this, '.react-flow__node[data-id="checkout"] button');
  await move(this, 400, 160);
  const grown = await observe(this);
  assert.ok((grown.nodes.find(({ id }) => id === "commerce")?.width ?? 0) > (this.viewBefore.nodes.find(({ id }) => id === "commerce")?.width ?? 0));
  assert.notDeepEqual(grown.paths, this.viewBefore.paths);
  await page(this).keyboard.press("Escape");
  await move(this, 420, 180);
  await page(this).mouse.up();
  await paint(this);
});

Then("the pre-drag geometry, arcs, panel, and camera are restored", async function (this: InterfaceViewWorld) {
  assert.ok(this.viewBefore && this.viewFile && this.viewBytes);
  const after = await observe(this);
  for (const key of ["nodes", "paths", "panel", "camera"] as const) assert.deepEqual(after[key], this.viewBefore[key]);
  assert.equal(await readFile(this.viewFile, "utf8"), this.viewBytes);
});

Given("its consumer has been moved with the keyboard", async function (this: InterfaceViewWorld) {
  await fit(this);
  const header = page(this).getByRole("button", { name: "Checkout, checkout", exact: true });
  await header.focus();
  const before = await observe(this);
  await header.press("ArrowRight");
  await paint(this);
  this.viewBefore = await observe(this);
  assert.notDeepEqual(this.viewBefore.paths, before.paths);
  assert.equal(this.viewBefore.camera.zoom, before.camera.zoom);
  assert.equal(this.viewBefore.panel, before.panel);
});

When("the user resets the interface drawing", async function (this: InterfaceViewWorld) {
  await page(this).getByRole("button", { name: "Reset layout", exact: true }).click();
  await paint(this);
});

Then("the initial component and arc geometry returns at one hundred percent", async function (this: InterfaceViewWorld) {
  assert.ok(this.viewInitial);
  const after = await observe(this);
  assert.deepEqual(after.nodes, this.viewInitial.nodes);
  assert.deepEqual(after.paths.map(({ id, d }) => ({ id, d })), this.viewInitial.paths.map(({ id, d }) => ({ id, d })));
  assert.equal(after.camera.zoom, 1);
});

Then("the interface details and Back path remain available", async function (this: InterfaceViewWorld) {
  await expect(page(this).getByRole("dialog", { name: "Interface details", exact: true })).toBeVisible();
  await page(this).getByRole("button", { name: "Back", exact: true }).click();
  await expect(page(this).getByRole("dialog", { name: "Baseline details", exact: true })).toBeVisible();
});

async function holdReplacement(world: InterfaceViewWorld) {
  assert.ok(world.viewDirectory && world.viewDriver);
  const replacement = interfaceViewBaseline();
  replacement.id = "replacement-interface-view";
  const contract = replacement.interfaces[0];
  assert.ok(contract);
  contract.allowedConsumers.value = ["checkout"];
  const file = join(world.viewDirectory, "replacement.yaml");
  await writeFile(file, stringify(replacement, { aliasDuplicateObjects: false }));
  world.viewHoldNext = true;
  await world.viewDriver.openBaseline(file);
  await expect(page(world).getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect.poll(() => Boolean(world.viewRelease), { timeout: 1000 }).toBe(true);
}

async function finishReplacement(world: InterfaceViewWorld) {
  assert.ok(world.viewRelease);
  world.viewRelease();
  await expect(page(world).getByRole("heading", { name: "replacement-interface-view", exact: true })).toBeVisible();
  await page(world).getByRole("radio", { name: "All", exact: true }).focus();
  await page(world).keyboard.press("Space");
  await paint(world);
}

When("a replacement with reused IDs and different endpoint facts opens", async function (this: InterfaceViewWorld) {
  await holdReplacement(this);
  await finishReplacement(this);
});

Then("only the replacement's recorded arcs appear in a fresh view", async function (this: InterfaceViewWorld) {
  const after = await observe(this);
  assert.deepEqual(after.paths.map(({ id }) => id), [JSON.stringify(["invoice-api", "checkout", "billing"])]);
  assert.equal(after.panel, null);
  assert.equal(after.camera.zoom, 1);
  assert.deepEqual(after.nodes, this.viewInitial?.nodes);
});

Given(/^a replacement is waiting while an old (component drag|arc press) is unfinished$/, async function (this: InterfaceViewWorld, input: string) {
  await fit(this);
  await holdReplacement(this);
  await press(this, input === "arc press" ? '[data-interface-label][data-consumer-id="checkout"]' : '.react-flow__node[data-id="checkout"] button');
  if (input === "component drag") await move(this, 30, 20);
});

When("the replacement opens and the old input moves and releases", async function (this: InterfaceViewWorld) {
  await finishReplacement(this);
  this.viewBefore = await observe(this);
  await move(this, 50, 35);
  await page(this).mouse.up();
  await paint(this);
});

Then("the replacement's arcs, positions, camera, and inspection stay unchanged", async function (this: InterfaceViewWorld) {
  assert.ok(this.viewBefore);
  const after = await observe(this);
  for (const key of ["nodes", "paths", "camera", "panel"] as const) assert.deepEqual(after[key], this.viewBefore[key]);
  assert.equal(after.paths.length, 1);
  assert.equal(after.panel, null);
});

When(/^another interface file open (fails validation|is cancelled|returns after cancellation)$/, async function (this: InterfaceViewWorld, outcome: string) {
  assert.ok(this.viewDirectory && this.viewDriver);
  this.viewBefore = await observe(this);
  if (outcome === "fails validation") {
    const file = join(this.viewDirectory, "invalid.yaml");
    await writeFile(file, "formatVersion: 1\nid: invalid\n");
    await this.viewDriver.openBaseline(file);
    await expect(page(this).getByRole("alert")).toContainText("validation");
  } else {
    await holdReplacement(this);
    await page(this).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page(this).getByText("Load cancelled.", { exact: true })).toBeVisible();
    if (outcome === "returns after cancellation") {
      const completed = this.viewCompleted ?? 0;
      this.viewRelease?.();
      await expect.poll(() => this.viewCompleted).toBe(completed + 1);
      await paint(this);
    }
  }
});

After({ tags: "@br-07d" }, async function (this: InterfaceViewWorld) {
  this.viewRelease?.();
  if (this.page && !this.page.isClosed()) await this.page.mouse.up();
  if (this.viewDirectory) await rm(this.viewDirectory, { recursive: true, force: true });
});
