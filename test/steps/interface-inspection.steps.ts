import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import { interfaceInspectionBaseline } from "../support/interface-inspection-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { hoverArcLabel, unobscuredArcPoint } from "../support/interface-pointer.ts";

interface ArcInspectionWorld extends World {
  page?: Page;
  arcInspectionDirectory?: string;
  arcInspectionCamera?: number[];
  arcInspectionPositions?: string[];
  arcInspectionConsumer?: string;
  arcInspectionScroll?: number;
  arcInspectionLabelBounds?: { x: number; y: number; width: number; height: number };
  arcInspectionCanvasBounds?: { x: number; y: number; width: number; height: number };
  arcInspectionRecord?: string | null;
}

function page(world: ArcInspectionWorld): Page {
  assert.ok(world.page);
  return world.page;
}

function label(world: ArcInspectionWorld, consumer = world.arcInspectionConsumer ?? "checkout") {
  return page(world).locator(`[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="${consumer}"]`);
}

async function camera(browser: Page): Promise<number[]> {
  return browser.locator(".react-flow__viewport").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return [matrix.a, matrix.e, matrix.f];
  });
}

async function rememberView(world: ArcInspectionWorld): Promise<void> {
  world.arcInspectionCamera = await camera(page(world));
  world.arcInspectionPositions = await page(world).locator(".react-flow__node").evaluateAll((nodes) =>
    nodes.map((node) => `${node.getAttribute("data-id")}:${(node as HTMLElement).style.transform}`));
}

async function openBaseline(world: ArcInspectionWorld, baseline: Baseline): Promise<void> {
  const browser = page(world);
  await browser.setViewportSize({ width: 1280, height: 800 });
  const yaml = stringify(baseline, { aliasDuplicateObjects: false });
  assert.equal(decodeBaselineYaml(yaml).status, "success");
  world.arcInspectionDirectory = await mkdtemp(join(tmpdir(), "choom-arc-inspection-"));
  const path = join(world.arcInspectionDirectory, "baseline.yaml");
  await writeFile(path, yaml);
  const driver = new BaselineBrowserDriver(browser);
  await driver.open();
  await driver.openBaseline(path);
  await expect(browser.getByRole("heading", { name: "interface-inspection", exact: true })).toBeVisible();
  await browser.getByRole("radio", { name: "All", exact: true }).check();
  await expect(browser.locator("path[data-interface-arc]")).toHaveCount(3);
  await expect(browser.getByRole("dialog")).toHaveCount(0);
}

Given("the interface inspection baseline is open", async function (this: ArcInspectionWorld) {
  await openBaseline(this, interfaceInspectionBaseline());
});

async function tabToLabel(world: ArcInspectionWorld, consumer: string): Promise<void> {
  world.arcInspectionConsumer = consumer;
  await page(world).getByRole("button", { name: "Baseline details", exact: true }).focus();
  for (let step = 0; step < 40; step += 1) {
    await page(world).keyboard.press("Tab");
    if (await label(world).evaluate((element) => element === document.activeElement)) break;
  }
  await expect(label(world)).toBeFocused();
}

async function selectCheckoutArc(world: ArcInspectionWorld, target: string) {
  world.arcInspectionConsumer = "checkout";
  await rememberView(world);
  let point: { x: number; y: number };
  if (target === "label") {
    await hoverArcLabel(page(world), label(world));
    const bounds = await label(world).boundingBox();
    assert.ok(bounds);
    point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  } else {
    point = await unobscuredArcPoint(page(world).locator('path[data-interface-arc][data-interface-id="invoice-api"][data-consumer-id="checkout"]'));
  }
  await page(world).mouse.click(point.x, point.y);
}

When("the user selects the Checkout Invoice API arc by its {word}", async function (this: ArcInspectionWorld, target: string) {
  await selectCheckoutArc(this, target);
});

Given("the off-screen Checkout Invoice API label has pointer focus without moving the drawing", async function (this: ArcInspectionWorld) {
  await selectCheckoutArc(this, "curve");
  await expect(label(this)).toBeFocused();
  await unchangedView(this);
});

