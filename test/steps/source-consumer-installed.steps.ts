import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse, stringify } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { BaselineV3 } from "../../src/domain/generated/contracts.ts";
import { InstalledBaselineDriver } from "../support/baseline-viewer/installed-driver.ts";
import type { inspectInstalledSourceConsumers } from "../support/baseline-viewer/source-consumer-installed.ts";
import { expectReviewedFixture, expectSourceConsumerReading, type SourceConsumerReading } from "../support/source-consumer-reading.ts";

type ReadingResult = Awaited<ReturnType<typeof inspectInstalledSourceConsumers>>;
interface InstalledSourceWorld extends World {
  installedSourceDriver?: InstalledBaselineDriver;
  installedSourceDirectory?: string;
  installedSourceFile?: string;
  installedSourceBytes?: Buffer;
  installedSourceBaseline?: BaselineV3;
  installedSourceResult?: ReadingResult;
  installedSourceSelected?: ReadingResult;
  installedSourceRejected?: Array<{ path: string; bytes: string }>;
}
function driver(world: InstalledSourceWorld) { assert.ok(world.installedSourceDriver); return world.installedSourceDriver; }
function baseline(world: InstalledSourceWorld) { assert.ok(world.installedSourceBaseline); return world.installedSourceBaseline; }
Given("the source-consumer review file is open through the native file picker", { timeout: 60_000 }, async function (this: InstalledSourceWorld) {
  this.installedSourceDirectory = await mkdtemp(join(tmpdir(), "choom-installed-source-review-"));
  this.installedSourceFile = join(this.installedSourceDirectory, "baseline.yaml");
  await copyFile(new URL("../fixtures/baseline-viewer/source-consumers-review.yaml", import.meta.url), this.installedSourceFile);
  this.installedSourceBytes = await readFile(this.installedSourceFile);
  const value = baselineSchema.parse(parse(this.installedSourceBytes.toString("utf8")));
  assert.equal(value.formatVersion, 3);
  expectReviewedFixture(value);
  this.installedSourceBaseline = value;
  assert.deepEqual(await readdir(this.installedSourceDirectory), ["baseline.yaml"]);
  await this.attach(JSON.stringify({ selectedBaseline: this.installedSourceFile, bytes: this.installedSourceBytes.length,
    sha256: createHash("sha256").update(this.installedSourceBytes).digest("hex") }), "application/json");
  this.installedSourceDriver = new InstalledBaselineDriver(this);
  await driver(this).open();
  await driver(this).openBaseline(this.installedSourceFile);
  await driver(this).expectBaseline(value.id, value.components.map(({ id, name }) => [id, name]));
});
When("the installed reader follows its reviewed connections and every documented interface", { timeout: 240_000 }, async function (this: InstalledSourceWorld) {
  this.installedSourceResult = await driver(this).inspectSourceConsumers(baseline(this), { kind: "read" });
});
Then("the installed callers, evidence, scope, signatures, examples, and access agree with the file", function (this: InstalledSourceWorld) {
  const result = this.installedSourceResult;
  assert.ok(result && "readings" in result);
  assert.equal(result.readings.length, 10);
  for (const item of baseline(this).interfaces) {
    const reading: SourceConsumerReading | undefined = result.readings.find(({ interfaceId }) => interfaceId === item.id);
    assert.ok(reading);
    expectSourceConsumerReading(baseline(this), item, reading);
  }
  assert.deepEqual(result.after, result.before, "Reading and Back preserve the installed drawing and camera");
});
Given("an installed source-consumer example is selected", { timeout: 30_000 }, async function (this: InstalledSourceWorld) {
  this.installedSourceSelected = await driver(this).inspectSourceConsumers(baseline(this), { kind: "select-example" });
  assert.ok("selected" in this.installedSourceSelected);
});
When("the native picker opens malformed and excessive source-use files and is then cancelled", { timeout: 90_000 }, async function (this: InstalledSourceWorld) {
  assert.ok(this.installedSourceDirectory);
  const invalid = structuredClone(baseline(this));
  const assessment = invalid.sourceUsage?.assessments.find(({ uses }) => uses.length);
  const use = assessment?.uses[0];
  assert.ok(assessment && use);
  assessment.uses = Array.from({ length: 2001 }, (_, index) => ({ ...use, id: `excessive-${index}` }));
  this.installedSourceRejected = [
    { path: join(this.installedSourceDirectory, "malformed.yaml"), bytes: "formatVersion: [\n" },
    { path: join(this.installedSourceDirectory, "excessive.yaml"), bytes: stringify(invalid, { aliasDuplicateObjects: false }) },
  ];
  for (const file of this.installedSourceRejected) await writeFile(file.path, file.bytes);
  this.installedSourceResult = await driver(this).inspectSourceConsumers(baseline(this), {
    kind: "failed-opens", paths: this.installedSourceRejected.map(({ path }) => path),
  });
});
Then("the installed source-consumer example and drawing remain usable", function (this: InstalledSourceWorld) {
  const before = this.installedSourceSelected;
  const result = this.installedSourceResult;
  assert.ok(before && "selected" in before && result && "outcomes" in result);
  assert.equal(result.outcomes.length, 3);
  for (const outcome of result.outcomes) {
    assert.deepEqual(outcome.example, before.selected);
    assert.deepEqual(outcome.drawing, before.drawing);
  }
  assert.match(result.outcomes[0]?.status ?? "", /YAML/i);
  assert.match(result.outcomes[1]?.status ?? "", /limit|large|uses|records/i);
  assert.match(result.outcomes[2]?.status ?? "", /Load cancelled\./);
});
Then("the installed source-consumer file and component positions are unchanged", async function (this: InstalledSourceWorld) {
  assert.ok(this.installedSourceFile && this.installedSourceBytes && this.installedSourceResult);
  assert.deepEqual(await readFile(this.installedSourceFile), this.installedSourceBytes);
  for (const file of this.installedSourceRejected ?? []) assert.equal(await readFile(file.path, "utf8"), file.bytes);
});
After({ tags: "@br-11f and @packaged", timeout: 30_000 }, async function (this: InstalledSourceWorld) {
  try { await this.installedSourceDriver?.close(); }
  finally { if (this.installedSourceDirectory) await rm(this.installedSourceDirectory, { recursive: true, force: true }); }
});
