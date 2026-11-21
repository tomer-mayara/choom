import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, readlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { waitFor } from "./installed-view.ts";

const run = promisify(execFile);

export function environment(name: string): string {
  const value = process.env[name];
  assert.ok(value, `${name} is missing; use bun run test:behavior:packaged`);
  return value;
}

export async function xdo(args: string[], allowNoMatch = false): Promise<string[]> {
  try {
    const result = await run(environment("CHOOM_XDOTOOL"), args, { timeout: 5_000, maxBuffer: 256 * 1024 });
    return result.stdout.trim().split("\n").filter(Boolean);
  } catch (error) {
    if (allowNoMatch && error instanceof Error && "code" in error && error.code === 1) return [];
    throw error;
  }
}

/** Match native windows and teardown to the executable launched by this WebDriver session. */
export class InstalledX11Application {
  readonly executable = environment("CHOOM_PACKAGED_APP");
  readonly sessionArgument = `--choom-test-session=${randomUUID()}`;
  private processId?: string;

  private async owns(pid: string): Promise<boolean> {
    try {
      if (await readlink(`/proc/${pid}/exe`) !== this.executable) return false;
      const args = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0");
      return args.includes(this.sessionArgument);
    } catch (error) {
      if (error instanceof Error && "code" in error && ["EACCES", "ENOENT", "ESRCH"].includes(String(error.code))) return false;
      throw error;
    }
  }

  async findVisibleProcess(): Promise<string> {
    await waitFor(async () => {
      for (const window of await xdo(["search", "--onlyvisible", "--name", "^Choom$"], true)) {
        const [pid] = await xdo(["getwindowpid", window]);
        if (pid && await this.owns(pid)) {
          this.processId = pid;
          return true;
        }
      }
      return false;
    }, "No visible Choom X11 window belongs to this installed WebDriver session");
    assert.ok(this.processId);
    return this.processId;
  }

  async windows(): Promise<string[]> {
    assert.ok(this.processId);
    return xdo(["search", "--onlyvisible", "--pid", this.processId], true);
  }

  private async signal(pid: string, signal: NodeJS.Signals): Promise<void> {
    if (!await this.owns(pid)) return;
    try { process.kill(Number(pid), signal); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error; }
  }

  async stop(): Promise<void> {
    // Startup can fail after WebKit launches the process and before its first visible window.
    const candidates = this.processId ? [this.processId] : (await readdir("/proc")).filter((name) => /^\d+$/.test(name));
    for (const pid of candidates) {
      if (!await this.owns(pid)) continue;
      await this.signal(pid, "SIGTERM");
      await delay(100);
      await this.signal(pid, "SIGKILL");
      await waitFor(async () => !await this.owns(pid), "The installed application did not exit after its session closed");
    }
  }
}
