import assert from "node:assert/strict";
import type { Browser } from "webdriverio";
import type { BaselineInterface, BaselineV3 } from "../../../src/domain/generated/contracts.ts";
import { readRenderedDrawing, readSignatureSourceMetadata, type ReadingDrawing, type SignatureReading } from "../interface-documentation-reading.ts";
import { expectReviewedConnections, readSourceUseOverview, reviewedCrossConnections, reviewedSelfConnections, type SourceConsumerReading } from "../source-consumer-reading.ts";

const panel = '[role="dialog"]';
const activeView = `${panel} [role="tabpanel"][data-state="active"]`;
const tab = (name: string) => `//button[@role="tab" and normalize-space(.)='${name}']`;
const button = (name: string) => `${panel} button[aria-label="${name}"]`;
async function reveal(browser: Browser, selector: string) {
  const detail = browser.$(selector);
  if (await detail.getAttribute("open") === null) await detail.$(":scope > summary").click();
  await browser.waitUntil(async () => await detail.getAttribute("open") !== null, { timeout: 5000 });
  await detail.$(":scope > :not(summary)").waitForDisplayed({ timeout: 5000 });
}
async function openInterface(browser: Browser, item: BaselineInterface) {
  await browser.$("#baseline-details-control").click();
  await browser.$(`${panel} [role="region"][aria-label="Interfaces"] button[data-record-id="${item.id}"]`).click();
  await browser.waitUntil(async () => await browser.$(tab("Overview")).getAttribute("aria-selected") === "true", { timeout: 5000 });
}
async function textIfPresent(browser: Browser, selector: string) {
  const element = browser.$(selector);
  return await element.isExisting() ? element.getText() : null;
}
async function literalIfPresent(browser: Browser, selector: string) {
  const element = browser.$(selector);
  if (!await element.isExisting()) return null;
  const text = await element.getProperty("textContent");
  assert.equal(typeof text, "string");
  return String(text);
}
async function expectArcs(browser: Browser, expected: ReadingDrawing["arcs"]) {
  await browser.waitUntil(async () => (await browser.$$("path[data-interface-arc]")).length === expected.length,
    { timeout: 5000, timeoutMsg: "The installed source arcs must match the selected scope" });
  expectReviewedConnections(await browser.execute(readRenderedDrawing), expected);
}
async function inspectConnections(browser: Browser, baseline: BaselineV3) {
  const before = await browser.execute(readRenderedDrawing);
  await browser.$('input[name="connection-mode"][value="all"]').click();
  assert.equal(await browser.$('input[type="checkbox"]').isSelected(), false);
  await expectArcs(browser, reviewedCrossConnections);
  await browser.$('input[name="connection-mode"][value="selected"]').click();
  const workspace = baseline.components.find(({ id }) => id === "s4-001-workspace");
  assert.ok(workspace);
  await browser.$(`button[aria-label="${workspace.name}, ${workspace.id}"]`).click();
  await expectArcs(browser, reviewedCrossConnections.filter(({ consumer }) => consumer === workspace.id));
  await browser.$('input[name="connection-mode"][value="all"]').click();
  await browser.$('input[type="checkbox"]').click();
  await expectArcs(browser, [...reviewedCrossConnections, ...reviewedSelfConnections]);
  const after = await browser.execute(readRenderedDrawing);
  assert.deepEqual(after.nodes, before.nodes, "Connection choices must not move installed components");
  return { before, after };
}

