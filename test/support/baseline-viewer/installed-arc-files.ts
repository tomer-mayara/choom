import assert from "node:assert/strict";
import type { World } from "@cucumber/cucumber";
import type { Browser } from "webdriverio";
import { observeInstalledArcs, type InstalledArcState } from "./installed-arc-observer.ts";
import { expectInstalledArcGeometry } from "./installed-arcs.ts";

interface NativeBaselineOpening {
  openBaseline(path: string | null): Promise<void>;
  expectCancellationComplete(): Promise<void>;
  expectInputError(message: RegExp): Promise<void>;
}

async function observeWithoutHover(browser: Browser): Promise<InstalledArcState> {
  await browser.action("pointer").move({ origin: "viewport", x: 8, y: 8 }).perform();
  let state = await observeInstalledArcs(browser);
  await browser.waitUntil(async () => {
    state = await observeInstalledArcs(browser);
    const painted = state.labels.filter((label) => label.painted);
    return painted.length === 1 && painted[0]?.id === "audit-api/commerce/commerce";
  }, { timeout: 10_000, interval: 100,
    timeoutMsg: "After the pointer leaves the drawing, only the inspected Audit API label must remain painted" });
  return state;
}

/** Exercise the same native picker as the normal installed opening scenarios. */
export async function inspectInstalledArcOpens(browser: Browser, opening: NativeBaselineOpening,
  files: { baseline: string; invalid: string }, world: World) {
  const beforeOpen = await observeWithoutHover(browser);
  await opening.openBaseline(null);
  await opening.expectCancellationComplete();
  const cancelled = await observeWithoutHover(browser);
  await opening.openBaseline(files.invalid);
  await opening.expectInputError(/YAML/i);
  const invalid = await observeWithoutHover(browser);
  await opening.openBaseline(files.baseline);
  await browser.waitUntil(async () => {
    const state = await observeInstalledArcs(browser);
    return state.nodes.length === 4 && state.choices.mode === "selected" && state.choices.showSelf === false
      && state.panelTitle === "" && state.arcs.length === 0 && state.labels.length === 0 && state.camera.zoom === 1;
  }, { timeout: 10_000, interval: 100,
    timeoutMsg: "A successful same-file open must reset both choices and close inspection before any record is selected" });
  const reopened = await observeInstalledArcs(browser);
  const result = { beforeOpen, cancelled, invalid, reopened };
  await world.attach(JSON.stringify(result), "application/json");
  return result;
}

export function expectInstalledArcOpens(initial: InstalledArcState, result: Awaited<ReturnType<typeof inspectInstalledArcOpens>>): void {
  const { beforeOpen, cancelled, invalid, reopened } = result;
  assert.equal(beforeOpen.choices.mode, "all");
  assert.equal(beforeOpen.choices.showSelf, true);
  assert.equal(beforeOpen.panelTitle, "Interface details");
  assert.ok(beforeOpen.fields["Interface ID"]?.includes("audit-api"));
  assert.equal(beforeOpen.back, true);
  for (const current of [cancelled, invalid]) {
    expectInstalledArcGeometry(beforeOpen, current);
    assert.deepEqual(current.camera, beforeOpen.camera, "Cancelled and invalid native opens must preserve the camera");
    assert.deepEqual(current.choices, beforeOpen.choices, "Cancelled and invalid native opens must preserve both connection choices");
    assert.equal(current.panelText, beforeOpen.panelText, "Cancelled and invalid native opens must preserve complete interface details");
    assert.equal(current.back, beforeOpen.back, "Cancelled and invalid native opens must keep the inspection path");
    assert.deepEqual(current.arcs.map(({ id, d }) => ({ id, d })), beforeOpen.arcs.map(({ id, d }) => ({ id, d })));
    assert.deepEqual(current.labels.filter(({ painted }) => painted).map(({ id }) => id), ["audit-api/commerce/commerce"]);
  }
  expectInstalledArcGeometry(initial, reopened);
  assert.deepEqual(reopened.choices, { modes: ["selected", "all"], mode: "selected", showSelf: false });
  assert.equal(reopened.panelTitle, "");
  assert.equal(reopened.back, false);
  assert.deepEqual(reopened.arcs, []);
  assert.deepEqual(reopened.labels, []);
  assert.equal(reopened.emptyMessage, true);
  assert.equal(reopened.camera.zoom, 1);
  const root = reopened.nodes.find(({ id }) => id === "commerce");
  assert.ok(root);
  const centered = root.width + 48 <= reopened.canvas.width && root.height + 48 <= reopened.canvas.height;
  const x = centered ? (reopened.canvas.width - root.width) / 2 : 24;
  const y = centered ? (reopened.canvas.height - root.height) / 2 : 24;
  assert.ok(Math.abs(reopened.camera.x + root.x - x) < 0.01 && Math.abs(reopened.camera.y + root.y - y) < 0.01,
    "The same-file replacement must start at the normal 100 percent camera in its current canvas");
}
