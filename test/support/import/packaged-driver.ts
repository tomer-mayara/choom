import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { remote, type Browser } from "webdriverio";
import { parseDocument } from "yaml";
import type {
  CancelDepCruiserOutcome, CloseRepositoryOutcome, CloseRepositoryRequest,
  DepCruiserExecutionOutcome, DepCruiserJob, OpenRepositoryOutcome, OpenRepositoryRequest,
  PrepareDepCruiserOutcome, PrepareDepCruiserRequest, ReadRepositoryTextOutcome,
  ReadRepositoryTextRequest, ReleaseDepCruiserOutcome,
} from "../../../src/platform/generated/contracts.ts";
import type { ImportDriver, ImportView, ImportWorld } from "./world.ts";

const run = promisify(execFile);
const capabilityTimeout = 1_500;

type InstalledRequests = {
  repository_open: [OpenRepositoryRequest, OpenRepositoryOutcome];
  repository_close: [CloseRepositoryRequest, CloseRepositoryOutcome];
  depcruiser_prepare: [PrepareDepCruiserRequest, PrepareDepCruiserOutcome];
  depcruiser_run: [DepCruiserJob, DepCruiserExecutionOutcome];
  depcruiser_release: [DepCruiserJob, ReleaseDepCruiserOutcome];
};

type InstalledInvoke = <Result>(command: string, args: { request: object }) => Promise<Result>;
type InstalledIpc = { invoke: InstalledInvoke };

async function waitFor(check: () => Promise<boolean>, message: string, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error(message);
}

