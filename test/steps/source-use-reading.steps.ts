import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { sourceUseReadingBaseline } from "../support/source-use-reading-fixtures.ts";

const expect = browserExpect.configure({ timeout: 1500 });
interface SourceReadingWorld extends World {
  page?: Page;
  sourceReadingDirectory?: string;
  sourceReadingInput?: ReturnType<typeof sourceUseReadingBaseline>;
  sourceReadingGeometry?: string[];
  sourceReadingCamera?: string;
  sourceReadingTouch?: boolean;
}
function page(world: SourceReadingWorld): Page { assert.ok(world.page); return world.page; }
const panel = (world: SourceReadingWorld) => page(world).getByRole("dialog", { name: "Interface details", exact: true });
const usedBy = (world: SourceReadingWorld) => panel(world).getByRole("region", { name: "Used by", exact: true });
async function open(world: SourceReadingWorld, variant = "complete", narrow = false) {
  const browser = page(world);
  world.sourceReadingTouch = narrow;
  await browser.setViewportSize(narrow ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  world.sourceReadingInput = sourceUseReadingBaseline(variant);
  world.sourceReadingDirectory = await mkdtemp(join(tmpdir(), "choom-source-reading-"));
  const path = join(world.sourceReadingDirectory, "baseline.yaml");
  await writeFile(path, stringify(world.sourceReadingInput, { aliasDuplicateObjects: false }));
  const driver = new BaselineBrowserDriver(browser);
  await driver.open();
  await driver.openBaseline(path);
  await expect(browser.getByText("Baseline ready.", { exact: true })).toBeVisible();
}
Given("the complete source-use reading fixture is open", async function (this: SourceReadingWorld) { await open(this); });
Given(/^the source-use reading fixture has (.+)$/, async function (this: SourceReadingWorld, state: string) { await open(this, state); });
Given("the long source-use reading fixture is open in a narrow touch window", async function (this: SourceReadingWorld) { await open(this, "long text", true); });
When("the reader opens the interface Overview", async function (this: SourceReadingWorld) {
  const browser = page(this);
  await browser.getByRole("button", { name: "Baseline details", exact: true }).click();
  await browser.getByRole("dialog").getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
  await expect(panel(this)).toBeVisible();
  this.sourceReadingGeometry = await browser.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("style") ?? ""));
  this.sourceReadingCamera = await browser.locator(".react-flow__viewport").getAttribute("style") ?? "";
});
Then("Used by names Checkout while Access rule names Admin", async function (this: SourceReadingWorld) {
  await expect(usedBy(this)).toHaveCount(1);
  await expect(usedBy(this)).toContainText("Checkout");
  await expect(usedBy(this)).not.toContainText("Admin");
  await panel(this).locator("details[data-section='interface-access-rule'] summary").click();
  const rule = panel(this).locator("details[data-section='interface-access-rule']");
  await expect(rule).toContainText("Admin");
  await expect(rule).not.toContainText("Checkout");
});
Then("interface statement status does not certify source use or execution", async function (this: SourceReadingWorld) {
  await expect(panel(this).getByRole("group", { name: "Interface statement status", exact: true })).toBeVisible();
  await expect(panel(this)).toContainText("Runtime execution is not recorded.");
  await expect(usedBy(this)).not.toContainText("Accepted (recorded)");
});
Then("its accepted status labels only interface statements", async function (this: SourceReadingWorld) {
  const status = panel(this).getByRole("group", { name: "Interface statement status", exact: true });
  await expect(status).toContainText("Accepted (recorded)");
  await expect(status).not.toContainText("Mixed");
  await expect(usedBy(this)).toContainText("Source review is partial.");
});
Then(/^Used by explains (.+)$/, async function (this: SourceReadingWorld, explanation: string) {
  await expect(usedBy(this)).toContainText(explanation);
});
When("the reader expands the first Caller source", async function (this: SourceReadingWorld) {
  await expect(usedBy(this)).toHaveCount(1);
  const summary = usedBy(this).locator("summary").filter({ hasText: "Caller source" }).first();
  if (this.sourceReadingTouch) await summary.tap(); else await summary.click();
});
Then("the saved caller note and location are readable in Overview", async function (this: SourceReadingWorld) {
  const row = usedBy(this).locator('li[data-use-id="checkout-invoice"]');
  await expect(row).toContainText("Checkout calls createInvoice with the order.");
  await expect(row).toContainText("checkout/order.ts");
  await expect(row).toContainText("Lines 8–10");
  await expect(panel(this).getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(row.locator("a[href],iframe,script")).toHaveCount(0);
});
Then("reading the source keeps the component positions and viewport unchanged", async function (this: SourceReadingWorld) {
  assert.deepEqual(await page(this).locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("style") ?? "")), this.sourceReadingGeometry);
  assert.equal(await page(this).locator(".react-flow__viewport").getAttribute("style"), this.sourceReadingCamera);
});
When("the reader selects Refund invoice and visits Sources then returns", async function (this: SourceReadingWorld) {
  await panel(this).getByRole("button", { name: "Refund invoice, refund-invoice", exact: true }).click();
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
  await panel(this).getByRole("tab", { name: "Overview", exact: true }).click();
});
Then("Used by retains both entry bindings and the expanded caller source", async function (this: SourceReadingWorld) {
  await expect(usedBy(this)).toContainText("Interface-wide source use");
  await expect(usedBy(this).locator('li[data-use-id="checkout-invoice"]')).toContainText("createInvoice");
  await expect(usedBy(this).locator('li[data-use-id="checkout-refund"]')).toContainText("refundInvoice");
  await expect(usedBy(this).locator('li[data-use-id="checkout-invoice"] details')).toHaveAttribute("open");
});
When("the reader opens the source-use Sources tab", async function (this: SourceReadingWorld) {
  await page(this).getByRole("button", { name: "Baseline details", exact: true }).click();
  await page(this).getByRole("dialog").getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
});
Then("the snapshot, mapping, scope, limits, and all use evidence remain readable", async function (this: SourceReadingWorld) {
  const section = panel(this).getByRole("region", { name: "Source-use review", exact: true });
  await expect(section).toContainText("snapshot-invoice");
  await expect(section).toContainText("selected-code-mapping");
  await expect(section).toContainText("Other callers were not reviewed.");
  await expect(section).toContainText("The imported createInvoice declaration belongs to Billing.");
  assert.ok(this.sourceReadingInput);
  for (const summary of await section.locator("details[data-section^='source-note-uses-'] summary").all()) await summary.click();
  for (const use of fixtureItem(this.sourceReadingInput.sourceUsage.assessments).uses) await expect(section).toContainText(use.id);
});
Then("the original source assessment and original interface remain separate records", async function (this: SourceReadingWorld) {
  assert.ok(this.sourceReadingInput);
  const original = panel(this).locator("details[data-section='original-source-assessment']");
  await original.locator("summary").click();
  assert.deepEqual(JSON.parse(await original.locator("pre").innerText()), {
    snapshotRef: this.sourceReadingInput.sourceUsage.snapshotRef, mappingRef: this.sourceReadingInput.sourceUsage.mappingRef,
    assessment: fixtureItem(this.sourceReadingInput.sourceUsage.assessments),
  });
  const item = panel(this).locator("details[data-section='original-interface-record']");
  await item.locator("summary").click();
  assert.deepEqual(JSON.parse(await item.locator("pre").innerText()), fixtureItem(this.sourceReadingInput.interfaces));
});
Then("shared source-use citations start collapsed in notes and references", async function (this: SourceReadingWorld) {
  const review = panel(this).getByRole("region", { name: "Source-use review", exact: true });
  await expect(review.getByText("checkout-invoice", { exact: true })).toHaveCount(0);
  await expect(review.getByText("Source uses (7)", { exact: true })).toHaveCount(2);
  await panel(this).locator("details[data-section='interface-evidence'] summary").click();
  const evidence = panel(this).locator("details[data-section='interface-evidence']");
  await expect(evidence.getByText("checkout-invoice", { exact: true })).toHaveCount(0);
  await expect(evidence.getByText("Source uses (7)", { exact: true })).toHaveCount(2);
});
When("the reader expands one note and reference citation list", async function (this: SourceReadingWorld) {
  for (const section of ["source-note-uses-reviewed-caller", "source-evidence-uses-reviewed-caller"]) {
    await panel(this).locator(`details[data-section='${section}'] summary`).click();
  }
});
Then("every use supported by each chosen source remains available", async function (this: SourceReadingWorld) {
  assert.ok(this.sourceReadingInput);
  for (const key of ["source-note-uses-reviewed-caller", "source-evidence-uses-reviewed-caller"]) {
    const section = panel(this).locator(`details[data-section='${key}']`);
    for (const use of fixtureItem(this.sourceReadingInput.sourceUsage.assessments).uses) {
      await expect(section).toContainText(use.id);
      await expect(section).toContainText(use.description);
    }
  }
});
Then("the long source location fits inside the details panel", async function (this: SourceReadingWorld) {
  const row = usedBy(this).locator('li[data-use-id="checkout-invoice"]');
  const bounds = await row.boundingBox();
  const outer = await panel(this).boundingBox();
  assert.ok(bounds && outer);
  assert.ok(bounds.x >= outer.x && bounds.x + bounds.width <= outer.x + outer.width + 1);
  assert.equal(await panel(this).evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
});
Then("the source notice describes partial review without an unknown-consumer count", async function (this: SourceReadingWorld) {
  await expect(page(this).getByText("Source review is partial. See interface details for scope and gaps.", { exact: true })).toBeVisible();
  await expect(page(this).getByText(/unknown owners or allowed consumers/)).toHaveCount(0);
});
When("the reader opens Caller source with the keyboard in a short panel", async function (this: SourceReadingWorld) {
  await page(this).setViewportSize({ width: 1280, height: 480 });
  await panel(this).getByRole("tab", { name: "Overview", exact: true }).focus();
  const summary = usedBy(this).locator("summary").first();
  for (let index = 0; index < 4 && !await summary.evaluate((element) => element === document.activeElement); index++) {
    await page(this).keyboard.press("Tab");
  }
  await expect(summary).toBeFocused();
  await page(this).keyboard.press("Enter");
  await expect(summary.locator("..")).toHaveAttribute("open");
});
Then("the focused caller control stays visible below the tabs", async function (this: SourceReadingWorld) {
  const summary = usedBy(this).locator("summary").first();
  await expect(summary).toBeFocused();
  const bounds = await summary.boundingBox();
  const tabs = await panel(this).getByRole("tablist").boundingBox();
  const content = await panel(this).getByLabel("Record content", { exact: true }).boundingBox();
  assert.ok(bounds && tabs && content);
  assert.ok(bounds.y >= tabs.y + tabs.height - 1 && bounds.y + bounds.height <= content.y + content.height + 1);
});
When("the reader returns to Baseline details", async function (this: SourceReadingWorld) {
  await panel(this).getByRole("button", { name: "Back", exact: true }).click();
});
Then("the source reading adds no Back history and restores its interface row", async function (this: SourceReadingWorld) {
  const details = page(this).getByRole("dialog", { name: "Baseline details", exact: true });
  await expect(details.getByRole("button", { name: "Invoice API, invoice-api", exact: true })).toBeFocused();
  await expect(details.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
});
When(/^the source-use replacement (fails|is cancelled|succeeds with the same IDs)$/, async function (this: SourceReadingWorld, outcome: string) {
  assert.ok(this.sourceReadingDirectory && this.sourceReadingInput);
  if (outcome === "is cancelled") {
    const chooser = page(this).waitForEvent("filechooser");
    await page(this).getByRole("button", { name: "Open Baseline", exact: true }).click();
    await (await chooser).setFiles([]);
    await expect(page(this).getByRole("status").filter({ hasText: "Load cancelled." })).toBeVisible();
    return;
  }
  const path = join(this.sourceReadingDirectory, "replacement.yaml");
  await writeFile(path, outcome === "fails" ? "formatVersion: [" : stringify(this.sourceReadingInput, { aliasDuplicateObjects: false }));
  await new BaselineBrowserDriver(page(this)).openBaseline(path);
  if (outcome === "fails") await expect(page(this).getByRole("alert")).toBeVisible();
  else await expect(panel(this)).toHaveCount(0);
});
Then("the new source view starts with closed caller details and the first entry", async function (this: SourceReadingWorld) {
  await expect(usedBy(this).locator('li[data-use-id="checkout-invoice"] details')).not.toHaveAttribute("open");
  await expect(panel(this).getByRole("button", { name: "Create invoice, create-invoice", exact: true })).toHaveAttribute("aria-pressed", "true");
});
After({ tags: "@br-11c and @browser" }, async function (this: SourceReadingWorld) {
  if (this.sourceReadingDirectory) await rm(this.sourceReadingDirectory, { recursive: true, force: true });
});
