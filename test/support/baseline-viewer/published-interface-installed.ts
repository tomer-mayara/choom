import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Browser } from "webdriverio";
import { readInstalledInterfaceRecord } from "./installed-interface-record.ts";
import type { Baseline, BaselineInterface } from "../../../src/domain/generated/contracts.ts";
import { publishedReadingEntries, readRenderedDrawing, readSignatureSourceMetadata, type PublishedReading, type ReadingDrawing } from "../interface-documentation-reading.ts";

const run = promisify(execFile);
const panel = '[role="dialog"]';
const activeView = `${panel} [role="tabpanel"][data-state="active"]`;
const tab = (name: string) => `//button[@role="tab" and normalize-space(.)='${name}']`;
const button = (name: string) => `${panel} button[aria-label="${name}"]`;

async function openInterface(browser: Browser, item: BaselineInterface): Promise<void> {
  await browser.$("#baseline-details-control").click();
  await browser.$(`${panel} [role="region"][aria-label="Interfaces"] button[data-record-id="${item.id}"]`).click();
  await browser.waitUntil(async () => (await browser.$(tab("Overview")).getAttribute("aria-selected")) === "true",
    { timeout: 10_000, timeoutMsg: "The installed interface Overview must open" });
}

async function textIfPresent(browser: Browser, selector: string): Promise<string | null> {
  const element = browser.$(selector);
  return await element.isExisting() ? await element.getText() : null;
}

async function installedReadingDrawing(browser: Browser): Promise<ReadingDrawing> {
  return browser.execute(readRenderedDrawing);
}

async function literalIfPresent(browser: Browser, selector: string): Promise<string | null> {
  const element = browser.$(selector);
  if (!await element.isExisting()) return null;
  assert.equal(await element.isDisplayed(), true, "Saved text must be displayed before it is read");
  const text = await element.getProperty("textContent");
  assert.equal(typeof text, "string");
  return text as string;
}

async function revealResult(browser: Browser, expected: boolean): Promise<void> {
  const detail = browser.$(`${activeView} details[data-section="example-result"]`);
  assert.equal(await browser.$(`${activeView} section[aria-label="Example outcome"]`).isExisting(), expected,
    "Example outcome exists only when a result is saved");
  assert.equal(await detail.isExisting(), expected, "Detailed result exists only when a result is saved");
  if (expected) {
    assert.equal(await detail.getAttribute("open"), null, "A newly selected result starts closed");
    await detail.$("summary").click();
    await detail.$("pre").waitForDisplayed({ timeout: 5_000 });
  }
}

async function currentExample(browser: Browser) {
  const detail = browser.$(`${activeView} details[data-section="example-result"]`);
  const resultGroup = browser.$(`${activeView} details[data-section="example-result"] [role="group"]`);
  const selected = browser.$(`${activeView} [role="group"][aria-label="Saved examples"] button[aria-pressed="true"]`);
  return {
    text: await browser.$(activeView).getText(),
    sample: await literalIfPresent(browser, `${activeView} [role="group"][aria-label="Example"] pre`),
    input: await literalIfPresent(browser, `${activeView} [role="group"][aria-label="Example input"] pre`),
    result: await literalIfPresent(browser, `${activeView} details[data-section="example-result"] pre`),
    resultScope: await resultGroup.isExisting() ? await resultGroup.getAttribute("aria-label") : null,
    outcome: await textIfPresent(browser, `${activeView} section[aria-label="Example outcome"] > p`),
    resultOpen: await detail.isExisting() && await detail.getAttribute("open") !== null,
    selectedChoice: await selected.isExisting() ? await selected.getAttribute("aria-label") : null,
  };
}

export interface InstalledCopyObservation {
  apiAvailable: boolean;
  secureContext: boolean;
  feedback: string;
  sampleBefore: string;
  sampleAfter: string;
  selection: { standardStyle: string; prefixedStyle: string; word: string; text: string; withinSample: boolean };
  clipboardText: string | null;
}

async function copyInstalledExample(browser: Browser): Promise<InstalledCopyObservation> {
  const capability = await browser.execute(() => ({ apiAvailable: typeof navigator.clipboard?.writeText === "function", secureContext: window.isSecureContext }));
  const selector = `${activeView} [role="group"][aria-label="Example"] pre`;
  const sampleBefore = await literalIfPresent(browser, selector);
  assert.notEqual(sampleBefore, null);
  await browser.$("//button[normalize-space(.)='Copy example']").click();
  const status = browser.$(`${activeView} [role="status"]`);
  await browser.waitUntil(async () => ["Example copied.", "Could not copy. Select the example text and copy it manually."].includes(await status.getText()),
    { timeout: 10_000, timeoutMsg: "Installed copy must finish with an honest host outcome" });
  const feedback = await status.getText();
  const clipboardText = feedback === "Example copied."
    ? (await run("xclip", ["-selection", "clipboard", "-out"], { timeout: 5_000, maxBuffer: 32 * 1024 })).stdout : null;
  const sampleAfter = await literalIfPresent(browser, selector);
  assert.notEqual(sampleAfter, null);
  const selection = await selectInstalledSample(browser, selector);
  return { ...capability, feedback, sampleBefore: sampleBefore ?? "", sampleAfter: sampleAfter ?? "", selection, clipboardText };
}

