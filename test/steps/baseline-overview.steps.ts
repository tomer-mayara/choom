import assert from "node:assert/strict";
import { Then, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Page } from "@playwright/test";

const expect = browserExpect.configure({ timeout: 2_000 });

interface OverviewWorld extends World { page?: Page }

function page(world: OverviewWorld): Page {
  assert.ok(world.page, "The browser scenario must have a page.");
  return world.page;
}

Then("the overview shows only the five recorded components and no relationship lines", async function (this: OverviewWorld) {
  const browser = page(this);
  await expect(browser.locator(".react-flow__node")).toHaveCount(5);
  await expect(browser.locator(".react-flow__edge")).toHaveCount(0);
  const ids = await browser.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")));
  assert.deepEqual(new Set(ids), new Set(["choom", "workspace", "architecture-model", "desktop-adapter", "native-shell"]));
});

Then("all five component names are readable at 100 percent in a 1280 by 800 window", async function (this: OverviewWorld) {
  const browser = page(this);
  assert.deepEqual(browser.viewportSize(), { width: 1280, height: 800 });
  await expect.poll(() => browser.locator(".react-flow__viewport").evaluate((node) =>
    new DOMMatrixReadOnly(getComputedStyle(node).transform).a)).toBe(1);
  const headers = await browser.locator(".react-flow__node button").evaluateAll((nodes) => nodes.map((node) => {
    const name = node.querySelector("span");
    const bounds = node.getBoundingClientRect();
    return { ...bounds.toJSON(), textFits: !!name && name.scrollHeight <= name.clientHeight
      && name.scrollWidth <= name.clientWidth, fontSize: name ? Number.parseFloat(getComputedStyle(name).fontSize) : 0 };
  }));
  const canvas = await browser.getByLabel("Architecture diagram", { exact: true }).boundingBox();
  assert.ok(canvas);
  assert.equal(headers.length, 5);
  for (const [index, header] of headers.entries()) {
    assert.equal(header.textFits, true, "Each reviewed name must fit without truncation.");
    assert.ok(header.fontSize >= 14, "Names must use normal readable text.");
    assert.ok(header.left >= canvas.x && header.top >= canvas.y
      && header.right <= canvas.x + canvas.width && header.bottom <= canvas.y + canvas.height);
    assert.equal(headers.slice(index + 1).some((other) => header.left < other.right && other.left < header.right
      && header.top < other.bottom && other.top < header.bottom), false, "Component headers must not overlap.");
  }
});

Then("Workspace shows five owned interfaces and Architecture model shows one", async function (this: OverviewWorld) {
  await expect(page(this).getByRole("button", { name: "Workspace, workspace", exact: true })).toContainText("5 interfaces");
  await expect(page(this).getByRole("button", { name: "Architecture model, architecture-model", exact: true })).toContainText("1 interface");
});

Then("Baseline details lists all eight interfaces and five resources", async function (this: OverviewWorld) {
  const browser = page(this);
  await browser.getByRole("button", { name: "Baseline details", exact: true }).click();
  const panel = browser.getByRole("dialog", { name: "Baseline details" });
  await expect(panel.getByRole("region", { name: "Interfaces", exact: true }).getByRole("button")).toHaveCount(8);
  await expect(panel.getByRole("region", { name: "Resources", exact: true }).getByRole("button")).toHaveCount(5);
});
