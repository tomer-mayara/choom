import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Locator, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import {
  baselineWithDistinctInterfaceLinks, baselineWithLongNames, baselineWithUnknownInterfaceOwner, baselineWithoutComponents,
} from "../support/baseline-relationship-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";

interface BaselineRelationshipWorld extends World {
  page?: Page;
  relationshipDirectory?: string;
  relationshipPath?: string;
  relationshipBaseline?: Baseline;
  relationshipViewer?: BaselineBrowserDriver;
}

async function openViewer(world: BaselineRelationshipWorld): Promise<void> {
  assert.ok(world.page, "The browser hook must supply a real page.");
  await world.page.setViewportSize({ width: 1280, height: 800 });
  world.relationshipDirectory = await mkdtemp(join(tmpdir(), "choom-baseline-relationships-"));
  world.relationshipViewer = new BaselineBrowserDriver(world.page);
  await world.relationshipViewer.open();
}

async function prepareBaseline(world: BaselineRelationshipWorld, baseline: Baseline): Promise<void> {
  await openViewer(world);
  assert.ok(world.relationshipDirectory);
  assert.equal(baselineSchema.safeParse(baseline).success, true,
    "A relationship fixture must satisfy the baseline domain contract.");
  const text = stringify(baseline, { aliasDuplicateObjects: false });
  const decoded = decodeBaselineYaml(text);
  assert.equal(decoded.status, "success",
    `A relationship fixture must pass the real YAML decoder: ${JSON.stringify(decoded)}`);
  world.relationshipPath = join(world.relationshipDirectory, `${baseline.id}.yaml`);
  world.relationshipBaseline = baseline;
  await writeFile(world.relationshipPath, text);
}

Given("the reviewed baseline is ready for relationship inspection", async function (this: BaselineRelationshipWorld) {
  await openViewer(this);
  assert.ok(this.relationshipDirectory && this.page);
  this.relationshipPath = join(this.relationshipDirectory, "baseline.yaml");
  await copyFile(new URL("../fixtures/baseline-viewer/full.yaml", import.meta.url), this.relationshipPath);
  const decoded = decodeBaselineYaml(await readFile(this.relationshipPath, "utf8"));
  assert.equal(decoded.status, "success");
  this.relationshipBaseline = decoded.baseline;
});

Given("an interface has no known owner and explicitly permits Checkout", async function (this: BaselineRelationshipWorld) {
  await prepareBaseline(this, baselineWithUnknownInterfaceOwner());
});

Given("a baseline has no components but has an unowned interface and resource", async function (this: BaselineRelationshipWorld) {
  await prepareBaseline(this, baselineWithoutComponents());
});

Given("two same-named interfaces have different recorded statuses and both permit their owner", async function (this: BaselineRelationshipWorld) {
  await prepareBaseline(this, baselineWithDistinctInterfaceLinks());
});

Given("recorded items have long names and a long interface ID", async function (this: BaselineRelationshipWorld) {
  await prepareBaseline(this, baselineWithLongNames());
});

Given("the user has increased text size by 25 percent", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page);
  await this.page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
});

When("the user opens the prepared relationship baseline", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.relationshipViewer && this.relationshipPath && this.relationshipBaseline && this.page);
  await this.relationshipViewer.openBaseline(this.relationshipPath);
  await expect(this.page.getByRole("heading", { name: this.relationshipBaseline.id, exact: true })).toBeVisible();
});

async function openRecord(world: BaselineRelationshipWorld, kind: "Interfaces" | "Resources", item: { id: string; name: string }): Promise<Locator> {
  assert.ok(world.page);
  await world.page.getByRole("button", { name: "Baseline details", exact: true }).click();
  const catalog = world.page.getByRole("dialog", { name: "Baseline details" });
  await catalog.getByRole("region", { name: kind, exact: true })
    .getByRole("button", { name: `${item.name}, ${item.id}`, exact: true }).click();
  const panel = world.page.getByRole("dialog", { name: kind === "Interfaces" ? "Interface details" : "Resource details" });
  await expect(panel.getByRole("heading", { name: item.name, exact: true })).toHaveText(item.name);
  if (kind === "Interfaces") await panel.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(panel.getByRole("group", { name: kind === "Interfaces" ? "Interface ID" : "Resource ID", exact: true })).toContainText(item.id);
  return panel;
}

async function expectStatement(panel: Locator, name: string, statement: Baseline["interfaces"][number]["owner"] | Baseline["interfaces"][number]["allowedConsumers"]): Promise<void> {
  const group = panel.getByRole("group", { name, exact: true });
  if (Array.isArray(statement.value)) {
    assert.deepEqual(JSON.parse(await group.locator(":scope > pre").textContent() ?? "null"), statement.value);
  } else {
    await expect(group.locator(":scope > p").nth(1)).toHaveText(statement.value ?? "Unknown (null)");
  }
  const status = statement.status === "accepted" ? "Accepted (recorded)" : "Proposed";
  await expect(group.locator(":scope > p").filter({ hasText: new RegExp(`^${status.replace(/[()]/g, "\\$&")}$`) })).toHaveCount(1);
  const references = group.getByRole("group", { name: "Evidence references", exact: true });
  assert.deepEqual(JSON.parse(await references.locator("pre").textContent() ?? "null"), statement.evidenceRefs);
  if (statement.status === "accepted") {
    await expect(group.getByRole("group", { name: "Acceptance reference", exact: true }).locator("p").nth(1))
      .toHaveText(statement.acceptanceRef);
  } else {
    await expect(group.getByRole("group", { name: "Acceptance reference", exact: true })).toHaveCount(0);
  }
}