async function selectInstalledSample(browser: Browser, selector: string) {
  await browser.$(selector).scrollIntoView({ block: "center" });
  const target = await browser.execute((query) => {
    const element = document.querySelector(query);
    const text = element?.firstChild;
    if (!element || !(text instanceof Text)) throw new Error("The saved sample must contain literal text");
    const word = /\w+/.exec(text.data);
    if (!word) throw new Error("The saved sample must contain a word to select");
    const range = document.createRange();
    range.setStart(text, word.index);
    range.setEnd(text, word.index + word[0].length);
    const rectangle = range.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { x: Math.round(rectangle.x + rectangle.width / 2), y: Math.round(rectangle.y + rectangle.height / 2),
      word: word[0], standardStyle: style.getPropertyValue("user-select"), prefixedStyle: style.getPropertyValue("-webkit-user-select") };
  }, selector);
  await browser.action("pointer").move({ origin: "viewport", x: target.x, y: target.y })
    .down("left").up("left").pause(80).down("left").up("left").perform();
  const selected = await browser.execute((query) => {
    const element = document.querySelector(query);
    const selection = window.getSelection();
    return { text: selection?.toString() ?? "",
      withinSample: Boolean(element && selection && element.contains(selection.anchorNode) && element.contains(selection.focusNode)) };
  }, selector);
  return { standardStyle: target.standardStyle, prefixedStyle: target.prefixedStyle, word: target.word, ...selected };
}

export function expectInstalledCopy(observed: InstalledCopyObservation, savedText: string): void {
  assert.equal(observed.sampleBefore, savedText);
  assert.equal(observed.sampleAfter, savedText);
  assert.equal(observed.selection.standardStyle || observed.selection.prefixedStyle, "text");
  assert.equal(observed.selection.text, observed.selection.word, "A real pointer double-click must select saved sample text");
  assert.equal(observed.selection.withinSample, true);
  if (observed.feedback === "Example copied.") assert.equal(observed.clipboardText, savedText, "A success message requires the exact saved example on the native clipboard");
  else {
    assert.equal(observed.feedback, "Could not copy. Select the example text and copy it manually.");
    assert.equal(observed.clipboardText, null);
  }
}

