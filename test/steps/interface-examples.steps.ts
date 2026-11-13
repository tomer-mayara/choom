import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { failureExampleText, interfaceExampleFixture, literalExampleText } from "../support/interface-example-fixtures.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";

const expect = browserExpect.configure({ timeout: 2_000 });
interface ExampleWorld extends World {
  page?: Page; exampleDirectory?: string; exampleFile?: string; exampleRequests: string[]; exampleDialogs: string[]; pageErrors: string[];
  exampleScroll?: number;
  exampleCurrentText?: string;
}
declare global {
  interface Window {
    choomExampleClipboard?: { pending: Array<{ resolve: () => void; reject: (reason: Error) => void }> };
  }
}
function page(world: ExampleWorld): Page { assert.ok(world.page); return world.page; }
const panel = (world: ExampleWorld) => page(world).getByRole("dialog", { name: "Interface details", exact: true });
const exampleView = (world: ExampleWorld) => panel(world).getByRole("tabpanel", { name: "Example", exact: true });
async function showExamples(world: ExampleWorld) {
  await expect(panel(world).getByRole("tab", { name: "Example", exact: true })).toBeVisible();
  await panel(world).getByRole("tab", { name: "Example", exact: true }).click();
}
async function selectFailure(world: ExampleWorld) {
  await showExamples(world);
  await exampleView(world).getByRole("button", { name: "An empty order, empty-order", exact: true }).click();
}
async function openFixture(world: ExampleWorld, long = false) {
  world.exampleDirectory = await mkdtemp(join(tmpdir(), "choom-examples-"));
  const file = join(world.exampleDirectory, "baseline.yaml");
  world.exampleFile = file;
  const baseline = interfaceExampleFixture();
  if (long) fixtureItem(fixtureItem(fixtureItem(baseline.interfaces).documentation?.entries ?? []).examples).content.value.text = "saved invoice line\n".repeat(300);
  await writeFile(file, stringify(baseline));
  const driver = new BaselineBrowserDriver(page(world));
  await driver.open();
  await driver.openBaseline(file);
  await expect(page(world).getByText("Baseline ready.", { exact: true })).toBeVisible();
  await page(world).getByRole("button", { name: "Billing, billing", exact: true }).click();
  await page(world).getByRole("region", { name: "Owned interfaces" }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
  await expect(panel(world)).toBeVisible();
  world.exampleRequests = []; world.exampleDialogs = [];
  page(world).on("request", (request) => world.exampleRequests.push(request.url()));
  page(world).on("dialog", async (dialog) => { world.exampleDialogs.push(dialog.message()); await dialog.dismiss(); });
}
Given("the interface example baseline is open", async function (this: ExampleWorld) {
  await openFixture(this);
});
Given("the interface example baseline with a long sample is open", async function (this: ExampleWorld) {
  await openFixture(this, true);
});
When("the user opens the interface Example tab", async function (this: ExampleWorld) { await showExamples(this); });
Then("the saved example choices are available", async function (this: ExampleWorld) {
  for (const name of ["A valid order, valid-order", "An empty order, empty-order", "Literal sample, literal-sample"]) {
    await expect(exampleView(this).getByRole("button", { name, exact: true })).toBeVisible();
  }
});
When("the user selects the An empty order example", async function (this: ExampleWorld) { await selectFailure(this); });
Then("its saved sample, input, result explanation, and recorded basis are shown", async function (this: ExampleWorld) {
  const sample = exampleView(this).getByRole("group", { name: "Example", exact: true }).locator("pre");
  assert.equal(await sample.textContent(), failureExampleText);
  await expect(exampleView(this).getByRole("group", { name: "Example input", exact: true })).toContainText('{"items":[]}');
  await expect(exampleView(this)).toContainText("The order is rejected because it has no items.");
  await expect(exampleView(this)).toContainText("Illustrative example");
  await expect(exampleView(this)).toContainText("Accepted (recorded)");
  await expect(exampleView(this)).toContainText("Choom has not run this example.");
});
Then("its detailed result is a saved excerpt", async function (this: ExampleWorld) {
  const result = exampleView(this).locator("details[data-section='example-result']");
  await expect(result).not.toHaveAttribute("open");
  await result.locator("summary").click();
  await expect(result).toContainText("Result excerpt");
  assert.equal(await result.locator("pre").textContent(), '{"error":"Order has no items"}');
});
When(/^the user selects the (Invoice type|Invoice data) entry for examples$/, async function (this: ExampleWorld, name: string) {
  const id = name === "Invoice type" ? "invoice-type" : "invoice-data";
  await panel(this).getByRole("button", { name: `${name}, ${id}`, exact: true }).click();
  await showExamples(this);
});
Then("Example names Invoice type and says no example is recorded for this entry", async function (this: ExampleWorld) {
  await expect(exampleView(this).getByRole("heading", { name: "Invoice type", exact: true })).toBeVisible();
  await expect(exampleView(this)).toContainText("No example recorded for this entry.");
  await expect(exampleView(this).locator("pre")).toHaveCount(0);
  await expect(exampleView(this).getByRole("button", { name: /Run|Copy example/ })).toHaveCount(0);
});
Then("its saved data sample is shown without an invented call or result", async function (this: ExampleWorld) {
  await expect(exampleView(this).getByRole("heading", { name: "Invoice data", exact: true })).toBeVisible();
  assert.equal(await exampleView(this).getByRole("group", { name: "Example", exact: true }).locator("pre").textContent(), '{"id":"saved-invoice"}\n');
  await expect(exampleView(this)).toContainText("No input recorded for this example.");
  await expect(exampleView(this)).toContainText("No result recorded for this example.");
  await expect(exampleView(this)).not.toContainText(/HTTP|response|call\(/i);
});
Given("the browser permits clipboard access", async function (this: ExampleWorld) {
  await page(this).context().grantPermissions(["clipboard-read", "clipboard-write"]);
});
Given("the browser denies clipboard writing", async function (this: ExampleWorld) {
  await page(this).evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Permission denied"); } } }); });
});
When("the user opens Example and copies the An empty order example with the keyboard", async function (this: ExampleWorld) {
  await selectFailure(this);
  await exampleView(this).getByRole("button", { name: "Copy example", exact: true }).focus();
  await page(this).keyboard.press("Enter");
});
When("the user selects and copies the An empty order example with touch", async function (this: ExampleWorld) {
  await expect(panel(this).getByRole("tab", { name: "Example", exact: true })).toBeVisible();
  await panel(this).getByRole("tab", { name: "Example", exact: true }).tap();
  await exampleView(this).getByRole("button", { name: "An empty order, empty-order", exact: true }).tap();
  await exampleView(this).getByRole("button", { name: "Copy example", exact: true }).tap();
});
Then("exactly the saved example text is copied and success is announced", async function (this: ExampleWorld) {
  await expect(exampleView(this).getByRole("status")).toHaveText("Example copied.");
  assert.equal(await page(this).evaluate(() => navigator.clipboard.readText()), failureExampleText);
});
Then("the example remains selectable with manual copy guidance and no success", async function (this: ExampleWorld) {
  await expect(exampleView(this).getByRole("status")).toHaveText("Could not copy. Select the example text and copy it manually.");
  assert.equal(await exampleView(this).getByRole("group", { name: "Example", exact: true }).locator("pre").textContent(), failureExampleText);
  await expect(exampleView(this)).not.toContainText("Example copied.");
});
When("the user selects the Literal sample example", async function (this: ExampleWorld) {
  await showExamples(this);
  await exampleView(this).getByRole("button", { name: "Literal sample, literal-sample", exact: true }).click();
});
Then("its markup and command are literal text with no request or execution", async function (this: ExampleWorld) {
  assert.equal(await exampleView(this).getByRole("group", { name: "Example", exact: true }).locator("pre").textContent(), literalExampleText);
  await expect(panel(this).locator("img, script, iframe, a[href]")).toHaveCount(0);
  assert.deepEqual(this.exampleRequests, []); assert.deepEqual(this.exampleDialogs, []); assert.deepEqual(this.pageErrors, []);
  await expect(exampleView(this).getByRole("button", { name: /Run|Execute/ })).toHaveCount(0);
});
When("the user scrolls its Example and returns through Sources with real tab clicks", async function (this: ExampleWorld) {
  await showExamples(this);
  await exampleView(this).locator("details[data-section='example-result'] summary").click();
  const content = page(this).getByLabel("Record content", { exact: true });
  await content.evaluate((element) => { element.scrollTop = 600; });
  this.exampleScroll = await content.evaluate((element) => element.scrollTop);
  assert.ok(this.exampleScroll > 400);
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
  await panel(this).getByRole("tab", { name: "Example", exact: true }).click();
});
Then("the same example, result disclosure, and reading position are restored", async function (this: ExampleWorld) {
  await expect(exampleView(this).getByRole("button", { name: "A valid order, valid-order", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(exampleView(this).locator("details[data-section='example-result']")).toHaveAttribute("open");
  assert.equal(await page(this).getByLabel("Record content", { exact: true }).evaluate((element) => element.scrollTop), this.exampleScroll);
});
async function settleCopy(world: ExampleWorld, index: number, outcome: string) {
  await page(world).evaluate(({ index, outcome }) => {
    const pending = window.choomExampleClipboard?.pending[index];
    if (!pending) throw new Error("The requested clipboard write must be pending.");
    if (outcome === "success") pending.resolve(); else pending.reject(new Error("Clipboard denied"));
  }, { index, outcome });
}
Given("an example copy request is pending", async function (this: ExampleWorld) {
  await page(this).evaluate(() => {
    const pending: Array<{ resolve: () => void; reject: (reason: Error) => void }> = [];
    window.choomExampleClipboard = { pending };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: () => new Promise<void>((resolve, reject) => pending.push({ resolve, reject })),
    } });
  });
  await showExamples(this);
  await exampleView(this).getByRole("button", { name: "Copy example", exact: true }).click();
  await expect(exampleView(this).getByRole("status")).toHaveText("Copying example…");
});
When(/^the user changes (example|entry|entry A to B to A|same-ID baseline|closed frame|direct same-ID frame) and the old copy completes with (success|failure)$/, async function (this: ExampleWorld, selection: string, outcome: string) {
  if (selection === "example") await selectFailure(this);
  else if (selection.startsWith("entry")) {
    await panel(this).getByRole("tab", { name: "Overview", exact: true }).click();
    await panel(this).getByRole("button", { name: "Invoice data, invoice-data", exact: true }).click();
    await showExamples(this);
    if (selection === "entry A to B to A") {
      await panel(this).getByRole("tab", { name: "Overview", exact: true }).click();
      await panel(this).getByRole("button", { name: "Create invoice, create-invoice", exact: true }).click();
      await showExamples(this);
    }
  } else if (selection === "direct same-ID frame") {
    await page(this).locator('button[data-interface-label][data-interface-id="invoice-api"]').first().focus();
    await page(this).keyboard.press("Enter");
    await showExamples(this);
  } else {
    if (selection === "same-ID baseline") {
      assert.ok(this.exampleFile);
      await new BaselineBrowserDriver(page(this)).openBaseline(this.exampleFile);
      await expect(panel(this)).toHaveCount(0);
    } else await panel(this).getByRole("button", { name: "Close details", exact: true }).click();
    await page(this).getByRole("button", { name: "Billing, billing", exact: true }).click();
    await page(this).getByRole("region", { name: "Owned interfaces" }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
    await showExamples(this);
  }
  this.exampleCurrentText = await exampleView(this).getByRole("group", { name: "Example", exact: true }).locator("pre").textContent() ?? "";
  await expect(exampleView(this).getByRole("status")).toHaveText("");
  await settleCopy(this, 0, outcome);
});
Then("the current example stays selected without old copy feedback", async function (this: ExampleWorld) {
  await expect(exampleView(this).getByRole("status")).toHaveText("");
  assert.equal(await exampleView(this).getByRole("group", { name: "Example", exact: true }).locator("pre").textContent(), this.exampleCurrentText);
});
When(/^a newer copy completes with (success|failure) before the older copy completes with (success|failure)$/, async function (this: ExampleWorld, latest: string, older: string) {
  await exampleView(this).getByRole("button", { name: "Copy example", exact: true }).click();
  await settleCopy(this, 1, latest);
  await expect(exampleView(this).getByRole("status")).toHaveText(latest === "success" ? "Example copied." : "Could not copy. Select the example text and copy it manually.");
  await settleCopy(this, 0, older);
});
Then(/^only the (success|failure) copy outcome is announced$/, async function (this: ExampleWorld, outcome: string) {
  await expect(exampleView(this).getByRole("status")).toHaveText(outcome === "success" ? "Example copied." : "Could not copy. Select the example text and copy it manually.");
});
After({ tags: "@br-10c" }, async function (this: ExampleWorld) {
  if (this.exampleDirectory) await rm(this.exampleDirectory, { recursive: true, force: true });
});

Given("the browser viewport is {int} by {int} for example reading", async function (this: ExampleWorld, width: number, height: number) {
  await page(this).setViewportSize({ width, height });
});
When(/^the user switches to Example with (pointer|keyboard)$/, async function (this: ExampleWorld, input: string) {
  if (input === "pointer") await showExamples(this);
  else {
    await panel(this).getByRole("tab", { name: "Overview", exact: true }).focus();
    await page(this).keyboard.press("ArrowRight");
  }
});
async function expectFocusedControlVisible(world: ExampleWorld) {
  const bounds = await page(world).getByLabel("Record content", { exact: true }).evaluate((content) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !content.contains(active)) throw new Error("Focus must remain in the record.");
    const control = active.getBoundingClientRect(); const area = content.getBoundingClientRect();
    const tabs = content.querySelector('[role="tablist"]');
    const unobscuredTop = tabs?.contains(active) ? area.top : Math.max(area.top, tabs?.getBoundingClientRect().bottom ?? area.top);
    return { top: control.top, bottom: control.bottom, areaTop: unobscuredTop, areaBottom: area.bottom };
  });
  assert.ok(bounds.top >= bounds.areaTop && bounds.bottom <= bounds.areaBottom, JSON.stringify(bounds));
}
Then("the focused Example tab is inside the visible record area", async function (this: ExampleWorld) {
  await expect(panel(this).getByRole("tab", { name: "Example", exact: true })).toBeFocused();
  await expectFocusedControlVisible(this);
});
When(/^the user selects another example with (pointer|keyboard)$/, async function (this: ExampleWorld, input: string) {
  await showExamples(this);
  const choice = exampleView(this).getByRole("button", { name: "An empty order, empty-order", exact: true });
  if (input === "pointer") await choice.click();
  else { await choice.focus(); await page(this).keyboard.press("Enter"); }
});
Then("its focused choice is visible and its new result is closed", async function (this: ExampleWorld) {
  const choice = exampleView(this).getByRole("button", { name: "An empty order, empty-order", exact: true });
  await expect(choice).toBeFocused(); await expect(choice).toHaveAttribute("aria-pressed", "true");
  await expectFocusedControlVisible(this);
  await expect(exampleView(this).locator("details[data-section='example-result']")).not.toHaveAttribute("open");
});
