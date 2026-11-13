import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { connectionScopeBaseline } from "../support/connection-scope-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { unobscuredArcPoint } from "../support/interface-pointer.ts";

interface LabelWorld extends World {
  page?: Page;
  labelDirectory?: string;
  labelCamera?: string | null;
  labelPositions?: string[];
  labelPointerHit?: boolean;
}

function page(world: LabelWorld) { assert.ok(world.page); return world.page; }
function invoice(world: LabelWorld) { return page(world).locator('[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="checkout"]'); }

async function remember(world: LabelWorld) {
  world.labelCamera = await page(world).locator(".react-flow__viewport").getAttribute("style");
  world.labelPositions = await page(world).locator(".react-flow__node").evaluateAll((elements) => elements.map((element) => (element as HTMLElement).style.transform));
}

async function open(world: LabelWorld, component?: "Checkout" | "Billing") {
  const browser = page(world);
  await browser.setViewportSize({ width: 1280, height: 800 });
  world.labelDirectory = await mkdtemp(join(tmpdir(), "choom-label-demand-"));
  const file = join(world.labelDirectory, "baseline.yaml");
  await writeFile(file, stringify(connectionScopeBaseline(), { aliasDuplicateObjects: false }));
  const viewer = new BaselineBrowserDriver(browser);
  await viewer.open();
  await viewer.openBaseline(file);
  await expect(browser.getByRole("heading", { name: "connection-scope", exact: true })).toBeVisible();
  if (component) await browser.getByRole("button", { name: `${component}, ${component.toLowerCase()}`, exact: true }).click();
  await browser.mouse.move(8, 8);
  await remember(world);
}

