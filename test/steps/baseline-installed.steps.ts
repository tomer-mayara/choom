import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { baselineSchema } from "../../src/domain/baseline.ts";
import { reviewedBaseline } from "../support/baseline-fixtures.ts";
import { InstalledBaselineDriver } from "../support/baseline-viewer/installed-driver.ts";

interface InstalledBaselineWorld extends World {
  installedBaselineDriver?: InstalledBaselineDriver;
  installedBaselineDirectory?: string;
  installedBaselineFile?: string;
  installedBaselineBytes?: Buffer;
  installedBaselineView?: Awaited<ReturnType<InstalledBaselineDriver["view"]>>;
  installedInvalidFile?: { path: string; bytes: string };
}

function driver(world: InstalledBaselineWorld): InstalledBaselineDriver {
  assert.ok(world.installedBaselineDriver, "The scenario must open installed Choom");
  return world.installedBaselineDriver;
}

Given("installed Choom has only a standalone reviewed baseline and no analyzer runtime", { timeout: 60_000 },
  async function (this: InstalledBaselineWorld) {
    this.installedBaselineDirectory = await mkdtemp(join(tmpdir(), "choom-installed-baseline-"));
    this.installedBaselineFile = join(this.installedBaselineDirectory, "baseline.yaml");
    await copyFile(new URL("../fixtures/baseline-viewer/full.yaml", import.meta.url), this.installedBaselineFile);
    this.installedBaselineBytes = await readFile(this.installedBaselineFile);
    assert.deepEqual(await readdir(this.installedBaselineDirectory), ["baseline.yaml"],
      "The selected directory must contain no repository, analyzer, or companion evidence");
    await this.attach(JSON.stringify({
      selectedBaseline: this.installedBaselineFile,
      sha256: createHash("sha256").update(this.installedBaselineBytes).digest("hex"),
      bytes: this.installedBaselineBytes.length,
    }), "application/json");
    this.installedBaselineDriver = new InstalledBaselineDriver(this);
    await this.installedBaselineDriver.open();
  });

When("the user selects that baseline through the native Open Baseline picker", { timeout: 30_000 },
  async function (this: InstalledBaselineWorld) {
    assert.ok(this.installedBaselineFile);
    await driver(this).openBaseline(this.installedBaselineFile);
  });

Then("the installed viewer shows its baseline ID and five component names", { timeout: 30_000 },
  async function (this: InstalledBaselineWorld) {
    await driver(this).expectBaseline("baseline-002", [
      ["choom", "Choom"], ["workspace", "Workspace"], ["architecture-model", "Architecture model"],
      ["desktop-adapter", "Platform adapter"], ["native-shell", "Native shell"],
    ]);
    this.installedBaselineView = await driver(this).view();
  });

When("the user cancels the native Open Baseline picker", { timeout: 30_000 },
  async function (this: InstalledBaselineWorld) { await driver(this).openBaseline(null); });

Then("the installed viewer reports cancellation and allows another baseline", { timeout: 30_000 },
  async function (this: InstalledBaselineWorld) { await driver(this).expectCancellationComplete(); });

Then("the previous installed baseline remains displayed", async function (this: InstalledBaselineWorld) {
  assert.ok(this.installedBaselineView);
  const current = await driver(this).view();
  for (const heading of this.installedBaselineView.headings) assert.ok(current.headings.includes(heading));
  assert.deepEqual(current.nodes, this.installedBaselineView.nodes);
});

When(/^the user selects a file containing (malformed YAML|legacy diagram content) through the native picker$/,
  { timeout: 30_000 }, async function (this: InstalledBaselineWorld, content: string) {
    assert.ok(this.installedBaselineDirectory);
    this.installedInvalidFile = {
      path: join(this.installedBaselineDirectory, "invalid.yaml"),
      bytes: content === "malformed YAML" ? "formatVersion: [\n" : "schemaVersion: 1\nname: Old diagram\n",
    };
    await writeFile(this.installedInvalidFile.path, this.installedInvalidFile.bytes);
    await driver(this).openBaseline(this.installedInvalidFile.path);
  });

Then(/^the installed viewer identifies (malformed YAML|legacy diagram content) as the input problem$/,
  { timeout: 30_000 }, async function (this: InstalledBaselineWorld, content: string) {
    await driver(this).expectInputError(content === "malformed YAML" ? /YAML/i : /legacy diagrams.*unsupported/i);
  });

Then("the installed viewer has no repository selection or diagram export actions", async function (this: InstalledBaselineWorld) {
  const { buttons } = await driver(this).view();
  for (const action of ["Load Repo", "Choose directory", "Export", "Export Diagram"]) {
    assert.equal(buttons.includes(action), false, `The installed baseline viewer must not expose ${action}`);
  }
});

Then("the native read leaves the selected baseline bytes unchanged", async function (this: InstalledBaselineWorld) {
  assert.ok(this.installedBaselineFile && this.installedBaselineBytes);
  assert.deepEqual(await readFile(this.installedBaselineFile), this.installedBaselineBytes);
  if (this.installedInvalidFile) {
    assert.equal(await readFile(this.installedInvalidFile.path, "utf8"), this.installedInvalidFile.bytes);
  }
});

Then("the installed viewer shows five components and keeps every interface and resource inspectable", { timeout: 60_000 },
  async function (this: InstalledBaselineWorld) {
    const baseline = baselineSchema.parse(reviewedBaseline("full"));
    assert.equal(baseline.components.length, 5);
    assert.equal(baseline.interfaces.length, 8);
    assert.equal(baseline.resources.length, 5);
    await driver(this).expectComponentOverview(baseline.components.map(({ id, name }) => [id, name]));
    await driver(this).inspectRecords("Interfaces", baseline.interfaces);
    await driver(this).inspectRecords("Resources", baseline.resources);
  });

Then("all twenty-one installed Rules entries can be expanded", { timeout: 60_000 }, async function (this: InstalledBaselineWorld) {
  const baseline = baselineSchema.parse(reviewedBaseline("full"));
  assert.equal(baseline.rules.length, 21);
  await driver(this).inspectEveryRule(baseline.rules.map(({ id, name }) => [id, name]));
});

After({ tags: "@baseline-viewer and @packaged", timeout: 30_000 }, async function (this: InstalledBaselineWorld) {
  try { await this.installedBaselineDriver?.close(); }
  finally {
    if (this.installedBaselineDirectory) await rm(this.installedBaselineDirectory, { recursive: true, force: true });
  }
});
