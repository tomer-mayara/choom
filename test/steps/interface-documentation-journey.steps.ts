import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { parse, stringify } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { Baseline, BaselineV2 } from "../../src/domain/generated/contracts.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { observeReadingDrawing, openPublishedInterface, readBrowserSignature, readPublishedInterfaces } from "../support/baseline-viewer/published-interface-browser.ts";
import { interfaceDocumentationAtLimits, signatureReadingBaseline } from "../support/interface-documentation-journey-fixtures.ts";
import { expectPublishedReadings, expectSignatureReading, publishedReadingEntries, type PublishedReading, type ReadingDrawing, type SignatureReading } from "../support/interface-documentation-reading.ts";

interface PublishedWorld extends World {
  page?: Page;
  publishedDirectory?: string;
  publishedFile?: string;
  publishedBytes?: Buffer;
  publishedBaseline?: Baseline;
  publishedDrawing?: ReadingDrawing;
  publishedReadings?: PublishedReading[];
  legacyReadings?: Array<{ overview: string; examples: string; original: unknown }>;
  finalSample?: string;
  signatureReading?: SignatureReading;
}
function page(world: PublishedWorld): Page { assert.ok(world.page); return world.page; }
function baseline(world: PublishedWorld): Baseline { assert.ok(world.publishedBaseline); return world.publishedBaseline; }
function version2(world: PublishedWorld): BaselineV2 { const value = baseline(world); assert.equal(value.formatVersion, 2); return value; }
const panel = (world: PublishedWorld) => page(world).getByRole("dialog", { name: "Interface details", exact: true });

async function openFile(world: PublishedWorld, name: string): Promise<void> {
  world.publishedDirectory = await mkdtemp(join(tmpdir(), "choom-published-documentation-"));
  world.publishedFile = join(world.publishedDirectory, "baseline.yaml");
  await copyFile(new URL(`../fixtures/baseline-viewer/${name}`, import.meta.url), world.publishedFile);
  await openPreparedFile(world);
}
async function openPreparedFile(world: PublishedWorld): Promise<void> {
  assert.ok(world.publishedFile);
  world.publishedBytes = await readFile(world.publishedFile);
  world.publishedBaseline = baselineSchema.parse(parse(world.publishedBytes.toString("utf8")));
  await page(world).setViewportSize({ width: 1280, height: 800 });
  const driver = new BaselineBrowserDriver(page(world));
  await driver.open();
  await driver.openBaseline(world.publishedFile);
  await expect(page(world).getByRole("heading", { name: world.publishedBaseline.id, exact: true })).toBeVisible({ timeout: 60_000 });
}

Given("the published documentation file is open in the browser viewer", async function (this: PublishedWorld) {
  await openFile(this, "interface-documentation-published.yaml");
  const target = publishedReadingEntries(baseline(this))[0];
  assert.ok(target);
  await openPublishedInterface(page(this), target.item);
  this.publishedDrawing = await observeReadingDrawing(page(this));
});
When("the reader follows its function, failure example, sources, access rule, type, and data sample", { timeout: 60_000 }, async function (this: PublishedWorld) {
  this.publishedReadings = await readPublishedInterfaces(page(this), baseline(this));
});
Then("each displayed fact and complete original record matches the published file", function (this: PublishedWorld) {
  assert.ok(this.publishedReadings);
  expectPublishedReadings(baseline(this), this.publishedReadings);
});
Then("reading the published interfaces leaves the file and drawing unchanged", async function (this: PublishedWorld) {
  assert.ok(this.publishedFile && this.publishedBytes && this.publishedDrawing);
  assert.deepEqual(await readFile(this.publishedFile), this.publishedBytes);
  assert.deepEqual(await observeReadingDrawing(page(this)), this.publishedDrawing);
});

