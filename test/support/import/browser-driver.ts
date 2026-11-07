import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { fixture, type ImportDriver, type ImportView, type ImportWorld } from "./world.ts";

const capabilityTimeout = 1_500;

export class BrowserImportDriver implements ImportDriver {
  private opened = false;
  private pickerResults: (string | null)[] = [];
  private saveResults: (string | null)[] = [];
  private holdExport = false;
  private heldSave?: { path: string; resolve: (path: string) => void };
  private readonly world: ImportWorld;

  constructor(world: ImportWorld) { this.world = world; }

  private page(): Page {
    assert.ok(this.world.page, "The browser route must supply a Playwright page");
    return this.world.page;
  }

  private dialog(command: string): string | null | Promise<string> {
    if (command === "plugin:dialog|open") {
      assert.ok(this.pickerResults.length, "The open dialog must consume a selected path or cancellation");
      return this.pickerResults.shift() ?? null;
    }
    assert.equal(command, "plugin:dialog|save", "T01 doubles only the vendor open/save dialog commands; generated Choom transport is not bound yet");
    assert.ok(this.saveResults.length, "The save dialog must consume a selected path or cancellation");
    const path = this.saveResults.shift() ?? null;
    const controls = fixture(this.world).controls;
    if (path === null) {
      controls.observe("save-dialog-cancelled", "The actual Tauri save invocation returned null");
      return null;
    }
    if (controls.isRequired("save-replacement-approved")) controls.observe("save-replacement-approved", "The actual Tauri save invocation returned the approved destination");
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
      await page.exposeFunction("__choomImportDialog", (command: string) => this.dialog(command));
      await page.addInitScript(() => {
        const host = globalThis as typeof globalThis & { __choomImportDialog: (command: string) => Promise<string | null> };
        Object.defineProperty(host, "isTauri", { value: true });
        Object.defineProperty(host, "__TAURI_INTERNALS__", {
          value: { invoke: (command: string) => host.__choomImportDialog(command) },
        });
      });
    }
    await page.goto(process.env.CHOOM_BASE_URL ?? "http://127.0.0.1:1420");
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
    await this.activate("Cancel");
  }

  async exportDocument(path: string): Promise<string> {
    await this.open();
    await expect(this.page().getByRole("button", { name: /^Export(?: Diagram)?$/ })).toBeVisible({ timeout: capabilityTimeout });
    if (this.world.desktopImport) {
      const previous = await this.exportBytes(path);
      this.saveResults.push(path);
      await this.activate("Export Diagram");
      await expect.poll(() => this.saveResults.length).toBe(0);
      await expect.poll(async () => {
        const bytes = await this.exportBytes(path);
        return bytes !== undefined && bytes.length > 0 && bytes !== previous;
      }, { timeout: 25_000, message: "Export must finish writing new bytes to the chosen destination" }).toBe(true);
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
    const controls = fixture(this.world).controls;
    controls.require("save-dialog-cancelled");
    this.saveResults.push(null);
    await this.activate("Export Diagram");
    await expect.poll(() => controls.wasObserved("save-dialog-cancelled")).toBe(true);
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
