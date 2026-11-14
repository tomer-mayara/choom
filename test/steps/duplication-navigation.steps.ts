import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import {
  comparePublishedFinding, inspectPublishedEntry, openPublishedAssessment, prepareDuplicationFiles,
  publishedEntry, publishedFinding, selectDuplicationReport, type DuplicationWorld,
} from "../support/duplication-browser.ts";

interface NavigationWorld extends DuplicationWorld {
  duplicationViewport?: string | null;
  duplicationScroll?: number;
}

Given("the reader is comparing the first supported duplication finding", async function (this: DuplicationWorld) {
  await prepareDuplicationFiles(this);
  await openPublishedAssessment(this);
  await comparePublishedFinding(this);
});

Given("the reader is inspecting an endpoint reached through the published finding", async function (this: DuplicationWorld) {
  await prepareDuplicationFiles(this);
  await openPublishedAssessment(this);
  await comparePublishedFinding(this);
  await inspectPublishedEntry(this);
});

When("the reader inspects its recorded public entry", async function (this: DuplicationWorld) {
  await inspectPublishedEntry(this);
});

Then("the interface opens at that entry instead of its initial entry", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  const { item, entry } = publishedEntry(this);
  const initial = item.documentation?.entries[0];
  assert.ok(initial && initial.id !== entry.id, "The fixture must exercise a non-initial entry.");
  await expect(this.page.getByRole("button", { name: `${entry.name}, ${entry.id}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(this.page.getByRole("button", { name: `${initial.name}, ${initial.id}`, exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(this.page.getByRole("region", { name: "Selected entry", exact: true })).toContainText(entry.accessPoint);
});

Given("the reader reached a comparison from a filtered interface list", async function (this: NavigationWorld) {
  await prepareDuplicationFiles(this);
  await openPublishedAssessment(this);
  assert.ok(this.page);
  const { item } = publishedEntry(this);
  await this.page.getByRole("radio", { name: "All", exact: true }).check();
  await this.page.getByRole("checkbox", { name: "Show self-connections", exact: true }).check();
  await this.page.getByRole("button", { name: "Baseline details", exact: true }).click();
  await this.page.getByRole("region", { name: "Interfaces", exact: true })
    .getByRole("button", { name: `Duplicates for ${item.name}, ${item.id}`, exact: true }).click();
  await this.page.getByRole("checkbox", { name: "Show reviewed distinctions", exact: true }).check();
  this.duplicationViewport = await this.page.locator(".react-flow__viewport").getAttribute("style");
  await this.page.locator(`[data-finding-id="${publishedFinding(this).id}"]`).scrollIntoViewIfNeeded();
  this.duplicationScroll = await this.page.getByLabel("Record content", { exact: true }).evaluate((element) => element.scrollTop);
  await comparePublishedFinding(this);
});

When("the reader returns from an endpoint through the comparison to that list", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  await inspectPublishedEntry(this);
  await this.page.getByRole("button", { name: "Back", exact: true }).click();
  await this.page.getByRole("button", { name: "Back", exact: true }).click();
});

Then("the original filter, row focus and connection choices are restored", async function (this: NavigationWorld) {
  assert.ok(this.page);
  await expect(this.page.getByRole("heading", { name: `Findings for ${publishedEntry(this).item.name}`, exact: true })).toBeVisible();
  await expect(this.page.getByRole("checkbox", { name: "Show reviewed distinctions", exact: true })).toBeChecked();
  await expect(this.page.locator(`[data-finding-id="${publishedFinding(this).id}"]`)).toBeFocused();
  await expect(this.page.getByRole("radio", { name: "All", exact: true })).toBeChecked();
  await expect(this.page.getByRole("checkbox", { name: "Show self-connections", exact: true })).toBeChecked();
  assert.equal(await this.page.locator(".react-flow__viewport").getAttribute("style"), this.duplicationViewport);
  assert.equal(await this.page.getByLabel("Record content", { exact: true }).evaluate((element) => element.scrollTop), this.duplicationScroll);
});

When("a replacement report belongs to different baseline bytes", async function (this: DuplicationWorld) {
  assert.ok(this.page && this.duplicationDirectory && this.duplicationData);
  const report = structuredClone(this.duplicationData.report);
  report.baseline.sha256 = "0".repeat(64);
  const path = join(this.duplicationDirectory, "wrong-bytes.yaml");
  await writeFile(path, JSON.stringify(report));
  await selectDuplicationReport(this.page, path);
});

Then("the error preserves the current endpoint and comparison return path", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  const { entry } = publishedEntry(this);
  await expect(this.page.getByRole("alert")).toContainText("duplication report");
  await expect(this.page.getByRole("dialog", { name: "Interface details", exact: true })).toBeVisible();
  await expect(this.page.getByRole("button", { name: `${entry.name}, ${entry.id}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await this.page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(this.page.getByRole("dialog", { name: "Duplicate comparison", exact: true })).toBeVisible();
});

When("the reader removes the attached duplication report", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  await this.page.getByRole("button", { name: "Remove report", exact: true }).click();
});

Then("the empty Duplicates panel focuses report opening and has no old return path", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  await expect(this.page.getByRole("dialog", { name: "Duplicates", exact: true })).toBeVisible();
  await expect(this.page.getByText("No duplication report loaded", { exact: true })).toBeVisible();
  await expect(this.page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(this.page.getByRole("button", { name: "Open duplication report", exact: true })).toBeFocused();
  await expect(this.page.locator("[data-finding-id]")).toHaveCount(0);
});

When("the reader opens a comparison with a keyboard in a {int} by {int} window", async function (this: DuplicationWorld, width: number, height: number) {
  assert.ok(this.page);
  await this.page.setViewportSize({ width, height });
  const duplicates = this.page.getByRole("button", { name: "Duplicates", exact: true });
  await duplicates.focus();
  await duplicates.press("Enter");
  const row = this.page.locator(`[data-finding-id="${publishedFinding(this).id}"]`);
  await row.focus();
  await row.press("Enter");
});

Then("the comparison heading has focus and its controls fit the panel", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  await expect(this.page.getByRole("heading", { name: "Duplicate comparison", exact: true })).toBeFocused();
  const panel = this.page.getByRole("dialog", { name: "Duplicate comparison", exact: true });
  const box = await panel.boundingBox();
  const viewport = this.page.viewportSize();
  assert.ok(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width + 1);
  assert.ok(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  await expect(panel.getByRole("button", { name: "Back", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Close details", exact: true })).toBeVisible();
  await expect(panel.getByText("Potential redundancy — recorded judgment", { exact: true })).toBeInViewport({ ratio: 1, timeout: 1_500 });
});

Then("the baseline heading and all diagram actions remain visible", async function (this: DuplicationWorld) {
  assert.ok(this.page && this.duplicationData);
  const heading = this.page.getByRole("heading", { name: this.duplicationData.baseline.id, exact: true });
  await expect(heading).toBeVisible({ timeout: 1_500 });
  await expect(heading).toBeInViewport();
  for (const name of ["Baseline details", "Rules", "Duplicates"]) {
    await expect(this.page.getByRole("button", { name, exact: true })).toBeInViewport();
  }
});
