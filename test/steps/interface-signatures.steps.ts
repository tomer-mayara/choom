import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { expect as browserExpect, type Page } from "@playwright/test";
import { stringify } from "yaml";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import { baselineWithSignature } from "../support/interface-documentation-fixtures.ts";
import { originalInterfaceRecord } from "../support/interface-record-browser.ts";
import { interfaceSignatureFixture, type SignatureVariant } from "../support/interface-signature-fixtures.ts";

const expect = browserExpect.configure({ timeout: 2_000 });
interface SignatureWorld extends World {
  page?: Page; signatureDirectory?: string; signatureBaseline?: Baseline; signatureTextPercent?: number;
  signatureRequests?: string[]; signatureUrl?: string;
}
function page(world: SignatureWorld): Page { assert.ok(world.page); return world.page; }
const panel = (world: SignatureWorld) => page(world).getByRole("dialog", { name: "Interface details", exact: true });

Given(/^an interface with a (saved|missing|unknown|long) function signature is open$/, async function (this: SignatureWorld, variant: SignatureVariant) {
  this.signatureDirectory = await mkdtemp(join(tmpdir(), "choom-signature-"));
  const file = join(this.signatureDirectory, "baseline.yaml");
  this.signatureBaseline = interfaceSignatureFixture(variant);
  await writeFile(file, stringify(this.signatureBaseline));
  const driver = new BaselineBrowserDriver(page(this));
  await driver.open(); await driver.openBaseline(file);
  await expect(page(this).getByText("Baseline ready.", { exact: true })).toBeVisible();
  if (this.signatureTextPercent) await page(this).evaluate((size) => { document.documentElement.style.fontSize = `${size}%`; }, this.signatureTextPercent);
  this.signatureRequests = []; this.signatureUrl = page(this).url();
  page(this).on("request", (request) => this.signatureRequests?.push(request.url()));
  await page(this).getByRole("button", { name: "Billing, billing", exact: true }).click();
  await page(this).getByRole("region", { name: "Owned interfaces" }).getByRole("button", { name: "Invoice API, invoice-api", exact: true }).click();
  await expect(panel(this).getByRole("region", { name: "Selected entry", exact: true })).toContainText("Create invoice");
});
Then("its selected entry shows the exact signature and its own recorded status", async function (this: SignatureWorld) {
  const signature = panel(this).getByRole("group", { name: "Signature", exact: true });
  await expect(signature).toBeVisible();
  assert.equal(await signature.locator("pre").textContent(), baselineWithSignature().entry.signature.value);
  await expect(signature.getByText("Accepted (recorded)", { exact: true })).toBeVisible();
});
When("the user reads the signature's Sources", async function (this: SignatureWorld) {
  await panel(this).getByRole("tab", { name: "Sources", exact: true }).click();
  for (const section of ["interface-statements", "interface-evidence"]) await panel(this).locator(`details[data-section='${section}'] summary`).click();
});
Then("its signature-only note, evidence, status, acceptance reference, and original values are retained", async function (this: SignatureWorld) {
  const source = panel(this).getByRole("tabpanel", { name: "Sources", exact: true });
  const path = "invoice-api.documentation.entries.create-invoice.signature";
  const note = source.getByRole("listitem").filter({ hasText: "Declaration of createInvoice." });
  await expect(note).toContainText("Create invoice: signature");
  const statement = source.locator("details[data-section='interface-statements'] li").filter({ hasText: path });
  await expect(statement).toContainText("Accepted (recorded)");
  await expect(statement).toContainText("missing-review#/decisions/4");
  const evidence = source.locator("details[data-section='interface-evidence']");
  await expect(evidence.getByText("invoice-declaration", { exact: true })).toHaveCount(1);
  await expect(evidence.getByText(path, { exact: true })).toHaveCount(1);
  assert.ok(this.signatureBaseline);
  assert.deepEqual(await originalInterfaceRecord(panel(this)), fixtureItem(this.signatureBaseline.interfaces));
});
Then("the Signature says {string} without a declaration", async function (this: SignatureWorld, message: string) {
  const signature = panel(this).getByRole("group", { name: "Signature", exact: true });
  await expect(signature.getByText(message, { exact: true })).toBeVisible();
  await expect(signature.locator("pre")).toHaveCount(0);
  await expect(signature.getByText("Accepted (recorded)", { exact: true })).toHaveCount(message === "Signature is unknown." ? 1 : 0);
});
When("the user selects its {string} entry", async function (this: SignatureWorld, entry: string) {
  await panel(this).getByRole("button", { name: entry, exact: true }).click();
});
Then("the selected entry has no Signature block", async function (this: SignatureWorld) {
  await expect(panel(this).getByRole("group", { name: "Signature", exact: true })).toHaveCount(0);
});
Then("selecting the function restores its saved declaration", async function (this: SignatureWorld) {
  await panel(this).getByRole("button", { name: "Create invoice, create-invoice", exact: true }).click();
  assert.equal(await panel(this).getByRole("group", { name: "Signature", exact: true }).locator("pre").textContent(), baselineWithSignature().entry.signature.value);
});
Given("the signature reader window is {int} by {int} with {int} percent text", async function (this: SignatureWorld, width: number, height: number, percent: number) {
  await page(this).setViewportSize({ width, height }); this.signatureTextPercent = percent;
});
Then("its whole declaration stays literal and wraps inside the panel", async function (this: SignatureWorld) {
  const signature = panel(this).getByRole("group", { name: "Signature", exact: true });
  await signature.locator("pre").scrollIntoViewIfNeeded();
  assert.ok(this.signatureBaseline?.formatVersion === 2);
  const entry = fixtureItem(fixtureItem(this.signatureBaseline.interfaces).documentation?.entries ?? []);
  assert.equal(await signature.locator("pre").textContent(), entry.signature?.value);
  assert.ok(await signature.locator("pre").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  assert.ok(await page(this).getByLabel("Record content", { exact: true }).evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  assert.ok(await page(this).evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const end = await signature.locator("pre code").evaluate((element) => {
    const text = element.firstChild; const body = element.closest('[aria-label="Record content"]');
    if (!text || !body) throw new Error("A declaration needs text inside the reading area.");
    const range = document.createRange(); range.setStart(text, (text.textContent?.length ?? 0) - 1); range.setEndAfter(text);
    return { delta: Math.max(0, range.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 12),
      x: body.getBoundingClientRect().right - 20, y: body.getBoundingClientRect().bottom - 20 };
  });
  await page(this).mouse.move(end.x, end.y); await page(this).mouse.wheel(0, end.delta);
  await expect.poll(() => signature.locator("pre code").evaluate((element) => {
    const text = element.firstChild; const body = element.closest('[aria-label="Record content"]');
    if (!text || !body) return false;
    const range = document.createRange(); range.setStart(text, (text.textContent?.length ?? 0) - 1); range.setEndAfter(text);
    const last = range.getBoundingClientRect(); const tabs = body.querySelector('[role="tablist"]')?.getBoundingClientRect();
    return last.bottom <= body.getBoundingClientRect().bottom && last.top >= (tabs?.bottom ?? body.getBoundingClientRect().top);
  })).toBe(true);
});
Then("reading the signature makes no request or navigation", async function (this: SignatureWorld) {
  assert.deepEqual(this.signatureRequests, []); assert.equal(page(this).url(), this.signatureUrl);
  await expect(panel(this).locator("a[href], img, script, iframe")).toHaveCount(0);
});
After({ tags: "@interface-signatures" }, async function (this: SignatureWorld) {
  if (this.signatureDirectory) await rm(this.signatureDirectory, { recursive: true, force: true });
});
