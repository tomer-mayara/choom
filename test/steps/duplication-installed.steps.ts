import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { Baseline, DuplicationReport } from "../../src/domain/generated/contracts.ts";
import { InstalledBaselineDriver, waitFor } from "../support/baseline-viewer/installed-driver.ts";

const files = [
  ["baseline.yaml", "../fixtures/interface-duplication/producer-baseline.yaml"],
  ["review.yaml", "../fixtures/interface-duplication/producer-review.yaml"],
] as const;
const malformed = "formatVersion: [\n";

function includesLookupEntry({ endpoints }: DuplicationReport["findings"][number]["observations"][number]) {
  const [left] = endpoints;
  return left?.interfaceId === "find" && left.entryId === "entry";
}

function recordedLookup(report: DuplicationReport) {
  const finding = report.findings.find(({ status, observations }) => status === "potential-redundancy"
    && observations.some(includesLookupEntry));
  assert.ok(finding, "The published report must include the invoice lookup finding");
  return finding;
}

interface InstalledDuplicationWorld extends World {
  installedDuplicationDriver: InstalledBaselineDriver;
  directory: string;
  originals: Map<string, Buffer>;
  baseline: Baseline;
  report: DuplicationReport;
}

Given("a standalone baseline and its saved duplication report are available to installed Choom", { timeout: 60_000 },
  async function (this: InstalledDuplicationWorld) {
    this.directory = await mkdtemp(join(tmpdir(), "choom-installed-duplication-"));
    this.originals = new Map(await Promise.all(files.map(async ([name, source]) => {
      const path = join(this.directory, name);
      await copyFile(new URL(source, import.meta.url), path);
      return [name, await readFile(path)] as const;
    })));
    assert.deepEqual((await readdir(this.directory)).sort(), files.map(([name]) => name));
    const baseline = this.originals.get("baseline.yaml");
    const report = this.originals.get("review.yaml");
    assert.ok(baseline && report);
    this.baseline = baselineSchema.parse(parse(baseline.toString("utf8")));
    this.report = parse(report.toString("utf8")) as DuplicationReport;
    await this.attach(JSON.stringify([...this.originals].map(([name, bytes]) => ({
      name, sha256: createHash("sha256").update(bytes).digest("hex"),
    }))), "application/json");
    this.installedDuplicationDriver = new InstalledBaselineDriver(this);
    await this.installedDuplicationDriver.open();
  });

When("the reader opens the baseline and report with the native file pickers", { timeout: 60_000 },
  async function (this: InstalledDuplicationWorld) {
    const driver = this.installedDuplicationDriver;
    await driver.openBaseline(join(this.directory, "baseline.yaml"));
    await driver.expectBaseline(this.baseline.id, this.baseline.components.map(({ id, name }) => [id, name]));
    await driver.clickControl("//button[normalize-space(.)='Duplicates']", "Duplicates");
    await driver.selectFile("Open duplication report", join(this.directory, "review.yaml"));
  });

Then("the installed viewer shows the saved finding and its comparison", { timeout: 30_000 },
  async function (this: InstalledDuplicationWorld) {
    const driver = this.installedDuplicationDriver;
    const finding = recordedLookup(this.report);
    assert.ok(finding.overlap && finding.rationale);
    await waitFor(async () => (await driver.panel()).panelText.includes(this.report.id), "The installed viewer must identify the attached report");
    await driver.clickControl(`button[data-finding-id="${finding.id}"]`, "Saved finding");
    const comparison = await driver.panel();
    assert.equal(comparison.panelTitle, "Duplicate comparison");
    assert.ok(comparison.panelText.includes(finding.overlap));
    assert.ok(comparison.panelText.includes(finding.rationale));
    await this.attach(JSON.stringify(comparison), "application/json");
    await driver.capture("duplication-comparison");
  });

Then("the reader opens the recorded entry and Back restores the comparison and finding focus", { timeout: 30_000 },
  async function (this: InstalledDuplicationWorld) {
    const driver = this.installedDuplicationDriver;
    const finding = recordedLookup(this.report);
    const observationIndex = finding.observations.findIndex(includesLookupEntry);
    const endpoint = finding.observations[observationIndex]?.endpoints[0];
    assert.ok(endpoint?.entryId, "The published finding must include an exact entry observation");
    assert.equal(this.baseline.formatVersion, 2);
    const record = this.baseline.interfaces.find(({ id }) => id === endpoint.interfaceId);
    const entry = record?.documentation?.entries.find(({ id }) => id === endpoint.entryId);
    assert.ok(entry);
    assert.notEqual(record?.documentation?.entries[0]?.id, entry.id,
      "The exact entry assertion needs a different default entry in the saved baseline");
    const label = `Inspect A observation ${observationIndex + 1}`;
    await driver.clickControl(`button[aria-label="${label}"]`, label);
    const detail = await driver.panel();
    assert.equal(detail.panelTitle, "Interface details");
    assert.equal(await driver.selectedEntry(), `${entry.name}, ${entry.id}`);
    assert.ok(detail.panelText.includes(entry.accessPoint), "Inspection must show the selected entry's recorded reference");
    await driver.clickControl('button[aria-label="Back"]', "Back");
    assert.equal((await driver.panel()).panelTitle, "Duplicate comparison");
    assert.equal((await driver.panel()).focusedRecord, label);
    await driver.clickControl('button[aria-label="Back"]', "Back");
    assert.equal((await driver.panel()).focusedRecord, finding.id);
  });

When("the reader selects an invalid replacement and removes the report", { timeout: 50_000 },
  async function (this: InstalledDuplicationWorld) {
    const driver = this.installedDuplicationDriver;
    const previous = await driver.panel();
    const invalid = join(this.directory, "invalid.yaml");
    await writeFile(invalid, malformed);
    await driver.selectFile("Open duplication report", invalid);
    await driver.expectInputError(/YAML/i);
    assert.equal((await driver.panel()).panelText, previous.panelText);
    await driver.clickControl("//button[normalize-space(.)='Remove report']", "Remove report");
    await waitFor(async () => (await driver.panel()).panelText.includes("No duplication report loaded"),
      "Removing the report must clear the attached assessment");
  });

Then("the installed viewer still shows the saved baseline and leaves the selected files unchanged", async function (this: InstalledDuplicationWorld) {
  await this.installedDuplicationDriver.expectBaseline(this.baseline.id, this.baseline.components.map(({ id, name }) => [id, name]));
  for (const [name, bytes] of this.originals) assert.deepEqual(await readFile(join(this.directory, name)), bytes);
  assert.equal(await readFile(join(this.directory, "invalid.yaml"), "utf8"), malformed);
});

After({ tags: "@interface-duplication and @packaged", timeout: 30_000 }, async function (this: InstalledDuplicationWorld) {
  try { await this.installedDuplicationDriver?.close(); }
  finally { if (this.directory) await rm(this.directory, { recursive: true, force: true }); }
});