function environment(name: string): string {
  const value = process.env[name];
  assert.ok(value, `${name} is missing; use bun run test:behavior:packaged`);
  return value;
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

function completeSavedYaml(bytes: string): boolean {
  const document = parseDocument(bytes);
  if (document.errors.length || document.warnings.length) return false;
  const value: unknown = document.toJSON();
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return fields.schemaVersion === 1 && typeof fields.name === "string" && fields.name.length > 0
    && fields.analysis !== null && typeof fields.analysis === "object" && !Array.isArray(fields.analysis)
    && Array.isArray(fields.components) && Array.isArray(fields.relationships) && Array.isArray(fields.diagnostics);
}

export class PackagedImportDriver implements ImportDriver {
  private browser?: Browser;
  private processId?: string;
  private readonly world: ImportWorld;

  constructor(world: ImportWorld) { this.world = world; }

  private session(): Browser {
    assert.ok(this.browser, "The installed application must be open");
    return this.browser;
  }

  async open(): Promise<void> {
    if (this.browser) return;
    try {
      const capabilities: Parameters<typeof remote>[0]["capabilities"] & {
        "tauri:options": { application: string };
      } = { "tauri:options": { application: environment("CHOOM_PACKAGED_APP") } };
      this.browser = await remote({
        hostname: "127.0.0.1",
        port: Number(environment("CHOOM_PACKAGED_DRIVER_PORT")),
        path: "/",
        logLevel: "error",
        connectionRetryCount: 0,
        connectionRetryTimeout: 20_000,
        capabilities,
      });
      await waitFor(async () => (await this.session().$("body").getText()).trim().length > 0,
        "The installed application did not display its document", 20_000);
      await this.findApplicationProcess();
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
      const windows = await xdo(["search", "--onlyvisible", "--name", "^Choom$"], true);
      for (const window of windows) {
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

  private button(action: string) {
    const names = action === "Export Diagram" ? ["Export", action]
      : action === "Choose repository" ? ["Choose directory", action] : [action];
    return this.session().$(`//button[${names.map((name) => `normalize-space(.)='${name}'`).join(" or ")}]`);
  }

  private async visibleAction(action: string): Promise<void> {
    await waitFor(async () => {
      const button = this.button(action);
      return await button.isExisting() && await button.isDisplayed();
    }, `Required installed-app action "${action}" is absent or hidden`, capabilityTimeout);
  }

  private async activate(action: string): Promise<void> {
    await this.visibleAction(action);
    const button = this.button(action);
    assert.equal(await button.isEnabled(), true, `Installed-app action "${action}" must be enabled`);
    await button.click();
  }

  private async applicationWindows(): Promise<string[]> {
    assert.ok(this.processId);
    return xdo(["search", "--onlyvisible", "--pid", this.processId], true);
  }

  private async choosePath(action: string, path: string | null): Promise<void> {
    const previous = new Set(await this.applicationWindows());
    await this.activate(action);
    let dialog = "";
    await waitFor(async () => {
      const candidates = (await this.applicationWindows()).filter((id) => !previous.has(id));
      assert.ok(candidates.length <= 1, "More than one native dialog appeared for the installed app");
      dialog = candidates[0] ?? "";
      return Boolean(dialog);
    }, `The installed-app action "${action}" did not open a native GTK picker`);
    await xdo(["windowfocus", "--sync", dialog]);
    if (path === null) {
      await xdo(["key", "--clearmodifiers", "Escape"]);
    } else {
      await xdo(["key", "--clearmodifiers", "ctrl+l"]);
      await xdo(["type", "--clearmodifiers", "--delay", "1", path]);
      await xdo(["key", "--clearmodifiers", "Return"]);
    }
    await waitFor(async () => !(await this.applicationWindows()).includes(dialog),
      `The native GTK picker did not close after ${path === null ? "cancellation" : "path selection"}`);
  }

  async selectRepository(path: string | null): Promise<void> {
    await this.open();
    await this.choosePath("Choose repository", path);
  }

  async loadRepository(path: string): Promise<void> {
    await this.open();
    await this.choosePath("Load Repo", path);
  }

  async openDocument(path: string): Promise<void> {
    await this.open();
    await this.choosePath("Open Diagram", path);
  }

  async cancel(): Promise<void> {
    await this.open();
    await this.activate("Cancel");
  }

  async invokeNative<Name extends keyof InstalledRequests>(
    command: Name, request: InstalledRequests[Name][0],
  ): Promise<InstalledRequests[Name][1]> {
    await this.open();
    const name: string = command;
    const payload: object = request;
    return this.session().execute(async (name, payload) => {
      const tauri = Reflect.get(window, "__TAURI_INTERNALS__") as InstalledIpc;
      return tauri.invoke<InstalledRequests[Name][1]>(name, { request: payload });
    }, name, payload);
  }

  async cancelNativeAnalysis(job: DepCruiserJob, marker: ReadRepositoryTextRequest) {
    return this.session().execute(async (request, readiness) => {
      const tauri = Reflect.get(window, "__TAURI_INTERNALS__") as InstalledIpc;
      let settled = false;
      const pending = tauri.invoke<DepCruiserExecutionOutcome>("depcruiser_run", { request }).then(
        (outcome) => { settled = true; return outcome; },
        () => { settled = true; return undefined; },
      );
      const deadline = Date.now() + 10_000;
      let ready = false;
      while (!settled && Date.now() < deadline) {
        const result = await tauri.invoke<ReadRepositoryTextOutcome>("repository_read_text", { request: readiness });
        if (result.status === "success" && result.value.text.endsWith("}")) {
          ready = true;
          break;
        }
        await new Promise((done) => setTimeout(done, 50));
      }
      const cancellation = await tauri.invoke<CancelDepCruiserOutcome>("depcruiser_cancel", { request });
      return { ready, cancellation, outcome: await pending };
    }, job, marker);
  }

  async exportDocument(path: string): Promise<string> {
    await this.open();
    const exists = await lstat(path).then(() => true, (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    });
    assert.equal(exists, false, "Native export acceptance requires a new destination; replacement belongs to the simulated file-operation cases");
    await this.choosePath("Export Diagram", path);
    let previousBytes: string | undefined;
    let lastChanged = Date.now();
    await waitFor(async () => {
      try {
        const bytes = await readFile(path, "utf8");
        if (bytes !== previousBytes) { previousBytes = bytes; lastChanged = Date.now(); }
        return Date.now() - lastChanged >= 250 && completeSavedYaml(bytes);
      }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
        throw error;
      }
    }, "The installed application did not finish writing readable version 1 YAML to the new export destination");
    return path;
  }

  async actionEnabled(action: "Load Repo" | "Open Diagram" | "Export Diagram"): Promise<boolean> {
    await this.open();
    await this.visibleAction(action);
    return this.button(action).isEnabled();
  }

  async view(): Promise<ImportView> {
    await this.open();
    const browser = this.session();
    const cards = await browser.$$(".react-flow__node[data-id]");
    const componentCards: { id: string; text: string }[] = [];
    for (const card of cards) {
      componentCards.push({ id: await card.getAttribute("data-id") ?? "", text: await card.getText() });
    }
    const componentIds = componentCards.map((card) => card.id);
    const edges: ImportView["edges"] = [];
    for (const edge of await browser.$$(".react-flow__edge[aria-label]")) {
      const label = await edge.getAttribute("aria-label");
      const endpoints = /^Edge from (.+) to (.+)$/.exec(label ?? "");
      edges.push({ source: endpoints?.[1] ?? "", target: endpoints?.[2] ?? "" });
    }
    const alerts: string[] = [];
    for (const alert of await browser.$$('[role="alert"]')) alerts.push(await alert.getText());
    const statuses: string[] = [];
    for (const status of await browser.$$('[role="status"]')) statuses.push(await status.getText());
    return { componentIds, componentCards, edges, text: await browser.$("body").getText(), alerts, statuses };
  }

  async close(): Promise<void> {
    const browser = this.browser;
    if (!browser) return;
    try {
      const prefix = join(environment("CHOOM_PACKAGED_EVIDENCE_DIR"), randomUUID());
      const image = await browser.takeScreenshot();
      await writeFile(`${prefix}.png`, Buffer.from(image, "base64"));
      await writeFile(`${prefix}.html`, await browser.getPageSource());
      await this.world.attach(Buffer.from(image, "base64"), "image/png");
    } catch (error) {
      await this.world.attach(`Packaged diagnostic capture failed: ${String(error)}`, "text/plain");
    } finally {
      this.browser = undefined;
      this.processId = undefined;
      await browser.deleteSession();
    }
  }
}
