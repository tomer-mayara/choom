import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import type { World } from "@cucumber/cucumber";
import { Key, remote, type Browser } from "webdriverio";
import { expectInstalledUnknownConsumers, inspectAndArrangeInstalledArcs } from "./installed-arcs.ts";
import { inspectInstalledArcOpens } from "./installed-arc-files.ts";

const run = promisify(execFile);

interface InstalledDiagramState {
  camera: { x: number; y: number; zoom: number };
  canvas: { width: number; height: number };
  nodes: Array<{
    id: string; x: number; y: number; width: number; height: number; headerHeight: number; selected: boolean;
  }>;
  panelTitle: string;
  panelText: string;
  panelModal: string | null;
  focusedNode: string | null;
  focusedRecord: string | null;
}

interface InstalledMovement {
  initial: InstalledDiagramState;
  beforeDrag: InstalledDiagramState;
  afterDrag: InstalledDiagramState;
  beforeKeyboard: InstalledDiagramState;
  afterKeyboard: InstalledDiagramState;
}

interface InstalledReset {
  beforeFit: InstalledDiagramState;
  afterFit: InstalledDiagramState;
  afterReset: InstalledDiagramState;
  afterBack: InstalledDiagramState;
}

function diagramNode(state: InstalledDiagramState, id: string) {
  const node = state.nodes.find((item) => item.id === id);
  assert.ok(node, `The installed diagram must contain ${id}`);
  return node;
}

function expectNear(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) <= 0.01, `${message}: expected ${expected}, received ${actual}`);
}

function environment(name: string): string {
  const value = process.env[name];
  assert.ok(value, `${name} is missing; use bun run test:behavior:packaged`);
  return value;
}

async function waitFor(check: () => Promise<boolean>, message: string, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await delay(100);
  } while (Date.now() < deadline);
  assert.fail(message);
}

async function xdo(args: string[], allowNoMatch = false): Promise<string[]> {
  try {
    const result = await run(environment("CHOOM_XDOTOOL"), args, { timeout: 5_000, maxBuffer: 256 * 1024 });
    return result.stdout.trim().split("\n").filter(Boolean);
  } catch (error) {
    if (allowNoMatch && error instanceof Error && "code" in error && error.code === 1) return [];
    throw error;
  }
}

/** Operate the ordinary installed app through WebDriver and its native GTK picker. */
export class InstalledBaselineDriver {
  private browser?: Browser;
  private processId?: string;
  private readonly world: World;

  constructor(world: World) { this.world = world; }

  private session(): Browser {
    assert.ok(this.browser, "The installed application must be open");
    return this.browser;
  }

  async open(): Promise<void> {
    try {
      const capabilities: Parameters<typeof remote>[0]["capabilities"] & {
        "tauri:options": { application: string };
      } = { "tauri:options": { application: environment("CHOOM_PACKAGED_APP") } };
      this.browser = await remote({
        hostname: "127.0.0.1", port: Number(environment("CHOOM_PACKAGED_NO_RUNTIME_DRIVER_PORT")), path: "/",
        logLevel: "error", connectionRetryCount: 0, connectionRetryTimeout: 20_000, capabilities,
      });
      await waitFor(async () => (await this.session().$("body").getText()).trim().length > 0,
        "The installed application did not display its document", 20_000);
      assert.equal(await this.session().execute(() => "__TAURI_INTERNALS__" in window), true,
        "The installed viewer must use the real native host");
      await this.findApplicationProcess();
      await this.verifyProductEnvironment();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await writeFile(join(environment("CHOOM_PACKAGED_EVIDENCE_DIR"), "setup-failure.json"),
        JSON.stringify({ phase: "installed-session", reason }, null, 2));
      throw new Error(`Packaged setup failed before a usable installed session: ${reason}`, { cause: error });
    }
  }

