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

Given("the reviewed baseline is ready for its relationships to be shown", async function (this: BaselineRelationshipWorld) {
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

When("the user opens the prepared relationship baseline", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.relationshipViewer && this.relationshipPath && this.relationshipBaseline && this.page);
  await this.relationshipViewer.openBaseline(this.relationshipPath);
  await expect(this.page.getByRole("heading", { name: this.relationshipBaseline.id, exact: true })).toBeVisible();
});

function statusLabel(status: "accepted" | "proposed"): string {
  return status === "accepted" ? "Accepted (recorded)" : "Proposed";
}

function relationship(world: BaselineRelationshipWorld, sourceId: string,
  kind: "provides" | "owns" | "may use", target: { id: string; name: string }, status: "accepted" | "proposed"): Locator {
  assert.ok(world.page && world.relationshipBaseline);
  const source = world.relationshipBaseline.components.find(({ id }) => id === sourceId);
  assert.ok(source, `The recorded source ${sourceId} must exist.`);
  return world.page.getByRole("img", {
    name: `${source.name}, ${source.id} ${kind} ${target.name}, ${target.id}. ${statusLabel(status)}.`, exact: true,
  });
}

async function expectRelationship(edge: Locator, kind: "provides" | "owns" | "may use",
  status: "accepted" | "proposed"): Promise<void> {
  await expect(edge).toBeVisible();
  await expect(edge).toContainText(`${kind} · ${statusLabel(status)}`);
  const marker = await edge.locator(".react-flow__edge-path").getAttribute("marker-end");
  if (kind === "may use") assert.match(marker ?? "", /^url\(.+\)$/, "Permission must have an arrow to its interface.");
  else assert.ok(!marker, "Ownership must be a line without an arrow.");
}

Then("its eight interfaces and five resources appear with their recorded owners", { timeout: 15_000 }, async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const { page, relationshipBaseline: baseline } = this;
  assert.equal(baseline.interfaces.length, 8);
  assert.equal(baseline.resources.length, 5);
  await expect(page.locator(".react-flow__node")).toHaveCount(18);
  await expect(page.locator(".react-flow__edge")).toHaveCount(12);
  for (const [kind, items] of [["provides", baseline.interfaces], ["owns", baseline.resources]] as const) {
    for (const item of items) {
      const card = page.getByRole("button", { name: `${item.name}, ${item.id}`, exact: true });
      await expect(card).toBeVisible();
      await expect(card).toContainText(item.name);
      if (item.owner.value !== null) {
        await expectRelationship(relationship(this, item.owner.value, kind, item, item.owner.status), kind, item.owner.status);
      }
    }
  }
});

Then("the resource with no owner remains visible", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const unowned = this.relationshipBaseline.resources.filter(({ owner }) => owner.value === null);
  assert.equal(unowned.length, 1);
  const item = fixtureItem(unowned);
  await expect(this.page.getByRole("button", { name: `${item.name}, ${item.id}`, exact: true })).toContainText("Owner unknown");
});

Then("all consumer policies are unknown with no consumer arrows", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  for (const item of this.relationshipBaseline.interfaces) {
    assert.equal(item.allowedConsumers.value, null);
    await expect(this.page.getByRole("button", { name: `${item.name}, ${item.id}`, exact: true }))
      .toContainText("Consumer policy unknown");
  }
  await expect(this.page.locator(".react-flow__edge-path[marker-end]")).toHaveCount(0);
});

Then("the relationship labels can be read without covering an item", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page);
  const labels = await this.page.locator(".react-flow__edge-text").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
  const controls = await this.page.locator(".react-flow__node button").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
  assert.equal(labels.length, await this.page.locator(".react-flow__edge").count());
  for (const [index, label] of labels.entries()) {
    assert.ok(label.height >= 8, `Relationship label ${index} must remain readable at fit (actual height ${label.height.toFixed(2)}px).`);
    assert.ok(label.left >= 0 && label.top >= 0 && label.right <= 1280 && label.bottom <= 800,
      `Relationship label ${index} must stay inside the window.`);
    const overlaps = (other: typeof label) => label.left < other.right && other.left < label.right
      && label.top < other.bottom && other.top < label.bottom;
    assert.equal(labels.slice(index + 1).some(overlaps), false, `Relationship label ${index} must not cover another relationship label.`);
    assert.equal(controls.some(overlaps), false, `Relationship label ${index} must not cover an item inspection control.`);
  }
});

