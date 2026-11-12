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
