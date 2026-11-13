import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { connectionFitBaseline } from "../support/connection-fit-fixture.ts";
import { clippedInterfaceShapes, observeInterfaceView, type InterfaceViewObservation } from "../support/interface-view-observer.ts";
import { unobscuredArcPoint } from "../support/interface-pointer.ts";

interface FitWorld extends World {
  page?: Page;
  fitDirectory?: string;
  fitFile?: string;
  fitBytes?: string;
  fitHidden?: InterfaceViewObservation;
  fitRevealed?: InterfaceViewObservation;
  fitBefore?: InterfaceViewObservation;
  fitHoverBefore?: InterfaceViewObservation;
  fitHover?: InterfaceViewObservation;
  fitCurrent?: InterfaceViewObservation;
}

function page(world: FitWorld) { assert.ok(world.page); return world.page; }
async function observe(world: FitWorld) { return page(world).evaluate(observeInterfaceView); }
async function paint(world: FitWorld) { await page(world).evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }

async function open(world: FitWorld, width = 1280, height = 800, selected = true) {
  const browser = page(world);
  await browser.setViewportSize({ width, height });
  world.fitDirectory = await mkdtemp(join(tmpdir(), "choom-fit-visible-"));
  world.fitFile = join(world.fitDirectory, "baseline.yaml");
  world.fitBytes = stringify(connectionFitBaseline(), { aliasDuplicateObjects: false });
  await writeFile(world.fitFile, world.fitBytes);
  const viewer = new BaselineBrowserDriver(browser);
  await viewer.open(); await viewer.openBaseline(world.fitFile);
  await expect(browser.getByRole("heading", { name: "connection-fit", exact: true })).toBeVisible();
  if (selected) await browser.getByRole("button", { name: "Billing, billing", exact: true }).click();
  await browser.mouse.move(8, 8); await paint(world);
  world.fitBefore = await observe(world);
}

