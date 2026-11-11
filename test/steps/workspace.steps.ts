import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";

interface WorkspaceWorld extends World { page?: Page; pageErrors: string[] }
function page(world: WorkspaceWorld): Page {
  assert.ok(world.page);
  return world.page;
}
Given("the browser workspace is open", async function (this: WorkspaceWorld) {
  assert.ok(process.env.CHOOM_BASE_URL);
  await page(this).goto(process.env.CHOOM_BASE_URL);
});
Then("the browser workspace identifies itself", async function (this: WorkspaceWorld) {
  await expect(page(this).getByRole("heading", { name: "Architecture starts here." })).toBeVisible();
  await expect(page(this).getByText("Browser", { exact: true })).toBeVisible();
  await expect(page(this).getByRole("button", { name: "Open Baseline", exact: true })).toBeEnabled();
});
When("I explore the example", async function (this: WorkspaceWorld) {
  await page(this).getByRole("button", { name: "Explore example", exact: true }).click();
});
When("I close the example", async function (this: WorkspaceWorld) {
  await page(this).getByRole("button", { name: "Close example", exact: true }).click();
});
Then("the example is closed", async function (this: WorkspaceWorld) {
  await expect(page(this).getByRole("heading", { name: "example-baseline", exact: true })).toHaveCount(0);
});
Then("the starter baseline is visible", async function (this: WorkspaceWorld) {
  await expect(page(this).getByRole("heading", { name: "example-baseline", exact: true })).toBeVisible();
  await expect(page(this).locator(".react-flow__node[data-id]")).toHaveCount(3);
  await expect(page(this).getByRole("button", { name: "Workspace, workspace", exact: true })).toBeInViewport();
});
Then("no browser page errors have occurred", function (this: WorkspaceWorld) {
  assert.deepEqual(this.pageErrors, []);
});