async function painted(world: LabelWorld) {
  return page(world).locator("[data-interface-label]").evaluateAll((elements) => elements.filter((element) => {
    for (let current: Element | null = element.querySelector("span") ?? element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return true;
  }).map((element) => `${element.getAttribute("data-interface-id")}:${element.getAttribute("data-consumer-id")}`));
}

async function curvePoint(world: LabelWorld) {
  return unobscuredArcPoint(page(world).locator('path[data-interface-arc][data-interface-id="invoice-api"][data-consumer-id="checkout"]'));
}

async function hoverCurve(world: LabelWorld) {
  const point = await curvePoint(world);
  await page(world).mouse.move(point.x, point.y);
}

Given("the connection label baseline is open", async function (this: LabelWorld) { await open(this); });
Given("Checkout's two label controls are available", async function (this: LabelWorld) { await open(this, "Checkout"); });
Given("Billing's three label controls are available", async function (this: LabelWorld) { await open(this, "Billing"); });
When("the user selects Checkout to inspect its labels", async function (this: LabelWorld) { await page(this).getByRole("button", { name: "Checkout, checkout", exact: true }).click(); });
When("the pointer enters Checkout's Invoice API curve", async function (this: LabelWorld) { await hoverCurve(this); });
Given("the pointer is on Checkout's Invoice API curve", async function (this: LabelWorld) { await open(this, "Checkout"); await hoverCurve(this); });
When("the pointer moves onto the Invoice API label", async function (this: LabelWorld) { await invoice(this).hover(); });
When("the pointer leaves the curve and label", async function (this: LabelWorld) { await page(this).mouse.move(8, 8); });
When("keyboard navigation reaches its first interface arc", async function (this: LabelWorld) {
  await page(this).getByRole("radio", { name: "Selected", exact: true }).focus();
  for (let count = 0; count < 20; count += 1) {
    await page(this).keyboard.press("Tab");
    if (await invoice(this).evaluate((element) => element === document.activeElement)) return;
  }
  assert.fail("Keyboard navigation must reach the shown arc.");
});
When("the user selects its Invoice API curve and moves away", async function (this: LabelWorld) {
  const point = await curvePoint(this);
  await page(this).mouse.click(point.x, point.y);
  await page(this).mouse.move(8, 8);
});
When("the user taps its Invoice API curve without hovering", async function (this: LabelWorld) {
  const point = await curvePoint(this);
  await page(this).touchscreen.tap(point.x, point.y);
});
When("the pointer crosses a hidden label rectangle away from its curve", async function (this: LabelWorld) {
  const box = await invoice(this).boundingBox();
  assert.ok(box);
  const point = { x: box.x + box.width / 2, y: box.y + 2 };
  await page(this).mouse.move(point.x, point.y);
  this.labelPointerHit = await page(this).evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("[data-interface-label]")), point);
});
Given("Checkout's Invoice API arc has keyboard focus in All mode", async function (this: LabelWorld) {
  await open(this, "Checkout");
  await page(this).getByRole("radio", { name: "All", exact: true }).check();
  await page(this).keyboard.press("Tab");
  await expect(invoice(this)).toBeFocused();
});
When("the pointer inspects that focused arc and closes the panel before leaving", async function (this: LabelWorld) {
  await invoice(this).click();
  await page(this).getByRole("button", { name: "Close details", exact: true }).click();
  await page(this).mouse.move(8, 8);
});
Given("an Invoice API arc has pointer focus with its details open in All mode", async function (this: LabelWorld) {
  await open(this, "Checkout");
  await page(this).getByRole("radio", { name: "All", exact: true }).check();
  const point = await curvePoint(this);
  await page(this).mouse.click(point.x, point.y);
  await page(this).mouse.move(8, 8);
  await expect(invoice(this)).toBeFocused();
});
When("Escape closes its panel from that arc", async function (this: LabelWorld) { await page(this).keyboard.press("Escape"); });
When("the user opens its owned Invoice API details", async function (this: LabelWorld) {
  await page(this).getByRole("region", { name: "Owned interfaces", exact: true }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
});

Then("its two arc names are not painted and remain accessible", async function (this: LabelWorld) {
  await expect(page(this).locator("[data-interface-label]")).toHaveCount(2);
  assert.deepEqual(await painted(this), []);
  await expect(invoice(this)).toHaveAccessibleName("Invoice API, invoice-api; consumer Checkout, checkout; owner Billing, billing");
});
Then("only that Invoice API name is painted with a transparent background", async function (this: LabelWorld) {
  await expect.poll(() => painted(this)).toEqual(["invoice-api:checkout"]);
  assert.equal(await invoice(this).evaluate((element) => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
});
Then("only that Invoice API name remains painted", async function (this: LabelWorld) { await expect.poll(() => painted(this)).toEqual(["invoice-api:checkout"]); });
Then("label demand has not changed the camera or component positions", async function (this: LabelWorld) {
  assert.equal(await page(this).locator(".react-flow__viewport").getAttribute("style"), this.labelCamera);
  assert.deepEqual(await page(this).locator(".react-flow__node").evaluateAll((elements) => elements.map((element) => (element as HTMLElement).style.transform)), this.labelPositions);
});
Then("that arc's name and keyboard focus indicator are painted", async function (this: LabelWorld) {
  await expect(invoice(this)).toBeFocused();
  assert.deepEqual(await painted(this), ["invoice-api:checkout"]);
  assert.ok(await invoice(this).evaluate((element) => element.matches(":focus-visible") && Number.parseFloat(getComputedStyle(element).outlineWidth) > 0));
});
Then("Checkout's component details remain open", async function (this: LabelWorld) {
  await expect(page(this).getByRole("dialog", { name: "Component details", exact: true }).getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
});
Then("both shown Invoice API names remain painted with its details open", async function (this: LabelWorld) {
  await expect.poll(() => painted(this)).toEqual(["invoice-api:checkout", "invoice-api:reporting"]);
  await expect(page(this).getByRole("dialog", { name: "Interface details", exact: true })).toBeVisible();
});
Then("the hidden label is not a pointer target and stays unpainted", async function (this: LabelWorld) {
  assert.equal(this.labelPointerHit, false);
  assert.deepEqual(await painted(this), []);
});
Then("no arc label remains painted from the earlier keyboard focus", async function (this: LabelWorld) { assert.deepEqual(await painted(this), []); });
Then("Billing's scope remains and only Invoice API names are painted", async function (this: LabelWorld) {
  await expect(page(this).locator("path[data-interface-arc]")).toHaveCount(3);
  assert.deepEqual(await painted(this), ["invoice-api:checkout", "invoice-api:reporting"]);
});

After({ tags: "@br-08b" }, async function (this: LabelWorld) { if (this.labelDirectory) await rm(this.labelDirectory, { recursive: true, force: true }); });
