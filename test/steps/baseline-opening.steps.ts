import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";

interface BaselineOpeningWorld extends World {
  page?: Page;
  baselineDirectory?: string;
  selectedBaseline?: string;
  originalBaselineBytes?: Buffer;
  baselineViewer?: BaselineBrowserDriver;
  heldLayout?: () => void;
  completedLayout?: boolean;
}

function viewer(world: BaselineOpeningWorld): BaselineBrowserDriver {
  assert.ok(world.baselineViewer, "The scenario must open the normal baseline viewer.");
  return world.baselineViewer;
}

Given("only the reviewed baseline file is available to the viewer", async function (this: BaselineOpeningWorld) {
  this.baselineDirectory = await mkdtemp(join(tmpdir(), "choom-baseline-opening-"));
  this.selectedBaseline = join(this.baselineDirectory, "baseline.yaml");
  await copyFile(new URL("../fixtures/baseline-viewer/full.yaml", import.meta.url), this.selectedBaseline);
  this.originalBaselineBytes = await readFile(this.selectedBaseline);
  assert.deepEqual(await readdir(this.baselineDirectory), ["baseline.yaml"],
    "The selected baseline must be independent of a repository, analyzer, and companion evidence files.");
  assert.ok(this.page, "The existing browser hook must supply a real Playwright page.");
  this.baselineViewer = new BaselineBrowserDriver(this.page);
  await this.baselineViewer.open();
});

When("the user opens the saved baseline in Choom", async function (this: BaselineOpeningWorld) {
  assert.ok(this.selectedBaseline);
  await viewer(this).openBaseline(this.selectedBaseline);
});

Then("its baseline ID and five component names are shown", async function (this: BaselineOpeningWorld) {
  const expected = [
    ["choom", "Choom"], ["workspace", "Workspace"], ["architecture-model", "Architecture model"],
    ["desktop-adapter", "Platform adapter"], ["native-shell", "Native shell"],
  ] as const;
  await expect.poll(async () => (await viewer(this).view()).headings).toContain("baseline-002");
  for (const [id, name] of expected) {
    await expect.poll(async () => (await viewer(this).view()).nodes.find((node) => node.id === id)?.text ?? "")
      .toContain(name);
  }
});

Then("repository selection and diagram export are unavailable", async function (this: BaselineOpeningWorld) {
  const { buttons } = await viewer(this).view();
  for (const action of ["Load Repo", "Choose directory", "Export Diagram"]) {
    assert.equal(buttons.includes(action), false, `The baseline viewer must not expose ${action}.`);
  }
});

Then("opening the baseline has not changed the selected file", async function (this: BaselineOpeningWorld) {
  assert.ok(this.selectedBaseline && this.originalBaselineBytes);
  assert.deepEqual(await readFile(this.selectedBaseline), this.originalBaselineBytes);
});

After({ tags: "@bv-03" }, async function (this: BaselineOpeningWorld) {
  this.heldLayout?.();
  if (this.baselineDirectory) await rm(this.baselineDirectory, { recursive: true, force: true });
});

When("the user opens an empty baseline", async function (this: BaselineOpeningWorld) {
  assert.ok(this.baselineDirectory);
  const path = join(this.baselineDirectory, "empty.yaml");
  await copyFile(new URL("../fixtures/baseline-viewer/empty.yaml", import.meta.url), path);
  await viewer(this).openBaseline(path);
});

Then("the empty baseline is shown without example components", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page);
  await expect(this.page.getByRole("heading", { name: "baseline-001", exact: true })).toBeVisible();
  await expect(this.page.getByText("No architecture items modeled", { exact: true })).toBeVisible();
  assert.deepEqual((await viewer(this).view()).nodes, []);
});

When("the user opens a legacy diagram", async function (this: BaselineOpeningWorld) {
  assert.ok(this.baselineDirectory && this.page);
  await expect(this.page.getByRole("heading", { name: "baseline-002", exact: true })).toBeVisible();
  const path = join(this.baselineDirectory, "legacy.choom.yaml");
  await writeFile(path, "schemaVersion: 1\nname: Legacy\n");
  await viewer(this).openBaseline(path);
});

