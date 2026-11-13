import { parseInterfaceRecord } from "./interface-record.ts";
import { expect, type Locator } from "@playwright/test";

export async function originalInterfaceRecord(panel: Locator): Promise<Record<string, unknown>> {
  const sources = panel.getByRole("tab", { name: "Sources", exact: true });
  if (await sources.getAttribute("aria-selected") !== "true") await sources.click();
  const disclosure = panel.locator("details[data-section='original-interface-record']");
  if (await disclosure.getAttribute("open") === null) await disclosure.locator("summary").click();
  const text = disclosure.locator("pre");
  await expect(text).toBeVisible();
  return parseInterfaceRecord(await text.textContent() ?? "null");
}
