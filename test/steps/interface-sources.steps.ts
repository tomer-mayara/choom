import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Locator, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import { interfaceSourceFixture } from "../support/interface-source-fixtures.ts";

const expect = browserExpect.configure({ timeout: 2_000 });
interface SourcesWorld extends World {
  page?: Page; sourceDirectory?: string; sourceFile?: string; sourceUrl?: string; sourceRequests?: string[];
  sourceTextPercent?: number; sourceExampleScroll?: number; sourceListScroll?: number;
  sourcePointerPress?: { before: number; after: number };
  sourceDrawing?: Awaited<ReturnType<typeof drawing>>; sourceComponentArcs?: string[];
}
function page(world: SourcesWorld): Page { assert.ok(world.page); return world.page; }
const panel = (world: SourcesWorld) => page(world).getByRole("dialog", { name: "Interface details", exact: true });
const content = (world: SourcesWorld) => page(world).getByLabel("Record content", { exact: true });
const examples = (world: SourcesWorld) => panel(world).getByRole("tabpanel", { name: "Example", exact: true });
const sources = (world: SourcesWorld) => panel(world).getByRole("tabpanel", { name: "Sources", exact: true });
async function showSources(world: SourcesWorld) { await panel(world).getByRole("tab", { name: "Sources", exact: true }).click(); }
async function openFixture(world: SourcesWorld, variant: "compact" | "reading" | "owned-list" = "compact") {
  world.sourceDirectory = await mkdtemp(join(tmpdir(), "choom-sources-"));
  world.sourceFile = join(world.sourceDirectory, "baseline.yaml");
  await writeFile(world.sourceFile, stringify(interfaceSourceFixture(variant)));
  const driver = new BaselineBrowserDriver(page(world)); await driver.open(); await driver.openBaseline(world.sourceFile);
  await expect(page(world).getByText("Baseline ready.", { exact: true })).toBeVisible();
  if (world.sourceTextPercent) await page(world).evaluate((size) => { document.documentElement.style.fontSize = `${size}%`; }, world.sourceTextPercent);
  await page(world).getByRole("button", { name: "Billing, billing", exact: true }).click();
  const row = page(world).getByRole("region", { name: "Owned interfaces" }).getByRole("button", { name: "Invoice API, invoice-api", exact: true });
  if (variant === "owned-list") {
    await row.scrollIntoViewIfNeeded();
    world.sourceListScroll = await content(world).evaluate((element) => element.scrollTop);
    assert.ok(world.sourceListScroll > 400);
    world.sourceComponentArcs = await arcIds(world);
  }
  world.sourceDrawing = await drawing(world);
  await row.click();
  await expect(panel(world)).toBeVisible();
  world.sourceUrl = page(world).url(); world.sourceRequests = [];
  page(world).on("request", (request) => world.sourceRequests?.push(request.url()));

}
Given("the interface source baseline is open", async function (this: SourcesWorld) { await openFixture(this); });
When("the user opens its Sources tab", async function (this: SourcesWorld) { await showSources(this); });
Then("its saved note descriptions and two available source locations are readable", async function (this: SourcesWorld) {
  await expect(sources(this).getByText("Invoice validation and result construction.", { exact: true })).toBeVisible();
  await expect(sources(this).getByText("Empty orders are rejected before storage.", { exact: true })).toBeVisible();
  for (const path of ["billing/invoice.ts", "billing/order-check.ts"]) await expect(sources(this).getByText(path, { exact: true })).toBeVisible();
  await expect(sources(this).getByText("Lines 1–12", { exact: true })).toBeVisible();
  await expect(sources(this).getByText("Lines 17–23", { exact: true })).toBeVisible();
  await expect(sources(this).getByText("snapshot-invoice", { exact: true })).toHaveCount(2);
});
Then("the note without a location has no invented path", async function (this: SourcesWorld) {
  const note = sources(this).getByRole("listitem").filter({ hasText: "Approved public contract and permitted callers." });
  await expect(note.getByText("Location not recorded.", { exact: true })).toBeVisible();
  await expect(note).not.toContainText(/billing\/|snapshot-invoice|SHA-256/);
});
Then("reading Sources makes no source request or navigation", async function (this: SourcesWorld) {
  assert.deepEqual(this.sourceRequests, []); assert.equal(page(this).url(), this.sourceUrl);
  await expect(sources(this).locator("a[href], img, script, iframe")).toHaveCount(0);
});
When("the user expands its Original record in Sources", async function (this: SourcesWorld) {
  await showSources(this); await sources(this).locator("details[data-section='original-interface-record'] summary").click();
});
Then("its complete original interface values are available", async function (this: SourcesWorld) {
  const original = sources(this).locator("details[data-section='original-interface-record'] pre");
  await expect(original).toBeVisible();
  assert.deepEqual(JSON.parse(await original.textContent() ?? "null"), fixtureItem(interfaceSourceFixture().interfaces));
});
After({ tags: "@br-10d" }, async function (this: SourcesWorld) {
  if (this.sourceDirectory) await rm(this.sourceDirectory, { recursive: true, force: true });
});

