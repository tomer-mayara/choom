import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { World } from "@cucumber/cucumber";
import type { Browser } from "webdriverio";

export async function captureInstalledView(browser: Browser, world: World, evidenceDirectory: string, label: string): Promise<void> {
  const prefix = join(evidenceDirectory, `${label}-${randomUUID()}`);
  const image = Buffer.from(await browser.takeScreenshot(), "base64");
  await writeFile(`${prefix}.png`, image);
  await writeFile(`${prefix}.html`, await browser.getPageSource());
  await world.attach(image, "image/png");
}

export async function readInstalledView(browser: Browser) {
  return browser.execute(() => {
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
