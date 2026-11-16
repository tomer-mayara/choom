import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { expect, type Page } from "@playwright/test";

/** A view that still changes after this time has not settled. */
const settleTimeoutMs = 2_000;

export interface BaselineOpeningView {
  headings: string[];
  nodes: Array<{ id: string; text: string }>;
  buttons: string[];
}

/** Use the shipped app and its real browser file input. */
export class BaselineBrowserDriver {
  private readonly page: Page;

  constructor(page: Page) { this.page = page; }

  async open(controlled = false): Promise<void> {
    const url = controlled ? process.env.CHOOM_CONTROLLED_URL : process.env.CHOOM_BASE_URL;
    assert.ok(url, "The browser runner must supply its production-preview URL.");
    await this.page.goto(url);
    await expect(this.page.getByRole("navigation", { name: "Workspace actions" })).toBeVisible();
    assert.equal(await this.page.evaluate(() => "__TAURI_INTERNALS__" in window), false,
      "The browser viewer must use its actual file input without a native transport double.");
  }

  async openBaseline(path: string): Promise<void> {
    const action = this.page.getByRole("button", { name: "Open Baseline", exact: true });
    assert.equal(await action.count(), 1,
      "The loaded application must expose Open Baseline before the user can select a baseline file.");
    await expect(action).toBeVisible();
    await expect(action).toBeEnabled();
    const chooser = this.page.waitForEvent("filechooser");
    await action.click();
    await (await chooser).setFiles(path);
  }

  async view(): Promise<BaselineOpeningView> {
    return this.page.evaluate(() => ({
      headings: Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3"), (node) => node.innerText.trim()),
      nodes: Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"),
        (node) => ({ id: node.getAttribute("data-id") ?? "", text: node.innerText })),
      buttons: Array.from(document.querySelectorAll<HTMLButtonElement>("button"), (node) => node.innerText.trim()),
    }));
  }

  /**
   * Read the value again after each new animation frame, and return it when two readings are equal.
   * Some browser work ends only in the next frame, for example a scroll that keyboard focus causes.
   */
  async readSettled<T>(read: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + settleTimeoutMs;
    let previous = await this.readAfterPaint(read);
    while (Date.now() < deadline) {
      const current = await this.readAfterPaint(read);
      if (isDeepStrictEqual(current, previous)) return current;
      previous = current;
    }
    assert.fail(`The browser view must stay the same across animation frames within ${settleTimeoutMs} ms.`);
  }

  private async readAfterPaint<T>(read: () => Promise<T>): Promise<T> {
    await this.page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    return read();
  }
}
