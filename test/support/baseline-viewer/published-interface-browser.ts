import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";
import type { Baseline, BaselineDocumentedEntry, BaselineInterface } from "../../../src/domain/generated/contracts.ts";
import { publishedReadingEntries, readRenderedDrawing, readSignatureSourceMetadata, type PublishedReading, type ReadingDrawing, type SignatureReading } from "../interface-documentation-reading.ts";

const interfacePanel = (page: Page) => page.getByRole("dialog", { name: "Interface details", exact: true });
const tab = (page: Page, name: string) => interfacePanel(page).getByRole("tab", { name, exact: true });

export async function openPublishedInterface(page: Page, item: BaselineInterface): Promise<void> {
  await page.getByRole("button", { name: "Baseline details", exact: true }).click();
  await page.getByRole("region", { name: "Interfaces", exact: true })
    .getByRole("button", { name: `${item.name}, ${item.id}`, exact: true }).click();
  await expect(tab(page, "Overview")).toHaveAttribute("aria-selected", "true");
}

export async function observeReadingDrawing(page: Page): Promise<ReadingDrawing> {
  return page.evaluate(readRenderedDrawing);
}

async function revealSources(page: Page) {
  const sources = interfacePanel(page).getByRole("tabpanel", { name: "Sources", exact: true });
  for (const name of ["interface-statements", "interface-evidence"]) {
    const detail = sources.locator(`details[data-section="${name}"]`);
    if (await detail.getAttribute("open") === null) await detail.locator("summary").click();
    await expect(detail).toHaveAttribute("open");
    await expect(detail.locator("ul").first()).toBeVisible();
  }
  return sources;
}

export async function readPublishedInterfaces(page: Page, baseline: Baseline): Promise<PublishedReading[]> {
  const readings: PublishedReading[] = [];
  for (const { item, entry } of publishedReadingEntries(baseline)) {
    await openPublishedInterface(page, item);
    const panel = interfacePanel(page);
    const overview = panel.getByRole("tabpanel", { name: "Overview", exact: true });
    await overview.getByRole("button", { name: `${entry.name}, ${entry.id}`, exact: true }).click();
    const interaction = overview.getByRole("group", { name: "Interaction", exact: true });
    const access = overview.locator("details[data-section='interface-access-rule']");
    await access.locator("summary").click();
    const facts: Record<string, string> = {};
    for (const name of ["Provider", "Purpose", "Entry reference", "Kind", "Description", "Input", "Success", "Failures", "Effects"]) {
      const group = panel.getByRole("group", { name, exact: true });
      if (await group.count()) facts[name] = await group.innerText();
    }
    const reading: PublishedReading = {
      interfaceId: item.id, entryId: entry.id, overview: await panel.innerText(), facts,
      signature: {
        state: await overview.getByRole("group", { name: "Signature", exact: true }).count()
          ? await overview.getByRole("group", { name: "Signature", exact: true }).innerText() : null,
        literal: await overview.getByRole("group", { name: "Signature", exact: true }).locator("pre").count()
          ? await overview.getByRole("group", { name: "Signature", exact: true }).locator("pre").textContent() : null,
        statement: null, references: [],
      },
      interaction: await interaction.count() ? await interaction.innerText() : null,
      examples: [], sources: "", original: null, access: await access.innerText(),
    };
    await tab(page, "Example").click();
    const examples = panel.getByRole("tabpanel", { name: "Example", exact: true });
    if (!entry.examples.length) {
      await expect(examples).toContainText("No example recorded for this entry.");
      await expect(examples.locator("pre")).toHaveCount(0);
      await expect(examples.getByRole("button", { name: "Copy example", exact: true })).toHaveCount(0);
    }
    for (const example of entry.examples) {
      await examples.getByRole("button", { name: `${example.name}, ${example.id}`, exact: true }).click();
      const sample = examples.getByRole("group", { name: "Example", exact: true }).locator("pre");
      const input = examples.getByRole("group", { name: "Example input", exact: true }).locator("pre");
      const outcome = examples.getByRole("region", { name: "Example outcome", exact: true });
      const detail = examples.locator("details[data-section='example-result']");
      const outcomeText = await outcome.count() ? await outcome.locator(":scope > p").innerText() : null;
      if (example.content.value.result) {
        await expect(outcome).toBeVisible();
        await expect(detail).not.toHaveAttribute("open");
        await detail.locator("summary").click();
        await expect(detail.locator("pre")).toBeVisible();
      } else {
        await expect(outcome).toHaveCount(0);
        await expect(detail).toHaveCount(0);
        await expect(examples.getByText("No result recorded for this example.", { exact: true })).toBeVisible();
      }
      if (example.content.value.input === undefined) {
        await expect(input).toHaveCount(0);
        await expect(examples.getByText("No input recorded for this example.", { exact: true })).toBeVisible();
      } else await expect(input).toBeVisible();
      const result = detail.locator("pre");
      reading.examples.push({ id: example.id, text: await examples.innerText(), sample: await sample.textContent() ?? "",
        input: await input.count() ? await input.textContent() : null, result: await result.count() ? await result.textContent() : null,
        resultScope: await result.count() ? await detail.getByRole("group").getAttribute("aria-label") : null, outcome: outcomeText });
    }
    await tab(page, "Sources").click();
    const sources = await revealSources(page);
    reading.sources = await sources.innerText();
    Object.assign(reading.signature, await page.evaluate(readSignatureSourceMetadata, `${item.id}.documentation.entries.${entry.id}.signature`));
    const original = sources.locator("details[data-section='original-interface-record']");
    if (await original.getAttribute("open") === null) await original.locator("summary").click();
    reading.original = JSON.parse(await original.locator("pre").innerText());
    readings.push(reading);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("region", { name: "Interfaces", exact: true })).toBeVisible();
  }
  const first = publishedReadingEntries(baseline)[0];
  assert.ok(first);
  await openPublishedInterface(page, first.item);
  return readings;
}

export async function readBrowserSignature(page: Page, item: BaselineInterface, entry: BaselineDocumentedEntry): Promise<SignatureReading> {
  await openPublishedInterface(page, item);
  const panel = interfacePanel(page);
  await panel.getByRole("button", { name: `${entry.name}, ${entry.id}`, exact: true }).click();
  const group = panel.getByRole("group", { name: "Signature", exact: true });
  const reading: SignatureReading = {
    state: await group.count() ? await group.innerText() : null,
    literal: await group.locator("pre").count() ? await group.locator("pre").textContent() : null,
    statement: null, references: [],
  };
  await tab(page, "Sources").click();
  await revealSources(page);
  return { ...reading, ...await page.evaluate(readSignatureSourceMetadata, `${item.id}.documentation.entries.${entry.id}.signature`) };
}
