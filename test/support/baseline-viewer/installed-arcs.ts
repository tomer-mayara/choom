import assert from "node:assert/strict";
import type { World } from "@cucumber/cucumber";
import { Key, type Browser } from "webdriverio";
import { installedDrawingFits, observeInstalledArcs, type InstalledArcState } from "./installed-arc-observer.ts";

const invoiceIds = ["invoice-api/checkout/billing", "invoice-api/reporting/billing"] as const;
const auditId = "audit-api/commerce/commerce";
const allIds = [...invoiceIds, auditId];
const invoiceArc = (consumer: string) =>
  `button[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="${consumer}"][data-owner-id="billing"]`;
const component = (id: string) => `.react-flow__node[data-id="${id}"] button[aria-haspopup="dialog"]`;
const mode = (value: string) => `input[name="connection-mode"][value="${value}"]`;
const selfChoice = '//label[normalize-space(.)="Show self-connections"]//input[@type="checkbox"]';

async function stateWhen(browser: Browser, check: (state: InstalledArcState) => boolean, message: string) {
  let state = await observeInstalledArcs(browser);
  await browser.waitUntil(async () => { state = await observeInstalledArcs(browser); return check(state); },
    { timeout: 10_000, interval: 100, timeoutMsg: message });
  return state;
}

function node(state: InstalledArcState, id: string) {
  const found = state.nodes.find((entry) => entry.id === id);
  assert.ok(found, `The installed diagram must contain ${id}`);
  return found;
}

