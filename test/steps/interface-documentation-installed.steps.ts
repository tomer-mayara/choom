import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse, stringify } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { InstalledBaselineDriver } from "../support/baseline-viewer/installed-driver.ts";
import { expectPublishedReadings, publishedReadingEntries } from "../support/interface-documentation-reading.ts";
import { expectInstalledCopy, type inspectInstalledDocumentation } from "../support/baseline-viewer/published-interface-installed.ts";

type ReadingResult = Awaited<ReturnType<typeof inspectInstalledDocumentation>>;
interface InstalledPublishedWorld extends World {
  installedPublishedDriver?: InstalledBaselineDriver;
  installedPublishedDirectory?: string;
  installedPublishedFile?: string;
  installedPublishedBytes?: Buffer;
  installedPublishedBaseline?: Baseline;
  installedPublishedResult?: ReadingResult;
  installedPublishedSelected?: ReadingResult;
  installedRejectedFiles?: Array<{ path: string; bytes: string }>;
}
function driver(world: InstalledPublishedWorld): InstalledBaselineDriver { assert.ok(world.installedPublishedDriver); return world.installedPublishedDriver; }
function baseline(world: InstalledPublishedWorld): Baseline { assert.ok(world.installedPublishedBaseline); return world.installedPublishedBaseline; }

Given("the published documentation file is open through the native file picker", { timeout: 60_000 }, async function (this: InstalledPublishedWorld) {
  this.installedPublishedDirectory = await mkdtemp(join(tmpdir(), "choom-installed-published-"));
  this.installedPublishedFile = join(this.installedPublishedDirectory, "baseline.yaml");
  await copyFile(new URL("../fixtures/baseline-viewer/interface-documentation-published.yaml", import.meta.url), this.installedPublishedFile);
  this.installedPublishedBytes = await readFile(this.installedPublishedFile);
  this.installedPublishedBaseline = baselineSchema.parse(parse(this.installedPublishedBytes.toString("utf8")));
  assert.deepEqual(await readdir(this.installedPublishedDirectory), ["baseline.yaml"]);
  await this.attach(JSON.stringify({ selectedBaseline: this.installedPublishedFile,
    sha256: createHash("sha256").update(this.installedPublishedBytes).digest("hex"), bytes: this.installedPublishedBytes.length,
    provenance: "Actual Stage 4–6 publication; see BR-interface-details-evidence.md" }), "application/json");
  this.installedPublishedDriver = new InstalledBaselineDriver(this);
  await this.installedPublishedDriver.open();
  await driver(this).openBaseline(this.installedPublishedFile);
  await driver(this).expectBaseline(baseline(this).id, baseline(this).components.map(({ id, name }) => [id, name]));
});
When("the installed reader follows its function, failure example, sources, access rule, type, and data sample", { timeout: 60_000 }, async function (this: InstalledPublishedWorld) {
  this.installedPublishedResult = await driver(this).inspectInterfaceDocumentation(baseline(this), { kind: "read" });
});
Then("the installed details agree with the complete published record", function (this: InstalledPublishedWorld) {
  const result = this.installedPublishedResult;
  assert.ok(result && "readings" in result);
  expectPublishedReadings(baseline(this), result.readings);
  assert.deepEqual(result.after, result.before);
});
Then("installed copy reports its real host outcome and keeps the sample selectable", async function (this: InstalledPublishedWorld) {
  const result = this.installedPublishedResult;
  assert.ok(result && "copy" in result);
  const example = publishedReadingEntries(baseline(this))[0]?.entry.examples.find(({ content }) => content.value.result);
  assert.ok(example);
  await this.attach(JSON.stringify({ clipboard: result.copy,
    coverage: result.copy.feedback === "Example copied." ? "Real installed copy success; denial was not forced." : "Real installed host refusal; success was not observed." }), "application/json");
  expectInstalledCopy(result.copy, example.content.value.text);
});
Given("an installed published example is selected", { timeout: 30_000 }, async function (this: InstalledPublishedWorld) {
  this.installedPublishedSelected = await driver(this).inspectInterfaceDocumentation(baseline(this), { kind: "select-example" });
  assert.ok("selected" in this.installedPublishedSelected);
});
When("the native picker opens malformed and excessive documentation and is then cancelled", { timeout: 90_000 }, async function (this: InstalledPublishedWorld) {
  assert.ok(this.installedPublishedDirectory);
  const invalid = structuredClone(baseline(this));
  const target = publishedReadingEntries(invalid)[0];
  const example = target?.entry.examples[0];
  assert.ok(example);
  example.content.value.text = "x".repeat(16 * 1024 + 1);
  this.installedRejectedFiles = [
    { path: join(this.installedPublishedDirectory, "malformed.yaml"), bytes: "formatVersion: [\n" },
    { path: join(this.installedPublishedDirectory, "excessive.yaml"), bytes: stringify(invalid, { aliasDuplicateObjects: false }) },
  ];
  for (const candidate of this.installedRejectedFiles) await writeFile(candidate.path, candidate.bytes);
  this.installedPublishedResult = await driver(this).inspectInterfaceDocumentation(baseline(this), {
    kind: "failed-opens", paths: this.installedRejectedFiles.map(({ path }) => path),
  });
});
Then("the old example and interface remain usable with clear load outcomes", function (this: InstalledPublishedWorld) {
  const before = this.installedPublishedSelected;
  const result = this.installedPublishedResult;
  assert.ok(before && "selected" in before && result && "outcomes" in result);
  assert.equal(result.outcomes.length, 3);
  for (const outcome of result.outcomes) {
    assert.deepEqual(outcome.example, before.selected);
    assert.deepEqual(outcome.drawing, before.drawing);
  }
  assert.match(result.outcomes[0]?.status ?? "", /YAML/i);
  assert.match(result.outcomes[1]?.status ?? "", /limit|large|documentation/i);
  assert.match(result.outcomes[2]?.status ?? "", /Load cancelled\./);
});
Then("the installed reading journey leaves the saved bytes and drawing unchanged", async function (this: InstalledPublishedWorld) {
  assert.ok(this.installedPublishedFile && this.installedPublishedBytes && this.installedPublishedResult);
  assert.deepEqual(await readFile(this.installedPublishedFile), this.installedPublishedBytes);
  for (const candidate of this.installedRejectedFiles ?? []) assert.equal(await readFile(candidate.path, "utf8"), candidate.bytes);
});
After({ tags: "@br-10f and @packaged", timeout: 30_000 }, async function (this: InstalledPublishedWorld) {
  try { await this.installedPublishedDriver?.close(); }
  finally { if (this.installedPublishedDirectory) await rm(this.installedPublishedDirectory, { recursive: true, force: true }); }
});