async function readInterfaces(browser: Browser, baseline: BaselineV3) {
  const connections = await inspectConnections(browser, baseline);
  const first = baseline.interfaces[0];
  assert.ok(first);
  await openInterface(browser, first);
  const before = await browser.execute(readRenderedDrawing);
  const readings: SourceConsumerReading[] = [];
  for (const item of baseline.interfaces) {
    await openInterface(browser, item);
    const others = `${activeView} details[data-section="other-source-references"]`;
    if (await browser.$(others).isExisting()) await reveal(browser, others);
    const callerSections = await browser.$$(`${activeView} details[data-section^="source-use-caller-"]`).map((detail) => detail.getAttribute("data-section"));
    for (const section of callerSections) await reveal(browser, `${activeView} details[data-section="${section}"]`);
    const observed = await browser.execute(readSourceUseOverview);
    const access = `${activeView} details[data-section="interface-access-rule"]`;
    await reveal(browser, access);
    const reading: SourceConsumerReading = { interfaceId: item.id, ...observed,
      access: await browser.$(access).getText(), sourceReview: "", sourceRecord: null, original: null, entries: [] };
    await browser.$(tab("Sources")).click();
    const review = `${activeView} section[aria-label="Source-use review"]`;
    const citationSections = await browser.$$(`${review} details[data-section^="source-note-uses-"]`).map((detail) => detail.getAttribute("data-section"));
    for (const section of citationSections) await reveal(browser, `${review} details[data-section="${section}"]`);
    reading.sourceReview = await browser.$(review).getText();
    for (const [section, field] of [["original-source-assessment", "sourceRecord"], ["original-interface-record", "original"]] as const) {
      const selector = `${activeView} details[data-section="${section}"]`;
      await reveal(browser, selector);
      reading[field] = JSON.parse(await browser.$(`${selector} pre`).getText());
    }
    for (const section of ["interface-statements", "interface-evidence"]) await reveal(browser, `${activeView} details[data-section="${section}"]`);
    for (const entry of item.documentation?.entries ?? []) {
      await browser.$(tab("Overview")).click();
      await browser.$(button(`${entry.name}, ${entry.id}`)).click();
      assert.deepEqual((await browser.execute(readSourceUseOverview)).rows.map(({ id }) => id), observed.rows.map(({ id }) => id));
      const signature: SignatureReading = {
        state: await textIfPresent(browser, `${activeView} [role="group"][aria-label="Signature"]`),
        literal: await literalIfPresent(browser, `${activeView} [role="group"][aria-label="Signature"] pre`), statement: null, references: [],
      };
      await browser.$(tab("Sources")).click();
      Object.assign(signature, await browser.execute(readSignatureSourceMetadata, `${item.id}.documentation.entries.${entry.id}.signature`));
      await browser.$(tab("Example")).click();
      const shown: SourceConsumerReading["entries"][number] = { id: entry.id, signature, examples: [] };
      if (!entry.examples.length) assert.match(await browser.$(activeView).getText(), /No example recorded for this entry\./);
      for (const example of entry.examples) {
        await browser.$(button(`${example.name}, ${example.id}`)).click();
        const sample = await literalIfPresent(browser, `${activeView} [role="group"][aria-label="Example"] pre`);
        assert.notEqual(sample, null);
        shown.examples.push({ id: example.id, sample: sample ?? "", text: await browser.$(activeView).getText() });
      }
      reading.entries.push(shown);
    }
    readings.push(reading);
    await browser.$('button[aria-label="Back"]').click();
    assert.equal(await browser.$(`${panel} [role="region"][aria-label="Interfaces"]`).isDisplayed(), true);
  }
  await openInterface(browser, first);
  return { connections, before, after: await browser.execute(readRenderedDrawing), readings };
}

async function currentExample(browser: Browser) {
  return { text: await browser.$(activeView).getText(),
    sample: await literalIfPresent(browser, `${activeView} [role="group"][aria-label="Example"] pre`),
    selected: await browser.$(tab("Example")).getAttribute("aria-selected"),
    interfaceName: await browser.$(`${panel} [aria-label="Record content"] h2`).getText() };
}
async function selectExample(browser: Browser, baseline: BaselineV3) {
  const target = baseline.interfaces.flatMap((item) => (item.documentation?.entries ?? []).map((entry) => ({ item, entry })))
    .find(({ entry }) => entry.kind.value === "function" && entry.examples.length);
  assert.ok(target);
  const example = target.entry.examples.at(-1);
  assert.ok(example);
  await openInterface(browser, target.item);
  await browser.$(button(`${target.entry.name}, ${target.entry.id}`)).click();
  await browser.$(tab("Example")).click();
  await browser.$(button(`${example.name}, ${example.id}`)).click();
  return { selected: await currentExample(browser), drawing: await browser.execute(readRenderedDrawing) };
}
async function failedOpens(browser: Browser, paths: readonly string[], openBaseline: (path: string | null) => Promise<void>) {
  const outcomes: Array<{ example: Awaited<ReturnType<typeof currentExample>>; drawing: ReadingDrawing; status: string }> = [];
  for (const [index, path] of [...paths, null].entries()) {
    await openBaseline(path);
    const selector = path === null ? 'header [role="status"]' : '[role="alert"]';
    await browser.waitUntil(async () => {
      const outcome = browser.$(selector);
      if (!await outcome.isExisting()) return false;
      const text = await outcome.getText();
      return await browser.$("//button[normalize-space(.)='Open Baseline']").isEnabled()
        && (path === null ? text === "Load cancelled." : (index === 0 ? /YAML/i : /limit|large|uses|records/i).test(text));
    }, { timeout: 10_000, timeoutMsg: "Failed and cancelled native opens must report their outcome" });
    outcomes.push({ example: await currentExample(browser), drawing: await browser.execute(readRenderedDrawing), status: await browser.$(selector).getText() });
  }
  return { outcomes };
}

export type InstalledSourceConsumerTask = { kind: "read" } | { kind: "select-example" } | { kind: "failed-opens"; paths: readonly string[] };
export async function inspectInstalledSourceConsumers(browser: Browser, baseline: BaselineV3,
  task: InstalledSourceConsumerTask, openBaseline: (path: string | null) => Promise<void>) {
  switch (task.kind) {
    case "read": return readInterfaces(browser, baseline);
    case "select-example": return selectExample(browser, baseline);
    case "failed-opens": return failedOpens(browser, task.paths, openBaseline);
  }
}
