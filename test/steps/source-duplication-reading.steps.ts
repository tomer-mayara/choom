import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import {
  comparePublishedFinding, inspectPublishedEntry, publishedEntry, publishedFinding, selectDuplicationReport,
  type DuplicationWorld,
} from "../support/duplication-browser.ts";

interface SourceDuplicationWorld extends DuplicationWorld {
  sourceDuplicationPositions?: string[];
  sourceDuplicationCamera?: string | null;
  sourceDuplicationScroll?: { overview: number; sources: number };
}

const panel = (page: Page) => page.getByRole("dialog", { name: "Interface details", exact: true });
const content = (page: Page) => page.getByLabel("Record content", { exact: true });
const caller = (page: Page) => panel(page).locator('details[data-section="source-use-caller-checkout-invoice"]');
const citationSections = ["source-note-uses-reviewed-caller", "interface-evidence", "source-evidence-uses-reviewed-caller"];

async function expectSourceConnections(page: Page) {
  const arcs = page.locator("path[data-interface-arc]");
  await expect(arcs).toHaveCount(1);
  await expect(arcs).toHaveAttribute("data-interface-id", "invoice-api");
  await expect(arcs).toHaveAttribute("data-consumer-id", "checkout");
  await expect(arcs).toHaveAttribute("data-owner-id", "billing");
  await expect(page.locator("button[data-interface-label]")).toHaveCount(1);
  await expect(page.getByText("Arrow: component uses the interface in saved source.", { exact: true })).toBeVisible();
}

Given("the reader is reading source-use details with the matching report attached", { timeout: 15_000 }, async function (this: SourceDuplicationWorld) {
  assert.ok(this.page && this.duplicationViewer && this.duplicationBaseline && this.duplicationReport && this.duplicationData);
  const page = this.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await this.duplicationViewer.openBaseline(this.duplicationBaseline);
  await expect(page.getByRole("heading", { name: this.duplicationData.baseline.id, exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "All", exact: true }).check();
  await expectSourceConnections(page);
  this.sourceDuplicationPositions = await page.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("style") ?? ""));
  this.sourceDuplicationCamera = await page.locator(".react-flow__viewport").getAttribute("style");
  await page.getByRole("button", { name: "Duplicates", exact: true }).click();
  await selectDuplicationReport(page, this.duplicationReport);
  await expect(page.locator(`[data-finding-id="${publishedFinding(this).id}"]`)).toBeVisible();
  await expectSourceConnections(page);
  await page.getByRole("radio", { name: "Selected", exact: true }).check();
  await page.getByRole("button", { name: "Billing, billing", exact: true }).click();
  await page.getByRole("region", { name: "Owned interfaces", exact: true })
    .getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
  await expectSourceConnections(page);
  await caller(page).locator("summary").click();
  await expect(caller(page)).toContainText("Checkout calls createInvoice with the order.");
  await content(page).evaluate((element) => { element.scrollTop = 160; });
  const overview = await content(page).evaluate((element) => element.scrollTop);
  assert.ok(overview > 0, "The characterization must retain a nonzero Overview reading position.");
  await panel(page).getByRole("tab", { name: "Sources", exact: true }).click();
  for (const section of citationSections) {
    const disclosure = panel(page).locator(`details[data-section="${section}"]`);
    await disclosure.locator(":scope > summary").click();
    await expect(disclosure).toHaveAttribute("open");
    if (section !== "interface-evidence") await expect(disclosure).toContainText("checkout-invoice");
  }
  // Keep the report action visible while retaining a nonzero Sources position.
  await panel(page).getByRole("button", { name: "Possible duplicates (1)", exact: true }).focus();
  await content(page).evaluate((element) => { element.scrollTop = 12; });
  const sources = await content(page).evaluate((element) => element.scrollTop);
  assert.ok(sources > 0, "The characterization must retain a nonzero Sources reading position.");
  await expect(panel(page).getByRole("button", { name: "Possible duplicates (1)", exact: true })).toBeInViewport({ ratio: 1 });
  this.sourceDuplicationScroll = { overview, sources };
});

When("the reader follows a duplicate comparison to another public entry and returns", { timeout: 15_000 }, async function (this: SourceDuplicationWorld) {
  assert.ok(this.page);
  const page = this.page;
  await panel(page).getByRole("button", { name: "Possible duplicates (1)", exact: true }).click();
  await expectSourceConnections(page);
  await comparePublishedFinding(this);
  await expectSourceConnections(page);
  await inspectPublishedEntry(this);
  const { item, entry } = publishedEntry(this);
  const initial = item.documentation?.entries[0];
  assert.ok(initial && initial.id !== entry.id, "The comparison must open a non-initial entry.");
  await expect(panel(page).getByRole("button", { name: `${entry.name}, ${entry.id}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(caller(page)).not.toHaveAttribute("open");
  await expectSourceConnections(page);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Duplicate comparison", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(`[data-finding-id="${publishedFinding(this).id}"]`)).toBeFocused();
  await page.getByRole("button", { name: "Back", exact: true }).click();
});

Then("the original source-use tabs, disclosures, reading positions and focus are restored", async function (this: SourceDuplicationWorld) {
  assert.ok(this.page && this.sourceDuplicationScroll);
  const page = this.page;
  await expect(panel(page).getByRole("tab", { name: "Sources", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByRole("button", { name: "Possible duplicates (1)", exact: true })).toBeFocused();
  assert.equal(await content(page).evaluate((element) => element.scrollTop), this.sourceDuplicationScroll.sources);
  for (const section of citationSections) {
    const disclosure = panel(page).locator(`details[data-section="${section}"]`);
    await expect(disclosure).toHaveAttribute("open");
    await expect(disclosure).toContainText("checkout-invoice");
  }
  await panel(page).getByRole("tab", { name: "Overview", exact: true }).click();
  assert.equal(await content(page).evaluate((element) => element.scrollTop), this.sourceDuplicationScroll.overview);
  await expect(caller(page)).toHaveAttribute("open");
  await expect(caller(page)).toContainText("checkout/order.ts");
  await expect(panel(page).getByRole("button", { name: "Create invoice, create-invoice", exact: true })).toHaveAttribute("aria-pressed", "true");
});

Then("the source connections and drawing position are unchanged", async function (this: SourceDuplicationWorld) {
  assert.ok(this.page);
  await expectSourceConnections(this.page);
  await expect(this.page.getByRole("radio", { name: "Selected", exact: true })).toBeChecked();
  await expect(this.page.getByRole("checkbox", { name: "Show self-connections", exact: true })).not.toBeChecked();
  assert.deepEqual(await this.page.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("style") ?? "")), this.sourceDuplicationPositions);
  assert.equal(await this.page.locator(".react-flow__viewport").getAttribute("style"), this.sourceDuplicationCamera);
});