function near(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: expected ${expected}, received ${actual}`);
}

export function expectInstalledArcGeometry(before: InstalledArcState, after: InstalledArcState): void {
  assert.deepEqual(after.nodes.map(({ id }) => id), before.nodes.map(({ id }) => id));
  for (const previous of before.nodes) {
    const current = node(after, previous.id ?? "");
    for (const field of ["x", "y", "width", "height"] as const) near(current[field], previous[field], `${previous.id} ${field}`);
  }
}

function expectArcSet(state: InstalledArcState, expected: readonly string[]): void {
  assert.deepEqual(state.arcs.map(({ id }) => id), expected, "The installed drawing must show the exact recorded arc tuples");
  assert.deepEqual(state.labels.map(({ id }) => id), expected, "Every shown arc must retain its own keyboard control");
  for (const label of state.labels) assert.ok(label.tabIndex >= 0, `${label.id} must remain a keyboard stop while its text is hidden`);
}

function expectPainted(state: InstalledArcState, expected: readonly string[]): void {
  assert.deepEqual(state.labels.filter(({ painted }) => painted).map(({ id }) => id), expected,
    "Only hovered, keyboard-focused, or inspected interface labels must be painted");
  for (const label of state.labels) {
    if (label.painted) assert.equal(label.background, "rgba(0, 0, 0, 0)", "Revealed labels must have transparent backgrounds");
    else assert.equal(label.pointerEvents, "none", "A hidden label must not retain an invisible pointer rectangle");
  }
}

function expectAttached(state: InstalledArcState): void {
  for (const arc of state.arcs) {
    assert.ok(arc.arrow?.includes("url("), "Each recorded arc must have an owner arrowhead");
    for (const [point, id] of [[arc.start, arc.consumerId], [arc.end, arc.ownerId]] as const) {
      const { x, y, width, height } = node(state, id ?? "").header;
      assert.ok(point.x >= x - 1 && point.x <= x + width + 1 && point.y >= y - 1 && point.y <= y + height + 1
        && Math.min(Math.abs(point.x - x), Math.abs(point.x - x - width), Math.abs(point.y - y), Math.abs(point.y - y - height)) <= 1,
      `${arc.id} must attach to its actual ${id} header border`);
    }
  }
}

function expectAccessibleNames(state: InstalledArcState): void {
  const names: Record<string, string> = { "invoice-api": "Invoice API", "audit-api": "Audit API", commerce: "Commerce",
    billing: "Billing", checkout: "Checkout", reporting: "Reporting" };
  for (const arc of state.arcs) {
    for (const id of [arc.interfaceId, arc.consumerId, arc.ownerId]) {
      assert.ok(id && arc.label.name?.includes(id) && arc.label.name.includes(names[id] ?? ""),
        "Each retained control must identify its interface and both endpoints");
    }
  }
}

function expectInvoice(state: InstalledArcState, back: boolean, fields = state.fields): void {
  assert.equal(state.panelTitle, "Interface details");
  assert.ok(fields["Interface ID"]?.includes("invoice-api"));
  assert.equal(state.back, back, "Arc selection starts a fresh path; list selection retains Back");
  for (const text of ["billing", "Proposed", "fixture-owner"]) assert.ok(fields.Owner?.includes(text));
  for (const text of ["checkout", "reporting", "Accepted (recorded)", "fixture-consumers", "fixture-review"]) {
    assert.ok(fields["Allowed consumers"]?.includes(text));
  }
  assert.ok(fields["Public access"]?.includes("createInvoice"));
  for (const text of ["Create an invoice", "Invoice", "Invalid invoice", "One request"]) assert.ok(fields.Promises?.includes(text));
}

function expectAudit(state: InstalledArcState, back: boolean, fields = state.fields): void {
  assert.equal(state.panelTitle, "Interface details");
  assert.ok(fields["Interface ID"]?.includes("audit-api"));
  assert.equal(state.back, back);
  for (const field of ["Owner", "Allowed consumers"]) {
    for (const text of ["commerce", "Proposed", "installed-fixture"]) assert.ok(fields[field]?.includes(text));
  }
  assert.ok(fields["Public access"]?.includes("recordAudit"));
  assert.ok(fields.Promises?.includes("Unknown (null)"));
}

async function tabTo(browser: Browser, selector: string): Promise<void> {
  for (let count = 0; count < 64; count += 1) {
    if (await browser.execute((target) => document.activeElement === document.querySelector(target), selector)) return;
    await browser.keys(Key.Tab);
  }
  assert.fail(`Keyboard navigation must reach ${selector} in the installed drawing`);
}

async function pointerAway(browser: Browser): Promise<void> {
  await browser.action("pointer").move({ origin: "viewport", x: 8, y: 8 }).perform();
}

async function pointAtCurve(browser: Browser, selector: string): Promise<{ x: number; y: number }> {
  const point = await browser.execute((target) => {
    const path = document.querySelector<SVGPathElement>(target);
    const canvas = document.querySelector(".react-flow")?.getBoundingClientRect();
    const viewport = document.querySelector(".react-flow__viewport");
    if (!path || !canvas || !viewport) throw new Error("The installed curve needs a visible canvas");
    const matrix = new DOMMatrixReadOnly().translate(canvas.x, canvas.y)
      .multiply(new DOMMatrixReadOnly(getComputedStyle(viewport).transform));
    for (let index = 1; index < 40; index += 1) {
      const value = matrix.transformPoint(path.getPointAtLength(path.getTotalLength() * index / 40));
      const x = Math.round(value.x);
      const y = Math.round(value.y);
      const hit = document.elementFromPoint(x, y);
      if (x > canvas.left + 12 && x < canvas.right - 12 && y > canvas.top + 12 && y < canvas.bottom - 12
        && !hit?.closest("button, .react-flow__node")
        && hit?.closest(".react-flow__edge")?.querySelector("[data-interface-arc]") === path) return { x, y };
    }
    throw new Error("The installed curve needs an unobscured pointer target");
  }, selector);
  await browser.action("pointer").move({ origin: "viewport", ...point }).perform();
  return point;
}

async function interfaceReady(browser: Browser, id: string) {
  const name = id === "invoice-api" ? "Invoice API" : "Audit API";
  return stateWhen(browser, (state) => state.panelTitle === "Interface details" && state.panelText.includes(name),
    `The installed panel must open the complete ${id} record`);
}

async function readInterfaceSources(browser: Browser) {
  await browser.$('//button[@role="tab" and normalize-space(.)="Sources"]').click();
  return (await stateWhen(browser, (state) => Boolean(state.fields["Interface ID"] && state.fields.Promises),
    "Sources must show the original interface fields before they are read")).fields;
}

async function ownedInterface(browser: Browser, owner: string, id: string): Promise<void> {
  await browser.$("#baseline-details-control").click();
  await browser.$(`[role="region"][aria-label="Components"] button[data-record-id="${owner}"]`).click();
  await browser.$(`[role="region"][aria-label="Owned interfaces"] button[data-record-id="${id}"]`).click();
  await interfaceReady(browser, id);
  await readInterfaceSources(browser);
  await pointerAway(browser);
}

export async function inspectAndArrangeInstalledArcs(browser: Browser, world: World) {
  const initial = await stateWhen(browser, (state) => state.nodes.length === 4 && state.arcs.length === 0
    && state.labels.length === 0 && state.choices.mode === "selected" && state.choices.showSelf === false,
  "The installed known-consumer baseline must open quietly in Selected with self-connections off");
  const text = (await browser.$("body").getText()).replace(/\s+/g, " ");
  assert.ok(text.includes("Arrow: consumer may use the owner's interface."));
  assert.equal(text.includes("unknown owners or allowed consumers"), false);

  await browser.$(component("checkout")).click();
  await pointerAway(browser);
  const checkout = await stateWhen(browser, (state) => state.panelTitle === "Component details" && state.arcs.length === 1,
    "Checkout must show only its direct Invoice API connection");
  const invoicePoint = await pointAtCurve(browser, 'path[data-interface-arc][data-interface-id="invoice-api"][data-consumer-id="checkout"]');
  const hovered = await stateWhen(browser, (state) => state.labels.filter(({ painted }) => painted).length === 1,
    "Hovering the installed curve must reveal its label");
  await browser.action("pointer").move({ origin: "viewport", ...invoicePoint }).down("left").up("left").perform();
  await interfaceReady(browser, "invoice-api");
  await pointerAway(browser);
  const pointer = await observeInstalledArcs(browser);
  const pointerFields = await readInterfaceSources(browser);
  await tabTo(browser, 'button[aria-label="Close details"]');
  await browser.keys(Key.Escape);
  const selectedClosed = await stateWhen(browser, (state) => state.panelTitle === "" && state.arcs.length === 0 && state.focusedNode === "billing",
    "Closing the selected installed interface must remove its arcs and focus Billing's header");

  await browser.$(mode("all")).click();
  await pointerAway(browser);
  const all = await stateWhen(browser, (state) => state.arcs.length === 2 && state.choices.mode === "all",
    "All must show the two known non-self Invoice API arcs");
  await tabTo(browser, invoiceArc("reporting"));
  const beforeKeyboard = await observeInstalledArcs(browser);
  await browser.keys(Key.Enter);
  const keyboard = await interfaceReady(browser, "invoice-api");
  const keyboardFields = await readInterfaceSources(browser);
  await browser.keys(Key.Escape);
  const allClosed = await stateWhen(browser, (state) => state.panelTitle === "" && state.focusedArc === invoiceIds[1],
    "Closing in All must restore the exact surviving keyboard arc");
  await browser.$(selfChoice).click();
  const selfOn = await stateWhen(browser, (state) => state.choices.showSelf === true && state.arcs.length === 3,
    "Show self-connections must add Commerce's Audit API loop to All");
  await browser.$(selfChoice).click();
  const selfOff = await stateWhen(browser, (state) => state.choices.showSelf === false && state.arcs.length === 2,
    "Turning self-connections off must remove only the Audit API loop");
  await browser.$(selfChoice).click();
  await browser.$(mode("selected")).click();
  const emptySelected = await stateWhen(browser, (state) => state.choices.mode === "selected" && state.choices.showSelf === true && state.arcs.length === 0,
    "Self-connections must not broaden Selected when no record is inspected");
  await browser.$(mode("all")).click();
  const restoredAll = await stateWhen(browser, (state) => state.arcs.length === 3,
    "Returning to All must retain the self-connection choice");

  await ownedInterface(browser, "billing", "invoice-api");
  await tabTo(browser, component("checkout"));
  const beforeMove = await observeInstalledArcs(browser);
  await browser.keys(Key.ArrowRight);
  const afterMove = await stateWhen(browser, (state) => node(state, "checkout").x === node(beforeMove, "checkout").x + 10
    && state.arcs.find(({ consumerId }) => consumerId === "checkout")?.d !== beforeMove.arcs.find(({ consumerId }) => consumerId === "checkout")?.d,
  "The installed endpoint and its attached arc must move together after ArrowRight");
  await browser.$('button[aria-label="Fit View"]').click();
  const afterFit = await stateWhen(browser, installedDrawingFits,
    "Fit must contain components, shown curves, arrowheads, and only painted labels beside the panel");

  const auditPoint = await pointAtCurve(browser, 'path[data-interface-arc][data-interface-id="audit-api"]');
  await browser.action("pointer").move({ origin: "viewport", ...auditPoint }).down("left").up("left").perform();
  await interfaceReady(browser, "audit-api");
  await pointerAway(browser);
  const selfInspection = await observeInstalledArcs(browser);
  const selfFields = await readInterfaceSources(browser);
  await ownedInterface(browser, "commerce", "audit-api");
  const beforeReset = await observeInstalledArcs(browser);
  await browser.$('button[aria-label="Reset layout"]').click();
  const afterReset = await stateWhen(browser, (state) => state.camera.zoom === 1 && node(state, "checkout").x === node(initial, "checkout").x,
    "Reset must restore the installed positions at 100 percent while retaining choices and Audit API details");
  await browser.$('button[aria-label="Back"]').click();
  const ownerBack = await stateWhen(browser, (state) => state.panelTitle === "Component details" && state.focusedRecord === "audit-api",
    "Back after Reset must restore Commerce's owned-interface list and Audit API row focus");
  await browser.$('button[aria-label="Back"]').click();
  const catalogBack = await stateWhen(browser, (state) => state.panelTitle === "Baseline details" && state.focusedRecord === "commerce",
    "Back after Reset must restore the baseline catalog and Commerce row focus");
  await ownedInterface(browser, "commerce", "audit-api");
  const result = { initial, checkout, hovered, pointer, selectedClosed, all, beforeKeyboard, keyboard, allClosed,
    selfOn, selfOff, emptySelected, restoredAll, beforeMove, afterMove, afterFit, selfInspection, beforeReset, afterReset, ownerBack, catalogBack,
    sourceFields: { pointer: pointerFields, keyboard: keyboardFields, selfInspection: selfFields } };
  await world.attach(JSON.stringify(result), "application/json");
  return result;
}

type InstalledArcJourney = Awaited<ReturnType<typeof inspectAndArrangeInstalledArcs>>;

export function expectInstalledArcJourney(result: InstalledArcJourney): void {
  const { initial, checkout, hovered, pointer, selectedClosed, all, beforeKeyboard, keyboard, allClosed,
    selfOn, selfOff, emptySelected, restoredAll, beforeMove, afterMove, afterFit, selfInspection, beforeReset, afterReset, ownerBack, catalogBack } = result;
  const { sourceFields, ...states } = result;
  for (const state of Object.values(states)) {
    assert.deepEqual(state.nativeScroll, { canvasX: 0, canvasY: 0, viewportX: 0, viewportY: 0 },
      "The installed canvas must not scroll outside its observed CSS camera");
    assert.deepEqual(state.choices.modes, ["selected", "all"]);
    for (const id of ["commerce", "billing"]) assert.ok(node(state, id).text.includes("1 interface"));
    for (const id of ["checkout", "reporting"]) assert.ok(node(state, id).text.includes("0 interfaces"));
    expectAttached(state);
  }
  for (const state of [initial, selectedClosed, emptySelected]) { expectArcSet(state, []); expectPainted(state, []); assert.equal(state.emptyMessage, true); }
  for (const state of [checkout, hovered]) expectArcSet(state, [invoiceIds[0]]);
  for (const state of [pointer, all, beforeKeyboard, keyboard, allClosed, selfOff]) expectArcSet(state, invoiceIds);
  for (const state of [selfOn, restoredAll, beforeMove, afterMove, afterFit, selfInspection, beforeReset, afterReset, ownerBack, catalogBack]) expectArcSet(state, allIds);
  for (const state of [checkout, all, selfOn, selfOff, restoredAll, ownerBack, catalogBack]) expectPainted(state, []);
  expectPainted(hovered, [invoiceIds[0]]);
  for (const state of [beforeKeyboard, allClosed]) expectPainted(state, [invoiceIds[1]]);
  for (const state of [pointer, keyboard, beforeMove, afterMove, afterFit]) expectPainted(state, invoiceIds);
  for (const state of [selfInspection, beforeReset, afterReset]) expectPainted(state, [auditId]);
  assert.equal(initial.choices.mode, "selected");
  assert.equal(initial.choices.showSelf, false);
  for (const state of [selfOn, emptySelected, restoredAll, beforeMove, afterMove, afterFit, selfInspection, beforeReset, afterReset, ownerBack, catalogBack]) {
    assert.equal(state.choices.showSelf, true);
    if (state !== emptySelected) assert.equal(state.choices.mode, "all");
  }
  assert.equal(selfOff.choices.showSelf, false);
  assert.equal(emptySelected.choices.mode, "selected");
  for (const state of [selfOn, selfOff]) assert.equal(state.focusedChoice, "self");
  assert.equal(emptySelected.focusedChoice, "selected");
  assert.equal(restoredAll.focusedChoice, "all");
  expectAccessibleNames(restoredAll);
  const focusedLabel = beforeKeyboard.labels.find(({ id }) => id === invoiceIds[1]);
  assert.ok(focusedLabel && focusedLabel.outline.width > 0 && focusedLabel.outline.style !== "none",
    "Actual Tab navigation must reveal the installed arc's focus outline before activation");
  assert.equal(beforeKeyboard.panelTitle, "", "Keyboard focus alone must not inspect an interface");
  assert.equal(keyboard.focusedHeading, true);
  assert.equal(pointer.focusedArc, invoiceIds[0]);
  assert.equal(selectedClosed.focusedNode, "billing");
  assert.equal(allClosed.focusedArc, invoiceIds[1]);
  expectInvoice(pointer, false, sourceFields.pointer);
  expectInvoice(keyboard, false, sourceFields.keyboard);
  for (const state of [beforeMove, afterMove, afterFit]) expectInvoice(state, true);
  expectAudit(selfInspection, false, sourceFields.selfInspection);
  for (const state of [beforeReset, afterReset]) expectAudit(state, true);
}

export function expectInstalledArcLayout(result: InstalledArcJourney): void {
  const { initial, checkout, hovered, pointer, selectedClosed, all, beforeKeyboard, keyboard, allClosed,
    selfOn, selfOff, emptySelected, restoredAll, beforeMove, afterMove, afterFit, selfInspection, beforeReset, afterReset, ownerBack, catalogBack } = result;
  for (const [before, after] of [[initial, checkout], [checkout, hovered], [hovered, pointer], [pointer, selectedClosed],
    [selectedClosed, all], [all, beforeKeyboard], [beforeKeyboard, keyboard], [keyboard, allClosed], [allClosed, selfOn],
    [selfOn, selfOff], [selfOff, emptySelected], [emptySelected, restoredAll], [restoredAll, beforeMove],
    [afterMove, afterFit], [afterFit, selfInspection], [selfInspection, beforeReset], [initial, afterReset],
    [afterReset, ownerBack], [ownerBack, catalogBack]] as const) expectInstalledArcGeometry(before, after);
  for (const [before, after] of [[initial, checkout], [checkout, hovered], [hovered, pointer],
    [selectedClosed, all], [beforeKeyboard, keyboard], [allClosed, selfOn], [selfOn, selfOff],
    [selfOff, emptySelected], [emptySelected, restoredAll], [afterFit, selfInspection], [selfInspection, beforeReset],
    [afterReset, ownerBack], [ownerBack, catalogBack]] as const) {
    assert.deepEqual(after.camera, before.camera, "Inspection and connection choices must preserve the installed camera");
  }
  assert.equal(beforeKeyboard.camera.zoom, all.camera.zoom, "Tab focus may reveal a label without changing zoom");
  assert.equal(selectedClosed.camera.zoom, pointer.camera.zoom, "Returning focus to the owner may reveal its header without changing zoom");
  assert.equal(allClosed.camera.zoom, keyboard.camera.zoom, "Returning focus to the surviving arc must preserve zoom");
  for (const state of [afterMove, afterFit]) assert.equal(state.panelText, beforeMove.panelText);
  near(node(afterMove, "checkout").x, node(beforeMove, "checkout").x + 10, "ArrowRight moves the consumer ten diagram units");
  near(node(afterMove, "checkout").y, node(beforeMove, "checkout").y, "ArrowRight preserves the consumer's vertical position");
  for (const previous of beforeMove.nodes.filter(({ id }) => id !== "checkout")) {
    const current = node(afterMove, previous.id ?? "");
    near(current.x, previous.x, "Moving one endpoint preserves other component horizontal positions");
    near(current.y, previous.y, "Moving one endpoint preserves other component vertical positions");
  }
  assert.equal(afterMove.focusedNode, "checkout");
  assert.equal(afterMove.camera.zoom, beforeMove.camera.zoom);
  assert.equal(installedDrawingFits(afterFit), true);
  assert.equal(afterFit.labels.length, 3, "Fit must retain every shown arc's keyboard control");
  assert.equal(afterFit.labels.filter(({ painted }) => painted).length, 2, "The hidden Audit API label is excluded from Fit's observed rectangles");
  assert.deepEqual(afterFit.arcs.map(({ d }) => d), afterMove.arcs.map(({ d }) => d), "Fit must not reroute the manual arrangement");
  assert.deepEqual(afterReset.arcs.map(({ d }) => d), restoredAll.arcs.map(({ d }) => d));
  assert.equal(afterReset.panelText, beforeReset.panelText, "Reset must preserve complete Audit API details and Back navigation");
  const root = node(afterReset, "commerce");
  const { width, height } = afterReset.canvas;
  const centered = root.width + 48 <= width && root.height + 48 <= height;
  near(afterReset.camera.x + root.x, centered ? (width - root.width) / 2 : 24, "Reset uses the current horizontal starting view");
  near(afterReset.camera.y + root.y, centered ? (height - root.height) / 2 : 24, "Reset uses the current vertical starting view");
}

export async function expectInstalledUnknownConsumers(browser: Browser): Promise<void> {
  const note = "8 interfaces have unknown owners or allowed consumers. Open Baseline details to inspect them.";
  await browser.waitUntil(async () => (await browser.$("body").getText()).replace(/\s+/g, " ").includes(note),
    { timeout: 10_000, timeoutMsg: "The installed baseline must explain its eight unknown allowed-consumer lists" });
  const selected = await observeInstalledArcs(browser);
  assert.equal(selected.choices.mode, "selected");
  expectArcSet(selected, []);
  await browser.$(mode("all")).click();
  const all = await stateWhen(browser, (state) => state.choices.mode === "all", "The installed unknown-consumer view must support All");
  expectArcSet(all, []);
  assert.ok((await browser.$("body").getText()).replace(/\s+/g, " ").includes(note));
  await browser.$("#baseline-details-control").click();
  const records = await browser.$$('[role="region"][aria-label="Interfaces"] button');
  assert.equal(records.length, 8);
  assert.ok(records[0]);
  await records[0].click();
  await browser.$('//button[@role="tab" and normalize-space(.)="Sources"]').click();
  await browser.waitUntil(async () => (await browser.$('[role="dialog"]').getText()).includes("Allowed consumers are unknown."),
    { timeout: 10_000, timeoutMsg: "An installed interface with null consumers must explain the missing arcs" });
  const consumers = await browser.$('[role="group"][aria-label="Allowed consumers"]').getText();
  assert.ok(consumers.includes("Unknown (null)"), "The unknown-consumer explanation must retain the recorded null value");
  expectArcSet(await observeInstalledArcs(browser), []);
}