Then("Invoice API details are shown as a fresh inspection path", async function (this: ArcInspectionWorld) {
  const panel = page(this).getByRole("dialog", { name: "Interface details", exact: true });
  await expect(panel).toBeVisible({ timeout: 1500 });
  await expect(panel.getByRole("heading", { name: "Invoice API", exact: true })).toBeVisible();
  await expect(panel.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("group", { name: "Provider", exact: true })).toContainText("Billing");
  await expect(panel.getByRole("group", { name: "Behavior", exact: true })).toContainText("Create an invoice");
  await expect(panel.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
});

Then("the arc's original interface fields remain readable in Sources", async function (this: ArcInspectionWorld) {
  const panel = page(this).getByRole("dialog", { name: "Interface details", exact: true });
  await panel.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(panel.getByRole("group", { name: "Interface ID", exact: true })).toContainText("invoice-api");
  await expect(panel.getByRole("group", { name: "Owner", exact: true })).toContainText("billing");
  await expect(panel.getByRole("group", { name: "Allowed consumers", exact: true })).toContainText("reporting");
  await expect(panel.getByRole("group", { name: "Behavior", exact: true })).toContainText("Create an invoice");
});

Given("keyboard focus is on the Reporting Invoice API arc label", async function (this: ArcInspectionWorld) {
  await tabToLabel(this, "reporting");
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});

When("the user activates the arc with {word}", async function (this: ArcInspectionWorld, key: string) {
  assert.ok(key === "Enter" || key === "Space");
  await page(this).keyboard.press(key);
});

Then("focus moves to the Invoice API panel heading", async function (this: ArcInspectionWorld) {
  const panel = page(this).getByRole("dialog", { name: "Interface details", exact: true });
  await expect(panel.getByRole("heading", { name: "Interface details", exact: true })).toBeFocused();
  await expect(panel.getByRole("heading", { name: "Invoice API", exact: true })).toBeVisible();
});

Given("the Reporting Invoice API arc was opened with the keyboard", async function (this: ArcInspectionWorld) {
  await tabToLabel(this, "reporting");
  await page(this).keyboard.press("Enter");
  await expect(page(this).getByRole("dialog")).toBeVisible();
});

When("the user closes arc inspection with Escape", async function (this: ArcInspectionWorld) {
  await page(this).keyboard.press("Escape");
});

Then("keyboard focus returns to the Reporting Invoice API arc label", async function (this: ArcInspectionWorld) {
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
  await expect(label(this, "reporting")).toBeFocused();
});

When("a replacement baseline puts the same interfaces and consumers in a different order", async function (this: ArcInspectionWorld) {
  assert.ok(this.arcInspectionDirectory);
  const replacement = interfaceInspectionBaseline();
  replacement.id = "reordered-interface-inspection";
  replacement.interfaces.reverse();
  replacement.interfaces.find(({ id }) => id === "invoice-api")?.allowedConsumers.value?.reverse();
  const path = join(this.arcInspectionDirectory, "replacement.yaml");
  await writeFile(path, stringify(replacement, { aliasDuplicateObjects: false }));
  await new BaselineBrowserDriver(page(this)).openBaseline(path);
  await expect(page(this).getByRole("heading", { name: replacement.id, exact: true })).toBeVisible();
  await page(this).getByRole("radio", { name: "All", exact: true }).check();
});

Then("the arc labels and keyboard navigation follow the replacement order", async function (this: ArcInspectionWorld) {
  const expected = ["order-api:billing", "invoice-api:reporting", "invoice-api:checkout"];
  await expect.poll(() => page(this).locator("button[data-interface-label]").evaluateAll((elements) =>
    elements.map((element) => `${element.getAttribute("data-interface-id")}:${element.getAttribute("data-consumer-id")}`)), { timeout: 1500 }).toEqual(expected);
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).focus();
  const visited: string[] = [];
  for (let step = 0; step < 40 && visited.length < expected.length; step += 1) {
    await page(this).keyboard.press("Tab");
    const identity = await page(this).evaluate(() => {
      const element = document.activeElement;
      return element?.hasAttribute("data-interface-label")
        ? `${element.getAttribute("data-interface-id")}:${element.getAttribute("data-consumer-id")}` : null;
    });
    if (identity) visited.push(identity);
  }
  assert.deepEqual(visited, expected);
});

async function arcAppearance(world: ArcInspectionWorld) {
  return page(world).locator("path[data-interface-arc]").evaluateAll((paths) => paths.map((element) => ({
    interface: element.getAttribute("data-interface-id"), consumer: element.getAttribute("data-consumer-id"),
    width: Number.parseFloat(getComputedStyle(element).strokeWidth), opacity: Number(getComputedStyle(element).opacity),
  })));
}

