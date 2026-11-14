import assert from "node:assert/strict";
import { expect, type Locator, type Page } from "@playwright/test";
import type { BaselineV3 } from "../../../src/domain/generated/contracts.ts";
import { readRenderedDrawing, readSignatureSourceMetadata, type SignatureReading } from "../interface-documentation-reading.ts";
import { readSourceUseOverview, type SourceConsumerReading } from "../source-consumer-reading.ts";
import { openPublishedInterface } from "./published-interface-browser.ts";

const panel = (page: Page) => page.getByRole("dialog", { name: "Interface details", exact: true });
const tab = (page: Page, name: string) => panel(page).getByRole("tab", { name, exact: true });
async function reveal(detail: Locator) {
  if (await detail.getAttribute("open") === null) await detail.locator(":scope > summary").click();
  await expect(detail).toHaveAttribute("open");
  await expect(detail.locator(":scope > :not(summary)").first()).toBeVisible();
}

/** Follow the normal reading controls, retaining observed text for common browser/installed checks. */
export async function readSourceConsumerInterfaces(page: Page, baseline: BaselineV3) {
  const first = baseline.interfaces[0];
  assert.ok(first);
  await openPublishedInterface(page, first);
  const before = await page.evaluate(readRenderedDrawing);
  const readings: SourceConsumerReading[] = [];
  for (const item of baseline.interfaces) {
    await openPublishedInterface(page, item);
    const overview = panel(page).getByRole("tabpanel", { name: "Overview", exact: true });
    const others = overview.locator('details[data-section="other-source-references"]');
    if (await others.count()) await reveal(others);
    const callers = overview.locator('details[data-section^="source-use-caller-"]');
    for (const caller of await callers.all()) await reveal(caller);
    const observed = await page.evaluate(readSourceUseOverview);
    const access = overview.locator('details[data-section="interface-access-rule"]');
    await reveal(access);
    const reading: SourceConsumerReading = { interfaceId: item.id, ...observed,
      access: await access.innerText(), sourceReview: "", sourceRecord: null, original: null, entries: [] };
    await tab(page, "Sources").click();
    const sources = panel(page).getByRole("tabpanel", { name: "Sources", exact: true });
    const review = sources.getByRole("region", { name: "Source-use review", exact: true });
    for (const detail of await review.locator('details[data-section^="source-note-uses-"]').all()) await reveal(detail);
    reading.sourceReview = await review.innerText();
    for (const [section, field] of [["original-source-assessment", "sourceRecord"], ["original-interface-record", "original"]] as const) {
      const detail = sources.locator(`details[data-section="${section}"]`);
      await reveal(detail);
      reading[field] = JSON.parse(await detail.locator("pre").innerText());
    }
    for (const name of ["interface-statements", "interface-evidence"]) await reveal(sources.locator(`details[data-section="${name}"]`));
    for (const entry of item.documentation?.entries ?? []) {
      await tab(page, "Overview").click();
      await overview.getByRole("button", { name: `${entry.name}, ${entry.id}`, exact: true }).click();
      assert.deepEqual((await page.evaluate(readSourceUseOverview)).rows.map(({ id }) => id), observed.rows.map(({ id }) => id),
        "Choosing an entry must retain the interface-wide use list");
      const group = overview.getByRole("group", { name: "Signature", exact: true });
      const signature: SignatureReading = { state: await group.count() ? await group.innerText() : null,
        literal: await group.locator("pre").count() ? await group.locator("pre").textContent() : null,
        statement: null, references: [] };
      await tab(page, "Sources").click();
      Object.assign(signature, await page.evaluate(readSignatureSourceMetadata, `${item.id}.documentation.entries.${entry.id}.signature`));
      await tab(page, "Example").click();
      const examples = panel(page).getByRole("tabpanel", { name: "Example", exact: true });
      const shown: SourceConsumerReading["entries"][number] = { id: entry.id, signature, examples: [] };
      if (!entry.examples.length) await expect(examples).toContainText("No example recorded for this entry.");
      for (const example of entry.examples) {
        await examples.getByRole("button", { name: `${example.name}, ${example.id}`, exact: true }).click();
        shown.examples.push({ id: example.id, sample: await examples.getByRole("group", { name: "Example", exact: true }).locator("pre").textContent() ?? "",
          text: await examples.innerText() });
      }
      reading.entries.push(shown);
    }
    readings.push(reading);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("region", { name: "Interfaces", exact: true })).toBeVisible();
  }
  await openPublishedInterface(page, first);
  return { before, after: await page.evaluate(readRenderedDrawing), readings };
}
