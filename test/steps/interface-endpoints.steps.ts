import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import { interfaceEndpointBaseline } from "../support/interface-endpoint-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";

interface EndpointWorld extends World {
  page?: Page;
  endpointDirectory?: string;
  endpointPath?: string;
  endpointBytes?: string;
  endpointBaseline?: Baseline;
  endpointViewer?: BaselineBrowserDriver;
}

async function prepare(world: EndpointWorld, facts: string): Promise<void> {
  assert.ok(world.page);
  await world.page.setViewportSize({ width: 320, height: 640 });
  world.endpointBytes = facts === "reviewed"
    ? await readFile(new URL("../fixtures/baseline-viewer/full.yaml", import.meta.url), "utf8")
    : stringify(interfaceEndpointBaseline(facts), { aliasDuplicateObjects: false });
  const decoded = decodeBaselineYaml(world.endpointBytes);
  assert.equal(decoded.status, "success", "The endpoint fixture must pass the real decoder.");
  world.endpointBaseline = decoded.baseline;
  world.endpointDirectory = await mkdtemp(join(tmpdir(), "choom-interface-endpoints-"));
  world.endpointPath = join(world.endpointDirectory, "baseline.yaml");
  await writeFile(world.endpointPath, world.endpointBytes);
  world.endpointViewer = new BaselineBrowserDriver(world.page);
  await world.endpointViewer.open();
}

async function open(world: EndpointWorld): Promise<void> {
  assert.ok(world.endpointViewer && world.endpointPath && world.endpointBaseline && world.page);
  await world.endpointViewer.openBaseline(world.endpointPath);
  await expect(world.page.getByRole("heading", { name: world.endpointBaseline.id, exact: true })).toBeVisible();
  if (world.endpointBaseline.components.length) await world.page.getByRole("radio", { name: "All", exact: true }).check();
}

Given("the {string} endpoint baseline is ready to open", async function (this: EndpointWorld, facts: string) {
  await prepare(this, facts);
});

Given("the {string} endpoint baseline is open", async function (this: EndpointWorld, facts: string) {
  await prepare(this, facts);
  await open(this);
});

When("the user opens the endpoint baseline", async function (this: EndpointWorld) { await open(this); });

When("the user inspects its first interface from the owner's list", async function (this: EndpointWorld) {
  assert.ok(this.page && this.endpointBaseline);
  const item = fixtureItem(this.endpointBaseline.interfaces);
  const owner = this.endpointBaseline.components.find(({ id }) => id === item.owner.value);
  assert.ok(owner);
  const control = this.page.getByRole("button", { name: `${owner.name}, ${owner.id}`, exact: true });
  await control.focus();
  await this.page.keyboard.press("Enter");
  await this.page.getByRole("region", { name: "Owned interfaces", exact: true })
    .getByRole("button", { name: `${item.name}, ${item.id}`, exact: true }).click();
});

When("the user inspects its first interface from Baseline details", async function (this: EndpointWorld) {
  assert.ok(this.page && this.endpointBaseline);
  const item = fixtureItem(this.endpointBaseline.interfaces);
  await this.page.getByRole("button", { name: "Baseline details", exact: true }).click();
  await this.page.getByRole("region", { name: "Interfaces", exact: true })
    .getByRole("button", { name: `${item.name}, ${item.id}`, exact: true }).click();
});

Then("the unknown-endpoint note counts {int} interface(s)", async function (this: EndpointWorld, count: number) {
  assert.ok(this.page);
  const note = `${count} ${count === 1 ? "interface has" : "interfaces have"} unknown owners or allowed consumers. Open Baseline details to inspect them.`;
  await expect(this.page.getByText(note, { exact: true })).toBeVisible({ timeout: 1500 });
  await expect(this.page.getByRole("button", { name: "Baseline details", exact: true })).toBeVisible();
});

Then("no endpoint interface arcs are shown", async function (this: EndpointWorld) {
  assert.ok(this.page);
  await expect(this.page.locator("path[data-interface-arc]")).toHaveCount(0);
});

Then("directly owned interface counts and selected file bytes are unchanged", async function (this: EndpointWorld) {
  assert.ok(this.page && this.endpointBaseline && this.endpointPath && this.endpointBytes);
  for (const component of this.endpointBaseline.components) {
    const count = this.endpointBaseline.interfaces.filter(({ owner }) => owner.value === component.id).length;
    await expect(this.page.getByRole("button", { name: `${component.name}, ${component.id}`, exact: true }))
      .toHaveText(`${component.name}${count} ${count === 1 ? "interface" : "interfaces"}`);
  }
  assert.equal(await readFile(this.endpointPath, "utf8"), this.endpointBytes);
});

Then("interface details explain {string}", async function (this: EndpointWorld, reason: string) {
  assert.ok(this.page);
  await this.page.getByRole("dialog").getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(this.page.getByRole("dialog", { name: "Interface details", exact: true }).getByText(reason, { exact: true }))
    .toBeVisible();
});

Then("both endpoint statements retain their values, status, and references", async function (this: EndpointWorld) {
  assert.ok(this.page && this.endpointBaseline && this.endpointPath && this.endpointBytes);
  const item = fixtureItem(this.endpointBaseline.interfaces);
  const panel = this.page.getByRole("dialog", { name: "Interface details", exact: true });
  for (const [name, statement] of [["Owner", item.owner], ["Allowed consumers", item.allowedConsumers]] as const) {
    const group = panel.getByRole("group", { name, exact: true });
    if (Array.isArray(statement.value)) {
      assert.deepEqual(JSON.parse(await group.locator(":scope > pre").textContent() ?? "null"), statement.value);
    } else {
      await expect(group.locator(":scope > p").nth(1)).toHaveText(statement.value ?? "Unknown (null)");
    }
    await expect(group.getByText(statement.status === "accepted" ? "Accepted (recorded)" : "Proposed", { exact: true })).toHaveCount(1);
    assert.deepEqual(JSON.parse(await group.getByRole("group", { name: "Evidence references", exact: true }).locator("pre").textContent() ?? "null"), statement.evidenceRefs);
    if (statement.status === "accepted") {
      await expect(group.getByRole("group", { name: "Acceptance reference", exact: true })).toContainText(statement.acceptanceRef);
    } else {
      await expect(group.getByRole("group", { name: "Acceptance reference", exact: true })).toHaveCount(0);
    }
  }
  assert.equal(await readFile(this.endpointPath, "utf8"), this.endpointBytes);
});

Then("only the complete interface has an arc", async function (this: EndpointWorld) {
  assert.ok(this.page);
  await expect(this.page.locator("path[data-interface-arc]")).toHaveCount(1);
  await expect(this.page.locator("path[data-interface-arc]")).toHaveAttribute("data-interface-id", "invoice-api");
});

Then("No components modeled remains visible without page overflow", async function (this: EndpointWorld) {
  assert.ok(this.page);
  await expect(this.page.getByText("No components modeled", { exact: true })).toBeVisible();
  assert.equal(await this.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});

Then("no unknown-endpoint note is shown", async function (this: EndpointWorld) {
  assert.ok(this.page);
  await expect(this.page.getByText(/unknown owners or allowed consumers/)).toHaveCount(0);
});

After({ tags: "@br-07b" }, async function (this: EndpointWorld) {
  if (this.endpointDirectory) await rm(this.endpointDirectory, { recursive: true, force: true });
});
