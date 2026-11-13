import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import { interfaceArcBaseline } from "../support/interface-arc-fixtures.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { unobscuredArcPoint } from "../support/interface-pointer.ts";

interface InterfaceArcWorld extends World {
  page?: Page;
  arcDirectory?: string;
  arcPath?: string;
  arcBaseline?: Baseline;
  arcViewer?: BaselineBrowserDriver;
  arcPositions?: Array<{ id: string | undefined; transform: string }>;
}

Given("the {string} interface baseline is ready to open", async function (this: InterfaceArcWorld, example: string) {
  assert.ok(this.page);
  await this.page.setViewportSize({ width: 1280, height: 800 });
  this.arcBaseline = interfaceArcBaseline(example);
  const yaml = stringify(this.arcBaseline, { aliasDuplicateObjects: false });
  assert.equal(decodeBaselineYaml(yaml).status, "success", "The fixture must pass the real baseline decoder.");
  this.arcDirectory = await mkdtemp(join(tmpdir(), "choom-interface-arcs-"));
  this.arcPath = join(this.arcDirectory, "baseline.yaml");
  await writeFile(this.arcPath, yaml);
  this.arcViewer = new BaselineBrowserDriver(this.page);
  await this.arcViewer.open();
});

When("the user opens the prepared interface baseline with All connections and self-connections shown", async function (this: InterfaceArcWorld) {
  assert.ok(this.arcViewer && this.arcPath && this.page && this.arcBaseline);
  await this.arcViewer.openBaseline(this.arcPath);
  await expect(this.page.getByRole("heading", { name: this.arcBaseline.id, exact: true })).toBeVisible();
  await this.page.getByRole("radio", { name: "All", exact: true }).check();
  await this.page.getByRole("checkbox", { name: "Show self-connections", exact: true }).check();
});

When("the user inspects the first interface from its curve", async function (this: InterfaceArcWorld) {
  assert.ok(this.page);
  const point = await unobscuredArcPoint(this.page.locator("path[data-interface-arc]").first());
  await this.page.mouse.click(point.x, point.y);
  await expect(this.page.getByRole("dialog", { name: "Interface details", exact: true })).toBeVisible();
  await this.page.mouse.move(8, 8);
});

Then("{int} interface arcs show the recorded consumers and owners", async function (this: InterfaceArcWorld, count: number) {
  assert.ok(this.page && this.arcBaseline);
  const paths = this.page.locator("path[data-interface-arc]");
  await expect(paths).toHaveCount(count, { timeout: 1500 });
  for (const item of this.arcBaseline.interfaces) {
    assert.ok(item.owner.value && item.allowedConsumers.value);
    for (const consumer of item.allowedConsumers.value) {
      const path = paths.locator(`:scope[data-interface-id="${item.id}"][data-consumer-id="${consumer}"][data-owner-id="${item.owner.value}"]`);
      await expect(path).toHaveCount(1);
      await expect(path).toBeVisible();
      const measured = await path.evaluate((element) => {
        const curve = element as SVGPathElement;
        const transform = curve.getScreenCTM();
        if (!transform) throw new Error("The visible arc needs a screen transform.");
        const point = (distance: number) => {
          const value = curve.getPointAtLength(distance).matrixTransform(transform);
          return { x: value.x, y: value.y };
        };
        const marker = curve.getAttribute("marker-end");
        return { start: point(0), end: point(curve.getTotalLength()), marker, curved: /[CQ]/.test(curve.getAttribute("d") ?? "") };
      });
      assert.ok(measured.curved, "An interface must have a curved path.");
      assert.ok(measured.marker?.startsWith("url("), "The arc must show an arrowhead at its owner.");
      const endpoints: Array<[string, { x: number; y: number }]> = [[consumer, measured.start], [item.owner.value, measured.end]];
      for (const [id, point] of endpoints) {
        const header = await this.page.locator(`.react-flow__node[data-id="${id}"] button`).boundingBox();
        assert.ok(header);
        const tolerance = 0.1;
        const onVertical: boolean = (Math.abs(point.x - header.x) < tolerance || Math.abs(point.x - header.x - header.width) < tolerance)
          && point.y >= header.y - tolerance && point.y <= header.y + header.height + tolerance;
        const onHorizontal: boolean = (Math.abs(point.y - header.y) < tolerance || Math.abs(point.y - header.y - header.height) < tolerance)
          && point.x >= header.x - tolerance && point.x <= header.x + header.width + tolerance;
        assert.ok(onVertical || onHorizontal, `${id}: the endpoint must touch the actual header border.`);
      }
    }
  }
});

