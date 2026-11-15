import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { prepareDuplicationFiles, selectDuplicationReport, type DuplicationWorld } from "../support/duplication-browser.ts";
import { duplicationV4Fixture } from "../support/duplication-v4-fixtures.ts";

interface DuplicationV4World extends DuplicationWorld {
  v4Fixture?: ReturnType<typeof duplicationV4Fixture>;
}

Given("a version 4 baseline is open for the duplication reader", async function (this: DuplicationV4World) {
  await prepareDuplicationFiles(this);
  assert.ok(this.page && this.duplicationBaseline && this.duplicationReport && this.duplicationViewer);
  const fixture = duplicationV4Fixture();
  this.v4Fixture = fixture;
  this.duplicationOriginals = [Buffer.from(fixture.baselineText), Buffer.from(JSON.stringify(fixture.report))];
  await writeFile(this.duplicationBaseline, this.duplicationOriginals[0]);
  await writeFile(this.duplicationReport, this.duplicationOriginals[1]);
  await this.duplicationViewer.openBaseline(this.duplicationBaseline);
  await expect(this.page.getByRole("heading", { name: fixture.baseline.id, exact: true })).toBeVisible();
});

Given("its duplication report names the baseline ID, version and original-byte digest", async function (this: DuplicationV4World) {
  assert.ok(this.duplicationBaseline && this.v4Fixture);
  const baselineBytes = await readFile(this.duplicationBaseline);
  const { baseline, report } = this.v4Fixture;
  assert.deepEqual(report.baseline, {
    id: baseline.id, formatVersion: 4, sha256: createHash("sha256").update(baselineBytes).digest("hex"),
  });
});

When("the reader opens the version 4 duplication report", async function (this: DuplicationWorld) {
  assert.ok(this.page && this.duplicationReport);
  await this.page.getByRole("button", { name: "Duplicates", exact: true }).click();
  await selectDuplicationReport(this.page, this.duplicationReport);
});

Then("its saved findings are available", { timeout: 12_000 }, async function (this: DuplicationV4World) {
  assert.ok(this.page && this.v4Fixture);
  const finding = this.v4Fixture.report.findings.find((item) => item.status === "potential-redundancy" && item.overlap);
  assert.ok(finding);
  await expect(this.page.locator(`[data-finding-id="${finding.id}"]`)).toBeVisible({ timeout: 8_000 });
});