Then("both Invoice API arcs are emphasized and Order API is dimmed", async function (this: ArcInspectionWorld) {
  const arcs = await arcAppearance(this);
  assert.equal(arcs.length, 3);
  for (const arc of arcs) {
    if (arc.interface === "invoice-api") { assert.ok(arc.width > 1.5); assert.equal(arc.opacity, 1); }
    else { assert.ok(arc.opacity > 0 && arc.opacity < 1); }
  }
});

Then("all interface arcs have normal emphasis", async function (this: ArcInspectionWorld) {
  const arcs = await arcAppearance(this);
  assert.equal(arcs.length, 3);
  for (const arc of arcs) { assert.equal(arc.width, 1.5); assert.equal(arc.opacity, 1); }
});

When("the user selects the Checkout component", async function (this: ArcInspectionWorld) {
  await page(this).getByRole("button", { name: "Checkout, checkout", exact: true }).click();
});

Then("Checkout's incoming and outgoing arcs are emphasized and its unrelated arc is dimmed", async function (this: ArcInspectionWorld) {
  const arcs = await arcAppearance(this);
  for (const arc of arcs) {
    if (arc.interface === "order-api" || arc.consumer === "checkout") { assert.ok(arc.width > 1.5); assert.equal(arc.opacity, 1); }
    else assert.ok(arc.opacity > 0 && arc.opacity < 1);
  }
});

Given("Billing's component panel is open", async function (this: ArcInspectionWorld) {
  await page(this).getByRole("button", { name: "Billing, billing", exact: true }).click();
  await expect(page(this).getByRole("dialog", { name: "Component details", exact: true })).toBeVisible();
});

When("the user selects Invoice API from the owned interface list", async function (this: ArcInspectionWorld) {
  await page(this).getByRole("dialog").getByRole("region", { name: "Owned interfaces", exact: true })
    .getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
});

Then("Billing remains highlighted in the drawing", async function (this: ArcInspectionWorld) {
  await expect(page(this).locator('.react-flow__node[data-id="billing"]').getByRole("button")).toHaveAttribute("aria-pressed", "true");
});

Given("a long owned interface list is open for arc inspection", async function (this: ArcInspectionWorld) {
  await openBaseline(this, interfaceInspectionBaseline("long list"));
  await page(this).setViewportSize({ width: 1280, height: 480 });
  await page(this).getByRole("button", { name: "Billing, billing", exact: true }).click();
});

Given("Invoice API was opened from the scrolled owned interface list", async function (this: ArcInspectionWorld) {
  const row = page(this).getByRole("dialog").getByRole("button", { name: "Invoice API, invoice-api", exact: true });
  await row.focus();
  this.arcInspectionScroll = await page(this).getByLabel("Record content", { exact: true }).evaluate((element) => element.scrollTop);
  assert.ok(this.arcInspectionScroll > 0, "The owned list must actually be scrolled.");
  await row.press("Enter");
});

When("the user returns to the component with Back", async function (this: ArcInspectionWorld) {
  await page(this).getByRole("button", { name: "Back", exact: true }).click();
});

Then("the owned interface row and list position are restored", async function (this: ArcInspectionWorld) {
  await expect(page(this).getByRole("dialog").getByRole("button", { name: "Invoice API, invoice-api", exact: true })).toBeFocused();
  assert.equal(await page(this).getByLabel("Record content", { exact: true }).evaluate((element) => element.scrollTop), this.arcInspectionScroll);
});

Then("Billing's incoming and outgoing arcs are emphasized again", async function (this: ArcInspectionWorld) {
  const arcs = await arcAppearance(this);
  assert.equal(arcs.length, 3);
  for (const arc of arcs) { assert.ok(arc.width > 1.5); assert.equal(arc.opacity, 1); }
});