Then("the previous baseline remains visible with a legacy format error", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page);
  await expect(this.page.getByRole("alert")).toContainText("Legacy diagrams are unsupported");
  await expect(this.page.getByRole("heading", { name: "baseline-002", exact: true })).toBeVisible();
  assert.equal((await viewer(this).view()).nodes.length, 5);
});

When("the next selected file read fails", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page);
  await this.page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      File.prototype.arrayBuffer = read;
      document.documentElement.dataset.readFailureObserved = "true";
      return Promise.reject(new Error("The selected file is unavailable."));
    };
  });
});

Then("the baseline read failure permits retry", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page);
  await expect(this.page.getByRole("alert")).toContainText("reading");
  assert.equal(await this.page.evaluate(() => document.documentElement.dataset.readFailureObserved), "true");
  await expect(this.page.getByRole("button", { name: "Retry", exact: true })).toBeEnabled();
});

When("the user retries the selected baseline", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page);
  await this.page.getByRole("button", { name: "Retry", exact: true }).click();
});

Given("the baseline viewer has a controllable layout", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page);
  this.baselineDirectory = await mkdtemp(join(tmpdir(), "choom-baseline-layout-"));
  this.selectedBaseline = join(this.baselineDirectory, "baseline.yaml");
  await copyFile(new URL("../fixtures/baseline-viewer/full.yaml", import.meta.url), this.selectedBaseline);
  await this.page.exposeFunction("__choomLayoutControl", async (phase: string, id: string) => {
    if (id === "layout-failure" && phase === "before") return "fail";
    if (id === "abandoned" && phase === "before") await new Promise<void>((resolve) => { this.heldLayout = resolve; });
    if (id === "abandoned" && phase === "completed") this.completedLayout = true;
    return "continue";
  });
  this.baselineViewer = new BaselineBrowserDriver(this.page);
  await this.baselineViewer.open(true);
});

When("the user cancels another baseline during layout", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page && this.baselineDirectory && this.selectedBaseline);
  await expect(this.page.getByRole("heading", { name: "baseline-002", exact: true })).toBeVisible();
  const path = join(this.baselineDirectory, "abandoned.yaml");
  await writeFile(path, (await readFile(this.selectedBaseline, "utf8")).replace("id: baseline-002", "id: abandoned"));
  await viewer(this).openBaseline(path);
  await expect.poll(() => Boolean(this.heldLayout)).toBe(true);
  await this.page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(this.page.getByRole("status")).toHaveText("Load cancelled.");
});

Then("a late layout cannot replace a newer baseline", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page && this.baselineDirectory && this.selectedBaseline && this.heldLayout);
  const path = join(this.baselineDirectory, "newer.yaml");
  await writeFile(path, (await readFile(this.selectedBaseline, "utf8")).replace("id: baseline-002", "id: newer"));
  await viewer(this).openBaseline(path);
  await expect(this.page.getByRole("heading", { name: "newer", exact: true })).toBeVisible();
  this.heldLayout();
  await expect.poll(() => this.completedLayout).toBe(true);
  await expect(this.page.getByRole("heading", { name: "newer", exact: true })).toBeVisible();
});

When("the user opens a baseline whose layout fails", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page && this.baselineDirectory && this.selectedBaseline);
  await expect(this.page.getByRole("heading", { name: "baseline-002", exact: true })).toBeVisible();
  const path = join(this.baselineDirectory, "layout-failure.yaml");
  await writeFile(path, (await readFile(this.selectedBaseline, "utf8")).replace("id: baseline-002", "id: layout-failure"));
  await viewer(this).openBaseline(path);
});

Then("the previous baseline remains visible with a layout error", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page);
  await expect(this.page.getByRole("alert")).toContainText("baseline layout failed");
  await expect(this.page.getByRole("heading", { name: "baseline-002", exact: true })).toBeVisible();
  assert.equal((await viewer(this).view()).nodes.length, 5);
});

Then("the read failure explains how to select the file again", async function (this: BaselineOpeningWorld) {
  assert.ok(this.page);
  await expect(this.page.getByRole("alert")).toContainText("Open Baseline and select the file again");
});
