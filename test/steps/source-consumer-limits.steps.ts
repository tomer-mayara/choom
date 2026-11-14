import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Locator, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { BaselineV3 } from "../../src/domain/generated/contracts.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { openPublishedInterface } from "../support/baseline-viewer/published-interface-browser.ts";
import { sourceConsumerFanoutBaseline, sourceConsumerLimitBaseline } from "../support/source-consumer-limit-fixtures.ts";

interface LimitWorld extends World {
  page?: Page;
  sourceLimitDirectory?: string;
  sourceLimitBaseline?: BaselineV3;
  sourceLimitMetrics?: Record<string, unknown>;
}
function page(world: LimitWorld) { assert.ok(world.page); return world.page; }
const panel = (world: LimitWorld) => page(world).getByRole("dialog", { name: "Interface details", exact: true });
async function expectReadable(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport({ ratio: 1 });
  const bounds = await target.evaluate((element) => {
    const content = element.closest<HTMLElement>('[aria-label="Record content"]');
    if (!content) throw new Error("The last source record must be in the inspection scroll area.");
    const area = content.getBoundingClientRect();
    const tabs = content.querySelector('[role="tablist"]')?.getBoundingClientRect();
    const item = element.getBoundingClientRect();
    return { item: { left: item.left, right: item.right, top: item.top, bottom: item.bottom },
      area: { left: area.left, right: area.right, top: Math.max(area.top, tabs?.bottom ?? area.top), bottom: area.bottom },
      width: content.clientWidth, scrollWidth: content.scrollWidth };
  });
  assert.ok(bounds.scrollWidth <= bounds.width + 1, `The inspection content must fit horizontally: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.item.left >= bounds.area.left - 1 && bounds.item.right <= bounds.area.right + 1,
    `The source field must fit inside the inspection area: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.item.top >= bounds.area.top - 1 && bounds.item.bottom <= bounds.area.bottom + 1,
    `The source field must be visible below the tabs and inside the scroll area: ${JSON.stringify(bounds)}`);
}
async function open(world: LimitWorld, baseline: BaselineV3, width: number, height: number) {
  baselineSchema.parse(baseline);
  world.sourceLimitBaseline = baseline;
  world.sourceLimitDirectory = await mkdtemp(join(tmpdir(), "choom-source-limits-"));
  const file = join(world.sourceLimitDirectory, "baseline.yaml");
  const bytes = stringify(baseline, { aliasDuplicateObjects: false });
  await writeFile(file, bytes);
  await page(world).setViewportSize({ width, height });
  const driver = new BaselineBrowserDriver(page(world));
  await driver.open();
  const start = performance.now();
  await driver.openBaseline(file);
  await expect(page(world).getByRole("heading", { name: baseline.id, exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page(world).locator(".react-flow__node")).toHaveCount(baseline.components.length);
  const processors = cpus();
  world.sourceLimitMetrics = { workload: baseline.id, host: { platform: platform(), release: release(), architecture: arch(),
    processor: processors[0]?.model ?? "unknown", logicalProcessors: processors.length, memoryBytes: totalmem() },
    viewport: { width, height }, bytes: Buffer.byteLength(bytes), sourceUsageBytes: Buffer.byteLength(JSON.stringify(baseline.sourceUsage)),
    sha256: createHash("sha256").update(bytes).digest("hex"), fileOpenMs: performance.now() - start,
    measurement: "Elapsed browser automation time, including normal control interactions; no performance threshold." };
}
Given("a source-use file at the supported limits is open in a {int} by {int} browser window", { timeout: 120_000 }, async function (this: LimitWorld, width: number, height: number) {
  await open(this, sourceConsumerLimitBaseline(), width, height);
});
When("the reader opens its interface and reaches the final caller and source note", { timeout: 120_000 }, async function (this: LimitWorld) {
  const item = this.sourceLimitBaseline?.interfaces[0];
  assert.ok(item && this.sourceLimitMetrics);
  const start = performance.now();
  await openPublishedInterface(page(this), item);
  const rows = panel(this).locator("li[data-use-id]");
  await expect(rows).toHaveCount(2000);
  this.sourceLimitMetrics.interfaceOpenMs = performance.now() - start;
  const row = panel(this).locator('[data-use-id="limit-use-1999"]');
  await row.locator("summary").click();
  for (const text of ["Saved caller note 1999.", "source/caller-1999.ts", "Lines 2000–2001", "a".repeat(64)]) {
    await expectReadable(row.getByText(text, { exact: true }));
  }
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
  const review = panel(this).getByRole("region", { name: "Source-use review", exact: true });
  const finalNote = review.getByText("Saved binding note 1999.", { exact: true });
  const finalRow = review.locator(":scope > ul > li").last();
  await expectReadable(finalNote);
  for (const text of ["source/binding-1999.ts", "Lines 2000–2001", "a".repeat(64)]) {
    await expectReadable(finalRow.getByText(text, { exact: true }));
  }
  this.sourceLimitMetrics.sourcesReachedMs = performance.now() - start;
});
Then("all 2000 uses and 4000 source notes are reachable without clipping the page", async function (this: LimitWorld) {
  const review = panel(this).getByRole("region", { name: "Source-use review", exact: true });
  await expect(review.locator(":scope > ul > li")).toHaveCount(4000);
  const content = panel(this).locator('[aria-label="Record content"]');
  const area = await content.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  assert.ok(area.scroll <= area.width + 1, `The inspection content must fit horizontally: ${JSON.stringify(area)}`);
  const dimensions = await page(this).evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width + 1, `The page must fit the viewport: ${JSON.stringify(dimensions)}`);
});
Given("a source-use file with 2000 callers sharing 100 notes is open", { timeout: 120_000 }, async function (this: LimitWorld) {
  await open(this, sourceConsumerFanoutBaseline(), 1280, 800);
});
When("the reader opens Sources and one shared note's caller list", { timeout: 120_000 }, async function (this: LimitWorld) {
  const item = this.sourceLimitBaseline?.interfaces[0];
  assert.ok(item && this.sourceLimitMetrics);
  await openPublishedInterface(page(this), item);
  const start = performance.now();
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
  const review = panel(this).getByRole("region", { name: "Source-use review", exact: true });
  await expect(review.locator(":scope > ul > li")).toHaveCount(100);
  this.sourceLimitMetrics.sourcesOpenMs = performance.now() - start;
  await expect(review.locator('details[data-section^="source-note-uses-"][open]')).toHaveCount(0);
  const detail = review.locator('details[data-section="source-note-uses-reviewed-caller"]');
  await detail.locator("summary").click();
  await expect(detail.locator("li")).toHaveCount(2000);
  await expect(detail.getByText("shared-use-0", { exact: true })).toBeVisible();
  const finalUse = detail.getByText("shared-use-1999", { exact: true });
  await expectReadable(finalUse);
  this.sourceLimitMetrics.sharedNoteLastUseMs = performance.now() - start;
});
Then("its last citing use is reachable while the other note lists stay closed", async function (this: LimitWorld) {
  const review = panel(this).getByRole("region", { name: "Source-use review", exact: true });
  await expect(review.locator('details[data-section^="source-note-uses-"][open]')).toHaveCount(1);
  await expect(review.locator('details[data-section^="source-note-uses-"]:not([open])')).toHaveCount(99);
  assert.ok(await review.locator("li").count() < 2200, "Unopened shared citations must not create 200,000 hidden rows");
});
Then("the source-use reading times and host are recorded", async function (this: LimitWorld) {
  assert.ok(this.sourceLimitMetrics);
  await this.attach(JSON.stringify(this.sourceLimitMetrics), "application/json");
  const output = join("test-results", "br11f-limits");
  await mkdir(output, { recursive: true });
  await writeFile(join(output, `${this.sourceLimitBaseline?.id}-${Date.now()}.json`), `${JSON.stringify(this.sourceLimitMetrics, null, 2)}\n`);
});
After({ tags: "@br-11f-limits", timeout: 30_000 }, async function (this: LimitWorld) {
  if (this.sourceLimitDirectory) await rm(this.sourceLimitDirectory, { recursive: true, force: true });
});