Given("the unchanged {string} baseline is open through the browser file control", async function (this: PublishedWorld, name: string) {
  assert.ok(["legacy-baseline-003.yaml", "full.yaml"].includes(name));
  await openFile(this, name);
  assert.equal(baseline(this).formatVersion, 1);
  const first = baseline(this).interfaces[0];
  assert.ok(first);
  await openPublishedInterface(page(this), first);
  this.publishedDrawing = await observeReadingDrawing(page(this));
});
When("the reader opens each saved interface", { timeout: 60_000 }, async function (this: PublishedWorld) {
  this.legacyReadings = [];
  for (const item of baseline(this).interfaces) {
    await openPublishedInterface(page(this), item);
    const overview = panel(this).getByRole("tabpanel", { name: "Overview", exact: true });
    for (const detail of await overview.locator("details").all()) {
      if (await detail.getAttribute("open") === null) await detail.locator("summary").click();
      await expect(detail).toHaveAttribute("open");
    }
    const overviewText = await panel(this).innerText();
    await panel(this).getByRole("tab", { name: "Example", exact: true }).click();
    const examples = await panel(this).getByRole("tabpanel", { name: "Example", exact: true }).innerText();
    await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
    const original = panel(this).locator("details[data-section='original-interface-record']");
    await original.locator("summary").click();
    this.legacyReadings.push({ overview: overviewText, examples, original: JSON.parse(await original.locator("pre").innerText()) });
  }
  const first = baseline(this).interfaces[0];
  assert.ok(first);
  await openPublishedInterface(page(this), first);
});
Then("its saved prose and unknown facts remain available without invented examples or call activity", function (this: PublishedWorld) {
  assert.equal(this.legacyReadings?.length, baseline(this).interfaces.length);
  for (const [index, item] of baseline(this).interfaces.entries()) {
    const reading: NonNullable<PublishedWorld["legacyReadings"]>[number] | undefined = this.legacyReadings?.[index];
    assert.ok(reading);
    for (const value of Object.values(item.promises.value ?? {})) {
      if (value !== null) assert.ok(reading.overview.replace(/\s+/g, " ").includes(value.replace(/\s+/g, " ")));
    }
    if (item.owner.value === null) assert.match(reading.overview, /Provider unknown/);
    if (item.allowedConsumers.value === null) assert.match(reading.overview, /Permitted components are not recorded/);
    assert.match(reading.overview, /Call activity is not recorded/);
    assert.match(reading.examples, /No examples recorded\./);
    assert.deepEqual(reading.original, item);
  }
});

Given("the documentation and display limit file is open through the browser file control", { timeout: 90_000 }, async function (this: PublishedWorld) {
  this.publishedDirectory = await mkdtemp(join(tmpdir(), "choom-documentation-limits-"));
  this.publishedFile = join(this.publishedDirectory, "baseline.yaml");
  await writeFile(this.publishedFile, stringify(interfaceDocumentationAtLimits(), { aliasDuplicateObjects: false }));
  await openPreparedFile(this);
});
When("the reader selects the final entry and its final example", { timeout: 30_000 }, async function (this: PublishedWorld) {
  const item = version2(this).interfaces[0];
  const entry = item?.documentation?.entries.at(-1);
  const example = entry?.examples.at(-1);
  assert.ok(item && entry && example);
  await openPublishedInterface(page(this), item);
  this.publishedDrawing = await observeReadingDrawing(page(this));
  await panel(this).getByRole("button", { name: `${entry.name}, ${entry.id}`, exact: true }).click();
  await panel(this).getByRole("tab", { name: "Example", exact: true }).click();
  await panel(this).getByRole("button", { name: `${example.name}, ${example.id}`, exact: true }).click();
  this.finalSample = example.content.value.text;
});
Then("the complete saved sample remains readable and its controls work", async function (this: PublishedWorld) {
  assert.ok(this.finalSample);
  const sample = panel(this).getByRole("group", { name: "Example", exact: true }).locator("pre");
  assert.equal(await sample.innerText(), this.finalSample);
  await expect(panel(this).getByRole("button", { name: "Copy example", exact: true })).toBeEnabled();
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(panel(this).getByRole("tabpanel", { name: "Sources", exact: true })).toBeVisible();
  await panel(this).getByRole("tab", { name: "Example", exact: true }).click();
  assert.equal(await sample.innerText(), this.finalSample);
});
Then("the file and graph data remain unchanged", async function (this: PublishedWorld) {
  assert.ok(this.publishedFile && this.publishedBytes && this.publishedDrawing);
  assert.deepEqual(await readFile(this.publishedFile), this.publishedBytes);
  assert.deepEqual(await observeReadingDrawing(page(this)), this.publishedDrawing);
});
Given(/^a documented function with a (known|unknown|missing) signature is open through the browser file control$/, async function (this: PublishedWorld, state: "known" | "unknown" | "missing") {
  this.publishedDirectory = await mkdtemp(join(tmpdir(), "choom-signature-reading-"));
  this.publishedFile = join(this.publishedDirectory, "baseline.yaml");
  await writeFile(this.publishedFile, stringify(signatureReadingBaseline(state), { aliasDuplicateObjects: false }));
  await openPreparedFile(this);
});
When("the reader inspects its Signature and recorded source metadata", async function (this: PublishedWorld) {
  const item = version2(this).interfaces[0];
  const entry = item?.documentation?.entries[0];
  assert.ok(item && entry);
  this.signatureReading = await readBrowserSignature(page(this), item, entry);
});
Then("the signature keeps its exact saved state without an inferred declaration", function (this: PublishedWorld) {
  const item = version2(this).interfaces[0];
  const entry = item?.documentation?.entries[0];
  assert.ok(item && entry && this.signatureReading);
  expectSignatureReading(item, entry, this.signatureReading);
});
After({ tags: "@br-10f and @browser" }, async function (this: PublishedWorld) {
  if (this.publishedDirectory) await rm(this.publishedDirectory, { recursive: true, force: true });
});
