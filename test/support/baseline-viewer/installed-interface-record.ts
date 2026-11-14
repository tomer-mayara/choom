import assert from "node:assert/strict";
import type { Browser } from "webdriverio";
import { parseInterfaceRecord } from "../interface-record.ts";

export async function readInstalledInterfaceRecord(browser: Browser): Promise<Record<string, unknown>> {
  await browser.$('//button[@role="tab" and normalize-space(.)="Sources"]').click();
  const disclosure = browser.$("details[data-section='original-interface-record']");
  const summary = disclosure.$("summary");
  await summary.waitForDisplayed();
  if (await disclosure.getAttribute("open") === null) await summary.click();
  const record = disclosure.$("pre");
  await record.waitForDisplayed();
  return parseInterfaceRecord(await record.getText());
}


export function expectInstalledInterfaceRecord(record: Record<string, unknown>, id: string, owner: { value: string | null; status?: string }) {
  assert.equal(record.id, id);
  const ownership = record.owner;
  assert.ok(ownership && typeof ownership === "object" && "value" in ownership && "status" in ownership);
  assert.equal(ownership.value, owner.value);
  if (owner.status) assert.equal(ownership.status, owner.status);
  for (const field of ["publicAccess", "allowedConsumers", "promises"]) assert.ok(Object.hasOwn(record, field));
}
