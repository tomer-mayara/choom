import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { parse } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { BaselineV3 } from "../../src/domain/generated/contracts.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { openPublishedInterface } from "../support/baseline-viewer/published-interface-browser.ts";
import { readSourceConsumerInterfaces } from "../support/baseline-viewer/source-consumer-browser.ts";
import { readRenderedDrawing, type ReadingDrawing } from "../support/interface-documentation-reading.ts";
import { expectReviewedConnections, expectReviewedFixture, expectSourceConsumerReading, type SourceConsumerReading, reviewedCrossConnections, reviewedSelfConnections } from "../support/source-consumer-reading.ts";

interface SourceConsumerWorld extends World {
  page?: Page;
  sourceConsumerDirectory?: string;
  sourceConsumerFile?: string;
  sourceConsumerBytes?: Buffer;
  sourceConsumerBaseline?: BaselineV3;
  sourceConsumerDrawing?: ReadingDrawing;
  sourceConsumerReading?: Awaited<ReturnType<typeof readSourceConsumerInterfaces>>;
}
function page(world: SourceConsumerWorld) { assert.ok(world.page); return world.page; }
function baseline(world: SourceConsumerWorld) { assert.ok(world.sourceConsumerBaseline); return world.sourceConsumerBaseline; }
Given("the source-consumer review file is open through the browser file control", async function (this: SourceConsumerWorld) {
  this.sourceConsumerDirectory = await mkdtemp(join(tmpdir(), "choom-source-consumer-review-"));
  this.sourceConsumerFile = join(this.sourceConsumerDirectory, "baseline.yaml");
  await copyFile(new URL("../fixtures/baseline-viewer/source-consumers-review.yaml", import.meta.url), this.sourceConsumerFile);
  this.sourceConsumerBytes = await readFile(this.sourceConsumerFile);
  const value = baselineSchema.parse(parse(this.sourceConsumerBytes.toString("utf8")));
  assert.equal(value.formatVersion, 3);
  expectReviewedFixture(value);
  this.sourceConsumerBaseline = value;
  await this.attach(JSON.stringify({ selectedBaseline: this.sourceConsumerFile, bytes: this.sourceConsumerBytes.length,
    sha256: createHash("sha256").update(this.sourceConsumerBytes).digest("hex") }), "application/json");
  await page(this).setViewportSize({ width: 1280, height: 800 });
  const driver = new BaselineBrowserDriver(page(this));
  await driver.open();
  await driver.openBaseline(this.sourceConsumerFile);
  await expect(page(this).getByRole("heading", { name: value.id, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page(this).locator(".react-flow__node")).toHaveCount(value.components.length);
  this.sourceConsumerDrawing = await page(this).evaluate(readRenderedDrawing);
});
When("the reader chooses All connections with self-connections off", async function (this: SourceConsumerWorld) {
  await page(this).getByRole("radio", { name: "All", exact: true }).check();
  await expect(page(this).getByRole("checkbox", { name: "Show self-connections", exact: true })).not.toBeChecked();
});
Then("the five reviewed cross-component connections are shown", async function (this: SourceConsumerWorld) {
  await expect(page(this).locator("path[data-interface-arc]")).toHaveCount(5);
  expectReviewedConnections(await page(this).evaluate(readRenderedDrawing), reviewedCrossConnections);
  await expect(page(this).getByText("Arrow: component uses the interface in saved source.", { exact: true })).toBeVisible();
  await expect(page(this).getByText(/unknown owners or allowed consumers/)).toHaveCount(0);
});
When("the reader selects Workspace in Selected mode", async function (this: SourceConsumerWorld) {
  await page(this).getByRole("radio", { name: "Selected", exact: true }).check();
  const workspace = baseline(this).components.find(({ id }) => id === "s4-001-workspace");
  assert.ok(workspace);
  await page(this).getByRole("button", { name: `${workspace.name}, ${workspace.id}`, exact: true }).click();
});
Then("only its four reviewed cross-component connections are shown", async function (this: SourceConsumerWorld) {
  await expect(page(this).locator("path[data-interface-arc]")).toHaveCount(4);
  expectReviewedConnections(await page(this).evaluate(readRenderedDrawing), reviewedCrossConnections.filter(({ consumer }) => consumer === "s4-001-workspace"));
});
When("the reader chooses All connections and includes self-connections", async function (this: SourceConsumerWorld) {
  await page(this).getByRole("radio", { name: "All", exact: true }).check();
  await page(this).getByRole("checkbox", { name: "Show self-connections", exact: true }).check();
});
Then("the five cross-component and six internal connections are shown", async function (this: SourceConsumerWorld) {
  await expect(page(this).locator("path[data-interface-arc]")).toHaveCount(11);
  expectReviewedConnections(await page(this).evaluate(readRenderedDrawing), [...reviewedCrossConnections, ...reviewedSelfConnections]);
});
When("the reader opens the reviewed baseline model interface", async function (this: SourceConsumerWorld) {
  const item = baseline(this).interfaces.find(({ id }) => id === "s4-001-baseline-model");
  assert.ok(item);
  await openPublishedInterface(page(this), item);
});
Then("its Used by section identifies the saved Workspace consumer", async function (this: SourceConsumerWorld) {
  const item = baseline(this).components.find(({ id }) => id === "s4-001-workspace");
  assert.ok(item);
  await expect(page(this).getByRole("dialog", { name: "Interface details", exact: true })
    .getByRole("region", { name: "Used by", exact: true })).toContainText(item.name);
});
When("the reader follows every source assessment and documented entry", { timeout: 180_000 }, async function (this: SourceConsumerWorld) {
  this.sourceConsumerReading = await readSourceConsumerInterfaces(page(this), baseline(this));
});
Then("the callers, evidence, scope, signatures, examples, and access agree with the file", function (this: SourceConsumerWorld) {
  const result = this.sourceConsumerReading;
  assert.ok(result);
  assert.equal(result.readings.length, 10);
  for (const item of baseline(this).interfaces) {
    const reading: SourceConsumerReading | undefined = result.readings.find(({ interfaceId }) => interfaceId === item.id);
    assert.ok(reading);
    expectSourceConsumerReading(baseline(this), item, reading);
  }
  assert.deepEqual(result.after, result.before, "Reading and Back must preserve the drawing and camera");
});
Then("the source-consumer file and component positions are unchanged", async function (this: SourceConsumerWorld) {
  assert.ok(this.sourceConsumerFile && this.sourceConsumerBytes && this.sourceConsumerDrawing);
  assert.deepEqual(await readFile(this.sourceConsumerFile), this.sourceConsumerBytes);
  assert.deepEqual((await page(this).evaluate(readRenderedDrawing)).nodes, this.sourceConsumerDrawing.nodes);
});
After({ tags: "@br-11f and @browser" }, async function (this: SourceConsumerWorld) {
  if (this.sourceConsumerDirectory) await rm(this.sourceConsumerDirectory, { recursive: true, force: true });
});