async function moveLabelOutsideCanvas(world: ArcInspectionWorld, side: "above" | "left"): Promise<void> {
  const canvas = await page(world).locator(".react-flow").boundingBox();
  const bounds = await label(world, "checkout").boundingBox();
  assert.ok(canvas && bounds);
  const delta = side === "above" ? { x: 0, y: canvas.y - bounds.y - bounds.height - 20 }
    : { x: canvas.x - bounds.x - bounds.width - 20, y: 0 };
  const start = { x: canvas.x + canvas.width - 30, y: canvas.y + canvas.height - 40 };
  await page(world).mouse.move(start.x, start.y);
  await page(world).mouse.down();
  await page(world).mouse.move(start.x + delta.x, start.y + delta.y, { steps: 5 });
  await page(world).mouse.up();
  await page(world).evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const moved = await label(world, "checkout").boundingBox();
  assert.ok(moved && (side === "above" ? moved.y + moved.height < canvas.y : moved.x + moved.width < canvas.x),
    "The label must really be outside the canvas.");
}

Given("the Checkout Invoice API curve is visible with its label off-screen", async function (this: ArcInspectionWorld) {
  await moveLabelOutsideCanvas(this, "left");
});

Given("the Checkout Invoice API label is off-screen and fits the canvas", async function (this: ArcInspectionWorld) {
  await moveLabelOutsideCanvas(this, "above");
  const bounds = await label(this, "checkout").boundingBox();
  const canvas = await page(this).locator(".react-flow").boundingBox();
  assert.ok(bounds && canvas && bounds.width < canvas.width && bounds.height < canvas.height);
});

Given("a long interface label is enlarged beyond the available canvas", async function (this: ArcInspectionWorld) {
  await openBaseline(this, interfaceInspectionBaseline("long label"));
  for (let step = 0; step < 6 && (await camera(page(this)))[0] !== 2; step += 1) {
    await page(this).getByRole("button", { name: "Zoom In", exact: true }).click();
  }
  await expect.poll(async () => (await camera(page(this)))[0]).toBe(2);
  await page(this).setViewportSize({ width: 320, height: 640 });
  const bounds = await label(this, "checkout").boundingBox();
  const canvas = await page(this).locator(".react-flow").boundingBox();
  assert.ok(bounds && canvas && bounds.width > canvas.width, "The scaled label must really exceed the available canvas.");
});

When("keyboard focus reaches the Checkout Invoice API label", async function (this: ArcInspectionWorld) {
  this.arcInspectionConsumer = "checkout";
  await label(this).evaluate((element) => {
    const controls = [...document.querySelectorAll<HTMLElement>("button, input:not([type='radio']), input[type='radio']:checked, [tabindex='0']")]
      .filter((control) => control.checkVisibility() && !control.hasAttribute("disabled"));
    const previous = controls[controls.indexOf(element as HTMLElement) - 1];
    if (!previous) throw new Error("The arc label must have a preceding keyboard control.");
    previous.focus({ preventScroll: true });
  });
  await rememberView(this);
  this.arcInspectionLabelBounds = await label(this).boundingBox() ?? undefined;
  this.arcInspectionCanvasBounds = await page(this).locator(".react-flow").boundingBox() ?? undefined;
  this.arcInspectionRecord = await page(this).getByRole("dialog").count() ? await page(this).getByRole("dialog").textContent() : null;
  await page(this).keyboard.press("Tab");
  await expect(label(this)).toBeFocused();
  await page(this).evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
});

Then("its label and focus outline are revealed with the smallest pan", async function (this: ArcInspectionWorld) {
  const before = this.arcInspectionLabelBounds;
  const canvas = this.arcInspectionCanvasBounds;
  const after = await label(this).boundingBox();
  assert.ok(before && canvas && after && before.y < canvas.y, "The focused label must start above the canvas.");
  assert.ok(Math.abs(after.y - canvas.y - 4) < 1, "The clipped label edge and focus outline must be revealed.");
  assert.ok(Math.abs(after.x - before.x) < 1, "Revealing a top edge must not move a visible horizontal edge.");
  assert.ok(after.y + after.height <= canvas.y + canvas.height - 4);
});

Then("the label's start and nearby focus outline are visible", async function (this: ArcInspectionWorld) {
  const canvas = this.arcInspectionCanvasBounds;
  const bounds = await label(this).boundingBox();
  assert.ok(canvas && bounds && bounds.width > canvas.width);
  const padding = await label(this).evaluate((element) => {
    const style = getComputedStyle(element);
    return Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
  }) * (this.arcInspectionCamera?.[0] ?? 1);
  assert.ok(Math.abs(bounds.x - canvas.x - padding) < 1,
    `The oversized label's leading name and full focus edge must be visible: ${JSON.stringify({ bounds, canvas, padding })}`);
  assert.ok(bounds.y >= canvas.y + padding - 1 && bounds.y < canvas.y + canvas.height - padding);
});