  private async findApplicationProcess(): Promise<void> {
    const executable = environment("CHOOM_PACKAGED_APP");
    await waitFor(async () => {
      for (const window of await xdo(["search", "--onlyvisible", "--name", "^Choom$"], true)) {
        const [pid] = await xdo(["getwindowpid", window]);
        if (!pid) continue;
        try {
          if (await realpath(await readlink(`/proc/${pid}/exe`)) === executable) {
            this.processId = pid;
            return true;
          }
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
      }
      return false;
    }, "No visible Choom X11 window belongs to the requested installed executable");
  }

  private async verifyProductEnvironment(): Promise<void> {
    assert.ok(this.processId);
    const path = environment("CHOOM_PACKAGED_NO_RUNTIME_PATH");
    assert.ok(isAbsolute(path), "The product PATH must name an absolute owned directory");
    assert.deepEqual(await readdir(path), [], "The product PATH directory must be empty");
    const entries = (await readFile(`/proc/${this.processId}/environ`, "utf8")).split("\0");
    assert.equal(entries.find((entry) => entry.startsWith("PATH=")), `PATH=${path}`,
      "The installed process must inherit only the empty PATH, without Node or an analyzer");
    const workingDirectory = await realpath(await readlink(`/proc/${this.processId}/cwd`));
    const checkout = await realpath(process.cwd());
    const fromCheckout = relative(checkout, workingDirectory);
    assert.ok(fromCheckout === ".." || fromCheckout.startsWith(`..${sep}`) || isAbsolute(fromCheckout),
      "The installed process must start outside the development checkout");
    await this.world.attach(JSON.stringify({
      installedPid: this.processId, executable: environment("CHOOM_PACKAGED_APP"),
      path, workingDirectory, runtimeAvailable: false,
    }), "application/json");
  }

  private async applicationWindows(): Promise<string[]> {
    assert.ok(this.processId);
    return xdo(["search", "--onlyvisible", "--pid", this.processId], true);
  }

  async openBaseline(path: string | null): Promise<void> {
    const action = this.session().$("//button[normalize-space(.)='Open Baseline']");
    assert.equal(await action.isExisting(), true,
      "The loaded installed application must expose Open Baseline before the user can select a baseline file.");
    assert.equal(await action.isDisplayed(), true, "Open Baseline must be visible");
    assert.equal(await action.isEnabled(), true, "Open Baseline must be enabled");
    const previous = new Set(await this.applicationWindows());
    await action.click();
    let dialog = "";
    await waitFor(async () => {
      const candidates = (await this.applicationWindows()).filter((id) => !previous.has(id));
      assert.ok(candidates.length <= 1, "More than one native dialog appeared for the installed app");
      dialog = candidates[0] ?? "";
      return Boolean(dialog);
    }, "Open Baseline did not open a native GTK picker");
    await xdo(["windowfocus", "--sync", dialog]);
    if (path === null) {
      await xdo(["key", "--clearmodifiers", "Escape"]);
    } else {
      // Let GTK reveal and focus the location entry before selecting its text.
      await xdo(["key", "--clearmodifiers", "--delay", "200", "ctrl+l", "ctrl+a"]);
      await xdo(["type", "--clearmodifiers", "--delay", "1", path]);
      // Accept the location entry's inline completion before submitting the file.
      await xdo(["key", "--clearmodifiers", "--delay", "200", "End", "Return"]);
    }
    await waitFor(async () => !(await this.applicationWindows()).includes(dialog),
      "The native GTK picker did not close after selection or cancellation");
  }

  async expectBaseline(id: string, components: ReadonlyArray<readonly [string, string]>): Promise<void> {
    await waitFor(async () => {
      const view = await this.view();
      return view.headings.includes(id)
        && components.every(([nodeId, name]) => view.nodes.some((node) => node.id === nodeId && node.text.includes(name)));
    }, `The installed viewer did not show ${id} and all its recorded component names`);
  }

  async expectInputError(message: RegExp): Promise<void> {
    await waitFor(async () => (await this.view()).alerts.some((text) => message.test(text)),
      `The installed viewer did not identify the input problem with ${String(message)}`);
  }

  async expectCancellationComplete(): Promise<void> {
    await waitFor(async () => {
      const action = this.session().$("//button[normalize-space(.)='Open Baseline']");
      return (await this.view()).statuses.includes("Load cancelled.")
        && await action.isDisplayed() && await action.isEnabled();
    }, "The installed viewer did not finish cancellation and enable Open Baseline again");
  }

  async expectComponentOverview(components: ReadonlyArray<readonly [string, string]>): Promise<void> {
    await waitFor(async () => {
      const view = await this.view();
      return view.nodes.length === components.length && view.edges.length === 0
        && components.every(([id, name]) => view.nodes.some((node) => node.id === id && node.text.includes(name)));
    }, "The installed overview must show only its recorded components and no relationship lines");
  }

  async inspectRecords(kind: "Interfaces" | "Resources", records: ReadonlyArray<{
    id: string; name: string; owner: { value: string | null; status: "accepted" | "proposed" };
  }>): Promise<void> {
    await this.session().$("#baseline-details-control").click();
    const selector = `[role="dialog"] [role="region"][aria-label="${kind}"] button`;
    await waitFor(async () => (await this.session().$$(selector)).length === records.length,
      `The installed catalog must list every ${kind.toLowerCase()} record`);
    for (const [index, { id, name, owner }] of records.entries()) {
      const rows = await this.session().$$(selector);
      const row = rows[index];
      assert.ok(row);
      assert.equal(await row.getAttribute("aria-label"), `${name}, ${id}`);
      if (owner.value === null) assert.ok((await row.getText()).includes("Owner unknown"));
      await row.click();
      await waitFor(async () => this.session().execute((recordId, recordOwner, recordKind) => {
        const panel = document.querySelector('[role="dialog"]');
        const idField = recordKind === "Interfaces" ? "Interface ID" : "Resource ID";
        const ownership = panel?.querySelector('[role="group"][aria-label="Owner"]')?.textContent;
        return panel?.querySelector(`[role="group"][aria-label="${idField}"]`)?.textContent?.includes(recordId) === true
          && ownership?.includes(recordOwner.value ?? "Unknown (null)") === true
          && ownership.includes(recordOwner.status === "accepted" ? "Accepted (recorded)" : "Proposed");
      }, id, owner, kind), `The installed viewer must inspect ${id} with its recorded owner`);
      await this.session().$('button[aria-label="Back"]').click();
      await waitFor(async () => (await this.session().$$(selector)).length === records.length,
        "Back must restore the installed record catalog");
    }
    await this.session().$('button[aria-label="Close details"]').click();
  }

  private componentControl(id: string) {
    return this.session().$(`.react-flow__node[data-id="${id}"] button[aria-haspopup="dialog"]`);
  }

  private async diagramState(): Promise<InstalledDiagramState> {
    return this.session().execute(() => {
      const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
      if (!viewport) throw new Error("The installed diagram must have a viewport");
      const camera = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
      const canvas = viewport.closest(".react-flow")?.getBoundingClientRect();
      if (!canvas) throw new Error("The installed diagram must have a canvas");
      const panel = document.querySelector<HTMLElement>('[role="dialog"]');
      return {
        camera: { x: camera.e, y: camera.f, zoom: camera.a },
        canvas: { width: canvas.width, height: canvas.height },
        nodes: Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"), (node) => {
          const style = getComputedStyle(node);
          const position = new DOMMatrixReadOnly(style.transform);
          const control = node.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
          if (!control) throw new Error("Each installed component must have an inspection control");
          return {
            id: node.getAttribute("data-id") ?? "", x: position.e, y: position.f,
            width: Number.parseFloat(style.width), height: Number.parseFloat(style.height),
            headerHeight: control.getBoundingClientRect().height / camera.a,
            selected: control.getAttribute("aria-pressed") === "true",
          };
        }),
        panelTitle: panel?.querySelector("#inspection-title")?.textContent?.trim() ?? "",
        panelText: panel?.innerText.trim() ?? "",
        panelModal: panel?.getAttribute("aria-modal") ?? null,
        focusedNode: document.activeElement?.closest(".react-flow__node")?.getAttribute("data-id") ?? null,
        focusedRecord: document.activeElement?.getAttribute("data-record-id") ?? null,
      };
    });
  }

  private async selectComponent(id: string): Promise<void> {
    await this.componentControl(id).click();
    await waitFor(async () => {
      const state = await this.diagramState();
      return diagramNode(state, id).selected && state.panelTitle === "Component details";
    }, `The installed panel must inspect ${id} after one selection`);
  }

  async inspectAndMoveComponents(ownedInterfaces: ReadonlyArray<readonly [string, string]>): Promise<InstalledMovement> {
    const initial = await this.diagramState();
    await this.selectComponent("workspace");
    const selector = '[role="dialog"] [role="region"][aria-label="Owned interfaces"] button';
    await waitFor(async () => (await this.session().$$(selector)).length === ownedInterfaces.length,
      "The installed Workspace panel must list its directly owned interfaces");
    assert.equal((await this.diagramState()).panelModal, "false", "The installed panel must be nonmodal");
    const rows = await this.session().$$(selector);
    for (const [index, [id, name]] of ownedInterfaces.entries()) {
      assert.equal(await rows[index]?.getAttribute("aria-label"), `${name}, ${id}`);
    }
    const first = ownedInterfaces[0];
    assert.ok(first && rows[0]);
    await rows[0].click();
    await waitFor(async () => this.session().execute((id) => {
      const panel = document.querySelector('[role="dialog"]');
      return panel?.querySelector('[role="group"][aria-label="Interface ID"]')?.textContent?.includes(id) === true
        && panel.querySelector('[role="group"][aria-label="Owner"]')?.textContent?.includes("workspace") === true
        && ["Public access", "Allowed consumers", "Promises"].every((name) =>
          panel.querySelector(`[role="group"][aria-label="${name}"]`));
    }, first[0]), "An owned interface must open with its recorded details in the installed panel");
    await this.session().$('button[aria-label="Back"]').click();
    await waitFor(async () => {
      const state = await this.diagramState();
      return state.panelTitle === "Component details" && state.focusedRecord === first[0]
        && (await this.session().$$(selector)).length === ownedInterfaces.length;
    }, "Back must restore the installed Workspace list and focus its interface entry");

    await this.selectComponent("native-shell");
    const beforeDrag = await this.diagramState();
    assert.ok(beforeDrag.panelText.includes("Native shell"));
    await this.session().action("pointer")
      .move({ origin: await this.componentControl("workspace") })
      .down("left")
      .move({ origin: "pointer", x: 40, y: 20, duration: 300 })
      .up("left")
      .perform();
    await waitFor(async () => diagramNode(await this.diagramState(), "workspace").x !== diagramNode(beforeDrag, "workspace").x,
      "The installed Workspace must move when its header is dragged");
    const afterDrag = await this.diagramState();

    await this.selectComponent("architecture-model");
    const beforeKeyboard = await this.diagramState();
    assert.equal(beforeKeyboard.focusedNode, "architecture-model");
    await this.session().keys(Key.ArrowRight);
    await waitFor(async () => diagramNode(await this.diagramState(), "architecture-model").x !== diagramNode(beforeKeyboard, "architecture-model").x,
      "The installed child component must move when its focused header receives ArrowRight");
    const afterKeyboard = await this.diagramState();
    const movement = { initial, beforeDrag, afterDrag, beforeKeyboard, afterKeyboard };
    await this.world.attach(JSON.stringify(movement), "application/json");
    return movement;
  }

  expectComponentMovement({ initial, beforeDrag, afterDrag, beforeKeyboard, afterKeyboard }: InstalledMovement): void {
    for (const [beforeInspection, afterInspection] of [[initial, beforeDrag], [afterDrag, beforeKeyboard]] as const) {
      assert.deepEqual(afterInspection.camera, beforeInspection.camera, "Inspection must preserve the installed camera");
      for (const before of beforeInspection.nodes) {
        const after = diagramNode(afterInspection, before.id);
        for (const field of ["x", "y", "width", "height"] as const) {
          expectNear(after[field], before[field], `Inspection must preserve ${before.id} ${field}`);
        }
      }
    }
    for (const id of ["workspace", "architecture-model", "desktop-adapter"]) {
      const before = diagramNode(beforeDrag, id);
      const after = diagramNode(afterDrag, id);
      expectNear(after.x, before.x + 40 / beforeDrag.camera.zoom, `${id} must follow the parent drag horizontally`);
      expectNear(after.y, before.y + 20 / beforeDrag.camera.zoom, `${id} must follow the parent drag vertically`);
      expectNear(after.width, before.width, `Dragging must preserve ${id} width`);
      expectNear(after.height, before.height, `Dragging must preserve ${id} height`);
    }
    assert.deepEqual(diagramNode(afterDrag, "native-shell"), diagramNode(beforeDrag, "native-shell"),
      "Dragging Workspace must leave Native shell unchanged");
    assert.deepEqual(afterDrag.camera, beforeDrag.camera, "Dragging must preserve the installed camera");
    assert.equal(afterDrag.panelText, beforeDrag.panelText, "Releasing a drag must keep Native shell details open");
    assert.deepEqual(afterDrag.nodes.filter((node) => node.selected).map((node) => node.id), ["native-shell"]);

    const child = diagramNode(afterKeyboard, "architecture-model");
    const previousChild = diagramNode(beforeKeyboard, "architecture-model");
    expectNear(child.x, previousChild.x + 10, "ArrowRight must move the child ten diagram units");
    expectNear(child.y, previousChild.y, "ArrowRight must preserve the child vertical position");
    expectNear(child.width, previousChild.width, "Keyboard movement must preserve the child width");
    expectNear(child.height, previousChild.height, "Keyboard movement must preserve the child height");
    for (const before of beforeKeyboard.nodes.filter((node) => node.id !== child.id)) {
      const after = diagramNode(afterKeyboard, before.id);
      expectNear(after.x, before.x, `Child movement must preserve ${before.id} horizontal position`);
      expectNear(after.y, before.y, `Child movement must preserve ${before.id} vertical position`);
    }
    for (const [childId, parentId] of [["workspace", "choom"], ["native-shell", "choom"],
      ["architecture-model", "workspace"], ["desktop-adapter", "workspace"]] as const) {
      const item = diagramNode(afterKeyboard, childId);
      const parent = diagramNode(afterKeyboard, parentId);
      assert.ok(item.x >= parent.x && item.y >= parent.y + parent.headerHeight
        && item.x + item.width <= parent.x + parent.width + 0.01
        && item.y + item.height <= parent.y + parent.height + 0.01,
      `${childId} must remain inside ${parentId}, below its header`);
    }
    assert.equal(afterKeyboard.focusedNode, "architecture-model", "Keyboard movement must retain component focus");
    assert.deepEqual(afterKeyboard.camera, beforeKeyboard.camera, "Keyboard movement must preserve the installed camera");
    assert.equal(afterKeyboard.panelText, beforeKeyboard.panelText, "Keyboard movement must preserve the inspected details");
    assert.deepEqual(afterKeyboard.nodes.filter((node) => node.selected).map((node) => node.id), ["architecture-model"]);
  }

  async fitAndResetLayout(): Promise<InstalledReset> {
    await this.session().$("#baseline-details-control").click();
    await this.session().$('[role="region"][aria-label="Components"] button[data-record-id="workspace"]').click();
    const [record] = await this.session().$$('[role="region"][aria-label="Owned interfaces"] button');
    assert.ok(record);
    const recordId = await record.getAttribute("data-record-id");
    assert.ok(recordId);
    await record.click();
    await waitFor(async () => (await this.diagramState()).panelTitle === "Interface details",
      "The installed panel must inspect an interface before fitting or resetting");
    const beforeFit = await this.diagramState();
    await this.session().$('button[aria-label="Fit View"]').click();
    await waitFor(async () => (await this.diagramState()).camera.zoom < 1,
      "Fit view must show the full installed drawing at a smaller scale");
    const afterFit = await this.diagramState();
    const reset = this.session().$('button[aria-label="Reset layout"]');
    assert.equal(await reset.isExisting(), true, "The installed viewer must expose Reset layout");
    assert.equal(await reset.isDisplayed(), true, "Reset layout must be visible");
    assert.equal(await reset.isEnabled(), true, "Reset layout must be enabled");
    await reset.click();
    await waitFor(async () => (await this.diagramState()).camera.zoom === 1,
      "Reset layout must return the installed drawing to 100 percent zoom");
    const afterReset = await this.diagramState();
    for (const [title, entry] of [["Component details", recordId], ["Baseline details", "workspace"]]) {
      await this.session().$('button[aria-label="Back"]').click();
      await waitFor(async () => {
        const state = await this.diagramState();
        return state.panelTitle === title && state.focusedRecord === entry;
      }, "Back after Reset must restore the installed inspection list and its focused entry");
    }
    const result = { beforeFit, afterFit, afterReset, afterBack: await this.diagramState() };
    await this.world.attach(JSON.stringify(result), "application/json");
    return result;
  }

  expectLayoutReset({ initial, afterKeyboard }: InstalledMovement, { beforeFit, afterFit, afterReset, afterBack }: InstalledReset): void {
    for (const [before, after] of [[afterKeyboard, beforeFit], [beforeFit, afterFit], [initial, afterReset], [afterReset, afterBack]] as const) {
      for (const node of before.nodes) {
        const current = diagramNode(after, node.id);
        for (const field of ["x", "y", "width", "height"] as const) {
          expectNear(current[field], node[field], `Layout controls must preserve or restore ${node.id} ${field}`);
        }
      }
    }
    for (const node of afterFit.nodes) {
      const { x, y, zoom } = afterFit.camera;
      assert.ok(node.x * zoom + x >= -0.01 && node.y * zoom + y >= -0.01
        && (node.x + node.width) * zoom + x <= afterFit.canvas.width + 0.01
        && (node.y + node.height) * zoom + y <= afterFit.canvas.height + 0.01,
      `Fit view must contain ${node.id} in the installed canvas beside the panel`);
    }
    for (const state of [afterFit, afterReset]) {
      assert.equal(state.panelText, beforeFit.panelText, "Layout controls must preserve the inspected interface");
      assert.equal(state.panelModal, "false");
    }
    const root = diagramNode(afterReset, "choom");
    const { width, height } = afterReset.canvas;
    const fits = root.width + 48 <= width && root.height + 48 <= height;
    assert.equal(afterReset.camera.zoom, 1);
    expectNear(afterReset.camera.x + root.x, fits ? (width - root.width) / 2 : 24,
      "Reset must use the normal horizontal starting view in the current canvas");
    expectNear(afterReset.camera.y + root.y, fits ? (height - root.height) / 2 : 24,
      "Reset must use the normal vertical starting view in the current canvas");
    assert.deepEqual(afterBack.camera, afterReset.camera, "Back after Reset must preserve the installed camera");
  }

  async inspectEveryRule(rules: ReadonlyArray<readonly [string, string]>): Promise<void> {
    await this.session().$("button[aria-label='Rules']").click();
    await waitFor(async () => (await this.session().$$('[role="dialog"] details')).length === rules.length,
      "The installed Rules panel must show every recorded rule");
    for (const [index, [id, name]] of rules.entries()) {
      const rows = await this.session().$$('[role="dialog"] details');
      const row = rows[index];
      assert.ok(row);
      const summary = row.$("summary");
      assert.ok((await summary.getText()).includes(id));
      assert.ok((await summary.getText()).includes(name));
      await summary.click();
      await waitFor(async () => this.session().execute((position, ruleId) => {
        const row = document.querySelectorAll<HTMLDetailsElement>('[role="dialog"] details')[position];
        return row?.open === true
          && row.querySelector('[role="group"][aria-label="Rule ID"]')?.textContent?.includes(ruleId) === true
          && ["Subject", "Expected", "Check"].every((name) => row.querySelector(`[role="group"][aria-label="${name}"]`));
      }, index, id), `The installed viewer must expand rule ${id} with its recorded fields`);
      await summary.click();
    }
    await this.session().$('button[aria-label="Close details"]').click();
    await waitFor(async () => !(await this.session().$('[role="dialog"]').isExisting()),
      "The installed Rules panel must close");
  }

  async inspectAndArrangeArcs() { return inspectAndArrangeInstalledArcs(this.session(), this.world); }

  async inspectArcOpens(files: { baseline: string; invalid: string }) {
    return inspectInstalledArcOpens(this.session(), this, files, this.world);
  }

  async expectUnknownConsumers(): Promise<void> { await expectInstalledUnknownConsumers(this.session()); }

  async view() {
    return this.session().execute(() => {
      const visibleText = (node: HTMLElement) => node.getClientRects().length > 0 && getComputedStyle(node).visibility === "visible"
        ? node.innerText.trim() : "";
      return {
        headings: Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3"), visibleText),
        nodes: Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"),
          (node) => ({ id: node.getAttribute("data-id") ?? "", text: visibleText(node) })),
        edges: Array.from(document.querySelectorAll(".react-flow__edge"), (edge) => ({
          label: edge.getAttribute("aria-label"), arrow: Boolean(edge.querySelector(".react-flow__edge-path[marker-end]")),
        })),
        buttons: Array.from(document.querySelectorAll<HTMLButtonElement>("button"), (node) => node.innerText.trim()),
        alerts: Array.from(document.querySelectorAll<HTMLElement>('[role="alert"]'), visibleText),
        statuses: Array.from(document.querySelectorAll<HTMLElement>('[role="status"]'), visibleText),
      };
    });
  }

  async requestRetiredCommand(command: string): Promise<
    { status: "resolved"; value: unknown } | { status: "rejected"; message: string }
  > {
    return this.session().execute(async (name) => {
      const tauri = Reflect.get(window, "__TAURI_INTERNALS__") as {
        invoke(command: string, args: { request: unknown }): Promise<unknown>;
      };
      if (typeof tauri?.invoke !== "function") throw new Error("The real Tauri transport is missing");
      try {
        return { status: "resolved" as const, value: await tauri.invoke(name, { request: { retirementProbe: true } }) };
      } catch (reason) {
        return { status: "rejected" as const, message: typeof reason === "string" ? reason : JSON.stringify(reason) };
      }
    }, command);
  }

  async close(): Promise<void> {
    const browser = this.browser;
    if (!browser) return;
    try {
      const prefix = join(environment("CHOOM_PACKAGED_EVIDENCE_DIR"), randomUUID());
      const image = Buffer.from(await browser.takeScreenshot(), "base64");
      await writeFile(`${prefix}.png`, image);
      await writeFile(`${prefix}.html`, await browser.getPageSource());
      await this.world.attach(image, "image/png");
    } finally {
      this.browser = undefined;
      this.processId = undefined;
      await browser.deleteSession();
    }
  }
}