Given("the fixed Fit baseline is open with Billing selected at {int} by {int}", async function (this: FitWorld, width: number, height: number) { await open(this, width, height); });
Given("the fixed Fit baseline is open without inspection", async function (this: FitWorld) { await open(this, 1280, 800, false); });
Given("its hidden label extends beyond the complete padded curve envelope", async function (this: FitWorld) {
  await expect(page(this).locator("path[data-interface-arc]")).toHaveCount(1);
  const extension = await page(this).locator("[data-interface-label]").evaluate((label) => {
    const path = document.querySelector<SVGPathElement>("path[data-interface-arc]");
    const matrix = path?.getScreenCTM();
    const markerId = path?.getAttribute("marker-end")?.match(/^url\(\s*(['"]?)#(.+?)\1\s*\)$/)?.[2];
    const marker = markerId ? document.getElementById(markerId) : null;
    if (!path || !matrix || !(marker instanceof SVGMarkerElement)) throw new Error("The one-arc fixture needs its SVG geometry.");
    const coordinates = path.getAttribute("d")?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (coordinates.length !== 8) throw new Error("The fixture must have one cubic with two control points.");
    const points: DOMPoint[] = [];
    for (let index = 0; index < coordinates.length; index += 2) points.push(new DOMPoint(coordinates[index], coordinates[index + 1]).matrixTransform(matrix));
    const stroke = Number.parseFloat(getComputedStyle(path).strokeWidth);
    const padding = Math.hypot(marker.markerWidth.baseVal.value, marker.markerHeight.baseVal.value) * stroke * matrix.a / 2;
    const right = Math.max(...points.map(({ x }) => x + padding),
      ...[...document.querySelectorAll(".react-flow__node")].map((node) => node.getBoundingClientRect().right));
    return { extra: label.getBoundingClientRect().right - right, opacity: getComputedStyle(label).opacity };
  });
  assert.equal(extension.opacity, "0");
  assert.ok(extension.extra > 30, `The label must extend beyond even the padded control envelope: ${extension.extra}px.`);
});

When("the user fits the fixed drawing with its label hidden", async function (this: FitWorld) {
  await page(this).getByRole("button", { name: "Fit View", exact: true }).click(); await paint(this);
  this.fitHidden = await observe(this);
});
When("the user opens the fixed interface through its owner", async function (this: FitWorld) {
  await page(this).getByRole("region", { name: "Owned interfaces", exact: true }).getByRole("button").click();
  await page(this).mouse.move(8, 8); await paint(this);
  assert.deepEqual((await observe(this)).camera, this.fitHidden?.camera, "Inspection must not fit the drawing automatically.");
});
When("the user fits the fixed drawing with its label revealed", async function (this: FitWorld) {
  assert.equal((await observe(this)).shapes.filter(({ kind }) => kind === "label").length, 1);
  await page(this).getByRole("button", { name: "Fit View", exact: true }).click(); await paint(this);
  this.fitRevealed = await observe(this);
});
When("the user focuses Fit, hovers the fixed curve, and activates Fit with Enter", async function (this: FitWorld) {
  // Fit first makes the curve reachable in the narrow canvas. This is setup for the keyboard activation.
  const control = page(this).getByRole("button", { name: "Fit View", exact: true });
  await control.click(); await paint(this); await control.focus();
  this.fitHoverBefore = await observe(this);
  const point = await unobscuredArcPoint(page(this).locator("path[data-interface-arc]"));
  await page(this).mouse.move(point.x, point.y); await paint(this);
  this.fitHover = await observe(this);
  assert.equal(this.fitHover.shapes.filter(({ kind }) => kind === "label").length, 1);
  await expect(control).toBeFocused();
  await page(this).keyboard.press("Enter"); await paint(this);
  this.fitCurrent = await observe(this);
});
When("the user fits the quiet fixed drawing", async function (this: FitWorld) {
  await page(this).getByRole("button", { name: "Fit View", exact: true }).click(); await paint(this);
  this.fitCurrent = await observe(this);
});
When("the user closes Fit inspection and narrows the window", async function (this: FitWorld) {
  await page(this).getByRole("button", { name: "Close details", exact: true }).click();
  await page(this).setViewportSize({ width: 320, height: 640 }); await paint(this);
  this.fitCurrent = await observe(this);
});

Then("the hidden-label fit uses more scale than the revealed-label fit", function (this: FitWorld) {
  assert.ok(this.fitHidden && this.fitRevealed);
  assert.ok(this.fitHidden.camera.zoom < 2, "The fixture must not saturate the maximum zoom.");
  assert.ok(this.fitHidden.camera.zoom > this.fitRevealed.camera.zoom + 0.05,
    `A hidden label must not shrink the drawing: hidden=${this.fitHidden.camera.zoom}, revealed=${this.fitRevealed.camera.zoom}.`);
});
Then("both fits contain the content that was shown", function (this: FitWorld) {
  assert.ok(this.fitHidden && this.fitRevealed);
  assert.equal(this.fitHidden.shapes.filter(({ kind }) => kind === "label").length, 0);
  assert.equal(this.fitRevealed.shapes.filter(({ kind }) => kind === "label").length, 1);
  assert.deepEqual(clippedInterfaceShapes(this.fitHidden), []);
  assert.deepEqual(clippedInterfaceShapes(this.fitRevealed), []);
});
Then("the Fit comparison keeps the same arcs, positions, and canvas size", function (this: FitWorld) {
  assert.ok(this.fitBefore && this.fitHidden && this.fitRevealed);
  for (const result of [this.fitHidden, this.fitRevealed]) {
    assert.equal(result.paths.length, 1);
    assert.deepEqual(result.nodes, this.fitBefore.nodes);
    assert.deepEqual(result.paths, this.fitBefore.paths);
    assert.deepEqual(result.canvas, this.fitBefore.canvas);
  }
});
Then("Fit contains the label that was painted at activation", async function (this: FitWorld) {
  assert.ok(this.fitHover && this.fitCurrent);
  assert.equal(this.fitHover.shapes.filter(({ kind }) => kind === "label").length, 1);
  assert.equal(this.fitCurrent.paths.length, 1);
  const label = await page(this).locator("[data-interface-label]").boundingBox();
  assert.ok(label);
  const { canvas } = this.fitCurrent;
  assert.ok(label.x >= canvas.x - 1 && label.y >= canvas.y - 1 && label.x + label.width <= canvas.x + canvas.width + 1 && label.y + label.height <= canvas.y + canvas.height + 1);
  assert.deepEqual(clippedInterfaceShapes(this.fitCurrent), []);
});
Then("the hover did not fit or move the drawing before activation", function (this: FitWorld) {
  assert.ok(this.fitHoverBefore && this.fitHover);
  assert.deepEqual(this.fitHover.camera, this.fitHoverBefore.camera);
  assert.deepEqual(this.fitHover.nodes, this.fitHoverBefore.nodes);
});
Then("only its two components contribute painted content", function (this: FitWorld) {
  assert.ok(this.fitCurrent);
  assert.equal(this.fitCurrent.nodes.length, 2);
  assert.equal(this.fitCurrent.paths.length, 0);
  assert.deepEqual(this.fitCurrent.shapes.map(({ kind }) => kind), ["component", "component"]);
});
Then("the component drawing fits in the actual canvas", function (this: FitWorld) { assert.ok(this.fitCurrent); assert.deepEqual(clippedInterfaceShapes(this.fitCurrent), []); });
Then("panel and window changes do not fit or rearrange the drawing", function (this: FitWorld) {
  assert.ok(this.fitBefore && this.fitCurrent);
  assert.notDeepEqual(this.fitCurrent.canvas, this.fitBefore.canvas);
  assert.deepEqual(this.fitCurrent.camera, this.fitBefore.camera);
  assert.deepEqual(this.fitCurrent.nodes, this.fitBefore.nodes);
  assert.equal(this.fitCurrent.panel, null);
  assert.equal(this.fitCurrent.paths.length, 0);
});

After({ tags: "@br-08d" }, async function (this: FitWorld) {
  try { if (this.fitFile && this.fitBytes) assert.equal(await readFile(this.fitFile, "utf8"), this.fitBytes); }
  finally { if (this.fitDirectory) await rm(this.fitDirectory, { recursive: true, force: true }); }
});