async function readInstalledPublishedInterfaces(browser: Browser, baseline: Baseline) {
  const targets = publishedReadingEntries(baseline);
  const first = targets[0];
  assert.ok(first);
  await openInterface(browser, first.item);
  const before = await installedReadingDrawing(browser);
  const readings: PublishedReading[] = [];
  let copy: InstalledCopyObservation | undefined;
  for (const { item, entry } of targets) {
    await openInterface(browser, item);
    await browser.$(button(`${entry.name}, ${entry.id}`)).click();
    const access = `${activeView} details[data-section="interface-access-rule"]`;
    await browser.$(`${access} > summary`).click();
    const facts: Record<string, string> = {};
    for (const name of ["Provider", "Purpose", "Entry reference", "Kind", "Description", "Input", "Success", "Failures", "Effects"]) {
      const scope = ["Provider", "Purpose"].includes(name) ? panel : `${activeView} section[aria-label="Selected entry"]`;
      const text = await textIfPresent(browser, `${scope} [role="group"][aria-label="${name}"]`);
      if (text !== null) facts[name] = text;
    }
    const reading: PublishedReading = {
      interfaceId: item.id, entryId: entry.id, overview: await browser.$(panel).getText(), facts,
      signature: {
        state: await textIfPresent(browser, `${activeView} [role="group"][aria-label="Signature"]`),
        literal: await literalIfPresent(browser, `${activeView} [role="group"][aria-label="Signature"] pre`),
        statement: null, references: [],
      },
      interaction: await textIfPresent(browser, `${activeView} [role="group"][aria-label="Interaction"]`),
      examples: [], sources: "", original: null, access: await browser.$(access).getText(),
    };
    await browser.$(tab("Example")).click();
    if (!entry.examples.length) {
      assert.match(await browser.$(activeView).getText(), /No example recorded for this entry\./);
      assert.equal(await browser.$(`${activeView} pre`).isExisting(), false);
      assert.equal(await browser.$("//button[normalize-space(.)='Copy example']").isExisting(), false);
    }
    for (const example of entry.examples) {
      await browser.$(button(`${example.name}, ${example.id}`)).click();
      await revealResult(browser, example.content.value.result !== undefined);
      const observed = await currentExample(browser);
      assert.notEqual(observed.sample, null);
      if (example.content.value.input === undefined) {
        assert.equal(observed.input, null);
        assert.match(observed.text, /No input recorded for this example\./);
      }
      if (example.content.value.result === undefined) {
        assert.equal(observed.outcome, null);
        assert.equal(observed.resultScope, null);
        assert.match(observed.text, /No result recorded for this example\./);
      }
      reading.examples.push({ id: example.id, ...observed, sample: observed.sample ?? "" });
      if (entry.kind.value === "function" && example.content.value.result) copy = await copyInstalledExample(browser);
    }
    await browser.$(tab("Sources")).click();
    for (const name of ["interface-statements", "interface-evidence"]) {
      const detail = browser.$(`${activeView} details[data-section="${name}"]`);
      if (await detail.getAttribute("open") === null) await detail.$("summary").click();
      await browser.waitUntil(async () => await detail.getAttribute("open") !== null, { timeout: 5_000 });
      const list = name === "interface-statements" ? ":scope > ul" : ":scope > div > ul";
      await detail.$(list).waitForDisplayed({ timeout: 5_000 });
    }
    reading.sources = await browser.$(activeView).getText();
    Object.assign(reading.signature, await browser.execute(readSignatureSourceMetadata, `${item.id}.documentation.entries.${entry.id}.signature`));
    reading.original = await readInstalledInterfaceRecord(browser);
    readings.push(reading);
    await browser.$('button[aria-label="Back"]').click();
    assert.equal(await browser.$(`${panel} [role="region"][aria-label="Interfaces"]`).isDisplayed(), true);
  }
  await openInterface(browser, first.item);
  assert.ok(copy, "The installed journey must exercise its actual clipboard boundary");
  return { readings, before, after: await installedReadingDrawing(browser), copy };
}

async function selectInstalledPublishedExample(browser: Browser, baseline: Baseline) {
  const target = publishedReadingEntries(baseline)[0];
  assert.ok(target);
  const example = target.entry.examples.at(-1);
  assert.ok(example);
  await openInterface(browser, target.item);
  await browser.$(button(`${target.entry.name}, ${target.entry.id}`)).click();
  await browser.$(tab("Example")).click();
  await browser.$(button(`${example.name}, ${example.id}`)).click();
  await revealResult(browser, example.content.value.result !== undefined);
  return { selected: await currentExample(browser), drawing: await installedReadingDrawing(browser) };
}

async function preserveInstalledPublishedExample(browser: Browser,
  paths: readonly string[], openBaseline: (path: string | null) => Promise<void>) {
  const outcomes: Array<{ example: Awaited<ReturnType<typeof currentExample>>; drawing: ReadingDrawing; status: string }> = [];
  for (const [index, path] of [...paths, null].entries()) {
    await openBaseline(path);
    await browser.waitUntil(async () => {
      const outcome = browser.$(path === null ? 'header [role="status"]' : '[role="alert"]');
      if (!await outcome.isExisting()) return false;
      const text = await outcome.getText();
      const ready = await browser.$("//button[normalize-space(.)='Open Baseline']").isEnabled();
      return ready && (path === null ? text === "Load cancelled." : (index === 0 ? /YAML/i : /limit/i).test(text));
    }, { timeout: 10_000, timeoutMsg: "An unsuccessful native open must report its outcome" });
    outcomes.push({ example: await currentExample(browser), drawing: await installedReadingDrawing(browser), status: await browser.$(path === null ? 'header [role="status"]' : '[role="alert"]').getText() });
  }
  return { outcomes };
}

export type InstalledDocumentationTask =
  | { kind: "read" }
  | { kind: "select-example" }
  | { kind: "failed-opens"; paths: readonly string[] };

export async function inspectInstalledDocumentation(browser: Browser, baseline: Baseline,
  task: InstalledDocumentationTask, openBaseline: (path: string | null) => Promise<void>) {
  switch (task.kind) {
    case "read": return readInstalledPublishedInterfaces(browser, baseline);
    case "select-example": return selectInstalledPublishedExample(browser, baseline);
    case "failed-opens": return preserveInstalledPublishedExample(browser, task.paths, openBaseline);
  }
}
