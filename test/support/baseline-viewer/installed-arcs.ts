import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { World } from "@cucumber/cucumber";
import { Key, type Browser } from "webdriverio";

const invoiceArc = (consumer: string) =>
  `button[data-interface-label][data-interface-id="invoice-api"][data-consumer-id="${consumer}"][data-owner-id="billing"]`;
const component = (id: string) => `.react-flow__node[data-id="${id}"] button[aria-haspopup="dialog"]`;

async function waitFor(check: () => Promise<boolean>, message: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  do {
    if (await check()) return;
    await delay(100);
  } while (Date.now() < deadline);
  assert.fail(message);
}

async function observe(browser: Browser) {
  return browser.execute(() => {
    const canvasElement = document.querySelector<HTMLElement>(".react-flow");
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!canvasElement || !viewport) throw new Error("The installed arc journey needs a component drawing");
    const canvas = canvasElement.getBoundingClientRect();
    const rect = (value: DOMRect) => ({ x: value.x, y: value.y, width: value.width, height: value.height });
    const identity = (element: Element | null) => element ? ["interface", "consumer", "owner"]
      .map((kind) => element.getAttribute(`data-${kind}-id`)).join("/") : null;
    const camera = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
    // Apply the observed CSS camera so endpoints include the same zoom as headers.
    const matrix = new DOMMatrixReadOnly().translate(canvas.x, canvas.y).multiply(camera);
    const panel = document.querySelector<HTMLElement>('[role="dialog"]');
    return {
      camera: { x: camera.e, y: camera.f, zoom: camera.a }, canvas: rect(canvas),
      nativeScroll: { canvasX: canvasElement.scrollLeft, canvasY: canvasElement.scrollTop,
        viewportX: viewport.scrollLeft, viewportY: viewport.scrollTop },
      nodes: Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"), (node) => {
        const style = getComputedStyle(node);
        const position = new DOMMatrixReadOnly(style.transform);
        const header = node.querySelector('button[aria-haspopup="dialog"]');
        if (!header) throw new Error("An installed component is missing its header");
        return { id: node.getAttribute("data-id"), x: position.e, y: position.f,
          width: Number.parseFloat(style.width), height: Number.parseFloat(style.height),
          bounds: rect(node.getBoundingClientRect()), header: rect(header.getBoundingClientRect()) };
      }),
      arcs: Array.from(document.querySelectorAll<SVGPathElement>("path[data-interface-arc]"), (path) => {
        const interfaceId = path.getAttribute("data-interface-id");
        const consumerId = path.getAttribute("data-consumer-id");
        const ownerId = path.getAttribute("data-owner-id");
        const label = document.querySelector(`[data-interface-label][data-interface-id="${interfaceId}"][data-consumer-id="${consumerId}"][data-owner-id="${ownerId}"]`);
        if (!label) throw new Error("An installed arc needs its rendered label");
        const start = matrix.transformPoint(path.getPointAtLength(0));
        const length = path.getTotalLength();
        const tip = path.getPointAtLength(length);
        const end = matrix.transformPoint(tip);
        const markerId = path.getAttribute("marker-end")?.match(/^url\(\s*(['"]?)#(.+?)\1\s*\)$/)?.[2];
        const marker = markerId ? document.getElementById(markerId) : null;
        if (!(marker instanceof SVGMarkerElement)) throw new Error("An installed arc needs a rendered arrowhead");
        const shape = marker.querySelector<SVGGraphicsElement>("polyline, polygon, path");
        if (!shape) throw new Error("The installed arrowhead needs a visible shape");
        const box = shape.getBBox();
        const markerView = marker.viewBox.baseVal;
        const units = marker.getAttribute("markerUnits") === "userSpaceOnUse" ? 1 : Number.parseFloat(getComputedStyle(path).strokeWidth);
        const scale = Math.min(marker.markerWidth.baseVal.value / markerView.width, marker.markerHeight.baseVal.value / markerView.height) * units;
        const previous = path.getPointAtLength(Math.max(0, length - 0.01));
        const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
        const stroke = getComputedStyle(shape).stroke === "none" ? 0 : Number.parseFloat(getComputedStyle(shape).strokeWidth) / 2;
        // Observe the SVG marker at the path tip; path bounds alone omit it.
        const corners = [box.x - stroke, box.x + box.width + stroke].flatMap((x) =>
          [box.y - stroke, box.y + box.height + stroke].map((y) => {
            const dx = (x - marker.refX.baseVal.value) * scale;
            const dy = (y - marker.refY.baseVal.value) * scale;
            return matrix.transformPoint({ x: tip.x + dx * Math.cos(angle) - dy * Math.sin(angle),
              y: tip.y + dx * Math.sin(angle) + dy * Math.cos(angle) });
          }));
        const left = Math.min(...corners.map(({ x }) => x));
        const top = Math.min(...corners.map(({ y }) => y));
        return { id: identity(path), interfaceId, consumerId, ownerId, d: path.getAttribute("d"),
          arrow: path.getAttribute("marker-end"), bounds: rect(path.getBoundingClientRect()),
          arrowBounds: { x: left, y: top, width: Math.max(...corners.map(({ x }) => x)) - left,
            height: Math.max(...corners.map(({ y }) => y)) - top },
          label: rect(label.getBoundingClientRect()), name: label.getAttribute("aria-label"),
          start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
      }),
      labelCount: document.querySelectorAll("[data-interface-label]").length,
      panelTitle: panel?.querySelector("#inspection-title")?.textContent?.trim() ?? "",
      panelText: panel?.innerText.trim() ?? "", back: Boolean(panel?.querySelector('button[aria-label="Back"]')),
      fields: Object.fromEntries(["Interface ID", "Owner", "Allowed consumers", "Public access", "Promises"].map((name) =>
        [name, panel?.querySelector<HTMLElement>(`[role="group"][aria-label="${name}"]`)?.innerText ?? ""])),
      focusedArc: identity(document.activeElement?.closest("[data-interface-label]") ?? null),
      focusedNode: document.activeElement?.closest(".react-flow__node")?.getAttribute("data-id") ?? null,
      focusedRecord: document.activeElement?.getAttribute("data-record-id") ?? null,
      focusedHeading: document.activeElement?.id === "inspection-title",
    };
  });
}

type ArcState = Awaited<ReturnType<typeof observe>>;
type Bounds = ArcState["canvas"];

function node(state: ArcState, id: string) {
  const found = state.nodes.find((entry) => entry.id === id);
  assert.ok(found, `The installed diagram must contain ${id}`);
  return found;
}

function near(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: expected ${expected}, received ${actual}`);
}

function sameGeometry(before: ArcState, after: ArcState): void {
  assert.deepEqual(after.nodes.map(({ id }) => id), before.nodes.map(({ id }) => id));
  for (const previous of before.nodes) {
    const current = node(after, previous.id ?? "");
    for (const field of ["x", "y", "width", "height"] as const) near(current[field], previous[field], `${previous.id} ${field}`);
  }
}

function fits(state: ArcState): boolean {
  const inside = (box: Bounds) => box.x >= state.canvas.x - 1 && box.y >= state.canvas.y - 1
    && box.x + box.width <= state.canvas.x + state.canvas.width + 1
    && box.y + box.height <= state.canvas.y + state.canvas.height + 1;
  return Number.isFinite(state.camera.zoom) && state.camera.zoom > 0
    && state.nodes.every(({ bounds }) => inside(bounds))
    && state.arcs.every(({ bounds, arrowBounds, label }) => inside(bounds) && inside(arrowBounds) && inside(label));
}

function expectAttached(state: ArcState): void {
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

function expectInvoice(state: ArcState, back: boolean): void {
  assert.equal(state.panelTitle, "Interface details");
  assert.ok(state.fields["Interface ID"]?.includes("invoice-api"));
  assert.equal(state.back, back, "Arc selection starts a fresh path; list selection retains Back");
  for (const text of ["billing", "Proposed", "fixture-owner"]) assert.ok(state.fields.Owner?.includes(text));
  for (const text of ["checkout", "reporting", "Accepted (recorded)", "fixture-consumers", "fixture-review"]) {
    assert.ok(state.fields["Allowed consumers"]?.includes(text));
  }
  assert.ok(state.fields["Public access"]?.includes("createInvoice"));
  for (const text of ["Create an invoice", "Invoice", "Invalid invoice", "One request"]) assert.ok(state.fields.Promises?.includes(text));
}

async function tabTo(browser: Browser, selector: string): Promise<void> {
  for (let count = 0; count < 64; count += 1) {
    if (await browser.execute((target) => document.activeElement === document.querySelector(target), selector)) return;
    await browser.keys(Key.Tab);
  }
  assert.fail(`Keyboard navigation must reach ${selector} in the installed drawing`);
}

async function invoiceReady(browser: Browser): Promise<void> {
  await waitFor(async () => {
    const state = await observe(browser);
    return state.panelTitle === "Interface details" && state.fields["Interface ID"]?.includes("invoice-api") === true;
  }, "The installed arc must open its recorded Invoice API details");
}

export async function inspectAndArrangeInstalledArcs(browser: Browser, world: World) {
  const all = browser.$('input[name="connection-mode"][value="all"]');
  assert.equal(await all.isExisting(), true, "The installed viewer must expose the All connection choice");
  await all.click();
  await waitFor(async () => {
    const state = await observe(browser);
    return state.nodes.length === 4 && state.arcs.length === 3 && state.labelCount === 3;
  }, "The known-consumer baseline must show its four components and three recorded interface arcs");
  const initial = await observe(browser);
  const text = (await browser.$("body").getText()).replace(/\s+/g, " ");
  assert.ok(text.includes("Arrow: consumer may use the owner's interface."));
  assert.equal(text.includes("unknown owners or allowed consumers"), false);

  await browser.$(invoiceArc("checkout")).click();
  await invoiceReady(browser);
  const pointer = await observe(browser);
  await browser.$('button[aria-label="Close details"]').click();
  await waitFor(async () => (await observe(browser)).panelTitle === "", "The installed interface panel must close");
  await tabTo(browser, invoiceArc("reporting"));
  const beforeKeyboard = await observe(browser);
  await browser.keys(Key.Enter);
  await invoiceReady(browser);
  const keyboard = await observe(browser);
  await browser.keys(Key.Escape);
  await waitFor(async () => {
    const state = await observe(browser);
    return state.panelTitle === "" && state.focusedArc === "invoice-api/reporting/billing";
  }, "Closing the installed panel must return keyboard focus to the exact initiating arc");

  await browser.$("#baseline-details-control").click();
  await browser.$('[role="region"][aria-label="Components"] button[data-record-id="billing"]').click();
  await browser.$('[role="region"][aria-label="Owned interfaces"] button[data-record-id="invoice-api"]').click();
  await invoiceReady(browser);
  await tabTo(browser, component("checkout"));
  const beforeMove = await observe(browser);
  await browser.keys(Key.ArrowRight);
  await waitFor(async () => {
    const state = await observe(browser);
    return node(state, "checkout").x === node(beforeMove, "checkout").x + 10
      && state.arcs.find(({ consumerId }) => consumerId === "checkout")?.d
        !== beforeMove.arcs.find(({ consumerId }) => consumerId === "checkout")?.d;
  }, "The installed endpoint and its attached arc must move together after ArrowRight");
  const afterMove = await observe(browser);
  await browser.$('button[aria-label="Fit View"]').click();
  await waitFor(async () => fits(await observe(browser)), "Fit must contain installed components, curves, arrowheads, and labels beside the panel");
  const afterFit = await observe(browser);
  await browser.$('button[aria-label="Reset layout"]').click();
  await waitFor(async () => {
    const state = await observe(browser);
    return state.camera.zoom === 1 && node(state, "checkout").x === node(initial, "checkout").x
      && state.arcs.every((arc, index) => arc.d === initial.arcs[index]?.d);
  }, "Reset must restore the installed component positions and interface arcs at 100 percent zoom");
  const afterReset = await observe(browser);
  for (const [title, entry] of [["Component details", "invoice-api"], ["Baseline details", "billing"]]) {
    await browser.$('button[aria-label="Back"]').click();
    await waitFor(async () => {
      const state = await observe(browser);
      return state.panelTitle === title && state.focusedRecord === entry;
    }, "Back must preserve the installed owner and interface navigation after Fit and Reset");
  }
  const result = { initial, pointer, beforeKeyboard, keyboard, beforeMove, afterMove, afterFit, afterReset, afterBack: await observe(browser) };
  await world.attach(JSON.stringify(result), "application/json");
  return result;
}

export function expectInstalledArcJourney(result: Awaited<ReturnType<typeof inspectAndArrangeInstalledArcs>>): void {
  const { initial, pointer, beforeKeyboard, keyboard, beforeMove, afterMove, afterFit, afterReset, afterBack } = result;
  const expected = ["invoice-api/checkout/billing", "invoice-api/reporting/billing", "audit-api/commerce/commerce"];
  for (const state of Object.values(result)) {
    assert.deepEqual(state.nativeScroll, { canvasX: 0, canvasY: 0, viewportX: 0, viewportY: 0 },
      "The installed canvas and viewport must not scroll outside the observed CSS camera");
    assert.deepEqual(state.arcs.map(({ id }) => id), expected);
    assert.equal(state.labelCount, 3);
    expectAttached(state);
  }
  const names: Record<string, string> = { "invoice-api": "Invoice API", "audit-api": "Audit API", commerce: "Commerce",
    billing: "Billing", checkout: "Checkout", reporting: "Reporting" };
  for (const arc of initial.arcs) {
    for (const id of [arc.interfaceId, arc.consumerId, arc.ownerId]) {
      assert.ok(id && arc.name?.includes(id) && arc.name.includes(names[id] ?? ""), "Each arc label must identify its interface and both endpoints");
    }
  }
  for (const [before, after] of [[initial, pointer], [beforeKeyboard, keyboard], [afterMove, afterFit], [initial, afterReset], [afterReset, afterBack]] as const) {
    sameGeometry(before, after);
  }
  assert.deepEqual(pointer.camera, initial.camera, "A pointer arc selection must preserve the camera");
  assert.deepEqual(keyboard.camera, beforeKeyboard.camera, "Keyboard activation must preserve the camera after focus reveal");
  assert.equal(pointer.focusedArc, expected[0]);
  assert.equal(beforeKeyboard.panelTitle, "", "Keyboard focus alone must not select an interface");
  assert.equal(keyboard.focusedHeading, true);
  expectInvoice(pointer, false);
  expectInvoice(keyboard, false);
  for (const state of [beforeMove, afterMove, afterFit, afterReset]) {
    expectInvoice(state, true);
    assert.equal(state.panelText, beforeMove.panelText, "Movement and layout controls must preserve complete interface details");
  }
  near(node(afterMove, "checkout").x, node(beforeMove, "checkout").x + 10, "ArrowRight moves the consumer ten diagram units");
  near(node(afterMove, "checkout").y, node(beforeMove, "checkout").y, "ArrowRight preserves the consumer's vertical position");
  for (const previous of beforeMove.nodes.filter(({ id }) => id !== "checkout")) {
    const current = node(afterMove, previous.id ?? "");
    near(current.x, previous.x, "Moving one endpoint preserves other component horizontal positions");
    near(current.y, previous.y, "Moving one endpoint preserves other component vertical positions");
  }
  assert.equal(afterMove.focusedNode, "checkout");
  assert.equal(afterMove.camera.zoom, beforeMove.camera.zoom);
  assert.equal(fits(afterFit), true);
  assert.deepEqual(afterFit.arcs.map(({ d }) => d), afterMove.arcs.map(({ d }) => d), "Fit must not reroute the manual arrangement");
  assert.deepEqual(afterReset.arcs.map(({ d }) => d), initial.arcs.map(({ d }) => d));
  const root = node(afterReset, "commerce");
  const { width, height } = afterReset.canvas;
  const centered = root.width + 48 <= width && root.height + 48 <= height;
  near(afterReset.camera.x + root.x, centered ? (width - root.width) / 2 : 24, "Reset uses the current horizontal starting view");
  near(afterReset.camera.y + root.y, centered ? (height - root.height) / 2 : 24, "Reset uses the current vertical starting view");
  assert.deepEqual(afterBack.camera, afterReset.camera);
}

export async function expectInstalledUnknownConsumers(browser: Browser): Promise<void> {
  const note = "8 interfaces have unknown owners or allowed consumers. Open Baseline details to inspect them.";
  await waitFor(async () => (await browser.$("body").getText()).replace(/\s+/g, " ").includes(note),
    "The reviewed installed baseline must explain its eight unknown allowed-consumer lists");
  const all = browser.$('input[name="connection-mode"][value="all"]');
  assert.equal(await all.isExisting(), true, "The installed viewer must expose the All connection choice");
  await all.click();
  assert.equal((await browser.$$("path[data-interface-arc]")).length, 0);
  assert.equal((await browser.$$("[data-interface-label]")).length, 0);
  await browser.$("#baseline-details-control").click();
  const records = await browser.$$('[role="region"][aria-label="Interfaces"] button');
  assert.equal(records.length, 8);
  assert.ok(records[0]);
  await records[0].click();
  await waitFor(async () => (await browser.$('[role="dialog"]').getText()).includes("Allowed consumers are unknown."),
    "An installed interface with null consumers must explain the missing arcs");
  const consumers = await browser.$('[role="group"][aria-label="Allowed consumers"]').getText();
  assert.ok(consumers.includes("Unknown (null)"), "The unknown-consumer explanation must retain the recorded null value");
}