When("the user zooms the interface drawing to two hundred percent", async function (this: InterfaceArcWorld) {
  assert.ok(this.page);
  this.arcPositions = await this.page.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((element) => {
    const node = element as HTMLElement;
    return { id: node.dataset.id, transform: node.style.transform };
  }));
  const zoomIn = this.page.getByRole("button", { name: "Zoom In", exact: true });
  for (let step = 0; step < 10 && await zoomIn.isEnabled(); step += 1) await zoomIn.click();
  await expect(zoomIn).toBeDisabled();
  assert.equal(await this.page.locator(".react-flow__viewport").evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a), 2);
});

Then("the group and child keep their original node positions", async function (this: InterfaceArcWorld) {
  assert.ok(this.page && this.arcPositions);
  const positions = await this.page.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((element) => {
    const node = element as HTMLElement;
    return { id: node.dataset.id, transform: node.style.transform };
  }));
  assert.deepEqual(positions, this.arcPositions);
});

Then("the legend explains that the arrows mean may use", async function (this: InterfaceArcWorld) {
  assert.ok(this.page);
  await expect(this.page.getByText("Arrow: consumer may use the owner's interface.", { exact: true })).toBeVisible();
});

Then("each short interface label is unobscured and all component headers remain usable", async function (this: InterfaceArcWorld) {
  assert.ok(this.page && this.arcBaseline);
  const labels = this.page.locator("[data-interface-label]");
  const readable = await labels.evaluateAll((elements) => elements.map((element) => {
    const range = document.createRange();
    range.selectNodeContents(element.querySelector("span") ?? element);
    const text = range.getBoundingClientRect();
    const headers = [...document.querySelectorAll(".react-flow__node button")].map((header) => header.getBoundingClientRect());
    const clear = !headers.some((header) => text.left < header.right && text.right > header.left && text.top < header.bottom && text.bottom > header.top);
    const hits = [text.left + 1, (text.left + text.right) / 2, text.right - 1].map((x) => document.elementFromPoint(x, (text.top + text.bottom) / 2));
    const style = getComputedStyle(element);
    return Number(style.opacity) > 0 && style.visibility !== "hidden" && text.width > 0 && text.height > 0
      && clear && hits.every((hit) => !hit?.closest(".react-flow__node"));
  }));
  assert.ok(readable.length > 0);
  assert.deepEqual(readable, readable.map(() => true), "Interface names must be visible in full, with no component header covering their text.");
  for (const { id, name } of this.arcBaseline.components) {
    await this.page.getByRole("button", { name: `${name}, ${id}`, exact: true }).click();
    await expect(this.page.getByRole("dialog", { name: "Component details" })).toBeVisible();
    await this.page.getByRole("button", { name: "Close details", exact: true }).click();
  }
});

Then("Billing shows one interface and the canvas contains only components", async function (this: InterfaceArcWorld) {
  assert.ok(this.page && this.arcBaseline);
  await expect(this.page.getByRole("button", { name: "Billing, billing", exact: true })).toHaveText("Billing1 interface");
  assert.deepEqual(await this.page.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")).sort()),
    this.arcBaseline.components.map(({ id }) => id).sort());
});

