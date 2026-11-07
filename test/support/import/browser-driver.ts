import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { BrowserImportTransport } from "./browser-transport.ts";
import { fixture, type ImportDriver, type ImportView, type ImportWorld } from "./world.ts";

const capabilityTimeout = 1_500;

export class BrowserImportDriver implements ImportDriver {
  private opened = false;
  private pickerResults: (string | null)[] = [];
  private saveResults: (string | null)[] = [];
  private holdExport = false;
  private heldSave?: { path: string; resolve: (path: string) => void };
  private readonly world: ImportWorld;
  private readonly native: BrowserImportTransport;

  constructor(world: ImportWorld) { this.world = world; this.native = new BrowserImportTransport(fixture(world)); }

  private page(): Page {
    assert.ok(this.world.page, "The browser route must supply a Playwright page");
    return this.world.page;
  }

  private dialog(command: string): string | null | Promise<string> {
    if (command === "plugin:dialog|message") {
      const approved = fixture(this.world).facts.replaceApproved === true;
      this.native.controls.observe(approved ? "save-replacement-approved" : "save-replacement-declined", "The actual native replacement confirmation received the scenario's decision");
      return approved ? "Replace" : "Cancel";
    }
    if (command === "plugin:dialog|open") {
      assert.ok(this.pickerResults.length, "The open dialog must consume a selected path or cancellation");
      return this.pickerResults.shift() ?? null;
    }
    assert.equal(command, "plugin:dialog|save", "The UI must call a supported vendor dialog command");
    assert.ok(this.saveResults.length, "The save dialog must consume a selected path or cancellation");
    const path = this.saveResults.shift() ?? null;
    const controls = fixture(this.world).controls;
    if (path === null) {
      controls.observe("save-dialog-cancelled", "The actual Tauri save invocation returned null");
      return null;
    }
    if (!this.holdExport) return path;
    return new Promise((resolve) => {
      this.heldSave = { path, resolve };
      controls.observe("export-save-held", "The actual Tauri save invocation is pending");
    });
  }

  async open(): Promise<void> {
    if (this.opened) return;
    const page = this.page();
    if (this.world.desktopImport) {
      await page.exposeFunction("__choomImportInvoke", (command: string, args: unknown) => command.startsWith("plugin:dialog|")
        ? this.dialog(command) : this.native.invoke(command, args));
      await page.addInitScript(() => {
        const host = globalThis as typeof globalThis & { __choomImportInvoke: (command: string, args: unknown) => Promise<unknown> };
        let callbackId = 0;
        Object.defineProperty(host, "isTauri", { value: true });
        Object.defineProperty(host, "__TAURI_INTERNALS__", {
          value: {
            invoke: (command: string, args: unknown) => host.__choomImportInvoke(command, args),
            transformCallback: () => ++callbackId,
            unregisterCallback: () => {},
          },
        });
      });
    }
    if (this.world.controlledImport) {
      await page.exposeFunction("__choomLayoutControl", (phase: "before" | "completed", name: string) => this.native.controls.layout(phase, name));
      assert.ok(process.env.CHOOM_CONTROLLED_URL, "Controlled layout scenarios need the separate test composition preview");
    }
    await page.goto(this.world.controlledImport ? process.env.CHOOM_CONTROLLED_URL ?? "" : process.env.CHOOM_BASE_URL ?? "http://127.0.0.1:1420");
    this.opened = true;
  }

  private async activate(action: "Load Repo" | "Open Diagram" | "Export Diagram" | "Cancel"): Promise<void> {
    const name = action === "Export Diagram" ? /^Export(?: Diagram)?$/ : action;
    const button = this.page().getByRole("button", { name, exact: true });
    await expect(button).toBeVisible({ timeout: capabilityTimeout });
    await expect(button).toBeEnabled({ timeout: capabilityTimeout });
    if (this.world.keyboardImport) {
      for (let tabs = 0; tabs < 100; tabs += 1) {
        await this.page().keyboard.press("Tab");
        if (await button.evaluate((node) => node === document.activeElement)) break;
      }
      await expect(button, `${action} must be reachable with Tab`).toBeFocused();
      await this.page().keyboard.press("Enter");
    } else {
      await button.click({ timeout: capabilityTimeout });
    }
  }

  async selectRepository(path: string | null): Promise<void> {
    await this.open();
    this.pickerResults.push(path);
    const button = this.page().getByRole("button", { name: /^(Choose directory|Choose repository)$/ });
    await expect(button).toBeEnabled({ timeout: capabilityTimeout });
    await button.click();
    await expect.poll(() => this.pickerResults.length).toBe(0);
  }

  async loadRepository(path: string): Promise<void> {
    await this.open();
    this.pickerResults.push(path);
    await this.activate("Load Repo");
  }

  async openDocument(path: string): Promise<void> {
    await this.open();
    await expect(this.page().getByRole("button", { name: "Open Diagram", exact: true })).toBeVisible({ timeout: capabilityTimeout });
    if (this.world.desktopImport) {
      this.pickerResults.push(path);
      await this.activate("Open Diagram");
      return;
    }
    const chooser = this.page().waitForEvent("filechooser", { timeout: capabilityTimeout });
    const [, fileChooser] = await Promise.all([this.activate("Open Diagram"), chooser]);
    await fileChooser.setFiles(path);
  }

