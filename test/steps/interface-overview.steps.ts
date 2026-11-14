import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Page } from "@playwright/test";
import { parse, stringify } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import { interfaceOverviewFixture } from "../support/interface-overview-fixtures.ts";

const expect = browserExpect.configure({ timeout: 2_000 });
const legacyPath = new URL("../fixtures/baseline-viewer/legacy-baseline-003.yaml", import.meta.url).pathname;
interface OverviewWorld extends World {
  page?: Page; overviewDirectory?: string; overviewBaseline?: Baseline;
  overviewGeometry?: { camera: string | null; nodes: (string | null)[] }; overviewWidth?: number;
  overviewVisualName?: string;
}
function page(world: OverviewWorld): Page { assert.ok(world.page); return world.page; }
const panel = (world: OverviewWorld) => page(world).getByRole("dialog", { name: "Interface details", exact: true });
const overview = (world: OverviewWorld) => panel(world).getByRole("tabpanel", { name: "Overview", exact: true });

Given("the unchanged baseline-003 file is open", async function (this: OverviewWorld) {
  const driver = new BaselineBrowserDriver(page(this));
  await driver.open();
  await driver.openBaseline(legacyPath);
  await expect(page(this).getByText("Baseline ready.", { exact: true })).toBeVisible();
});
When("the user inspects Baseline data and validation from the baseline catalog", async function (this: OverviewWorld) {
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
  await page(this).getByRole("region", { name: "Interfaces", exact: true }).getByRole("button", { name: /^Baseline data and validation,/ }).click();
});
Then("the interface Overview names Baseline model as its provider", async function (this: OverviewWorld) {
  await expect(panel(this).getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel(this).getByRole("group", { name: "Provider", exact: true })).toContainText("Baseline model");
});
Then("the saved legacy contract is readable without evidence arrays", async function (this: OverviewWorld) {
  const overview = panel(this).getByRole("tabpanel", { name: "Overview", exact: true });
  for (const name of ["Behavior", "Data exchanged", "Failures"]) await expect(overview.getByRole("group", { name, exact: true })).toBeVisible();
  await overview.locator("summary").filter({ hasText: "What changes and when it ends" }).click();
  const baseline = baselineSchema.parse(parse(await readFile(legacyPath, "utf8")));
  const item = baseline.interfaces.find(({ name }) => name === "Baseline data and validation");
  assert.ok(item?.promises.value);
  for (const value of Object.values(item.promises.value)) if (value !== null) await expect(overview).toContainText(value);
  await expect(overview).not.toContainText("Evidence references");
  await expect(overview).not.toContainText("s4-001-source-excerpt");
  await expect(overview.getByRole("group", { name: "Input", exact: true })).toHaveCount(0);
  await expect(panel(this).getByRole("tab", { name: "Example", exact: true })).toHaveCount(0);
});
Then("Sources retains the complete unchanged interface record", async function (this: OverviewWorld) {
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
  await panel(this).locator("details[data-section='original-interface-record'] summary").click();
  const text = await panel(this).locator("details[data-section='original-interface-record'] pre").innerText();
  const baseline = baselineSchema.parse(parse(await readFile(legacyPath, "utf8")));
  assert.deepEqual(JSON.parse(text), baseline.interfaces.find(({ name }) => name === "Baseline data and validation"));
});

