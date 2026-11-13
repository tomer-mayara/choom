import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type ElementHandle, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import { connectionScopeBaseline } from "../support/connection-scope-fixtures.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";

interface ScopeWorld extends World {
  page?: Page;
  scopeDirectory?: string;
  scopeFile?: string;
  scopeViewer?: BaselineBrowserDriver;
  scopePositions?: string[];
  scopeCamera?: string;
  scopeBounds?: { x: number; y: number; width: number; height: number } | null;
  scopeShared?: ElementHandle<Node>[];
}

function page(world: ScopeWorld) { assert.ok(world.page); return world.page; }
const checkoutArcs = ["invoice-api:checkout:billing", "checkout-status:billing:checkout"];
const billingArcs = ["invoice-api:checkout:billing", "invoice-api:reporting:billing", "checkout-status:billing:checkout"];

async function arcSet(world: ScopeWorld, expected: string[]) {
  const browser = page(world);
  await expect(browser.locator("path[data-interface-arc]")).toHaveCount(expected.length, { timeout: 1500 });
  assert.deepEqual(await browser.locator("path[data-interface-arc]").evaluateAll((arcs) => arcs.map((arc) =>
    `${arc.getAttribute("data-interface-id")}:${arc.getAttribute("data-consumer-id")}:${arc.getAttribute("data-owner-id")}`)), expected);
  await expect(browser.locator("button[data-interface-label]")).toHaveCount(expected.length);
}

async function remember(world: ScopeWorld) {
  const browser = page(world);
  world.scopePositions = await browser.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.transform));
  world.scopeCamera = await browser.locator(".react-flow__viewport").getAttribute("style") ?? "";
  world.scopeBounds = await browser.locator(".react-flow").boundingBox();
}

async function prepare(world: ScopeWorld, unknown = false) {
  const browser = page(world);
  await browser.setViewportSize({ width: 1280, height: 800 });
  const baseline = connectionScopeBaseline();
  if (unknown) fixtureItem(baseline.interfaces, 2).allowedConsumers.value = null;
  const yaml = stringify(baseline, { aliasDuplicateObjects: false });
  assert.equal(decodeBaselineYaml(yaml).status, "success");
  world.scopeDirectory = await mkdtemp(join(tmpdir(), "choom-connection-scope-"));
  world.scopeFile = join(world.scopeDirectory, "baseline.yaml");
  await writeFile(world.scopeFile, yaml);
  world.scopeViewer = new BaselineBrowserDriver(browser);
  await world.scopeViewer.open();
}

async function open(world: ScopeWorld) {
  assert.ok(world.scopeViewer && world.scopeFile);
  await world.scopeViewer.openBaseline(world.scopeFile);
  await expect(page(world).getByRole("heading", { name: "connection-scope", exact: true })).toBeVisible();
  await expect(page(world).locator(".react-flow__node")).toHaveCount(4);
  await remember(world);
}

Given("the four-arc connection baseline is ready", async function (this: ScopeWorld) { await prepare(this); });
Given("the connection baseline is open", async function (this: ScopeWorld) { await prepare(this); await open(this); });
Given("the connection baseline has one unknown interface and is open", async function (this: ScopeWorld) { await prepare(this, true); await open(this); });
When("the user opens the connection baseline", async function (this: ScopeWorld) { await open(this); });

Given("Checkout's connections are shown", async function (this: ScopeWorld) {
  await prepare(this); await open(this);
  await page(this).getByRole("button", { name: "Checkout, checkout", exact: true }).click();
  await arcSet(this, checkoutArcs);
  this.scopeShared = await page(this).locator("button[data-interface-label]").elementHandles();
  await remember(this);
});

Given("Billing's connections are shown through Baseline details", async function (this: ScopeWorld) {
  await prepare(this); await open(this);
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
  await page(this).getByRole("region", { name: "Components", exact: true }).getByRole("button", { name: "Billing, billing", exact: true }).click();
  await arcSet(this, billingArcs);
});

