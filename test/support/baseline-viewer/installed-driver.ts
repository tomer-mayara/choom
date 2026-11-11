import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import type { World } from "@cucumber/cucumber";
import { remote, type Browser } from "webdriverio";

const run = promisify(execFile);

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
      await xdo(["key", "--clearmodifiers", "ctrl+l", "ctrl+a"]);
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

  async view() {
    return this.session().execute(() => {
      const visibleText = (node: HTMLElement) => node.getClientRects().length > 0 && getComputedStyle(node).visibility === "visible"
        ? node.innerText.trim() : "";
      return {
        headings: Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3"), visibleText),
        nodes: Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"),
          (node) => ({ id: node.getAttribute("data-id") ?? "", text: visibleText(node) })),
        buttons: Array.from(document.querySelectorAll<HTMLButtonElement>("button"), (node) => node.innerText.trim()),
        alerts: Array.from(document.querySelectorAll<HTMLElement>('[role="alert"]'), visibleText),
        statuses: Array.from(document.querySelectorAll<HTMLElement>('[role="status"]'), visibleText),
      };
    });
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