Then("the interface appears without an ownership line", { timeout: 15_000 }, async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const item = fixtureItem(this.relationshipBaseline.interfaces);
  await expect(this.page.getByRole("button", { name: `${item.name}, ${item.id}`, exact: true })).toContainText("Owner unknown");
  await expect(this.page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(this.page.getByRole("img", { name: / provides / })).toHaveCount(0);
});

Then("Checkout has a may use arrow to that interface", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const item = fixtureItem(this.relationshipBaseline.interfaces);
  await expectRelationship(relationship(this, "checkout", "may use", item,
    item.allowedConsumers.status), "may use", item.allowedConsumers.status);
});

Then("both records remain available and no component is invented", { timeout: 15_000 }, async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  await expect(this.page.getByText("No components modeled", { exact: true })).toBeVisible();
  await expect(this.page.locator(".react-flow__node")).toHaveCount(2);
  await expect(this.page.locator(".react-flow__edge")).toHaveCount(0);
  for (const item of [...this.relationshipBaseline.interfaces, ...this.relationshipBaseline.resources]) {
    await expect(this.page.getByRole("button", { name: `${item.name}, ${item.id}`, exact: true })).toBeVisible();
  }
});

Then("each interface keeps its own ownership line and consumer arrows", { timeout: 15_000 }, async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  await expect(this.page.locator(".react-flow__node")).toHaveCount(4);
  await expect(this.page.locator(".react-flow__edge")).toHaveCount(6);
  for (const item of this.relationshipBaseline.interfaces) {
    await expect(this.page.getByRole("button", { name: `${item.name}, ${item.id}`, exact: true })).toBeVisible();
  }
});

Then("each line shows the status of its defining statement", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const baseline = this.relationshipBaseline;
  for (const item of baseline.interfaces) {
    assert.ok(item.owner.value && item.allowedConsumers.value);
    await expectRelationship(relationship(this, item.owner.value, "provides", item, item.owner.status), "provides", item.owner.status);
    for (const consumer of item.allowedConsumers.value) {
      await expectRelationship(relationship(this, consumer, "may use", item, item.allowedConsumers.status),
        "may use", item.allowedConsumers.status);
    }
  }
});

Then("ownership and permission remain separate when their source is the same", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  const baseline = this.relationshipBaseline;
  for (const item of baseline.interfaces) {
    assert.ok(item.owner.value);
    const ownership = relationship(this, item.owner.value, "provides", item, item.owner.status);
    const permission = relationship(this, item.owner.value, "may use", item, item.allowedConsumers.status);
    const ownershipPath = await ownership.locator(".react-flow__edge-path").getAttribute("d");
    const permissionPath = await permission.locator(".react-flow__edge-path").getAttribute("d");
    assert.ok(ownershipPath && permissionPath, "Both relationships must have a drawn path.");
    assert.notEqual(ownershipPath, permissionPath, "Ownership and permission must not cover the same path.");
  }
});

Then("their relationship descriptions shorten names and IDs and keep statuses", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page);
  await expect(this.page.locator(".react-flow__edge")).toHaveCount(2);
  const descriptions = await this.page.locator(".react-flow__edge").evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label") ?? ""));
  for (const description of descriptions) {
    assert.ok(description.length < 400, `A relationship description must bound record text (actual length ${description.length}).`);
    assert.ok(description.includes("…"));
    assert.ok(description.includes("invoice-api"));
  }
  assert.ok(descriptions.some((description) => description.includes("checkout") && description.endsWith("Accepted (recorded).")));
  assert.ok(descriptions.some((description) => description.includes("billing") && description.endsWith("Proposed.")));
});

Then("the complete names and IDs remain available in item details", async function (this: BaselineRelationshipWorld) {
  assert.ok(this.page && this.relationshipBaseline);
  for (const item of [fixtureItem(this.relationshipBaseline.components), fixtureItem(this.relationshipBaseline.interfaces)]) {
    await this.page.locator(`.react-flow__node[data-id="${item.id}"]`).getByRole("button").click();
    const panel = this.page.getByRole("dialog");
    assert.equal(await panel.getByRole("heading", { name: item.name, exact: true }).textContent(), item.name);
    if (this.relationshipBaseline.components.some(({ id }) => id === item.id)) {
      await panel.getByText("Recorded details", { exact: true }).click();
    }
    await expect(panel.getByText(item.id, { exact: true })).toBeVisible();
    await this.page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  }
});

After({ tags: "@bv-05" }, async function (this: BaselineRelationshipWorld) {
  if (this.relationshipDirectory) await rm(this.relationshipDirectory, { recursive: true, force: true });
});