Given(/^the (complete|partial|unknown interaction|unknown provider|unknown permission|mixed status) documented interface is open in Overview$/, async function (this: OverviewWorld, variant: string) {
  this.overviewBaseline = interfaceOverviewFixture(variant);
  this.overviewDirectory = await mkdtemp(join(tmpdir(), "choom-overview-"));
  const file = join(this.overviewDirectory, "baseline.yaml");
  await writeFile(file, stringify(this.overviewBaseline));
  const driver = new BaselineBrowserDriver(page(this));
  await driver.open();
  await driver.openBaseline(file);
  await expect(page(this).getByText("Baseline ready.", { exact: true })).toBeVisible();
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
  await page(this).getByRole("region", { name: "Interfaces", exact: true }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
  await expect(panel(this).getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
});
Then("the first entry and its saved interaction facts are identified", async function (this: OverviewWorld) {
  await expect(overview(this).getByRole("button", { name: "Create invoice, create-invoice", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(overview(this).getByRole("region", { name: "Selected entry", exact: true })).toContainText("Create invoice");
  for (const [name, value] of [["Input", "An order with at least one item."], ["Success", "An invoice with a stable ID."],
    ["Failures", "Reject an empty order."], ["Effects", "Save the invoice once validation succeeds."]]) {
    await expect(overview(this).getByRole("group", { name, exact: true })).toContainText(value ?? "");
  }
});
Then("all three entries and the unmatched access reference remain available", async function (this: OverviewWorld) {
  for (const name of ["Create invoice, create-invoice", "Invoice type, invoice-type", "Invoice data, invoice-data"]) {
    await expect(overview(this).getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(overview(this).getByRole("group", { name: "Recorded entry reference", exact: true })).toContainText("unclassified-reference");
});
Then("the general promises remain in Interface-wide contract", async function (this: OverviewWorld) {
  const contract = overview(this).locator("details[data-section='interface-wide-contract']");
  await expect(contract).not.toHaveAttribute("open");
  await contract.locator("summary").first().click();
  await expect(contract).toContainText("Create an invoice");
});
When("the user selects the Invoice type entry", async function (this: OverviewWorld) {
  await expect(overview(this).getByRole("button", { name: "Invoice type, invoice-type", exact: true })).toBeVisible();
  await overview(this).getByRole("button", { name: "Invoice type, invoice-type", exact: true }).click();
});
Then("its type description replaces the function interaction", async function (this: OverviewWorld) {
  const selected = overview(this).getByRole("region", { name: "Selected entry", exact: true });
  await expect(selected).toContainText("The invoice ID and its line items.");
  await expect(selected).toContainText("type");
  for (const name of ["Input", "Success", "Failures", "Effects"]) await expect(selected.getByRole("group", { name, exact: true })).toHaveCount(0);
  await expect(selected).not.toContainText("HTTP");
});
Then("input and failures are unknown while success and effects keep their saved text", async function (this: OverviewWorld) {
  for (const name of ["Input", "Failures"]) await expect(overview(this).getByRole("group", { name, exact: true })).toContainText("Unknown");
  await expect(overview(this).getByRole("group", { name: "Success", exact: true })).toContainText("An invoice with a stable ID.");
  await expect(overview(this).getByRole("group", { name: "Effects", exact: true })).toContainText("Save the invoice once validation succeeds.");
});
Then("one unknown interaction summary replaces the four interaction facts", async function (this: OverviewWorld) {
  const selected = overview(this).getByRole("region", { name: "Selected entry", exact: true });
  await expect(selected.getByText("Interaction facts are unknown.", { exact: true })).toHaveCount(1);
  for (const name of ["Input", "Success", "Failures", "Effects"]) await expect(selected.getByRole("group", { name, exact: true })).toHaveCount(0);
});
Then("Sources retains the complete documented interface record", async function (this: OverviewWorld) {
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
  await panel(this).locator("details[data-section='original-interface-record'] summary").click();
  assert.ok(this.overviewBaseline);
  assert.deepEqual(JSON.parse(await panel(this).locator("details[data-section='original-interface-record'] pre").innerText()), fixtureItem(this.overviewBaseline.interfaces));
});
Then("Provider unknown appears without an invented component", async function (this: OverviewWorld) {
  await expect(panel(this).getByRole("group", { name: "Provider", exact: true })).toContainText("Provider unknown");
  await expect(page(this).locator(".react-flow__node")).toHaveCount(2);
});
When("the user expands the interface Access rule", async function (this: OverviewWorld) {
  await overview(this).locator("details[data-section='interface-access-rule'] summary").click();
});
Then("it names Checkout as permitted and says call activity is not recorded", async function (this: OverviewWorld) {
  const rule = overview(this).locator("details[data-section='interface-access-rule']");
  await expect(rule).toContainText("Checkout");
  await expect(rule).toContainText("Call activity is not recorded.");
  await expect(rule).toContainText("not runtime authorization");
});
Then("the permitted components are not recorded", async function (this: OverviewWorld) {
  const rule = overview(this).locator("details[data-section='interface-access-rule']");
  await expect(rule).toContainText("Permitted components are not recorded.");
  await expect(rule.locator("li")).toHaveCount(0);
  await expect(page(this).locator("path[data-interface-arc]")).toHaveCount(0);
});
Then("mixed statuses retain accepted ownership and proposed interaction without verification", async function (this: OverviewWorld) {
  await expect(panel(this)).toContainText("Mixed recorded statuses");
  await expect(panel(this).getByRole("group", { name: "Provider", exact: true })).toContainText("Accepted (recorded)");
  await expect(overview(this).getByRole("group", { name: "Interaction", exact: true })).toContainText("Proposed");
  await expect(panel(this)).not.toContainText(/verified/i);
});
When("the user reads the interface at {int} by {int} with {int} percent text", async function (this: OverviewWorld, width: number, height: number, percent: number) {
  await page(this).setViewportSize({ width, height });
  await page(this).evaluate((size) => { document.documentElement.style.fontSize = `${size}%`; }, percent);
  this.overviewWidth = (await panel(this).boundingBox())?.width;
  this.overviewVisualName = `choom-br10b-${width}-${height}-${percent}.png`;
});
When("the user selects Invoice type and changes tabs with the keyboard", async function (this: OverviewWorld) {
  await overview(this).getByRole("button", { name: "Invoice type, invoice-type", exact: true }).click();
  this.overviewGeometry = {
    camera: await page(this).locator(".react-flow__viewport").getAttribute("style"),
    nodes: await page(this).locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("style"))),
  };
  const tabs = panel(this).getByRole("tablist", { name: "Interface views" });
  await tabs.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page(this).keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Sources", exact: true })).toBeFocused();
  await expect(panel(this).getByRole("tabpanel", { name: "Sources", exact: true })).toBeVisible();
  await page(this).keyboard.press("Home");
  await expect(tabs.getByRole("tab", { name: "Overview", exact: true })).toBeFocused();
  await page(this).keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "Sources", exact: true })).toBeFocused();
  await page(this).keyboard.press("ArrowLeft");
  await expect(tabs.getByRole("tab", { name: "Overview", exact: true })).toBeFocused();
  await page(this).keyboard.press("Tab");
  await expect(overview(this)).toBeFocused();
});
Then("Overview restores that entry without moving the diagram", async function (this: OverviewWorld) {
  await expect(overview(this).getByRole("button", { name: "Invoice type, invoice-type", exact: true })).toHaveAttribute("aria-pressed", "true");
  assert.deepEqual({
    camera: await page(this).locator(".react-flow__viewport").getAttribute("style"),
    nodes: await page(this).locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("style"))),
  }, this.overviewGeometry);
});
Then("the interface content fits the existing inspector width", async function (this: OverviewWorld) {
  assert.equal((await panel(this).boundingBox())?.width, this.overviewWidth);
  const overflow = await page(this).evaluate(() => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    content: (() => { const element = document.querySelector<HTMLElement>('[aria-label="Record content"]'); return element ? element.scrollWidth - element.clientWidth : Infinity; })(),
  }));
  assert.ok(overflow.page <= 1 && overflow.content <= 1, JSON.stringify(overflow));
  await overview(this).getByRole("button", { name: "Invoice data, invoice-data", exact: true }).scrollIntoViewIfNeeded();
  await expect(overview(this).getByRole("button", { name: "Invoice data, invoice-data", exact: true })).toBeInViewport();
  await this.attach(await page(this).screenshot({ path: join(tmpdir(), this.overviewVisualName ?? "choom-br10b.png") }), "image/png");
});
After({ tags: "@br-10b" }, async function (this: OverviewWorld) {
  if (this.overviewDirectory) await rm(this.overviewDirectory, { recursive: true, force: true });
});
