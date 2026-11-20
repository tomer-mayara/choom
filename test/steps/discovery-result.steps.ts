import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Locator, type Page } from "@playwright/test";
import { parse, stringify } from "yaml";
import { validateDecisions } from "@choom/baseline-model/baseline-decisions";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import { deferredFile, deferredReason, discoveryFixture, type DiscoveryFixture } from "../support/discovery-fixtures.ts";

// The scenarios open a saved baseline file and a hand-written version 2 discovery
// result through the real browser file inputs of the shipped app.
const expect = browserExpect.configure({ timeout: 2_000 });

interface DiscoveryWorld extends World {
  page?: Page;
  discoveryDirectory?: string;
  discoveryFiles?: { baseline: string; result: string };
  discoveryOriginals?: Buffer[];
  discovery?: DiscoveryFixture;
}

function page(world: DiscoveryWorld): Page {
  assert.ok(world.page, "The browser hook must supply a page.");
  return world.page;
}

function fixture(world: DiscoveryWorld): DiscoveryFixture {
  assert.ok(world.discovery, "A Given step must prepare the discovery fixture.");
  return world.discovery;
}

const billing = (world: DiscoveryWorld) => page(world).getByRole("button", { name: "Billing, billing", exact: true });
const discoveryPanel = (world: DiscoveryWorld) => page(world).getByRole("dialog", { name: "Discovery", exact: true });
const componentDetails = (world: DiscoveryWorld) => page(world).getByRole("dialog", { name: "Component details", exact: true });
const purpose = (world: DiscoveryWorld) => componentDetails(world).getByRole("group", { name: "Purpose", exact: true });

async function openBaseline(world: DiscoveryWorld, prepared: DiscoveryFixture): Promise<void> {
  world.discovery = prepared;
  world.discoveryDirectory = await mkdtemp(join(tmpdir(), "choom-discovery-"));
  world.discoveryFiles = { baseline: join(world.discoveryDirectory, "baseline.yaml"), result: join(world.discoveryDirectory, "discovery.yaml") };
  world.discoveryOriginals = [Buffer.from(prepared.baselineText), Buffer.from(stringify(prepared.result))];
  await writeFile(world.discoveryFiles.baseline, world.discoveryOriginals[0] ?? "");
  await writeFile(world.discoveryFiles.result, world.discoveryOriginals[1] ?? "");
  const driver = new BaselineBrowserDriver(page(world));
  await driver.open();
  await driver.openHistoricalInventory(world.discoveryFiles.baseline);
  await expect(page(world).getByText("Baseline ready.", { exact: true })).toBeVisible();
  await expect(page(world).getByRole("heading", { name: prepared.baseline.id, exact: true })).toBeVisible();
}

// Each control is checked before its use, so that a missing control fails with its name.
async function select(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  await control.click();
}

async function showDiscoveryPanel(world: DiscoveryWorld): Promise<void> {
  await select(page(world).getByRole("button", { name: "Discovery", exact: true }));
  await expect(discoveryPanel(world)).toBeVisible();
}

Given("an open baseline and a discovery result for it with two questions about Billing and one deferred file", async function (this: DiscoveryWorld) {
  const prepared = discoveryFixture();
  assert.equal(prepared.result.questions.filter(({ subjectRefs }) => subjectRefs.every((ref) => ref.split(".")[0] === "billing")).length, 2);
  assert.deepEqual(prepared.result.gaps.map(({ kind, subjectRefs }) => [kind, subjectRefs]), [["deferred", [deferredFile]]]);
  await openBaseline(this, prepared);
});

Given("an open baseline and a discovery result with a different baseline digest", async function (this: DiscoveryWorld) {
  const prepared = discoveryFixture();
  prepared.result.baselineDigest = "0".repeat(64);
  assert.notEqual(prepared.result.baselineDigest, prepared.sha256);
  await openBaseline(this, prepared);
});

Given("an open baseline", async function (this: DiscoveryWorld) {
  await openBaseline(this, discoveryFixture());
});

Given("the user opens the TraceRelic example baseline and shows non-production components", async function (this: DiscoveryWorld) {
  const directory = join(import.meta.dirname, "../../docs/design/app-a/examples/tracerelic-run-002");
  this.discoveryFiles = { baseline: join(directory, "baseline.yaml"), result: join(directory, "discovery.yaml") };
  const driver = new BaselineBrowserDriver(page(this));
  await driver.open();
  await driver.openBaseline(this.discoveryFiles.baseline);
  await expect(page(this).getByText("Baseline ready.", { exact: true })).toBeVisible();
  await page(this).getByRole("switch", { name: "Show non-production", exact: true }).check();
});

When("the user opens the discovery result", async function (this: DiscoveryWorld) {
  assert.ok(this.discoveryFiles);
  await showDiscoveryPanel(this);
  const action = discoveryPanel(this).getByRole("button", { name: "Open discovery result", exact: true });
  await expect(action).toBeEnabled();
  const chooser = page(this).waitForEvent("filechooser");
  await action.click();
  await (await chooser).setFiles(this.discoveryFiles.result);
});