  async cancel(): Promise<void> {
    await this.open();
    const operation = fixture(this.world).facts.holdOperation;
    const gate = operation === "layout" || operation === "Abandoned" ? "layout"
      : operation === "a repository analysis" || operation === "cancellation of a load" ? "analysis" : undefined;
    if (gate) await expect.poll(() => this.native.controls.isHeld(gate)).toBe(true);
    await this.activate("Cancel");
    if (fixture(this.world).controls.isRequired("cancellation-cleanup-completed")) {
      await expect.poll(async () => (await this.view()).statuses.join(" ").toLowerCase()).toContain("cancelled");
      await expect.poll(() => this.native.isIdle()).toBe(true);
      await expect(this.page().getByRole("button", { name: "Load Repo", exact: true })).toBeEnabled();
      this.native.controls.observe("cancellation-cleanup-completed", "Cancellation ended and the native boundary has no pending operation before loading is enabled");
    }
  }

  async releaseLateResult(): Promise<void> {
    await this.native.controls.releaseLateLayout();
    await this.page().evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }

  async retryCleanup(): Promise<void> {
    await this.page().getByRole("button", { name: "Retry cleanup", exact: true }).click();
    await expect.poll(() => fixture(this.world).controls.wasObserved("export-cleanup-recovered")).toBe(true);
  }

  async close(): Promise<void> {
    if (this.heldSave) this.heldSave.resolve(this.heldSave.path);
    await this.native.close();
  }

  assertValidCalls(): void { this.native.assertValidCalls(); }

  async exportDocument(path: string): Promise<string> {
    await this.open();
    await expect(this.page().getByRole("button", { name: /^Export(?: Diagram)?$/ })).toBeVisible({ timeout: capabilityTimeout });
    if (this.world.desktopImport) {
      const previous = await this.exportBytes(path);
      const failures = this.native.exportFailureCount();
      this.saveResults.push(path);
      await this.activate("Export Diagram");
      await expect.poll(() => this.saveResults.length).toBe(0);
      await expect.poll(async () => {
        const bytes = await this.exportBytes(path);
        return (bytes !== undefined && bytes.length > 0 && bytes !== previous) || this.native.exportFailureCount() > failures;
      }, { timeout: 25_000, message: "Export must finish writing new bytes to the chosen destination" }).toBe(true);
      if (this.native.exportFailureCount() > failures) throw new Error("The native export returned a failure.");
      const controls = fixture(this.world).controls;
      if (controls.isRequired("export-written")) controls.observe("export-written", "New nonempty bytes were read from the selected export destination");
      return path;
    }
    const download = this.page().waitForEvent("download", { timeout: capabilityTimeout });
    const [, result] = await Promise.all([this.activate("Export Diagram"), download]);
    await result.saveAs(path);
    return path;
  }

  private async exportBytes(path: string): Promise<string | undefined> {
    try { return await readFile(path, "utf8"); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async cancelExport(): Promise<void> {
    await this.open();
    assert.ok(this.world.desktopImport, "Save-dialog cancellation uses the desktop dialog route");
    const input = fixture(this.world);
    const controls = input.controls;
    controls.require("save-replacement-declined");
    this.saveResults.push(input.destination);
    await this.activate("Export Diagram");
    await expect.poll(() => controls.wasObserved("save-replacement-declined")).toBe(true);
  }

  holdNextExport(): void {
    assert.ok(this.world.desktopImport);
    this.holdExport = true;
    for (const event of ["export-save-held", "export-save-released", "export-written"]) fixture(this.world).controls.require(event);
  }

  releaseExport(): void {
    assert.ok(this.heldSave, "The running product must have requested the held save dialog");
    fixture(this.world).controls.observe("export-save-released", "The pending Tauri save invocation was resolved with its selected destination");
    this.heldSave.resolve(this.heldSave.path);
    this.heldSave = undefined;
    this.holdExport = false;
  }

  async actionEnabled(action: "Load Repo" | "Open Diagram" | "Export Diagram"): Promise<boolean> {
    await this.open();
    const name = action === "Export Diagram" ? /^Export(?: Diagram)?$/ : action;
    const button = this.page().getByRole("button", { name, exact: true });
    await expect(button).toBeVisible({ timeout: capabilityTimeout });
    return button.isEnabled();
  }

  async view(): Promise<ImportView> {
    return this.page().evaluate(() => {
      const componentCards = [...document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")].map((node) => ({ id: node.getAttribute("data-id") ?? "", text: node.innerText }));
      const componentIds = componentCards.map((card) => card.id);
      const edges = [...document.querySelectorAll(".react-flow__edge[aria-label]")].map((edge) => {
        const match = /^Edge from (.+) to (.+)$/.exec(edge.getAttribute("aria-label") ?? "");
        return { source: match?.[1] ?? "", target: match?.[2] ?? "" };
      });
      const texts = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].map((node) => node.innerText);
      return { componentIds, componentCards, edges, text: document.body.innerText, alerts: texts('[role="alert"]'), statuses: texts('[role="status"]') };
    });
  }
}