When(/^the user selects (Checkout|Billing) for its connections$/, async function (this: ScopeWorld, name: string) {
  await page(this).locator(".react-flow").getByRole("button", { name: `${name}, ${name.toLowerCase()}`, exact: true }).click();
});
When("the user chooses All connections", async function (this: ScopeWorld) { await page(this).getByRole("radio", { name: "All", exact: true }).check(); });
When("the user activates its Invoice API arc with the keyboard", async function (this: ScopeWorld) {
  await page(this).locator('[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="checkout"]').focus();
  await page(this).keyboard.press("Enter");
});
Given("Invoice API was opened directly from Checkout's arc", async function (this: ScopeWorld) {
  await prepare(this); await open(this);
  await page(this).getByRole("button", { name: "Checkout, checkout", exact: true }).click();
  await page(this).locator('[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="checkout"]').focus();
  await page(this).keyboard.press("Enter");
});
When("the user closes the connection details", async function (this: ScopeWorld) { await page(this).getByRole("button", { name: "Close details", exact: true }).click(); });
When("the user opens Billing's Invoice API record", async function (this: ScopeWorld) {
  await page(this).getByRole("region", { name: "Owned interfaces", exact: true }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
});
When("the user opens Invoice API through Baseline details", async function (this: ScopeWorld) {
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
  await page(this).getByRole("region", { name: "Interfaces", exact: true }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
});
When(/^the user opens (Rules|Baseline details) instead$/, async function (this: ScopeWorld, route: string) { await page(this).getByRole("button", { name: route, exact: true }).click(); });
When("the user goes Back from connection details", async function (this: ScopeWorld) { await page(this).getByRole("button", { name: "Back", exact: true }).click(); });
Given("Billing's owned Invoice API details are shown", async function (this: ScopeWorld) {
  await prepare(this); await open(this);
  await page(this).getByRole("button", { name: "Billing, billing", exact: true }).click();
  await page(this).getByRole("region", { name: "Owned interfaces", exact: true }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
});
Given("Invoice API was opened through Baseline details", async function (this: ScopeWorld) {
  await prepare(this); await open(this);
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
  await page(this).getByRole("region", { name: "Interfaces", exact: true }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
});
Given("its Invoice API arc has keyboard focus outside the panel", async function (this: ScopeWorld) {
  await page(this).locator('[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="checkout"]').focus();
});
When("the user presses Escape to close connection details", async function (this: ScopeWorld) { await page(this).keyboard.press("Escape"); });

async function releaseHiddenPress(world: ScopeWorld) {
  const browser = page(world);
  const label = browser.locator('[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="checkout"]');
  await label.focus();
  const before = await label.boundingBox();
  assert.ok(before);
  await browser.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await browser.mouse.down();
  await browser.getByRole("button", { name: "Baseline details", exact: true }).focus();
  await browser.keyboard.press("Enter");
  await arcSet(world, []);
  await browser.locator(".react-flow").getByRole("button", { name: "Checkout, checkout", exact: true }).focus();
  await browser.keyboard.press("Enter");
  await arcSet(world, checkoutArcs);
  const after = await label.boundingBox();
  assert.ok(after);
  await browser.mouse.move(after.x + after.width / 2, after.y + after.height / 2);
  await browser.mouse.up();
}
When("the user releases an arc press after hiding and restoring its scope", async function (this: ScopeWorld) { await releaseHiddenPress(this); });
Given("a hidden arc's old press has been ignored", async function (this: ScopeWorld) {
  await prepare(this); await open(this);
  await page(this).getByRole("button", { name: "Checkout, checkout", exact: true }).click();
  await releaseHiddenPress(this);
});
When("the user presses its Invoice API curve again", async function (this: ScopeWorld) {
  const browser = page(this);
  const point = await browser.locator('path[data-interface-arc][data-interface-id="invoice-api"][data-consumer-id="checkout"]').evaluate((element) => {
    const path = element as SVGPathElement;
    const transform = path.getScreenCTM();
    if (!transform) throw new Error("The shown curve needs a screen transform.");
    const point = path.getPointAtLength(path.getTotalLength() * 0.25).matrixTransform(transform);
    return { x: point.x, y: point.y };
  });
  await browser.mouse.click(point.x, point.y);
});

Then("the overview shows four components and zero interface arcs", async function (this: ScopeWorld) {
  await expect(page(this).locator(".react-flow__node")).toHaveCount(4);
  await arcSet(this, []);
});
Then("the connection choice is Selected", async function (this: ScopeWorld) { await expect(page(this).getByRole("radio", { name: "Selected", exact: true })).toBeChecked(); });
Then("only Checkout's two direct arcs are shown", async function (this: ScopeWorld) { await arcSet(this, checkoutArcs); });
Then("only Billing's three direct arcs are shown", async function (this: ScopeWorld) { await arcSet(this, billingArcs); });
Then("component positions are unchanged", async function (this: ScopeWorld) {
  assert.deepEqual(await page(this).locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.transform)), this.scopePositions);
});
Then("shared arc controls keep their identity and order", async function (this: ScopeWorld) {
  assert.ok(this.scopeShared);
  for (const handle of this.scopeShared) assert.equal(await handle.evaluate((element) => element.isConnected), true);
  assert.deepEqual(await page(this).locator("button[data-interface-label]").evaluateAll((arcs) => arcs.map((arc) =>
    `${arc.getAttribute("data-interface-id")}:${arc.getAttribute("data-consumer-id")}:${arc.getAttribute("data-owner-id")}`)), billingArcs);
});
Then("Invoice API's two arcs and its focused details heading are shown", async function (this: ScopeWorld) {
  await arcSet(this, billingArcs.slice(0, 2));
  const panel = page(this).getByRole("dialog", { name: "Interface details", exact: true });
  await expect(panel.getByRole("heading", { name: "Interface details", exact: true })).toBeFocused();
  await expect(panel.getByRole("heading", { name: "Invoice API", exact: true })).toBeVisible();
});
Then("no Back entry is offered", async function (this: ScopeWorld) { await expect(page(this).getByRole("button", { name: "Back", exact: true })).toHaveCount(0); });
Then("no connection arcs are shown and Billing's header has focus", async function (this: ScopeWorld) {
  await arcSet(this, []);
  await expect(page(this).getByRole("button", { name: "Billing, billing", exact: true })).toBeFocused();
});
Then("all four arcs are shown and Checkout's two arcs are emphasized", async function (this: ScopeWorld) {
  await arcSet(this, [...billingArcs, "identity-api:reporting:identity"]);
  const emphasis = await page(this).locator("path[data-interface-arc]").evaluateAll((arcs) => arcs.map((arc) => (arc as SVGPathElement).style.opacity));
  assert.deepEqual(emphasis, ["1", "0.35", "1", "0.35"]);
  await expect(page(this).getByRole("radio", { name: "All", exact: true })).toBeFocused();
});
Then("the component panel, camera, and positions stay unchanged", async function (this: ScopeWorld) {
  await expect(page(this).getByRole("dialog", { name: "Component details", exact: true }).getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
  assert.equal(await page(this).locator(".react-flow__viewport").getAttribute("style"), this.scopeCamera);
  assert.deepEqual(await page(this).locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.transform)), this.scopePositions);
});
Then("Billing's three arcs stay shown with the Invoice API arcs emphasized", async function (this: ScopeWorld) {
  await arcSet(this, billingArcs);
  assert.deepEqual(await page(this).locator("path[data-interface-arc]").evaluateAll((arcs) => arcs.map((arc) => (arc as SVGPathElement).style.opacity)), ["1", "1", "0.35"]);
});
Then("the Billing list and its focused interface entry are restored", async function (this: ScopeWorld) {
  await expect(page(this).getByRole("region", { name: "Owned interfaces", exact: true }).getByRole("button", { name: "Invoice API, invoice-api", exact: true })).toBeFocused();
  await arcSet(this, billingArcs);
});
Then("Baseline details is shown with no arcs", async function (this: ScopeWorld) {
  await expect(page(this).getByRole("dialog", { name: "Baseline details", exact: true })).toBeVisible();
  await arcSet(this, []);
});
Then("Checkout's component details remain open with its two arcs", async function (this: ScopeWorld) {
  await arcSet(this, checkoutArcs);
  await expect(page(this).getByRole("dialog", { name: "Component details", exact: true }).getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
});
Then("Invoice API's record is open with its two arcs", async function (this: ScopeWorld) {
  await arcSet(this, billingArcs.slice(0, 2));
  await expect(page(this).getByRole("dialog", { name: "Interface details", exact: true }).getByRole("heading", { name: "Invoice API", exact: true })).toBeVisible();
});
Then("no connection arcs or arc keyboard stops are shown", async function (this: ScopeWorld) { await arcSet(this, []); });
Then("the connection controls and canvas keep their bounds", async function (this: ScopeWorld) {
  assert.deepEqual(await page(this).locator(".react-flow").boundingBox(), this.scopeBounds);
  await expect(page(this).getByRole("radio", { name: "Selected", exact: true })).toBeVisible();
});
Then("only the three arcs with complete endpoints are shown", async function (this: ScopeWorld) { await arcSet(this, billingArcs); });
Then("the unknown-interface note counts the unchanged missing fact", async function (this: ScopeWorld) {
  await expect(page(this).getByText("1 interface has unknown owners or allowed consumers. Open Baseline details to inspect them.", { exact: true })).toBeVisible();
});

After({ tags: "@br-08a" }, async function (this: ScopeWorld) { if (this.scopeDirectory) await rm(this.scopeDirectory, { recursive: true, force: true }); });
