import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { After, Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import {
  comparePublishedFinding, openPublishedAssessment, prepareDuplicationFiles, publishedFinding,
  type DuplicationWorld,
} from "../support/duplication-browser.ts";
import { duplicationV3Fixture } from "../support/interface-duplication-fixtures.ts";

Given("a version 3 baseline and its matching duplication assessment are available offline", async function (this: DuplicationWorld) {
  await prepareDuplicationFiles(this);
  assert.ok(this.duplicationBaseline && this.duplicationReport);
  const fixture = duplicationV3Fixture();
  this.duplicationData = fixture;
  this.duplicationOriginals = [Buffer.from(fixture.baselineText), Buffer.from(JSON.stringify(fixture.report))];
  await writeFile(this.duplicationBaseline, this.duplicationOriginals[0]);
  await writeFile(this.duplicationReport, this.duplicationOriginals[1]);
});

Then("the comparison shows the version 3 entry names and saved contract facts", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  const panel = this.page.getByRole("dialog", { name: "Duplicate comparison", exact: true });
  await expect(panel.getByRole("button", { name: "Inspect A observation 1", exact: true })).toContainText("Invoice API / Invoice type");
  await expect(panel.getByRole("button", { name: "Inspect B observation 1", exact: true })).toContainText("Invoice lookup / Create invoice");
  for (const text of [
    "Create an invoice from a supported order.", "createInvoice(order: Order): Promise<Invoice>",
    "An order with at least one item.", "Accepted (recorded)", "Acceptance reference: review-42#decision-1",
  ]) await expect(panel.getByText(text, { exact: true })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Invoice API / Invoice type · success", exact: true })).toBeVisible();
});

Given("a baseline and its published duplication assessment are available offline", async function (this: DuplicationWorld) {
  await prepareDuplicationFiles(this);
});

Given("the reader has opened the published duplication assessment", async function (this: DuplicationWorld) {
  await prepareDuplicationFiles(this);
  await openPublishedAssessment(this);
});

Given("a duplication assessment has a report ID at its supported length limit", async function (this: DuplicationWorld) {
  await prepareDuplicationFiles(this);
  assert.ok(this.page && this.duplicationData && this.duplicationReport);
  await this.page.setViewportSize({ width: 320, height: 640 });
  this.duplicationData.report.id = "r".repeat(4096);
  await writeFile(this.duplicationReport, JSON.stringify(this.duplicationData.report));
});

Given("the saved assessment has one finding between Billing interfaces with whole-interface and entry observations", async function (this: DuplicationWorld) {
  await prepareDuplicationFiles(this);
  assert.ok(this.duplicationData && this.duplicationReport);
  const report = this.duplicationData.report;
  const finding = publishedFinding(this);
  const observation = finding.observations[0];
  assert.ok(observation);
  finding.observations.push({ ...structuredClone(observation), endpoints: finding.endpoints });
  report.findings = [finding];
  report.review.inspected = 1;
  report.review.pending = 0;
  await writeFile(this.duplicationReport, JSON.stringify(report));
});

When("the reader opens the saved duplication assessment", async function (this: DuplicationWorld) {
  await openPublishedAssessment(this);
});

When("the reader compares the first supported duplication finding", async function (this: DuplicationWorld) {
  await comparePublishedFinding(this);
});

Then("the saved duplication finding is available for inspection", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  const finding = publishedFinding(this);
  assert.ok(finding.overlap);
  await expect(this.page.getByText(finding.overlap, { exact: true }).first()).toBeVisible();
});

Then("the baseline heading and report controls remain within the viewport", async function (this: DuplicationWorld) {
  assert.ok(this.page && this.duplicationData);
  await expect(this.page.getByRole("heading", { name: this.duplicationData.baseline.id, exact: true })).toBeInViewport({ ratio: 1, timeout: 2_000 });
  await expect(this.page.getByRole("button", { name: "Remove report", exact: true })).toBeInViewport({ ratio: 1, timeout: 2_000 });
});

Then("the list shows one finding and Billing shows one possible duplicate", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  await expect(this.page.locator("[data-finding-id]")).toHaveCount(1);
  const billing = this.page.getByRole("button", { name: "Billing, billing", exact: true });
  await expect(billing).toContainText("1 possible duplicate");
  await expect(this.page.getByText("Potential redundancy: 1", { exact: true })).toBeVisible();
});

Then("the assessment is incomplete because the scan is partial even though the review is complete", async function (this: DuplicationWorld) {
  assert.ok(this.page && this.duplicationData);
  assert.equal(this.duplicationData.report.scan.status, "partial");
  assert.equal(this.duplicationData.report.scan.counts.excluded, null);
  await expect(this.page.getByText("Scan: partial. Review: completed.", { exact: true })).toBeVisible();
  await expect(this.page.getByText("Assessment incomplete", { exact: true })).toBeVisible();
  await expect(this.page.getByText(/Excluded: Unknown/)).toBeVisible();
});

Then("the comparison shows the recorded judgment, differences and evidence", async function (this: DuplicationWorld) {
  assert.ok(this.page);
  const finding = publishedFinding(this);
  assert.ok(finding.overlap && finding.differences[0]);
  await expect(this.page.getByText("Potential redundancy — recorded judgment", { exact: true })).toBeVisible();
  await expect(this.page.getByText(finding.overlap, { exact: true })).toBeVisible();
  await expect(this.page.getByText(finding.differences.join("\n\n"), { exact: true })).toBeVisible();
  await this.page.locator("summary").getByText("Evidence", { exact: true }).click();
  await expect(this.page.getByText("Evidence not loaded", { exact: true })).toBeVisible();
  await expect(this.page.getByText("Structural similarity does not measure behavioral equivalence.", { exact: true })).toBeVisible();
});

Then("reading the assessment has not changed either selected file", async function (this: DuplicationWorld) {
  assert.ok(this.duplicationBaseline && this.duplicationReport && this.duplicationOriginals);
  assert.deepEqual(await Promise.all([readFile(this.duplicationBaseline), readFile(this.duplicationReport)]), this.duplicationOriginals);
});

After({ tags: "@interface-duplication and @browser" }, async function (this: DuplicationWorld) {
  if (this.duplicationDirectory) await rm(this.duplicationDirectory, { recursive: true, force: true });
});