Then("its eight interfaces and five resources can be inspected with their recorded owners", { timeout: 30_000 }, async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const baseline = this.relationshipBaseline;
  assert.equal(baseline.interfaces.length, 8);
  assert.equal(baseline.resources.length, 5);
  for (const [kind, items] of [["Interfaces", baseline.interfaces], ["Resources", baseline.resources]] as const) {
    for (const item of items) await expectStatement(await openRecord(this, kind, item), "Owner", item.owner);
  }
});

Then("the resource with no owner remains available", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.relationshipBaseline);
  const unowned = this.relationshipBaseline.resources.filter(({ owner }) => owner.value === null);
  assert.equal(unowned.length, 1);
  const item = fixtureItem(unowned);
  await expectStatement(await openRecord(this, "Resources", item), "Owner", item.owner);
});

Then("all consumer policies remain unknown", { timeout: 30_000 }, async function (this: BaselineRelationshipWorld) {
  assert.ok(this.relationshipBaseline);
  for (const item of this.relationshipBaseline.interfaces) {
    assert.equal(item.allowedConsumers.value, null);
    await expectStatement(await openRecord(this, "Interfaces", item), "Allowed consumers", item.allowedConsumers);
  }
});

Then("the interface owner remains unknown and Checkout remains an allowed consumer", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.relationshipBaseline);
  const item = fixtureItem(this.relationshipBaseline.interfaces);
  assert.equal(item.owner.value, null);
  assert.deepEqual(item.allowedConsumers.value, ["checkout"]);
  const panel = await openRecord(this, "Interfaces", item);
  await expectStatement(panel, "Owner", item.owner);
  await expectStatement(panel, "Allowed consumers", item.allowedConsumers);
});

Then("both records remain available and no component is invented", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  await expect(this.page.getByText("No components modeled", { exact: true })).toBeVisible();
  await expect(this.page.locator(".react-flow__node")).toHaveCount(0);
  await expect(this.page.locator(".react-flow__edge")).toHaveCount(0);
  for (const [kind, items] of [["Interfaces", this.relationshipBaseline.interfaces], ["Resources", this.relationshipBaseline.resources]] as const) {
    for (const item of items) await expectStatement(await openRecord(this, kind, item), "Owner", item.owner);
  }
});

Then("both same-named interfaces remain distinct in Baseline details", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const items = this.relationshipBaseline.interfaces;
  assert.equal(items.length, 2);
  assert.equal(items[0]?.name, items[1]?.name);
  assert.notEqual(items[0]?.id, items[1]?.id);
  await this.page.getByRole("button", { name: "Baseline details", exact: true }).click();
  const list = this.page.getByRole("dialog").getByRole("region", { name: "Interfaces", exact: true });
  await expect(list.getByRole("button")).toHaveCount(2);
  for (const item of items) await expect(list.getByRole("button", { name: `${item.name}, ${item.id}`, exact: true })).toBeVisible();
});

Then("each ownership and permission statement keeps its own status and references", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.relationshipBaseline);
  for (const item of this.relationshipBaseline.interfaces) {
    const panel = await openRecord(this, "Interfaces", item);
    await expectStatement(panel, "Owner", item.owner);
    await expectStatement(panel, "Allowed consumers", item.allowedConsumers);
  }
});

Then("the owner is also listed as an allowed consumer for each interface", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.relationshipBaseline);
  for (const item of this.relationshipBaseline.interfaces) {
    assert.ok(item.owner.value && item.allowedConsumers.value?.includes(item.owner.value));
    const panel = await openRecord(this, "Interfaces", item);
    await expect(panel.getByRole("group", { name: "Owner", exact: true })).toContainText(item.owner.value);
    await expect(panel.getByRole("group", { name: "Allowed consumers", exact: true })).toContainText(item.owner.value);
  }
});

Then("the long component name stays inside its compact header", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const item = fixtureItem(this.relationshipBaseline.components);
  const control = this.page.locator(`.react-flow__node[data-id="${item.id}"]`).getByRole("button");
  await expect(control).toHaveAccessibleName(`${item.name}, ${item.id}`);
  const bounds = await control.boundingBox();
  assert.ok(bounds && bounds.width <= 240 && bounds.height <= 88);
  assert.equal(await control.evaluate((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight), true);
  const lines = await control.evaluate((node) => Array.from(node.querySelectorAll("span"), (span) => {
    const control = node.getBoundingClientRect();
    const text = span.getBoundingClientRect();
    return { height: text.height, lineHeight: Number.parseFloat(getComputedStyle(span).lineHeight),
      contained: text.left >= control.left && text.right <= control.right && text.top >= control.top && text.bottom <= control.bottom };
  }));
  assert.equal(lines.length, 2);
  for (const [index, text] of lines.entries()) {
    assert.ok(text.contained, "Name and count must stay inside their header.");
    assert.ok(text.height >= text.lineHeight * (index === 0 ? 2 : 1) - 1,
      "The name must show two whole lines and the count must show one whole line.");
  }
});

Then("the complete names and IDs remain available in item details", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const component = fixtureItem(this.relationshipBaseline.components);
  await this.page.locator(`.react-flow__node[data-id="${component.id}"]`).getByRole("button").click();
  const panel = this.page.getByRole("dialog", { name: "Component details" });
  await expect(panel.getByRole("heading", { name: component.name, exact: true })).toHaveText(component.name);
  await panel.getByText("Recorded details", { exact: true }).click();
  await expect(panel.getByRole("group", { name: "Component ID", exact: true })).toContainText(component.id);
  const item = fixtureItem(this.relationshipBaseline.interfaces);
  await openRecord(this, "Interfaces", item);
});

After({ tags: "@bv-05" }, async function (this: BaselineRelationshipWorld) {
  if (this.relationshipDirectory) await rm(this.relationshipDirectory, { recursive: true, force: true });
});