Then("Billing shows two recorded questions", async function (this: DiscoveryWorld) {
  await expect(page(this).getByText("Discovery result ready.", { exact: true })).toBeVisible();
  await expect(billing(this)).toContainText("2 recorded questions");
  await select(billing(this));
  const recorded = componentDetails(this).getByRole("region", { name: "Recorded questions and gaps", exact: true });
  await expect(recorded.getByRole("heading", { name: "Recorded questions (2)", exact: true })).toBeVisible();
  for (const question of fixture(this).result.questions) await expect(recorded.getByText(question.text, { exact: true })).toBeVisible();
});

Then("the viewer shows the digest of the example baseline in the discovery summary", async function (this: DiscoveryWorld) {
  assert.ok(this.discoveryFiles);
  const digest = createHash("sha256").update(await readFile(this.discoveryFiles.baseline)).digest("hex");
  await expect(page(this).getByText("Discovery result ready.", { exact: true })).toBeVisible();
  await expect(discoveryPanel(this).getByRole("region", { name: "Discovery summary" })).toContainText(digest);
});

Then("the deferred file is listed with its reason", async function (this: DiscoveryWorld) {
  await showDiscoveryPanel(this);
  const unplaced = discoveryPanel(this).getByRole("region", { name: "Unplaced", exact: true });
  const deferred = unplaced.locator("details[data-section='deferred-gaps']");
  await expect(deferred).toHaveAttribute("open", "");
  await expect(deferred.locator("summary")).toHaveText("Deferred gaps (1)");
  await expect(deferred.getByText(deferredReason, { exact: true })).toBeVisible();
  await expect(deferred.getByText(deferredFile, { exact: true })).toBeVisible();
});

Then("the list says that these are recorded questions and gaps, not defects", async function (this: DiscoveryWorld) {
  const summary = discoveryPanel(this).getByRole("region", { name: "Discovery summary", exact: true });
  await expect(summary).toContainText("2 recorded questions and 1 recorded gap");
  await expect(summary).toContainText("These are recorded questions and gaps to review, not defects.");
  await expect(summary).not.toContainText(/unresolved|open question|open gap/i);
});

Then("the viewer refuses it and keeps the open baseline", async function (this: DiscoveryWorld) {
  const alert = page(this).getByRole("alert");
  await expect(alert).toContainText("The discovery result validation failed:");
  await expect(alert).toContainText(fixture(this).sha256);
  await expect(page(this).getByRole("heading", { name: fixture(this).baseline.id, exact: true })).toBeVisible();
  await expect(discoveryPanel(this).getByText("No discovery result attached", { exact: true })).toBeVisible();
  await expect(billing(this)).not.toContainText("recorded");
  assert.ok(this.discoveryFiles && this.discoveryOriginals);
  assert.deepEqual(await Promise.all([readFile(this.discoveryFiles.baseline), readFile(this.discoveryFiles.result)]), this.discoveryOriginals);
});

When("the user copies a decision for the Billing purpose", async function (this: DiscoveryWorld) {
  await page(this).context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await select(billing(this));
  await select(componentDetails(this).locator("details[data-section='recorded'] > summary"));
  await select(purpose(this).getByRole("button", { name: "Copy decision for billing.purpose", exact: true }));
});

Then("the copied text is a decision-file entry for that statement", async function (this: DiscoveryWorld) {
  await expect(purpose(this).getByRole("status")).toHaveText("Decision copied.");
  const { baseline, sha256 } = fixture(this);
  const text = await page(this).evaluate(() => navigator.clipboard.readText());
  assert.equal(text, `# Baseline ${baseline.id}, SHA-256 ${sha256}\n- action: accept\n  itemId: billing\n  field: purpose\n`);
  const entries: unknown = parse(text);
  const decisions = { formatVersion: 1, id: "decisions-001", baselineRef: baseline.id, baselineDigest: sha256,
    decider: { name: "Ada Example", kind: "human" }, decidedAt: "2026-11-16T09:00:00Z", entries };
  assert.deepEqual(validateDecisions(decisions, { baseline, sha256 }), { status: "valid", decisions });
});

Then("the open baseline does not change", async function (this: DiscoveryWorld) {
  const { baseline } = fixture(this);
  await expect(page(this).getByRole("heading", { name: baseline.id, exact: true })).toBeVisible();
  await expect(purpose(this).getByText(fixtureItem(baseline.components, 1).purpose.value, { exact: true })).toBeVisible();
  await expect(purpose(this).getByText("Proposed", { exact: true })).toBeVisible();
  assert.ok(this.discoveryFiles && this.discoveryOriginals);
  assert.deepEqual(await Promise.all([readFile(this.discoveryFiles.baseline), readFile(this.discoveryFiles.result)]), this.discoveryOriginals);
});

After({ tags: "@discovery-result and @browser" }, async function (this: DiscoveryWorld) {
  if (this.discoveryDirectory) await rm(this.discoveryDirectory, { recursive: true, force: true });
});