async function drawing(world: SourcesWorld) {
  return page(world).evaluate(() => ({
    nodes: Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"), (node) => node.style.transform),
    camera: document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform,
  }));
}
async function arcIds(world: SourcesWorld) {
  return page(world).locator("path[data-interface-arc]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-interface-arc") ?? "").sort());
}
const sourceSections = ["interface-statements", "interface-evidence", "original-interface-record"];
const overviewNames = ["Interface-wide contract", "What changes and when it ends", "Access rule"];
async function expandSourceSections(world: SourcesWorld) {
  await showSources(world);
  for (const key of sourceSections) await sources(world).locator(`details[data-section='${key}'] summary`).click();
}
async function prepareReading(world: SourcesWorld) {
  for (const name of overviewNames) await panel(world).locator("summary").filter({ hasText: name }).click();
  await expandSourceSections(world);
  await panel(world).getByRole("tab", { name: "Example", exact: true }).click();
  await examples(world).getByRole("button", { name: "An empty order, empty-order", exact: true }).click();
  await examples(world).locator("details[data-section='example-result'] summary").click();
  await content(world).evaluate((element) => { element.scrollTop = 500; });
  world.sourceExampleScroll = await content(world).evaluate((element) => element.scrollTop);
  assert.ok(world.sourceExampleScroll > 400);
}
When("the user expands its recorded statements and evidence references", async function (this: SourcesWorld) {
  await showSources(this);
  for (const name of ["Recorded statements", "Evidence references"]) await sources(this).locator("summary").filter({ hasText: name }).click();
});
Then("each evidence ID appears once with every citing field path", async function (this: SourcesWorld) {
  const evidence = sources(this).locator("details[data-section='interface-evidence']");
  await expect(evidence.getByText("contract-notes", { exact: true })).toHaveCount(1);
  const reference = evidence.locator("li").filter({ has: page(this).getByText("contract-notes", { exact: true }) });
  for (const field of ["owner", "publicAccess", "allowedConsumers", "documentation.summary", "documentation.entries.create-invoice.examples.empty-order.content"]) {
    await expect(reference.getByText(`invoice-api.${field}`, { exact: true })).toHaveCount(1);
  }
  await expect(evidence.getByText("Evidence content is not included.", { exact: true })).toHaveCount(1);
});
Then("the saved acceptance reference and unresolved evidence remain available as plain text", async function (this: SourcesWorld) {
  await expect(sources(this).getByText("review-42#decision-1", { exact: true })).toBeVisible();
  await expect(sources(this).getByText("unresolved-contract#/claims/7", { exact: true })).toBeVisible();
  await expect(sources(this).locator("a[href]")).toHaveCount(0);
});
Given("the interface source baseline is open from a scrolled owned list", async function (this: SourcesWorld) { await openFixture(this, "owned-list"); });
When("the user reads its selected example through Sources and goes Back", async function (this: SourcesWorld) {
  await prepareReading(this); await showSources(this);
  await panel(this).getByRole("tab", { name: "Example", exact: true }).click();
  await panel(this).getByRole("button", { name: "Back", exact: true }).click();
});
Then("its owned list row and scroll position return without moving the drawing", async function (this: SourcesWorld) {
  const component = page(this).getByRole("dialog", { name: "Component details", exact: true });
  await expect(component.getByRole("button", { name: "Invoice API, invoice-api", exact: true })).toBeFocused();
  assert.equal(await content(this).evaluate((element) => element.scrollTop), this.sourceListScroll);
  await expect(component.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(page(this).getByRole("button", { name: "Billing, billing", exact: true })).toHaveAttribute("aria-pressed", "true");
  assert.deepEqual(await drawing(this), this.sourceDrawing);
  assert.deepEqual(await arcIds(this), this.sourceComponentArcs);
});
Given("the interface source baseline has an example being read", async function (this: SourcesWorld) { await openFixture(this, "reading"); await prepareReading(this); });
When("the user returns through Sources and Overview to Example", async function (this: SourcesWorld) {
  for (const name of ["Sources", "Overview", "Example"]) await panel(this).getByRole("tab", { name, exact: true }).click();
});
Then("its selected entry, case, result, and reading position remain", async function (this: SourcesWorld) {
  await expect(panel(this).getByRole("tab", { name: "Example", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(examples(this).getByRole("heading", { name: "Create invoice", exact: true })).toBeVisible();
  await expect(examples(this).getByRole("button", { name: "An empty order, empty-order", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(examples(this).locator("details[data-section='example-result']")).toHaveAttribute("open");
  assert.equal(await content(this).evaluate((element) => element.scrollTop), this.sourceExampleScroll);
  assert.deepEqual(await drawing(this), this.sourceDrawing);
});
Then("all Overview and Sources disclosures remain expanded without extra Back history", async function (this: SourcesWorld) {
  await showSources(this);
  for (const key of sourceSections) await expect(sources(this).locator(`details[data-section='${key}']`)).toHaveAttribute("open");
  await panel(this).getByRole("tab", { name: "Overview", exact: true }).click();
  for (const key of ["interface-wide-contract", "interface-lifecycle", "interface-access-rule"]) await expect(panel(this).locator(`details[data-section='${key}']`)).toHaveAttribute("open");
  await panel(this).getByRole("button", { name: "Back", exact: true }).click();
  await expect(page(this).getByRole("dialog", { name: "Component details", exact: true })).toBeVisible();
  await expect(page(this).getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
});
When(/^opening a replacement source baseline (fails|is cancelled)$/, async function (this: SourcesWorld, outcome: string) {
  if (outcome === "fails") {
    assert.ok(this.sourceDirectory);
    const invalid = join(this.sourceDirectory, "invalid.yaml"); await writeFile(invalid, "formatVersion: [");
    await new BaselineBrowserDriver(page(this)).openBaseline(invalid);
    await expect(page(this).getByRole("alert")).toBeVisible();
  } else {
    const chooser = page(this).waitForEvent("filechooser");
    await page(this).getByRole("button", { name: "Open Baseline", exact: true }).click();
    await (await chooser).setFiles([]);
    await expect(page(this).getByRole("status").filter({ hasText: "Load cancelled." })).toBeVisible();
  }
});
When("the user opens Sources and successfully replaces the baseline with the same saved IDs", async function (this: SourcesWorld) {
  await showSources(this); assert.ok(this.sourceFile);
  await new BaselineBrowserDriver(page(this)).openBaseline(this.sourceFile);
  await expect(panel(this)).toHaveCount(0);
});
Then("the old frame is removed and a new selection starts with the first entry on Overview", async function (this: SourcesWorld) {
  await page(this).getByRole("button", { name: "Billing, billing", exact: true }).click();
  await page(this).getByRole("region", { name: "Owned interfaces" }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
  await expect(panel(this).getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel(this).getByRole("button", { name: "Create invoice, create-invoice", exact: true })).toHaveAttribute("aria-pressed", "true");
});
Then("its source disclosures start closed", async function (this: SourcesWorld) {
  await showSources(this);
  for (const key of sourceSections) await expect(sources(this).locator(`details[data-section='${key}']`)).not.toHaveAttribute("open");
});
Given("the source reader window is {int} by {int} with {int} percent text", async function (this: SourcesWorld, width: number, height: number, percent: number) {
  await page(this).setViewportSize({ width, height }); this.sourceTextPercent = percent;
});
async function focusedVisible(world: SourcesWorld, target: Locator) {
  await expect(target).toBeFocused();
  const bounds = await content(world).evaluate((element) => {
    const active = document.activeElement; assertElement(active);
    function assertElement(value: Element | null): asserts value is HTMLElement { if (!(value instanceof HTMLElement)) throw new Error("Expected a focused control."); }
    const rect = active.getBoundingClientRect(), area = element.getBoundingClientRect();
    const tabs = element.querySelector('[role="tablist"]');
    return { top: rect.top, bottom: rect.bottom, start: tabs?.contains(active) ? area.top : Math.max(area.top, tabs?.getBoundingClientRect().bottom ?? area.top), end: area.bottom };
  });
  assert.ok(bounds.top >= bounds.start && bounds.bottom <= bounds.end, JSON.stringify(bounds));
}
When("the user reads all Sources disclosures with the keyboard", async function (this: SourcesWorld) {
  await panel(this).getByRole("tab", { name: "Overview", exact: true }).focus();
  await page(this).keyboard.press("ArrowRight");
  await focusedVisible(this, panel(this).getByRole("tab", { name: "Example", exact: true }));
  await page(this).keyboard.press("ArrowRight");
  await focusedVisible(this, panel(this).getByRole("tab", { name: "Sources", exact: true }));
  for (const key of sourceSections) {
    const summary = sources(this).locator(`details[data-section='${key}'] summary`);
    for (let step = 0; step < 3 && !await summary.evaluate((element) => element === document.activeElement); step++) await page(this).keyboard.press("Tab");
    await focusedVisible(this, summary);
    await page(this).keyboard.press("Enter");
    await expect(sources(this).locator(`details[data-section='${key}']`)).toHaveAttribute("open");
  }
});
Then("source controls stay visible and the page has no horizontal overflow", async function (this: SourcesWorld) {
  await focusedVisible(this, sources(this).locator("details[data-section='original-interface-record'] summary"));
  const size = await page(this).evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert.ok(size.content <= size.width, JSON.stringify(size));
});
When("the user returns from Detailed result to the first example with Shift Tab", async function (this: SourcesWorld) {
  await panel(this).getByRole("tab", { name: "Example", exact: true }).click();
  const result = examples(this).locator("details[data-section='example-result'] summary");
  for (let step = 0; step < 8 && !await result.evaluate((element) => element === document.activeElement); step++) await page(this).keyboard.press("Tab");
  await expect(result).toBeFocused();
  const first = examples(this).getByRole("button", { name: "A valid order, valid-order", exact: true });
  for (let step = 0; step < 6 && !await first.evaluate((element) => element === document.activeElement); step++) {
    await page(this).keyboard.press("Shift+Tab");
    await focusedVisible(this, page(this).locator(":focus"));
  }
  await expect(first).toBeFocused();
});
Then("the focused first example is fully below the sticky tabs", async function (this: SourcesWorld) {
  await focusedVisible(this, examples(this).getByRole("button", { name: "A valid order, valid-order", exact: true }));
  assert.deepEqual(await drawing(this), this.sourceDrawing);
});
When("the user presses and releases the visible part of an example choice", async function (this: SourcesWorld) {
  await panel(this).getByRole("tab", { name: "Example", exact: true }).click();
  await examples(this).locator("details[data-section='example-result'] summary").focus();
  const choice = examples(this).getByRole("button", { name: "An empty order, empty-order", exact: true });
  const movement = await choice.evaluate((element) => {
    const area = element.closest('[aria-label="Record content"]');
    const tabs = area?.querySelector('[role="tablist"]');
    if (!area || !tabs) throw new Error("Example choices need the tabbed reading area.");
    return { x: area.getBoundingClientRect().right - 20, y: area.getBoundingClientRect().bottom - 20,
      delta: element.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom + 20 };
  });
  await page(this).mouse.move(movement.x, movement.y); await page(this).mouse.wheel(0, movement.delta);
  await expect.poll(() => choice.evaluate((element) => {
    const tabs = element.closest('[aria-label="Record content"]')?.querySelector('[role="tablist"]');
    return element.getBoundingClientRect().top - (tabs?.getBoundingClientRect().bottom ?? 0);
  })).toBe(-20);
  const bounds = await choice.boundingBox(); assert.ok(bounds);
  const before = await content(this).evaluate((element) => element.scrollTop);
  await page(this).mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 4);
  await page(this).mouse.down(); await expect(choice).toBeFocused();
  this.sourcePointerPress = { before, after: await content(this).evaluate((element) => element.scrollTop) };
  await page(this).mouse.up();
});
Then("the press keeps the choice in place and selects that example", async function (this: SourcesWorld) {
  assert.ok(this.sourcePointerPress);
  assert.equal(this.sourcePointerPress.after, this.sourcePointerPress.before);
  await expect(examples(this).getByRole("button", { name: "An empty order, empty-order", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(examples(this).getByRole("group", { name: "Example", exact: true }).locator("pre")).toHaveText("createInvoice({ items: [] })\n");
});
When("the user opens Sources and its evidence list with touch", async function (this: SourcesWorld) {
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).tap();
  await sources(this).locator("details[data-section='interface-evidence'] summary").tap();
});