Then("keyboard focus leaves zoom and the inspected record unchanged", async function (this: ArcInspectionWorld) {
  assert.equal((await camera(page(this)))[0], this.arcInspectionCamera?.[0]);
  const record = await page(this).getByRole("dialog").count() ? await page(this).getByRole("dialog").textContent() : null;
  assert.equal(record, this.arcInspectionRecord);
  const scroll = await page(this).locator(".react-flow").evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
  assert.deepEqual(scroll, { x: 0, y: 0 }, "Keyboard focus must pan through the camera, not native scrolling.");
});

Given(/^a Checkout component drag has (finished|been cancelled) without changing inspection$/, async function (this: ArcInspectionWorld, ending: string) {
  const browser = page(this);
  const bounds = await browser.getByRole("button", { name: "Checkout, checkout", exact: true }).boundingBox();
  assert.ok(bounds);
  await browser.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await browser.mouse.down();
  await browser.mouse.move(bounds.x + bounds.width / 2 + 35, bounds.y + bounds.height / 2 + 25, { steps: 5 });
  if (ending === "been cancelled") await browser.keyboard.press("Escape");
  await browser.mouse.up();
  await expect(browser.getByRole("dialog")).toHaveCount(0);
});

Then("pointer focus stays on the exact initiating arc label", async function (this: ArcInspectionWorld) {
  await expect(label(this)).toBeFocused();
});

When("Escape closes the panel from the pointer-focused off-screen arc", async function (this: ArcInspectionWorld) {
  await expect(label(this)).toBeFocused();
  this.arcInspectionLabelBounds = await label(this).boundingBox() ?? undefined;
  this.arcInspectionCanvasBounds = await page(this).locator(".react-flow").boundingBox() ?? undefined;
  await page(this).keyboard.press("Escape");
});

Then("the same focused label is revealed with the smallest horizontal pan", async function (this: ArcInspectionWorld) {
  const before = this.arcInspectionLabelBounds;
  const canvas = this.arcInspectionCanvasBounds;
  const after = await label(this).boundingBox();
  assert.ok(before && canvas && after && before.x + before.width < canvas.x);
  await expect(label(this)).toBeFocused();
  await expect(label(this)).toHaveCSS("opacity", "1");
  assert.ok(Math.abs(after.x - canvas.x - 4) < 1, "Keyboard input must reveal the already-focused label and outline.");
  assert.ok(Math.abs(after.y - before.y) < 1);
  assert.equal((await camera(page(this)))[0], this.arcInspectionCamera?.[0]);
  await expect(page(this).getByRole("dialog")).toHaveCount(0);
});

Then("the short arc label has no long empty background beside its name", async function (this: ArcInspectionWorld) {
  const sizes = await label(this).evaluate((element) => {
    const text = document.createRange();
    const name = element.querySelector("span")?.firstChild;
    if (!name) throw new Error("The interface label must contain its visible name.");
    text.selectNodeContents(name);
    return { label: element.getBoundingClientRect().width, text: text.getBoundingClientRect().width };
  });
  assert.ok(sizes.label <= sizes.text + 24, `The short label has ${sizes.label - sizes.text}px of unused width.`);
});

async function unchangedView(world: ArcInspectionWorld) {
  assert.ok(world.arcInspectionCamera && world.arcInspectionPositions);
  await expect.poll(() => camera(page(world))).toEqual(world.arcInspectionCamera);
  const positions = await page(world).locator(".react-flow__node").evaluateAll((nodes) =>
    nodes.map((node) => `${node.getAttribute("data-id")}:${(node as HTMLElement).style.transform}`));
  assert.deepEqual(positions, world.arcInspectionPositions);
  const scroll = await page(world).locator(".react-flow").evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
  assert.deepEqual(scroll, { x: 0, y: 0 }, "Pointer inspection must not scroll the canvas to its off-screen label.");
}

Then("arc inspection preserves the camera and component positions", async function (this: ArcInspectionWorld) {
  await unchangedView(this);
});

After({ tags: "@br-07c" }, async function (this: ArcInspectionWorld) {
  if (this.arcInspectionDirectory) await rm(this.arcInspectionDirectory, { recursive: true, force: true });
});