Then("their paths and accessible names keep both interfaces distinct", async function (this: InterfaceArcWorld) {
  assert.ok(this.page && this.arcBaseline);
  const paths = await this.page.locator("path[data-interface-arc]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("d")));
  assert.equal(new Set(paths).size, 2);
  const labels = this.page.locator("[data-interface-label]");
  await expect(labels).toHaveCount(2);
  for (const item of this.arcBaseline.interfaces) {
    const label = labels.locator(`:scope[data-interface-id="${item.id}"]`);
    await expect(label).toHaveAccessibleName(new RegExp(item.id));
    await expect(label).toContainText(item.name);
  }
});

Then("a labelled loop extends outside Billing's header", async function (this: InterfaceArcWorld) {
  assert.ok(this.page);
  const header = await this.page.getByRole("button", { name: "Billing, billing", exact: true }).boundingBox();
  const loop = await this.page.locator("path[data-interface-arc]").boundingBox();
  assert.ok(header && loop);
  assert.ok(loop.x < header.x || loop.x + loop.width > header.x + header.width || loop.y < header.y || loop.y + loop.height > header.y + header.height);
  await expect(this.page.locator("[data-interface-label]")).toHaveText("Invoice API");
  await expect(this.page.locator("[data-interface-label]")).toHaveCSS("opacity", "1");
});

Then("the arc is visible inside the group while both headers remain usable", async function (this: InterfaceArcWorld) {
  assert.ok(this.page);
  const path = this.page.locator("path[data-interface-arc]");
  const visible = await path.evaluate((element) => {
    const curve = element as SVGPathElement;
    const transform = curve.getScreenCTM();
    const group = document.querySelector('.react-flow__node[data-id="checkout"]')?.getBoundingClientRect();
    if (!transform || !group) return false;
    const point = curve.getPointAtLength(curve.getTotalLength() * 0.05).matrixTransform(transform);
    const style = getComputedStyle(curve);
    return point.x > group.left && point.x < group.right && point.y > group.top && point.y < group.bottom
      && style.stroke !== "none" && style.opacity !== "0";
  });
  assert.ok(visible, "The nested arc must have a visible stroke inside the group.");
  for (const name of ["Checkout, checkout", "Billing, billing"]) {
    const header = this.page.getByRole("button", { name, exact: true });
    await header.click();
    await expect(this.page.getByRole("dialog", { name: "Component details" })).toBeVisible();
    await this.page.getByRole("button", { name: "Close details", exact: true }).click();
  }
});

Then("the arc label uses at most two lines and no more width than a header", async function (this: InterfaceArcWorld) {
  assert.ok(this.page);
  const label = this.page.locator("[data-interface-label]");
  await expect(label).toHaveCSS("opacity", "1");
  const bounds = await label.boundingBox();
  const header = await this.page.getByRole("button", { name: "Billing, billing", exact: true }).boundingBox();
  assert.ok(bounds && header && bounds.width <= header.width + 1);
  const text = await label.evaluate((element) => {
    const span = element.querySelector("span") ?? element;
    return { height: span.getBoundingClientRect().height, lineHeight: Number.parseFloat(getComputedStyle(span).lineHeight) };
  });
  assert.ok(text.height > 0 && text.height <= text.lineHeight * 2 + 1);
  await this.page.getByRole("button", { name: "Zoom Out", exact: true }).click();
  await expect.poll(async () => (await label.boundingBox())?.width ?? Infinity).toBeLessThan(bounds.width);
});

Then("the full interface name and endpoint names remain accessible", async function (this: InterfaceArcWorld) {
  assert.ok(this.page && this.arcBaseline);
  const item = fixtureItem(this.arcBaseline.interfaces);
  const label = this.page.locator("[data-interface-label]");
  const name = await label.getAttribute("aria-label");
  assert.ok(name?.includes(item.name) && name.includes("Checkout") && name.includes("Billing"));
});

After({ tags: "@br-07a" }, async function (this: InterfaceArcWorld) {
  if (this.arcDirectory) await rm(this.arcDirectory, { recursive: true, force: true });
});
